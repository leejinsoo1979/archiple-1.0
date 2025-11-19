import { useEffect, useRef, useState } from 'react';
import styles from './FloorplanCanvas.module.css';

// Core
import { SceneManager } from '../core/engine/SceneManager';
import type { EditorConfig } from '../core/types/EditorState';
import { ToolType } from '../core/types/EditorState';
import { eventBus } from '../core/events/EventBus';
import { FloorEvents } from '../core/events/FloorEvents';
import { EditorEvents } from '../core/events/EditorEvents';
import { convertFloorplanToBabylon } from './blueprint/BlueprintToBabylonAdapter';

// Rendering
import { Canvas2DRenderer } from './renderer/canvas2d/Canvas2DRenderer';
import { GridLayer } from './renderer/layers/GridLayer';
import { RoomLayer } from './renderer/layers/RoomLayer';
import { WallLayer } from './renderer/layers/WallLayer';
import { PointLayer } from './renderer/layers/PointLayer';
import { GuideLayer } from './renderer/layers/GuideLayer';
import { SelectionLayer } from './renderer/layers/SelectionLayer';
import { DoorLayer } from './renderer/layers/DoorLayer';
import { WindowLayer } from './renderer/layers/WindowLayer';
import { BackgroundImageLayer } from './renderer/layers/BackgroundImageLayer';

// Tools
import { ToolManager } from './tools/ToolManager';
import { WallTool } from './tools/WallTool';
import { RectangleTool } from './tools/RectangleTool';
import { SelectTool } from './tools/SelectTool';
import { DoorTool } from './tools/DoorTool';
import { WindowTool } from './tools/WindowTool';

// Services
import { SnapService } from './services/SnapService';
import { RoomDetectionService } from './services/RoomDetectionService';

// Controllers
import { MouseController } from './controllers/MouseController';
import { KeyboardController } from './controllers/KeyboardController';

interface FloorplanCanvasProps {
  activeTool: ToolType;
  onDataChange?: (data: { points: any[]; walls: any[]; rooms: any[] }) => void;
  backgroundImage?: HTMLImageElement | null;
  imageScale?: number;
  imageOpacity?: number;
  renderStyle?: 'wireframe' | 'hidden-line' | 'solid' | 'realistic';
  showGrid?: boolean;
  onDimensionClick?: (wallId: string) => void;
  rulerVisible?: boolean;
  rulerStart?: { x: number; y: number } | null;
  rulerEnd?: { x: number; y: number } | null;
  onRulerDragStart?: (isStartPoint: boolean) => void;
  onRulerDrag?: (worldX: number, worldY: number) => void;
  onRulerDragEnd?: () => void;
  onRulerLabelClick?: (screenX: number, screenY: number, currentDistanceMm: number) => void;
  draggingRulerPoint?: 'start' | 'end' | null;
  scannedWalls?: { points: any[]; walls: any[] } | null;
}

