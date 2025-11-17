import { useEffect, useRef, useState } from 'react';
import styles from './FloorplanCanvas.module.css';

// Core
import { SceneManager } from '../core/engine/SceneManager';
import type { EditorConfig } from '../core/types/EditorState';
import { ToolType } from '../core/types/EditorState';
import { eventBus } from '../core/events/EventBus';
import { FloorEvents } from '../core/events/FloorEvents';

// Rendering
import { Canvas2DRenderer } from './renderer/canvas2d/Canvas2DRenderer';
import { GridLayer } from './renderer/layers/GridLayer';
import { RoomLayer } from './renderer/layers/RoomLayer';
import { WallLayer } from './renderer/layers/WallLayer';
import { PointLayer } from './renderer/layers/PointLayer';
import { GuideLayer } from './renderer/layers/GuideLayer';
import { SelectionLayer } from './renderer/layers/SelectionLayer';

// Tools
import { ToolManager } from './tools/ToolManager';
import { WallTool } from './tools/WallTool';
import { RectangleTool } from './tools/RectangleTool';

// Services
import { SnapService } from './services/SnapService';
import { RoomDetectionService } from './services/RoomDetectionService';

// Controllers
import { MouseController } from './controllers/MouseController';
import { KeyboardController } from './controllers/KeyboardController';

interface FloorplanCanvasProps {
  activeTool: ToolType;
  onDataChange?: (data: { points: any[]; walls: any[]; rooms: any[] }) => void;
}

