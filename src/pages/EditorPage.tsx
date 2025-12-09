import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomControlBar, type BottomControlBarRef } from './components/BottomControlBar';
import FloorplanCanvas, { type Furniture2D } from '../floorplan/FloorplanCanvas';
import Babylon3DCanvas, { type Babylon3DCanvasRef } from '../babylon/Babylon3DCanvas';
import styles from './EditorPage.module.css';
import { ToolType } from '../core/types/EditorState';
// import { createTestRoom } from '../floorplan/blueprint/BlueprintToBabylonAdapter';
// PiCubeTransparentLight removed - display style moved to BottomControlBar
import { HiOutlineColorSwatch } from 'react-icons/hi';
import {
  MdAutoAwesome,
  MdInsertDriveFile,
  MdSave,
  MdUndo,
  MdRedo,
  MdBuild,
  MdGridView,
  MdCameraAlt,
  MdPhotoLibrary,
  MdDescription,
  MdInfoOutline
} from 'react-icons/md';
import { FaCaretDown, FaEraser, FaPaintBrush } from 'react-icons/fa';
import { TbRulerMeasure, TbFlipVertical } from 'react-icons/tb';
import { BsGrid3X3Gap, BsPersonWalking } from 'react-icons/bs';
import { MdOutlineDevices, MdOutlineWarning, MdOutlineArticle, Md360, MdVideocam, MdOutlineAutorenew, MdHelpOutline } from 'react-icons/md';
import { FiUser } from 'react-icons/fi';
import { HiOutlineDocumentDuplicate } from 'react-icons/hi';
import { TbViewportWide } from 'react-icons/tb';
import { BiCabinet } from 'react-icons/bi';
import { LiaPencilRulerSolid } from 'react-icons/lia';
import { eventBus } from '../core/events/EventBus';
import { ASSET_EVENTS, type DragEndPayload, type DragStartPayload, type DragMovePayload, type IAssetMetadata } from '../core/events/AssetEvents';
import { assetCatalog } from '../core/assets/AssetCatalog';
import { EditorEvents } from '../core/events/EditorEvents';
import type { Light, LightType } from '../core/types/Light';
import { CameraSettingsModal } from '../ui/modals/CameraSettingsModal';
import { ExportModal } from '../ui/modals/ExportModal';
import { FloorplanSearchModal } from '../ui/modals/FloorplanSearchModal';
import { useCameraSettingsStore } from '../stores/cameraSettingsStore';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { AIRenderModal } from '../ui/landing/components/AIRenderModal';
import type { ViewMode } from '../game/types';
import FloorplanPreview from '../ui/components/FloorplanPreview';
import Mini3DPreview from '../ui/components/Mini3DPreview';
import Compass2D from '../ui/components/Compass2D';
import CameraGizmoWrapper from '../ui/components/CameraGizmoWrapper';
import FloorPropertiesPanel, { type FloorProperties } from './components/FloorPropertiesPanel';
import LevelPropertiesPanel, { type LevelProperties } from './components/LevelPropertiesPanel';
import ElevationModal, { type WallInfo, type ViewDirection } from './components/ElevationModal';
import ElevationViewer from './components/ElevationViewer';
import LibraryPanel from './components/LibraryPanel';
import { useFurnitureSpawner } from '../viewer3d/hooks/useFurnitureSpawner';
import type { Scene } from '@babylonjs/core';
import { FurnitureToolbar } from './components/FurnitureToolbar';
import type { FurnitureSelectionEvent } from '../babylon/FurnitureManager';

type ToolCategory = 'walls' | 'door' | 'window' | 'structure';