const FloorplanCanvas = ({
  activeTool,
  onDataChange,
  backgroundImage,
  imageScale = 100,
  imageOpacity = 0.5,
  renderStyle = 'solid',
  showGrid = true,
  onDimensionClick,
  rulerVisible = false,
  rulerStart = null,
  rulerEnd = null,
  onRulerDragStart,
  onRulerDrag,
  onRulerDragEnd,
  onRulerLabelClick,
  draggingRulerPoint = null,
  scannedWalls = null,
}: FloorplanCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [_mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [_stats, setStats] = useState({ points: 0, walls: 0, rooms: 0, fps: 0 });

  // Ruler label hitbox (in screen coordinates)
  const rulerLabelHitboxRef = useRef<{ x: number; y: number; width: number; height: number; distanceMm: number } | null>(null);

  // Pan state (middle mouse button only)
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef<{ x: number; y: number } | null>(null);

  // Refs for cleanup
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const rendererRef = useRef<Canvas2DRenderer | null>(null);
  const toolManagerRef = useRef<ToolManager | null>(null);
  const snapServiceRef = useRef<SnapService | null>(null);
  const roomDetectionServiceRef = useRef<RoomDetectionService | null>(null);
  const mouseControllerRef = useRef<MouseController | null>(null);
  const keyboardControllerRef = useRef<KeyboardController | null>(null);

  // Layers
  const backgroundLayerRef = useRef<BackgroundImageLayer | null>(null);
  const gridLayerRef = useRef<GridLayer | null>(null);
  const roomLayerRef = useRef<RoomLayer | null>(null);
  const wallLayerRef = useRef<WallLayer | null>(null);
  const pointLayerRef = useRef<PointLayer | null>(null);
  const guideLayerRef = useRef<GuideLayer | null>(null);
  const selectionLayerRef = useRef<SelectionLayer | null>(null);

  // Initialize all systems
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    console.log('[FloorplanCanvas] Initializing...');

    // 1. Initialize SceneManager
    // Units: mm (millimeters) - 모든 내부 좌표는 mm 단위
    // Scale: scalePxPerMm = 0.12 means 1mm = 0.12px (8333mm = 1000px)
    const config: EditorConfig = {
      gridSize: 100, // 100mm = 10cm grid display
      snapEnabled: true,
      snapThreshold: 15, // 15px snap threshold (screen space)
      wallThickness: 100, // 100mm = 10cm
      wallHeight: 2400, // 2400mm = 2.4m
      canvasWidth: container.clientWidth,
      canvasHeight: container.clientHeight,
    };

    const sceneManager = SceneManager.getInstance(config);
    sceneManagerRef.current = sceneManager;

    // 2. Resize canvas
    // Handle High DPI (Retina) displays
    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = container.clientWidth;
    const logicalHeight = container.clientHeight;

    // 3. Initialize Renderer
    const renderer = new Canvas2DRenderer(canvas);
    rendererRef.current = renderer;

    // Resize renderer (handles physical size and DPI scaling)
    renderer.resize(logicalWidth, logicalHeight, dpr);

    // 4. Create Layers
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const backgroundLayer = new BackgroundImageLayer();
    backgroundLayerRef.current = backgroundLayer;

    const gridLayer = new GridLayer({
      gridSize: 100, // 100mm = 10cm minor grid
      majorGridSize: 1000, // 1000mm = 1m major grid (matches 3D 1m spacing visually)
      minorColor: '#555555', // Darker gray for minor lines
      majorColor: '#222222', // Almost black for major lines
      backgroundColor: '#ffffff', // Pure white background (high contrast)
    });
    // GridLayer needs physical dimensions because ctx.getTransform() returns physical pixel matrix
    gridLayer.setSize(logicalWidth * dpr, logicalHeight * dpr);
    gridLayerRef.current = gridLayer;

    const roomLayer = new RoomLayer();
    roomLayerRef.current = roomLayer;

    const wallLayer = new WallLayer({
      wallThickness: config.wallThickness,
    });
    wallLayer.setCamera(renderer.getCamera());
    wallLayerRef.current = wallLayer;

    const pointLayer = new PointLayer();
    pointLayer.setCamera(renderer.getCamera());
    pointLayerRef.current = pointLayer;

    const guideLayer = new GuideLayer();
    guideLayer.setCamera(renderer.getCamera());
    guideLayer.setWallThickness(config.wallThickness);
    guideLayerRef.current = guideLayer;

    const selectionLayer = new SelectionLayer();
    selectionLayerRef.current = selectionLayer;

    const doorLayer = new DoorLayer();
    const windowLayer = new WindowLayer();

    // Add layers to renderer (z-index order: Background→Grid→Room→Wall→Door→Window→Point→Guide→Selection)
    renderer.addLayer(backgroundLayer);
    renderer.addLayer(gridLayer);
    renderer.addLayer(roomLayer);
    renderer.addLayer(wallLayer);
    renderer.addLayer(doorLayer);
    renderer.addLayer(windowLayer);
    renderer.addLayer(pointLayer);
    renderer.addLayer(guideLayer);
    renderer.addLayer(selectionLayer);

    // 5. Initialize Services
    // Use fixed 150mm snap threshold for consistent point snapping
    // Independent of zoom level for better UX
    const snapService = new SnapService({
      gridSize: config.gridSize,
      pointSnapThreshold: 150, // 150mm = 15cm fixed snap range
    });
    snapServiceRef.current = snapService;

    const roomDetectionService = new RoomDetectionService();
    roomDetectionServiceRef.current = roomDetectionService;

    // 6. Initialize ToolManager
    const toolManager = new ToolManager();
    toolManagerRef.current = toolManager;

    // Register tools
    const selectTool = new SelectTool(sceneManager, snapService);
    toolManager.registerTool(ToolType.SELECT, selectTool);

    const wallTool = new WallTool(sceneManager, snapService);
    toolManager.registerTool(ToolType.WALL, wallTool);

    const rectangleTool = new RectangleTool(sceneManager, snapService);
    toolManager.registerTool(ToolType.RECTANGLE, rectangleTool);

    const doorTool = new DoorTool(sceneManager);
    toolManager.registerTool(ToolType.DOOR, doorTool);

    const windowTool = new WindowTool(sceneManager);
    toolManager.registerTool(ToolType.WINDOW, windowTool);

    // Set default tool to SELECT
    toolManager.setActiveTool(ToolType.SELECT);
    sceneManager.setTool(ToolType.SELECT);

    // 7. Initialize Controllers
    const mouseController = new MouseController(canvas, toolManager);
    const camera = renderer.getCamera();
    mouseController.setCamera(camera); // Set camera for coordinate transformation
    mouseControllerRef.current = mouseController;

    const keyboardController = new KeyboardController(toolManager, sceneManager);
    keyboardControllerRef.current = keyboardController;

    // 8. Setup Event Listeners
    const updateLayers = () => {
      const points = sceneManager.objectManager.getAllPoints();
      const walls = sceneManager.objectManager.getAllWalls();
      const rooms = sceneManager.objectManager.getAllRooms();
      const doors = sceneManager.objectManager.getAllDoors();
      const windows = sceneManager.objectManager.getAllWindows();

      console.log('[FloorplanCanvas] updateLayers called:', points.length, 'points', walls.length, 'walls', doors.length, 'doors', windows.length, 'windows');

      // Update layer data
      wallLayer.setWalls(walls);
      wallLayer.setPoints(points);
      wallLayer.setRooms(rooms);
      wallLayer.setDoors(doors);

      pointLayer.setPoints(points);

      roomLayer.setRooms(rooms);
      roomLayer.setPoints(points);

      doorLayer.setDoors(doors);
      doorLayer.setWalls(walls);
      doorLayer.setPoints(points);

      windowLayer.setWindows(windows);
      windowLayer.setWalls(walls);
      windowLayer.setPoints(points);

      // Update stats
      setStats({
        points: points.length,
        walls: walls.length,
        rooms: rooms.length,
        fps: renderer.getFPS(),
      });

      // Notify parent component of data changes (for 3D sync)
      // Convert blueprint Floorplan to Babylon format
      if (onDataChange) {
        const floorplan = sceneManager.objectManager.getFloorplan();
        const doors = sceneManager.objectManager.getAllDoors();
        const windows = sceneManager.objectManager.getAllWindows();
        const babylonData = convertFloorplanToBabylon(floorplan, doors, windows);
        console.log('[FloorplanCanvas] Sending blueprint data to Babylon:', babylonData);
        onDataChange(babylonData);
      }
    };

    // Listen to floorplan events
    eventBus.on(FloorEvents.POINT_ADDED, () => {
      console.log('[FloorplanCanvas] POINT_ADDED event received');
      try {
        updateLayers();
      } catch (e) {
        console.error('[FloorplanCanvas] Error in updateLayers:', e);
      }
    });
    eventBus.on(FloorEvents.POINT_MOVED, () => {
      console.log('[FloorplanCanvas] POINT_MOVED - updating layers directly');
      const points = sceneManager.objectManager.getAllPoints();
      const walls = sceneManager.objectManager.getAllWalls();
      const rooms = sceneManager.objectManager.getAllRooms();

      console.log('[FloorplanCanvas] Got data:', points.length, 'points', walls.length, 'walls');

      wallLayer.setWalls(walls);
      wallLayer.setPoints(points);
      wallLayer.setRooms(rooms);
      pointLayer.setPoints(points);
      roomLayer.setRooms(rooms);
      roomLayer.setPoints(points);

      console.log('[FloorplanCanvas] Layers updated');
    });
    eventBus.on(FloorEvents.POINT_UPDATED, () => {
      console.log('[FloorplanCanvas] POINT_UPDATED event received');
      try {
        updateLayers();
      } catch (e) {
        console.error('[FloorplanCanvas] Error in updateLayers:', e);
      }
    });
    eventBus.on(FloorEvents.WALL_ADDED, updateLayers);
    eventBus.on(FloorEvents.ROOM_DETECTED, updateLayers);

    // Camera reset event
    eventBus.on(EditorEvents.CAMERA_RESET, () => {
      console.log('[FloorplanCanvas] Camera reset requested');
      const camera = renderer.getCamera();
      camera.reset();
      console.log('[FloorplanCanvas] Camera reset to center');
    });

    // Point selection/hover events
    eventBus.on(FloorEvents.POINT_SELECTED, (data: any) => {
      pointLayer.setSelectedPoints([data.point.id]);
      wallLayer.setSelectedWall(null); // Clear wall selection when point selected
    });

    eventBus.on(FloorEvents.POINT_HOVERED, (data: any) => {
      pointLayer.setHoveredPoint(data.point.id);
    });

    eventBus.on(FloorEvents.POINT_SELECTION_CLEARED, () => {
      pointLayer.setSelectedPoints([]);
      wallLayer.setSelectedWall(null); // Also clear wall selection
    });

    // Wall selection events
    eventBus.on(FloorEvents.WALL_SELECTED, (data: any) => {
      wallLayer.setSelectedWall(data.wall.id);
      pointLayer.setSelectedPoints([]); // Clear point selection when wall selected
    });

    // Wall hover events
    eventBus.on(FloorEvents.WALL_HOVERED, (data: any) => {
      wallLayer.setHoveredWall(data.wall.id);
    });

    eventBus.on(FloorEvents.WALL_HOVER_CLEARED, () => {
      wallLayer.setHoveredWall(null);
    });

    eventBus.on(FloorEvents.POINT_HOVER_CLEARED, () => {
      pointLayer.setHoveredPoint(null);
    });

    // Wall preview
    eventBus.on(FloorEvents.WALL_PREVIEW_UPDATED, (data: any) => {
      wallLayer.setPreviewWall(data.start, data.end);
    });

    eventBus.on(FloorEvents.WALL_PREVIEW_CLEARED, () => {
      wallLayer.setPreviewWall(null, null);
    });

    // Snap indicator
    eventBus.on(FloorEvents.SNAP_POINT_UPDATED, (data: any) => {
      pointLayer.setSnapPoint(data.point);
    });

    // Angle guide indicator
    eventBus.on(FloorEvents.ANGLE_GUIDE_UPDATED, (data: any) => {
      guideLayer.setAngleGuide(data.from, data.angle);
    });

    // Grid snap indicator
    eventBus.on(FloorEvents.GRID_SNAP_UPDATED, (data: any) => {
      guideLayer.setGridSnapPoint(data.point);
    });

    // Wall preview with guides
    eventBus.on(FloorEvents.WALL_PREVIEW_UPDATED, (data: any) => {
      // Show distance measurement
      guideLayer.setDistanceMeasurement(data.start, data.end);
    });

    eventBus.on(FloorEvents.WALL_PREVIEW_CLEARED, () => {
      guideLayer.setDistanceMeasurement(null, null);
      guideLayer.setAngleGuide(null, null);
      guideLayer.setGridSnapPoint(null);
      guideLayer.setAngleMeasurement(null, null);
    });

    // Distance measurement events
    eventBus.on(FloorEvents.DISTANCE_MEASUREMENT_UPDATED, (data: any) => {
      guideLayer.setDistanceMeasurement(data.from, data.to);
    });

    eventBus.on(FloorEvents.DISTANCE_MEASUREMENT_CLEARED, () => {
      guideLayer.setDistanceMeasurement(null, null);
    });

    // Angle measurement events
    eventBus.on(FloorEvents.ANGLE_MEASUREMENT_UPDATED, (data: any) => {
      guideLayer.setAngleMeasurement(data.point, data.angle);
    });

    eventBus.on(FloorEvents.ANGLE_MEASUREMENT_CLEARED, () => {
      guideLayer.setAngleMeasurement(null, null);
    });

    // Rectangle preview
    eventBus.on(FloorEvents.RECTANGLE_PREVIEW_UPDATED, (data: any) => {
      guideLayer.setRectanglePreview(data.corners);
    });

    eventBus.on(FloorEvents.RECTANGLE_PREVIEW_CLEARED, () => {
      guideLayer.setRectanglePreview(null);
    });

    // Vertical/Horizontal guide lines for rectangle alignment
    eventBus.on(FloorEvents.VERTICAL_GUIDE_UPDATED, (data: any) => {
      guideLayer.setVerticalGuide(data.x, data.fromY, data.toY);
    });

    eventBus.on(FloorEvents.VERTICAL_GUIDE_CLEARED, () => {
      guideLayer.clearVerticalGuide();
    });

    eventBus.on(FloorEvents.HORIZONTAL_GUIDE_UPDATED, (data: any) => {
      guideLayer.setHorizontalGuide(data.y, data.fromX, data.toX);
    });

    eventBus.on(FloorEvents.HORIZONTAL_GUIDE_CLEARED, () => {
      guideLayer.clearHorizontalGuide();
    });

    // Door preview events
    eventBus.on(FloorEvents.DOOR_PREVIEW_UPDATED, (data: any) => {
      doorLayer.setPreview(data);
    });

    eventBus.on(FloorEvents.DOOR_PREVIEW_CLEARED, () => {
      doorLayer.clearPreview();
    });

    // Door add/remove events
    eventBus.on(FloorEvents.DOOR_ADDED, () => {
      updateLayers();
    });

    eventBus.on(FloorEvents.DOOR_REMOVED, () => {
      updateLayers();
    });

    // Window preview events
    eventBus.on(FloorEvents.WINDOW_PREVIEW_UPDATED, (data: any) => {
      windowLayer.setPreview(data);
    });

    eventBus.on(FloorEvents.WINDOW_PREVIEW_CLEARED, () => {
      windowLayer.clearPreview();
    });

    // Window add/remove events
    eventBus.on(FloorEvents.WINDOW_ADDED, () => {
      updateLayers();
    });

    eventBus.on(FloorEvents.WINDOW_REMOVED, () => {
      updateLayers();
    });

    // Wall added event - just update layers, NO automatic room detection
    eventBus.on(FloorEvents.WALL_ADDED, () => {
      console.log('[FloorplanCanvas] Wall added, updating layers...');
      updateLayers();
    });

    // 9. Automatic Room Detection
    const detectRooms = () => {
      const walls = sceneManager.objectManager.getAllWalls();
      const points = sceneManager.objectManager.getAllPoints();

      // Detect rooms
      const rooms = roomDetectionService.detectRooms(walls, points);

      // Update ObjectManager (replace old rooms with new ones)
      // Note: In a real app, we might want to preserve room names/properties if the ID matches
      // For now, we just replace them to ensure geometry is correct

      // Clear existing rooms
      const existingRooms = sceneManager.objectManager.getAllRooms();
      existingRooms.forEach(r => sceneManager.objectManager.removeRoom(r.id));

      // Add new rooms
      rooms.forEach(r => sceneManager.objectManager.addRoom(r));

      console.log(`[FloorplanCanvas] Detected ${rooms.length} rooms`);
    };

    // Listen to wall events for automatic detection
    // Room detection on wall changes
    eventBus.on(FloorEvents.WALL_ADDED, detectRooms);
    eventBus.on(FloorEvents.WALL_REMOVED, () => {
      detectRooms();
      updateLayers(); // Update 3D when walls are removed (e.g., during splitting)
    });
    eventBus.on(FloorEvents.WALL_MODIFIED, detectRooms);

    // Also detect on point moves (geometry changes)
    eventBus.on(FloorEvents.POINT_UPDATED, detectRooms);

    // Initial detection
    detectRooms();

    // 9. Ensure grid layer size is properly set before first render
    // Use requestAnimationFrame to ensure DOM is fully laid out
    requestAnimationFrame(() => {
      // Double-check canvas dimensions in case container wasn't fully sized initially
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        const dpr = window.devicePixelRatio || 1;
        renderer.resize(container.clientWidth, container.clientHeight, dpr);
        // GridLayer needs physical dimensions because ctx.getTransform() returns physical pixel matrix
        gridLayer.setSize(container.clientWidth * dpr, container.clientHeight * dpr);
      }

      // Force initial render to ensure camera transform is applied and grid is visible
      renderer.render();
    });

    // 10. Start rendering loop
    renderer.start();

    // 11. Handle window resize
    const handleResize = () => {
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      renderer.resize(container.clientWidth, container.clientHeight, dpr);
      // GridLayer needs physical dimensions
      gridLayer.setSize(container.clientWidth * dpr, container.clientHeight * dpr);
      sceneManager.resizeCanvas(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Initial update
    updateLayers();

    console.log('[FloorplanCanvas] Initialized successfully');

    // Store toolManager in ref for tool switching
    toolManagerRef.current = toolManager;

    // Cleanup
    return () => {
      console.log('[FloorplanCanvas] Cleaning up...');

      window.removeEventListener('resize', handleResize);

      // Stop renderer
      renderer.stop();
      renderer.dispose();

      // Dispose controllers
      mouseController.dispose();
      keyboardController.dispose();

      // Clear event listeners
      eventBus.off(FloorEvents.POINT_ADDED, updateLayers);
      eventBus.off(FloorEvents.WALL_ADDED, updateLayers);
      eventBus.off(FloorEvents.ROOM_DETECTED, updateLayers);

      // Reset SceneManager singleton for re-initialization
      SceneManager.resetInstance();
    };
  }, []);

  // Handle tool changes from parent
  useEffect(() => {
    const toolManager = toolManagerRef.current;
    const sceneManager = sceneManagerRef.current;

    if (toolManager && sceneManager) {
      toolManager.setActiveTool(activeTool);
      sceneManager.setTool(activeTool);
    }
  }, [activeTool]);

  // Update render style for layers when it changes
  useEffect(() => {
    const wallLayer = wallLayerRef.current;
    const roomLayer = roomLayerRef.current;
    if (wallLayer) {
      wallLayer.setRenderStyle(renderStyle);
    }
    if (roomLayer) {
      roomLayer.setRenderStyle(renderStyle);
    }
  }, [renderStyle]);

  // Update grid visibility when showGrid changes
  useEffect(() => {
    const gridLayer = gridLayerRef.current;
    if (gridLayer) {
      gridLayer.visible = showGrid;
      // Trigger re-render
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.render();
      }
    }
  }, [showGrid]);

  // Update background image layer when props change
  useEffect(() => {
    const backgroundLayer = backgroundLayerRef.current;
    const gridLayer = gridLayerRef.current;

    if (backgroundLayer) {
      backgroundLayer.setImage(backgroundImage || null);
      backgroundLayer.setScale(imageScale);
      backgroundLayer.setImageOpacity(imageOpacity);

      // Hide grid background when image is present
      if (gridLayer) {
        if (backgroundImage) {
          gridLayer.updateConfig({ backgroundColor: 'transparent' });
        } else {
          gridLayer.updateConfig({ backgroundColor: '#ffffff' });
        }
      }

      // Force render
      const renderer = rendererRef.current;
      if (renderer && backgroundImage) {
        renderer.render();
      }
    }
  }, [backgroundImage, imageScale, imageOpacity]);

  // Handle mouse wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      const camera = renderer.getCamera();
      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Zoom delta: -1 for zoom in, +1 for zoom out
      const zoomDelta = event.deltaY > 0 ? -0.1 : 0.1;
      camera.zoomAt(mouseX, mouseY, zoomDelta);

      console.log('[FloorplanCanvas] Camera zoom:', camera.getZoom().toFixed(2));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  // Handle canvas panning (middle or right mouse button - don't interfere with left-click)
  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const handleMouseDown = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      // Check for ruler label click (highest priority - before point dragging)
      if (event.button === 0 && rulerVisible && onRulerLabelClick) {
        const hitbox = rulerLabelHitboxRef.current;
        if (hitbox &&
          screenX >= hitbox.x &&
          screenX <= hitbox.x + hitbox.width &&
          screenY >= hitbox.y &&
          screenY <= hitbox.y + hitbox.height) {
          event.preventDefault();
          event.stopPropagation();
          onRulerLabelClick(screenX, screenY, hitbox.distanceMm);
          return;
        }
      }

      // Check for ruler point drag (left-click on ruler start or end point)
      if (event.button === 0 && rulerVisible && rulerStart && rulerEnd && onRulerDragStart) {
        const camera = renderer.getCamera();

        // Check start point first
        const startScreen = camera.worldToScreen(rulerStart.x, rulerStart.y);
        const startDistance = Math.sqrt(
          Math.pow(screenX - startScreen.x, 2) +
          Math.pow(screenY - startScreen.y, 2)
        );

        if (startDistance < 15) { // 15px hitbox radius
          event.preventDefault();
          event.stopPropagation();
          onRulerDragStart(true); // true = start point
          canvas.style.cursor = 'grabbing';
          return;
        }

        // Check end point
        const endScreen = camera.worldToScreen(rulerEnd.x, rulerEnd.y);
        const endDistance = Math.sqrt(
          Math.pow(screenX - endScreen.x, 2) +
          Math.pow(screenY - endScreen.y, 2)
        );

        if (endDistance < 15) { // 15px hitbox radius
          event.preventDefault();
          event.stopPropagation();
          onRulerDragStart(false); // false = end point
          canvas.style.cursor = 'grabbing';
          return;
        }
      }

      // Check for dimension click (left-click)
      if (event.button === 0 && onDimensionClick) {
        const wallLayer = wallLayerRef.current;
        if (wallLayer) {
          const clickedWallId = wallLayer.getDimensionAtPoint(screenX, screenY);
          if (clickedWallId) {
            event.preventDefault();
            event.stopPropagation();
            onDimensionClick(clickedWallId);
            return;
          }
        }
      }

      // Pan with middle mouse (button 1) or right mouse (button 2)
      // DO NOT use left-click (button 0) to avoid interfering with MouseController
      if (event.button === 1 || event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        isPanningRef.current = true;
        lastPanPosRef.current = { x: event.clientX, y: event.clientY };
        canvas.style.cursor = 'grabbing';
        console.log('[FloorplanCanvas] Started panning with button', event.button);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      // Handle ruler dragging
      if (draggingRulerPoint && onRulerDrag) {
        event.preventDefault();
        event.stopPropagation();
        const camera = renderer.getCamera();
        const worldPos = camera.screenToWorld(screenX, screenY);
        onRulerDrag(worldPos.x, worldPos.y);
        return;
      }

      // Handle panning
      if (isPanningRef.current && lastPanPosRef.current) {
        event.preventDefault();
        event.stopPropagation();

        const dx = event.clientX - lastPanPosRef.current.x;
        const dy = event.clientY - lastPanPosRef.current.y;

        const camera = renderer.getCamera();
        camera.pan(dx, dy);

        lastPanPosRef.current = { x: event.clientX, y: event.clientY };
        canvas.style.cursor = 'grabbing';
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      // Handle ruler drag end
      if (event.button === 0 && draggingRulerPoint && onRulerDragEnd) {
        event.preventDefault();
        event.stopPropagation();
        onRulerDragEnd();
        canvas.style.cursor = 'default';
        return;
      }

      // Handle panning end
      if (event.button === 1 || event.button === 2) {
        isPanningRef.current = false;
        lastPanPosRef.current = null;
        canvas.style.cursor = 'default';
        console.log('[FloorplanCanvas] Stopped panning');
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      // Prevent context menu when right-click is used for panning
      event.preventDefault();
    };

    // Use capture phase to intercept middle/right-click before MouseController
    canvas.addEventListener('mousedown', handleMouseDown, true);
    canvas.addEventListener('mousemove', handleMouseMove, true);
    canvas.addEventListener('mouseup', handleMouseUp, true);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown, true);
      canvas.removeEventListener('mousemove', handleMouseMove, true);
      canvas.removeEventListener('mouseup', handleMouseUp, true);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onDimensionClick, rulerVisible, rulerStart, rulerEnd, onRulerDragStart, onRulerDrag, onRulerDragEnd, onRulerLabelClick, draggingRulerPoint]);

  // Handle mouse move for coordinate display
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setMousePos({ x: Math.round(x), y: Math.round(y) });
  };

  // Draw ruler overlay continuously
  useEffect(() => {
    if (!rulerVisible || !rulerStart || !rulerEnd) return;

    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    let animationId: number;

    const drawRuler = () => {
      const ctx = canvas.getContext('2d');
      const camera = renderer.getCamera();
      if (!ctx || !camera) return;

      // Draw ruler in screen space (after renderer has drawn the scene)
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen space

      const startScreen = camera.worldToScreen(rulerStart.x, rulerStart.y);
      const endScreen = camera.worldToScreen(rulerEnd.x, rulerEnd.y);

      // Draw line
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(endScreen.x, endScreen.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw start point (draggable, same style as end point)
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(startScreen.x, startScreen.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Draw outer ring on start point
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(startScreen.x, startScreen.y, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Draw end point (draggable, same style as start point)
      ctx.fillStyle = '#FF0000';
      ctx.beginPath();
      ctx.arc(endScreen.x, endScreen.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Draw outer ring on end point
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(endScreen.x, endScreen.y, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Draw distance label
      const dx = rulerEnd.x - rulerStart.x;
      const dy = rulerEnd.y - rulerStart.y;
      const distMm = Math.sqrt(dx * dx + dy * dy);
      const midX = (startScreen.x + endScreen.x) / 2;
      const midY = (startScreen.y + endScreen.y) / 2;

      const labelWidth = 120;
      const labelHeight = 30;
      const labelX = midX - labelWidth / 2;
      const labelY = midY - labelHeight / 2;

      // Store hitbox for click detection
      rulerLabelHitboxRef.current = {
        x: labelX,
        y: labelY,
        width: labelWidth,
        height: labelHeight,
        distanceMm: distMm,
      };

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

      // Draw border to indicate clickability
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${distMm.toFixed(0)}mm`, midX, midY);

      ctx.restore();

      // Continue drawing
      animationId = requestAnimationFrame(drawRuler);
    };

    // Start drawing loop
    animationId = requestAnimationFrame(drawRuler);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [rulerVisible, rulerStart, rulerEnd]);

  // Draw scanned walls overlay continuously
  useEffect(() => {
    if (!scannedWalls || !scannedWalls.walls.length) return;

    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    let animationId: number;

    const drawScannedWalls = () => {
      const ctx = canvas.getContext('2d');
      const camera = renderer.getCamera();
      if (!ctx || !camera) return;

      // Convert image pixel coordinates to world coordinates (mm)
      // Image coordinates: (0,0) at top-left, +X right, +Y down
      // World coordinates: (0,0) at center, +X right, +Y down
      const imageWidth = backgroundImage?.width || 1000;
      const imageHeight = backgroundImage?.height || 1000;

      const pixelToWorld = (pixelX: number, pixelY: number) => {
        // Convert pixel to mm
        const worldX = (pixelX * imageScale) - (imageWidth * imageScale / 2);
        const worldY = (pixelY * imageScale) - (imageHeight * imageScale / 2);
        return { x: worldX, y: worldY };
      };

      // Create point lookup map
      const pointMap = new Map();
      scannedWalls.points.forEach((p: any) => {
        pointMap.set(p.id, p);
      });

      // Draw walls in screen space
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to screen space

      scannedWalls.walls.forEach((wall: any) => {
        const startPoint = pointMap.get(wall.startPointId);
        const endPoint = pointMap.get(wall.endPointId);

        if (!startPoint || !endPoint) return;

        // Convert to world coordinates
        const startWorld = pixelToWorld(startPoint.x, startPoint.y);
        const endWorld = pixelToWorld(endPoint.x, endPoint.y);

        // Convert to screen coordinates
        const startScreen = camera.worldToScreen(startWorld.x, startWorld.y);
        const endScreen = camera.worldToScreen(endWorld.x, endWorld.y);

        // Draw wall line in green with dashed style
        ctx.strokeStyle = '#22c55e'; // Green color
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]); // Dashed pattern
        ctx.beginPath();
        ctx.moveTo(startScreen.x, startScreen.y);
        ctx.lineTo(endScreen.x, endScreen.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw endpoints as small circles
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(startScreen.x, startScreen.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(endScreen.x, endScreen.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // Continue drawing
      animationId = requestAnimationFrame(drawScannedWalls);
    };

    // Start drawing loop
    animationId = requestAnimationFrame(drawScannedWalls);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [scannedWalls, imageScale, backgroundImage]);

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onMouseMove={handleMouseMove}
        style={{ cursor: draggingRulerPoint ? 'grabbing' : 'default' }}
      />
    </div>
  );
};

export default FloorplanCanvas;
