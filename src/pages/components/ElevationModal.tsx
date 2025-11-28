import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MdClose, MdArrowForward, MdArrowBack, Md3dRotation, MdGridOn } from 'react-icons/md';
import { ArcRotateCamera, Vector3, Color3, StandardMaterial, type Engine, type Scene, type AbstractMesh } from '@babylonjs/core';
import styles from './ElevationModal.module.css';
import type { Babylon3DCanvasRef } from '../../babylon/Babylon3DCanvas';

export interface WallInfo {
  id: string;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  roomId?: string;
  roomName?: string;
}

export type ViewDirection = 'inside' | 'outside';
export type PreviewMode = '2d' | '3d';

interface ElevationModalProps {
  isOpen: boolean;
  onClose: () => void;
  floorplanData: any;
  onWallSelected: (wall: WallInfo, direction: ViewDirection) => void;
  themeColor?: string;
  themeMode?: 'light' | 'dark';
  babylon3DCanvasRef?: React.RefObject<Babylon3DCanvasRef | null>;
}

export const ElevationModal: React.FC<ElevationModalProps> = ({
  isOpen,
  onClose,
  floorplanData,
  onWallSelected,
  themeColor = '#3FAEA7',
  themeMode = 'light',
  babylon3DCanvasRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas3DRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredWall, setHoveredWall] = useState<WallInfo | null>(null);
  const [selectedWall, setSelectedWall] = useState<WallInfo | null>(null);
  const [viewDirection, setViewDirection] = useState<ViewDirection>('inside');
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [walls, setWalls] = useState<WallInfo[]>([]);
  const [points, setPoints] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [rooms, setRooms] = useState<any[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('2d');

  // 3D preview state - uses main canvas mirroring to avoid flickering
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const mainCameraRef = useRef<ArcRotateCamera | null>(null);
  const [is3DInitialized, setIs3DInitialized] = useState(false);
  const dragging3DRef = useRef(false);
  const lastMouse3DRef = useRef({ x: 0, y: 0 });
  const isRightMouseRef = useRef(false);

  // 3D wall selection state
  const selectedMeshRef = useRef<AbstractMesh | null>(null);
  const originalMaterialRef = useRef<any>(null);
  const highlightMaterialRef = useRef<StandardMaterial | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const isDark = themeMode === 'dark';

  // Theme colors
  const colors = {
    bg: isDark ? '#1e1e1e' : '#ffffff',
    bgSecondary: isDark ? '#252525' : '#f5f5f5',
    border: isDark ? '#333333' : '#e0e0e0',
    text: isDark ? '#ffffff' : '#1a1a1a',
    textSecondary: isDark ? '#888888' : '#666666',
    canvasBg: isDark ? '#1a1a1a' : '#fafafa',
    grid: isDark ? '#2a2a2a' : '#e8e8e8',
    wall: isDark ? '#555555' : '#333333',
    wallHover: isDark ? '#888888' : '#666666',
    room: isDark ? 'rgba(100, 100, 100, 0.3)' : 'rgba(200, 200, 200, 0.5)',
  };

  // Parse floorplan data to extract walls
  useEffect(() => {
    if (!floorplanData) return;

    const pointsMap = new Map<string, { x: number; y: number }>();
    if (floorplanData.points) {
      floorplanData.points.forEach((p: any) => {
        pointsMap.set(p.id, { x: p.x, y: p.y });
      });
    }
    setPoints(pointsMap);

    if (floorplanData.rooms) {
      setRooms(floorplanData.rooms);
    }

    const wallList: WallInfo[] = [];
    if (floorplanData.walls) {
      floorplanData.walls.forEach((wall: any) => {
        // Support both naming conventions: startPoint/endPoint or startPointId/endPointId
        const startPointId = wall.startPointId || wall.startPoint;
        const endPointId = wall.endPointId || wall.endPoint;
        const startPt = pointsMap.get(startPointId);
        const endPt = pointsMap.get(endPointId);
        if (startPt && endPt) {
          // Find room name for this wall
          let roomName = '';
          if (floorplanData.rooms) {
            for (const room of floorplanData.rooms) {
              const roomPts = room.points || [];
              const hasStart = roomPts.includes(startPointId);
              const hasEnd = roomPts.includes(endPointId);
              if (hasStart && hasEnd) {
                roomName = room.name || '';
                break;
              }
            }
          }
          wallList.push({
            id: wall.id,
            startPoint: startPt,
            endPoint: endPt,
            roomId: wall.roomId,
            roomName,
          });
        }
      });
    }
    setWalls(wallList);
  }, [floorplanData]);

  // Calculate bounds and auto-fit
  const fitToView = useCallback(() => {
    if (walls.length === 0 || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Skip if container has no dimensions yet
    if (containerWidth === 0 || containerHeight === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    walls.forEach(wall => {
      minX = Math.min(minX, wall.startPoint.x, wall.endPoint.x);
      minY = Math.min(minY, wall.startPoint.y, wall.endPoint.y);
      maxX = Math.max(maxX, wall.startPoint.x, wall.endPoint.x);
      maxY = Math.max(maxY, wall.startPoint.y, wall.endPoint.y);
    });

    const floorplanWidth = maxX - minX;
    const floorplanHeight = maxY - minY;

    if (floorplanWidth === 0 || floorplanHeight === 0) return;

    // Add padding
    const padding = 60;
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;

    const scale = Math.min(availableWidth / floorplanWidth, availableHeight / floorplanHeight);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setTransform({
      x: containerWidth / 2 - centerX * scale,
      y: containerHeight / 2 - centerY * scale,
      scale,
    });
  }, [walls]);

  // Auto-fit using ResizeObserver for reliable dimension detection
  useEffect(() => {
    if (!isOpen || walls.length === 0 || !containerRef.current) return;

    const container = containerRef.current;

    // Try immediate fit
    fitToView();

    // Also use ResizeObserver for when container gets proper dimensions
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          fitToView();
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isOpen, walls, fitToView]);

  // Render canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = `${container.clientWidth}px`;
    canvas.style.height = `${container.clientHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, container.clientWidth, container.clientHeight);

    // Draw grid
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    const gridSize = 1000; // 1m grid

    // Calculate grid bounds
    const viewMinX = -transform.x / transform.scale - 2000;
    const viewMaxX = (container.clientWidth - transform.x) / transform.scale + 2000;
    const viewMinY = -transform.y / transform.scale - 2000;
    const viewMaxY = (container.clientHeight - transform.y) / transform.scale + 2000;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1 / transform.scale;

    for (let x = Math.floor(viewMinX / gridSize) * gridSize; x <= viewMaxX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, viewMinY);
      ctx.lineTo(x, viewMaxY);
      ctx.stroke();
    }
    for (let y = Math.floor(viewMinY / gridSize) * gridSize; y <= viewMaxY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(viewMinX, y);
      ctx.lineTo(viewMaxX, y);
      ctx.stroke();
    }

    // Draw rooms
    rooms.forEach(room => {
      const roomPoints = (room.points || [])
        .map((pid: string) => points.get(pid))
        .filter((p: any) => p !== undefined);

      if (roomPoints.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(roomPoints[0].x, roomPoints[0].y);
        for (let i = 1; i < roomPoints.length; i++) {
          ctx.lineTo(roomPoints[i].x, roomPoints[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = colors.room;
        ctx.fill();

        // Room label
        const centerX = roomPoints.reduce((sum: number, p: any) => sum + p.x, 0) / roomPoints.length;
        const centerY = roomPoints.reduce((sum: number, p: any) => sum + p.y, 0) / roomPoints.length;
        ctx.fillStyle = colors.textSecondary;
        ctx.font = `${100}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(room.name || 'Room', centerX, centerY);
      }
    });

    // Draw walls
    walls.forEach(wall => {
      const isHovered = hoveredWall?.id === wall.id;
      const isSelected = selectedWall?.id === wall.id;

      ctx.beginPath();
      ctx.moveTo(wall.startPoint.x, wall.startPoint.y);
      ctx.lineTo(wall.endPoint.x, wall.endPoint.y);

      if (isSelected) {
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 100;
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 20;
      } else if (isHovered) {
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 90;
        ctx.shadowColor = themeColor;
        ctx.shadowBlur = 10;
      } else {
        ctx.strokeStyle = colors.wall;
        ctx.lineWidth = 80;
        ctx.shadowBlur = 0;
      }
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw direction indicator for selected wall
      if (isSelected) {
        const midX = (wall.startPoint.x + wall.endPoint.x) / 2;
        const midY = (wall.startPoint.y + wall.endPoint.y) / 2;

        // Calculate perpendicular direction
        const dx = wall.endPoint.x - wall.startPoint.x;
        const dy = wall.endPoint.y - wall.startPoint.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const perpX = -dy / len;
        const perpY = dx / len;

        const arrowLen = 400;
        const direction = viewDirection === 'inside' ? 1 : -1;
        const endX = midX + perpX * arrowLen * direction;
        const endY = midY + perpY * arrowLen * direction;

        // Draw arrow
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 20;
        ctx.stroke();

        // Arrow head
        const headLen = 80;
        const angle = Math.atan2(endY - midY, endX - midX);
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.lineWidth = 20;
        ctx.stroke();

        // View direction label
        ctx.fillStyle = themeColor;
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(viewDirection === 'inside' ? 'IN' : 'OUT', endX + perpX * 150 * direction, endY + perpY * 150 * direction);
      }
    });

    ctx.restore();
  }, [isOpen, walls, rooms, points, hoveredWall, selectedWall, transform, themeColor, viewDirection, colors]);

  // Mouse handlers
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    return {
      x: (screenX - transform.x) / transform.scale,
      y: (screenY - transform.y) / transform.scale,
    };
  }, [transform]);

  const findWallAtPoint = useCallback((worldX: number, worldY: number): WallInfo | null => {
    const threshold = 150; // Hit detection threshold in mm

    for (const wall of walls) {
      const { startPoint, endPoint } = wall;

      // Point to line segment distance
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const lenSq = dx * dx + dy * dy;

      if (lenSq === 0) continue;

      let t = ((worldX - startPoint.x) * dx + (worldY - startPoint.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));

      const closestX = startPoint.x + t * dx;
      const closestY = startPoint.y + t * dy;
      const dist = Math.sqrt((worldX - closestX) ** 2 + (worldY - closestY) ** 2);

      if (dist < threshold) {
        return wall;
      }
    }
    return null;
  }, [walls]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);

    const wall = findWallAtPoint(world.x, world.y);
    setHoveredWall(wall);
  }, [screenToWorld, findWallAtPoint]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(screenX, screenY);

    const wall = findWallAtPoint(world.x, world.y);
    if (wall) {
      setSelectedWall(wall);
    }
  }, [screenToWorld, findWallAtPoint]);

  const handleConfirm = useCallback(() => {
    if (selectedWall) {
      onWallSelected(selectedWall, viewDirection);
      onClose();
    }
  }, [selectedWall, viewDirection, onWallSelected, onClose]);

  // Extract wall ID from mesh name (e.g., "wall_abc123" or "wall_trimmed_abc123")
  const extractWallIdFromMeshName = useCallback((meshName: string): string | null => {
    // Handle "wall_trimmed_xxx" format
    if (meshName.startsWith('wall_trimmed_')) {
      return meshName.replace('wall_trimmed_', '');
    }
    // Handle "wall_xxx" format
    if (meshName.startsWith('wall_')) {
      return meshName.replace('wall_', '');
    }
    return null;
  }, []);

  // Find WallInfo by wall ID
  const findWallById = useCallback((wallId: string): WallInfo | null => {
    return walls.find(w => w.id === wallId || w.id.startsWith(wallId) || wallId.startsWith(w.id)) || null;
  }, [walls]);

  // Highlight a wall mesh in 3D
  const highlightWallMesh = useCallback((mesh: AbstractMesh | null) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Create highlight material if not exists
    if (!highlightMaterialRef.current) {
      const highlightMat = new StandardMaterial('elevationHighlightMaterial', scene);
      highlightMat.diffuseColor = Color3.FromHexString(themeColor);
      highlightMat.emissiveColor = Color3.FromHexString(themeColor).scale(0.3);
      highlightMat.specularColor = new Color3(0.3, 0.3, 0.3);
      highlightMaterialRef.current = highlightMat;
    }

    // Restore previous selected mesh material
    if (selectedMeshRef.current && originalMaterialRef.current) {
      selectedMeshRef.current.material = originalMaterialRef.current;
    }

    // Apply highlight to new mesh
    if (mesh) {
      originalMaterialRef.current = mesh.material;
      mesh.material = highlightMaterialRef.current;
      selectedMeshRef.current = mesh;
    } else {
      selectedMeshRef.current = null;
      originalMaterialRef.current = null;
    }
  }, [themeColor]);

  // Handle 3D wall click/pick - uses main canvas coordinates since we mirror it
  const handle3DWallPick = useCallback((e: MouseEvent) => {
    if (!canvas3DRef.current || !sceneRef.current || !mainCameraRef.current || !babylon3DCanvasRef?.current) return;

    const modalCanvas = canvas3DRef.current;
    const mainCanvas = babylon3DCanvasRef.current.getCanvas();
    const scene = sceneRef.current;

    if (!mainCanvas) return;

    const modalRect = modalCanvas.getBoundingClientRect();
    const mainRect = mainCanvas.getBoundingClientRect();

    // Get click position relative to modal canvas
    const modalX = e.clientX - modalRect.left;
    const modalY = e.clientY - modalRect.top;

    // Scale click position from modal canvas to main canvas coordinates
    const scaleX = mainRect.width / modalRect.width;
    const scaleY = mainRect.height / modalRect.height;
    const mainX = modalX * scaleX;
    const mainY = modalY * scaleY;

    // Perform ray pick using the main camera with scaled coordinates
    const pickResult = scene.pick(mainX, mainY, (mesh) => {
      // Only pick wall meshes
      return mesh.name.startsWith('wall_');
    }, false, mainCameraRef.current);

    if (pickResult?.hit && pickResult.pickedMesh) {
      const meshName = pickResult.pickedMesh.name;
      const wallId = extractWallIdFromMeshName(meshName);

      if (wallId) {
        const wallInfo = findWallById(wallId);
        if (wallInfo) {
          setSelectedWall(wallInfo);
          highlightWallMesh(pickResult.pickedMesh);
        }
      }
    }
  }, [extractWallIdFromMeshName, findWallById, highlightWallMesh, babylon3DCanvasRef]);

  // Initialize 3D mode - get scene reference and start canvas mirroring
  useEffect(() => {
    if (!isOpen || previewMode !== '3d' || !babylon3DCanvasRef) return;

    let retryCount = 0;
    const maxRetries = 50;
    let retryTimer: ReturnType<typeof setTimeout>;
    let isCleanedUp = false;

    const tryInitialize = () => {
      if (isCleanedUp) return;

      const refCurrent = babylon3DCanvasRef?.current;
      if (!refCurrent) {
        if (retryCount < maxRetries) {
          retryCount++;
          retryTimer = setTimeout(tryInitialize, 100);
        }
        return;
      }

      const engine = refCurrent.getEngine();
      const scene = refCurrent.getScene();

      if (!engine || !scene) {
        if (retryCount < maxRetries) {
          retryCount++;
          retryTimer = setTimeout(tryInitialize, 100);
        }
        return;
      }

      engineRef.current = engine;
      sceneRef.current = scene;
      mainCameraRef.current = scene.activeCamera as ArcRotateCamera;

      setIs3DInitialized(true);
    };

    tryInitialize();

    return () => {
      isCleanedUp = true;
      clearTimeout(retryTimer);
      mainCameraRef.current = null;
      engineRef.current = null;
      sceneRef.current = null;
      setIs3DInitialized(false);
    };
  }, [isOpen, previewMode, babylon3DCanvasRef]);

  // Mirror main 3D canvas to modal canvas (avoids flickering from dual rendering)
  useEffect(() => {
    if (!isOpen || previewMode !== '3d' || !is3DInitialized || !babylon3DCanvasRef) return;

    const modalCanvas = canvas3DRef.current;
    const refCurrent = babylon3DCanvasRef.current;
    if (!modalCanvas || !refCurrent) return;

    const mainCanvas = refCurrent.getCanvas();
    if (!mainCanvas) return;

    const ctx = modalCanvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;

    const copyFrame = () => {
      if (!modalCanvas || !mainCanvas) return;

      // Ensure canvas dimensions are set
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        if (modalCanvas.width !== rect.width || modalCanvas.height !== rect.height) {
          modalCanvas.width = rect.width;
          modalCanvas.height = rect.height;
        }
      }

      // Copy main canvas content to modal canvas
      ctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);
      ctx.drawImage(mainCanvas, 0, 0, modalCanvas.width, modalCanvas.height);

      animFrameId = requestAnimationFrame(copyFrame);
    };

    copyFrame();

    return () => {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, [isOpen, previewMode, is3DInitialized, babylon3DCanvasRef]);

  // 3D preview mouse interactions - controls the main camera since we mirror the view
  useEffect(() => {
    if (!isOpen || previewMode !== '3d' || !canvas3DRef.current || !is3DInitialized) return;

    const canvas = canvas3DRef.current;
    const camera = mainCameraRef.current;
    if (!camera) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      dragging3DRef.current = true;
      isRightMouseRef.current = e.button === 2;
      lastMouse3DRef.current = { x: e.clientX, y: e.clientY };
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }; // Track click start
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: MouseEvent) => {
      const currentCamera = mainCameraRef.current;
      if (!dragging3DRef.current || !currentCamera) return;

      const dx = e.clientX - lastMouse3DRef.current.x;
      const dy = e.clientY - lastMouse3DRef.current.y;
      lastMouse3DRef.current = { x: e.clientX, y: e.clientY };

      if (isRightMouseRef.current) {
        // Right mouse: pan
        const panSpeed = 0.01 * currentCamera.radius;
        currentCamera.target.x -= dx * panSpeed * Math.cos(currentCamera.alpha);
        currentCamera.target.z -= dx * panSpeed * Math.sin(currentCamera.alpha);
        currentCamera.target.y += dy * panSpeed;
      } else {
        // Left mouse: rotate
        currentCamera.alpha -= dx * 0.01;
        currentCamera.beta -= dy * 0.01;
        currentCamera.beta = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, currentCamera.beta));
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Check if it was a click (not a drag) - left click only
      if (mouseDownPosRef.current && !isRightMouseRef.current) {
        const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
        const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
        const moveThreshold = 5; // pixels

        if (dx < moveThreshold && dy < moveThreshold) {
          // It was a click, perform wall picking
          handle3DWallPick(e);
        }
      }

      dragging3DRef.current = false;
      isRightMouseRef.current = false;
      mouseDownPosRef.current = null;
      canvas.style.cursor = 'grab';
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentCamera = mainCameraRef.current;
      if (!currentCamera) return;

      const zoomDelta = e.deltaY > 0 ? 1.1 : 0.9;
      currentCamera.radius = Math.max(3, Math.min(100, currentCamera.radius * zoomDelta));
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isOpen, previewMode, is3DInitialized, handle3DWallPick]);

  // Handle 3D canvas resize
  useEffect(() => {
    if (!isOpen || previewMode !== '3d' || !canvas3DRef.current || !containerRef.current || !is3DInitialized) return;

    const canvas = canvas3DRef.current;
    const container = containerRef.current;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isOpen, previewMode, is3DInitialized]);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setSelectedWall(null);
      setHoveredWall(null);
      setViewDirection('inside');
      setPreviewMode('2d');
    } else {
      // Clean up 3D selection when modal closes
      if (selectedMeshRef.current && originalMaterialRef.current) {
        selectedMeshRef.current.material = originalMaterialRef.current;
      }
      selectedMeshRef.current = null;
      originalMaterialRef.current = null;
      if (highlightMaterialRef.current) {
        highlightMaterialRef.current.dispose();
        highlightMaterialRef.current = null;
      }
    }
  }, [isOpen]);

  // Sync 2D selection to 3D highlight when switching modes or selecting in 2D
  useEffect(() => {
    if (previewMode === '3d' && selectedWall && sceneRef.current) {
      // Find the mesh for the selected wall and highlight it
      const scene = sceneRef.current;
      const meshes = scene.meshes.filter(m => m.name.startsWith('wall_'));

      for (const mesh of meshes) {
        const wallId = extractWallIdFromMeshName(mesh.name);
        if (wallId && (wallId === selectedWall.id || selectedWall.id.includes(wallId) || wallId.includes(selectedWall.id))) {
          highlightWallMesh(mesh);
          break;
        }
      }
    } else if (previewMode === '2d') {
      // Clear 3D highlight when switching to 2D
      highlightWallMesh(null);
    }
  }, [previewMode, selectedWall, extractWallIdFromMeshName, highlightWallMesh]);

  if (!isOpen) return null;

  const wallLength = selectedWall
    ? Math.sqrt(
        (selectedWall.endPoint.x - selectedWall.startPoint.x) ** 2 +
        (selectedWall.endPoint.y - selectedWall.startPoint.y) ** 2
      ) / 1000
    : 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.bg,
          borderColor: colors.border,
        }}
      >
        <div className={styles.header} style={{ background: colors.bgSecondary, borderColor: colors.border }}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title} style={{ color: colors.text }}>Select a Wall</h2>
            <p className={styles.subtitle} style={{ color: colors.textSecondary }}>
              {previewMode === '2d' ? 'Click on a wall in the floorplan to select it' : 'Click on a wall in the 3D view to select it'}
            </p>
          </div>
          <div className={styles.headerRight}>
            {/* 2D/3D Toggle */}
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewToggleBtn} ${previewMode === '2d' ? styles.active : ''}`}
                onClick={() => setPreviewMode('2d')}
                style={{
                  background: previewMode === '2d' ? themeColor : colors.bg,
                  color: previewMode === '2d' ? '#fff' : colors.text,
                  borderColor: previewMode === '2d' ? themeColor : colors.border,
                }}
                title="2D View"
              >
                <MdGridOn size={18} />
                <span>2D</span>
              </button>
              <button
                className={`${styles.viewToggleBtn} ${previewMode === '3d' ? styles.active : ''}`}
                onClick={() => setPreviewMode('3d')}
                style={{
                  background: previewMode === '3d' ? themeColor : colors.bg,
                  color: previewMode === '3d' ? '#fff' : colors.text,
                  borderColor: previewMode === '3d' ? themeColor : colors.border,
                }}
                title="3D View"
              >
                <Md3dRotation size={18} />
                <span>3D</span>
              </button>
            </div>
            <button
              className={styles.closeButton}
              onClick={onClose}
              style={{ color: colors.textSecondary }}
            >
              <MdClose size={24} />
            </button>
          </div>
        </div>

        <div className={styles.content}>
          <div
            className={styles.canvasContainer}
            ref={containerRef}
            style={{ background: colors.canvasBg }}
          >
            {/* 2D Canvas */}
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onMouseMove={handleMouseMove}
              onClick={handleClick}
              style={{
                cursor: hoveredWall ? 'pointer' : 'default',
                display: previewMode === '2d' ? 'block' : 'none',
              }}
            />

            {/* 3D Canvas */}
            <canvas
              ref={canvas3DRef}
              className={styles.canvas}
              tabIndex={0}
              style={{
                display: previewMode === '3d' ? 'block' : 'none',
                cursor: 'grab',
                outline: 'none',
              }}
            />

            {/* 3D Loading indicator */}
            {previewMode === '3d' && !is3DInitialized && (
              <div
                className={styles.loadingOverlay}
                style={{
                  background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
                  color: colors.text,
                }}
              >
                Loading 3D view...
              </div>
            )}

            {/* Instructions */}
            {previewMode === '2d' && !selectedWall && (
              <div
                className={styles.instructions}
                style={{
                  background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                Click on any wall to select it for elevation view
              </div>
            )}

            {/* 3D mode hint */}
            {previewMode === '3d' && is3DInitialized && !selectedWall && (
              <div
                className={styles.instructions}
                style={{
                  background: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                }}
              >
                Click wall to select • Drag to rotate • Right-drag to pan • Scroll to zoom
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className={styles.sidebar} style={{ background: colors.bgSecondary, borderColor: colors.border }}>
            <div className={styles.infoSection}>
              <h3 style={{ color: colors.textSecondary }}>Selected Wall</h3>
              {selectedWall ? (
                <div className={styles.wallInfo} style={{ background: colors.bg, borderColor: colors.border }}>
                  <p style={{ color: colors.text }}>
                    <strong style={{ color: colors.textSecondary }}>Wall ID:</strong> {selectedWall.id.slice(0, 8)}...
                  </p>
                  {selectedWall.roomName && (
                    <p style={{ color: colors.text }}>
                      <strong style={{ color: colors.textSecondary }}>Room:</strong> {selectedWall.roomName}
                    </p>
                  )}
                  <p style={{ color: colors.text }}>
                    <strong style={{ color: colors.textSecondary }}>Length:</strong> {wallLength.toFixed(2)} m
                  </p>
                </div>
              ) : (
                <p className={styles.placeholder} style={{ color: colors.textSecondary }}>
                  Click on a wall to select
                </p>
              )}
            </div>

            {selectedWall && (
              <div className={styles.directionSection}>
                <h3 style={{ color: colors.textSecondary }}>View Direction</h3>
                <div className={styles.directionButtons}>
                  <button
                    className={`${styles.directionBtn} ${viewDirection === 'inside' ? styles.active : ''}`}
                    onClick={() => setViewDirection('inside')}
                    style={{
                      background: viewDirection === 'inside' ? themeColor : colors.bg,
                      borderColor: viewDirection === 'inside' ? themeColor : colors.border,
                      color: viewDirection === 'inside' ? '#fff' : colors.text,
                    }}
                  >
                    <MdArrowForward size={20} />
                    <span>Inside</span>
                  </button>
                  <button
                    className={`${styles.directionBtn} ${viewDirection === 'outside' ? styles.active : ''}`}
                    onClick={() => setViewDirection('outside')}
                    style={{
                      background: viewDirection === 'outside' ? themeColor : colors.bg,
                      borderColor: viewDirection === 'outside' ? themeColor : colors.border,
                      color: viewDirection === 'outside' ? '#fff' : colors.text,
                    }}
                  >
                    <MdArrowBack size={20} />
                    <span>Outside</span>
                  </button>
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button
                className={styles.cancelBtn}
                onClick={onClose}
                style={{
                  background: colors.bg,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              >
                Cancel
              </button>
              <button
                className={styles.confirmBtn}
                onClick={handleConfirm}
                disabled={!selectedWall}
                style={{
                  backgroundColor: selectedWall ? themeColor : colors.border,
                  color: selectedWall ? '#fff' : colors.textSecondary,
                }}
              >
                Show Elevation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ElevationModal;