const FloorplanCanvas = ({ activeTool, onDataChange }: FloorplanCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [stats, setStats] = useState({ points: 0, walls: 0, rooms: 0, fps: 0 });

  // Refs for cleanup
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const rendererRef = useRef<Canvas2DRenderer | null>(null);
  const toolManagerRef = useRef<ToolManager | null>(null);
  const snapServiceRef = useRef<SnapService | null>(null);
  const roomDetectionServiceRef = useRef<RoomDetectionService | null>(null);
  const mouseControllerRef = useRef<MouseController | null>(null);
  const keyboardControllerRef = useRef<KeyboardController | null>(null);

  // Layers
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
    // Units: mm (millimeters)
    // Conversion: 1 pixel = 10mm for display
    const config: EditorConfig = {
      gridSize: 20,
      snapEnabled: true,
      snapThreshold: 15,
      wallThickness: 200, // 200mm = 20cm
      wallHeight: 2800, // 2800mm = 2.8m
      canvasWidth: container.clientWidth,
      canvasHeight: container.clientHeight,
    };

    const sceneManager = SceneManager.getInstance(config);
    sceneManagerRef.current = sceneManager;

    // 2. Resize canvas
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // 3. Initialize Renderer
    const renderer = new Canvas2DRenderer(canvas);
    rendererRef.current = renderer;

    // 4. Create Layers
    const gridLayer = new GridLayer({
      gridSize: config.gridSize,
      majorGridSize: config.gridSize * 5,
      minorColor: '#e0e0e0',
      majorColor: '#c0c0c0',
      backgroundColor: '#ffffff',
    });
    gridLayer.setSize(canvas.width, canvas.height);
    gridLayerRef.current = gridLayer;

    const roomLayer = new RoomLayer();
    roomLayerRef.current = roomLayer;

    const wallLayer = new WallLayer();
    wallLayerRef.current = wallLayer;

    const pointLayer = new PointLayer();
    pointLayerRef.current = pointLayer;

    const guideLayer = new GuideLayer();
    guideLayerRef.current = guideLayer;

    const selectionLayer = new SelectionLayer();
    selectionLayerRef.current = selectionLayer;

    // Add layers to renderer (z-index order: Grid→Room→Wall→Point→Guide→Selection)
    renderer.addLayer(gridLayer);
    renderer.addLayer(roomLayer);
    renderer.addLayer(wallLayer);
    renderer.addLayer(pointLayer);
    renderer.addLayer(guideLayer);
    renderer.addLayer(selectionLayer);

    // 5. Initialize Services
    const snapService = new SnapService({
      gridSize: config.gridSize,
      pointSnapThreshold: config.snapThreshold,
    });
    snapServiceRef.current = snapService;

    const roomDetectionService = new RoomDetectionService();
    roomDetectionServiceRef.current = roomDetectionService;

    // 6. Initialize ToolManager
    const toolManager = new ToolManager();
    toolManagerRef.current = toolManager;

    // Register tools
    const wallTool = new WallTool(sceneManager, snapService);
    toolManager.registerTool(ToolType.WALL, wallTool);

    const rectangleTool = new RectangleTool(sceneManager, snapService);
    toolManager.registerTool(ToolType.RECTANGLE, rectangleTool);

    // Set default tool
    toolManager.setActiveTool(ToolType.WALL);
    sceneManager.setTool(ToolType.WALL);

    // 7. Initialize Controllers
    const mouseController = new MouseController(canvas, toolManager);
    mouseController.setCamera(renderer.getCamera()); // Set camera for coordinate transformation
    mouseControllerRef.current = mouseController;

    const keyboardController = new KeyboardController(toolManager, sceneManager);
    keyboardControllerRef.current = keyboardController;

    // 8. Setup Event Listeners
    const updateLayers = () => {
      const points = sceneManager.objectManager.getAllPoints();
      const walls = sceneManager.objectManager.getAllWalls();
      const rooms = sceneManager.objectManager.getAllRooms();

      // Update layer data
      wallLayer.setWalls(walls);
      wallLayer.setPoints(points);

      pointLayer.setPoints(points);

      roomLayer.setRooms(rooms);
      roomLayer.setPoints(points);

      // Update stats
      setStats({
        points: points.length,
        walls: walls.length,
        rooms: rooms.length,
        fps: renderer.getFPS(),
      });

      // Notify parent component of data changes (for 3D sync)
      if (onDataChange) {
        onDataChange({ points, walls, rooms });
      }
    };

    // Listen to floorplan events
    eventBus.on(FloorEvents.POINT_ADDED, updateLayers);
    eventBus.on(FloorEvents.WALL_ADDED, updateLayers);
    eventBus.on(FloorEvents.ROOM_DETECTED, updateLayers);

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
    });

    // Distance measurement events
    eventBus.on(FloorEvents.DISTANCE_MEASUREMENT_UPDATED, (data: any) => {
      guideLayer.setDistanceMeasurement(data.from, data.to);
    });

    eventBus.on(FloorEvents.DISTANCE_MEASUREMENT_CLEARED, () => {
      guideLayer.setDistanceMeasurement(null, null);
    });

    // Room detection on wall added (detect rooms automatically)
    eventBus.on(FloorEvents.WALL_ADDED, () => {
      console.log('[FloorplanCanvas] Wall added, detecting rooms...');
      const points = sceneManager.objectManager.getAllPoints();
      const walls = sceneManager.objectManager.getAllWalls();
      const rooms = sceneManager.objectManager.getAllRooms();
      const detectedRooms = roomDetectionService.detectRooms(walls, points);

      detectedRooms.forEach((room) => {
        // Check if room already exists
        const existing = rooms.find((r) => {
          const samePoints =
            r.points.length === room.points.length &&
            r.points.every((pid) => room.points.includes(pid));
          return samePoints;
        });

        if (!existing) {
          sceneManager.objectManager.addRoom(room);
          eventBus.emit(FloorEvents.ROOM_DETECTED, { room });
          console.log('[FloorplanCanvas] Room detected:', room.name, room.area.toFixed(2), 'm²');
        }
      });

      updateLayers();
    });

    // Room detection on potential room
    eventBus.on(FloorEvents.POTENTIAL_ROOM_DETECTED, () => {
      console.log('[FloorplanCanvas] Detecting rooms...');
      const points = sceneManager.objectManager.getAllPoints();
      const walls = sceneManager.objectManager.getAllWalls();
      const rooms = sceneManager.objectManager.getAllRooms();
      const detectedRooms = roomDetectionService.detectRooms(walls, points);

      detectedRooms.forEach((room) => {
        // Check if room already exists
        const existing = rooms.find((r) => {
          const samePoints =
            r.points.length === room.points.length &&
            r.points.every((pid) => room.points.includes(pid));
          return samePoints;
        });

        if (!existing) {
          sceneManager.objectManager.addRoom(room);
          eventBus.emit(FloorEvents.ROOM_DETECTED, { room });
          console.log('[FloorplanCanvas] Room detected:', room.name, room.area.toFixed(2), 'm²');
        }
      });

      updateLayers();
    });

    // 9. Start rendering
    renderer.start();

    // 10. Handle window resize
    const handleResize = () => {
      if (!canvas || !container) return;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      gridLayer.setSize(canvas.width, canvas.height);
      renderer.resize(canvas.width, canvas.height);
      sceneManager.resizeCanvas(canvas.width, canvas.height);
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
    };
  }, []);

  // Handle tool changes from parent
  useEffect(() => {
    const toolManager = toolManagerRef.current;
    const sceneManager = sceneManagerRef.current;

    if (toolManager && sceneManager) {
      console.log('[FloorplanCanvas] Switching to tool:', activeTool);
      toolManager.setActiveTool(activeTool);
      sceneManager.setTool(activeTool);
    }
  }, [activeTool]);

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

  // Handle mouse move for coordinate display
  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setMousePos({ x: Math.round(x), y: Math.round(y) });
  };

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas ref={canvasRef} className={styles.canvas} onMouseMove={handleMouseMove} />
    </div>
  );
};

export default FloorplanCanvas;