const EditorPage = () => {
  const navigate = useNavigate();
  const _setModalOpen = useCameraSettingsStore((state) => state.setModalOpen);

  // Camera settings from store
  const _cameraAlpha = useCameraSettingsStore((state) => state.alpha);
  const _cameraBeta = useCameraSettingsStore((state) => state.beta);
  const cameraFov = useCameraSettingsStore((state) => state.horizontalFov);
  const _projectionType = useCameraSettingsStore((state) => state.projectionType);
  const _setCameraAlpha = useCameraSettingsStore((state) => state.setAlpha);
  const _setCameraBeta = useCameraSettingsStore((state) => state.setBeta);
  const setCameraFov = useCameraSettingsStore((state) => state.setHorizontalFov);
  const _setProjectionType = useCameraSettingsStore((state) => state.setProjectionType);
  const [_activeCategory, _setActiveCategory] = useState<ToolCategory>('walls');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.SELECT);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [view2DType, setView2DType] = useState<'floor' | 'ceiling' | 'elevation'>('floor');
  const [floorplanData, setFloorplanData] = useState<any>(null);
  const [floorplanCanvas, setFloorplanCanvas] = useState<HTMLCanvasElement | null>(null);
  const [sunPanelOpen, setSunPanelOpen] = useState(false);
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);
  const [clearSubmenuOpen, setClearSubmenuOpen] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);
  const [toolkitMenuOpen, setToolkitMenuOpen] = useState(false);
  const [toolkitSubmenuOpen, setToolkitSubmenuOpen] = useState<string | null>(null);
  const toolkitMenuRef = useRef<HTMLDivElement>(null);
  const [drawingsMenuOpen, setDrawingsMenuOpen] = useState(false);
  const drawingsMenuRef = useRef<HTMLDivElement>(null);
  const [imagesMenuOpen, setImagesMenuOpen] = useState(false);
  const imagesMenuRef = useRef<HTMLDivElement>(null);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const bottomControlBarRef = useRef<BottomControlBarRef>(null);
  const [sunSettings, setSunSettings] = useState({
    month: 6, // 1-12월
    hour: 14, // 0-24시
    intensity: 1.5, // 강도
    azimuth: 180, // 방위각 0-360도
  });

  // 월/시간 기반으로 태양 고도(altitude) 계산 (서울 위도 37.5° 기준)
  const calculateSunAltitude = (month: number, hour: number): number => {
    // 태양 적위 (declination) - 월에 따라 변화
    const dayOfYear = (month - 1) * 30 + 15; // 월 중순 기준
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));

    // 서울 위도
    const latitude = 37.5;

    // 시간각 (hour angle) - 정오(12시)가 0도
    const hourAngle = (hour - 12) * 15; // 1시간 = 15도

    // 태양 고도 계산
    const latRad = latitude * (Math.PI / 180);
    const decRad = declination * (Math.PI / 180);
    const haRad = hourAngle * (Math.PI / 180);

    const sinAltitude = Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

    const altitude = Math.asin(sinAltitude) * (180 / Math.PI);

    // 0-90도 범위로 제한 (음수는 해가 진 상태)
    return Math.max(0, Math.min(90, altitude));
  };
  const [playMode, setPlayMode] = useState(false); // FPS mode toggle
  const [gameViewMode, setGameViewMode] = useState<ViewMode>('first-person'); // 1인칭/3인칭/ISO
  const [showCharacter, setShowCharacter] = useState(false); // Character toggle

  const [photoRealisticMode, setPhotoRealisticMode] = useState(true); // Photo-realistic rendering
  const [exportModalOpen, setExportModalOpen] = useState(false); // Export modal toggle
  const [aiRenderModalOpen, setAiRenderModalOpen] = useState(false); // New AI Render Modal toggle
  const [floorplanSearchModalOpen, setFloorplanSearchModalOpen] = useState(false); // Floorplan search modal
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // Captured 3D view for AI

  // Screenshot resolution settings
  const [screenshotResolution, setScreenshotResolution] = useState<'1080p' | '4k' | '8k'>('4k');
  const [aiRenderStyle, setAiRenderStyle] = useState<'photorealistic' | 'product' | 'minimalist' | 'sticker'>('photorealistic');
  const [aiAspectRatio, setAiAspectRatio] = useState<'1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'>('1:1');
  const [aiTimeOfDay, setAiTimeOfDay] = useState<'day' | 'golden_hour' | 'blue_hour' | 'night' | 'overcast'>('day');
  const [aiLightingMood, setAiLightingMood] = useState<'bright' | 'soft' | 'moody' | 'dramatic'>('soft');
  const [aiFurnitureStyle, setAiFurnitureStyle] = useState<'modern' | 'classic' | 'scandinavian' | 'industrial' | 'luxury' | 'minimalist'>('modern');
  const [aiRenderPanelOpen, setAiRenderPanelOpen] = useState(false);
  const [aiInputImage, setAiInputImage] = useState<string | null>(null);
  const [aiOutputImage, setAiOutputImage] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Advanced Camera Settings State
  const [zoomCenter, setZoomCenter] = useState<'mouse' | 'screen'>('screen');
  const [rotationCenter, setRotationCenter] = useState<'mouse' | 'screen'>('screen');
  const [lockRotation, setLockRotation] = useState(false);
  const [movementSpeed, setMovementSpeed] = useState(50);
  const [cameraProjection, setCameraProjection] = useState<'perspective' | 'orthographic'>('perspective');
  const [cameraHeight, setCameraHeight] = useState(150);

  const handleHeightChange = (height: number) => {
    setCameraHeight(height);
    // Dispatch event for Babylon3DCanvas to handle
    const event = new CustomEvent('CAMERA_HEIGHT_CHANGED', { detail: { height } });
    window.dispatchEvent(event);
  };

  // Rendering settings panel (right sidebar)
  const [_renderPanelOpen, _setRenderPanelOpen] = useState(false);
  const [renderSettings, _setRenderSettings] = useState({
    ssaoRadius: 1.5,
    ssaoStrength: 2.0,
    ssrStrength: 0.8,
    bloomThreshold: 0.6,
    bloomWeight: 0.5,
    dofFocusDistance: 5000,
    dofFStop: 2.0,
    chromaticAberration: 5,
    grainIntensity: 8,
    vignetteWeight: 2.0,
    sharpenAmount: 0.5,
  });

  // 3D View display options (now in BottomControlBar)
  const [displayStyle, setDisplayStyle] = useState<'material' | 'white' | 'sketch' | 'transparent'>('material');
  const [hiddenLineMode, setHiddenLineMode] = useState(false);

  // 2D zoom state (0-1 normalized, default ~0.035 = 0.12 scale)
  const [zoom2D, setZoom2D] = useState(0.035);

  // Mini3DPreview height (resizable)
  const [previewHeight, setPreviewHeight] = useState(200);

  // 3D Visibility settings
  const [view3DVisibility, setView3DVisibilityState] = useState({
    showHidden: false,
    ceiling: true,
    furniture: true,
    customProduct: true,
    dimensionLine: true,
    wall: false, // false = auto wall hiding enabled, true = show all walls
    modeling: true,
    character: false
  });

  // Wrapper to sync character visibility with showCharacter state
  const setView3DVisibility = useCallback((newVisibility: typeof view3DVisibility | ((prev: typeof view3DVisibility) => typeof view3DVisibility)) => {
    setView3DVisibilityState((prev) => {
      const next = typeof newVisibility === 'function' ? newVisibility(prev) : newVisibility;
      // Sync character visibility with showCharacter state
      if (next.character !== prev.character) {
        setShowCharacter(next.character);
      }
      return next;
    });
  }, []);

  // Selected room state (for right panel info)
  const [selectedRoom, setSelectedRoom] = useState<{ id: string; name: string; area: number } | null>(null);

  // Selected ceiling in 2D view (for ceiling editor toolbar)
  const [selectedCeiling2D, setSelectedCeiling2D] = useState<{
    id: string;
    name: string;
    area: number;
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Elevation modal state
  const [elevationModalOpen, setElevationModalOpen] = useState(false);
  const [selectedElevationWall, setSelectedElevationWall] = useState<{
    wall: WallInfo;
    direction: ViewDirection;
  } | null>(null);

  // Floor editing mode (double-click on room to edit floor)
  const [editingFloor, setEditingFloor] = useState(false);
  const [floorProperties, setFloorProperties] = useState<FloorProperties>({
    id: '',
    name: 'Untitled',
    roomType: 'Customized',
    controlPoint: 'bottom-left',
    horizontalOffset: 0,
    verticalOffset: 0,
    angle: 0,
    gap: 2,
    gapType: 'custom',
    gapColor: '#666666',
    patternWidth: 1200,
    patternHeight: 120,
    materialImage: '',
  });

  // Level properties (shown when no room is selected)
  const [levelProperties, setLevelProperties] = useState<LevelProperties>({
    currentFloor: 'Level 1',
    area: 0,
    height: 2400,
    floorThickness: 120,
  });

  // Calculate total area from all rooms
  const totalArea = useMemo(() => {
    if (!floorplanData?.rooms || floorplanData.rooms.length === 0) return 0;
    return floorplanData.rooms.reduce((sum: number, room: any) => sum + (room.area || 0), 0);
  }, [floorplanData?.rooms]);

  // Background image state
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(100); // 100mm per pixel default
  const [imageOpacity, setImageOpacity] = useState(0.5);
  const [showBackgroundImage, setShowBackgroundImage] = useState(true);

  // Scanned walls state (overlay on 2D)
  const [scannedWalls, setScannedWalls] = useState<{ points: any[]; walls: any[] } | null>(null);

  // Ruler calibration state
  const [rulerVisible, setRulerVisible] = useState(false);
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
  const [rulerDistance, setRulerDistance] = useState<string>('');
  const [draggingRulerPoint, setDraggingRulerPoint] = useState<'start' | 'end' | null>(null);
  const [editingRulerLabel, setEditingRulerLabel] = useState<{ x: number; y: number; currentDistance: number } | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glbFileInputRef = useRef<HTMLInputElement>(null);
  const cadFileInputRef = useRef<HTMLInputElement>(null);

  // Dimension editing state
  const [editingWallId, setEditingWallId] = useState<string | null>(null);
  const [dimensionInput, setDimensionInput] = useState<string>('');

  // Wall settings state (for right panel)
  const [wallHeight, setWallHeight] = useState(2400); // mm
  const [wallThickness, setWallThickness] = useState(200); // mm

  // Furniture selection state
  const [selectedFurniture, setSelectedFurniture] = useState<{
    id: string;
    name: string;
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Handle furniture selection from Babylon3DCanvas (3D mode)
  const handleFurnitureSelect = useCallback((event: FurnitureSelectionEvent) => {
    if (event.furniture && event.screenPosition) {
      setSelectedFurniture({
        id: event.furniture.id,
        name: event.furniture.name,
        screenPosition: event.screenPosition,
      });
    } else {
      setSelectedFurniture(null);
    }
  }, []);

  // 2D Furniture state
  const [furniture2D, setFurniture2D] = useState<Furniture2D[]>([]);
  const [selectedFurniture2D, setSelectedFurniture2D] = useState<{
    furniture: Furniture2D;
    screenPosition: { x: number; y: number };
  } | null>(null);

  // 2D Drag state for furniture placement from LibraryPanel
  const [dragState2D, setDragState2D] = useState<{
    isDragging: boolean;
    metadata: IAssetMetadata | null;
    mouseX: number;
    mouseY: number;
  }>({ isDragging: false, metadata: null, mouseX: 0, mouseY: 0 });

  // Handle 2D furniture selection from FloorplanCanvas
  const handleFurniture2DSelect = useCallback((furniture: Furniture2D | null, screenPosition?: { x: number; y: number }) => {
    if (furniture && screenPosition) {
      setSelectedFurniture2D({
        furniture,
        screenPosition,
      });
    } else {
      setSelectedFurniture2D(null);
    }
  }, []);

  // Handle 2D furniture move
  const handleFurniture2DMove = useCallback((id: string, x: number, y: number) => {
    setFurniture2D(prev => prev.map(f =>
      f.id === id ? { ...f, x, y } : f
    ));
    // Dispatch event for 3D sync (2D x/y -> 3D x/z in meters)
    const event = new CustomEvent('FURNITURE_MOVE_2D', {
      detail: {
        furnitureId: id,
        position: {
          x: x / 1000, // mm to m
          y: 0, // Keep y at ground level
          z: y / 1000, // 2D y -> 3D z
        }
      }
    });
    window.dispatchEvent(event);
  }, []);

  // Handle 2D furniture rotate
  const handleFurniture2DRotate = useCallback((id: string, rotation: number) => {
    setFurniture2D(prev => prev.map(f =>
      f.id === id ? { ...f, rotation } : f
    ));
    // Dispatch event for 3D sync
    const event = new CustomEvent('FURNITURE_ROTATE_2D', {
      detail: {
        furnitureId: id,
        rotation: { x: 0, y: rotation, z: 0 } // 2D rotation -> 3D Y rotation
      }
    });
    window.dispatchEvent(event);
  }, []);

  // Handle 2D furniture resize
  const handleFurniture2DResize = useCallback((id: string, width: number, depth: number) => {
    setFurniture2D(prev => prev.map(f =>
      f.id === id ? { ...f, width, depth } : f
    ));
  }, []);

  // Handle 2D furniture duplicate
  const handleFurniture2DDuplicate = useCallback((id: string) => {
    const source = furniture2D.find(f => f.id === id);
    if (!source) return;

    const newFurniture: Furniture2D = {
      ...source,
      id: `${source.id}_copy_${Date.now()}`,
      x: source.x + 500, // Offset by 500mm
      y: source.y + 500,
    };
    setFurniture2D(prev => [...prev, newFurniture]);
  }, [furniture2D]);

  // Handle 2D furniture delete
  const handleFurniture2DDelete = useCallback((id: string) => {
    setFurniture2D(prev => prev.filter(f => f.id !== id));
    if (selectedFurniture2D?.furniture.id === id) {
      setSelectedFurniture2D(null);
    }
    // Dispatch event for 3D sync
    const event = new CustomEvent('FURNITURE_DELETE_2D', {
      detail: { furnitureId: id }
    });
    window.dispatchEvent(event);
  }, [selectedFurniture2D]);

  // Handle 2D furniture flip
  const handleFurniture2DFlip = useCallback((id: string) => {
    setFurniture2D(prev => prev.map(f =>
      f.id === id ? { ...f, flippedX: !f.flippedX } : f
    ));
  }, []);

  // Handle 2D furniture hide
  const handleFurniture2DHide = useCallback((id: string) => {
    setFurniture2D(prev => prev.map(f =>
      f.id === id ? { ...f, visible: false } : f
    ));
    if (selectedFurniture2D?.furniture.id === id) {
      setSelectedFurniture2D(null);
    }
  }, [selectedFurniture2D]);

  // 2D drag and drop for furniture placement from LibraryPanel
  useEffect(() => {
    if (viewMode !== '2D') return;

    const handleDragStart = (payload: DragStartPayload) => {
      console.log('[EditorPage] 2D Drag started:', payload.metadata.name);
      setDragState2D({
        isDragging: true,
        metadata: payload.metadata,
        mouseX: payload.mouseX,
        mouseY: payload.mouseY,
      });
    };

    const handleDragMove = (payload: DragMovePayload) => {
      if (dragState2D.isDragging) {
        setDragState2D(prev => ({
          ...prev,
          mouseX: payload.mouseX,
          mouseY: payload.mouseY,
        }));
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (dragState2D.isDragging) {
        eventBus.emit(ASSET_EVENTS.DRAG_MOVE, { mouseX: e.clientX, mouseY: e.clientY });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (dragState2D.isDragging && dragState2D.metadata) {
        // Get canvas element to convert screen coords to world coords
        const canvasRect = floorplanCanvas?.getBoundingClientRect();
        if (canvasRect) {
          // Check if mouse is inside the canvas area
          const isInsideCanvas =
            e.clientX >= canvasRect.left &&
            e.clientX <= canvasRect.right &&
            e.clientY >= canvasRect.top &&
            e.clientY <= canvasRect.bottom;

          if (isInsideCanvas) {
            // Convert screen position to approximate world position (mm)
            // This is a rough conversion - the camera zoom affects the actual scale
            const canvasCenterX = canvasRect.width / 2;
            const canvasCenterY = canvasRect.height / 2;
            const relativeX = e.clientX - canvasRect.left - canvasCenterX;
            const relativeY = e.clientY - canvasRect.top - canvasCenterY;

            // Assume 1 pixel = 2mm at default zoom (this is approximate)
            const pxPerMm = 0.5;
            const worldX = relativeX / pxPerMm;
            const worldY = relativeY / pxPerMm;

            // Create furniture at this position
            const newFurniture: Furniture2D = {
              id: `furniture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: dragState2D.metadata.name,
              category: dragState2D.metadata.category,
              thumbnailUrl: dragState2D.metadata.thumbnailUrl,
              x: worldX,
              y: worldY,
              width: dragState2D.metadata.dimensions.width,
              depth: dragState2D.metadata.dimensions.depth,
              rotation: 0,
              scale: 1,
              flippedX: false,
              flippedY: false,
              visible: true,
            };

            setFurniture2D(prev => [...prev, newFurniture]);
            console.log('[EditorPage] Placed 2D furniture via drag:', newFurniture);

            // Also emit DRAG_END for 3D sync
            eventBus.emit<DragEndPayload>(ASSET_EVENTS.DRAG_END, {
              assetId: dragState2D.metadata.id,
              position: { x: worldX / 1000, y: 0, z: worldY / 1000 }, // mm to m
              rotation: { x: 0, y: 0, z: 0 },
              cancelled: false,
            });
          }
        }

        setDragState2D({ isDragging: false, metadata: null, mouseX: 0, mouseY: 0 });
      }
    };

    eventBus.on<DragStartPayload>(ASSET_EVENTS.DRAG_START, handleDragStart);
    eventBus.on<DragMovePayload>(ASSET_EVENTS.DRAG_MOVE, handleDragMove);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      eventBus.off(ASSET_EVENTS.DRAG_START, handleDragStart);
      eventBus.off(ASSET_EVENTS.DRAG_MOVE, handleDragMove);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [viewMode, dragState2D.isDragging, dragState2D.metadata, floorplanCanvas]);

  // Listen for furniture drag end from 3D mode to add to 2D view (for sync purposes)
  useEffect(() => {
    // Only listen when NOT in 2D mode (2D mode handles its own DRAG_END)
    if (viewMode === '2D') return;

    const handleDragEnd = (payload: DragEndPayload) => {
      if (payload.cancelled) return;

      const metadata = assetCatalog.getAsset(payload.assetId);
      if (!metadata) {
        console.warn('[EditorPage] Asset not found:', payload.assetId);
        return;
      }

      // Create 2D furniture from the spawned position
      // Position is in 3D world coords, convert x/z to 2D x/y (mm)
      const newFurniture: Furniture2D = {
        id: `furniture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: metadata.name,
        category: metadata.category,
        thumbnailUrl: metadata.thumbnailUrl,
        // In Babylon, x and z are the floor plane, y is up
        // Convert to 2D: 3D x -> 2D x, 3D z -> 2D y
        x: payload.position.x * 1000, // m to mm
        y: payload.position.z * 1000, // m to mm (z is "forward" in 3D, y in 2D)
        width: metadata.dimensions.width,
        depth: metadata.dimensions.depth,
        rotation: payload.rotation.y, // Rotation around Y axis in 3D = rotation in 2D
        scale: 1,
        flippedX: false,
        flippedY: false,
        visible: true,
      };

      setFurniture2D(prev => [...prev, newFurniture]);
      console.log('[EditorPage] Added 2D furniture from 3D mode:', newFurniture);
    };

    eventBus.on<DragEndPayload>(ASSET_EVENTS.DRAG_END, handleDragEnd);
    return () => {
      eventBus.off(ASSET_EVENTS.DRAG_END, handleDragEnd);
    };
  }, [viewMode]);

  // Close dropdown menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false);
      }
      if (clearMenuRef.current && !clearMenuRef.current.contains(event.target as Node)) {
        setClearMenuOpen(false);
        setClearSubmenuOpen(false);
      }
      if (toolkitMenuRef.current && !toolkitMenuRef.current.contains(event.target as Node)) {
        setToolkitMenuOpen(false);
        setToolkitSubmenuOpen(null);
      }
      if (drawingsMenuRef.current && !drawingsMenuRef.current.contains(event.target as Node)) {
        setDrawingsMenuOpen(false);
      }
      if (imagesMenuRef.current && !imagesMenuRef.current.contains(event.target as Node)) {
        setImagesMenuOpen(false);
      }
      if (helpMenuRef.current && !helpMenuRef.current.contains(event.target as Node)) {
        setHelpMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear ceiling selection when view2DType changes
  useEffect(() => {
    setSelectedCeiling2D(null);
  }, [view2DType]);

  // Update floorplanData when wall settings change
  useEffect(() => {
    if (!floorplanData || !floorplanData.walls || floorplanData.walls.length === 0) return;

    // Check if any wall needs updating
    const needsUpdate = floorplanData.walls.some(
      (wall: any) => wall.height !== wallHeight || wall.thickness !== wallThickness
    );

    if (needsUpdate) {
      const updatedWalls = floorplanData.walls.map((wall: any) => ({
        ...wall,
        height: wallHeight,
        thickness: wallThickness,
      }));

      setFloorplanData({
        ...floorplanData,
        walls: updatedWalls,
      });
    }
  }, [wallHeight, wallThickness]);

  // GLB model state
  const [glbModelFile, setGlbModelFile] = useState<File | null>(null);

  // Lighting system state
  const [lightPanelOpen, setLightPanelOpen] = useState(false);
  const [lights, setLights] = useState<Light[]>([]);

  // Advanced tool panel state
  const [advancedToolPanelOpen, setAdvancedToolPanelOpen] = useState(false);

  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [lightPlacementMode, setLightPlacementMode] = useState(false);
  const [selectedLightType, setSelectedLightType] = useState<LightType>('point');

  // Theme settings state - load from localStorage on init
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);

  // Custom Modeling Tray state (should not be here - this is for EditorPage, Custom Modeling has its own page)
  const [customModelingTrayOpen, setCustomModelingTrayOpen] = useState(false);
  const [traySections, setTraySections] = useState({
    entityInfo: true,
    materials: true,
    components: true,
    styles: false,
    tags: false,
    shadows: false,
    scenes: false,
    instructor: false,
  });
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('themeMode') as 'light' | 'dark' | null;
    return saved || 'light';
  });
  const [themeColor, setThemeColor] = useState<string>(() => {
    const saved = localStorage.getItem('themeColor');
    return saved || '#3fae7a';
  });

  // Render style state (for header panel)
  const [renderStyleOpen, setRenderStyleOpen] = useState(false);
  const [renderStyle, setRenderStyle] = useState<'wireframe' | 'hidden-line' | 'solid' | 'realistic'>('realistic');

  // Grid visibility state
  const [showGrid, setShowGrid] = useState(true);

  // Handle light placement from 3D view
  const handleLightPlaced = (light: Light) => {
    const newLights = [...lights, light];
    setLights(newLights);
    setSelectedLightId(light.id);
    // Keep placement mode active for placing multiple lights
    // User can manually exit by clicking the button again or switching views
  };

  // Handle light movement via gizmo
  const handleLightMoved = (lightId: string, newPosition: { x: number; y: number; z: number }) => {
    setLights(lights.map(l => l.id === lightId ? { ...l, position: newPosition } : l));
  };

  // Babylon3DCanvas ref for screenshot capture
  const babylon3DCanvasRef = useRef<Babylon3DCanvasRef | null>(null);

  // 3D Scene state for furniture spawning
  const [babylonScene, setBabylonScene] = useState<Scene | null>(null);

  // Initialize furniture spawner hook
  useFurnitureSpawner({
    scene: babylonScene,
  });

  // Update scene reference when Babylon3DCanvas is ready
  useEffect(() => {
    if (babylon3DCanvasRef.current && viewMode === '3D') {
      const scene = babylon3DCanvasRef.current.getScene();
      if (scene && !babylonScene) {
        setBabylonScene(scene);
      }
    }
  }, [viewMode, babylonScene]);

  // Capture and download high-quality render
  const _handleCaptureScreenshot = async () => {
    if (!babylon3DCanvasRef.current) {
      alert('3D 뷰를 먼저 로드해주세요.');
      return;
    }

    try {
      // Resolution mapping
      const resolutions = {
        '1080p': { width: 1920, height: 1080 },
        '4k': { width: 3840, height: 2160 },
        '8k': { width: 7680, height: 4320 },
      };

      const { width, height } = resolutions[screenshotResolution];

      // Show loading message
      const loadingMessage = document.createElement('div');
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 1px solid #333;
        color: white;
        padding: 40px 60px;
        border-radius: 8px;
        font-size: 16px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.7);
        min-width: 320px;
      `;
      loadingMessage.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          border: 3px solid #333;
          border-top: 3px solid #3dbc58;
          border-radius: 50%;
          margin: 0 auto 20px;
          animation: spin 0.8s linear infinite;
        "></div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 12px;">
          Rendering
        </div>
        <div style="font-size: 14px; color: #888; line-height: 1.6;">
          Resolution: ${screenshotResolution.toUpperCase()} (${width}x${height})<br>
          Quality: Ultra (16K Shadows, 8x MSAA)
        </div>
      `;
      document.body.appendChild(loadingMessage);

      const blobUrl = await babylon3DCanvasRef.current.captureRender(width, height);


      // Remove loading message
      document.body.removeChild(loadingMessage);

      // Download using Blob URL - with proper timing
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `archiple_render_${screenshotResolution}_${Date.now()}.png`;
      document.body.appendChild(link);


      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        try {
          link.click();

          // Show success message AFTER successful download trigger
          const successMessage = document.createElement('div');
          successMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 1px solid #3dbc58;
        color: white;
        padding: 40px 60px;
        border-radius: 8px;
        font-size: 16px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.7);
        min-width: 320px;
      `;
          successMessage.innerHTML = `
        <div style="
          width: 48px;
          height: 48px;
          border: 3px solid #3dbc58;
          border-radius: 50%;
          margin: 0 auto 20px;
          position: relative;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -60%) rotate(45deg);
            width: 12px;
            height: 20px;
            border: solid #3dbc58;
            border-width: 0 3px 3px 0;
          "></div>
        </div>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 12px;">
          Render Complete
        </div>
        <div style="font-size: 14px; color: #888; line-height: 1.6;">
          ${screenshotResolution.toUpperCase()} image downloaded
        </div>
      `;
          document.body.appendChild(successMessage);
          setTimeout(() => document.body.removeChild(successMessage), 2000);

        } catch (error) {
          console.error('[EditorPage] Click failed:', error);
          alert('다운로드 실패: ' + (error as Error).message);
        }

        // Clean up after download
        setTimeout(() => {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(blobUrl);
        }, 2000);
      });

    } catch (error) {
      console.error('[EditorPage] Render failed:', error);
      alert('렌더링 실패: ' + (error as Error).message);
    }
  };

  // Generate lighting description based on time of day and mood
  const getLightingPrompt = (timeOfDay: typeof aiTimeOfDay, mood: typeof aiLightingMood): string => {
    const timeDescriptions = {
      day: {
        bright: 'Bright midday sunlight (12000K) streaming through windows, strong direct light, crisp sharp shadows, high contrast, vibrant colors, clear blue sky visible through windows',
        soft: 'Soft natural daylight (6500K), diffused through sheer curtains or clouds, gentle shadows with soft edges, balanced exposure, warm inviting atmosphere',
        moody: 'Dramatic side-lit daylight, strong directional light creating defined shadow areas, high contrast between light and shadow, cinematic depth',
        dramatic: 'Intense direct sunlight with dramatic light shafts, strong contrast, deep shadows in corners, spotlight effect from windows, theatrical lighting'
      },
      golden_hour: {
        bright: 'Intense golden hour sunlight (3500K), warm amber and orange tones flooding the room, long dramatic shadows, rich golden highlights, magic hour glow',
        soft: 'Soft golden hour light (4000K), warm honey tones, gentle amber glow, romantic atmosphere, soft peachy highlights, dreamy sunset ambiance',
        moody: 'Deep golden hour shadows, strong warm/cool contrast, dramatic side lighting, rich amber shadows, cinematic sunset mood',
        dramatic: 'Theatrical golden hour with intense orange sunbeams, extreme warm light, deep contrasting shadows, epic sunset atmosphere, HDR golden glow'
      },
      blue_hour: {
        bright: 'Bright twilight blue hour (8000K), cool blue-purple ambient light, some warm interior artificial lights, magical dusk atmosphere',
        soft: 'Gentle blue hour glow (7000K), soft cool blue ambient light, warm interior lights creating cozy contrast, serene twilight mood',
        moody: 'Moody blue hour with deep blue shadows, cool atmospheric lighting, mysterious twilight ambiance, dramatic blue tones',
        dramatic: 'Cinematic blue hour with intense cool blue exterior light vs. warm golden interior lights, strong color contrast, theatrical dusk lighting'
      },
      night: {
        bright: 'Well-lit night interior, multiple warm artificial lights (3000-3500K), bright and welcoming, minimal shadows, cozy evening atmosphere',
        soft: 'Soft ambient night lighting (2700K), warm dim interior lights, intimate atmosphere, gentle shadows, peaceful evening mood',
        moody: 'Atmospheric night lighting, selective illumination, areas of darkness and light, mysterious shadows, dramatic contrast',
        dramatic: 'Dramatic night scene with strong artificial lighting, theatrical spotlighting, deep shadows, high contrast, cinematic night atmosphere'
      },
      overcast: {
        bright: 'Bright overcast daylight (6500K), even diffused illumination from all directions, no direct shadows, soft uniform lighting, gallery-like conditions',
        soft: 'Gentle overcast light (6000K), extremely soft diffused illumination, almost shadowless, calm neutral atmosphere, peaceful even lighting',
        moody: 'Dark overcast with low light levels, muted colors, soft but dim illumination, melancholic atmosphere, subtle shadows',
        dramatic: 'Stormy overcast with dark moody light, low contrast, heavy atmospheric feeling, dramatic weather lighting, somber tones'
      }
    };

    return timeDescriptions[timeOfDay][mood];
  };

  // Generate furniture style description
  const getFurniturePrompt = (furnitureStyle: typeof aiFurnitureStyle): string => {
    const furnitureDescriptions = {
      modern: 'Contemporary modern furniture with clean lines, smooth surfaces, neutral colors (white, gray, black, beige), glass and metal accents, minimal ornamentation, functional design, sleek silhouettes, geometric shapes',
      classic: 'Traditional classic furniture with ornate details, carved wood, rich fabrics (velvet, silk, leather), warm wood tones (mahogany, cherry, walnut), elegant curves, decorative elements, timeless sophistication, luxury materials',
      scandinavian: 'Scandinavian Nordic furniture with light wood (oak, ash, birch), simple functional forms, natural materials, white and neutral palette, cozy textiles (wool, linen), organic shapes, hygge aesthetic, minimalist elegance',
      industrial: 'Industrial loft furniture with exposed materials, raw metal (steel, iron), reclaimed wood, concrete surfaces, Edison bulbs, utilitarian design, weathered finishes, factory-inspired pieces, urban edge',
      luxury: 'High-end luxury furniture with premium materials (marble, brass, gold accents), designer pieces, plush upholstery, rich textures, statement pieces, sophisticated color palette, artisan craftsmanship, opulent details',
      minimalist: 'Ultra-minimalist furniture with essential pieces only, pure geometric forms, monochromatic palette, hidden storage, clean flat surfaces, no decoration, Japanese-inspired simplicity, zen aesthetic'
    };

    return furnitureDescriptions[furnitureStyle];
  };

  // Generate style-specific prompts for AI rendering
  const getStylePrompt = (style: typeof aiRenderStyle, timeOfDay: typeof aiTimeOfDay, mood: typeof aiLightingMood, furnitureStyle: typeof aiFurnitureStyle): string => {
    const lightingDescription = getLightingPrompt(timeOfDay, mood);
    const furnitureDescription = getFurniturePrompt(furnitureStyle);

    switch (style) {
      case 'photorealistic':
        return `Transform this 3D architectural rendering into an ULTRA-REALISTIC, PHOTO-QUALITY interior photograph that is INDISTINGUISHABLE from a real photograph.

CRITICAL REQUIREMENTS - PRESERVE EXACT LAYOUT:
- Keep the EXACT same room layout, wall positions, window locations, door placements
- Maintain ALL furniture positions and arrangements EXACTLY as shown
- Preserve the camera angle, perspective, and composition PRECISELY

FURNITURE STYLE REQUIREMENT:
Transform all furniture and decor to match this aesthetic: ${furnitureDescription}
Apply this style consistently to ALL furniture pieces, decor items, and accessories while maintaining their exact positions and proportions.

MATERIALS & TEXTURES (Maximum Realism):
- Wood surfaces: Show REAL wood grain patterns, subtle color variations, natural knots, slight wear marks, authentic surface reflections
- Fabric materials: Display actual fabric weaves, textile texture depth, natural wrinkles and folds, realistic light absorption and scattering
- Glass/Windows: Crystal-clear transparency with authentic reflections, subtle dirt/fingerprints, accurate refraction, environmental reflections
- Walls/Paint: Slight texture variation, subtle imperfections, natural light bounce, realistic matte finish
- Floors: Authentic material appearance (wood planks with gaps, tile grout lines, carpet fibers), natural wear patterns, realistic reflections
- Metal surfaces: True metallic reflections, brushed/polished finishes, environmental map reflections

LIGHTING (Professional Architectural Photography):
SPECIFIC LIGHTING SETUP: ${lightingDescription}
- Global illumination: Light bouncing realistically off all surfaces, color bleeding from colored surfaces
- Ambient occlusion in corners and crevices for depth
- Realistic HDR lighting with natural exposure, highlights that don't blow out, shadows that retain detail
- Dust particles visible in light beams for atmospheric depth
- Soft fill light and ambient bounce light for natural illumination

CAMERA & OPTICS (Professional DSLR):
- Shot with professional full-frame camera (Canon EOS 5D, Sony A7R)
- Wide-angle architectural lens (16-35mm) with minimal distortion correction
- Natural depth of field: Slight background softness, foreground sharp, realistic focus fall-off
- Realistic lens characteristics: subtle vignetting, natural chromatic behavior, micro-contrast
- Professional architectural photography composition and framing

ATMOSPHERE & ENVIRONMENT:
- Subtle atmospheric haze/air perspective for depth
- Dust particles floating in sunlight beams
- Natural color grading: Warm, inviting tones, accurate white balance
- Realistic dynamic range: Natural contrast, film-like color response
- Environmental details: Slight imperfections, lived-in feeling, realistic cleanliness level

FINAL OUTPUT QUALITY:
- 8K resolution quality, razor-sharp details where in focus
- Professional color grading like Architectural Digest or interior design magazines
- Absolutely NO cartoon/3D/render appearance - must look like REAL PHOTOGRAPH
- Every material, texture, and lighting must be 100% physically accurate and believable
- The result should fool a professional photographer into thinking it's a real photo`;

      case 'product':
        return `Transform this 3D rendering into ULTRA HIGH-END product photography interior. PRESERVE exact layout and furniture positions.

STUDIO LIGHTING SETUP:
- Professional 3-point lighting: Key light (main), fill light (shadows), rim light (separation)
- Large softbox diffusers creating perfectly soft, even illumination
- Zero harsh shadows, completely controlled lighting environment
- Color-accurate daylight balanced lights (5500K)
- Perfect exposure across entire scene, no hot spots or dark areas

MATERIALS (Commercial Photography Quality):
- Ultra-sharp focus throughout entire scene (f/8-f/11 depth of field)
- Polished wood with mirror-like reflections
- Pristine fabrics without wrinkles, perfect draping
- Crystal-clear glass with no smudges
- Everything looking brand new, showroom perfect
- Maximum material clarity and definition

CAMERA SETTINGS:
- Professional medium format camera (Hasselblad, Phase One)
- Tilt-shift lens for perfect perspective control
- f/8-f/11 aperture for extended depth of field
- ISO 100 for zero noise, maximum clarity
- Perfect white balance, accurate color reproduction

OUTPUT QUALITY:
- E-commerce/catalog photography standard
- Absolutely perfect exposure and color accuracy
- Maximum sharpness and detail, no soft areas
- Professional retouching quality: flawless, pristine, showroom condition
- Suitable for luxury furniture catalogs or high-end interior design portfolios`;

      case 'minimalist':
        return `Transform this 3D rendering into a serene, minimalist Scandinavian-style interior photograph. PRESERVE exact layout and furniture positions.

MINIMALIST AESTHETIC:
- Clean, uncluttered composition with emphasis on negative space
- Predominantly white and neutral color palette (white, soft gray, warm beige, light wood tones)
- Natural materials: Light oak/ash wood, linen textiles, matte white paint, concrete
- Simple, functional furniture with clean lines and organic shapes

LIGHTING (Soft Nordic Light):
- Soft, diffused natural daylight from large windows
- Gentle, even illumination without harsh contrasts
- Subtle shadows with very soft edges
- Cool-to-neutral color temperature (5500-6500K) like overcast Scandinavian sky
- Gentle light gradient creating calm, peaceful atmosphere

MATERIALS & TEXTURES:
- Light wood with natural grain (not glossy, subtle matte finish)
- Soft linen and cotton textiles with natural texture
- Matte white walls with slight texture variation
- Natural stone or light concrete for accent surfaces
- Everything with subtle, tactile quality - no high gloss

ATMOSPHERE:
- Calm, peaceful, meditative feeling
- Hygge ambiance: warm, cozy, but minimal
- Natural, organic, breathable space
- Clean air feeling, sense of simplicity and order
- Emphasis on quality over quantity, each element purposeful

PHOTOGRAPHY STYLE:
- Natural, unprocessed look with gentle color grading
- Slight desaturation for calm mood
- Soft contrast, no blown highlights or blocked shadows
- Architectural photography approach: straight lines, balanced composition
- Film-like quality with natural grain and organic feel`;

      case 'sticker':
        return `Transform this 3D rendering into a clean, modern architectural illustration with BOLD ARTISTIC STYLE. PRESERVE exact layout and furniture positions.

ILLUSTRATION STYLE:
- Bold, confident outlines defining all major elements (2-3px black/dark lines)
- Simplified geometric forms with clean edges
- Modern flat design aesthetic with subtle depth
- Cel-shading technique: 2-3 tone values per color (highlight, midtone, shadow)

COLOR PALETTE:
- Vibrant but harmonious colors: saturated but not garish
- Warm wood tones (amber, honey, caramel)
- Fresh accent colors (teal, coral, sage green, mustard yellow)
- Clean whites and soft neutrals for balance
- Consistent color temperature throughout

RENDERING TECHNIQUE:
- Soft, diffused shadows (no harsh black shadows)
- Simple lighting from above and front (like editorial illustration)
- Minimal texture: solid colors with occasional subtle patterns
- Slight gradient shading on curved surfaces for dimension
- No photorealistic textures - simplified, stylized representation

ARTISTIC APPROACH:
- Professional architectural visualization illustration style
- Similar to: Architectural Digest illustrations, Dwell magazine graphics, modern editorial illustration
- Clean, contemporary, designer-friendly aesthetic
- Suitable for presentations, magazines, design portfolios
- Balance between abstraction and recognizability - clearly an illustration but beautifully designed`;
    }
  };

  // Open AI render panel and capture input image
  const _openAIRenderPanel = async () => {
    if (!babylon3DCanvasRef.current || viewMode !== '3D') {
      alert('3D 뷰로 전환해주세요.');
      return;
    }

    try {

      // Capture what user actually sees on screen
      const dataUrl = await babylon3DCanvasRef.current.takeScreenshot();

      if (!dataUrl) {
        throw new Error('Screenshot capture returned null');
      }


      // Convert data URL to blob URL for display
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      setAiInputImage(blobUrl);
      setAiOutputImage(null);
      setAiRenderPanelOpen(true);
    } catch (error) {
      console.error('[EditorPage] Failed to capture input image:', error);
      alert('이미지 캡처 실패');
    }
  };

  // Generate AI render from input image
  const generateAIImage = async () => {
    if (!aiInputImage || !babylon3DCanvasRef.current) return;

    setAiGenerating(true);

    try {

      // Convert input image blob URL to base64
      const response = await fetch(aiInputImage);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });


      // Call Gemini API for image generation
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not found in environment');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

      const prompt = getStylePrompt(aiRenderStyle, aiTimeOfDay, aiLightingMood, aiFurnitureStyle);


      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: base64,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const aiResponse = await result.response;

      // Extract image from response parts
      let imageFound = false;
      for (const part of aiResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
          const imageBlob = new Blob([buffer], { type: 'image/png' });
          const imageBlobUrl = URL.createObjectURL(imageBlob);

          // Set output image
          setAiOutputImage(imageBlobUrl);
          imageFound = true;
          break;
        }
      }

      if (!imageFound) {
        throw new Error('No image data in API response');
      }

    } catch (error) {
      console.error('[EditorPage] AI rendering failed:', error);
      console.error('[EditorPage] Error details:', JSON.stringify(error, null, 2));

      // Handle specific error types
      const errorMessage = (error as Error).message || String(error);

      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Quota')) {
        alert('AI 렌더링 실패: API 무료 할당량 초과\n\n' +
          '• Google Gemini API 무료 요청 한도에 도달했습니다.\n' +
          '• 잠시 후 다시 시도하거나 내일 다시 시도해주세요.\n' +
          '• 또는 Google Cloud Console에서 유료 플랜으로 업그레이드하세요.\n\n' +
          '자세한 정보: https://ai.google.dev/gemini-api/docs/rate-limits');
      } else if (errorMessage.includes('API key')) {
        alert('AI 렌더링 실패: API 키 오류\n\nGemini API 키를 확인해주세요.');
      } else {
        alert('AI 렌더링 실패:\n\n' + errorMessage + '\n\n상세 정보는 콘솔을 확인하세요.');
      }
    } finally {
      setAiGenerating(false);
    }
  };

  // Listen for tool changes from keyboard shortcuts (e.g., ESC key)
  useEffect(() => {
    const handleToolChanged = (event: any) => {
      const tool = event.detail.tool as ToolType;
      setActiveTool(tool);
    };

    window.addEventListener('tool-changed', handleToolChanged);
    return () => window.removeEventListener('tool-changed', handleToolChanged);
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    document.documentElement.style.setProperty('--theme-color', themeColor);
    document.documentElement.style.setProperty('--theme-color-light', `${themeColor}0d`); // 5% opacity

    // Save to localStorage
    localStorage.setItem('themeMode', themeMode);
    localStorage.setItem('themeColor', themeColor);
  }, [themeMode, themeColor]);

  // Close AI style menu when clicking outside
  useEffect(() => {
    if (!aiRenderPanelOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside the AI render panel or the AI render button
      const aiRenderPanel = target.closest('[data-ai-render-panel]');
      const aiRenderButton = target.closest('[data-ai-render-button]');

      // Only close if click is outside both the panel and the button
      if (!aiRenderPanel && !aiRenderButton) {
        setAiRenderPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aiRenderPanelOpen]);

  // Close theme settings panel when clicking outside
  useEffect(() => {
    if (!themeSettingsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.themeSettingsPanel}`)) {
        setThemeSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeSettingsOpen]);

  // Close render style panel when clicking outside
  useEffect(() => {
    if (!renderStyleOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.renderStylePanel}`)) {
        setRenderStyleOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [renderStyleOpen]);

  // Load test room data (2800mm x 2800mm room with 100mm walls)
  // Commented out - currently unused but may be needed for testing
  /*
  const handleLoadTestRoom = () => {
    const testData = createTestRoom();
    setFloorplanData(testData);
    setViewMode('3D'); // Switch to 3D view to see the result
  };
  */

  // Handle GLB file upload
  const handleGlbUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      console.warn('[EditorPage] No file selected');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.glb')) {
      alert('GLB 파일을 선택하세요 (현재 파일: ' + file.name + ')');
      return;
    }

    setGlbModelFile(file);
    setViewMode('3D'); // Switch to 3D view
  };

  // Handle CAD file upload
  const handleCadUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      console.warn('[EditorPage] No CAD file selected');
      return;
    }

    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.dxf') && !ext.endsWith('.dwg')) {
      alert('CAD 파일을 선택하세요 (.dxf, .dwg 지원)');
      return;
    }

    // TODO: CAD file processing implementation
    console.log('[EditorPage] CAD file selected:', file.name);
    alert('CAD 파일 가져오기 기능은 준비 중입니다.');
  };

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate initial scale to fit image in viewport
        // Assume typical floor plan: 10m (10000mm) should be ~1000px
        // So initial scale: 10mm per pixel
        const initialScale = 10;

        setBackgroundImage(img);
        setImageScale(initialScale);
        setViewMode('2D'); // Switch to 2D to see image

        // Initialize ruler in center of image (in world coordinates)
        const widthInMm = img.width * initialScale;
        const heightInMm = img.height * initialScale;
        const centerX = 0;
        const centerY = 0;
        const rulerLength = Math.min(widthInMm, heightInMm) * 0.3; // 30% of smaller dimension

        setRulerStart({ x: centerX - rulerLength / 2, y: centerY });
        setRulerEnd({ x: centerX + rulerLength / 2, y: centerY });
        setRulerVisible(true);

        // Reset camera to show full image after a short delay
        setTimeout(() => {
          eventBus.emit(EditorEvents.CAMERA_RESET);
        }, 100);
      };
      img.onerror = () => {
        alert('이미지를 로드할 수 없습니다.');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle ruler drag start
  const handleRulerDragStart = (isStartPoint: boolean) => {
    setDraggingRulerPoint(isStartPoint ? 'start' : 'end');
  };

  // Handle ruler drag
  const handleRulerDrag = (worldX: number, worldY: number) => {
    if (!draggingRulerPoint) return;

    if (draggingRulerPoint === 'start') {
      setRulerStart({ x: worldX, y: worldY });
    } else {
      setRulerEnd({ x: worldX, y: worldY });
    }
  };

  // Handle ruler drag end
  const handleRulerDragEnd = () => {
    setDraggingRulerPoint(null);
  };

  // Handle ruler label click
  const handleRulerLabelClick = (screenX: number, screenY: number, currentDistanceMm: number) => {
    setEditingRulerLabel({ x: screenX, y: screenY, currentDistance: currentDistanceMm });
    setRulerDistance(currentDistanceMm.toFixed(0));
  };

  // Handle ruler label submit
  const handleRulerLabelSubmit = () => {
    if (!editingRulerLabel || !rulerStart || !rulerEnd || !backgroundImage) {
      setEditingRulerLabel(null);
      return;
    }

    const realDistanceMm = parseFloat(rulerDistance);
    if (isNaN(realDistanceMm) || realDistanceMm <= 0) {
      alert('유효한 거리를 입력하세요');
      return;
    }

    // Convert world coordinates (mm) to image pixel coordinates
    const widthInMm = backgroundImage.width * imageScale;
    const heightInMm = backgroundImage.height * imageScale;

    const pixel1X = (rulerStart.x + widthInMm / 2) / imageScale;
    const pixel1Y = (rulerStart.y + heightInMm / 2) / imageScale;
    const pixel2X = (rulerEnd.x + widthInMm / 2) / imageScale;
    const pixel2Y = (rulerEnd.y + heightInMm / 2) / imageScale;

    // Calculate pixel distance in image
    const dx = pixel2X - pixel1X;
    const dy = pixel2Y - pixel1Y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate mm per pixel
    const mmPerPixel = realDistanceMm / pixelDistance;

    setImageScale(mmPerPixel);
    setEditingRulerLabel(null);
  };

  // Handle ruler distance submit
  const handleRulerSubmit = () => {
    if (!rulerStart || !rulerEnd || !rulerDistance || !backgroundImage) {
      alert('줄자를 조절하고 실제 거리를 입력하세요');
      return;
    }

    const realDistanceMm = parseFloat(rulerDistance);
    if (isNaN(realDistanceMm) || realDistanceMm <= 0) {
      alert('유효한 거리를 입력하세요');
      return;
    }

    // Convert world coordinates (mm) to image pixel coordinates
    // Background image is centered at origin with current scale
    const widthInMm = backgroundImage.width * imageScale;
    const heightInMm = backgroundImage.height * imageScale;

    const pixel1X = (rulerStart.x + widthInMm / 2) / imageScale;
    const pixel1Y = (rulerStart.y + heightInMm / 2) / imageScale;
    const pixel2X = (rulerEnd.x + widthInMm / 2) / imageScale;
    const pixel2Y = (rulerEnd.y + heightInMm / 2) / imageScale;

    // Calculate pixel distance in image
    const dx = pixel2X - pixel1X;
    const dy = pixel2Y - pixel1Y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate mm per pixel
    const mmPerPixel = realDistanceMm / pixelDistance;

    setImageScale(mmPerPixel);
    setRulerVisible(false);
  };

  // Handle dimension click
  const handleDimensionClick = (data: string | { roomId: string; wallIndex: number; p1: any; p2: any; isCW: boolean }) => {
    if (!floorplanData) return;

    // Handle room interior dimension click
    if (typeof data === 'object') {
      const { p1, p2 } = data;

      // Calculate current interior distance
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      // Store room dimension data for later use
      setEditingWallId(JSON.stringify(data));
      setDimensionInput(currentDistance.toFixed(0));
      return;
    }

    // Handle wall dimension click (legacy)
    const wallId = data;
    const wall = floorplanData.walls.find((w: any) => w.id === wallId);
    if (!wall) return;

    // Find start and end points
    const startPoint = floorplanData.points.find((p: any) => p.id === wall.startPointId);
    const endPoint = floorplanData.points.find((p: any) => p.id === wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Calculate current distance
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);

    setEditingWallId(wallId);
    setDimensionInput(currentDistance.toFixed(0));
  };

  // Handle dimension input submit
  const handleDimensionSubmit = () => {
    if (!editingWallId || !floorplanData) return;

    const newDistance = parseFloat(dimensionInput);
    if (isNaN(newDistance) || newDistance <= 0) {
      alert('유효한 치수를 입력하세요');
      return;
    }

    // Check if this is a room interior dimension
    try {
      const roomDimData = JSON.parse(editingWallId);
      if (roomDimData.roomId && roomDimData.p1 && roomDimData.p2) {
        // Handle room interior dimension change
        const { p1, p2, isCW } = roomDimData;

        // Calculate current interior distance
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        if (currentDistance === 0) return;

        // Calculate the change in distance
        const distanceChange = newDistance - currentDistance;

        // Calculate the perpendicular direction (outward from room interior)
        // The normal vector should point outward from the room
        let nx, ny;
        if (isCW) {
          // For CW rooms, inside is to the right, so outward normal is to the left
          nx = dy;
          ny = -dx;
        } else {
          // For CCW rooms, inside is to the left, so outward normal is to the right
          nx = -dy;
          ny = dx;
        }

        // Normalize
        const len = Math.sqrt(nx * nx + ny * ny);
        nx /= len;
        ny /= len;

        // Move p2 point outward by half the distance change (to maintain symmetry)
        // This expands/contracts the room uniformly
        const offsetX = nx * distanceChange / 2;
        const offsetY = ny * distanceChange / 2;

        // Find and update the point
        const updatedPoints = floorplanData.points.map((point: any) => {
          if (point.id === p2.id) {
            return {
              ...point,
              x: point.x + offsetX,
              y: point.y + offsetY,
            };
          }
          return point;
        });

        // Update floorplan data
        const updatedData = {
          ...floorplanData,
          points: updatedPoints,
        };

        setFloorplanData(updatedData);
        setEditingWallId(null);
        setDimensionInput('');
        return;
      }
    } catch (e) {
      // Not a room dimension, continue with wall dimension logic
    }

    // Handle wall dimension click (legacy)
    const wall = floorplanData.walls.find((w: any) => w.id === editingWallId);
    if (!wall) return;

    // Find start and end points
    const startPoint = floorplanData.points.find((p: any) => p.id === wall.startPointId);
    const endPoint = floorplanData.points.find((p: any) => p.id === wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Calculate current vector
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);

    if (currentDistance === 0) return;

    // Calculate unit vector
    const ux = dx / currentDistance;
    const uy = dy / currentDistance;

    // Update end point to new distance
    const newEndPoint = {
      ...endPoint,
      x: startPoint.x + ux * newDistance,
      y: startPoint.y + uy * newDistance,
    };

    // Update floorplan data
    const updatedData = {
      ...floorplanData,
      points: floorplanData.points.map((p: any) =>
        p.id === endPoint.id ? newEndPoint : p
      ),
    };

    setFloorplanData(updatedData);
    setEditingWallId(null);
    setDimensionInput('');
  };

  // Handle scan button - extract walls and generate 3D
  const handleScan = async () => {
    if (!backgroundImage) {
      alert('이미지를 먼저 업로드하세요');
      return;
    }

    try {
      // Create canvas for image processing
      const canvas = document.createElement('canvas');
      canvas.width = backgroundImage.width;
      canvas.height = backgroundImage.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(backgroundImage, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Import image processing functions
      const { detectLines, filterWallLines, mergeParallelLines } = await import('../lib/imageProcessing');

      // Detect lines
      const allLines = await detectLines(imageData);
      const wallLines = filterWallLines(allLines);
      const mergedLines = mergeParallelLines(wallLines);


      if (mergedLines.length === 0) {
        alert('벽을 감지할 수 없습니다. 이미지 스케일을 조정해보세요.');
        return;
      }

      // Convert lines to Blueprint format
      const points: any[] = [];
      const walls: any[] = [];
      const pointMap = new Map<string, number>();

      // Scale factor: image pixels to mm (assume 1 pixel = imageScale mm for now)
      const pixelToMm = imageScale;

      const getPointId = (x: number, y: number): number => {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (pointMap.has(key)) {
          return pointMap.get(key)!;
        }
        const id = points.length;
        points.push({
          id: `p${id}`,
          x: Math.round(x * pixelToMm),
          y: Math.round(y * pixelToMm),
        });
        pointMap.set(key, id);
        return id;
      };

      // Convert each line to a wall
      mergedLines.forEach((line, index) => {
        const startId = getPointId(line.x1, line.y1);
        const endId = getPointId(line.x2, line.y2);

        if (startId !== endId) {
          walls.push({
            id: `w${index}`,
            startPointId: points[startId].id,
            endPointId: points[endId].id,
            thickness: 100, // Default 100mm
            height: 2400, // Default 2400mm
          });
        }
      });

      // Store scanned walls for 2D overlay
      setScannedWalls({ points, walls });


      alert(`${walls.length}개의 벽이 감지되었습니다! 2D 뷰에서 확인하세요.`);
    } catch (error) {
      console.error('Scan error:', error);
      alert('스캐닝 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={styles.editorContainer}>
      {/* Header */}
      <header className={styles.header} style={{ '--theme-color': themeColor } as React.CSSProperties}>
        <div className={styles.headerLeft}>
          <div className={styles.logoWrapper}>
            <img src="/images/archiple_logo.png" alt="Archiple Studio" className={styles.headerLogo} />
          </div>
        </div>
        <div className={styles.headerCenter}>
          {/* Top Toolbar */}
          <div className={styles.newToolbar}>
            {/* File Group with Dropdown */}
            <div className={styles.toolbarDropdown} ref={fileMenuRef}>
              <button
                className={`${styles.toolbarBtn} ${styles.toolbarBtnWithArrow} ${fileMenuOpen ? styles.active : ''}`}
                onClick={() => setFileMenuOpen(!fileMenuOpen)}
              >
                <div className={styles.toolbarIconWrapper}>
                  <MdInsertDriveFile />
                </div>
                <FaCaretDown className={styles.toolbarDropdownArrowIcon} />
              </button>
              {fileMenuOpen && (
                <div className={styles.toolbarDropdownMenu}>
                  <button className={styles.dropdownMenuItem} onClick={() => { setFileMenuOpen(false); }}>
                    <span>New</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setFileMenuOpen(false); }}>
                    <span>Save</span>
                    <span className={styles.dropdownShortcut}>⌘S</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setFileMenuOpen(false); }}>
                    <span className={styles.dropdownItemWithDot}>
                      Save as
                      <span className={styles.unsavedDot}></span>
                    </span>
                    <span className={styles.dropdownShortcut}>⇧⌘S</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setFileMenuOpen(false); }}>
                    <span>Restore historical versions</span>
                  </button>
                </div>
              )}
            </div>

            <div className={styles.toolbarSeparator} />

            {/* Save Group */}
            <button className={styles.toolbarBtn}>
              <div className={styles.toolbarIconWrapper}>
                <MdSave />
              </div>
              <div className={styles.toolbarTextRow}>
                <span className={styles.toolbarText}>Save</span>
              </div>
            </button>

            <div className={styles.toolbarSeparator} />

            {/* Undo/Redo Group */}
            <button className={styles.toolbarBtn}>
              <div className={styles.toolbarIconWrapper}>
                <MdUndo />
              </div>
              <div className={styles.toolbarTextRow}>
                <span className={styles.toolbarText}>Undo</span>
              </div>
            </button>
            <button className={`${styles.toolbarBtn} ${styles.disabled}`}>
              <div className={styles.toolbarIconWrapper}>
                <MdRedo />
              </div>
              <div className={styles.toolbarTextRow}>
                <span className={styles.toolbarText}>Redo</span>
              </div>
            </button>

            <div className={styles.toolbarSeparator} />

            {/* Clear Group with Dropdown */}
            <div className={styles.toolbarDropdown} ref={clearMenuRef}>
              <button
                className={`${styles.toolbarBtn} ${styles.toolbarBtnWithArrow} ${clearMenuOpen ? styles.active : ''}`}
                onClick={() => setClearMenuOpen(!clearMenuOpen)}
              >
                <div className={styles.toolbarIconWrapper}>
                  <FaEraser />
                </div>
                <FaCaretDown className={styles.toolbarDropdownArrowIcon} />
              </button>
              {clearMenuOpen && (
                <div className={styles.toolbarDropdownMenu}>
                  <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); }}>
                    <span>All</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); }}>
                    <span>Decoration</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); }}>
                    <span>Furniture</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); }}>
                    <span>Parametric ceiling</span>
                  </button>
                  <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); }}>
                    <span>Finishes</span>
                  </button>
                  <div className={styles.dropdownDivider} />
                  <div
                    className={styles.dropdownMenuItemWithSubmenu}
                    onMouseEnter={() => setClearSubmenuOpen(true)}
                    onMouseLeave={() => setClearSubmenuOpen(false)}
                  >
                    <button className={styles.dropdownMenuItem}>
                      <span>Custom furniture</span>
                      <span className={styles.submenuArrow}>›</span>
                    </button>
                    {clearSubmenuOpen && (
                      <div className={styles.dropdownSubmenu}>
                        <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); setClearSubmenuOpen(false); }}>
                          <span>Kitchen & Bath</span>
                        </button>
                        <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); setClearSubmenuOpen(false); }}>
                          <span>Kitchen & BathDécor</span>
                        </button>
                        <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); setClearSubmenuOpen(false); }}>
                          <span>Closet</span>
                        </button>
                        <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); setClearSubmenuOpen(false); }}>
                          <span>ClosetDécor</span>
                        </button>
                        <button className={styles.dropdownMenuItem} onClick={() => { setClearMenuOpen(false); setClearSubmenuOpen(false); }}>
                          <span>Doors & Windows</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.toolbarSeparator} />

            {/* Toolkit Group with Dropdown */}
            <div className={styles.toolbarDropdown} ref={toolkitMenuRef}>
              <button
                className={`${styles.toolbarBtn} ${styles.toolbarBtnWithArrow} ${toolkitMenuOpen ? styles.active : ''}`}
                onClick={() => setToolkitMenuOpen(!toolkitMenuOpen)}
              >
                <div className={styles.toolbarIconWrapper}>
                  <MdBuild />
                </div>
                <FaCaretDown className={styles.toolbarDropdownArrowIcon} />
              </button>
              {toolkitMenuOpen && (
                <div className={`${styles.toolbarDropdownMenu} ${styles.toolkitMenu}`}>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setToolkitMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <FaPaintBrush className={styles.dropdownMenuIcon} />
                      <span>Material brush</span>
                      <MdInfoOutline className={styles.dropdownInfoIcon} />
                    </span>
                    <span className={styles.dropdownShortcut}>M</span>
                  </button>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setToolkitMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <TbRulerMeasure className={styles.dropdownMenuIcon} />
                      <span>Measure</span>
                    </span>
                    <span className={styles.dropdownShortcut}>Z</span>
                  </button>
                  <div
                    className={styles.dropdownMenuItemWithSubmenu}
                    onMouseEnter={() => setToolkitSubmenuOpen('array')}
                    onMouseLeave={() => setToolkitSubmenuOpen(null)}
                  >
                    <button className={styles.dropdownMenuItemWithIcon}>
                      <span className={styles.dropdownMenuItemLeft}>
                        <BsGrid3X3Gap className={styles.dropdownMenuIcon} />
                        <span>Array</span>
                      </span>
                      <span className={styles.submenuArrow}>›</span>
                    </button>
                    {toolkitSubmenuOpen === 'array' && (
                      <div className={styles.dropdownSubmenu}>
                        <button className={styles.dropdownMenuItem} onClick={() => { setToolkitMenuOpen(false); setToolkitSubmenuOpen(null); }}>
                          <span>Linear Array</span>
                        </button>
                        <button className={styles.dropdownMenuItem} onClick={() => { setToolkitMenuOpen(false); setToolkitSubmenuOpen(null); }}>
                          <span>Radial Array</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.dropdownDivider} />
                  <div className={styles.dropdownSectionHeader}>Type</div>
                  <div
                    className={styles.dropdownMenuItemWithSubmenu}
                    onMouseEnter={() => setToolkitSubmenuOpen('flip')}
                    onMouseLeave={() => setToolkitSubmenuOpen(null)}
                  >
                    <button className={styles.dropdownMenuItemWithIcon}>
                      <span className={styles.dropdownMenuItemLeft}>
                        <TbFlipVertical className={styles.dropdownMenuIcon} />
                        <span>Flip</span>
                        <MdInfoOutline className={styles.dropdownInfoIcon} />
                      </span>
                      <span className={styles.submenuArrow}>›</span>
                    </button>
                    {toolkitSubmenuOpen === 'flip' && (
                      <div className={styles.dropdownSubmenu}>
                        <button className={styles.dropdownMenuItem} onClick={() => { setToolkitMenuOpen(false); setToolkitSubmenuOpen(null); }}>
                          <span>Flip Horizontal</span>
                        </button>
                        <button className={styles.dropdownMenuItem} onClick={() => { setToolkitMenuOpen(false); setToolkitSubmenuOpen(null); }}>
                          <span>Flip Vertical</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setToolkitMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <MdOutlineDevices className={styles.dropdownMenuIcon} />
                      <span>Household detection tools</span>
                      <MdInfoOutline className={styles.dropdownInfoIcon} />
                    </span>
                  </button>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setToolkitMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <MdOutlineWarning className={styles.dropdownMenuIcon} />
                      <span>Check hardware abnormalities</span>
                      <MdInfoOutline className={styles.dropdownInfoIcon} />
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className={styles.toolbarSeparator} />

            {/* View Modes Group */}
            <button className={styles.toolbarBtn}>
              <div className={styles.toolbarIconWrapper}>
                <MdGridView />
              </div>
              <div className={styles.toolbarTextRow}>
                <span className={styles.toolbarText}>Furniture Plan</span>
              </div>
            </button>

            {/* Images/Videos Group with Dropdown */}
            <div className={styles.toolbarDropdown} ref={imagesMenuRef}>
              <button
                className={`${styles.toolbarBtn} ${styles.toolbarBtnWithArrow} ${imagesMenuOpen ? styles.active : ''}`}
                onClick={() => setImagesMenuOpen(!imagesMenuOpen)}
              >
                <div className={styles.toolbarIconWrapper}>
                  <MdCameraAlt />
                </div>
                <FaCaretDown className={styles.toolbarDropdownArrowIcon} />
              </button>
              {imagesMenuOpen && (
                <div className={styles.toolbarDropdownMenu}>
                  <div className={styles.dropdownSectionHeader}>Professional visual</div>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setImagesMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <MdPhotoLibrary className={styles.dropdownMenuIcon} />
                      <span>Perspective view</span>
                    </span>
                  </button>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setImagesMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <Md360 className={styles.dropdownMenuIcon} />
                      <span>360° walkthrough</span>
                    </span>
                  </button>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setImagesMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <TbViewportWide className={styles.dropdownMenuIcon} />
                      <span>Top view</span>
                    </span>
                  </button>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setImagesMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <MdVideocam className={styles.dropdownMenuIcon} />
                      <span>Video</span>
                    </span>
                    <span className={styles.dropdownBetaBadge}>Beta</span>
                  </button>
                  <div className={styles.dropdownDivider} />
                  <div className={styles.dropdownSectionHeader}>Live visual</div>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setImagesMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <MdOutlineAutorenew className={styles.dropdownMenuIcon} />
                      <span>Real-time rendering</span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            <button className={styles.toolbarBtn}>
              <div className={styles.toolbarIconWrapper}>
                <MdPhotoLibrary />
              </div>
              <div className={styles.toolbarTextRow}>
                <span className={styles.toolbarText}>Gallery</span>
              </div>
            </button>

            <div className={styles.toolbarSeparator} />

            {/* Drawings Group with Dropdown */}
            <div className={styles.toolbarDropdown} ref={drawingsMenuRef}>
              <button
                className={`${styles.toolbarBtn} ${styles.toolbarBtnWithArrow} ${drawingsMenuOpen ? styles.active : ''}`}
                onClick={() => setDrawingsMenuOpen(!drawingsMenuOpen)}
              >
                <div className={styles.toolbarIconWrapper}>
                  <MdDescription />
                </div>
                <FaCaretDown className={styles.toolbarDropdownArrowIcon} />
              </button>
              {drawingsMenuOpen && (
                <div className={styles.toolbarDropdownMenu}>
                  <div className={styles.dropdownSectionHeader}>Drawings</div>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setDrawingsMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <HiOutlineDocumentDuplicate className={styles.dropdownMenuIcon} />
                      <span>Construction drawings</span>
                    </span>
                  </button>
                  <button className={styles.dropdownMenuItemWithIcon} onClick={() => { setDrawingsMenuOpen(false); }}>
                    <span className={styles.dropdownMenuItemLeft}>
                      <MdOutlineArticle className={styles.dropdownMenuIcon} />
                      <span>Floor plan drawings</span>
                    </span>
                    <span className={styles.dropdownNewBadge}>New</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.headerRight}>
          <button
            className={`${styles.playBtn} ${playMode ? styles.playBtnActive : ''}`}
            onClick={() => {
              if (!playMode && viewMode === '2D') {
                setViewMode('3D');
              }
              // STOP 누르면 3D 모드로 돌아감
              if (playMode) {
                setViewMode('3D');
              }
              setPlayMode(!playMode);
            }}
          >
            <BsPersonWalking style={{ marginRight: '6px', fontSize: '18px', verticalAlign: 'middle' }} />
            <span style={{ verticalAlign: 'middle' }}>{playMode ? 'STOP' : 'PLAY'}</span>
          </button>

          {/* Help Button */}
          <div className={styles.helpMenuContainer} ref={helpMenuRef}>
            <button
              className={styles.headerIconBtn}
              title="Help"
              onClick={() => setHelpMenuOpen(!helpMenuOpen)}
            >
              <MdHelpOutline size={22} />
            </button>
            {helpMenuOpen && (
              <div className={styles.helpMenu}>
                <button className={styles.helpMenuItem} onClick={() => setHelpMenuOpen(false)}>
                  Free learning pack
                </button>
                <button className={styles.helpMenuItem} onClick={() => setHelpMenuOpen(false)}>
                  Join group
                </button>
                <div className={styles.helpMenuDivider} />
                <button className={styles.helpMenuItem} onClick={() => setHelpMenuOpen(false)}>
                  Tutorials
                </button>
                <div className={styles.helpMenuDivider} />
                <button className={styles.helpMenuItem} onClick={() => setHelpMenuOpen(false)}>
                  Feature update
                </button>
                <div className={styles.helpMenuDivider} />
                <button className={styles.helpMenuItem} onClick={() => setHelpMenuOpen(false)}>
                  Help center
                </button>
              </div>
            )}
          </div>

          {/* User Profile Button */}
          <button className={styles.headerIconBtn} title="Profile">
            <FiUser size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className={styles.mainContent} style={playMode ? { paddingLeft: 0 } : {}}>
        {/* Left Green Sidebar */}
        {
  !playMode && (
    <div className={styles.leftSidebar}>
      <div className={styles.sidebarButtons}>
        {/* Create Room */}
        <button
          className={`${styles.sidebarBtn} ${leftPanelOpen ? styles.active : ''}`}
          onClick={() => {
            setLeftPanelOpen(!leftPanelOpen);
            if (!leftPanelOpen) {
              setAdvancedToolPanelOpen(false);
              setLibraryPanelOpen(false);
            }
          }}
          title="Create Room"
        >
          <div className={styles.icon}>
            <LiaPencilRulerSolid size={24} />
          </div>
        </button>

        {/* Asset Library */}
        <button
          className={`${styles.sidebarBtn} ${libraryPanelOpen ? styles.active : ''}`}
          onClick={() => {
            setLibraryPanelOpen(!libraryPanelOpen);
            if (!libraryPanelOpen) {
              setLeftPanelOpen(false);
              setAdvancedToolPanelOpen(false);
            }
          }}
          title="Asset Library"
        >
          <div className={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        </button>

        {/* Material */}
        <button className={styles.sidebarBtn} title="Material">
          <div className={styles.icon}>
            <HiOutlineColorSwatch size={24} />
          </div>
        </button>

        {/* Lighting */}
        <button
          className={styles.sidebarBtn}
          onClick={() => setLightPanelOpen(!lightPanelOpen)}
          title="Lighting"
        >
          <div className={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 21h6M12 3a6 6 0 0 0-6 6c0 2.22 1.21 4.16 3 5.19V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.81c1.79-1.03 3-2.97 3-5.19a6 6 0 0 0-6-6z" />
            </svg>
          </div>
        </button>

        {/* Kitchen & Cabinet */}
        <button
          className={`${styles.sidebarBtn} ${advancedToolPanelOpen ? styles.active : ''}`}
          onClick={() => {
            setAdvancedToolPanelOpen(!advancedToolPanelOpen);
            if (!advancedToolPanelOpen) setLeftPanelOpen(false);
          }}
          title="Advanced Tool"
        >
          <div className={styles.icon}>
            <BiCabinet size={24} />
          </div>
        </button>

        {/* A.I Layout */}
        <button className={styles.sidebarBtn} title="A.I Layout">
          <div className={styles.icon}>
            <MdAutoAwesome size={24} />
          </div>
        </button>

        {/* My Page */}
        <button className={styles.sidebarBtn} title="My Page">
          <div className={styles.icon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
          </div>
        </button>
      </div>

      <div className={styles.sidebarBottom}>
        {/* Archiple World - Planet Icon */}
        <button className={styles.sidebarBtn} onClick={() => navigate('/world')} title="Archiple World">
          <div className={styles.icon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <ellipse cx="12" cy="12" rx="10" ry="4" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
        </button>
        {/* Settings */}
        <button className={styles.sidebarBtn} onClick={() => setThemeSettingsOpen(!themeSettingsOpen)} title="설정">
          <div className={styles.icon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </div>
        </button>
        {/* Exit */}
        <button className={styles.sidebarBtn} onClick={() => navigate('/')} title="나가기">
          <div className={styles.icon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  )
}

{/* Library Panel */}
{!playMode && libraryPanelOpen && (
  <LibraryPanel onClose={() => setLibraryPanelOpen(false)} />
)}

{/* Left Tools Panel */ }
{
  !playMode && !advancedToolPanelOpen && !libraryPanelOpen && (
    leftPanelOpen ? (
      <div className={styles.leftPanel}>
        <div className={styles.panelHeader}>
          <h3>Create Room</h3>
          <div className={styles.panelHeaderActions}>
            <button
              onClick={() => setFloorplanSearchModalOpen(true)}
              className={styles.panelHeaderIconBtn}
              title="Search Floor Plan"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
            </button>
            <button onClick={() => setLeftPanelOpen(false)} className={styles.toggleBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Import Floor Plan Section */}
        <div className={styles.importFloorPlanSection}>
          <h4 className={styles.sectionTitle}>Import Floor Plan</h4>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <input
            ref={cadFileInputRef}
            type="file"
            accept=".dxf,.dwg"
            onChange={handleCadUpload}
            style={{ display: 'none' }}
          />
          <input
            ref={glbFileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleGlbUpload}
            style={{ display: 'none' }}
          />
          <div className={styles.importOptionsGrid}>
            <button className={styles.importCard} onClick={() => glbFileInputRef.current?.click()}>
              <div className={styles.importIconWrapper}>
                <svg width="52" height="52" viewBox="0 0 56 56" fill="none">
                  {/* Document base */}
                  <path d="M10 6C10 4.89543 10.8954 4 12 4H30L42 16V50C42 51.1046 41.1046 52 40 52H12C10.8954 52 10 51.1046 10 50V6Z" fill="var(--icon-bg)" stroke="var(--icon-stroke)" strokeWidth="1.5"/>
                  {/* Document fold */}
                  <path d="M30 4V14C30 15.1046 30.8954 16 32 16H42" fill="var(--icon-light)"/>
                  <path d="M30 4V14C30 15.1046 30.8954 16 32 16H42" stroke="var(--icon-stroke)" strokeWidth="1.5"/>
                  {/* 3D Cube - floating isometric */}
                  <g transform="translate(24, 22)">
                    {/* Shadow */}
                    <ellipse cx="10" cy="26" rx="12" ry="4" fill="var(--icon-stroke)" opacity="0.2"/>
                    {/* Cube top face */}
                    <path d="M10 0L20 6L10 12L0 6L10 0Z" fill="var(--icon-light)" stroke="var(--icon-stroke)" strokeWidth="0.8"/>
                    {/* Cube left face */}
                    <path d="M0 6L10 12V22L0 16V6Z" fill="var(--icon-secondary)" stroke="var(--icon-stroke)" strokeWidth="0.8"/>
                    {/* Cube right face */}
                    <path d="M20 6L10 12V22L20 16V6Z" fill="var(--icon-primary)" stroke="var(--icon-stroke)" strokeWidth="0.8"/>
                    {/* Highlight on top */}
                    <path d="M10 2L17 5.5L10 9L3 5.5L10 2Z" fill="white" opacity="0.3"/>
                  </g>
                  {/* GLB badge */}
                  <rect x="4" y="40" width="22" height="12" rx="2" fill="var(--icon-primary)"/>
                  <text x="15" y="49" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="system-ui">GLB</text>
                </svg>
              </div>
              <span className={styles.importLabel}>Import 3D</span>
            </button>
            <button className={styles.importCard} onClick={() => (cadFileInputRef as React.RefObject<HTMLInputElement>).current?.click()}>
              <div className={styles.importIconWrapper}>
                <svg width="52" height="52" viewBox="0 0 56 56" fill="none">
                  {/* Document shape with fold */}
                  <path d="M12 6C12 4.89543 12.8954 4 14 4H32L44 16V50C44 51.1046 43.1046 52 42 52H14C12.8954 52 12 51.1046 12 50V6Z" fill="var(--icon-bg)" stroke="var(--icon-stroke)" strokeWidth="1.5"/>
                  {/* Fold corner */}
                  <path d="M32 4V14C32 15.1046 32.8954 16 34 16H44" fill="var(--icon-light)"/>
                  <path d="M32 4V14C32 15.1046 32.8954 16 34 16H44" stroke="var(--icon-stroke)" strokeWidth="1.5"/>
                  {/* CAD badge */}
                  <rect x="16" y="28" width="24" height="16" rx="3" fill="var(--icon-primary)"/>
                  <text x="28" y="40" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="system-ui">CAD</text>
                </svg>
              </div>
              <span className={styles.importLabel}>Import CAD</span>
            </button>
            <button className={styles.importCard} onClick={() => fileInputRef.current?.click()}>
              <div className={styles.importIconWrapper}>
                <svg width="52" height="52" viewBox="0 0 56 56" fill="none">
                  {/* Image frame */}
                  <rect x="6" y="10" width="44" height="36" rx="4" fill="var(--icon-bg)" stroke="var(--icon-stroke)" strokeWidth="1.5"/>
                  {/* Sky area */}
                  <rect x="8" y="12" width="40" height="20" rx="2" fill="var(--icon-light)"/>
                  {/* Sun */}
                  <circle cx="38" cy="20" r="5" fill="white" fillOpacity="0.9"/>
                  {/* Mountains */}
                  <path d="M8 32L20 18L32 32H8Z" fill="var(--icon-primary)"/>
                  <path d="M24 32L36 20L48 32V44H8V32H24Z" fill="var(--icon-secondary)"/>
                  {/* Fold corner accent */}
                  <path d="M42 10L50 18V14C50 11.7909 48.2091 10 46 10H42Z" fill="var(--icon-light)" stroke="var(--icon-stroke)" strokeWidth="1"/>
                </svg>
              </div>
              <span className={styles.importLabel}>Import Image</span>
            </button>
          </div>
        </div>

        {/* Walls */}
        <div className={styles.toolSection}>
          <h4>Walls</h4>
          <div className={styles.toolGrid}>
            <button
              className={`${styles.toolBtn} ${activeTool === ToolType.WALL ? styles.toolBtnActive : ''}`}
              title="Draw Staight Walls"
              onClick={() => setActiveTool(ToolType.WALL)}
            >
              <img src="/icons/wall.svg" alt="Wall" width="32" height="32" />
              <span>Draw Staight Walls</span>
            </button>
            <button className={styles.toolBtn} title="Draw Arc Walls">
              <svg width="32" height="32" viewBox="0 0 48 48">
                <path d="M 8 28 Q 24 8, 40 28" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Draw Arc Walls</span>
            </button>
            <button
              className={`${styles.toolBtn} ${activeTool === ToolType.RECTANGLE ? styles.toolBtnActive : ''}`}
              title="Draw Rooms"
              onClick={() => setActiveTool(ToolType.RECTANGLE)}
            >
              <img src="/icons/room.svg" alt="Room" width="32" height="32" />
              <span>Draw Rooms</span>
            </button>
          </div>
        </div>

        {/* Door */}
        <div className={styles.toolSection}>
          <h4>Door</h4>
          <div className={styles.toolGrid}>
            <button
              className={`${styles.toolBtn} ${activeTool === ToolType.DOOR ? styles.toolBtnActive : ''}`}
              title="Place Door (900mm x 2100mm)"
              onClick={() => setActiveTool(ToolType.DOOR)}
            >
              <img src="/icons/singledoor.svg" alt="Single Door" width="32" height="32" />
              <span>Single Door</span>
            </button>
            <button className={styles.toolBtn}>
              <img src="/icons/doubledoor.svg" alt="Double Door" width="32" height="32" />
              <span>Double Door</span>
            </button>
            <button className={styles.toolBtn}>
              <img src="/icons/window.svg" alt="Sliding Door" width="32" height="32" />
              <span>Sliding Door</span>
            </button>
          </div>
        </div>

        {/* Window */}
        <div className={styles.toolSection}>
          <h4>Window</h4>
          <div className={styles.toolGrid}>
            <button
              className={`${styles.toolBtn} ${activeTool === ToolType.WINDOW ? styles.toolBtnActive : ''}`}
              title="Place Window (1200mm x 1200mm)"
              onClick={() => setActiveTool(ToolType.WINDOW)}
            >
              <img src="/icons/slidingdoor.svg" alt="Single Window" width="32" height="32" />
              <span>Single Window</span>
            </button>
            <button className={styles.toolBtn}>
              <img src="/icons/dualwindow.svg" alt="Dual Window" width="32" height="32" />
              <span>Dual Window</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <rect x="8" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
                <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
                <rect x="30" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Unequal Double Door</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <path d="M 12 24 L 18 18 L 30 18 L 36 24 L 30 30 L 18 30 Z" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Corner Bay Window</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <path d="M 14 24 L 20 20 L 28 20 L 34 24" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Corner Window</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <rect x="12" y="20" width="24" height="8" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Bay Window</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <path d="M 16 24 Q 24 16, 32 24" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Arc Window</span>
            </button>
          </div>
        </div>

        {/* Structure */}
        <div className={styles.toolSection}>
          <h4>Structure</h4>
          <div className={styles.toolGrid}>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <path d="M 16 12 L 16 36 M 32 12 L 32 36" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span>Door Opening</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <rect x="16" y="20" width="16" height="8" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Flue</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <rect x="12" y="20" width="24" height="3" fill="currentColor" />
              </svg>
              <span>Beam</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <rect x="16" y="16" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Square</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Circle</span>
            </button>
            <button className={styles.toolBtn}>
              <svg width="32" height="32" viewBox="0 0 48 48">
                <rect x="14" y="14" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" />
                <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>Frame</span>
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className={styles.leftPanelCollapsed} onClick={() => setLeftPanelOpen(true)} title="Expand Panel">
        <button className={styles.toggleBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </button>
      </div>
    )
  )
}

{/* Advanced Tool Panel */}
{
  !playMode && advancedToolPanelOpen && (
    <div className={styles.advancedToolPanel}>
      <div className={styles.panelHeader}>
        <h3>Advanced tool</h3>
        <div className={styles.panelHeaderActions}>
          <button onClick={() => setAdvancedToolPanelOpen(false)} className={styles.toggleBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
        </div>
      </div>
      <div className={styles.advancedToolGrid}>
        <div className={styles.advancedToolCard}>
          <div className={styles.advancedToolInfo}>
            <h4>Kitchen &<br/>Bath</h4>
            <span className={styles.shortcutBadge}>⌥4</span>
          </div>
          <img src="/images/custom/kitchen_bath.png" alt="Kitchen & Bath" className={styles.advancedToolImage} />
        </div>
        <div className={styles.advancedToolCard}>
          <div className={styles.advancedToolInfo}>
            <h4>Closet</h4>
            <span className={styles.shortcutBadge}>⌥5</span>
          </div>
          <img src="/images/custom/closet.png" alt="Closet" className={styles.advancedToolImage} />
        </div>
        <div className={styles.advancedToolCard}>
          <div className={styles.advancedToolInfo}>
            <h4>Doors &<br/>Windows</h4>
            <span className={styles.shortcutBadge}>⌥6</span>
          </div>
          <img src="/images/custom/doors_windows.png" alt="Doors & Windows" className={styles.advancedToolImage} />
        </div>
        <div
          className={styles.advancedToolCard}
          onClick={() => navigate('/custom-modeling')}
        >
          <div className={styles.advancedToolInfo}>
            <h4>Custom<br/>modeling</h4>
            <span className={styles.newBadge}>New</span>
          </div>
          <img src="/images/custom/custom modeling.png" alt="Custom modeling" className={styles.advancedToolImage} />
        </div>
      </div>
    </div>
  )
}

{/* Main Viewport */ }
<div className={styles.viewport}>
  {/* View Mode Toggle (Top Right) - Replaced by BottomControlBar */}
  {/* <div className={styles.viewModeToggle}>
            <button
              className={`${styles.viewModeBtn} ${viewMode === '2D' ? styles.viewModeBtnActive : ''}`}
              onClick={() => {
                setViewMode('2D');
                setPlayMode(false);
              }}
            >
              2D
            </button>
            <button
              className={`${styles.viewModeBtn} ${viewMode === '3D' ? styles.viewModeBtnActive : ''}`}
              onClick={() => {
                setViewMode('3D');
                setPlayMode(false);
              }}
            >
              3D
            </button>
          </div> */}

  <BottomControlBar
    ref={bottomControlBarRef}
    viewMode={viewMode}
    onViewModeChange={(mode) => {
      setViewMode(mode);
      if (mode === '2D') setPlayMode(false);
    }}
    view2DType={view2DType}
    onView2DTypeChange={setView2DType}
    zoom={viewMode === '2D' ? zoom2D : (120 - cameraFov) / 90}
    onZoomChange={(newZoom) => {
      if (viewMode === '2D') {
        // 2D zoom: directly set normalized zoom value
        setZoom2D(newZoom);
      } else {
        // 3D zoom: Convert zoom (0-1) back to FOV (30-120)
        const newFov = 120 - (newZoom * 90);
        setCameraFov(newFov);
        eventBus.emit(EditorEvents.CAMERA_FOV_CHANGED, { fov: newFov });
      }
    }}
    themeColor={themeColor}
    themeMode={themeMode}
    onSunSettingsClick={() => setSunPanelOpen(!sunPanelOpen)}
    sunPanelOpen={sunPanelOpen}
    onCameraSettingsClick={() => setCameraPanelOpen(!cameraPanelOpen)}
    cameraPanelOpen={cameraPanelOpen}
    displayStyle={displayStyle}
    onDisplayStyleChange={setDisplayStyle}
    wireframeMode={hiddenLineMode}
    onWireframeModeChange={setHiddenLineMode}
    qualityFirst={photoRealisticMode}
    onQualityFirstChange={setPhotoRealisticMode}
    view3DVisibility={view3DVisibility}
    onView3DVisibilityChange={setView3DVisibility}
    onElevationClick={() => setElevationModalOpen(true)}
  />

  {/* Overlay to close all panels when clicking background */}
  {(sunPanelOpen || cameraPanelOpen) && (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 98,
        background: 'transparent',
      }}
      onClick={() => {
        setSunPanelOpen(false);
        setCameraPanelOpen(false);
        bottomControlBarRef.current?.closeAllModals();
      }}
    />
  )}

  {/* Sun Settings Panel - Bottom */}
  {viewMode === '3D' && sunPanelOpen && (
    <div
      className={styles.sunPanelBottom}
      data-theme={themeMode}
      style={{ '--theme-color': themeColor } as React.CSSProperties}
    >
      <div className={styles.sunPanelHeader}>
        <span>Sun Settings</span>
        <button onClick={() => setSunPanelOpen(false)} className={styles.sunPanelCloseBtn}>×</button>
      </div>
      <div className={styles.sunPanelBody}>
        {/* Month */}
        <div className={styles.sunControlGroup}>
          <label>월 (Month)</label>
          <div className={styles.sunControlInput}>
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={sunSettings.month}
              onChange={(e) => setSunSettings({ ...sunSettings, month: parseInt(e.target.value) })}
              className={styles.sunRangeSlider}
            />
            <span className={styles.sunValueDisplay}>{sunSettings.month}월</span>
          </div>
        </div>

        {/* Hour */}
        <div className={styles.sunControlGroup}>
          <label>시간 (Time)</label>
          <div className={styles.sunControlInput}>
            <input
              type="range"
              min="5"
              max="20"
              step="0.5"
              value={sunSettings.hour}
              onChange={(e) => setSunSettings({ ...sunSettings, hour: parseFloat(e.target.value) })}
              className={styles.sunRangeSlider}
            />
            <span className={styles.sunValueDisplay}>
              {Math.floor(sunSettings.hour)}:{String(Math.round((sunSettings.hour % 1) * 60)).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Intensity */}
        <div className={styles.sunControlGroup}>
          <label>강도 (Intensity)</label>
          <div className={styles.sunControlInput}>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={sunSettings.intensity}
              onChange={(e) => setSunSettings({ ...sunSettings, intensity: parseFloat(e.target.value) })}
              className={styles.sunRangeSlider}
            />
            <span className={styles.sunValueDisplay}>{sunSettings.intensity.toFixed(1)}</span>
          </div>
        </div>

        {/* Azimuth */}
        <div className={styles.sunControlGroup}>
          <label>방위각 (Azimuth)</label>
          <div className={styles.sunControlInput}>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={sunSettings.azimuth}
              onChange={(e) => setSunSettings({ ...sunSettings, azimuth: parseInt(e.target.value) })}
              className={styles.sunRangeSlider}
            />
            <span className={styles.sunValueDisplay}>{sunSettings.azimuth}°</span>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* 2D View - Main Viewport */}
  <div
    onMouseDown={() => bottomControlBarRef.current?.closeAllModals()}
    style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    visibility: playMode ? 'hidden' : (viewMode === '2D' ? 'visible' : 'hidden'),
    pointerEvents: playMode ? 'none' : (viewMode === '2D' ? 'auto' : 'none')
  }}>
    <FloorplanCanvas
      activeTool={activeTool}
      onDataChange={setFloorplanData}
      backgroundImage={showBackgroundImage ? backgroundImage : null}
      renderStyle={hiddenLineMode ? 'wireframe' : renderStyle}
      showGrid={showGrid}
      imageScale={imageScale}
      imageOpacity={imageOpacity}
      onDimensionClick={handleDimensionClick}
      wallHeight={wallHeight}
      wallThickness={wallThickness}
      rulerVisible={rulerVisible}
      rulerStart={rulerStart}
      rulerEnd={rulerEnd}
      onRulerDragStart={handleRulerDragStart}
      onRulerDrag={handleRulerDrag}
      onRulerDragEnd={handleRulerDragEnd}
      onRulerLabelClick={handleRulerLabelClick}
      draggingRulerPoint={draggingRulerPoint}
      scannedWalls={scannedWalls}
      onRoomSelect={setSelectedRoom}
      selectedRoomId={selectedRoom?.id ?? null}
      onCanvasReady={setFloorplanCanvas}
      view2DType={view2DType}
      onCeilingSelect={setSelectedCeiling2D}
      // 2D Furniture props
      furniture2D={furniture2D}
      selectedFurnitureId={selectedFurniture2D?.furniture.id ?? null}
      onFurnitureSelect={handleFurniture2DSelect}
      onFurnitureMove={handleFurniture2DMove}
      onFurnitureRotate={handleFurniture2DRotate}
      onFurnitureResize={handleFurniture2DResize}
    />

    {/* 2D Compass */}
    <Compass2D
      rotation={0}
      themeColor={themeColor}
    />

    {/* 2D Ceiling Editor Toolbar - show when ceiling is selected in ceiling view */}
    {selectedCeiling2D && view2DType === 'ceiling' && (
      <div
        style={{
          position: 'absolute',
          left: selectedCeiling2D.screenPosition.x,
          top: selectedCeiling2D.screenPosition.y - 60,
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          pointerEvents: 'auto',
          zIndex: 100,
        }}
      >
        {/* Ceiling Info */}
        <div
          style={{
            background: '#333',
            color: 'white',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '13px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <div style={{ fontWeight: 600 }}>{selectedCeiling2D.name || 'Ceiling'}</div>
          <div style={{ fontSize: '12px', color: '#aaa' }}>{selectedCeiling2D.area.toFixed(2)} m²</div>
        </div>
        {/* Ceiling Editor Button */}
        <button
          style={{
            background: themeColor,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
          onClick={() => {
            console.log('Open ceiling editor for:', selectedCeiling2D.id);
            // TODO: Open ceiling editor modal/panel
          }}
        >
          Ceiling Editor
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
          </svg>
        </button>
        {/* Toolbar Icons */}
        <div
          style={{
            background: '#333',
            borderRadius: '6px',
            padding: '6px 8px',
            display: 'flex',
            gap: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {/* Close button */}
          <button
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              color: 'white',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
            title="Close"
            onClick={() => setSelectedCeiling2D(null)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
    )}

    {/* Elevation Viewer - show when wall is selected for elevation */}
    {view2DType === 'elevation' && selectedElevationWall && (
      <ElevationViewer
        wall={selectedElevationWall.wall}
        direction={selectedElevationWall.direction}
        wallHeight={wallHeight}
        floorplanData={floorplanData}
        onClose={() => {
          setSelectedElevationWall(null);
          setView2DType('floor');
        }}
        themeColor={themeColor}
        themeMode={themeMode}
      />
    )}
  </div>

  {/* 2D View - Preview in right panel - DISABLED due to React DOM conflicts */}
  {/* {viewMode === '3D' && (
            <div id="preview-2d-container" style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              visibility: 'hidden',
              pointerEvents: 'none'
            }}>
              <FloorplanCanvas
                key="preview-2d-canvas"
                activeTool={ToolType.SELECT}
                onDataChange={() => {}}
                backgroundImage={null}
                renderStyle={renderStyle}
                showGrid={showGrid}
                imageScale={imageScale}
                imageOpacity={imageOpacity}
              />
            </div>
          )} */}

  {/* 3D View - Main Viewport */}
  {/* Note: Use zIndex instead of visibility:hidden so Babylon engine keeps rendering for Mini3DPreview */}
  <div
    onMouseDown={() => bottomControlBarRef.current?.closeAllModals()}
    style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: playMode || viewMode === '3D' ? 1 : -1,
    opacity: playMode || viewMode === '3D' ? 1 : 0,
    pointerEvents: playMode || viewMode === '3D' ? 'auto' : 'none',
    cursor: lightPlacementMode ? 'crosshair' : 'default'
  }}>
    <Babylon3DCanvas
      ref={babylon3DCanvasRef}
      floorplanData={floorplanData}
      visible={true}  /* Always render for Mini3DPreview support */
      sunSettings={{
        ...sunSettings,
        altitude: calculateSunAltitude(sunSettings.month, sunSettings.hour)
      }}
      playMode={playMode}
      showCharacter={showCharacter}
      glbModelFile={glbModelFile}
      photoRealisticMode={photoRealisticMode}
      renderSettings={renderSettings}
      lights={lights}
      lightPlacementMode={lightPlacementMode}
      selectedLightType={selectedLightType}
      onLightPlaced={handleLightPlaced}
      onLightMoved={handleLightMoved}
      displayStyle={displayStyle}
      showGrid={showGrid}
      showWalls={view3DVisibility.wall}
      showEdges={hiddenLineMode}
      viewMode={gameViewMode}
      characterModel="/animation/moving/female_walking.glb"
      is2DMode={viewMode === '2D'}
      onFurnitureSelect={handleFurnitureSelect}
    />

    {/* 3D Axis Gizmo (isolated component to prevent parent re-renders) */}
    <CameraGizmoWrapper visible={!playMode} size={120} />

    {/* View Mode Toggle - Only visible in Play Mode */}
    {playMode && (
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(20, 20, 20, 0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '6px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        gap: '4px',
      }}>
        <button
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '10px 16px',
            background: gameViewMode === 'first-person' ? '#3dbc58' : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: gameViewMode === 'first-person' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: '70px',
            boxShadow: gameViewMode === 'first-person' ? '0 4px 12px rgba(63, 174, 122, 0.4)' : 'none',
          }}
          onClick={() => setGameViewMode('first-person')}
          title="1인칭 뷰"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          </svg>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>1인칭</span>
        </button>
        <button
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '10px 16px',
            background: gameViewMode === 'third-person' ? '#3dbc58' : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: gameViewMode === 'third-person' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: '70px',
            boxShadow: gameViewMode === 'third-person' ? '0 4px 12px rgba(63, 174, 122, 0.4)' : 'none',
          }}
          onClick={() => setGameViewMode('third-person')}
          title="3인칭 뷰"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
          </svg>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>3인칭</span>
        </button>
        <button
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            padding: '10px 16px',
            background: gameViewMode === 'iso' ? '#3dbc58' : 'transparent',
            border: 'none',
            borderRadius: '8px',
            color: gameViewMode === 'iso' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: '70px',
            boxShadow: gameViewMode === 'iso' ? '0 4px 12px rgba(63, 174, 122, 0.4)' : 'none',
          }}
          onClick={() => setGameViewMode('iso')}
          title="ISO 뷰"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ISO</span>
        </button>
      </div>
    )}


    {/* Light Placement Guide Overlay */}
    {lightPlacementMode && viewMode === '3D' && (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        padding: '32px 48px',
        borderRadius: '12px',
        fontSize: '24px',
        fontWeight: '600',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 1000,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}>
        <div style={{ marginBottom: '12px' }}>
          {selectedLightType === 'point' ? '포인트 라이트' :
            selectedLightType === 'spot' ? '스포트 라이트' :
              '방향성 라이트'} 배치 모드
        </div>
        <div style={{ fontSize: '18px', fontWeight: '400', color: '#ffc107' }}>
          3D 뷰를 클릭해서 조명을 배치하세요
        </div>
        <div style={{ fontSize: '14px', fontWeight: '400', color: '#aaa', marginTop: '8px' }}>
          여러 개 배치 가능 | 종료: 빨간 버튼 클릭
        </div>
      </div>
    )}
  </div>

  {/* 3D View - Preview in right panel (always rendered) */}
  <div id="preview-3d-container" style={{
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    visibility: 'hidden', // Hidden in main viewport, shown in preview
    pointerEvents: 'none'
  }}>
    <Babylon3DCanvas
      floorplanData={floorplanData}
      visible={true}
      sunSettings={{
        ...sunSettings,
        altitude: calculateSunAltitude(sunSettings.month, sunSettings.hour)
      }}
      playMode={false}
      showCharacter={false}
      glbModelFile={null}
      photoRealisticMode={false}
      renderSettings={renderSettings}
      lights={lights}
      lightPlacementMode={false}
      displayStyle={displayStyle}
      showGrid={false}
      showEdges={hiddenLineMode}
    />
  </div>

  {/* Dimension Edit Modal */}
  {editingWallId && viewMode === '2D' && !playMode && (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'white',
      padding: '24px',
      borderRadius: '8px',
      border: '2px solid #3fae7a',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      zIndex: 2000,
      minWidth: '320px',
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
        벽 치수 수정
      </h3>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
          치수 (mm):
        </label>
        <input
          type="number"
          value={dimensionInput}
          onChange={(e) => setDimensionInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleDimensionSubmit();
            if (e.key === 'Escape') {
              setEditingWallId(null);
              setDimensionInput('');
            }
          }}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '14px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => {
            setEditingWallId(null);
            setDimensionInput('');
          }}
          style={{
            padding: '8px 16px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          onClick={handleDimensionSubmit}
          style={{
            padding: '8px 20px',
            background: 'var(--theme-color)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          확인
        </button>
      </div>
    </div>
  )}

  {/* Ruler Label Edit Overlay */}
  {editingRulerLabel && viewMode === '2D' && !playMode && (
    <div style={{
      position: 'absolute',
      left: `${editingRulerLabel.x}px`,
      top: `${editingRulerLabel.y + 40}px`,
      background: 'white',
      padding: '12px',
      borderRadius: '6px',
      border: '2px solid #FF0000',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
      zIndex: 2000,
      minWidth: '200px',
    }}>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
        실제 거리 입력:
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="number"
          value={rulerDistance}
          onChange={(e) => setRulerDistance(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRulerLabelSubmit();
            if (e.key === 'Escape') setEditingRulerLabel(null);
          }}
          autoFocus
          style={{
            flex: 1,
            padding: '6px 8px',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '13px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        />
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>mm</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={() => setEditingRulerLabel(null)}
          style={{
            flex: 1,
            padding: '6px 12px',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          취소
        </button>
        <button
          onClick={handleRulerLabelSubmit}
          style={{
            flex: 1,
            padding: '6px 12px',
            background: '#FF0000',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          확인
        </button>
      </div>
    </div>
  )}

  {/* Image Controls Overlay */}
  {backgroundImage && viewMode === '2D' && !playMode && (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'white',
      padding: '16px 24px',
      borderRadius: '4px',
      border: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      zIndex: 1000,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      minWidth: '400px',
    }}>
      {/* Ruler Guide Instructions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
          🎯 줄자 가이드를 드래그해서 이미지의 알려진 치수에 맞추세요
        </span>
      </div>

      {/* Distance Input (always visible when ruler is present) */}
      {rulerVisible && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', minWidth: '80px' }}>
            실제 거리:
          </label>
          <input
            type="number"
            value={rulerDistance}
            onChange={(e) => setRulerDistance(e.target.value)}
            placeholder="예: 3550"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>mm</span>
          <button
            onClick={handleRulerSubmit}
            style={{
              padding: '8px 20px',
              background: 'var(--theme-color)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            스케일 적용
          </button>
        </div>
      )}

      {/* Image Visibility Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', minWidth: '80px' }}>
          이미지 표시:
        </label>
        <button
          onClick={() => setShowBackgroundImage(!showBackgroundImage)}
          style={{
            padding: '8px 16px',
            background: showBackgroundImage ? '#3fae7a' : '#f5f5f5',
            color: showBackgroundImage ? 'white' : '#666',
            border: showBackgroundImage ? 'none' : '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {showBackgroundImage ? '표시됨' : '숨김'}
        </button>
      </div>

      {/* Opacity Control */}
      {showBackgroundImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', minWidth: '50px' }}>
            투명도:
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={imageOpacity}
            onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500', minWidth: '40px' }}>
            {Math.round(imageOpacity * 100)}%
          </span>
        </div>
      )}

      {/* Scan Button */}
      <button
        onClick={handleScan}
        style={{
          padding: '10px 20px',
          background: 'var(--theme-color)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#2d9967';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#3fae7a';
        }}
      >
        스캐닝
      </button>
    </div>
  )}
</div>

{/* Right Settings Panel */ }
{
  !playMode && (
    rightPanelOpen ? (
      <div className={styles.rightPanel}>
        {/* 3D Preview - Fixed at top, does not scroll */}
        <Mini3DPreview
          floorplanData={floorplanData}
          rooms={floorplanData?.rooms?.map((r: any) => ({
            id: r.id,
            name: r.name || 'Unnamed',
            area: r.area || 0
          })) || []}
          selectedRoomId={selectedRoom?.id}
          onRoomSelect={(roomId) => {
            if (roomId) {
              const room = floorplanData?.rooms?.find((r: any) => r.id === roomId);
              if (room) {
                setSelectedRoom({ id: room.id, name: room.name || 'Unnamed', area: room.area || 0 });
              }
            } else {
              setSelectedRoom(null);
            }
          }}
          themeColor={themeColor}
          height={previewHeight}
          onHeightChange={setPreviewHeight}
          viewMode={viewMode}
          babylon3DCanvasRef={babylon3DCanvasRef}
          floorplanCanvas={floorplanCanvas}
        />

        {/* Scrollable content below preview */}
        <div className={styles.rightPanelContent}>
        {editingFloor && selectedRoom ? (
          /* Floor editing mode - show FloorPropertiesPanel */
          <FloorPropertiesPanel
            room={selectedRoom}
            properties={floorProperties}
            onPropertiesChange={setFloorProperties}
            onClose={() => {
              setEditingFloor(false);
            }}
            floors={['Level 1']}
            currentFloor={levelProperties.currentFloor}
            onCurrentFloorChange={(floor) => setLevelProperties(prev => ({ ...prev, currentFloor: floor }))}
            wallHeight={wallHeight}
            onWallHeightChange={setWallHeight}
            wallThickness={wallThickness}
            onWallThicknessChange={setWallThickness}
            floorThickness={levelProperties.floorThickness}
            onFloorThicknessChange={(thickness) => setLevelProperties(prev => ({ ...prev, floorThickness: thickness }))}
          />
        ) : selectedRoom ? (
          /* Room selected - show room info */
          <div className={styles.settingsSection} style={{ backgroundColor: 'var(--theme-color-light, rgba(63, 174, 167, 0.1))', borderLeft: '3px solid var(--theme-color, #3FAEA7)' }}>
            <h4>Selected Room</h4>
            <div className={styles.settingRow}>
              <label>Name</label>
              <span style={{ fontWeight: 'bold' }}>{selectedRoom.name || 'Unnamed'}</span>
            </div>
            <div className={styles.settingRow}>
              <label>Area</label>
              <span style={{ fontWeight: 'bold', color: 'var(--theme-color, #3FAEA7)' }}>{selectedRoom.area.toFixed(2)} m²</span>
            </div>
            <button
              className={styles.editBtn}
              onClick={() => {
                setFloorProperties(prev => ({
                  ...prev,
                  id: selectedRoom.id,
                  name: selectedRoom.name || 'Untitled',
                }));
                setEditingFloor(true);
              }}
              style={{ marginTop: '8px' }}
            >
              Edit Floor ›
            </button>
            <button
              className={styles.deleteBtn}
              onClick={() => setSelectedRoom(null)}
              style={{ marginTop: '8px' }}
            >
              Deselect Room
            </button>
          </div>
        ) : (
          /* No room selected - show LevelPropertiesPanel */
          <LevelPropertiesPanel
            properties={levelProperties}
            onPropertiesChange={setLevelProperties}
            floors={['Level 1']}
            wallHeight={wallHeight}
            onWallHeightChange={setWallHeight}
            wallThickness={wallThickness}
            onWallThicknessChange={setWallThickness}
            totalArea={totalArea}
          />
        )}
        </div>
      </div>
    ) : (
      <div className={styles.rightPanelCollapsed} onClick={() => setRightPanelOpen(true)} title="Expand Panel">
        <button className={styles.toggleBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>
      </div>
    )
  )
}


{/* Render Style Panel */ }
{
  renderStyleOpen && (
    <div className={styles.renderStylePanel}>
      <div className={styles.panelHeader}>
        <h3>Render Style</h3>
        <button onClick={() => setRenderStyleOpen(false)} className={styles.closeBtn}>×</button>
      </div>

      <div className={styles.panelContent}>
        <div className={styles.styleOption}>
          <button
            className={`${styles.styleBtn} ${renderStyle === 'wireframe' ? styles.active : ''}`}
            onClick={() => setRenderStyle('wireframe')}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span>Wireframe</span>
          </button>
        </div>

        <div className={styles.styleOption}>
          <button
            className={`${styles.styleBtn} ${renderStyle === 'hidden-line' ? styles.active : ''}`}
            onClick={() => setRenderStyle('hidden-line')}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
              <polyline points="7.5 19.79 12 17.19 16.5 19.79" />
              <line x1="3.27" y1="6.96" x2="12" y2="12.01" />
              <line x1="12" y1="12.01" x2="20.73" y2="6.96" />
            </svg>
            <span>Hidden Line</span>
          </button>
        </div>

        <div className={styles.styleOption}>
          <button
            className={`${styles.styleBtn} ${renderStyle === 'solid' ? styles.active : ''}`}
            onClick={() => setRenderStyle('solid')}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44C3.21 17.21 3 16.88 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z" />
            </svg>
            <span>Solid</span>
          </button>
        </div>

        <div className={styles.styleOption}>
          <button
            className={`${styles.styleBtn} ${renderStyle === 'realistic' ? styles.active : ''}`}
            onClick={() => setRenderStyle('realistic')}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: 'currentColor', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: 'currentColor', stopOpacity: 0.3 }} />
                </linearGradient>
              </defs>
              <path fill="url(#grad1)" d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44C3.21 17.21 3 16.88 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z" />
              <circle cx="8" cy="10" r="1" fill="currentColor" opacity="0.6" />
              <circle cx="16" cy="10" r="1" fill="currentColor" opacity="0.6" />
              <circle cx="12" cy="14" r="1" fill="currentColor" opacity="0.6" />
            </svg>
            <span>Realistic</span>
          </button>
        </div>
      </div>
    </div>
  )
}

{/* Theme Settings Panel */ }
{
  themeSettingsOpen && (
    <div className={styles.themeSettingsPanel}>
      <div className={styles.panelHeader}>
        <h3>테마 설정</h3>
        <button onClick={() => setThemeSettingsOpen(false)} className={styles.closeBtn}>×</button>
      </div>

      <div className={styles.panelContent}>
        {/* Theme Mode Selection */}
        <div className={styles.settingsSection}>
          <h4>모드</h4>
          <div className={styles.themeModeGrid}>
            <button
              className={`${styles.themeModeBtn} ${themeMode === 'light' ? styles.active : ''}`}
              onClick={() => setThemeMode('light')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
              </svg>
              <span>라이트</span>
            </button>
            <button
              className={`${styles.themeModeBtn} ${themeMode === 'dark' ? styles.active : ''}`}
              onClick={() => setThemeMode('dark')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
              </svg>
              <span>다크</span>
            </button>
          </div>
        </div>

        {/* Theme Color Selection */}
        <div className={styles.settingsSection}>
          <h4>테마 색상</h4>
          <div className={styles.colorGrid}>
            {[
              { name: '그린', color: '#3fae7a' },
              { name: '블루', color: '#4a90e2' },
              { name: '퍼플', color: '#9b59b6' },
              { name: '오렌지', color: '#e67e22' },
              { name: '레드', color: '#e74c3c' },
              { name: '핑크', color: '#ec4899' },
              { name: '틸', color: '#14b8a6' },
              { name: '인디고', color: '#6366f1' },
            ].map(({ name, color }) => (
              <button
                key={color}
                className={`${styles.colorBtn} ${themeColor === color ? styles.active : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => setThemeColor(color)}
                title={name}
              >
                {themeColor === color && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Color Picker */}
        <div className={styles.settingsSection}>
          <h4>커스텀 색상</h4>
          <div className={styles.customColorRow}>
            <input
              type="color"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              className={styles.colorPicker}
            />
            <span className={styles.colorValue}>{themeColor.toUpperCase()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
      </div >

  {/* Advanced Camera Settings Panel */ }
{
  cameraPanelOpen && (
    <div className={styles.cameraPanelBottom}>
      <div className={styles.cameraPanelHeader}>
        <span>Camera Settings</span>
        <button className={styles.cameraPanelCloseBtn} onClick={() => setCameraPanelOpen(false)}>×</button>
      </div>
      <div className={styles.cameraPanelBody}>
        <div className={styles.cameraAdvancedSettings}>
          {/* Zoom Center */}
          <div className={styles.cameraSettingGroup}>
            <label>Zoom center</label>
            <div className={styles.radioGroup}>
              <div className={`${styles.radioOption} ${zoomCenter === 'screen' ? styles.active : ''}`} onClick={() => setZoomCenter('screen')}>
                <div className={styles.radioButton}><div className={styles.radioButtonInner} /></div>
                <span>Canvas</span>
              </div>
              <div className={`${styles.radioOption} ${zoomCenter === 'mouse' ? styles.active : ''}`} onClick={() => setZoomCenter('mouse')}>
                <div className={styles.radioButton}><div className={styles.radioButtonInner} /></div>
                <span>Mouse</span>
              </div>
            </div>
          </div>

          {/* Rotation Center */}
          <div className={styles.cameraSettingGroup}>
            <label>Rotation center</label>
            <div className={styles.radioGroup}>
              <div className={`${styles.radioOption} ${rotationCenter === 'screen' ? styles.active : ''}`} onClick={() => setRotationCenter('screen')}>
                <div className={styles.radioButton}><div className={styles.radioButtonInner} /></div>
                <span>Canvas</span>
              </div>
              <div className={`${styles.radioOption} ${rotationCenter === 'mouse' ? styles.active : ''}`} onClick={() => setRotationCenter('mouse')}>
                <div className={styles.radioButton}><div className={styles.radioButtonInner} /></div>
                <span>Mouse</span>
              </div>
            </div>
          </div>

          {/* Lock Camera Rotation */}
          <div className={styles.cameraSettingGroupRow}>
            <label>Lock camera rotation</label>
            <div className={`${styles.toggleSwitch} ${lockRotation ? styles.active : ''}`} onClick={() => setLockRotation(!lockRotation)}>
              <div className={styles.toggleSlider} />
            </div>
          </div>

          {/* Movement Speed */}
          <div className={styles.cameraSettingGroup}>
            <label>
              Movement speed
              <MdInfoOutline style={{ marginLeft: '4px', color: 'var(--text-tertiary)' }} />
            </label>
            <div className={styles.sliderGroup}>
              <input
                type="range"
                min="1"
                max="100"
                value={movementSpeed}
                onChange={(e) => setMovementSpeed(parseInt(e.target.value))}
                className={styles.cameraRangeSlider}
              />
              <div className={styles.cameraValueInputWrapper}>
                <input
                  type="number"
                  value={movementSpeed}
                  onChange={(e) => setMovementSpeed(parseInt(e.target.value))}
                  className={styles.cameraValueInput}
                />
                <span className={styles.cameraValueUnit}>%</span>
              </div>
            </div>
          </div>

          {/* View (Perspective/Orthogonal) */}
          <div className={styles.cameraSettingGroup}>
            <label>View</label>
            <div className={styles.radioGroup}>
              <div className={`${styles.radioOption} ${cameraProjection === 'perspective' ? styles.active : ''}`} onClick={() => {
                setCameraProjection('perspective');
                eventBus.emit(EditorEvents.CAMERA_PROJECTION_CHANGED, { type: 'perspective' });
              }}>
                <div className={styles.radioButton}><div className={styles.radioButtonInner} /></div>
                <span>Perspective</span>
              </div>
              <div className={`${styles.radioOption} ${cameraProjection === 'orthographic' ? styles.active : ''}`} onClick={() => {
                setCameraProjection('orthographic');
                eventBus.emit(EditorEvents.CAMERA_PROJECTION_CHANGED, { type: 'orthographic' });
              }}>
                <div className={styles.radioButton}><div className={styles.radioButtonInner} /></div>
                <span>Orthogonal</span>
              </div>
            </div>
          </div>

          {/* FOV */}
          <div className={styles.cameraSettingGroup}>
            <label>FOV</label>
            <div className={styles.sliderGroup}>
              <input
                type="range"
                min="30"
                max="120"
                value={cameraFov}
                onChange={(e) => {
                  const newFov = parseFloat(e.target.value);
                  setCameraFov(newFov);
                  eventBus.emit(EditorEvents.CAMERA_FOV_CHANGED, { fov: newFov });
                }}
                className={styles.cameraRangeSlider}
              />
              <div className={styles.cameraValueInputWrapper}>
                <input
                  type="number"
                  value={cameraFov}
                  onChange={(e) => {
                    const newFov = parseFloat(e.target.value);
                    setCameraFov(newFov);
                    eventBus.emit(EditorEvents.CAMERA_FOV_CHANGED, { fov: newFov });
                  }}
                  className={styles.cameraValueInput}
                />
                <span className={styles.cameraValueUnit}>°</span>
              </div>
            </div>
          </div>

          {/* Height */}
          <div className={styles.cameraSettingGroup}>
            <label>Height</label>
            <div className={styles.sliderGroup}>
              <input
                type="range"
                min="0"
                max="3000"
                value={cameraHeight}
                onChange={(e) => handleHeightChange(parseInt(e.target.value))}
                className={styles.cameraRangeSlider}
              />
              <div className={styles.cameraValueInputWrapper}>
                <input
                  type="number"
                  value={cameraHeight}
                  onChange={(e) => handleHeightChange(parseInt(e.target.value))}
                  className={styles.cameraValueInput}
                />
                <span className={styles.cameraValueUnit}>mm</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

{/* Camera Settings Modal */ }
< CameraSettingsModal />

{/* Export Modal */ }
< ExportModal
  isOpen={exportModalOpen}
  onClose={() => setExportModalOpen(false)}
  floorplanData={floorplanData}
/>
{/* New AI Render Modal */ }
< AIRenderModal
  isOpen={aiRenderModalOpen}
  onClose={() => setAiRenderModalOpen(false)}
  themeMode={themeMode}
  themeColor={themeColor}
/>

<FloorplanSearchModal
  isOpen={floorplanSearchModalOpen}
  onClose={() => setFloorplanSearchModalOpen(false)}
/>

{/* Elevation Wall Selection Modal */}
<ElevationModal
  isOpen={elevationModalOpen}
  onClose={() => setElevationModalOpen(false)}
  floorplanData={floorplanData}
  onWallSelected={(wall, direction) => {
    setSelectedElevationWall({ wall, direction });
    setView2DType('elevation');
    setElevationModalOpen(false);
  }}
  themeColor={themeColor}
  themeMode={themeMode}
  babylon3DCanvasRef={babylon3DCanvasRef}
/>

{/* Furniture Toolbar - shows when furniture is selected in 3D mode */}
<FurnitureToolbar
  visible={selectedFurniture !== null && !playMode && viewMode === '3D'}
  position={selectedFurniture?.screenPosition || { x: 0, y: 0 }}
  onMove={() => {
    // Move mode is handled by gizmo in Babylon3DCanvas
    console.log('Move furniture:', selectedFurniture?.id);
  }}
  onRotate={() => {
    // Rotate furniture by 90 degrees
    if (babylon3DCanvasRef.current && selectedFurniture) {
      const event = new CustomEvent('FURNITURE_ROTATE', {
        detail: { furnitureId: selectedFurniture.id }
      });
      window.dispatchEvent(event);
    }
  }}
  onFlip={() => {
    // Flip furniture horizontally
    if (babylon3DCanvasRef.current && selectedFurniture) {
      const event = new CustomEvent('FURNITURE_FLIP', {
        detail: { furnitureId: selectedFurniture.id }
      });
      window.dispatchEvent(event);
    }
  }}
  onDuplicate={() => {
    if (babylon3DCanvasRef.current && selectedFurniture) {
      const event = new CustomEvent('FURNITURE_DUPLICATE', {
        detail: { furnitureId: selectedFurniture.id }
      });
      window.dispatchEvent(event);
    }
  }}
  onHide={() => {
    if (babylon3DCanvasRef.current && selectedFurniture) {
      const event = new CustomEvent('FURNITURE_HIDE', {
        detail: { furnitureId: selectedFurniture.id }
      });
      window.dispatchEvent(event);
      setSelectedFurniture(null);
    }
  }}
  onFavorite={() => {
    console.log('Add to favorites:', selectedFurniture?.id);
  }}
  onDelete={() => {
    if (babylon3DCanvasRef.current && selectedFurniture) {
      const event = new CustomEvent('FURNITURE_DELETE', {
        detail: { furnitureId: selectedFurniture.id }
      });
      window.dispatchEvent(event);
      setSelectedFurniture(null);
    }
  }}
  onMaterialEditor={() => {
    console.log('Open material editor:', selectedFurniture?.id);
  }}
/>

{/* Furniture Toolbar - shows when furniture is selected in 2D mode */}
<FurnitureToolbar
  visible={selectedFurniture2D !== null && !playMode && viewMode === '2D'}
  position={selectedFurniture2D?.screenPosition || { x: 0, y: 0 }}
  onMove={() => {
    // Move is handled by drag in FurnitureLayer
    console.log('Move furniture (2D):', selectedFurniture2D?.furniture.id);
  }}
  onRotate={() => {
    // Rotate furniture by 90 degrees in 2D
    if (selectedFurniture2D) {
      const newRotation = selectedFurniture2D.furniture.rotation + Math.PI / 2;
      handleFurniture2DRotate(selectedFurniture2D.furniture.id, newRotation);
    }
  }}
  onFlip={() => {
    // Flip furniture horizontally in 2D
    if (selectedFurniture2D) {
      handleFurniture2DFlip(selectedFurniture2D.furniture.id);
    }
  }}
  onDuplicate={() => {
    if (selectedFurniture2D) {
      handleFurniture2DDuplicate(selectedFurniture2D.furniture.id);
    }
  }}
  onHide={() => {
    if (selectedFurniture2D) {
      handleFurniture2DHide(selectedFurniture2D.furniture.id);
    }
  }}
  onFavorite={() => {
    console.log('Add to favorites (2D):', selectedFurniture2D?.furniture.id);
  }}
  onDelete={() => {
    if (selectedFurniture2D) {
      handleFurniture2DDelete(selectedFurniture2D.furniture.id);
    }
  }}
  onMaterialEditor={() => {
    console.log('Open material editor (2D):', selectedFurniture2D?.furniture.id);
  }}
/>

{/* 2D Drag Ghost - shows preview while dragging furniture from library */}
{dragState2D.isDragging && dragState2D.metadata && (
  <div
    style={{
      position: 'fixed',
      left: dragState2D.mouseX - 40,
      top: dragState2D.mouseY - 40,
      width: 80,
      height: 80,
      pointerEvents: 'none',
      zIndex: 10000,
      opacity: 0.8,
      transform: 'translate(0, 0)',
    }}
  >
    {dragState2D.metadata.thumbnailUrl ? (
      <img
        src={dragState2D.metadata.thumbnailUrl}
        alt={dragState2D.metadata.name}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          background: 'rgba(255,255,255,0.9)',
        }}
      />
    ) : (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'rgba(59, 130, 246, 0.3)',
          border: '2px dashed #3b82f6',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#3b82f6',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        {dragState2D.metadata.name}
      </div>
    )}
  </div>
)}
    </div >
  );
};

export default EditorPage;
