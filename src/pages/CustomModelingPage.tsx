import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuRotate3D, LuPencilLine, LuSquareSquare, LuScaling } from 'react-icons/lu';
import { BiMove } from 'react-icons/bi';
import { FaTape } from 'react-icons/fa';
import { IoHandRightOutline } from 'react-icons/io5';
import { GrRotateRight } from 'react-icons/gr';
import { BsEraser, BsPaintBucket } from 'react-icons/bs';
import { IroColorPicker } from './components/IroColorPicker';
import { ShadowControls } from './components/ShadowControls';
import { ModelingContextMenu } from './components/ModelingContextMenu';
import styles from './CustomModelingPage.module.css';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Camera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
  Color3,
  Color4,
  StandardMaterial,
  Mesh,
  GizmoManager,
  UtilityLayerRenderer,
  HighlightLayer,
  LinesMesh,
  Ray,  // Required for scene.pick() to work
  Matrix,
  Quaternion,
  Material,
  TransformNode,
  VertexData,
} from '@babylonjs/core';
// Side-effect import for scene.pick() to work
import '@babylonjs/core/Culling/ray';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { AdvancedDynamicTexture, Ellipse, Control } from '@babylonjs/gui';
import { SelectionManager } from './modeling/SelectionManager';
import earcut from 'earcut';


type ToolType = 'select' | 'eraser' | 'line' | 'arc' | 'rectangle' | 'circle' | 'polygon' | 'pushpull' | 'rotate' | 'move' | 'scale' | 'offset' | 'tape' | 'text' | 'paint' | 'orbit' | 'pan' | 'zoom' | 'zoomExtents' | 'makeComponent' | 'freehand' | 'rotatedRect' | 'arc2pt' | 'arc3pt' | 'pie' | 'followMe' | 'outerShell' | 'dimension' | 'protractor' | 'text3d' | 'axes' | 'section' | 'solidTools' | 'zoomWindow' | 'zoomPrevious' | 'lookAround' | 'walk' | 'tag' | 'positionCamera' | 'flip';

// Drawing state interface
interface DrawingState {
  isDrawing: boolean;
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  previewMesh: Mesh | LinesMesh | null;
  points: Vector3[];
}

// Shape modifier state (used for rectangle, circle, polygon)
interface ShapeModifiers {
  drawFromCenter: boolean;  // Option key
  lockSquare: boolean;      // Shift key (square for rect, perfect circle, equal-sided polygon)
  axisLock: 'none' | 'red' | 'green' | 'blue' | 'parallel';  // Arrow keys
}

// Line tool inference state
interface LineInference {
  axisColor: 'red' | 'green' | 'blue' | 'magenta' | 'black';  // Current line color based on axis
  axisLock: 'none' | 'red' | 'green' | 'blue';  // Arrow key axis lock
  inferenceLocked: boolean;  // Shift key inference lock
  inferenceType: 'none' | 'endpoint' | 'midpoint' | 'on-edge' | 'on-axis' | 'perpendicular' | 'parallel';
  continuousMode: boolean;  // After finalizing, start next line from endpoint
  lastEndpoint: Vector3 | null;  // For continuous drawing
  inferredAxis: 'x' | 'y' | 'z' | null;  // Currently inferred drawing axis
}

const PushPullIcon = ({ size = 18, className = '' }: { size?: number, className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M614.4 460.8l330.24 192.256a25.6 25.6 0 0 1 0 44.288l-419.7376 244.3264a25.6 25.6 0 0 1-25.8048 0L79.36 697.344a25.6 25.6 0 0 1 0-44.288L409.6 460.8512v118.4256l-164.7104 95.8976L512 830.6176l267.1104-155.4944-164.7616-95.8464V460.8z m-93.3376-379.3408l152.6272 152.6272a12.8 12.8 0 0 1-9.0112 21.8624H563.2V665.6H460.8V255.9488H359.3728a12.8 12.8 0 0 1-9.0624-21.8624l152.6272-152.6272a12.8 12.8 0 0 1 18.1248 0z" />
  </svg>
);

const CustomModelingPage: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const gizmoManagerRef = useRef<GizmoManager | null>(null);
  const highlightLayerRef = useRef<HighlightLayer | null>(null);
  const groundPickerRef = useRef<Mesh | null>(null);
  const meshCounterRef = useRef<number>(0);
  const originMarkerRef = useRef<Mesh | null>(null);
  const snapIndicatorRef = useRef<Mesh | null>(null);
  // Snap point with type information for different visual feedback
  interface SnapPointData {
    position: Vector3;
    type: 'endpoint' | 'midpoint' | 'origin' | 'onedge';
  }
  const snapPointsRef = useRef<SnapPointData[]>([]);  // Store snap point positions with type
  const activeSnapPointRef = useRef<SnapPointData | null>(null);  // Currently active snap point for click handling
  const hoveredFaceRef = useRef<Mesh | null>(null);  // Currently hovered face for push/pull highlight
  const hoveredFaceOriginalMaterialRef = useRef<Material | null>(null);  // Store original material
  const dottedHoverMaterialRef = useRef<StandardMaterial | null>(null);  // Dotted pattern material

  // Push/Pull state ref for SketchUp-style extrusion
  const pushPullStateRef = useRef<{
    baseFace: Mesh | null;           // Selected face to extrude
    baseFaceNormal: Vector3 | null;  // Face normal direction
    baseFaceCenter: Vector3 | null;  // Face center point
    baseClickPoint: Vector3 | null;  // Initial click point on face
    isExtruding: boolean;            // Currently in extrusion mode
    previewMesh: Mesh | null;        // Preview mesh during drag
    lastExtrudeDistance: number;     // For double-click repeat
    lastClickTime: number;           // For double-click detection
    lastClickFace: Mesh | null;      // For double-click on same face
    axisLocked: boolean;             // Shift key locks the axis direction
    lockedDistance: number;          // Distance when axis was locked
    copyMode: boolean;               // Option key: create copy instead of modifying original
  }>({
    baseFace: null,
    baseFaceNormal: null,
    baseFaceCenter: null,
    baseClickPoint: null,
    isExtruding: false,
    previewMesh: null,
    lastExtrudeDistance: 0,
    lastClickTime: 0,
    lastClickFace: null,
    axisLocked: false,
    lockedDistance: 0,
    copyMode: false,
  });

  // Offset tool state ref for SketchUp-style face offset
  const offsetStateRef = useRef<{
    baseFace: Mesh | null;           // Selected face to offset
    baseVertices: Vector3[];         // Original face vertices
    baseCenter: Vector3 | null;      // Face center point
    baseClickY: number;              // Initial click Y position
    isOffsetting: boolean;           // Currently in offset mode
    previewMesh: Mesh | null;        // Preview mesh during drag
    lastOffsetDistance: number;      // For double-click repeat
    lastClickTime: number;           // For double-click detection
  }>({
    baseFace: null,
    baseVertices: [],
    baseCenter: null,
    baseClickY: 0,
    isOffsetting: false,
    previewMesh: null,
    lastOffsetDistance: 0,
    lastClickTime: 0,
  });

  // Selection system state for SketchUp-style multi-selection
  const selectionManagerRef = useRef<SelectionManager | null>(null);
  const [selectionState, setSelectionState] = useState<{
    selectedIds: string[];
    contextMenu: { x: number; y: number } | null;
  }>({
    selectedIds: [],
    contextMenu: null,
  });

  const selectionBoxRef = useRef<{
    startX: number;
    startY: number;
    isDragging: boolean;
    element: HTMLDivElement | null;
  }>({
    startX: 0,
    startY: 0,
    isDragging: false,
    element: null,
  });

  // Initialize SelectionManager
  useEffect(() => {
    if (sceneRef.current && !selectionManagerRef.current) {
      selectionManagerRef.current = new SelectionManager(sceneRef.current, (ids) => {
        setSelectionState(prev => ({ ...prev, selectedIds: ids }));
      });
    }
  }, []);

  // HUD overlay refs for Drawing Cursor System
  const hudTextureRef = useRef<AdvancedDynamicTexture | null>(null);
  const pointerCircleRef = useRef<Ellipse | null>(null);

  // Pan state for custom pan tool handling
  const panStateRef = useRef<{
    isPanning: boolean;
    lastX: number;
    lastY: number;
  }>({ isPanning: false, lastX: 0, lastY: 0 });

  // Drawing state ref for cross-render persistence
  const drawingStateRef = useRef<DrawingState>({
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    previewMesh: null,
    points: [],
  });

  // Shape modifiers ref (used for rectangle, circle, polygon)
  const shapeModifiersRef = useRef<ShapeModifiers>({
    drawFromCenter: false,
    lockSquare: false,
    axisLock: 'none',
  });

  // Line inference ref (used for line tool)
  const lineInferenceRef = useRef<LineInference>({
    axisColor: 'black',
    axisLock: 'none',
    inferenceLocked: false,
    inferenceType: 'none',
    continuousMode: true,  // SketchUp default is continuous
    lastEndpoint: null,
    inferredAxis: null,
  });

  // Edge drag state for move tool stretching
  const edgeDragStateRef = useRef<{
    isDragging: boolean;
    startPosition: Vector3 | null;
    edgeMesh: Mesh | null;
    previewLines: Mesh[];
    originalCorners: Vector3[] | null;
  }>({
    isDragging: false,
    startPosition: null,
    edgeMesh: null,
    previewLines: [],
    originalCorners: null
  });

  // SketchUp-style Move tool state
  const moveToolStateRef = useRef<{
    isMoving: boolean;
    startPoint: Vector3 | null;
    targetMesh: Mesh | null;
    previewLine: Mesh | null;
    originalPosition: Vector3 | null;
    inferredAxis: 'x' | 'y' | 'z' | null;
  }>({
    isMoving: false,
    startPoint: null,
    targetMesh: null,
    previewLine: null,
    originalPosition: null,
    inferredAxis: null
  });

  // Measurement input state for rectangle dimensions
  const [measurementInput, setMeasurementInput] = useState<string>('');
  const [showMeasurementInput, setShowMeasurementInput] = useState(false);
  const measurementInputRef = useRef<HTMLInputElement>(null);
  const measurementInputValueRef = useRef<string>(''); // Track current value for keyboard handler

  // Dashed axis refs for dynamic update based on camera distance
  const xAxisNegRef = useRef<LinesMesh | null>(null);
  const yAxisNegRef = useRef<LinesMesh | null>(null);
  const zAxisNegRef = useRef<LinesMesh | null>(null);
  const lastCameraRadiusRef = useRef<number>(0);

  // Shape modifiers state for UI display (mirrors ref for rendering)
  const [shapeModifiersUI, setShapeModifiersUI] = useState<ShapeModifiers>({
    drawFromCenter: false,
    lockSquare: false,
    axisLock: 'none',
  });

  // Line inference state for UI display (mirrors ref for rendering)
  const [lineInferenceUI, setLineInferenceUI] = useState<LineInference>({
    axisColor: 'black',
    axisLock: 'none',
    inferenceLocked: false,
    inferenceType: 'none',
    continuousMode: true,
    lastEndpoint: null,
    inferredAxis: null,
  });

  // Line measurement display state
  const [lineMeasurement, setLineMeasurement] = useState<number>(0);  // in mm

  // Drawing state for UI (mirrors ref for re-rendering)
  const [isDrawing, setIsDrawing] = useState(false);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [pushpullCopyMode, setPushpullCopyMode] = useState(false);  // Option key held for copy mode
  const [selectedMesh, setSelectedMesh] = useState<Mesh | null>(null);
  const selectedMeshRef = useRef<Mesh | null>(null);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'materials' | 'components'>('info');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic' | 'twoPoint'>('perspective');
  const [selectedColor, setSelectedColor] = useState('#E5E7EB');
  const [meshProperties, setMeshProperties] = useState<{
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  } | null>(null);

  // Theme state - read from localStorage
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('themeMode') as 'light' | 'dark' | null;
    return saved || 'dark';
  });

  // Theme color - read from CSS variable (set by App.tsx) or localStorage
  const [themeColor, setThemeColor] = useState<string>(() => {
    // First try CSS variable from document root
    const cssVar = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
    if (cssVar) return cssVar;
    // Fallback to localStorage
    const saved = localStorage.getItem('themeColor');
    return saved || '#3FAEA7'; // Default teal color
  });

  // Shadow system state
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [sunTime, setSunTime] = useState(10); // 0-24 hours (10 AM default)
  const [sunAzimuth, setSunAzimuth] = useState(180); // 0-360 degrees (South default)
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const shadowGeneratorRef = useRef<ShadowGenerator | null>(null);
  const shadowEnabledRef = useRef(false); // For observer closure

  // Base snap threshold for origin and endpoints - will be scaled by camera distance
  // This makes snap feel consistent regardless of zoom level (like screen-space snapping)
  // Higher value = more magnetic snap (SketchUp-like behavior)
  const SNAP_THRESHOLD_BASE = 0.08;  // 8% of camera radius for strong magnetic snap

  // Unit conversion: 1 unit in 3D = 1000mm (1 meter)
  // So if user types 500mm, it becomes 0.5 units
  const MM_TO_UNIT = 0.001;
  const UNIT_TO_MM = 1000;

  // Grid snap resolution: 0.001 units = 1mm precision
  const GRID_SNAP = 0.001;

  // Current measurement state for display
  const [currentMeasurement, setCurrentMeasurement] = useState<{
    width: number;   // in mm
    height: number;  // in mm (or radius for circle/polygon)
    sides?: number;  // for polygon
  }>({ width: 0, height: 0 });

  // Measurement input ref for direct keyboard capture
  const measureInputRef = useRef<HTMLInputElement>(null);

  // Sync measurementInput state to ref for keyboard handler access
  useEffect(() => {
    measurementInputValueRef.current = measurementInput;
  }, [measurementInput]);

  // Sync selectedMesh state to ref for event handler access
  useEffect(() => {
    selectedMeshRef.current = selectedMesh;
  }, [selectedMesh]);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeMenu && !(e.target as HTMLElement).closest(`.${styles.menuDropdown}`)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeMenu]);

  // Handle camera mode switching (Orthographic vs Perspective)
  useEffect(() => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;

    if (cameraMode === 'orthographic') {
      // Switch to orthographic mode
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      // Calculate orthographic bounds based on current zoom (radius)
      const aspectRatio = canvas.width / canvas.height;
      const orthoSize = camera.radius * 0.5;
      camera.orthoLeft = -orthoSize * aspectRatio;
      camera.orthoRight = orthoSize * aspectRatio;
      camera.orthoBottom = -orthoSize;
      camera.orthoTop = orthoSize;
    } else {
      // Switch to perspective mode
      camera.mode = Camera.PERSPECTIVE_CAMERA;
    }
  }, [cameraMode]);

  // Calculate sun position from time and azimuth
  const calculateSunDirection = useCallback((time: number, azimuth: number): Vector3 => {
    // Time: 0-24 hours, convert to altitude angle
    // Noon (12) = highest point, midnight (0/24) = lowest
    // Altitude: 0° at sunrise/sunset (6am, 6pm), 90° at noon
    const solarNoon = 12;
    const hourAngle = (time - solarNoon) * 15; // 15 degrees per hour
    const altitudeAngle = Math.max(0, 90 - Math.abs(hourAngle)); // Simplified altitude

    // Convert angles to radians
    const altRad = (altitudeAngle * Math.PI) / 180;
    const azRad = (azimuth * Math.PI) / 180;

    // Calculate direction vector (pointing FROM sun TO scene)
    // x = sin(azimuth) * cos(altitude)
    // y = -sin(altitude) (negative because light points down)
    // z = cos(azimuth) * cos(altitude)
    const x = Math.sin(azRad) * Math.cos(altRad);
    const y = -Math.sin(altRad);
    const z = Math.cos(azRad) * Math.cos(altRad);

    return new Vector3(x, y, z).normalize();
  }, []);

  // Update sun light when time/azimuth changes
  useEffect(() => {
    if (!sunLightRef.current) return;

    const direction = calculateSunDirection(sunTime, sunAzimuth);
    sunLightRef.current.direction = direction;

    // Update light position to be opposite of direction, far from origin
    const distance = 100;
    sunLightRef.current.position = direction.scale(-distance);
  }, [sunTime, sunAzimuth, calculateSunDirection]);

  // Toggle shadow system
  useEffect(() => {
    // Update ref for observer closure
    shadowEnabledRef.current = shadowEnabled;

    const scene = sceneRef.current;
    if (!scene || !sunLightRef.current) return;

    // Find shadow ground
    const shadowGround = scene.getMeshByName('shadowGround');

    if (shadowEnabled) {
      // Enable sun light and shadow ground
      sunLightRef.current.intensity = 1.2;
      if (shadowGround) shadowGround.visibility = 1;

      // Add all meshes to shadow caster list
      scene.meshes.forEach((mesh) => {
        if (mesh instanceof Mesh &&
          mesh.name !== 'groundPicker' &&
          mesh.name !== 'shadowGround' &&
          !mesh.name.includes('Axis') &&
          !mesh.name.includes('snap') &&
          !mesh.name.includes('origin') &&
          !mesh.name.includes('preview') &&
          !mesh.name.includes('Grid') &&
          mesh.getTotalVertices() > 0) {
          mesh.receiveShadows = true;
          if (shadowGeneratorRef.current) {
            shadowGeneratorRef.current.addShadowCaster(mesh);
          }
        }
      });
    } else {
      // Disable sun light and hide shadow ground
      sunLightRef.current.intensity = 0;
      if (shadowGround) shadowGround.visibility = 0;

      // Clear shadow caster list
      if (shadowGeneratorRef.current) {
        const renderList = shadowGeneratorRef.current.getShadowMap()?.renderList;
        if (renderList) {
          renderList.length = 0;
        }
      }
    }
  }, [shadowEnabled]);

  // Get ground point with grid snapping and magnetic snap to origin
  // Uses dynamic threshold based on camera distance for consistent snap feel
  const getGroundPoint = useCallback((scene: Scene, pointerX: number, pointerY: number): Vector3 | null => {
    const pickResult = scene.pick(pointerX, pointerY, (mesh) => mesh.name === 'groundPicker');
    if (pickResult?.hit && pickResult.pickedPoint) {
      // Get raw point for snap detection
      const rawPoint = new Vector3(
        pickResult.pickedPoint.x,
        0,
        pickResult.pickedPoint.z
      );

      // Dynamic snap threshold based on camera distance
      // Minimum of 1.0 world units ensures snap works even when zoomed in close
      const camera = cameraRef.current;
      const snapThreshold = camera ? Math.max(camera.radius * SNAP_THRESHOLD_BASE, 1.0) : 2.0;

      // Priority 1: Magnetic snap to origin (0,0,0)
      const distanceToOrigin = rawPoint.length();
      if (distanceToOrigin < snapThreshold) {
        return Vector3.Zero();
      }

      // Priority 2: Snap to existing snap points (endpoints, midpoints, corners)
      for (const snapPoint of snapPointsRef.current) {
        const dist = Vector3.Distance(rawPoint, snapPoint.position);
        if (dist < snapThreshold) {
          // Preserve actual Y coordinate for 3D snapping (top edges, etc.)
          return snapPoint.position.clone();
        }
      }

      // Priority 3: Grid snap with fine resolution (0.1 units = 100mm)
      // This allows finer diagonal angles, not just 45° multiples
      const snapped = new Vector3(
        Math.round(pickResult.pickedPoint.x / GRID_SNAP) * GRID_SNAP,
        0,
        Math.round(pickResult.pickedPoint.z / GRID_SNAP) * GRID_SNAP
      );

      return snapped;
    }
    return null;
  }, []);

  // Get drawing point for line tool - can pick on faces OR ground, preserves Y coordinate
  const getDrawingPoint = useCallback((scene: Scene, pointerX: number, pointerY: number): Vector3 | null => {
    const camera = cameraRef.current;
    const snapThreshold = camera ? Math.max(camera.radius * SNAP_THRESHOLD_BASE, 1.0) : 2.0;

    // Priority 1: Check for snap points (including 3D points with Y values)
    if (activeSnapPointRef.current) {
      return activeSnapPointRef.current.position.clone();
    }

    // Priority 2: Pick existing faces (allows drawing on 3D surfaces)
    const facePickResult = scene.pick(pointerX, pointerY, (mesh) => {
      return mesh.metadata?.type === 'face' && mesh.isPickable;
    });

    if (facePickResult?.hit && facePickResult.pickedPoint) {
      const rawPoint = facePickResult.pickedPoint.clone();

      // Check snap to existing snap points
      for (const snapPoint of snapPointsRef.current) {
        const dist = Vector3.Distance(rawPoint, snapPoint.position);
        if (dist < snapThreshold) {
          return snapPoint.position.clone();
        }
      }

      // Grid snap on the face plane
      return new Vector3(
        Math.round(rawPoint.x / GRID_SNAP) * GRID_SNAP,
        Math.round(rawPoint.y / GRID_SNAP) * GRID_SNAP,
        Math.round(rawPoint.z / GRID_SNAP) * GRID_SNAP
      );
    }

    // Priority 3: Fall back to ground plane
    const groundPickResult = scene.pick(pointerX, pointerY, (mesh) => mesh.name === 'groundPicker');
    if (groundPickResult?.hit && groundPickResult.pickedPoint) {
      const rawPoint = new Vector3(
        groundPickResult.pickedPoint.x,
        0,
        groundPickResult.pickedPoint.z
      );

      // Magnetic snap to origin
      if (rawPoint.length() < snapThreshold) {
        return Vector3.Zero();
      }

      // Snap to existing snap points (preserve Y for 3D snapping)
      for (const snapPoint of snapPointsRef.current) {
        const dist = Vector3.Distance(rawPoint, snapPoint.position);
        if (dist < snapThreshold) {
          return snapPoint.position.clone();
        }
      }

      // Grid snap
      return new Vector3(
        Math.round(groundPickResult.pickedPoint.x / GRID_SNAP) * GRID_SNAP,
        0,
        Math.round(groundPickResult.pickedPoint.z / GRID_SNAP) * GRID_SNAP
      );
    }

    return null;
  }, []);

  // Get drawing point with Y-axis inference (for line drawing)
  // Uses screen coordinates to detect vertical (Y-axis) drawing intent
  const getDrawingPointWithYInference = useCallback((
    scene: Scene,
    pointerX: number,
    pointerY: number,
    startPoint: Vector3 | null
  ): { point: Vector3 | null; inferredAxis: 'x' | 'y' | 'z' | null } => {
    const camera = cameraRef.current;
    if (!camera) return { point: null, inferredAxis: null };

    const snapThreshold = Math.max(camera.radius * SNAP_THRESHOLD_BASE, 1.0);

    // If no start point, just use regular getDrawingPoint
    if (!startPoint) {
      return { point: getDrawingPoint(scene, pointerX, pointerY), inferredAxis: null };
    }

    // First, check if we're snapping to an existing snap point
    if (activeSnapPointRef.current) {
      return { point: activeSnapPointRef.current.position.clone(), inferredAxis: null };
    }

    // Convert startPoint to screen coordinates for Y-axis inference
    const engine = scene.getEngine();
    const startScreenPos = Vector3.Project(
      startPoint,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );

    // Calculate screen distance from start point
    const screenDx = Math.abs(pointerX - startScreenPos.x);
    const screenDy = pointerY - startScreenPos.y; // Positive = mouse below start, Negative = mouse above start

    // Y-axis inference: Mouse is close horizontally but moving vertically on screen
    // SKIP Y-axis inference if drawing on ground plane (startPoint.y near 0)
    const screenSnapThreshold = 80; // pixels
    const isOnGroundPlane = Math.abs(startPoint.y) < 0.1;
    if (!isOnGroundPlane && screenDx < screenSnapThreshold && Math.abs(screenDy) > 5) {
      // Project mouse onto a vertical plane passing through startPoint
      const ray = scene.createPickingRay(pointerX, pointerY, Matrix.Identity(), camera);
      const cameraPos = camera.position;
      const toCamera = cameraPos.subtract(startPoint);
      let planeNormal = new Vector3(toCamera.x, 0, toCamera.z);

      if (planeNormal.length() < 0.1) {
        planeNormal = new Vector3(1, 0, 0);
      } else {
        planeNormal = planeNormal.normalize();
      }

      const denom = Vector3.Dot(ray.direction, planeNormal);
      if (Math.abs(denom) > 0.0001) {
        const t = Vector3.Dot(startPoint.subtract(ray.origin), planeNormal) / denom;
        if (t > 0) {
          const intersectPoint = ray.origin.add(ray.direction.scale(t));
          const yValue = Math.round(intersectPoint.y / GRID_SNAP) * GRID_SNAP;
          return {
            point: new Vector3(startPoint.x, yValue, startPoint.z),
            inferredAxis: 'y'
          };
        }
      }
    }

    // Try to pick the ground
    const groundPickResult = scene.pick(pointerX, pointerY, (mesh) => mesh.name === 'groundPicker');

    if (groundPickResult?.hit && groundPickResult.pickedPoint) {
      const groundPoint = groundPickResult.pickedPoint;

      const dx = Math.abs(groundPoint.x - startPoint.x);
      const dz = Math.abs(groundPoint.z - startPoint.z);
      const totalDist = dx + dz;

      // Only apply axis inference if moved enough from start point
      if (totalDist > snapThreshold * 0.2) {
        const ratio = totalDist > 0.01 ? Math.min(dx, dz) / Math.max(dx, dz) : 1;

        // Aggressive axis snapping - snap unless moving at ~45 degrees
        // ratio < 0.85 means one axis is dominant
        if (ratio < 0.85) {
          if (dx > dz) {
            // X-axis inference (red): Lock Z, allow X to vary
            const xValue = Math.round(groundPoint.x / GRID_SNAP) * GRID_SNAP;
            return {
              point: new Vector3(xValue, startPoint.y, startPoint.z),
              inferredAxis: 'x'
            };
          } else {
            // Z-axis inference (green): Lock X, allow Z to vary
            const zValue = Math.round(groundPoint.z / GRID_SNAP) * GRID_SNAP;
            return {
              point: new Vector3(startPoint.x, startPoint.y, zValue),
              inferredAxis: 'z'
            };
          }
        }
      }

      // Default: Use ground point
      return {
        point: new Vector3(
          Math.round(groundPoint.x / GRID_SNAP) * GRID_SNAP,
          startPoint.y,
          Math.round(groundPoint.z / GRID_SNAP) * GRID_SNAP
        ),
        inferredAxis: null
      };
    }

    // Fallback: return start point if nothing else works
    return { point: startPoint.clone(), inferredAxis: null };
  }, [getDrawingPoint]);

  // Parse measurement input (supports "1000, 500" or "1000" formats, default mm)
  const parseMeasurementInput = useCallback((input: string): { width?: number; height?: number; radius?: number; sides?: number } => {
    const trimmed = input.trim();
    if (!trimmed) return {};

    // Handle sides count for polygon (e.g., "6s" or "8S")
    const sidesMatch = trimmed.match(/(\d+)\s*[sS]/);
    if (sidesMatch) {
      return { sides: parseInt(sidesMatch[1], 10) };
    }

    // Split by comma for width, height
    const parts = trimmed.split(',').map(p => p.trim());

    // Parse single value (could be just unit value)
    const parseValue = (val: string): number => {
      // Remove any unit suffix and parse
      const numMatch = val.match(/^(-?\d+\.?\d*)\s*(mm|cm|m)?$/i);
      if (numMatch) {
        const num = parseFloat(numMatch[1]);
        const unit = (numMatch[2] || 'mm').toLowerCase();
        // Convert to mm
        switch (unit) {
          case 'm': return num * 1000;
          case 'cm': return num * 10;
          default: return num; // mm
        }
      }
      return NaN;
    };

    if (parts.length === 1) {
      const value = parseValue(parts[0]);
      if (!isNaN(value)) {
        return { radius: value, width: value, height: value };
      }
    } else if (parts.length === 2) {
      const width = parseValue(parts[0]);
      const height = parseValue(parts[1]);
      return {
        width: isNaN(width) ? undefined : width,
        height: isNaN(height) ? undefined : height,
      };
    }
    return {};
  }, []);

  // Apply measurement input to current drawing
  const applyMeasurementInput = useCallback((input: string) => {
    const scene = sceneRef.current;
    const state = drawingStateRef.current;
    if (!scene || !state.isDrawing || !state.startPoint) return;

    const parsed = parseMeasurementInput(input);
    if (Object.keys(parsed).length === 0) return;

    const start = state.startPoint;
    const mods = shapeModifiersRef.current;

    if (activeTool === 'rectangle' && parsed.width !== undefined) {
      const widthUnits = (parsed.width || 0) * MM_TO_UNIT;
      const heightUnits = (parsed.height || parsed.width || 0) * MM_TO_UNIT;

      let endX: number, endZ: number;
      if (mods.drawFromCenter) {
        endX = start.x + widthUnits / 2;
        endZ = start.z + heightUnits / 2;
      } else {
        endX = start.x + widthUnits;
        endZ = start.z + heightUnits;
      }

      const endPoint = new Vector3(endX, 0, endZ);
      state.currentPoint = endPoint;
      updatePreviewRectangle(scene, start, endPoint);
      setCurrentMeasurement({ width: parsed.width || 0, height: parsed.height || parsed.width || 0 });
    } else if (activeTool === 'circle' && parsed.radius !== undefined) {
      const radiusUnits = parsed.radius * MM_TO_UNIT;
      const endPoint = new Vector3(start.x + radiusUnits, 0, start.z);
      state.currentPoint = endPoint;
      updatePreviewCircle(scene, start, endPoint);
      setCurrentMeasurement({ width: 0, height: parsed.radius });
    } else if (activeTool === 'polygon') {
      if (parsed.sides !== undefined) {
        // Just update sides, will need to redraw polygon
        setCurrentMeasurement(prev => ({ ...prev, sides: parsed.sides }));
      } else if (parsed.radius !== undefined) {
        const radiusUnits = parsed.radius * MM_TO_UNIT;
        const endPoint = new Vector3(start.x + radiusUnits, 0, start.z);
        state.currentPoint = endPoint;
        updatePreviewPolygon(scene, start, endPoint, currentMeasurement.sides || 6);
        setCurrentMeasurement(prev => ({ ...prev, width: 0, height: parsed.radius || 0 }));
      }
    } else if (activeTool === 'line' && parsed.width !== undefined && state.currentPoint) {
      // For line tool, parsed.width is used as length (reusing the same parsing logic)
      const lengthUnits = parsed.width * MM_TO_UNIT;

      // Get the current direction from start to current point
      const currentEnd = state.currentPoint;
      const direction = currentEnd.subtract(start);
      const currentLength = direction.length();

      let endPoint: Vector3;
      // If no direction yet, default to positive X (red) axis
      if (currentLength < 0.01) {
        endPoint = new Vector3(start.x + lengthUnits, start.y, start.z);
      } else {
        // Normalize and apply new length
        const normalizedDir = direction.normalize();
        endPoint = start.add(normalizedDir.scale(lengthUnits));
      }
      state.currentPoint = endPoint;

      // Create/update preview line inline (avoid circular dep with updatePreviewLine)
      if (state.previewMesh) {
        state.previewMesh.dispose();
      }
      const line = MeshBuilder.CreateLines('previewLine', {
        points: [start, endPoint],
        updatable: false,
      }, scene);
      line.color = new Color3(0.5, 0.5, 0.5);  // Gray for typed input
      line.isPickable = false;
      state.previewMesh = line;

      setLineMeasurement(parsed.width);
    }
  }, [activeTool, parseMeasurementInput, currentMeasurement.sides]);

  // Detect axis alignment and return appropriate color
  const detectLineAxis = useCallback((start: Vector3, end: Vector3): { color: 'red' | 'green' | 'blue' | 'magenta' | 'black'; type: LineInference['inferenceType'] } => {
    const lineInf = lineInferenceRef.current;

    // If axis is locked by arrow key, force that axis
    if (lineInf.axisLock !== 'none') {
      return { color: lineInf.axisLock, type: 'on-axis' };
    }

    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const dz = Math.abs(end.z - start.z);
    const length = Vector3.Distance(start, end);

    if (length < 0.01) {
      return { color: 'black', type: 'none' };
    }

    // Tolerance for axis alignment (within ~5 degrees)
    const tolerance = 0.1;
    const xRatio = dx / length;
    const yRatio = dy / length;
    const zRatio = dz / length;

    // Check if aligned with X axis (red) - in ground plane, X is red
    if (xRatio > (1 - tolerance) && zRatio < tolerance && yRatio < tolerance) {
      return { color: 'red', type: 'on-axis' };
    }
    // Check if aligned with Z axis (green) - in ground plane, Z is green
    if (zRatio > (1 - tolerance) && xRatio < tolerance && yRatio < tolerance) {
      return { color: 'green', type: 'on-axis' };
    }
    // Check if aligned with Y axis (blue) - vertical
    if (yRatio > (1 - tolerance) && xRatio < tolerance && zRatio < tolerance) {
      return { color: 'blue', type: 'on-axis' };
    }

    // Check for parallel/perpendicular to existing edges (magenta)
    // For now, check if parallel to any axis combination
    const is45Degree = Math.abs(xRatio - zRatio) < tolerance && yRatio < tolerance;
    if (is45Degree) {
      return { color: 'magenta', type: 'parallel' };
    }

    return { color: 'black', type: 'none' };
  }, []);

  // Apply axis lock constraint to endpoint
  const applyAxisLock = useCallback((start: Vector3, end: Vector3, axisLock: 'none' | 'red' | 'green' | 'blue'): Vector3 => {
    if (axisLock === 'none') return end;

    const constrainedEnd = end.clone();
    switch (axisLock) {
      case 'red':  // X axis - keep only X movement
        constrainedEnd.z = start.z;
        constrainedEnd.y = start.y;
        break;
      case 'green':  // Z axis - keep only Z movement
        constrainedEnd.x = start.x;
        constrainedEnd.y = start.y;
        break;
      case 'blue':  // Y axis - keep only Y movement
        constrainedEnd.x = start.x;
        constrainedEnd.z = start.z;
        break;
    }
    return constrainedEnd;
  }, []);

  // Create/update preview line with axis-colored display
  const updatePreviewLine = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    const state = drawingStateRef.current;
    const lineInf = lineInferenceRef.current;

    if (state.previewMesh) {
      state.previewMesh.dispose();
    }

    // Apply axis lock if active
    const constrainedEnd = applyAxisLock(start, end, lineInf.axisLock);

    // Detect axis alignment and get color
    const { color: axisColor, type: inferenceType } = detectLineAxis(start, constrainedEnd);

    // Update inference state
    lineInf.axisColor = axisColor;
    lineInf.inferenceType = inferenceType;
    setLineInferenceUI(prev => ({ ...prev, axisColor, inferenceType }));

    // Create line with appropriate color (use actual Y coordinates for 3D preview)
    const linePoints = [
      new Vector3(start.x, start.y, start.z),
      new Vector3(constrainedEnd.x, constrainedEnd.y, constrainedEnd.z)
    ];
    const line = MeshBuilder.CreateLines('previewLine', {
      points: linePoints,
      updatable: false,
    }, scene);

    // Set color based on axis
    switch (axisColor) {
      case 'red':
        line.color = new Color3(0.9, 0.2, 0.2);  // Red - X axis
        break;
      case 'green':
        line.color = new Color3(0.2, 0.8, 0.2);  // Green - Z axis
        break;
      case 'blue':
        line.color = new Color3(0.3, 0.5, 1);    // Blue - Y axis
        break;
      case 'magenta':
        line.color = new Color3(0.9, 0.3, 0.9);  // Magenta - parallel/perpendicular
        break;
      default:
        line.color = new Color3(0.3, 0.3, 0.3);  // Black - no inference
    }

    line.isPickable = false;
    state.previewMesh = line;

    // Update current point to constrained end
    state.currentPoint = constrainedEnd;

    // Calculate and update line length in mm
    const length = Vector3.Distance(start, constrainedEnd);
    setLineMeasurement(Math.round(length * UNIT_TO_MM));
  }, [detectLineAxis, applyAxisLock]);

  // Create/update preview rectangle with modifier support
  const updatePreviewRectangle = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    const state = drawingStateRef.current;
    const mods = shapeModifiersRef.current;

    if (state.previewMesh) {
      state.previewMesh.dispose();
    }

    let width = Math.abs(end.x - start.x);
    let depth = Math.abs(end.z - start.z);

    // Shift key: Lock to square (use larger dimension)
    if (mods.lockSquare) {
      const maxDim = Math.max(width, depth);
      width = maxDim;
      depth = maxDim;
    }

    if (width > 0.01 && depth > 0.01) {
      let centerX: number, centerZ: number;

      // Option key: Draw from center
      if (mods.drawFromCenter) {
        // Start point is center, end point determines size
        centerX = start.x;
        centerZ = start.z;
        // Double the dimensions since we're drawing from center
        width = width * 2;
        depth = depth * 2;
      } else {
        // Normal corner-to-corner drawing
        const signX = end.x >= start.x ? 1 : -1;
        const signZ = end.z >= start.z ? 1 : -1;
        centerX = start.x + (signX * width / 2);
        centerZ = start.z + (signZ * depth / 2);
      }

      // Create wireframe rectangle (4 lines) to avoid z-fighting
      const halfW = width / 2;
      const halfD = depth / 2;
      const y = 0;  // Draw at ground level (Y=0)

      const corners = [
        new Vector3(centerX - halfW, y, centerZ - halfD),
        new Vector3(centerX + halfW, y, centerZ - halfD),
        new Vector3(centerX + halfW, y, centerZ + halfD),
        new Vector3(centerX - halfW, y, centerZ + halfD),
        new Vector3(centerX - halfW, y, centerZ - halfD),  // Close the loop
      ];

      const rect = MeshBuilder.CreateLines('previewRect', {
        points: corners,
        updatable: false,
      }, scene);

      // Change color based on modifiers
      if (mods.drawFromCenter && mods.lockSquare) {
        rect.color = new Color3(0.9, 0.5, 0.9); // Purple for both
      } else if (mods.drawFromCenter) {
        rect.color = new Color3(0.9, 0.6, 0.4); // Orange for center
      } else if (mods.lockSquare) {
        rect.color = new Color3(0.4, 0.9, 0.5); // Green for square
      } else {
        rect.color = new Color3(0.4, 0.6, 1); // Blue default
      }
      rect.isPickable = false;

      state.previewMesh = rect as unknown as Mesh;
    }
  }, []);

  // Finalize line as edge geometry with axis color (SketchUp style - flat line on ground)

  // Split a face with a line (SketchUp-style) - supports diagonal
  const splitFaceWithLine = useCallback((scene: Scene, lineStart: Vector3, lineEnd: Vector3) => {
    // Assign earcut to window for Babylon.js polygon creation
    (window as any).earcut = earcut;
    
    const faces = scene.meshes.filter(m => 
      m.metadata?.type === 'face' && 
      m.name.startsWith('Face_')
    );
    
    for (const face of faces) {
      const bb = face.getBoundingInfo().boundingBox;
      const minX = bb.minimumWorld.x;
      const maxX = bb.maximumWorld.x;
      const minZ = bb.minimumWorld.z;
      const maxZ = bb.maximumWorld.z;
      const faceY = (face as Mesh).position.y;
      const tolerance = 0.05;
      
      // Rectangle corners (counter-clockwise)
      const corners = [
        { x: minX, z: minZ }, // bottom-left
        { x: maxX, z: minZ }, // bottom-right
        { x: maxX, z: maxZ }, // top-right
        { x: minX, z: maxZ }, // top-left
      ];
      const edges = [
        [corners[0], corners[1]], // bottom
        [corners[1], corners[2]], // right
        [corners[2], corners[3]], // top
        [corners[3], corners[0]], // left
      ];
      
      // Find which edges the line endpoints are on
      const findEdgeIndex = (pt: Vector3): number => {
        for (let i = 0; i < edges.length; i++) {
          const [a, b] = edges[i];
          // Check if point is on this edge
          const onEdge = isPointOnSegment(pt.x, pt.z, a.x, a.z, b.x, b.z, tolerance);
          if (onEdge) return i;
        }
        return -1;
      };
      
      const startEdge = findEdgeIndex(lineStart);
      const endEdge = findEdgeIndex(lineEnd);
      
      // Both endpoints must be on different edges
      if (startEdge === -1 || endEdge === -1 || startEdge === endEdge) continue;
      
      // Get intersection points on edges
      const p1 = { x: lineStart.x, z: lineStart.z };
      const p2 = { x: lineEnd.x, z: lineEnd.z };
      
      // Build two polygons by splitting the rectangle
      const poly1Points: Vector3[] = [];
      const poly2Points: Vector3[] = [];
      
      // Walk around corners, splitting at the line endpoints
      let inPoly1 = true;
      for (let i = 0; i < 4; i++) {
        const corner = corners[i];
        if (inPoly1) {
          poly1Points.push(new Vector3(corner.x, 0, corner.z));
        } else {
          poly2Points.push(new Vector3(corner.x, 0, corner.z));
        }
        
        // Check if line crosses after this corner
        if (i === startEdge) {
          poly1Points.push(new Vector3(p1.x, 0, p1.z));
          poly2Points.push(new Vector3(p1.x, 0, p1.z));
          inPoly1 = !inPoly1;
        } else if (i === endEdge) {
          poly1Points.push(new Vector3(p2.x, 0, p2.z));
          poly2Points.push(new Vector3(p2.x, 0, p2.z));
          inPoly1 = !inPoly1;
        }
      }
      
      if (poly1Points.length < 3 || poly2Points.length < 3) continue;
      
      // Create polygon faces
      const origMat = (face as Mesh).material as StandardMaterial;
      const origColor = origMat?.diffuseColor || Color3.FromHexString('#E5E7EB');
      
      // Helper to create face from polygon points
      const createPolyFace = (points: Vector3[]): Mesh | null => {
        if (points.length < 3) return null;

        // Calculate centroid
        let cx = 0, cz = 0;
        points.forEach(p => { cx += p.x; cz += p.z; });
        cx /= points.length;
        cz /= points.length;

        // Convert to local coordinates (relative to centroid)
        let localPoints = points.map(p => new Vector3(p.x - cx, 0, p.z - cz));

        // Ensure counter-clockwise winding (for correct normals in Babylon.js)
        let area = 0;
        for (let i = 0; i < localPoints.length; i++) {
          const j = (i + 1) % localPoints.length;
          area += localPoints[i].x * localPoints[j].z;
          area -= localPoints[j].x * localPoints[i].z;
        }
        if (area > 0) {
          // Clockwise, need to reverse
          localPoints = localPoints.reverse();
        }
        
        const newFace = MeshBuilder.CreatePolygon(`Face_${++meshCounterRef.current}`, {
          shape: localPoints,
          sideOrientation: Mesh.DOUBLESIDE,
          updatable: true
        }, scene);

        // Flip normals to face up (Babylon CreatePolygon may create downward normals)
        newFace.flipFaces(true);

        // Position at centroid
        newFace.position = new Vector3(cx, 0, cz);
        newFace.isPickable = true;
        newFace.refreshBoundingInfo();

        // Calculate width and depth from bounding box for push/pull
        const bb = newFace.getBoundingInfo().boundingBox;
        const faceWidth = bb.maximumWorld.x - bb.minimumWorld.x;
        const faceDepth = bb.maximumWorld.z - bb.minimumWorld.z;

        const mat = new StandardMaterial(`faceMat_${meshCounterRef.current}`, scene);
        mat.diffuseColor = origColor.clone();
        mat.emissiveColor = origColor.scale(0.3);
        mat.specularColor = new Color3(0.2, 0.2, 0.2);
        mat.backFaceCulling = false;
        newFace.material = mat;
        newFace.metadata = {
          type: 'face',
          originalY: 0,
          width: faceWidth,
          depth: faceDepth,
          isPolygon: true,
          polygonPoints: localPoints.map(p => ({ x: p.x, z: p.z }))
        };
        
        // Create edges (in local coordinates)
        const edgeIds: string[] = [];
        for (let i = 0; i < localPoints.length; i++) {
          const p1 = localPoints[i];
          const p2 = localPoints[(i + 1) % localPoints.length];
          const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}_${i}`, {
            points: [new Vector3(p1.x, 0.002, p1.z), new Vector3(p2.x, 0.002, p2.z)],
            updatable: false
          }, scene);
          edge.color = new Color3(0.1, 0.1, 0.1);
          edge.isPickable = true;
          edge.parent = newFace;
          edge.metadata = { type: 'edge', parentFace: newFace };
          edgeIds.push(edge.id);
        }
        newFace.metadata.edgeIds = edgeIds;
        
        return newFace;
      };
      
      try {
        const face1 = createPolyFace(poly1Points);
        const face2 = createPolyFace(poly2Points);

        if (face1 && face2) {
          face.dispose();
          return true;
        }
      } catch (e) {
        console.error('Failed to split face:', e);
      }
    }
    return false;
  }, []);

  // Check if point is on a line segment

  // Split a face with a closed shape (rectangle, circle, polygon) drawn inside it
  // Returns the outer (donut) face if split successful, null otherwise
  const splitFaceWithShape = useCallback((scene: Scene, shapeCorners: Vector3[]): { outerFace: Mesh | null, disposed: boolean } => {
    // Assign earcut to window for Babylon.js polygon creation
    (window as any).earcut = earcut;

    // Find face that completely contains the new shape
    const faces = scene.meshes.filter(m =>
      m.metadata?.type === 'face' &&
      m.name.startsWith('Face_')
    ) as Mesh[];

    for (const face of faces) {
      const bb = face.getBoundingInfo().boundingBox;
      const faceMinX = bb.minimumWorld.x;
      const faceMaxX = bb.maximumWorld.x;
      const faceMinZ = bb.minimumWorld.z;
      const faceMaxZ = bb.maximumWorld.z;

      // Check if ALL shape corners are inside this face
      let allInside = true;
      for (const corner of shapeCorners) {
        if (corner.x < faceMinX || corner.x > faceMaxX ||
            corner.z < faceMinZ || corner.z > faceMaxZ) {
          allInside = false;
          break;
        }
      }

      if (!allInside) continue;

      // Get original face material
      const origMat = face.material as StandardMaterial;
      const origColor = origMat?.diffuseColor || Color3.FromHexString('#E5E7EB');

      // Get outer boundary corners (face corners)
      const outerCorners = [
        new Vector3(faceMinX, 0, faceMinZ),
        new Vector3(faceMaxX, 0, faceMinZ),
        new Vector3(faceMaxX, 0, faceMaxZ),
        new Vector3(faceMinX, 0, faceMaxZ),
      ];

      // Create centroid for outer face
      const outerCx = (faceMinX + faceMaxX) / 2;
      const outerCz = (faceMinZ + faceMaxZ) / 2;

      // Convert to local coordinates
      const outerLocal = outerCorners.map(p => new Vector3(p.x - outerCx, 0, p.z - outerCz));

      // Inner hole (shape) in local coordinates, reversed for hole winding
      const innerLocal = shapeCorners.map(p => new Vector3(p.x - outerCx, 0, p.z - outerCz)).reverse();

      try {
        // Create donut face with hole using CreatePolygon with holes parameter
        const outerFace = MeshBuilder.CreatePolygon(
          `Face_${++meshCounterRef.current}`,
          {
            shape: outerLocal,
            holes: [innerLocal],
            sideOrientation: Mesh.DOUBLESIDE
          },
          scene
        );
        
        // Flip normals to face up
        outerFace.flipFaces(true);

        outerFace.position = new Vector3(outerCx, 0, outerCz);
        outerFace.isPickable = true;
        outerFace.refreshBoundingInfo();

        // Copy exact material properties from original face
        const mat = new StandardMaterial(`faceMat_${meshCounterRef.current}`, scene);
        mat.diffuseColor = origMat?.diffuseColor?.clone() || Color3.FromHexString('#E5E7EB');
        mat.emissiveColor = origMat?.emissiveColor?.clone() || mat.diffuseColor.clone().scale(0.3);
        mat.specularColor = origMat?.specularColor?.clone() || new Color3(0.2, 0.2, 0.2);
        mat.backFaceCulling = false;
        outerFace.material = mat;
        // Store polygon shape data for push/pull extrusion
        outerFace.metadata = {
          type: 'face',
          originalY: 0,
          isPolygon: true,
          shape: outerLocal.map(v => ({ x: v.x, z: v.z })),  // Outer polygon shape in local coords
          holes: [innerLocal.map(v => ({ x: v.x, z: v.z }))]  // Inner holes in local coords
        };

        // Create outer edges
        const outerEdgeIds: string[] = [];
        for (let i = 0; i < outerLocal.length; i++) {
          const p1 = outerLocal[i];
          const p2 = outerLocal[(i + 1) % outerLocal.length];
          const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}_outer_${i}`, {
            points: [new Vector3(p1.x, 0.002, p1.z), new Vector3(p2.x, 0.002, p2.z)],
            updatable: false
          }, scene);
          edge.color = new Color3(0.1, 0.1, 0.1);
          edge.isPickable = true;
          edge.parent = outerFace;
          edge.metadata = { type: 'edge', parentFace: outerFace };
          outerEdgeIds.push(edge.id);
        }
        outerFace.metadata.edgeIds = outerEdgeIds;

        // Dispose original face
        face.dispose();

        console.log(`Face split: created donut face with hole`);
        return { outerFace, disposed: true };
      } catch (e) {
        console.error('Failed to split face with shape:', e);
      }
    }

    return { outerFace: null, disposed: false };
  }, []);

  const isPointOnSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number, tol: number): boolean => {
    const minX = Math.min(ax, bx) - tol;
    const maxX = Math.max(ax, bx) + tol;
    const minZ = Math.min(az, bz) - tol;
    const maxZ = Math.max(az, bz) + tol;
    if (px < minX || px > maxX || pz < minZ || pz > maxZ) return false;
    
    // Check distance to line
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return Math.abs(px - ax) < tol && Math.abs(pz - az) < tol;
    
    const dist = Math.abs((bz - az) * px - (bx - ax) * pz + bx * az - bz * ax) / len;
    return dist < tol;
  };

  // Create edges for polygon face
  const createPolygonEdges = useCallback((scene: Scene, face: Mesh, points: Vector3[], faceY: number) => {
    const edgeIds: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}_${i}`, {
        points: [new Vector3(p1.x - face.position.x, 0.002, p1.z - face.position.z),
                 new Vector3(p2.x - face.position.x, 0.002, p2.z - face.position.z)],
        updatable: false
      }, scene);
      edge.color = new Color3(0.1, 0.1, 0.1);
      edge.isPickable = true;
      edge.parent = face;
      edge.metadata = {
        type: 'edge',
        parentFace: face,
        edgeIndex: i,
        vertexIndices: [i, (i + 1) % points.length],
        localStart: points[i].clone(),
        localEnd: points[(i + 1) % points.length].clone()
      };
      edgeIds.push(edge.id);
    }
    face.metadata.edgeIds = edgeIds;
  }, []);

  // Helper to create edges for a face
  const createFaceEdges = useCallback((scene: Scene, face: Mesh, width: number, depth: number) => {
    const halfW = width / 2;
    const halfD = depth / 2;
    const edgeY = 0;
    const corners = [
      new Vector3(-halfW, edgeY, -halfD),
      new Vector3(+halfW, edgeY, -halfD),
      new Vector3(+halfW, edgeY, +halfD),
      new Vector3(-halfW, edgeY, +halfD),
    ];
    const edgeIds: string[] = [];
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
    edgePairs.forEach((pair, idx) => {
      const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}_${idx}`, {
        points: [corners[pair[0]], corners[pair[1]]],
        updatable: false
      }, scene);
      edge.color = new Color3(0.1, 0.1, 0.1);
      edge.isPickable = true;
      edge.parent = face;
      edge.metadata = {
        type: 'edge',
        parentFace: face,
        edgeIndex: idx,
        vertexIndices: pair,
        localStart: corners[pair[0]].clone(),
        localEnd: corners[pair[1]].clone()
      };
      edgeIds.push(edge.id);
    });
    face.metadata.edgeIds = edgeIds;
  }, []);

  // Stretch face geometry by moving an edge
  const stretchFaceByEdge = useCallback((scene: Scene, edgeMesh: Mesh, delta: Vector3) => {
    const parentFace = edgeMesh.metadata?.parentFace as Mesh;
    if (!parentFace || parentFace.metadata?.type !== 'face') return;

    const edgeIndex = edgeMesh.metadata?.edgeIndex as number;
    const vertexIndices = edgeMesh.metadata?.vertexIndices as number[];
    if (edgeIndex === undefined || !vertexIndices) return;

    // Get current corners from face metadata or calculate from geometry
    let corners = parentFace.metadata?.corners as Vector3[] | undefined;
    if (!corners) {
      // Fallback: calculate from face dimensions
      const width = parentFace.metadata?.width || 1;
      const depth = parentFace.metadata?.depth || 1;
      const halfW = width / 2;
      const halfD = depth / 2;
      corners = [
        new Vector3(-halfW, 0, -halfD),
        new Vector3(+halfW, 0, -halfD),
        new Vector3(+halfW, 0, +halfD),
        new Vector3(-halfW, 0, +halfD),
      ];
    }

    // Clone corners to modify
    const newCorners = corners.map(c => c.clone());

    // Move the vertices that belong to this edge
    vertexIndices.forEach(vi => {
      newCorners[vi].addInPlace(delta);
    });

    // Calculate new face dimensions from corners
    const minX = Math.min(...newCorners.map(c => c.x));
    const maxX = Math.max(...newCorners.map(c => c.x));
    const minZ = Math.min(...newCorners.map(c => c.z));
    const maxZ = Math.max(...newCorners.map(c => c.z));

    const newWidth = maxX - minX;
    const newDepth = maxZ - minZ;
    const newCenterX = (minX + maxX) / 2 + parentFace.position.x;
    const newCenterZ = (minZ + maxZ) / 2 + parentFace.position.z;

    // Don't allow negative or zero dimensions
    if (newWidth <= 0.01 || newDepth <= 0.01) return;

    // Remove old edges
    const oldEdgeIds = parentFace.metadata?.edgeIds as string[] || [];
    oldEdgeIds.forEach(edgeId => {
      const oldEdge = scene.getMeshById(edgeId);
      if (oldEdge) oldEdge.dispose();
    });

    // Update face geometry by scaling and repositioning
    const oldWidth = parentFace.metadata?.width || 1;
    const oldDepth = parentFace.metadata?.depth || 1;
    parentFace.scaling.x = newWidth / oldWidth;
    parentFace.scaling.z = newDepth / oldDepth;
    parentFace.position.x = newCenterX;
    parentFace.position.z = newCenterZ;

    // Recalculate local corners for new edges (after scaling)
    const halfW = newWidth / 2;
    const halfD = newDepth / 2;
    const edgeY = 0;
    const localCorners = [
      new Vector3(-halfW / parentFace.scaling.x, edgeY, -halfD / parentFace.scaling.z),
      new Vector3(+halfW / parentFace.scaling.x, edgeY, -halfD / parentFace.scaling.z),
      new Vector3(+halfW / parentFace.scaling.x, edgeY, +halfD / parentFace.scaling.z),
      new Vector3(-halfW / parentFace.scaling.x, edgeY, +halfD / parentFace.scaling.z),
    ];

    // Create new edges
    const newEdgeIds: string[] = [];
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]];
    edgePairs.forEach((pair, idx) => {
      const newEdge = MeshBuilder.CreateLines(`Edge_stretched_${idx}`, {
        points: [localCorners[pair[0]], localCorners[pair[1]]],
        updatable: false
      }, scene);
      newEdge.color = new Color3(0.1, 0.1, 0.1);
      newEdge.isPickable = true;
      newEdge.parent = parentFace;
      newEdge.metadata = {
        type: 'edge',
        parentFace: parentFace,
        edgeIndex: idx,
        vertexIndices: pair,
        localStart: localCorners[pair[0]].clone(),
        localEnd: localCorners[pair[1]].clone()
      };
      newEdgeIds.push(newEdge.id);
    });

    // Update face metadata
    parentFace.metadata.edgeIds = newEdgeIds;
    parentFace.metadata.width = newWidth;
    parentFace.metadata.depth = newDepth;
    parentFace.metadata.corners = localCorners.map(c => c.clone());

    // Refresh bounding info
    parentFace.refreshBoundingInfo();
  }, []);

  // Detect closed loops and create faces automatically
  const detectAndCreateFace = useCallback((scene: Scene, newEndpoint: Vector3) => {
    const EPSILON = 0.05;

    // Get all standalone edge meshes (not parented to a face)
    const edges = scene.meshes.filter(m =>
      m.name.startsWith('Edge_') &&
      m.metadata?.type === 'edge' &&
      !m.parent &&
      m.metadata?.startPoint &&
      m.metadata?.endPoint
    );

    if (edges.length < 3) return; // Need at least 3 edges for a face

    // Build adjacency graph from edges (2D on XZ plane)
    type Point2D = { x: number; z: number };
    const pointKey = (p: Point2D) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`;

    const graph = new Map<string, { point: Point2D; neighbors: Set<string>; edges: Mesh[] }>();

    for (const edge of edges) {
      const start = edge.metadata.startPoint as Vector3;
      const end = edge.metadata.endPoint as Vector3;
      const startKey = pointKey({ x: start.x, z: start.z });
      const endKey = pointKey({ x: end.x, z: end.z });

      if (!graph.has(startKey)) {
        graph.set(startKey, { point: { x: start.x, z: start.z }, neighbors: new Set(), edges: [] });
      }
      if (!graph.has(endKey)) {
        graph.set(endKey, { point: { x: end.x, z: end.z }, neighbors: new Set(), edges: [] });
      }

      graph.get(startKey)!.neighbors.add(endKey);
      graph.get(startKey)!.edges.push(edge as Mesh);
      graph.get(endKey)!.neighbors.add(startKey);
      graph.get(endKey)!.edges.push(edge as Mesh);
    }

    // Find cycle starting from the new endpoint
    const startKey = pointKey({ x: newEndpoint.x, z: newEndpoint.z });
    if (!graph.has(startKey)) return;

    // BFS to find smallest cycle
    const findCycle = (start: string): string[] | null => {
      const queue: { node: string; path: string[] }[] = [{ node: start, path: [start] }];

      while (queue.length > 0) {
        const { node, path } = queue.shift()!;
        const pathSet = new Set(path);

        const nodeData = graph.get(node);
        if (!nodeData) continue;

        for (const neighbor of nodeData.neighbors) {
          if (neighbor === start && path.length >= 3) {
            return path; // Found a cycle
          }

          // Skip if neighbor is already in current path (would create loop)
          if (!pathSet.has(neighbor)) {
            queue.push({ node: neighbor, path: [...path, neighbor] });
          }
        }
      }
      return null;
    };

    const cycle = findCycle(startKey);
    if (!cycle || cycle.length < 3) return;

    // Convert cycle to polygon points (2D on XZ plane)
    const polygonPoints: Vector3[] = cycle.map(key => {
      const node = graph.get(key)!;
      return new Vector3(node.point.x, 0, node.point.z);
    });

    // Check if face already exists
    const existingFaces = scene.meshes.filter(m =>
      m.metadata?.type === 'face' && !m.parent
    );

    for (const face of existingFaces) {
      const faceCenter = face.getBoundingInfo().boundingBox.centerWorld;
      const polyCenter = polygonPoints.reduce(
        (acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }),
        { x: 0, z: 0 }
      );
      polyCenter.x /= polygonPoints.length;
      polyCenter.z /= polygonPoints.length;

      const dist = Math.sqrt(
        Math.pow(faceCenter.x - polyCenter.x, 2) +
        Math.pow(faceCenter.z - polyCenter.z, 2)
      );
      if (dist < EPSILON) return;
    }

    // Create 2D face on XZ plane
    try {
      meshCounterRef.current++;

      // Calculate center of polygon for proper positioning
      const xs = polygonPoints.map(p => p.x);
      const zs = polygonPoints.map(p => p.z);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
      const width = Math.max(...xs) - Math.min(...xs);
      const depth = Math.max(...zs) - Math.min(...zs);

      // Convert to relative coordinates (relative to center)
      const relativeShape = polygonPoints.map(p => new Vector3(p.x - centerX, 0, p.z - centerZ));

      const newFace = MeshBuilder.CreatePolygon(
        `Face_${meshCounterRef.current}`,
        {
          shape: relativeShape,
          sideOrientation: Mesh.DOUBLESIDE
        },
        scene,
        earcut
      );

      // Position mesh at center of polygon
      newFace.position = new Vector3(centerX, 0, centerZ);

      const faceMat = new StandardMaterial(`FaceMat_${meshCounterRef.current}`, scene);
      faceMat.diffuseColor = new Color3(1, 1, 1);  // White
      faceMat.emissiveColor = new Color3(0.8, 0.8, 0.8);  // Very bright emissive
      faceMat.backFaceCulling = false;
      newFace.material = faceMat;

      newFace.isPickable = true;

      // Store shape as RELATIVE coordinates for push/pull compatibility
      newFace.metadata = {
        type: 'face',
        originalY: 0,
        width: width,
        depth: depth,
        isPolygon: true,
        shape: relativeShape.map(p => ({ x: p.x, z: p.z })),
        holes: []  // No holes for simple closed loop
      };

      const edgeIds: string[] = [];
      for (let i = 0; i < cycle.length; i++) {
        const node = graph.get(cycle[i])!;
        edgeIds.push(...node.edges.map(e => e.id));
      }
      newFace.metadata.edgeIds = [...new Set(edgeIds)];

      console.log(`Face created at center (${centerX.toFixed(2)}, ${centerZ.toFixed(2)}), size ${width.toFixed(2)}x${depth.toFixed(2)}`);
    } catch (e) {
      console.error('Failed to create face:', e);
    }
  }, []);

  const finalizeLine = useCallback((scene: Scene, start: Vector3, end: Vector3): Mesh => {
    const lineInf = lineInferenceRef.current;

    // Apply axis lock constraint
    const constrainedEnd = applyAxisLock(start, end, lineInf.axisLock);

    meshCounterRef.current++;

    // Finalized lines are always black/dark gray
    const lineColor = new Color3(0.1, 0.1, 0.1);

    // Create line using actual Y coordinates
    const linePoints = [
      new Vector3(start.x, start.y, start.z),
      new Vector3(constrainedEnd.x, constrainedEnd.y, constrainedEnd.z)
    ];

    const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}`, {
      points: linePoints,
      updatable: false
    }, scene);

    edge.color = lineColor;
    edge.isPickable = true;
    edge.intersectionThreshold = 0.3; // Make selection easier

    // IMPORTANT: Force bounding info refresh for LinesMesh
    // LinesMesh doesn't automatically compute proper bounding box
    edge.refreshBoundingInfo();

    // Store edge metadata for future operations
    edge.metadata = {
      type: 'edge',
      startPoint: start.clone(),
      endPoint: constrainedEnd.clone()
    };

    // Add endpoints to snap points for future line connections
    const addSnapPoint = (pos: Vector3) => {
      const exists = snapPointsRef.current.some(sp =>
        Vector3.Distance(sp.position, pos) < 0.01
      );
      if (!exists) {
        snapPointsRef.current.push({ position: pos.clone(), type: 'endpoint' });
      }
    };
    addSnapPoint(start);
    addSnapPoint(constrainedEnd);

    // Store the endpoint for continuous drawing mode
    lineInf.lastEndpoint = constrainedEnd.clone();
    setLineInferenceUI(prev => ({ ...prev, lastEndpoint: constrainedEnd.clone() }));

    // Reset axis lock after finalizing (but keep continuous mode)
    lineInf.axisLock = 'none';
    lineInf.inferenceLocked = false;
    setLineInferenceUI(prev => ({ ...prev, axisLock: 'none', inferenceLocked: false }));

    // Try to split any face that this line crosses
    splitFaceWithLine(scene, start, constrainedEnd);

    // Try to detect and create face from closed loop
    detectAndCreateFace(scene, constrainedEnd);

    return edge as unknown as Mesh;
  }, [applyAxisLock, splitFaceWithLine, detectAndCreateFace]);

  // Finalize rectangle as face geometry with modifier support
  const finalizeRectangle = useCallback((scene: Scene, start: Vector3, end: Vector3): Mesh | null => {
    const mods = shapeModifiersRef.current;

    let width = Math.abs(end.x - start.x);
    let depth = Math.abs(end.z - start.z);

    // Shift key: Lock to square
    if (mods.lockSquare) {
      const maxDim = Math.max(width, depth);
      width = maxDim;
      depth = maxDim;
    }

    if (width < 0.1 || depth < 0.1) return null;

    let centerX: number, centerZ: number;

    // Option key: Draw from center
    if (mods.drawFromCenter) {
      centerX = start.x;
      centerZ = start.z;
      width = width * 2;
      depth = depth * 2;
    } else {
      const signX = end.x >= start.x ? 1 : -1;
      const signZ = end.z >= start.z ? 1 : -1;
      centerX = start.x + (signX * width / 2);
      centerZ = start.z + (signZ * depth / 2);
    }

    // Calculate world corners for face splitting check
    const worldCorners = [
      new Vector3(centerX - width / 2, 0, centerZ - depth / 2),
      new Vector3(centerX + width / 2, 0, centerZ - depth / 2),
      new Vector3(centerX + width / 2, 0, centerZ + depth / 2),
      new Vector3(centerX - width / 2, 0, centerZ + depth / 2),
    ];

    // Try to split any containing face (coplanar face merging)
    splitFaceWithShape(scene, worldCorners);

    meshCounterRef.current++;
    const face = MeshBuilder.CreateGround(`Face_${meshCounterRef.current}`, {
      width,
      height: depth,
    }, scene);
    face.position = new Vector3(centerX, 0, centerZ);
    face.isPickable = true;
    // Refresh bounding info after position change for box selection
    face.refreshBoundingInfo();

    const faceMat = new StandardMaterial(`faceMat_${meshCounterRef.current}`, scene);
    faceMat.diffuseColor = Color3.FromHexString(selectedColor);
    faceMat.emissiveColor = Color3.FromHexString(selectedColor).scale(0.3);
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    faceMat.backFaceCulling = false;
    face.material = faceMat;

    face.metadata = {
      type: 'face',
      width,
      depth,
      originalY: 0,
    };

    // Create individual edge tubes parented to face (pickable)
    const halfW = width / 2;
    const halfD = depth / 2;
    const edgeY = 0; // Slightly above face to prevent z-fighting (local Y)
    // Local coordinates relative to face center
    const corners = [
      new Vector3(-halfW, edgeY, -halfD), // 0: bottom-left
      new Vector3(+halfW, edgeY, -halfD), // 1: bottom-right
      new Vector3(+halfW, edgeY, +halfD), // 2: top-right
      new Vector3(-halfW, edgeY, +halfD), // 3: top-left
    ];

    const edgeIds: string[] = [];
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0]]; // 4 edges
    edgePairs.forEach((pair, idx) => {
      const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}_${idx}`, {
        points: [corners[pair[0]], corners[pair[1]]],
        updatable: false
      }, scene);
      edge.color = new Color3(0.1, 0.1, 0.1);
      edge.isPickable = true;
      edge.parent = face;
      edge.metadata = {
        type: 'edge',
        parentFace: face,
        edgeIndex: idx,
        vertexIndices: pair,
        localStart: corners[pair[0]].clone(),
        localEnd: corners[pair[1]].clone()
      };
      edgeIds.push(edge.id);
    });

    // Store edge references and corners in face metadata
    face.metadata.edgeIds = edgeIds;
    face.metadata.corners = corners.map(c => c.clone());

    // Reset modifiers after finalizing
    const resetMods = {
      drawFromCenter: false,
      lockSquare: false,
      axisLock: 'none' as const,
    };
    shapeModifiersRef.current = resetMods;
    setShapeModifiersUI(resetMods);

    return face;
  }, [selectedColor, splitFaceWithShape]);

  // Create/update preview circle with modifier support
  const updatePreviewCircle = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    const state = drawingStateRef.current;
    const mods = shapeModifiersRef.current;

    if (state.previewMesh) {
      state.previewMesh.dispose();
    }

    // Calculate radius from start to end point
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    let radius = Math.sqrt(dx * dx + dz * dz);

    if (radius > 0.05) {
      let centerX: number, centerZ: number;

      // Option key: Draw from center (start point is center)
      if (mods.drawFromCenter) {
        centerX = start.x;
        centerZ = start.z;
      } else {
        // Normal mode: start point is edge, radius determines size
        // Center is at start point, radius extends to end point
        centerX = start.x;
        centerZ = start.z;
      }

      // Create disc mesh for preview
      const disc = MeshBuilder.CreateDisc('previewCircle', {
        radius: radius,
        tessellation: 48
      }, scene);
      disc.rotation.x = Math.PI / 2; // Rotate to be horizontal
      disc.position = new Vector3(centerX, 0, centerZ);  // Very slightly above ground (5mm)

      const mat = new StandardMaterial('previewCircleMat', scene);

      // Change color based on modifiers
      if (mods.drawFromCenter && mods.lockSquare) {
        mat.diffuseColor = new Color3(0.9, 0.5, 0.9); // Purple for both
      } else if (mods.drawFromCenter) {
        mat.diffuseColor = new Color3(0.9, 0.6, 0.4); // Orange for center
      } else if (mods.lockSquare) {
        mat.diffuseColor = new Color3(0.4, 0.9, 0.5); // Green for locked
      } else {
        mat.diffuseColor = new Color3(0.4, 0.5, 0.9); // Blue default
      }
      mat.alpha = 0.4;
      disc.material = mat;
      disc.isPickable = false;

      // Enable edge rendering for preview outline
      disc.enableEdgesRendering();
      disc.edgesWidth = 2.0;
      disc.edgesColor = new Color4(0.4, 0.6, 1, 1);

      state.previewMesh = disc;
    }
  }, []);

  // Finalize circle as face geometry with modifier support
  const finalizeCircle = useCallback((scene: Scene, start: Vector3, end: Vector3): Mesh | null => {
    const mods = shapeModifiersRef.current;

    const dx = end.x - start.x;
    const dz = end.z - start.z;
    let radius = Math.sqrt(dx * dx + dz * dz);

    if (radius < 0.1) return null;

    let centerX: number, centerZ: number;

    if (mods.drawFromCenter) {
      centerX = start.x;
      centerZ = start.z;
    } else {
      centerX = start.x;
      centerZ = start.z;
    }

    // Calculate circle points for face splitting check
    const circleCorners: Vector3[] = [];
    const splitSegments = 24; // Use fewer segments for splitting detection
    for (let i = 0; i < splitSegments; i++) {
      const angle = (i / splitSegments) * Math.PI * 2;
      circleCorners.push(new Vector3(
        centerX + Math.cos(angle) * radius,
        0,
        centerZ + Math.sin(angle) * radius
      ));
    }

    // Try to split any containing face (coplanar face merging)
    splitFaceWithShape(scene, circleCorners);

    meshCounterRef.current++;
    const disc = MeshBuilder.CreateDisc(`Circle_${meshCounterRef.current}`, {
      radius: radius,
      tessellation: 48
    }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.position = new Vector3(centerX, 0, centerZ);
    disc.isPickable = true;
    // Refresh bounding info after position/rotation change for box selection
    disc.refreshBoundingInfo();

    const faceMat = new StandardMaterial(`circleMat_${meshCounterRef.current}`, scene);
    faceMat.diffuseColor = Color3.FromHexString(selectedColor);
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    disc.material = faceMat;

    // Store metadata
    (disc as any).faceData = {
      type: 'circle',
      centerX,
      centerZ,
      radius,
      originalY: 0,
    };

    // Create edge line parented to disc (circular outline - moves with face)
    const edgeY = 0; // Local Y relative to disc
    const segments = 48;
    const circlePoints: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      // Local coordinates relative to disc center
      circlePoints.push(new Vector3(
        Math.cos(angle) * radius,
        edgeY,
        Math.sin(angle) * radius
      ));
    }

    const edgeLines = MeshBuilder.CreateLines(`CircleEdge_${meshCounterRef.current}`, {
      points: circlePoints,
    }, scene);
    edgeLines.color = new Color3(0.15, 0.15, 0.15);
    edgeLines.isPickable = false;
    edgeLines.parent = disc; // Parent to disc so edge moves with it
    edgeLines.metadata = { type: 'edge', parentFaceId: disc.id };

    // Store edge reference in face metadata
    disc.metadata = {
      ...(disc as any).faceData,
      type: 'face',
      edgeIds: [edgeLines.id],
    };

    // Reset modifiers after finalizing
    const resetMods = {
      drawFromCenter: false,
      lockSquare: false,
      axisLock: 'none' as const,
    };
    shapeModifiersRef.current = resetMods;
    setShapeModifiersUI(resetMods);

    return disc;
  }, [selectedColor, splitFaceWithShape]);

  // Create/update preview polygon with modifier support
  const updatePreviewPolygon = useCallback((scene: Scene, start: Vector3, end: Vector3, sides: number = 6) => {
    const state = drawingStateRef.current;
    const mods = shapeModifiersRef.current;

    if (state.previewMesh) {
      state.previewMesh.dispose();
    }

    const dx = end.x - start.x;
    const dz = end.z - start.z;
    let radius = Math.sqrt(dx * dx + dz * dz);

    if (radius > 0.05) {
      let centerX: number, centerZ: number;

      if (mods.drawFromCenter) {
        centerX = start.x;
        centerZ = start.z;
      } else {
        centerX = start.x;
        centerZ = start.z;
      }

      // Calculate angle for orientation (vertex to cursor)
      let angle = Math.atan2(dz, dx);

      // Axis snapping (tolerance ~5 degrees = 0.087 radians)
      const snapTolerance = 0.087;
      const PI = Math.PI;
      const TWO_PI = PI * 2;

      // Normalize angle to [0, 2PI)
      let normalizedAngle = angle;
      if (normalizedAngle < 0) normalizedAngle += TWO_PI;

      // Snap to 0 (East / +X)
      if (normalizedAngle < snapTolerance || normalizedAngle > TWO_PI - snapTolerance) {
        angle = 0;
      }
      // Snap to 90 (North / +Z) - Note: atan2(z, x) means +Z is 90 deg
      else if (Math.abs(normalizedAngle - PI / 2) < snapTolerance) {
        angle = PI / 2;
      }
      // Snap to 180 (West / -X)
      else if (Math.abs(normalizedAngle - PI) < snapTolerance) {
        angle = PI;
      }
      // Snap to 270 (South / -Z)
      else if (Math.abs(normalizedAngle - 3 * PI / 2) < snapTolerance) {
        angle = 3 * PI / 2;
      }

      // Create polygon wireframe using lines
      const points: Vector3[] = [];
      for (let i = 0; i <= sides; i++) {
        const theta = (i / sides) * 2 * Math.PI;
        // Create points in XZ plane (Y=0), rotated by -angle
        // We apply rotation manually to points because CreateLines doesn't support rotation property easily on creation
        // Actually, we can just create it aligned and rotate the mesh like before.
        points.push(new Vector3(
          Math.cos(theta) * radius,
          0,
          Math.sin(theta) * radius
        ));
      }

      const polygon = MeshBuilder.CreateLines('previewPolygon', {
        points: points,
        updatable: false
      }, scene);

      // Apply rotation to align vertex with cursor (or snapped axis)
      // CreateLines creates points in local space. We rotate the whole mesh.
      // Points were created starting at angle 0 (+X).
      // We want vertex 0 to point to 'angle'.
      // In Babylon (Y-up), rotation.y rotates around vertical axis.
      // But we are drawing on ground... wait, previous code used rotation.x = PI/2 for Disc.
      // CreateLines is already 3D lines. If we generate points with Y=0, they are on the ground.
      // So we just need rotation.y (yaw) to rotate around vertical axis.
      // Previous Disc was in XY plane and rotated X to lie flat.
      // Lines are already in XZ plane.

      // So, rotation.y = -angle (left-handed system, positive angle is CCW from top? No, Babylon is left handed)
      // atan2(z, x) gives angle CCW from +X.
      // Babylon rotation.y: +rotation is clockwise? No, standard is CCW about +Y.
      // Let's stick to -angle which worked for the Disc (after X rotation).
      // For lines on ground (Y=0), rotation.y should be -angle.

      polygon.rotation.y = -angle;
      polygon.position = new Vector3(centerX, 0, centerZ);  // Very slightly above ground (5mm)

      // Set color based on modifiers
      let color: Color3;
      if (mods.drawFromCenter && mods.lockSquare) {
        color = new Color3(0.9, 0.5, 0.9);
      } else if (mods.drawFromCenter) {
        color = new Color3(0.9, 0.6, 0.4);
      } else if (mods.lockSquare) {
        color = new Color3(0.4, 0.9, 0.5);
      } else {
        color = new Color3(0.4, 0.5, 0.9);
      }
      polygon.color = color;
      polygon.isPickable = false;

      state.previewMesh = polygon;
    }
  }, []);

  // Finalize polygon as face geometry with modifier support
  const finalizePolygon = useCallback((scene: Scene, start: Vector3, end: Vector3, sides: number = 6): Mesh | null => {
    const mods = shapeModifiersRef.current;

    const dx = end.x - start.x;
    const dz = end.z - start.z;
    let radius = Math.sqrt(dx * dx + dz * dz);

    if (radius < 0.1) return null;

    let centerX: number, centerZ: number;

    if (mods.drawFromCenter) {
      centerX = start.x;
      centerZ = start.z;
    } else {
      centerX = start.x;
      centerZ = start.z;
    }

    // Calculate polygon points for face splitting check
    const polygonCorners: Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const polyAngle = (i / sides) * Math.PI * 2;
      polygonCorners.push(new Vector3(
        centerX + Math.cos(polyAngle) * radius,
        0,
        centerZ + Math.sin(polyAngle) * radius
      ));
    }

    // Try to split any containing face (coplanar face merging)
    splitFaceWithShape(scene, polygonCorners);

    meshCounterRef.current++;
    const polygon = MeshBuilder.CreateDisc(`Polygon_${meshCounterRef.current}`, {
      radius: radius,
      tessellation: sides
    }, scene);

    // Calculate angle for orientation
    let angle = Math.atan2(dz, dx);

    // Axis snapping (tolerance ~5 degrees = 0.087 radians)
    const snapTolerance = 0.087;
    const PI = Math.PI;
    const TWO_PI = PI * 2;

    // Normalize angle to [0, 2PI)
    let normalizedAngle = angle;
    if (normalizedAngle < 0) normalizedAngle += TWO_PI;

    // Snap to 0 (East / +X)
    if (normalizedAngle < snapTolerance || normalizedAngle > TWO_PI - snapTolerance) {
      angle = 0;
    }
    // Snap to 90 (North / +Z)
    else if (Math.abs(normalizedAngle - PI / 2) < snapTolerance) {
      angle = PI / 2;
    }
    // Snap to 180 (West / -X)
    else if (Math.abs(normalizedAngle - PI) < snapTolerance) {
      angle = PI;
    }
    // Snap to 270 (South / -Z)
    else if (Math.abs(normalizedAngle - 3 * PI / 2) < snapTolerance) {
      angle = 3 * PI / 2;
    }

    polygon.rotation.x = Math.PI / 2;
    polygon.rotation.z = -angle;

    polygon.position = new Vector3(centerX, 0, centerZ);
    polygon.isPickable = true;
    // Refresh bounding info after position/rotation change for box selection
    polygon.refreshBoundingInfo();

    const faceMat = new StandardMaterial(`polygonMat_${meshCounterRef.current}`, scene);
    faceMat.diffuseColor = Color3.FromHexString(selectedColor);
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    polygon.material = faceMat;

    polygon.metadata = {
      type: 'face',
      centerX,
      centerZ,
      radius,
      sides,
      originalY: 0,
      edgeIds: [] as string[],
    };

    // Create individual edge lines parented to polygon (so they move together)
    const edgeY = 0; // Local Y offset above face
    const vertices: Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      // Local vertices relative to polygon center (include rotation.z angle)
      const vertexAngle = angle + (i / sides) * Math.PI * 2;
      // Since polygon is rotated x=PI/2, local XY -> world XZ
      // We create in XZ local space and let parenting handle the rest
      vertices.push(new Vector3(
        Math.cos(vertexAngle) * radius,
        edgeY,
        Math.sin(vertexAngle) * radius
      ));
    }

    const edgeIds: string[] = [];
    for (let i = 0; i < sides; i++) {
      const nextIdx = (i + 1) % sides;
      const edge = MeshBuilder.CreateLines(`PolygonEdge_${meshCounterRef.current}_${i}`, {
        points: [vertices[i], vertices[nextIdx]],
      }, scene);
      edge.color = new Color3(0.15, 0.15, 0.15);
      edge.isPickable = false;
      edge.parent = polygon; // Parent to polygon so edges move with it
      edge.metadata = { type: 'edge', parentFaceId: polygon.id };
      edgeIds.push(edge.id);
    }

    polygon.metadata.edgeIds = edgeIds;

    const resetMods = {
      drawFromCenter: false,
      lockSquare: false,
      axisLock: 'none' as const,
    };
    shapeModifiersRef.current = resetMods;
    setShapeModifiersUI(resetMods);

    return polygon;
  }, [selectedColor, splitFaceWithShape]);

  // Add snap points for line (start point, end point, and midpoint)
  const addLineSnapPoints = useCallback((start: Vector3, end: Vector3) => {
    // Endpoint positions
    const startPos = new Vector3(start.x, 0, start.z);
    const endPos = new Vector3(end.x, 0, end.z);
    // Midpoint position
    const midPos = new Vector3((start.x + end.x) / 2, 0, (start.z + end.z) / 2);

    const newPoints: { position: Vector3; type: 'endpoint' | 'midpoint' }[] = [
      { position: startPos, type: 'endpoint' },
      { position: endPos, type: 'endpoint' },
      { position: midPos, type: 'midpoint' },
    ];

    newPoints.forEach(point => {
      // Check if point already exists
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, point.position) < 0.1);
      if (!exists) {
        snapPointsRef.current.push(point);
      }
    });
  }, []);

  // Add snap points for rectangle (4 corners + 4 edge midpoints)
  const addRectangleSnapPoints = useCallback((start: Vector3, end: Vector3) => {
    // 4 corners (endpoints)
    const corners = [
      new Vector3(start.x, 0, start.z),
      new Vector3(end.x, 0, start.z),
      new Vector3(end.x, 0, end.z),
      new Vector3(start.x, 0, end.z),
    ];

    // 4 edge midpoints
    const midpoints = [
      new Vector3((start.x + end.x) / 2, 0, start.z),  // Top edge midpoint
      new Vector3(end.x, 0, (start.z + end.z) / 2),    // Right edge midpoint
      new Vector3((start.x + end.x) / 2, 0, end.z),    // Bottom edge midpoint
      new Vector3(start.x, 0, (start.z + end.z) / 2),  // Left edge midpoint
    ];

    // Add corners as endpoints
    corners.forEach(corner => {
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, corner) < 0.1);
      if (!exists) {
        snapPointsRef.current.push({ position: corner, type: 'endpoint' });
      }
    });

    // Add midpoints
    midpoints.forEach(midpoint => {
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, midpoint) < 0.1);
      if (!exists) {
        snapPointsRef.current.push({ position: midpoint, type: 'midpoint' });
      }
    });
  }, []);

  // Add snap points for 3D solid (8 corners + 12 edge midpoints)
  const addSolidSnapPoints = useCallback((solid: Mesh) => {
    if (!solid.metadata || solid.metadata.type !== 'solid') return;

    const { width, height, depth } = solid.metadata;
    const pos = solid.position;
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;

    // 8 corners in world coordinates
    const corners = [
      new Vector3(pos.x - hw, pos.y - hh, pos.z - hd), // 0: bottom back left
      new Vector3(pos.x - hw, pos.y - hh, pos.z + hd), // 1: bottom front left
      new Vector3(pos.x + hw, pos.y - hh, pos.z + hd), // 2: bottom front right
      new Vector3(pos.x + hw, pos.y - hh, pos.z - hd), // 3: bottom back right
      new Vector3(pos.x - hw, pos.y + hh, pos.z - hd), // 4: top back left
      new Vector3(pos.x - hw, pos.y + hh, pos.z + hd), // 5: top front left
      new Vector3(pos.x + hw, pos.y + hh, pos.z + hd), // 6: top front right
      new Vector3(pos.x + hw, pos.y + hh, pos.z - hd), // 7: top back right
    ];

    // 12 edge indices for midpoint calculation
    const edgeIndices = [
      [0, 1], [1, 2], [2, 3], [3, 0], // bottom ring
      [4, 5], [5, 6], [6, 7], [7, 4], // top ring
      [0, 4], [1, 5], [2, 6], [3, 7], // vertical edges
    ];

    // Add corners as endpoints
    corners.forEach(corner => {
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, corner) < 0.1);
      if (!exists) {
        snapPointsRef.current.push({ position: corner, type: 'endpoint' });
      }
    });

    // Add edge midpoints
    edgeIndices.forEach(([i, j]) => {
      const midpoint = corners[i].add(corners[j]).scale(0.5);
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, midpoint) < 0.1);
      if (!exists) {
        snapPointsRef.current.push({ position: midpoint, type: 'midpoint' });
      }
    });

    console.log('[Snap] Added solid snap points:', {
      corners: corners.length,
      midpoints: edgeIndices.length,
      total: snapPointsRef.current.length
    });
  }, []);

  // Show snap indicator - change cursor color based on snap type
  // Endpoint/Origin: Green, Midpoint: Cyan (sky blue), On-edge: Red
  const showSnapIndicator = useCallback((snapType: 'endpoint' | 'midpoint' | 'origin' | 'onedge') => {
    // Cursor position is handled by pointer observer - just change color here
    const pointerCircle = pointerCircleRef.current;
    if (pointerCircle) {
      if (snapType === 'midpoint') {
        pointerCircle.color = '#00BFFF';  // Deep sky blue border for midpoint
        pointerCircle.background = '#87CEEB';  // Light sky blue fill for midpoint
      } else if (snapType === 'onedge') {
        pointerCircle.color = '#FF4444';  // Red border for on-edge
        pointerCircle.background = '#FF6666';  // Light red fill for on-edge
      } else {
        pointerCircle.color = '#90EE90';  // Light green border for endpoint/origin
        pointerCircle.background = '#FFFFFF';  // White fill for endpoint/origin
      }
    }
  }, []);

  // Hide snap indicator - reset cursor color
  const hideSnapIndicator = useCallback(() => {
    const pointerCircle = pointerCircleRef.current;
    if (pointerCircle) {
      pointerCircle.color = 'rgba(0, 122, 255, 0.9)';
      pointerCircle.background = 'rgba(0, 122, 255, 0.3)';
    }
  }, []);

  // Find nearest snap point to a position (uses dynamic threshold based on camera distance)
  // Returns snap point data with type information for visual feedback
  const findNearestSnapPoint = useCallback((position: Vector3): SnapPointData | null => {
    const camera = cameraRef.current;
    // Dynamic threshold: scales with camera distance for consistent "screen feel"
    // When zoomed out (large radius), larger threshold; when zoomed in, smaller threshold
    // Minimum of 1.0 world units ensures snap works well even when zoomed in very close
    const snapThreshold = camera ? Math.max(camera.radius * SNAP_THRESHOLD_BASE, 1.0) : 2.0;

    let nearest: SnapPointData | null = null;
    let minDist = snapThreshold;

    // Check origin first (highest priority snap point)
    const distToOrigin = Vector3.Distance(position, Vector3.Zero());
    if (distToOrigin < minDist) {
      minDist = distToOrigin;
      nearest = { position: Vector3.Zero(), type: 'origin' };
    }

    // Check all snap points (endpoints, midpoints, etc.)
    for (const snapPoint of snapPointsRef.current) {
      // Use 2D distance (XZ plane) for snap detection in screen space
      // But preserve the actual 3D position (including Y) for proper snapping
      const dx = position.x - snapPoint.position.x;
      const dz = position.z - snapPoint.position.z;
      const dist2D = Math.sqrt(dx * dx + dz * dz);
      if (dist2D < minDist) {
        minDist = dist2D;
        // Preserve actual Y coordinate for 3D snapping (top edges, etc.)
        nearest = {
          position: snapPoint.position.clone(),
          type: snapPoint.type
        };
      }
    }

    return nearest;
  }, []);

  // Helper: Check if polygon vertices are clockwise (in XZ plane, looking from +Y)
  const isPolygonClockwise = (vertices: Vector3[]): boolean => {
    let sum = 0;
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      sum += (v2.x - v1.x) * (v2.z + v1.z);
    }
    return sum > 0;
  };

  // Push/Pull for polygon faces with holes (donut shapes)
  // Uses ExtrudePolygon - shape must be CCW, holes must be CW
  const applyPushPullPolygon = useCallback((face: Mesh, distance: number, faceNormal: Vector3, scene: Scene): Mesh | null => {
    const { shape, holes } = face.metadata;
    const baseCenter = face.getAbsolutePosition().clone();
    const height = Math.abs(distance);

    meshCounterRef.current++;
    const solidId = meshCounterRef.current;

    // Convert stored shape data back to Vector3 arrays
    let outerShape = shape.map((p: { x: number; z: number }) => new Vector3(p.x, 0, p.z));
    let innerHoles = holes.map((hole: Array<{ x: number; z: number }>) =>
      hole.map((p: { x: number; z: number }) => new Vector3(p.x, 0, p.z))
    );

    // Ensure correct winding order: outer CCW, holes CW
    if (isPolygonClockwise(outerShape)) {
      outerShape = outerShape.slice().reverse();
    }
    innerHoles = innerHoles.map((hole: Vector3[]) => {
      if (!isPolygonClockwise(hole)) {
        return hole.slice().reverse();
      }
      return hole;
    });

    console.log('[PushPullPolygon] Creating individual face meshes, height:', height);

    // Create parent solid container
    const solid = new Mesh(`Solid_${solidId}`, scene);
    solid.position = baseCenter.clone();
    solid.isPickable = false;
    solid.metadata = {
      type: 'solid',
      isPolygon: true,
      shape: shape,
      holes: holes
    };

    // Helper to create face material
    const createFaceMat = (name: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = new Color3(1, 1, 1);
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      mat.backFaceCulling = false;
      return mat;
    };

    // Helper to create donut face (polygon with hole) using earcut
    const createDonutFace = (yPos: number, flipNormal: boolean, nameSuffix: string): Mesh => {
      const n = outerShape.length;
      const holeN = innerHoles.length > 0 ? innerHoles[0].length : 0;

      // Build flat points for earcut
      const outerFlat: number[] = [];
      outerShape.forEach(v => outerFlat.push(v.x, v.z));

      const holeFlat: number[] = [];
      if (innerHoles.length > 0) {
        innerHoles[0].forEach(v => holeFlat.push(v.x, v.z));
      }

      const combinedFlat = [...outerFlat, ...holeFlat];
      const holeIndices = innerHoles.length > 0 ? [n] : [];

      const triIndices = earcut(combinedFlat, holeIndices);

      // Build positions and normals
      const positions: number[] = [];
      const normals: number[] = [];
      const normalY = flipNormal ? -1 : 1;

      outerShape.forEach(v => {
        positions.push(v.x, yPos, v.z);
        normals.push(0, normalY, 0);
      });
      if (innerHoles.length > 0) {
        innerHoles[0].forEach(v => {
          positions.push(v.x, yPos, v.z);
          normals.push(0, normalY, 0);
        });
      }

      // Flip triangle winding if needed
      const indices = flipNormal
        ? triIndices.map((_, i, arr) => arr[i - i % 3 + (2 - i % 3)])
        : triIndices;

      const faceMesh = new Mesh(`Face_${solidId}_${nameSuffix}`, scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = normals;
      vertexData.applyToMesh(faceMesh);

      faceMesh.material = createFaceMat(`FaceMat_${solidId}_${nameSuffix}`);
      faceMesh.isPickable = true;
      faceMesh.parent = solid;
      faceMesh.metadata = {
        type: 'face',
        isPolygon: true,
        parentSolid: solid,
        faceDir: nameSuffix,
        shape: shape,
        holes: holes
      };

      return faceMesh;
    };

    // Helper to create quad wall face
    const createWallFace = (p1: Vector3, p2: Vector3, yBottom: number, yTop: number, nameSuffix: string, isInner: boolean): Mesh => {
      // Calculate face center for positioning
      const cx = (p1.x + p2.x) / 2;
      const cy = (yBottom + yTop) / 2;
      const cz = (p1.z + p2.z) / 2;

      // Local coordinates relative to center
      const dx1 = p1.x - cx, dz1 = p1.z - cz;
      const dx2 = p2.x - cx, dz2 = p2.z - cz;
      const dyBottom = yBottom - cy, dyTop = yTop - cy;

      // Quad vertices (2 triangles)
      // For outer walls: looking from outside, vertices go CCW
      // For inner walls: looking from inside (into the hole), vertices go CCW
      const positions = isInner
        ? [
            dx1, dyBottom, dz1,  // bottom-left
            dx2, dyBottom, dz2,  // bottom-right
            dx2, dyTop, dz2,     // top-right
            dx1, dyTop, dz1      // top-left
          ]
        : [
            dx2, dyBottom, dz2,  // bottom-right
            dx1, dyBottom, dz1,  // bottom-left
            dx1, dyTop, dz1,     // top-left
            dx2, dyTop, dz2      // top-right
          ];

      const indices = [0, 1, 2, 0, 2, 3];

      // Calculate normal (cross product of edges)
      const edge1 = new Vector3(positions[3] - positions[0], positions[4] - positions[1], positions[5] - positions[2]);
      const edge2 = new Vector3(positions[6] - positions[0], positions[7] - positions[1], positions[8] - positions[2]);
      const normal = Vector3.Cross(edge1, edge2).normalize();

      const faceNormals = [
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z,
        normal.x, normal.y, normal.z
      ];

      const wallMesh = new Mesh(`Face_${solidId}_${nameSuffix}`, scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.normals = faceNormals;
      vertexData.applyToMesh(wallMesh);

      wallMesh.position = new Vector3(cx, cy, cz);
      wallMesh.material = createFaceMat(`FaceMat_${solidId}_${nameSuffix}`);
      wallMesh.isPickable = true;
      wallMesh.parent = solid;

      // Calculate wall dimensions for metadata
      const wallWidth = Math.sqrt((p2.x - p1.x) ** 2 + (p2.z - p1.z) ** 2);
      const wallHeight = yTop - yBottom;

      wallMesh.metadata = {
        type: 'face',
        width: wallWidth,
        depth: wallHeight,
        parentSolid: solid,
        faceDir: nameSuffix,
        faceNormal: { x: normal.x, y: normal.y, z: normal.z }  // Store actual normal for push/pull
      };

      // Create edges for this wall face
      const worldP1Bottom = new Vector3(p1.x, yBottom, p1.z);
      const worldP2Bottom = new Vector3(p2.x, yBottom, p2.z);
      const worldP1Top = new Vector3(p1.x, yTop, p1.z);
      const worldP2Top = new Vector3(p2.x, yTop, p2.z);

      // Bottom edge
      const bottomEdge = MeshBuilder.CreateLines(`WallEdge_${solidId}_${nameSuffix}_bottom`, {
        points: [worldP1Bottom, worldP2Bottom],
        updatable: false
      }, scene);
      bottomEdge.color = new Color3(0.1, 0.1, 0.1);
      bottomEdge.isPickable = false;
      bottomEdge.parent = solid;

      // Top edge
      const topEdge = MeshBuilder.CreateLines(`WallEdge_${solidId}_${nameSuffix}_top`, {
        points: [worldP1Top, worldP2Top],
        updatable: false
      }, scene);
      topEdge.color = new Color3(0.1, 0.1, 0.1);
      topEdge.isPickable = false;
      topEdge.parent = solid;

      // Vertical edges
      const leftEdge = MeshBuilder.CreateLines(`WallEdge_${solidId}_${nameSuffix}_left`, {
        points: [worldP1Bottom, worldP1Top],
        updatable: false
      }, scene);
      leftEdge.color = new Color3(0.1, 0.1, 0.1);
      leftEdge.isPickable = false;
      leftEdge.parent = solid;

      const rightEdge = MeshBuilder.CreateLines(`WallEdge_${solidId}_${nameSuffix}_right`, {
        points: [worldP2Bottom, worldP2Top],
        updatable: false
      }, scene);
      rightEdge.color = new Color3(0.1, 0.1, 0.1);
      rightEdge.isPickable = false;
      rightEdge.parent = solid;

      return wallMesh;
    };

    // Helper to create edge line
    const createEdge = (ep1: Vector3, ep2: Vector3, idx: string) => {
      const edge = MeshBuilder.CreateLines(`Edge_${solidId}_${idx}`, {
        points: [ep1, ep2],
        updatable: false
      }, scene);
      edge.color = new Color3(0.1, 0.1, 0.1);
      edge.isPickable = true;
      edge.parent = solid;
      edge.metadata = { type: 'edge', parentSolid: solid };
    };

    try {
      // Create top face (donut at Y = height)
      createDonutFace(height, false, 'top');

      // Create bottom face (donut at Y = 0)
      createDonutFace(0, true, 'bottom');

      // Create outer wall faces
      for (let i = 0; i < outerShape.length; i++) {
        const p1 = outerShape[i];
        const p2 = outerShape[(i + 1) % outerShape.length];
        createWallFace(p1, p2, 0, height, `outer_${i}`, false);

        // Create edges
        createEdge(new Vector3(p1.x, height, p1.z), new Vector3(p2.x, height, p2.z), `outer_top_${i}`);
        createEdge(new Vector3(p1.x, 0, p1.z), new Vector3(p2.x, 0, p2.z), `outer_bottom_${i}`);
        createEdge(new Vector3(p1.x, 0, p1.z), new Vector3(p1.x, height, p1.z), `outer_vert_${i}`);
      }

      // Create inner wall faces (around holes)
      for (let h = 0; h < innerHoles.length; h++) {
        const hole = innerHoles[h];
        for (let i = 0; i < hole.length; i++) {
          const p1 = hole[i];
          const p2 = hole[(i + 1) % hole.length];
          createWallFace(p1, p2, 0, height, `inner_${h}_${i}`, true);

          // Create edges
          createEdge(new Vector3(p1.x, height, p1.z), new Vector3(p2.x, height, p2.z), `inner_${h}_top_${i}`);
          createEdge(new Vector3(p1.x, 0, p1.z), new Vector3(p2.x, 0, p2.z), `inner_${h}_bottom_${i}`);
          createEdge(new Vector3(p1.x, 0, p1.z), new Vector3(p1.x, height, p1.z), `inner_${h}_vert_${i}`);
        }
      }

      // Dispose original face and its edge children
      face.getChildMeshes().forEach(child => child.dispose());
      face.dispose();

      solid.computeWorldMatrix(true);

      console.log(`[PushPullPolygon] Created solid with ${outerShape.length} outer walls + ${innerHoles.reduce((sum, h) => sum + h.length, 0)} inner walls`);
      return solid;
    } catch (e) {
      console.error('Failed to create polygon solid:', e);
      return null;
    }
  }, [selectedColor]);

  // Push/Pull functionality - SketchUp-style face extrusion
  // Creates 6 individual pickable faces + 12 edges for full selectability
  // copyMode: When true, creates a separate solid without modifying the original (Option key)
  const applyPushPull = useCallback((face: Mesh, distance: number, faceNormal: Vector3, copyMode: boolean = false): Mesh | null => {
    console.log('[PushPull] applyPushPull called:', { distance, faceNormal: faceNormal.toString(), faceDir: face.metadata?.faceDir, copyMode });
    if (!face.metadata || face.metadata.type !== 'face') return null;
    if (Math.abs(distance) < 0.001) return null;

    const scene = face.getScene();

    // Debug: Count meshes before operation
    const meshesBefore = scene.meshes.filter(m => !m.isDisposed());
    const solidsBefore = meshesBefore.filter(m => m.metadata?.type === 'solid').length;
    const facesBefore = meshesBefore.filter(m => m.metadata?.type === 'face').length;
    console.log('[PushPull] BEFORE - Solids:', solidsBefore, 'Faces:', facesBefore);

    // Handle polygon faces with holes (donut faces)
    if (face.metadata.isPolygon && face.metadata.shape) {
      return applyPushPullPolygon(face, distance, faceNormal, scene);
    }

    const { width, depth } = face.metadata;
    const parentSolid = face.metadata.parentSolid as Mesh | undefined;
    const normalizedNormal = faceNormal.normalize();
    const absX = Math.abs(normalizedNormal.x);
    const absY = Math.abs(normalizedNormal.y);
    const absZ = Math.abs(normalizedNormal.z);
    const isPush = distance < 0;

    meshCounterRef.current++;
    const solidId = meshCounterRef.current;

    let boxWidth: number, boxHeight: number, boxDepth: number;
    let solidPosition: Vector3;

    // Check if operating on an existing solid's face
    if (parentSolid && !parentSolid.isDisposed() && parentSolid.metadata && !copyMode) {
      // Normal mode: modify the existing solid
      const parentMeta = parentSolid.metadata;
      const parentPos = parentSolid.position.clone();
      const changeAmount = Math.abs(distance);

      // Get original solid dimensions
      const origWidth = parentMeta.width;
      const origHeight = parentMeta.height;
      const origDepth = parentMeta.depth;

      if (isPush) {
        // PUSH on existing solid: Create SHRUNK solid
        if (absY > absX && absY > absZ) {
          const newHeight = origHeight - changeAmount;
          if (newHeight <= 0.001) return null;
          boxWidth = origWidth;
          boxHeight = newHeight;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(-changeAmount / 2);
          solidPosition = parentPos.add(shift);
        } else if (absX > absZ) {
          const newWidth = origWidth - changeAmount;
          if (newWidth <= 0.001) return null;
          boxWidth = newWidth;
          boxHeight = origHeight;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(-changeAmount / 2);
          solidPosition = parentPos.add(shift);
        } else {
          const newDepth = origDepth - changeAmount;
          if (newDepth <= 0.001) return null;
          boxWidth = origWidth;
          boxHeight = origHeight;
          boxDepth = newDepth;
          const shift = normalizedNormal.scale(-changeAmount / 2);
          solidPosition = parentPos.add(shift);
        }
      } else {
        // PULL on existing solid: Create EXTENDED solid (original + pull)
        if (absY > absX && absY > absZ) {
          boxWidth = origWidth;
          boxHeight = origHeight + changeAmount;
          boxDepth = origDepth;
          // Shift center in direction of pull by half the pull amount
          const shift = normalizedNormal.scale(changeAmount / 2);
          solidPosition = parentPos.add(shift);
        } else if (absX > absZ) {
          boxWidth = origWidth + changeAmount;
          boxHeight = origHeight;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(changeAmount / 2);
          solidPosition = parentPos.add(shift);
        } else {
          boxWidth = origWidth;
          boxHeight = origHeight;
          boxDepth = origDepth + changeAmount;
          const shift = normalizedNormal.scale(changeAmount / 2);
          solidPosition = parentPos.add(shift);
        }
      }
    } else {
      // Free face (no parent solid): Create extruded solid
      const baseCenter = face.getAbsolutePosition().clone();
      const extrudeLength = Math.abs(distance);

      if (absY > absX && absY > absZ) {
        boxWidth = width;
        boxHeight = extrudeLength;
        boxDepth = depth;
      } else if (absX > absZ) {
        boxWidth = extrudeLength;
        boxHeight = depth;
        boxDepth = width;
      } else {
        boxWidth = width;
        boxHeight = depth;
        boxDepth = extrudeLength;
      }

      const offset = normalizedNormal.scale(distance / 2);
      solidPosition = baseCenter.add(offset);
    }

    const hw = boxWidth / 2;
    const hh = boxHeight / 2;
    const hd = boxDepth / 2;

    // Create parent container (empty mesh as transform node) - NO ROTATION
    const solid = new Mesh(`Solid_${solidId}`, scene);
    solid.position = solidPosition;
    solid.isPickable = false;

    solid.metadata = {
      type: 'solid',
      width: boxWidth,
      height: boxHeight,
      depth: boxDepth,
    };

    // Helper to create individual face material (white)
    const createFaceMat = (name: string) => {
      const mat = new StandardMaterial(name, scene);
      mat.diffuseColor = new Color3(1, 1, 1);  // White
      mat.emissiveColor = new Color3(0.7, 0.7, 0.7);  // Bright emissive
      mat.specularColor = new Color3(0.2, 0.2, 0.2);
      mat.backFaceCulling = false;
      return mat;
    };

    // Create 6 individual face meshes in LOCAL coordinates relative to solid center
    // These are in WORLD-aligned coordinates (no rotation on solid)

    // Top face (Y+) - horizontal face at top
    const topFace = MeshBuilder.CreateGround(`Face_${solidId}_top`, { width: boxWidth, height: boxDepth }, scene);
    topFace.position = new Vector3(0, hh, 0);
    topFace.material = createFaceMat(`FaceMat_${solidId}_top`);
    topFace.isPickable = true;
    topFace.parent = solid;
    topFace.metadata = { type: 'face', width: boxWidth, depth: boxDepth, parentSolid: solid, faceDir: 'top' };

    // Bottom face (Y-) - horizontal face at bottom
    const bottomFace = MeshBuilder.CreateGround(`Face_${solidId}_bottom`, { width: boxWidth, height: boxDepth }, scene);
    bottomFace.position = new Vector3(0, -hh, 0);
    bottomFace.rotation.x = Math.PI;
    bottomFace.material = createFaceMat(`FaceMat_${solidId}_bottom`);
    bottomFace.isPickable = true;
    bottomFace.parent = solid;
    bottomFace.metadata = { type: 'face', width: boxWidth, depth: boxDepth, parentSolid: solid, faceDir: 'bottom' };

    // Front face (Z+) - vertical face (DOUBLESIDE for picking from both sides)
    const frontFace = MeshBuilder.CreatePlane(`Face_${solidId}_front`, { width: boxWidth, height: boxHeight, sideOrientation: Mesh.DOUBLESIDE }, scene);
    frontFace.position = new Vector3(0, 0, hd);
    frontFace.material = createFaceMat(`FaceMat_${solidId}_front`);
    frontFace.isPickable = true;
    frontFace.parent = solid;
    frontFace.metadata = { type: 'face', width: boxWidth, depth: boxHeight, parentSolid: solid, faceDir: 'front' };

    // Back face (Z-) - vertical face
    const backFace = MeshBuilder.CreatePlane(`Face_${solidId}_back`, { width: boxWidth, height: boxHeight, sideOrientation: Mesh.DOUBLESIDE }, scene);
    backFace.position = new Vector3(0, 0, -hd);
    backFace.rotation.y = Math.PI;
    backFace.material = createFaceMat(`FaceMat_${solidId}_back`);
    backFace.isPickable = true;
    backFace.parent = solid;
    backFace.metadata = { type: 'face', width: boxWidth, depth: boxHeight, parentSolid: solid, faceDir: 'back' };

    // Right face (X+) - vertical face
    const rightFace = MeshBuilder.CreatePlane(`Face_${solidId}_right`, { width: boxDepth, height: boxHeight, sideOrientation: Mesh.DOUBLESIDE }, scene);
    rightFace.position = new Vector3(hw, 0, 0);
    rightFace.rotation.y = Math.PI / 2;
    rightFace.material = createFaceMat(`FaceMat_${solidId}_right`);
    rightFace.isPickable = true;
    rightFace.parent = solid;
    rightFace.metadata = { type: 'face', width: boxDepth, depth: boxHeight, parentSolid: solid, faceDir: 'right' };

    // Left face (X-) - vertical face
    const leftFace = MeshBuilder.CreatePlane(`Face_${solidId}_left`, { width: boxDepth, height: boxHeight, sideOrientation: Mesh.DOUBLESIDE }, scene);
    leftFace.position = new Vector3(-hw, 0, 0);
    leftFace.rotation.y = -Math.PI / 2;
    leftFace.material = createFaceMat(`FaceMat_${solidId}_left`);
    leftFace.isPickable = true;
    leftFace.parent = solid;
    leftFace.metadata = { type: 'face', width: boxDepth, depth: boxHeight, parentSolid: solid, faceDir: 'left' };

    // 8 corners relative to solid center (for edge lines) - in WORLD-aligned local coords
    const corners = [
      new Vector3(-hw, -hh, -hd), // 0
      new Vector3(-hw, -hh, +hd), // 1
      new Vector3(+hw, -hh, +hd), // 2
      new Vector3(+hw, -hh, -hd), // 3
      new Vector3(-hw, +hh, -hd), // 4
      new Vector3(-hw, +hh, +hd), // 5
      new Vector3(+hw, +hh, +hd), // 6
      new Vector3(+hw, +hh, -hd), // 7
    ];

    // 12 edges - use Lines mesh for visual display
    const edgeIndices = [
      [0, 1], [1, 2], [2, 3], [3, 0], // bottom ring
      [4, 5], [5, 6], [6, 7], [7, 4], // top ring
      [0, 4], [1, 5], [2, 6], [3, 7], // verticals
    ];

    edgeIndices.forEach((indices, i) => {
      const edge = MeshBuilder.CreateLines(`Edge_${solidId}_${i}`, {
        points: [corners[indices[0]], corners[indices[1]]],
        updatable: false
      }, scene);
      edge.color = new Color3(0.1, 0.1, 0.1);
      edge.isPickable = true;
      edge.parent = solid;
      edge.metadata = { type: 'edge', parentSolid: solid };
    });

    // Force computation of world matrix after setting position
    solid.computeWorldMatrix(true);

    // Add snap points for all 8 corners (world positions)
    corners.forEach(corner => {
      const worldPos = Vector3.TransformCoordinates(corner, solid.getWorldMatrix());
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, worldPos) < 0.1);
      if (!exists) {
        snapPointsRef.current.push({ position: worldPos, type: 'endpoint' });
      }
    });

    // Add snap points for all 12 edge midpoints (world positions)
    edgeIndices.forEach(indices => {
      const start = corners[indices[0]];
      const end = corners[indices[1]];
      const midpoint = new Vector3(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        (start.z + end.z) / 2
      );
      const worldPos = Vector3.TransformCoordinates(midpoint, solid.getWorldMatrix());
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p.position, worldPos) < 0.1);
      if (!exists) {
        snapPointsRef.current.push({ position: worldPos, type: 'midpoint' });
      }
    });

    // Dispose the original face and parent solid if pushing into existing solid
    // parentSolid already defined at top of function
    // In copyMode, keep the original solid completely intact - don't dispose anything
    if (copyMode) {
      // Copy mode: Keep original solid completely intact (no dispose)
      // The new extruded solid is created separately, original remains unchanged
      console.log('[PushPull] Copy mode - keeping original solid intact');
    } else if (parentSolid && !parentSolid.isDisposed()) {
      // Normal mode: Face belongs to an existing solid - dispose entire parent solid
      // This handles both pull (extending) and push (cutting into) cases
      console.log('[PushPull] Disposing parent solid:', parentSolid.name, 'children:', parentSolid.getChildMeshes().length);
      parentSolid.getChildMeshes().forEach(child => child.dispose());
      parentSolid.dispose();
    } else {
      // Free-standing face (e.g., ground rectangle) - just dispose the face
      face.getChildMeshes().forEach(child => child.dispose());
      face.dispose();
    }

    // IMPORTANT: Dispose preview mesh to prevent ghost duplicates
    if (pushPullStateRef.current.previewMesh) {
      pushPullStateRef.current.previewMesh.dispose();
      pushPullStateRef.current.previewMesh = null;
    }

    // Store last extrusion distance
    pushPullStateRef.current.lastExtrudeDistance = distance;

    // Debug: Count meshes after operation
    const meshesAfter = scene.meshes.filter(m => !m.isDisposed());
    const solidsAfter = meshesAfter.filter(m => m.metadata?.type === 'solid').length;
    const facesAfter = meshesAfter.filter(m => m.metadata?.type === 'face').length;
    console.log('[PushPull] AFTER - Solids:', solidsAfter, 'Faces:', facesAfter);

    return solid;
  }, [selectedColor]);

  // Offset functionality - SketchUp-style face offset
  // Creates an inner or outer offset of a face with connecting edges
  const applyOffset = useCallback((face: Mesh, distance: number): Mesh | null => {
    console.log('[Offset] applyOffset called:', { faceId: face.id, faceName: face.name, distance, metadata: face.metadata });
    if (!face.metadata || face.metadata.type !== 'face') return null;
    if (Math.abs(distance) < 0.001) return null;

    const scene = face.getScene();

    // Get face vertices
    const positions = face.getVerticesData('position');
    if (!positions || positions.length < 9) return null;

    // Extract unique vertices in world space
    const rawVertices: Vector3[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < positions.length; i += 3) {
      const key = `${positions[i].toFixed(4)},${positions[i+1].toFixed(4)},${positions[i+2].toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        const worldPos = Vector3.TransformCoordinates(
          new Vector3(positions[i], positions[i+1], positions[i+2]),
          face.getWorldMatrix()
        );
        rawVertices.push(worldPos);
      }
    }

    if (rawVertices.length < 3) return null;

    // Calculate face center and Y position
    const center = rawVertices.reduce((acc, v) => acc.add(v), Vector3.Zero()).scale(1 / rawVertices.length);
    const yPos = center.y;

    // IMPORTANT: Sort vertices by angle from center (counter-clockwise order)
    // This ensures correct polygon perimeter order for offset calculation
    const vertices = [...rawVertices].sort((a, b) => {
      const angleA = Math.atan2(a.z - center.z, a.x - center.x);
      const angleB = Math.atan2(b.z - center.z, b.x - center.x);
      return angleA - angleB;
    });
    const n = vertices.length;

    // Helper: get perpendicular that points inward (toward center)
    const getInwardNormal = (p1: Vector3, p2: Vector3): Vector3 => {
      const edge = new Vector3(p2.x - p1.x, 0, p2.z - p1.z);
      const perp = new Vector3(-edge.z, 0, edge.x).normalize();
      // Check if perpendicular points toward center
      const midpoint = new Vector3((p1.x + p2.x) / 2, yPos, (p1.z + p2.z) / 2);
      const toCenter = new Vector3(center.x - midpoint.x, 0, center.z - midpoint.z);
      // If perpendicular points away from center, flip it
      if (perp.x * toCenter.x + perp.z * toCenter.z < 0) {
        perp.scaleInPlace(-1);
      }
      return perp;
    };

    // Calculate offset vertices using edge perpendicular method (parallel edges)
    const offsetVertices: Vector3[] = [];

    for (let i = 0; i < n; i++) {
      const prev = vertices[(i - 1 + n) % n];
      const curr = vertices[i];
      const next = vertices[(i + 1) % n];

      // Get inward normals for both edges meeting at curr
      const normal1 = getInwardNormal(prev, curr);
      const normal2 = getInwardNormal(curr, next);

      // Offset the two edges (positive distance = inward)
      const p1 = new Vector3(prev.x + normal1.x * distance, yPos, prev.z + normal1.z * distance);
      const p2 = new Vector3(curr.x + normal1.x * distance, yPos, curr.z + normal1.z * distance);
      const p3 = new Vector3(curr.x + normal2.x * distance, yPos, curr.z + normal2.z * distance);
      const p4 = new Vector3(next.x + normal2.x * distance, yPos, next.z + normal2.z * distance);

      // Find intersection of the two offset edges
      const d1 = new Vector3(p2.x - p1.x, 0, p2.z - p1.z);
      const d2 = new Vector3(p4.x - p3.x, 0, p4.z - p3.z);

      const cross = d1.x * d2.z - d1.z * d2.x;

      if (Math.abs(cross) < 0.0001) {
        // Parallel edges - use midpoint of offset points
        offsetVertices.push(new Vector3((p2.x + p3.x) / 2, yPos, (p2.z + p3.z) / 2));
      } else {
        // Find intersection point
        const t = ((p3.x - p1.x) * d2.z - (p3.z - p1.z) * d2.x) / cross;
        offsetVertices.push(new Vector3(p1.x + t * d1.x, yPos, p1.z + t * d1.z));
      }
    }

    meshCounterRef.current++;
    const offsetId = meshCounterRef.current;

    // Calculate inner face center (average of offset vertices)
    const innerCenterX = offsetVertices.reduce((sum, v) => sum + v.x, 0) / offsetVertices.length;
    const innerCenterZ = offsetVertices.reduce((sum, v) => sum + v.z, 0) / offsetVertices.length;

    // Build vertex positions for mesh using earcut (relative to inner center)
    const flatPoints: number[] = [];
    offsetVertices.forEach(v => {
      flatPoints.push(v.x - innerCenterX, v.z - innerCenterZ);
    });

    console.log("[Offset] calling earcut with", flatPoints.length, "points"); const indices = earcut(flatPoints); console.log("[Offset] earcut returned", indices.length, "indices");

    // Build vertex positions for mesh (relative to inner center)
    const meshPositions: number[] = [];
    const meshIndices: number[] = [];
    const meshNormals: number[] = [];

    offsetVertices.forEach(v => {
      meshPositions.push(v.x - innerCenterX, 0, v.z - innerCenterZ);
      meshNormals.push(0, 1, 0);
    });

    indices.forEach(i => meshIndices.push(i));

    console.log("[Offset] Creating innerFace mesh"); const innerFace = new Mesh(`OffsetFace_${offsetId}`, scene);
    const vertexData = new VertexData();
    vertexData.positions = meshPositions;
    vertexData.indices = meshIndices;
    vertexData.normals = meshNormals;
    vertexData.applyToMesh(innerFace);

    // Set mesh position to inner center (for correct push/pull positioning)
    innerFace.position = new Vector3(innerCenterX, yPos, innerCenterZ);

    const innerMat = new StandardMaterial(`OffsetMat_${offsetId}`, scene);
    innerMat.diffuseColor = Color3.FromHexString(selectedColor);
    innerMat.specularColor = new Color3(0.2, 0.2, 0.2);
    innerMat.backFaceCulling = false;
    innerFace.material = innerMat;
    innerFace.isPickable = true;
    // Store shape data for push/pull polygon extrusion (relative to inner center)
    const innerShape = offsetVertices.map(v => ({ x: v.x - innerCenterX, z: v.z - innerCenterZ }));
    innerFace.metadata = {
      type: 'face',
      isPolygon: true,
      vertices: offsetVertices.length,
      shape: innerShape,
      holes: []
    };
    console.log('[Offset] Created inner face:', { id: innerFace.id, name: innerFace.name, position: innerFace.position, metadata: innerFace.metadata });

    // Create single ring face (donut shape) - outer boundary with inner hole
    // This avoids 45-degree corner divisions
    meshCounterRef.current++;
    const ringId = meshCounterRef.current;

    // Calculate ring center (average of all vertices)
    const allVertices = [...vertices, ...offsetVertices];
    const ringCenterX = allVertices.reduce((sum, v) => sum + v.x, 0) / allVertices.length;
    const ringCenterZ = allVertices.reduce((sum, v) => sum + v.z, 0) / allVertices.length;

    // Build flat points for earcut: outer boundary + hole
    // Outer boundary (original vertices) - CCW order
    const outerFlat: number[] = [];
    vertices.forEach(v => {
      outerFlat.push(v.x - ringCenterX, v.z - ringCenterZ);
    });

    // Inner hole (offset vertices) - must be CW (opposite winding)
    // Reverse offset vertices to make them CW
    const holeFlat: number[] = [];
    const reversedOffset = [...offsetVertices].reverse();
    reversedOffset.forEach(v => {
      holeFlat.push(v.x - ringCenterX, v.z - ringCenterZ);
    });

    // Combine: outer points, then hole points
    const combinedFlat = [...outerFlat, ...holeFlat];
    // Hole starts at index n (after outer vertices)
    const holeIndices = [n];

    // Triangulate with hole
    const ringTriIndicesRaw = earcut(combinedFlat, holeIndices);

    // Reverse triangle winding order for correct front-face (CCW when viewed from above)
    // This fixes picking - without this, triangles face downward and aren't pickable from above
    const ringTriIndices: number[] = [];
    for (let i = 0; i < ringTriIndicesRaw.length; i += 3) {
      ringTriIndices.push(ringTriIndicesRaw[i], ringTriIndicesRaw[i + 2], ringTriIndicesRaw[i + 1]);
    }

    // Build mesh positions (outer vertices + hole vertices)
    const ringPositions: number[] = [];
    const ringNormals: number[] = [];
    vertices.forEach(v => {
      ringPositions.push(v.x - ringCenterX, 0, v.z - ringCenterZ);
      ringNormals.push(0, 1, 0);
    });
    reversedOffset.forEach(v => {
      ringPositions.push(v.x - ringCenterX, 0, v.z - ringCenterZ);
      ringNormals.push(0, 1, 0);
    });

    const ringFace = new Mesh(`OffsetRing_${ringId}`, scene);
    const ringVertexData = new VertexData();
    ringVertexData.positions = ringPositions;
    ringVertexData.indices = ringTriIndices;
    ringVertexData.normals = ringNormals;
    ringVertexData.applyToMesh(ringFace);

    // Set mesh position to ring center
    ringFace.position = new Vector3(ringCenterX, yPos, ringCenterZ);

    const ringMat = new StandardMaterial(`OffsetRingMat_${ringId}`, scene);
    ringMat.diffuseColor = Color3.FromHexString(selectedColor);
    ringMat.specularColor = new Color3(0.2, 0.2, 0.2);
    ringMat.backFaceCulling = false;
    ringFace.material = ringMat;
    ringFace.isPickable = true;

    // Store shape data for push/pull: outer shape with inner hole
    const outerShape = vertices.map(v => ({ x: v.x - ringCenterX, z: v.z - ringCenterZ }));
    const holeShape = reversedOffset.map(v => ({ x: v.x - ringCenterX, z: v.z - ringCenterZ }));
    ringFace.metadata = {
      type: 'face',
      isPolygon: true,
      vertices: vertices.length + offsetVertices.length,
      shape: outerShape,
      holes: [holeShape]
    };
    console.log('[Offset] Created ring face:', { id: ringFace.id, name: ringFace.name, position: ringFace.position });

    // Create inner face edges
    for (let i = 0; i < offsetVertices.length; i++) {
      const p1 = offsetVertices[i];
      const p2 = offsetVertices[(i + 1) % offsetVertices.length];

      const innerEdge = MeshBuilder.CreateLines(`OffsetInnerEdge_${offsetId}_${i}`, {
        points: [new Vector3(p1.x, yPos, p1.z), new Vector3(p2.x, yPos, p2.z)],
        updatable: false
      }, scene);
      innerEdge.color = new Color3(0.15, 0.15, 0.15);
      innerEdge.isPickable = true;
      innerEdge.metadata = { type: 'edge' };
    }

    // Delete the original face only (keep outer edges - they form ring boundary)
    // Note: Original face's outer edges are now part of ring faces' outer boundary
    console.log('[Offset] Disposing original face:', { id: face.id, name: face.name });
    face.getChildMeshes().forEach(child => child.dispose());
    face.dispose();
    console.log('[Offset] Offset complete - created 1 inner face + 1 ring face (donut)');

    // Store last offset distance
    offsetStateRef.current.lastOffsetDistance = distance;

    return innerFace;
  }, [selectedColor]);

  // Create/update offset preview mesh (wireframe outline showing offset shape)
  const updateOffsetPreview = useCallback((
    scene: Scene,
    face: Mesh,
    baseVertices: Vector3[],
    center: Vector3,
    distance: number
  ) => {
    const osState = offsetStateRef.current;

    // Dispose old preview
    if (osState.previewMesh) {
      osState.previewMesh.dispose();
      osState.previewMesh = null;
    }

    if (Math.abs(distance) < 0.001 || baseVertices.length < 3) return;

    const yPos = baseVertices[0].y;
    const n = baseVertices.length;

    // Helper: get perpendicular that points inward (toward center)
    const getInwardNormal = (p1: Vector3, p2: Vector3): Vector3 => {
      const edge = new Vector3(p2.x - p1.x, 0, p2.z - p1.z);
      const perp = new Vector3(-edge.z, 0, edge.x).normalize();
      // Check if perpendicular points toward center
      const midpoint = new Vector3((p1.x + p2.x) / 2, yPos, (p1.z + p2.z) / 2);
      const toCenter = new Vector3(center.x - midpoint.x, 0, center.z - midpoint.z);
      // If perpendicular points away from center, flip it
      if (perp.x * toCenter.x + perp.z * toCenter.z < 0) {
        perp.scaleInPlace(-1);
      }
      return perp;
    };

    // Calculate offset vertices using edge perpendicular method (parallel edges)
    const offsetVertices: Vector3[] = [];

    for (let i = 0; i < n; i++) {
      const prev = baseVertices[(i - 1 + n) % n];
      const curr = baseVertices[i];
      const next = baseVertices[(i + 1) % n];

      // Get inward normals for both edges meeting at curr
      const normal1 = getInwardNormal(prev, curr);
      const normal2 = getInwardNormal(curr, next);

      // Offset the two edges (positive distance = inward)
      const p1 = new Vector3(prev.x + normal1.x * distance, yPos, prev.z + normal1.z * distance);
      const p2 = new Vector3(curr.x + normal1.x * distance, yPos, curr.z + normal1.z * distance);
      const p3 = new Vector3(curr.x + normal2.x * distance, yPos, curr.z + normal2.z * distance);
      const p4 = new Vector3(next.x + normal2.x * distance, yPos, next.z + normal2.z * distance);

      // Find intersection of the two offset edges
      const d1 = new Vector3(p2.x - p1.x, 0, p2.z - p1.z);
      const d2 = new Vector3(p4.x - p3.x, 0, p4.z - p3.z);

      const cross = d1.x * d2.z - d1.z * d2.x;

      if (Math.abs(cross) < 0.0001) {
        // Parallel edges - use midpoint of offset points
        offsetVertices.push(new Vector3((p2.x + p3.x) / 2, yPos, (p2.z + p3.z) / 2));
      } else {
        // Find intersection point
        const t = ((p3.x - p1.x) * d2.z - (p3.z - p1.z) * d2.x) / cross;
        offsetVertices.push(new Vector3(p1.x + t * d1.x, yPos, p1.z + t * d1.z));
      }
    }

    // Create preview lines showing the offset shape (closed loop)
    const previewPoints: Vector3[] = [...offsetVertices, offsetVertices[0]];

    const preview = MeshBuilder.CreateLines('offsetPreview', {
      points: previewPoints,
      updatable: false
    }, scene);

    // Red preview color to indicate offset shape
    preview.color = new Color3(1, 0.3, 0.3);
    preview.isPickable = false;

    osState.previewMesh = preview;
  }, []);

  // Create/update push/pull preview mesh (wireframe box)
  const updatePushPullPreview = useCallback((
    scene: Scene,
    face: Mesh,
    distance: number,
    faceNormal: Vector3
  ) => {
    const state = pushPullStateRef.current;
    const { width, depth } = face.metadata;
    const parentSolid = face.metadata.parentSolid as Mesh | undefined;

    // Dispose old preview
    if (state.previewMesh) {
      state.previewMesh.dispose();
      state.previewMesh = null;
    }

    if (Math.abs(distance) < 0.001) return;

    // Handle polygon faces (non-rectangular shapes)
    if (face.metadata?.isPolygon && face.metadata?.shape) {
      const baseCenter = face.getAbsolutePosition().clone();
      const height = Math.abs(distance);

      // Convert shape to Vector3 array
      const shape = face.metadata.shape.map((p: { x: number; z: number }) =>
        new Vector3(p.x, 0, p.z)
      );
      const holes = (face.metadata.holes || []).map((hole: Array<{ x: number; z: number }>) =>
        hole.map((p: { x: number; z: number }) => new Vector3(p.x, 0, p.z))
      );

      try {
        (window as any).earcut = earcut;
        const preview = MeshBuilder.ExtrudePolygon(
          'pushPullPreview',
          { shape, holes, depth: height, sideOrientation: Mesh.DOUBLESIDE },
          scene
        );
        preview.position = new Vector3(baseCenter.x, baseCenter.y + height, baseCenter.z);

        const previewMat = new StandardMaterial('pushPullPreviewMat', scene);
        previewMat.diffuseColor = new Color3(1, 1, 1);
        previewMat.emissiveColor = new Color3(0.5, 0.5, 0.5);
        previewMat.alpha = 0.5;
        preview.material = previewMat;
        preview.isPickable = false;
        state.previewMesh = preview;
      } catch (e) {
        console.error('Failed to create polygon preview:', e);
      }
      return;
    }

    const normalizedNormal = faceNormal.normalize();
    const absX = Math.abs(normalizedNormal.x);
    const absY = Math.abs(normalizedNormal.y);
    const absZ = Math.abs(normalizedNormal.z);
    const isPush = distance < 0;

    let boxWidth: number, boxHeight: number, boxDepth: number;
    let previewPosition: Vector3;

    // Check if operating on an existing solid's face
    if (parentSolid && !parentSolid.isDisposed() && parentSolid.metadata) {
      const parentMeta = parentSolid.metadata;
      const parentPos = parentSolid.position.clone();
      const changeAmount = Math.abs(distance);

      const origWidth = parentMeta.width;
      const origHeight = parentMeta.height;
      const origDepth = parentMeta.depth;

      if (isPush) {
        // PUSH: Show SHRUNK solid preview
        if (absY > absX && absY > absZ) {
          const newHeight = origHeight - changeAmount;
          if (newHeight <= 0.001) return;
          boxWidth = origWidth;
          boxHeight = newHeight;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(-changeAmount / 2);
          previewPosition = parentPos.add(shift);
        } else if (absX > absZ) {
          const newWidth = origWidth - changeAmount;
          if (newWidth <= 0.001) return;
          boxWidth = newWidth;
          boxHeight = origHeight;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(-changeAmount / 2);
          previewPosition = parentPos.add(shift);
        } else {
          const newDepth = origDepth - changeAmount;
          if (newDepth <= 0.001) return;
          boxWidth = origWidth;
          boxHeight = origHeight;
          boxDepth = newDepth;
          const shift = normalizedNormal.scale(-changeAmount / 2);
          previewPosition = parentPos.add(shift);
        }
      } else {
        // PULL: Show EXTENDED solid preview (original + pull)
        if (absY > absX && absY > absZ) {
          boxWidth = origWidth;
          boxHeight = origHeight + changeAmount;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(changeAmount / 2);
          previewPosition = parentPos.add(shift);
        } else if (absX > absZ) {
          boxWidth = origWidth + changeAmount;
          boxHeight = origHeight;
          boxDepth = origDepth;
          const shift = normalizedNormal.scale(changeAmount / 2);
          previewPosition = parentPos.add(shift);
        } else {
          boxWidth = origWidth;
          boxHeight = origHeight;
          boxDepth = origDepth + changeAmount;
          const shift = normalizedNormal.scale(changeAmount / 2);
          previewPosition = parentPos.add(shift);
        }
      }
    } else {
      // Free face: Show extruded solid preview
      const absDistance = Math.abs(distance);

      if (absY > absX && absY > absZ) {
        boxWidth = width;
        boxHeight = absDistance;
        boxDepth = depth;
      } else if (absX > absZ) {
        boxWidth = absDistance;
        boxHeight = depth;
        boxDepth = width;
      } else {
        boxWidth = width;
        boxHeight = depth;
        boxDepth = absDistance;
      }

      const faceAbsPos = face.getAbsolutePosition();
      const extrudeDir = normalizedNormal.scale(distance / 2);
      previewPosition = new Vector3(
        faceAbsPos.x + extrudeDir.x,
        faceAbsPos.y + extrudeDir.y,
        faceAbsPos.z + extrudeDir.z
      );
    }

    // Create preview box with correct dimensions (no rotation needed)
    const preview = MeshBuilder.CreateBox('pushPullPreview', {
      width: boxWidth,
      height: boxHeight,
      depth: boxDepth,
    }, scene);

    preview.position = previewPosition;

    // NO ROTATION - dimensions already correct for world-aligned box

    // Semi-transparent preview material (becomes solid on click)
    const previewMat = new StandardMaterial('pushPullPreviewMat', scene);
    previewMat.diffuseColor = Color3.FromHexString(selectedColor);
    previewMat.specularColor = new Color3(0.1, 0.1, 0.1);
    previewMat.alpha = 0.5;  // Semi-transparent during drag
    preview.material = previewMat;

    preview.isPickable = false;
    state.previewMesh = preview;
  }, [selectedColor]);

  // Calculate extrusion distance from mouse position using dot product
  // This gives the distance along the face normal direction
  const calculateExtrudeDistance = useCallback((
    scene: Scene,
    basePoint: Vector3,
    faceNormal: Vector3,
    pointerX: number,
    pointerY: number
  ): number => {
    const camera = cameraRef.current;
    if (!camera) return 0;

    const normalizedNormal = faceNormal.normalize();
    const baseClickPoint = pushPullStateRef.current.baseClickPoint;
    if (!baseClickPoint) return 0;

    // Calculate screen delta (mouse movement in pixels)
    const screenDeltaY = baseClickPoint.y - pointerY;
    const screenDeltaX = pointerX - baseClickPoint.x;

    // Scale factor based on camera distance for consistent feel
    const scaleFactor = camera.radius * 0.002;

    // For Y-axis faces (top/bottom) - use screen Y movement
    if (Math.abs(normalizedNormal.y) > 0.9) {
      return screenDeltaY * scaleFactor;
    }

    // For X-axis faces (left/right) - use screen X movement
    if (Math.abs(normalizedNormal.x) > 0.9) {
      // Determine direction based on camera position and face normal
      const cameraRight = Vector3.Cross(camera.upVector, camera.getDirection(Vector3.Forward())).normalize();
      const dotRight = Vector3.Dot(normalizedNormal, cameraRight);
      const sign = dotRight > 0 ? 1 : -1;
      return screenDeltaX * scaleFactor * sign;
    }

    // For Z-axis faces (front/back) - use screen X or Y based on camera angle
    if (Math.abs(normalizedNormal.z) > 0.9) {
      const cameraRight = Vector3.Cross(camera.upVector, camera.getDirection(Vector3.Forward())).normalize();
      const dotRight = Vector3.Dot(normalizedNormal, cameraRight);
      // Use X if face normal is perpendicular to camera, Y otherwise
      if (Math.abs(dotRight) > 0.5) {
        const sign = dotRight > 0 ? 1 : -1;
        return screenDeltaX * scaleFactor * sign;
      } else {
        // Face is more aligned with camera forward - use screen Y
        const cameraForward = camera.getDirection(Vector3.Forward());
        const dotForward = Vector3.Dot(normalizedNormal, cameraForward);
        const sign = dotForward > 0 ? -1 : 1;
        return screenDeltaY * scaleFactor * sign;
      }
    }

    // Fallback: Calculate ray-plane intersection for arbitrary normals
    const ray = scene.createPickingRay(pointerX, pointerY, Matrix.Identity(), camera);
    const planeNormal = Vector3.Cross(normalizedNormal, camera.getDirection(Vector3.Forward())).normalize();
    if (planeNormal.length() < 0.001) {
      return screenDeltaY * scaleFactor;
    }

    const denom = Vector3.Dot(ray.direction, planeNormal);
    if (Math.abs(denom) < 0.0001) return screenDeltaY * scaleFactor;

    const t = Vector3.Dot(basePoint.subtract(ray.origin), planeNormal) / denom;
    const hitPoint = ray.origin.add(ray.direction.scale(t));
    const delta = hitPoint.subtract(basePoint);
    return Vector3.Dot(delta, normalizedNormal);
  }, []);

  // Zoom to fit all meshes
  const zoomExtents = useCallback(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    const meshes = scene.meshes.filter(m =>
      m.isPickable &&
      !m.name.includes('ground') &&
      !m.name.includes('Axis') &&
      !m.name.includes('preview')
    );

    if (meshes.length === 0) {
      camera.setTarget(Vector3.Zero());
      camera.radius = 20;
      return;
    }

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);

    meshes.forEach(mesh => {
      const boundingInfo = mesh.getBoundingInfo();
      const meshMin = boundingInfo.boundingBox.minimumWorld;
      const meshMax = boundingInfo.boundingBox.maximumWorld;

      min = Vector3.Minimize(min, meshMin);
      max = Vector3.Maximize(max, meshMax);
    });

    const center = min.add(max).scale(0.5);
    const size = max.subtract(min);
    const maxDim = Math.max(size.x, size.y, size.z);

    camera.setTarget(center);
    camera.radius = maxDim * 2;
  }, []);

  // Camera view presets
  const setCameraView = useCallback((view: 'iso' | 'front' | 'top' | 'right' | 'back' | 'left') => {
    const camera = cameraRef.current;
    if (!camera) return;

    const views = {
      iso: { alpha: -Math.PI / 4, beta: Math.PI / 3 },      // Isometric 3D view
      front: { alpha: 0, beta: Math.PI / 2 },                // Front view
      top: { alpha: 0, beta: 0.01 },                         // Top view (slightly off 0 to avoid gimbal lock)
      right: { alpha: Math.PI / 2, beta: Math.PI / 2 },      // Right side view
      back: { alpha: Math.PI, beta: Math.PI / 2 },           // Back view
      left: { alpha: -Math.PI / 2, beta: Math.PI / 2 },      // Left side view
    };

    const target = views[view];
    camera.alpha = target.alpha;
    camera.beta = target.beta;
  }, []);

  // ==================== SELECTION SYSTEM ====================

  // Clear all selection
  const clearSelection = useCallback(() => {
    selectionManagerRef.current?.clear();
    setSelectedMesh(null);
    setMeshProperties(null);
    if (gizmoManagerRef.current) {
      gizmoManagerRef.current.attachToMesh(null);
    }
  }, []);

  // Selection helpers
  const handleSelectionClick = useCallback((pickResult: any, event: PointerEvent) => {
    const manager = selectionManagerRef.current;
    if (!manager || !pickResult.hit || !pickResult.pickedMesh) {
      // Clicked on empty space -> Clear selection (unless modifier)
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
        manager?.clear();
      }
      return;
    }

    const meshId = pickResult.pickedMesh.id;
    const isShift = event.shiftKey;
    const isCtrl = event.ctrlKey || event.metaKey; // Command on Mac

    // SketchUp Logic:
    // None: Replace
    // Shift: Toggle
    // Ctrl: Add
    // Shift+Ctrl: Subtract

    if (isShift && isCtrl) {
      manager.select(meshId, 'subtract');
    } else if (isCtrl) {
      manager.select(meshId, 'add');
    } else if (isShift) {
      manager.select(meshId, 'toggle');
    } else {
      manager.select(meshId, 'replace');
    }
  }, []);

  const handleDoubleClick = useCallback((pickResult: any) => {
    const manager = selectionManagerRef.current;
    if (!manager || !pickResult.hit || !pickResult.pickedMesh) return;

    const mesh = pickResult.pickedMesh;
    const type = mesh.metadata?.type;

    if (type === 'face') {
      // Face double-click: Select face + bounding edges
      const connected = manager.getConnectedGeometry(mesh.id, 'face-edges');
      manager.selectIds(connected, 'add');
    } else if (type === 'edge') {
      // Edge double-click: Select edge + connected faces
      const connected = manager.getConnectedGeometry(mesh.id, 'edge-faces');
      manager.selectIds(connected, 'add');
    }
  }, []);

  const handleTripleClick = useCallback((pickResult: any) => {
    const manager = selectionManagerRef.current;
    if (!manager || !pickResult.hit || !pickResult.pickedMesh) return;

    // Triple-click: Select all connected geometry
    const connected = manager.getConnectedGeometry(pickResult.pickedMesh.id, 'all');
    manager.selectIds(connected, 'add');
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (selectionState.selectedIds.length > 0) {
      setSelectionState(prev => ({
        ...prev,
        contextMenu: { x: e.clientX, y: e.clientY }
      }));
    }
  }, [selectionState.selectedIds]);

  const handleContextMenuAction = useCallback((action: string) => {
    const manager = selectionManagerRef.current;
    if (!manager) return;

    switch (action) {
      case 'invert':
        // Get all selectable mesh IDs
        const allIds: string[] = [];
        sceneRef.current?.meshes.forEach(m => {
          if (m.isPickable && m.metadata) allIds.push(m.id);
        });
        manager.invertSelection(allIds);
        break;
      case 'connected-faces':
        const newFaces = new Set<string>();
        selectionState.selectedIds.forEach(id => {
          const connected = manager.getConnectedGeometry(id, 'edge-faces');
          connected.forEach(cid => newFaces.add(cid));
        });
        manager.selectIds(Array.from(newFaces), 'add');
        break;
      case 'all-connected':
        const allConnected = new Set<string>();
        selectionState.selectedIds.forEach(id => {
          const connected = manager.getConnectedGeometry(id, 'all');
          connected.forEach(cid => allConnected.add(cid));
        });
        manager.selectIds(Array.from(allConnected), 'add');
        break;
      case 'bounding-edges':
        const edges = new Set<string>();
        selectionState.selectedIds.forEach(id => {
          const connected = manager.getConnectedGeometry(id, 'face-edges');
          connected.forEach(cid => edges.add(cid));
        });
        manager.selectIds(Array.from(edges), 'add');
        break;
      case 'same-material':
        // Implementation for same material
        break;
      case 'delete':
        // Implementation for delete
        selectionState.selectedIds.forEach(id => {
          const mesh = sceneRef.current?.getMeshByID(id);
          if (mesh) mesh.dispose();
        });
        manager.clear();
        break;
    }
    setSelectionState(prev => ({ ...prev, contextMenu: null }));
  }, [selectionState.selectedIds]);

  // Get connected entities for double/triple click
  const getConnectedMeshes = useCallback((mesh: Mesh, deep: boolean = false): Mesh[] => {
    const scene = sceneRef.current;
    if (!scene) return [];

    const connected: Mesh[] = [];
    const visited = new Set<string>();
    const toVisit: Mesh[] = [mesh];

    while (toVisit.length > 0) {
      const current = toVisit.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      connected.push(current);

      if (!deep && connected.length > 1) continue;  // For double-click, only immediate connections

      // Find adjacent meshes (sharing edges/vertices)
      // For now, simplified: find meshes with overlapping bounding boxes
      const currentBB = current.getBoundingInfo().boundingBox;
      scene.meshes.forEach(other => {
        if (other === current || visited.has(other.id)) return;
        if (!other.isPickable || other.name.includes('ground') || other.name.includes('preview')) return;

        const otherBB = other.getBoundingInfo().boundingBox;
        // Check if bounding boxes touch or overlap
        if (currentBB.intersectsMinMax(otherBB.minimumWorld, otherBB.maximumWorld)) {
          toVisit.push(other as Mesh);
        }
      });
    }

    return connected;
  }, []);

  // Helper to check if a line segment intersects a rectangle
  const lineIntersectsBox = useCallback((
    x1: number, y1: number, x2: number, y2: number,
    boxLeft: number, boxTop: number, boxRight: number, boxBottom: number
  ): boolean => {
    // Check if either endpoint is inside the box
    const p1Inside = x1 >= boxLeft && x1 <= boxRight && y1 >= boxTop && y1 <= boxBottom;
    const p2Inside = x2 >= boxLeft && x2 <= boxRight && y2 >= boxTop && y2 <= boxBottom;
    if (p1Inside || p2Inside) return true;

    // Check if line intersects any of the 4 box edges
    const lineIntersectsSegment = (
      ax1: number, ay1: number, ax2: number, ay2: number,
      bx1: number, by1: number, bx2: number, by2: number
    ): boolean => {
      const denom = (by2 - by1) * (ax2 - ax1) - (bx2 - bx1) * (ay2 - ay1);
      if (Math.abs(denom) < 0.0001) return false;
      const ua = ((bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1)) / denom;
      const ub = ((ax2 - ax1) * (ay1 - by1) - (ay2 - ay1) * (ax1 - bx1)) / denom;
      return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    };

    // Check intersection with all 4 edges of the box
    return (
      lineIntersectsSegment(x1, y1, x2, y2, boxLeft, boxTop, boxRight, boxTop) ||      // Top
      lineIntersectsSegment(x1, y1, x2, y2, boxLeft, boxBottom, boxRight, boxBottom) || // Bottom
      lineIntersectsSegment(x1, y1, x2, y2, boxLeft, boxTop, boxLeft, boxBottom) ||    // Left
      lineIntersectsSegment(x1, y1, x2, y2, boxRight, boxTop, boxRight, boxBottom)     // Right
    );
  }, []);

  // Check if mesh is within box selection (window or crossing mode)
  const isMeshInSelectionBox = useCallback((
    mesh: Mesh,
    x1: number, y1: number,
    x2: number, y2: number,
    isWindowSelect: boolean  // true = fully contained, false = crossing
  ): boolean => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return false;

    const engine = scene.getEngine();

    // Normalize box coordinates
    const boxLeft = Math.min(x1, x2);
    const boxRight = Math.max(x1, x2);
    const boxTop = Math.min(y1, y2);
    const boxBottom = Math.max(y1, y2);

    // Special handling for edges (both LinesMesh and Tube edges)
    if (mesh.name.startsWith('Edge_') && mesh.metadata?.type === 'edge') {
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const transformMatrix = scene.getTransformMatrix();

      let startPoint: Vector3;
      let endPoint: Vector3;

      // Check if this is a LinesMesh with stored start/end points in metadata
      if (mesh.metadata.startPoint && mesh.metadata.endPoint) {
        // Standalone line created with finalizeLine()
        startPoint = mesh.metadata.startPoint as Vector3;
        endPoint = mesh.metadata.endPoint as Vector3;
      } else if (mesh.metadata.localStart && mesh.metadata.localEnd) {
        // Face edge with localStart/localEnd - transform to world coordinates
        const worldMatrix = mesh.getWorldMatrix();
        startPoint = Vector3.TransformCoordinates(
          mesh.metadata.localStart as Vector3,
          worldMatrix
        );
        endPoint = Vector3.TransformCoordinates(
          mesh.metadata.localEnd as Vector3,
          worldMatrix
        );
      } else {
        // Try to get points from LinesMesh vertex data
        const positions = mesh.getVerticesData('position');
        if (positions && positions.length >= 6) {
          // Lines mesh: first point at [0,1,2], second at [3,4,5]
          const worldMatrix = mesh.getWorldMatrix();
          const localStart = new Vector3(positions[0], positions[1], positions[2]);
          const localEnd = new Vector3(positions[3], positions[4], positions[5]);
          startPoint = Vector3.TransformCoordinates(localStart, worldMatrix);
          endPoint = Vector3.TransformCoordinates(localEnd, worldMatrix);
        } else {
          // Final fallback: use bounding box
          const bb = mesh.getBoundingInfo().boundingBox;
          const worldMatrix = mesh.getWorldMatrix();
          const localMin = bb.minimum;
          const localMax = bb.maximum;

          startPoint = Vector3.TransformCoordinates(
            new Vector3(localMin.x, localMin.y, localMin.z),
            worldMatrix
          );
          endPoint = Vector3.TransformCoordinates(
            new Vector3(localMax.x, localMax.y, localMax.z),
            worldMatrix
          );
        }
      }

      // Project to screen space
      const screenStart = Vector3.Project(startPoint, Matrix.Identity(), transformMatrix, viewport);
      const screenEnd = Vector3.Project(endPoint, Matrix.Identity(), transformMatrix, viewport);

      if (isWindowSelect) {
        // Window select: both endpoints must be inside box
        const startInside = screenStart.x >= boxLeft && screenStart.x <= boxRight &&
                           screenStart.y >= boxTop && screenStart.y <= boxBottom;
        const endInside = screenEnd.x >= boxLeft && screenEnd.x <= boxRight &&
                         screenEnd.y >= boxTop && screenEnd.y <= boxBottom;
        return startInside && endInside;
      } else {
        // Crossing select: line must intersect or be inside box
        return lineIntersectsBox(
          screenStart.x, screenStart.y, screenEnd.x, screenEnd.y,
          boxLeft, boxTop, boxRight, boxBottom
        );
      }
    }

    // Standard bounding box approach for other meshes
    const bb = mesh.getBoundingInfo().boundingBox;

    // Get all 8 corners of bounding box
    const corners = [
      new Vector3(bb.minimumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z),
      new Vector3(bb.maximumWorld.x, bb.minimumWorld.y, bb.minimumWorld.z),
      new Vector3(bb.minimumWorld.x, bb.maximumWorld.y, bb.minimumWorld.z),
      new Vector3(bb.maximumWorld.x, bb.maximumWorld.y, bb.minimumWorld.z),
      new Vector3(bb.minimumWorld.x, bb.minimumWorld.y, bb.maximumWorld.z),
      new Vector3(bb.maximumWorld.x, bb.minimumWorld.y, bb.maximumWorld.z),
      new Vector3(bb.minimumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z),
      new Vector3(bb.maximumWorld.x, bb.maximumWorld.y, bb.maximumWorld.z),
    ];

    // Project corners to screen space
    const screenCorners = corners.map(corner =>
      Vector3.Project(
        corner,
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
      )
    );

    if (isWindowSelect) {
      // Window select: ALL corners must be inside box
      return screenCorners.every(corner =>
        corner.x >= boxLeft && corner.x <= boxRight &&
        corner.y >= boxTop && corner.y <= boxBottom
      );
    } else {
      // Crossing select: ANY corner inside box, or box intersects mesh bounds
      const anyInside = screenCorners.some(corner =>
        corner.x >= boxLeft && corner.x <= boxRight &&
        corner.y >= boxTop && corner.y <= boxBottom
      );

      if (anyInside) return true;

      // Also check if selection box is inside mesh bounds (for large meshes)
      const meshScreenMin = {
        x: Math.min(...screenCorners.map(c => c.x)),
        y: Math.min(...screenCorners.map(c => c.y))
      };
      const meshScreenMax = {
        x: Math.max(...screenCorners.map(c => c.x)),
        y: Math.max(...screenCorners.map(c => c.y))
      };

      // Check for intersection
      return !(boxRight < meshScreenMin.x || boxLeft > meshScreenMax.x ||
        boxBottom < meshScreenMin.y || boxTop > meshScreenMax.y);
    }
  }, [lineIntersectsBox]);

  // Perform box selection
  const performBoxSelection = useCallback((
    x1: number, y1: number,
    x2: number, y2: number,
    mode: 'replace' | 'add' | 'toggle' | 'subtract'
  ) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Determine window vs crossing based on drag direction
    // Left-to-right = window (must be fully inside)
    // Right-to-left = crossing (just touching is enough)
    const isWindowSelect = x2 > x1;

    // Get all selectable meshes
    const selectableMeshes = scene.meshes.filter(m =>
      m.isPickable &&
      !m.name.includes('ground') &&
      !m.name.includes('Axis') &&
      !m.name.includes('preview')
    );

    // Find meshes within the selection box
    const boxLeft = Math.min(x1, x2);
    const boxRight = Math.max(x1, x2);
    const boxTop = Math.min(y1, y2);
    const boxBottom = Math.max(y1, y2);

    const meshesInBox = selectableMeshes.filter(mesh =>
      isMeshInSelectionBox(mesh as Mesh, boxLeft, boxTop, boxRight, boxBottom, isWindowSelect)
    );

    // Get IDs of selected meshes
    const selectedIds = meshesInBox.map(m => m.id);

    // Apply selection using SelectionManager
    const manager = selectionManagerRef.current;
    if (manager && selectedIds.length > 0) {
      manager.selectIds(selectedIds, mode);

      // Apply visual feedback for selected meshes
      meshesInBox.forEach(mesh => {
        if ((mesh as Mesh).metadata?.type === 'face') {
          // Highlight face
          (mesh as Mesh).renderOverlay = true;
          (mesh as Mesh).overlayColor = new Color3(0.2, 0.4, 1.0);
          (mesh as Mesh).overlayAlpha = 0.4;
          if ((mesh as Mesh).material) {
            ((mesh as Mesh).material as StandardMaterial).emissiveColor = new Color3(0.1, 0.2, 0.5);
          }
        } else if ((mesh as Mesh).metadata?.type === 'edge') {
          // Highlight edge - Lines mesh uses color property, not material
          if ('color' in mesh) {
            (mesh as any).color = new Color3(0.2, 0.5, 1.0);
          } else if ((mesh as Mesh).material) {
            const mat = (mesh as Mesh).material as StandardMaterial;
            mat.diffuseColor = new Color3(0.2, 0.4, 1.0);
            mat.emissiveColor = new Color3(0.2, 0.4, 1.0);
          }
        }
      });

      // Select the first mesh for property panel display
      if (meshesInBox.length > 0) {
        selectMesh(meshesInBox[0] as Mesh);
      }
    } else if (manager && mode === 'replace') {
      manager.clear();
      deselectMesh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeshInSelectionBox]);

  // Select all meshes
  const selectAll = useCallback(() => {
    const scene = sceneRef.current;
    const manager = selectionManagerRef.current;
    if (!scene || !manager) return;

    const allIds: string[] = [];
    scene.meshes.forEach(mesh => {
      if (mesh.isPickable &&
        !mesh.name.includes('ground') &&
        !mesh.name.includes('Axis') &&
        !mesh.name.includes('preview')) {
        allIds.push(mesh.id);
      }
    });
    manager.selectIds(allIds, 'replace');
  }, []);

  // ==================== END SELECTION SYSTEM ====================

  // Update visual selection box (moved outside useEffect for proper hook usage)
  const updateSelectionBox = useCallback((startX: number, startY: number, currentX: number, currentY: number, visible: boolean) => {
    const boxState = selectionBoxRef.current;

    if (!visible) {
      if (boxState.element) {
        boxState.element.remove();
        boxState.element = null;
      }
      return;
    }

    if (!boxState.element) {
      const box = document.createElement('div');
      box.className = styles.selectionBox;
      canvasRef.current?.parentElement?.appendChild(box);
      boxState.element = box;
    }

    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);

    if (boxState.element) {
      boxState.element.style.left = `${left}px`;
      boxState.element.style.top = `${top}px`;
      boxState.element.style.width = `${width}px`;
      boxState.element.style.height = `${height}px`;

      const isCrossing = currentX < startX;
      boxState.element.className = `${styles.selectionBox} ${isCrossing ? styles.selectionBoxCrossing : styles.selectionBoxWindow}`;
    }
  }, []);

  // Initialize Babylon.js scene
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.08, 1);
    sceneRef.current = scene;

    // Camera
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 4,
      Math.PI / 3,
      10,
      Vector3.Zero(),
      scene
    );

    camera.attachControl(canvas, true);

    // Disable keyboard input from camera - we handle arrow keys ourselves for axis locking
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

    const pointerInput = camera.inputs.attached.pointers as {
      buttons?: number[];
      angularSensibilityX?: number;
      angularSensibilityY?: number;
      panningSensibility?: number;
    };

    if (pointerInput) {
      pointerInput.buttons = [1];
      pointerInput.angularSensibilityX = 500;
      pointerInput.angularSensibilityY = 500;
      pointerInput.panningSensibility = 50;
    }

    camera.wheelPrecision = 15;
    camera.pinchPrecision = 50;
    camera.minZ = 0.01;  // Near clipping plane - prevents geometry from being cut when close
    camera.lowerRadiusLimit = 0.5;
    camera.upperRadiusLimit = 500;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI - 0.1;
    camera.inertia = 0.7;
    camera.panningInertia = 0.7;

    // Disable default wheel zoom - we'll handle it with zoom-to-cursor
    camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");

    // Zoom to cursor without rotation
    const handleWheel = (evt: WheelEvent) => {
      evt.preventDefault();

      // Use ref to get current camera state (mode may have changed)
      const cam = cameraRef.current;
      if (!cam) return;

      // Store angles BEFORE any changes
      const savedAlpha = cam.alpha;
      const savedBeta = cam.beta;

      const zoomSpeed = 0.05;
      // deltaY < 0 = scroll up = zoom in (smaller radius/ortho)
      // deltaY > 0 = scroll down = zoom out (larger radius/ortho)
      const zoomIn = evt.deltaY < 0;
      const factor = zoomIn ? (1 - zoomSpeed) : (1 + zoomSpeed);

      // Handle orthographic mode - zoom to cursor
      if (cam.mode === 1) {
        const aspect = engine.getAspectRatio(cam);
        const currentSize = cam.orthoTop ?? 10;
        const newSize = Math.max(0.5, Math.min(500, currentSize * factor));

        // Zoom to cursor - pan towards mouse position
        const pickResult = scene.pick(evt.offsetX, evt.offsetY);
        if (pickResult?.hit && pickResult.pickedPoint) {
          const cursorPt = pickResult.pickedPoint;
          const oldTarget = cam.target.clone();
          const ratio = 1 - (newSize / currentSize);
          const offset = cursorPt.subtract(oldTarget).scale(ratio);
          cam.target.copyFrom(oldTarget.add(offset));
        }

        cam.orthoLeft = -newSize * aspect;
        cam.orthoRight = newSize * aspect;
        cam.orthoTop = newSize;
        cam.orthoBottom = -newSize;
        cam.radius = newSize * 2;
        return;
      }

      // Perspective mode - use radius
      const oldRadius = cam.radius;
      const newRadius = Math.max(cam.lowerRadiusLimit!, Math.min(cam.upperRadiusLimit!, oldRadius * factor));

      // Get cursor point
      const pickResult = scene.pick(evt.offsetX, evt.offsetY);

      if (pickResult?.hit && pickResult.pickedPoint) {
        const cursorPt = pickResult.pickedPoint;
        const oldTarget = cam.target.clone();

        // How much to pan: proportional to zoom change
        const ratio = 1 - (newRadius / oldRadius);

        // Move target towards cursor point
        const offset = cursorPt.subtract(oldTarget).scale(ratio);
        const newTarget = oldTarget.add(offset);

        // Apply changes
        cam.radius = newRadius;
        cam.target.copyFrom(newTarget);

        // FORCE restore angles (prevents rotation)
        cam.alpha = savedAlpha;
        cam.beta = savedBeta;
      } else {
        // No pick - just zoom to center
        cam.radius = newRadius;
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    cameraRef.current = camera;

    // Lights
    const light1 = new HemisphericLight('light1', new Vector3(1, 1, 0), scene);
    light1.intensity = 0.8;
    const light2 = new HemisphericLight('light2', new Vector3(-1, 1, 0), scene);
    light2.intensity = 0.4;

    // Sun directional light for shadows (initially disabled)
    const sunLight = new DirectionalLight('sunLight', new Vector3(-1, -2, -1), scene);
    sunLight.intensity = 0;  // Start disabled
    sunLight.position = new Vector3(50, 100, 50);
    sunLight.shadowMinZ = 0.1;
    sunLight.shadowMaxZ = 500;
    sunLightRef.current = sunLight;

    // Shadow generator
    const shadowGen = new ShadowGenerator(2048, sunLight);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 32;
    shadowGen.darkness = 0.3;
    shadowGen.transparencyShadow = true;
    shadowGeneratorRef.current = shadowGen;

    // Ground picker
    const groundPicker = MeshBuilder.CreateGround('groundPicker', { width: 1000, height: 1000 }, scene);
    groundPicker.position.y = 0;
    groundPicker.visibility = 0;
    groundPicker.isPickable = true;
    groundPickerRef.current = groundPicker;

    // Shadow-receiving ground (visible when shadows enabled)
    const shadowGround = MeshBuilder.CreateGround('shadowGround', { width: 500, height: 500 }, scene);
    shadowGround.position.y = -0.01; // Slightly below to avoid z-fighting
    shadowGround.receiveShadows = true;
    shadowGround.isPickable = false;
    shadowGround.visibility = 0; // Start invisible
    const shadowGroundMat = new StandardMaterial('shadowGroundMat', scene);
    shadowGroundMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
    shadowGroundMat.specularColor = new Color3(0, 0, 0);
    shadowGroundMat.backFaceCulling = false;
    shadowGround.material = shadowGroundMat;

    // Auto-add new meshes to shadow system
    scene.onNewMeshAddedObservable.add((mesh) => {
      if (mesh instanceof Mesh &&
          mesh.name !== 'groundPicker' &&
          mesh.name !== 'shadowGround' &&
          !mesh.name.includes('Axis') &&
          !mesh.name.includes('snap') &&
          !mesh.name.includes('origin') &&
          !mesh.name.includes('preview') &&
          !mesh.name.includes('Grid') &&
          !(mesh instanceof LinesMesh)) {
        mesh.receiveShadows = true;
        if (shadowGeneratorRef.current && shadowEnabledRef.current) {
          shadowGeneratorRef.current.addShadowCaster(mesh);
        }
      }
    });

    // Axis lines
    const axisLength = 500;

    const xAxisPos = MeshBuilder.CreateLines('xAxisPos', {
      points: [Vector3.Zero(), new Vector3(axisLength, 0, 0)],
    }, scene);
    xAxisPos.color = new Color3(0.9, 0.2, 0.2);
    xAxisPos.isPickable = false;

    // Helper function to create/update dashed axes with screen-space consistent dash pattern
    const DASH_REFERENCE_RADIUS = 20; // Reference camera radius for dash size calculation
    const BASE_DASH_SIZE = 0.05; // Base dash size at reference radius (in world units) - smaller = denser

    const createOrUpdateDashedAxes = (cameraRadius: number) => {
      // Calculate dash size proportional to camera distance for consistent screen appearance
      const dashScale = cameraRadius / DASH_REFERENCE_RADIUS;
      const dashSize = BASE_DASH_SIZE * dashScale;
      const gapSize = dashSize; // Equal dash and gap for consistent pattern
      // dashNb is the number of dashes - calculate based on axis length and dash size
      const dashNb = Math.ceil(axisLength / (dashSize + gapSize));

      // Dispose old meshes
      if (xAxisNegRef.current) xAxisNegRef.current.dispose();
      if (yAxisNegRef.current) yAxisNegRef.current.dispose();
      if (zAxisNegRef.current) zAxisNegRef.current.dispose();

      // X axis negative (red dashed)
      const xAxisNeg = MeshBuilder.CreateDashedLines('xAxisNeg', {
        points: [Vector3.Zero(), new Vector3(-axisLength, 0, 0)],
        dashSize,
        gapSize,
        dashNb,
      }, scene);
      xAxisNeg.color = new Color3(0.5, 0.2, 0.2);
      xAxisNeg.isPickable = false;
      xAxisNegRef.current = xAxisNeg;

      // Y axis negative (green dashed - Z in world space)
      const yAxisNeg = MeshBuilder.CreateDashedLines('yAxisNeg', {
        points: [Vector3.Zero(), new Vector3(0, 0, -axisLength)],
        dashSize,
        gapSize,
        dashNb,
      }, scene);
      yAxisNeg.color = new Color3(0.2, 0.4, 0.2);
      yAxisNeg.isPickable = false;
      yAxisNegRef.current = yAxisNeg;

      // Z axis negative (blue dashed - Y in world space)
      const zAxisNeg = MeshBuilder.CreateDashedLines('zAxisNeg', {
        points: [Vector3.Zero(), new Vector3(0, -axisLength, 0)],
        dashSize,
        gapSize,
        dashNb,
      }, scene);
      zAxisNeg.color = new Color3(0.2, 0.3, 0.5);
      zAxisNeg.isPickable = false;
      zAxisNegRef.current = zAxisNeg;
    };

    // Create initial dashed axes
    createOrUpdateDashedAxes(camera.radius);
    lastCameraRadiusRef.current = camera.radius;

    // Add camera observer to update dashed axes when zoom changes significantly
    camera.onViewMatrixChangedObservable.add(() => {
      const currentRadius = camera.radius;
      const lastRadius = lastCameraRadiusRef.current;
      // Only update when radius changes by more than 10% to avoid excessive updates
      if (Math.abs(currentRadius - lastRadius) / lastRadius > 0.1) {
        createOrUpdateDashedAxes(currentRadius);
        lastCameraRadiusRef.current = currentRadius;
      }
    });

    const yAxisPos = MeshBuilder.CreateLines('yAxisPos', {
      points: [Vector3.Zero(), new Vector3(0, 0, axisLength)],
    }, scene);
    yAxisPos.color = new Color3(0.2, 0.8, 0.2);
    yAxisPos.isPickable = false;

    const zAxisPos = MeshBuilder.CreateLines('zAxisPos', {
      points: [Vector3.Zero(), new Vector3(0, axisLength, 0)],
    }, scene);
    zAxisPos.color = new Color3(0.3, 0.5, 1);
    zAxisPos.isPickable = false;

    // Origin marker - no longer used, snap indicator will show when hovering near origin
    // Keeping the ref for backward compatibility but not creating visible marker
    originMarkerRef.current = null;

    // Snap indicator - cursor itself moves to snap point (magnetic snap)

    // HUD overlay for Drawing Cursor System
    const hudTexture = AdvancedDynamicTexture.CreateFullscreenUI('HUD', true, scene);
    hudTextureRef.current = hudTexture;

    // Pointer circle - 16px diameter, blue color (positioned at cursor tip)
    const pointerCircle = new Ellipse('pointerCircle');
    pointerCircle.width = '16px';
    pointerCircle.height = '16px';
    pointerCircle.color = 'rgba(0, 122, 255, 0.9)';
    pointerCircle.thickness = 2;
    pointerCircle.background = 'rgba(0, 122, 255, 0.3)';
    pointerCircle.isVisible = false; // Hidden by default, shown for drawing tools
    // Position from top-left corner of canvas
    pointerCircle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    pointerCircle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    // Don't block mouse events
    pointerCircle.isHitTestVisible = false;
    hudTexture.addControl(pointerCircle);
    pointerCircleRef.current = pointerCircle;

    // Highlight layer
    highlightLayerRef.current = new HighlightLayer('highlight', scene);

    // Create hover highlight material for push/pull tool (SketchUp-style blue highlight)
    const hoverMaterial = new StandardMaterial('hoverHighlightMaterial', scene);
    hoverMaterial.diffuseColor = new Color3(0.4, 0.6, 1.0);  // Saturated blue
    hoverMaterial.emissiveColor = new Color3(0.3, 0.5, 0.9);  // Strong blue emissive for visibility
    hoverMaterial.specularColor = new Color3(0.2, 0.2, 0.2);  // Slight specular
    hoverMaterial.backFaceCulling = false;  // Show both sides of faces
    hoverMaterial.alpha = 1.0;  // Fully opaque
    dottedHoverMaterialRef.current = hoverMaterial;

    // Gizmo manager
    const utilLayer = new UtilityLayerRenderer(scene);
    const gizmoManager = new GizmoManager(scene, 1, utilLayer);
    gizmoManager.positionGizmoEnabled = false;
    gizmoManager.rotationGizmoEnabled = false;
    gizmoManager.scaleGizmoEnabled = false;
    gizmoManager.boundingBoxGizmoEnabled = false;
    gizmoManagerRef.current = gizmoManager;

    engine.runRenderLoop(() => {
      scene.render();
    });

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      engine.dispose();
    };
  }, []);

  // Update gizmo based on active tool
  useEffect(() => {
    if (!gizmoManagerRef.current) return;
    const gm = gizmoManagerRef.current;

    // Move tool uses SketchUp-style click-click instead of gizmo
    gm.positionGizmoEnabled = false;
    gm.rotationGizmoEnabled = activeTool === 'rotate';
    gm.scaleGizmoEnabled = activeTool === 'scale';

    // Reset move state when changing tools
    if (activeTool !== 'move') {
      const moveState = moveToolStateRef.current;
      if (moveState.previewLine) {
        moveState.previewLine.dispose();
      }
      moveState.isMoving = false;
      moveState.startPoint = null;
      moveState.targetMesh = null;
      moveState.previewLine = null;
      moveState.originalPosition = null;
      moveState.inferredAxis = null;
    }
  }, [activeTool]);

  // Set up gizmo drag observers for edge stretching with real-time preview
  useEffect(() => {
    const gm = gizmoManagerRef.current;
    const scene = sceneRef.current;
    if (!gm || !scene) return;

    // We need to wait for the position gizmo to be enabled
    // Check periodically until it's available
    let observers: { dragStart?: any; drag?: any; dragEnd?: any } = {};

    // Helper to create/update stretch preview lines (ㄷ shape)
    const updateStretchPreview = (delta: Vector3) => {
      const dragState = edgeDragStateRef.current;
      if (!dragState.edgeMesh || !dragState.originalCorners) return;

      const parentFace = dragState.edgeMesh.metadata?.parentFace as Mesh;
      if (!parentFace) return;

      const vertexIndices = dragState.edgeMesh.metadata?.vertexIndices as number[];
      if (!vertexIndices || vertexIndices.length !== 2) return;

      // Get original corner positions in world space
      const corners = dragState.originalCorners;
      const worldMatrix = parentFace.getWorldMatrix();

      // Original edge vertices (the edge being moved)
      const origP1 = Vector3.TransformCoordinates(corners[vertexIndices[0]], worldMatrix);
      const origP2 = Vector3.TransformCoordinates(corners[vertexIndices[1]], worldMatrix);

      // New edge vertices (moved by delta)
      const newP1 = origP1.add(delta);
      const newP2 = origP2.add(delta);

      // Dispose old preview lines
      dragState.previewLines.forEach(line => line.dispose());
      dragState.previewLines = [];

      // Create ㄷ shape preview lines:
      // 1. Side line from origP1 to newP1
      const sideLine1 = MeshBuilder.CreateLines('stretchPreview_side1', {
        points: [origP1, newP1],
        updatable: false
      }, scene);
      sideLine1.color = new Color3(0.2, 0.6, 1); // Blue preview color
      sideLine1.isPickable = false;

      // 2. Side line from origP2 to newP2
      const sideLine2 = MeshBuilder.CreateLines('stretchPreview_side2', {
        points: [origP2, newP2],
        updatable: false
      }, scene);
      sideLine2.color = new Color3(0.2, 0.6, 1);
      sideLine2.isPickable = false;

      // 3. Moving edge line from newP1 to newP2
      const movingEdge = MeshBuilder.CreateLines('stretchPreview_edge', {
        points: [newP1, newP2],
        updatable: false
      }, scene);
      movingEdge.color = new Color3(0.2, 0.6, 1);
      movingEdge.isPickable = false;

      dragState.previewLines = [sideLine1, sideLine2, movingEdge];
    };

    const setupObservers = () => {
      const posGizmo = gm.gizmos.positionGizmo;
      if (!posGizmo) return false;

      // On drag start - record initial position and corners if it's an edge
      observers.dragStart = posGizmo.onDragStartObservable.add(() => {
        const attachedMesh = gm.attachedMesh;
        if (attachedMesh && attachedMesh.metadata?.type === 'edge') {
          const parentFace = attachedMesh.metadata?.parentFace as Mesh;
          const corners = parentFace?.metadata?.corners as Vector3[] | undefined;

          edgeDragStateRef.current = {
            isDragging: true,
            startPosition: attachedMesh.absolutePosition.clone(),
            edgeMesh: attachedMesh as Mesh,
            previewLines: [],
            originalCorners: corners ? corners.map(c => c.clone()) : null
          };
        }
      });

      // On drag - update preview in real-time
      observers.drag = posGizmo.onDragObservable.add(() => {
        const dragState = edgeDragStateRef.current;
        if (dragState.isDragging && dragState.edgeMesh && dragState.startPosition) {
          const currentPosition = dragState.edgeMesh.absolutePosition.clone();
          const delta = currentPosition.subtract(dragState.startPosition);

          if (delta.length() > 0.001) {
            updateStretchPreview(delta);
          }
        }
      });

      // On drag end - calculate delta, clean up preview, and stretch face
      observers.dragEnd = posGizmo.onDragEndObservable.add(() => {
        const dragState = edgeDragStateRef.current;

        // Dispose preview lines
        dragState.previewLines.forEach(line => line.dispose());

        if (dragState.isDragging && dragState.edgeMesh && dragState.startPosition) {
          const endPosition = dragState.edgeMesh.absolutePosition.clone();
          const delta = endPosition.subtract(dragState.startPosition);

          // Only stretch if there's actual movement
          if (delta.length() > 0.001) {
            // Reset edge position before stretching (gizmo moved it, we'll update face instead)
            dragState.edgeMesh.position = Vector3.Zero();

            stretchFaceByEdge(scene, dragState.edgeMesh, delta);
          }
        }

        // Reset drag state
        edgeDragStateRef.current = {
          isDragging: false,
          startPosition: null,
          edgeMesh: null,
          previewLines: [],
          originalCorners: null
        };
      });

      return true;
    };

    // Try to set up immediately
    if (!setupObservers()) {
      // If gizmo not ready, try again when tool changes
      const checkInterval = setInterval(() => {
        if (setupObservers()) {
          clearInterval(checkInterval);
        }
      }, 100);

      // Clean up interval after 5 seconds
      setTimeout(() => clearInterval(checkInterval), 5000);
    }

    return () => {
      const posGizmo = gm.gizmos.positionGizmo;
      if (posGizmo && observers.dragStart) {
        posGizmo.onDragStartObservable.remove(observers.dragStart);
      }
      if (posGizmo && observers.drag) {
        posGizmo.onDragObservable.remove(observers.drag);
      }
      if (posGizmo && observers.dragEnd) {
        posGizmo.onDragEndObservable.remove(observers.dragEnd);
      }
    };
  }, [stretchFaceByEdge]);

  // Update HUD pointer circle visibility based on active tool
  useEffect(() => {
    const scene = sceneRef.current;
    const pointerCircle = pointerCircleRef.current;
    if (!scene || !pointerCircle) return;

    // Drawing tools that should show the HUD pointer circle
    const isDrawingTool = ['line', 'rectangle', 'circle', 'polygon', 'arc', 'freehand'].includes(activeTool);
    pointerCircle.isVisible = isDrawingTool;

    // Set up pointer move observer for HUD position update
    // MAGNETIC SNAP: When snap is active, cursor JUMPS to snap point
    const observer = scene.onPointerObservable.add((pointerInfo) => {
      if (!pointerCircle.isVisible) return;
      // Filter for move events (type 4 is POINTERMOVE)
      if (pointerInfo.type !== 4) return;

      const camera = cameraRef.current;
      const engine = scene.getEngine();

      // Check if snap is active - if so, move cursor to snap point screen position
      if (activeSnapPointRef.current && camera) {
        // Convert 3D snap point to screen coordinates (preserve Y for 3D snapping!)
        const snapScreenPos = Vector3.Project(
          activeSnapPointRef.current.position,  // Use full 3D position including Y
          Matrix.Identity(),
          scene.getTransformMatrix(),
          camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
        );
        // Move HUD cursor to snap point (MAGNETIC SNAP!)
        pointerCircle.left = snapScreenPos.x - 8;
        pointerCircle.top = snapScreenPos.y - 8;
      } else {
        // No snap - follow mouse
        pointerCircle.left = scene.pointerX - 8;
        pointerCircle.top = scene.pointerY - 8;
      }
    });

    return () => {
      scene.onPointerObservable.remove(observer);
    };
  }, [activeTool]);

  // Update scene colors when theme changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Update scene clear color based on theme
    if (themeMode === 'light') {
      scene.clearColor = new Color4(0.96, 0.96, 0.96, 1);
    } else {
      scene.clearColor = new Color4(0.08, 0.08, 0.08, 1);
    }

    // Save to localStorage
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  // Toggle theme function
  const toggleTheme = () => {
    setThemeMode(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Handle pointer events
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    // Restore face material when switching away from pushpull tool
    if (activeTool !== 'pushpull' && hoveredFaceRef.current && hoveredFaceOriginalMaterialRef.current) {
      hoveredFaceRef.current.material = hoveredFaceOriginalMaterialRef.current;
      hoveredFaceRef.current = null;
      hoveredFaceOriginalMaterialRef.current = null;
    }

    // Camera control: Middle mouse always works, Left mouse only for orbit/zoom (not pan - we handle that manually)
    const pointersInput = camera.inputs.attached.pointers as { buttons?: number[] };
    if (pointersInput) {
      if (activeTool === 'orbit' || activeTool === 'zoom') {
        pointersInput.buttons = [0, 1]; // Left and middle mouse for orbit/zoom
      } else {
        pointersInput.buttons = [1]; // Only middle mouse for other tools (including pan)
      }
    }

    const handlePointerDown = (evt: PointerEvent) => {
      // Close context menu on any click
      if (selectionState.contextMenu) {
        setSelectionState(prev => ({ ...prev, contextMenu: null }));
      }

      // Right click handling
      if (evt.button === 2) {
        // If clicking on a mesh that is NOT selected, select it (exclusive)
        // If clicking on a mesh that IS selected, keep selection (context menu will open)
        const pickInfo = scene.pick(scene.pointerX, scene.pointerY);
        if (pickInfo.hit && pickInfo.pickedMesh) {
          const manager = selectionManagerRef.current;
          if (manager && !manager.isSelected(pickInfo.pickedMesh.id)) {
            manager.select(pickInfo.pickedMesh.id, 'replace');
          }
        }
        return;
      }

      if (evt.button !== 0) return;

      // Handle Pan tool
      if (activeTool === 'pan') {
        panStateRef.current.isPanning = true;
        panStateRef.current.lastX = evt.clientX;
        panStateRef.current.lastY = evt.clientY;
        return;
      }

      const pickInfo = scene.pick(scene.pointerX, scene.pointerY);

      // Handle SketchUp-style Move tool
      if (activeTool === 'move') {
        const moveState = moveToolStateRef.current;
        const groundPicker = groundPickerRef.current;

        // Get click position on ground plane (use predicate that checks name)
        const groundPick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name === 'groundPicker');
        const clickPoint = groundPick?.hit ? groundPick.pickedPoint : null;

        console.log('[Move] groundPick hit:', groundPick?.hit, 'clickPoint:', clickPoint);
        console.log('[Move] moveState.isMoving:', moveState.isMoving);

        if (!moveState.isMoving) {
          // First click: Start move operation
          // Need a selected mesh first
          const selected = selectedMeshRef.current;
          console.log('[Move] First click - selected:', selected?.name, 'type:', selected?.metadata?.type);

          if (!selected) {
            console.log('[Move] No selection - trying to select clicked mesh');
            // Try to select clicked mesh
            if (pickInfo.hit && pickInfo.pickedMesh) {
              const mesh = pickInfo.pickedMesh as Mesh;
              console.log('[Move] Clicked mesh:', mesh.name, 'type:', mesh.metadata?.type);
              if (mesh.metadata?.type === 'face' || mesh.metadata?.type === 'edge' || mesh.metadata?.type === 'solid') {
                selectMesh(mesh);
                console.log('[Move] Selected mesh via click, will start move on next click');
              }
            }
            return;
          }

          console.log('[Move] Have selection, proceeding to start move');

          // Get the actual mesh to move (parent face for edges)
          let meshToMove = selected;
          if (selected.metadata?.type === 'edge' && selected.parent) {
            meshToMove = selected.parent as Mesh;
            console.log('[Move] Using parent for edge:', meshToMove.name);
          }

          // Start point is either snap point or ground click or picked mesh point
          try {
            const snapPoint = snapPointRef.current?.position;
            console.log('[Move] snapPoint raw:', snapPoint);
            console.log('[Move] clickPoint raw:', clickPoint);
            console.log('[Move] pickInfo.pickedPoint raw:', pickInfo.pickedPoint);

            const startPoint = snapPoint || clickPoint || pickInfo.pickedPoint;
          if (!startPoint) {
            console.log('[Move] ERROR: No startPoint available, returning');
            return;
          }
          console.log('[Move] Using startPoint:', `(${startPoint.x.toFixed(2)}, ${startPoint.y.toFixed(2)}, ${startPoint.z.toFixed(2)})`);
          console.log('[Move] Starting move operation NOW!');

          moveState.isMoving = true;
          moveState.startPoint = startPoint.clone();
          moveState.targetMesh = meshToMove;
          moveState.originalPosition = meshToMove.position.clone();
          moveState.inferredAxis = null;

          // Create preview line
          moveState.previewLine = MeshBuilder.CreateLines('movePreviewLine', {
            points: [startPoint, startPoint],
            updatable: true
          }, scene);
          moveState.previewLine.color = new Color3(0.2, 0.6, 1.0);

        } else {
          // Second click: Complete move operation
          console.log('[Move] Second click - completing move');
          const endPoint = snapPointRef.current?.position || clickPoint;
          console.log('[Move] endPoint:', endPoint ? `(${endPoint.x.toFixed(2)}, ${endPoint.y.toFixed(2)}, ${endPoint.z.toFixed(2)})` : 'null');
          console.log('[Move] targetMesh:', moveState.targetMesh?.name);
          console.log('[Move] startPoint:', moveState.startPoint ? `(${moveState.startPoint.x.toFixed(2)}, ${moveState.startPoint.y.toFixed(2)}, ${moveState.startPoint.z.toFixed(2)})` : 'null');

          if (!endPoint || !moveState.targetMesh || !moveState.startPoint) {
            console.log('[Move] Missing required data, cancelling move');
            // Cancel if no valid endpoint
            if (moveState.previewLine) moveState.previewLine.dispose();
            moveState.isMoving = false;
            moveState.startPoint = null;
            moveState.targetMesh = null;
            moveState.previewLine = null;
            moveState.originalPosition = null;
            return;
          }

          // Calculate delta and apply
          let delta = endPoint.subtract(moveState.startPoint);
          console.log('[Move] delta before axis:', `(${delta.x.toFixed(2)}, ${delta.y.toFixed(2)}, ${delta.z.toFixed(2)})`);

          // Apply axis inference if active
          if (moveState.inferredAxis) {
            console.log('[Move] Applying axis constraint:', moveState.inferredAxis);
            if (moveState.inferredAxis === 'x') delta = new Vector3(delta.x, 0, 0);
            else if (moveState.inferredAxis === 'y') delta = new Vector3(0, delta.y, 0);
            else if (moveState.inferredAxis === 'z') delta = new Vector3(0, 0, delta.z);
          }

          console.log('[Move] Final delta:', `(${delta.x.toFixed(2)}, ${delta.y.toFixed(2)}, ${delta.z.toFixed(2)})`);
          console.log('[Move] Original position:', `(${moveState.targetMesh.position.x.toFixed(2)}, ${moveState.targetMesh.position.y.toFixed(2)}, ${moveState.targetMesh.position.z.toFixed(2)})`);

          // Apply the move
          moveState.targetMesh.position.addInPlace(delta);
          console.log('[Move] New position:', `(${moveState.targetMesh.position.x.toFixed(2)}, ${moveState.targetMesh.position.y.toFixed(2)}, ${moveState.targetMesh.position.z.toFixed(2)})`);

          // Cleanup
          if (moveState.previewLine) moveState.previewLine.dispose();
          moveState.isMoving = false;
          moveState.startPoint = null;
          moveState.targetMesh = null;
          moveState.previewLine = null;
          moveState.originalPosition = null;
          moveState.inferredAxis = null;
          console.log('[Move] Move completed and state reset');
        }
        return;
      }

      // Handle Select Tool (Box Selection & Click)
      if (activeTool === 'select') {
        const boxState = selectionBoxRef.current;
        const now = Date.now();

        // Robust helper to clear ALL solid highlights in the scene
        const clearAllSolidHighlights = () => {
          const manager = selectionManagerRef.current;
          if (manager) {
            manager.clear();
          }
          // Helper to reset edge color (handles both Lines and Tube meshes)
          const resetEdgeColor = (edge: any) => {
            edge.disableEdgesRendering();
            // Check if it's a Lines mesh (has .color property)
            if ('color' in edge && edge.color instanceof Color3) {
              edge.color = new Color3(0.1, 0.1, 0.1);
            } else if (edge.material) {
              const edgeMat = edge.material as StandardMaterial;
              edgeMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
              edgeMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
            }
          };
          // Iterate through ALL meshes in scene and clear face/edge highlights
          scene.meshes.forEach(m => {
            if (m.metadata?.type === 'solid') {
              m.getChildMeshes().forEach((child: any) => {
                if (child.metadata?.type === 'face') {
                  child.renderOverlay = false;
                  child.disableEdgesRendering();
                  if (child.material) {
                    (child.material as StandardMaterial).emissiveColor = Color3.Black();
                  }
                } else if (child.metadata?.type === 'edge') {
                  resetEdgeColor(child);
                }
              });
            } else if (m.metadata?.type === 'face') {
              m.renderOverlay = false;
              m.disableEdgesRendering();
              if (m.material) {
                (m.material as StandardMaterial).emissiveColor = Color3.Black();
              }
            } else if (m.metadata?.type === 'edge') {
              resetEdgeColor(m);
            }
          });
          deselectMesh();
          (boxState as any).clickCount = 0;
          (boxState as any).lastClickedMeshId = null;
        };

        // Handle Click Selection
        if (pickInfo.hit && pickInfo.pickedMesh) {
          const mesh = pickInfo.pickedMesh as Mesh;

          // Check if we clicked on a face or edge (part of a solid)
          const isFaceOrEdge = mesh.metadata?.type === 'face' || mesh.metadata?.type === 'edge';

          // If NOT clicking on a face or edge, DON'T clear immediately
          // Wait for pointerUp to determine if it was a click or start of drag selection
          // Track that we clicked on empty space for pointerUp handling
          if (!isFaceOrEdge) {
            (boxState as any).clickedOnEmptySpace = true;
            // Don't clear highlights here - let pointerUp handle it
          } else {
            (boxState as any).clickedOnEmptySpace = false;
            const timeSinceLastClick = now - ((boxState as any).lastClickTime || 0);
            const isSameMesh = (boxState as any).lastClickedMeshId === mesh.id;
            const isCtrlPressed = evt.ctrlKey || evt.metaKey;
            const manager = selectionManagerRef.current;

            // Track click count for same mesh within 400ms
            let clickCount = 1;
            if (isSameMesh && timeSinceLastClick < 400) {
              clickCount = ((boxState as any).clickCount || 1) + 1;
              if (clickCount > 3) clickCount = 1;  // Reset after triple click
            }
            (boxState as any).clickCount = clickCount;
            (boxState as any).lastClickedMeshId = mesh.id;

            // Get the parent solid for face/edge elements
            const getParentSolid = (m: Mesh): Mesh | null => {
              if (m.metadata?.type === 'solid') return m;
              if (m.metadata?.parentSolid) return m.metadata.parentSolid as Mesh;
              return null;
            };

            // Helper to clear all highlights - uses robust scene mesh iteration
            const clearAllHighlights = () => {
              if (manager) {
                manager.clear();
              }
              // Helper to reset edge color (handles both Lines and Tube meshes)
              const resetEdgeColor = (edge: any) => {
                edge.disableEdgesRendering();
                // Check if it's a Lines mesh (has .color property)
                if ('color' in edge && edge.color instanceof Color3) {
                  edge.color = new Color3(0.1, 0.1, 0.1);
                } else if (edge.material) {
                  const edgeMat = edge.material as StandardMaterial;
                  edgeMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                  edgeMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
                }
              };
              // Iterate through ALL meshes in scene and clear face/edge highlights
              scene.meshes.forEach(m => {
                if (m.metadata?.type === 'solid') {
                  m.getChildMeshes().forEach((child: any) => {
                    if (child.metadata?.type === 'face') {
                      child.renderOverlay = false;
                      child.disableEdgesRendering();
                      if (child.material) {
                        (child.material as StandardMaterial).emissiveColor = Color3.Black();
                      }
                    } else if (child.metadata?.type === 'edge') {
                      resetEdgeColor(child);
                    }
                  });
                } else if (m.metadata?.type === 'face') {
                  m.renderOverlay = false;
                  m.disableEdgesRendering();
                  if (m.material) {
                    (m.material as StandardMaterial).emissiveColor = Color3.Black();
                  }
                } else if (m.metadata?.type === 'edge') {
                  resetEdgeColor(m);
                }
              });
            };

            // Helper to highlight a face
            const highlightFace = (face: Mesh) => {
              face.renderOverlay = true;
              face.overlayColor = new Color3(0.2, 0.4, 1.0);
              face.overlayAlpha = 0.4;
              if (face.material) {
                const faceMat = face.material as StandardMaterial;
                faceMat.emissiveColor = new Color3(0.1, 0.2, 0.5);
              }
              manager?.select(face.id, 'add');
            };

            // Helper to highlight an edge (handles both Lines and Tube meshes)
            const highlightEdge = (edge: Mesh) => {
              // Check if it's a Lines mesh (has .color property)
              if ('color' in edge) {
                (edge as any).color = new Color3(0.2, 0.5, 1.0); // Blue highlight
              } else if (edge.material) {
                const mat = edge.material as StandardMaterial;
                mat.diffuseColor = new Color3(0.2, 0.4, 1.0);
                mat.emissiveColor = new Color3(0.2, 0.4, 1.0);
              }
              manager?.select(edge.id, 'add');
            };

            if (isCtrlPressed) {
              // Ctrl+click: toggle selection
              manager?.select(mesh.id, 'toggle');
              if (manager?.isSelected(mesh.id)) {
                selectMesh(mesh);
              }
            } else if (mesh.metadata?.type === 'face' || mesh.metadata?.type === 'edge') {
              // Face or edge of a solid clicked
              const parentSolid = getParentSolid(mesh);
              const clickedFace = mesh.metadata?.type === 'face' ? mesh : null;

              clearAllHighlights();

              if (clickCount === 1) {
                // Single click: select face only
                if (clickedFace) {
                  selectMesh(clickedFace);
                  highlightFace(clickedFace);
                } else if (mesh.metadata?.type === 'edge') {
                  // Edge clicked - just highlight the edge
                  selectMesh(mesh);
                  highlightEdge(mesh);
                }
              } else if (clickCount === 2) {
                // Double click: select face + all edges of solid
                if (parentSolid) {
                  selectMesh(parentSolid);
                  // Highlight clicked face
                  if (clickedFace) {
                    highlightFace(clickedFace);
                  }
                  // Highlight all edges of the solid
                  parentSolid.getChildMeshes().forEach((child: any) => {
                    if (child.metadata?.type === 'edge') {
                      highlightEdge(child as Mesh);
                    }
                  });
                }
              } else if (clickCount === 3) {
                // Triple click: select entire solid (all faces + edges)
                if (parentSolid) {
                  selectMesh(parentSolid);
                  // Highlight all faces and edges
                  parentSolid.getChildMeshes().forEach((child: any) => {
                    if (child.metadata?.type === 'face') {
                      highlightFace(child as Mesh);
                    } else if (child.metadata?.type === 'edge') {
                      highlightEdge(child as Mesh);
                    }
                  });
                }
              }
            } else {
              // Non-solid mesh clicked (ground face, line, etc.)
              clearAllHighlights();
              selectMesh(mesh);
              manager?.select(mesh.id, 'replace');
            }
            (boxState as any).lastClickTime = now;
          }
        } else {
          // Clicked truly empty space (not even ground)
          // Track for pointerUp - don't clear yet in case starting a drag
          (boxState as any).clickedOnEmptySpace = true;
        }

        // Start box selection
        boxState.isDragging = true;
        boxState.startX = scene.pointerX;
        boxState.startY = scene.pointerY;

        return;
      }
      // Skip if using camera navigation tools (camera handles these)
      if (activeTool === 'orbit' || activeTool === 'zoom') {
        return;
      }
      // if (evt.button !== 0) return; // This check is now done earlier for left click

      const state = drawingStateRef.current;

      // Line tool with continuous drawing mode
      if (activeTool === 'line') {
        const lineInf = lineInferenceRef.current;

        // For second click (when drawing), use Y-axis inference; for first click use regular picking
        let point: Vector3 | null;
        if (state.isDrawing && state.startPoint) {
          // Second click: Use Y-axis inference to get correct endpoint (including vertical lines)
          const result = getDrawingPointWithYInference(scene, scene.pointerX, scene.pointerY, state.startPoint);
          point = result.point;
        } else {
          // First click: Use regular drawing point
          point = getDrawingPoint(scene, scene.pointerX, scene.pointerY);
        }

        if (point) {
          if (!state.isDrawing) {
            // First click: Start drawing
            state.isDrawing = true;
            setIsDrawing(true);  // Update state for UI re-render
            // Use last endpoint for continuous mode, or clicked point
            if (lineInf.continuousMode && lineInf.lastEndpoint) {
              state.startPoint = lineInf.lastEndpoint.clone();
            } else {
              state.startPoint = point;
            }
            state.currentPoint = point;
          } else {
            // Second click: Finalize line and continue
            // Update currentPoint to clicked point (in case mouse move didn't update it)
            state.currentPoint = point;
            if (state.startPoint && state.currentPoint) {
              if (Vector3.Distance(state.startPoint, state.currentPoint) > 0.1) {
                finalizeLine(scene, state.startPoint, state.currentPoint);
                addLineSnapPoints(state.startPoint, state.currentPoint);

                // Continuous mode: Start next line from endpoint
                if (lineInf.continuousMode) {
                  // Cleanup preview but stay in drawing mode
                  if (state.previewMesh) {
                    state.previewMesh.dispose();
                    state.previewMesh = null;
                  }
                  // Start new line from last endpoint
                  state.startPoint = lineInf.lastEndpoint?.clone() || state.currentPoint.clone();
                  state.currentPoint = point;
                  return;  // Stay in drawing mode
                }
              }
            }
            // Non-continuous mode: Reset completely
            if (state.previewMesh) {
              state.previewMesh.dispose();
              state.previewMesh = null;
            }
            state.isDrawing = false;
            setIsDrawing(false);  // Update state for UI re-render
            state.startPoint = null;
            state.currentPoint = null;
          }
        }
      } else if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon') {
        // Use active snap point if available, otherwise get ground point
        const rawPoint = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        // IMPORTANT: Force Y=0 for ALL points to ensure drawing on ground plane
        let point: Vector3 | null = null;

        if (activeSnapPointRef.current) {
          point = new Vector3(activeSnapPointRef.current.position.x, 0, activeSnapPointRef.current.position.z);
        } else if (rawPoint) {
          point = new Vector3(rawPoint.x, 0, rawPoint.z);
        }

        if (point) {
          if (!state.isDrawing) {
            // First click: Start drawing
            state.isDrawing = true;
            setIsDrawing(true);  // Update state for UI re-render
            state.startPoint = point;
            state.currentPoint = point;
          } else {
            // Second click: Finalize the shape
            if (state.startPoint && state.currentPoint) {
              if (activeTool === 'rectangle') {
                const rectResult = finalizeRectangle(scene, state.startPoint, state.currentPoint);
                if (rectResult) {
                  addRectangleSnapPoints(state.startPoint, state.currentPoint);
                }
              } else if (activeTool === 'circle') {
                finalizeCircle(scene, state.startPoint, state.currentPoint);
              } else if (activeTool === 'polygon') {
                finalizePolygon(scene, state.startPoint, state.currentPoint, 6);
              }
            }
            // Cleanup preview
            if (state.previewMesh) {
              state.previewMesh.dispose();
              state.previewMesh = null;
            }
            // Reset state
            state.isDrawing = false;
            setIsDrawing(false);  // Update state for UI re-render
            state.startPoint = null;
            state.currentPoint = null;
          }
        }
      } else if (activeTool === 'pushpull') {
        const ppState = pushPullStateRef.current;
        const now = Date.now();
        const isDoubleClick = (now - ppState.lastClickTime) < 300;  // 300ms threshold

        // IMPORTANT: Use the face that was highlighted during hover, not a new pick!
        // This ensures the face user sees (with dotted pattern) is the one that gets push/pulled
        // If no hovered face, fall back to scene.pick
        let face: Mesh | null = null;
        if (hoveredFaceRef.current && !hoveredFaceRef.current.isDisposed()) {
          face = hoveredFaceRef.current;
          console.log('[PushPull] Using hovered face:', face.name);
        } else {
          const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
            mesh.metadata?.type === 'face'
          );
          if (pickResult?.hit && pickResult.pickedMesh) {
            face = pickResult.pickedMesh as Mesh;
            console.log('[PushPull] Using picked face (no hover):', face.name);
          }
        }

        if (!ppState.isExtruding) {
          // Not currently extruding - check for face click
          if (face) {

            // Calculate face normal based on face direction or stored faceNormal
            const getFaceNormal = (f: Mesh): Vector3 => {
              // First check for stored faceNormal (used by wall faces from push/pull)
              if (f.metadata?.faceNormal) {
                const fn = f.metadata.faceNormal;
                return new Vector3(fn.x, fn.y, fn.z);
              }

              const dir = f.metadata?.faceDir;
              switch (dir) {
                case 'top': return new Vector3(0, 1, 0);
                case 'bottom': return new Vector3(0, -1, 0);
                case 'front': return new Vector3(0, 0, 1);
                case 'back': return new Vector3(0, 0, -1);
                case 'right': return new Vector3(1, 0, 0);
                case 'left': return new Vector3(-1, 0, 0);
                default: return new Vector3(0, 1, 0); // Ground face default
              }
            };

            // Check for double-click on a face - apply last extrusion distance
            if (isDoubleClick && ppState.lastExtrudeDistance !== 0) {
              // Double-click: Apply previous extrusion distance
              const faceNormal = getFaceNormal(face);
              applyPushPull(face, ppState.lastExtrudeDistance, faceNormal, ppState.copyMode);
              // Update measurement display
              setMeasurementInput(Math.abs(ppState.lastExtrudeDistance * 1000).toFixed(0));
            } else {
              // First click: Start extrusion mode
              console.log('[PushPull] First click - face:', face.name, 'metadata:', JSON.stringify({
                type: face.metadata?.type,
                faceDir: face.metadata?.faceDir,
                hasParentSolid: !!face.metadata?.parentSolid,
                parentSolidName: face.metadata?.parentSolid?.name
              }));
              ppState.baseFace = face;
              ppState.baseFaceNormal = getFaceNormal(face);
              ppState.baseFaceCenter = face.getAbsolutePosition().clone();
              ppState.baseClickPoint = new Vector3(scene.pointerX, scene.pointerY, 0);
              ppState.isExtruding = true;
            }

            ppState.lastClickTime = now;
            ppState.lastClickFace = face;
          }
        } else {
          // Currently extruding - second click finalizes
          if (ppState.baseFace && ppState.baseFaceNormal) {
            // Calculate final extrusion distance
            const distance = calculateExtrudeDistance(
              scene,
              ppState.baseFaceCenter!,
              ppState.baseFaceNormal,
              scene.pointerX,
              scene.pointerY
            );

            console.log('[PushPull] Finalize click - distance:', distance);
            if (Math.abs(distance) > 0.01) {
              // Apply extrusion (with copyMode from Option key)
              const solid = applyPushPull(ppState.baseFace, distance, ppState.baseFaceNormal, ppState.copyMode);
              if (solid) {
                // Store last extrusion distance for double-click repeat
                ppState.lastExtrudeDistance = distance;
                // Update measurement display
                setMeasurementInput(Math.abs(distance * 1000).toFixed(0));
                // Add snap points for the new solid's vertices (including top edges)
                addSolidSnapPoints(solid);
              }
            }

            // Clean up preview
            if (ppState.previewMesh) {
              ppState.previewMesh.dispose();
              ppState.previewMesh = null;
            }

            // Remove face highlight
            if (highlightLayerRef.current && ppState.baseFace && !ppState.baseFace.isDisposed()) {
              highlightLayerRef.current.removeMesh(ppState.baseFace);
            }
          }

          // Reset state
          ppState.baseFace = null;
          ppState.baseFaceNormal = null;
          ppState.baseFaceCenter = null;
          ppState.baseClickPoint = null;
          ppState.isExtruding = false;
          ppState.axisLocked = false;
          ppState.lockedDistance = 0;
          ppState.lastClickTime = now;
        }
      } else if (activeTool === 'offset') {
        // Offset Tool - creates offset face inside/outside original
        const osState = offsetStateRef.current;
        const now = Date.now();
        const isDoubleClick = (now - osState.lastClickTime) < 300;

        // Pick face under cursor
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.metadata?.type === 'face'
        );

        if (!osState.isOffsetting) {
          // Not currently offsetting - check for face click
          if (pickResult?.hit && pickResult.pickedMesh) {
            const face = pickResult.pickedMesh as Mesh;

            // Get face vertices from positions buffer
            const positions = face.getVerticesData('position');
            if (positions && positions.length >= 9) {
              const rawVertices: Vector3[] = [];
              // Get unique vertices (assume triangulated quad face = 6 indices, 4 unique vertices)
              const seen = new Set<string>();
              for (let i = 0; i < positions.length; i += 3) {
                const key = `${positions[i].toFixed(4)},${positions[i+1].toFixed(4)},${positions[i+2].toFixed(4)}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  const worldPos = Vector3.TransformCoordinates(
                    new Vector3(positions[i], positions[i+1], positions[i+2]),
                    face.getWorldMatrix()
                  );
                  rawVertices.push(worldPos);
                }
              }

              // Calculate face center
              const center = rawVertices.reduce((acc, v) => acc.add(v), Vector3.Zero()).scale(1 / rawVertices.length);

              // IMPORTANT: Sort vertices by angle from center (counter-clockwise order)
              const vertices = [...rawVertices].sort((a, b) => {
                const angleA = Math.atan2(a.z - center.z, a.x - center.x);
                const angleB = Math.atan2(b.z - center.z, b.x - center.x);
                return angleA - angleB;
              });

              // Check for double-click - apply last offset distance
              if (isDoubleClick && osState.lastOffsetDistance !== 0) {
                applyOffset(face, osState.lastOffsetDistance);
                setMeasurementInput(Math.abs(osState.lastOffsetDistance * 1000).toFixed(0));
              } else {
                // First click - start offset mode
                osState.baseFace = face;
                osState.baseVertices = vertices;
                osState.baseCenter = center;
                osState.baseClickY = evt.clientY;
                osState.isOffsetting = true;
              }

              osState.lastClickTime = now;
            }
          }
        } else {
          // Currently offsetting - second click finalizes
          if (osState.baseFace) {
            // Calculate offset distance based on mouse movement
            const distance = (osState.baseClickY - evt.clientY) * 0.005; // Scale factor

            if (Math.abs(distance) > 0.001) {
              applyOffset(osState.baseFace, distance);
              osState.lastOffsetDistance = distance;
              setMeasurementInput(Math.abs(distance * 1000).toFixed(0));
            }

            // Clean up preview
            if (osState.previewMesh) {
              osState.previewMesh.dispose();
              osState.previewMesh = null;
            }
          }

          // Reset state
          osState.baseFace = null;
          osState.baseVertices = [];
          osState.baseCenter = null;
          osState.isOffsetting = false;
          osState.lastClickTime = now;
        }
      } else if (activeTool === 'eraser') {
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.isPickable && mesh.name !== 'ground' && mesh.name !== 'groundPicker' && !mesh.name.startsWith('snap')
        );
        
        if (pickResult?.hit && pickResult.pickedMesh) {
          const pickedMesh = pickResult.pickedMesh as Mesh;
          
          // If picked a face, check if we're near an edge
          if (pickedMesh.metadata?.type === 'face') {
            const ray = scene.createPickingRay(scene.pointerX, scene.pointerY, Matrix.Identity(), camera);
            let closestEdge: Mesh | null = null;
            let closestDist = Infinity;
            
            // Check child edges
            pickedMesh.getChildMeshes().forEach((child: any) => {
              if (child.metadata?.type === 'edge' && child.isPickable) {
                const edgePick = ray.intersectsMesh(child as Mesh, false);
                if (edgePick.hit && edgePick.distance < closestDist) {
                  closestDist = edgePick.distance;
                  closestEdge = child as Mesh;
                }
              }
            });
            
            if (closestEdge) {
              // Delete only the edge
              (closestEdge as Mesh).dispose();
            } else {
              // Delete the face (and children)
              pickedMesh.dispose();
            }
          } else if (pickedMesh.metadata?.type === 'edge') {
            // Standalone edge - just dispose
            pickedMesh.dispose();
          } else {
            pickedMesh.dispose();
          }
          deselectMesh();
        }
      } else if (activeTool === 'paint') {
        // Paint tool - apply selected color to clicked mesh
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.isPickable && mesh.name !== 'ground' && mesh.name !== 'groundPicker'
        );
        if (pickResult?.hit && pickResult.pickedMesh) {
          const mesh = pickResult.pickedMesh as Mesh;
          const material = mesh.material as StandardMaterial;
          if (material && material.diffuseColor) {
            material.diffuseColor = Color3.FromHexString(selectedColor);
          } else {
            const newMat = new StandardMaterial(`paintMat_${Date.now()}`, scene);
            newMat.diffuseColor = Color3.FromHexString(selectedColor);
            newMat.specularColor = new Color3(0.2, 0.2, 0.2);
            mesh.material = newMat;
          }
          selectMesh(mesh);
        }
      } else if (activeTool === 'zoomExtents') {
        zoomExtents();
      }
    };

    const handlePointerMove = (evt: PointerEvent) => {
      // Handle pan tool - move camera target
      if (activeTool === 'pan' && panStateRef.current.isPanning) {
        const deltaX = evt.clientX - panStateRef.current.lastX;
        const deltaY = evt.clientY - panStateRef.current.lastY;
        panStateRef.current.lastX = evt.clientX;
        panStateRef.current.lastY = evt.clientY;

        // Calculate pan direction based on camera orientation
        const panSpeed = camera.radius * 0.002;
        const right = camera.getDirection(new Vector3(1, 0, 0));
        const up = camera.getDirection(new Vector3(0, 1, 0));

        // Move camera target (negative because we want to pan in opposite direction of drag)
        camera.target.addInPlace(right.scale(-deltaX * panSpeed));
        camera.target.addInPlace(up.scale(deltaY * panSpeed));
        return;
      }

      // Handle SketchUp-style Move tool preview
      if (activeTool === 'move') {
        const moveState = moveToolStateRef.current;
        if (moveState.isMoving && moveState.startPoint && moveState.targetMesh && moveState.originalPosition) {
          const groundPicker = groundPickerRef.current;
          const groundPick = groundPicker ? scene.pick(scene.pointerX, scene.pointerY, (m) => m === groundPicker) : null;
          const currentPoint = snapPointRef.current?.position || (groundPick?.hit ? groundPick.pickedPoint : null);

          if (currentPoint) {
            // Calculate delta
            let delta = currentPoint.subtract(moveState.startPoint);

            // Axis inference: if moving mostly along one axis, lock to it
            const absX = Math.abs(delta.x);
            const absY = Math.abs(delta.y);
            const absZ = Math.abs(delta.z);
            const maxDelta = Math.max(absX, absY, absZ);
            const threshold = 0.3; // 30% threshold for axis lock

            if (maxDelta > 0.01) {
              if (absX > maxDelta * (1 - threshold) && absY < maxDelta * threshold && absZ < maxDelta * threshold) {
                moveState.inferredAxis = 'x';
                delta = new Vector3(delta.x, 0, 0);
              } else if (absY > maxDelta * (1 - threshold) && absX < maxDelta * threshold && absZ < maxDelta * threshold) {
                moveState.inferredAxis = 'y';
                delta = new Vector3(0, delta.y, 0);
              } else if (absZ > maxDelta * (1 - threshold) && absX < maxDelta * threshold && absY < maxDelta * threshold) {
                moveState.inferredAxis = 'z';
                delta = new Vector3(0, 0, delta.z);
              } else {
                moveState.inferredAxis = null;
              }
            }

            // Update preview line
            if (moveState.previewLine) {
              const endPoint = moveState.startPoint.add(delta);
              moveState.previewLine = MeshBuilder.CreateLines('movePreviewLine', {
                points: [moveState.startPoint, endPoint],
                instance: moveState.previewLine as LinesMesh
              }, scene);
              // Color based on axis
              if (moveState.inferredAxis === 'x') {
                moveState.previewLine.color = new Color3(1, 0, 0); // Red for X
              } else if (moveState.inferredAxis === 'y') {
                moveState.previewLine.color = new Color3(0, 1, 0); // Green for Y
              } else if (moveState.inferredAxis === 'z') {
                moveState.previewLine.color = new Color3(0, 0, 1); // Blue for Z
              } else {
                moveState.previewLine.color = new Color3(0.2, 0.6, 1.0); // Cyan for free
              }
            }

            // Real-time move preview
            moveState.targetMesh.position = moveState.originalPosition.add(delta);
          }
        }
      }

      // Show/hide snap indicator for drawing tools (SketchUp style)
      // Uses SCREEN-SPACE distance for snap detection to work with 3D geometry
      if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon') {
        const engine = scene.getEngine();
        const screenX = scene.pointerX;
        const screenY = scene.pointerY;

        // Find nearest snap point using screen-space distance
        const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
        let nearestSnap: SnapPointData | null = null;
        let minScreenDist = 20; // 20 pixel threshold for endpoint/midpoint snap (stronger)

        // Check origin first (highest priority)
        const originScreen = Vector3.Project(
          Vector3.Zero(),
          Matrix.Identity(),
          scene.getTransformMatrix(),
          viewport
        );
        const originDist = Math.sqrt(
          Math.pow(screenX - originScreen.x, 2) +
          Math.pow(screenY - originScreen.y, 2)
        );
        if (originDist < minScreenDist) {
          minScreenDist = originDist;
          nearestSnap = { position: Vector3.Zero(), type: 'origin' };
        }

        // Check all snap points (endpoints, midpoints) in screen space
        for (const snapPoint of snapPointsRef.current) {
          const screenPos = Vector3.Project(
            snapPoint.position,
            Matrix.Identity(),
            scene.getTransformMatrix(),
            viewport
          );
          const screenDist = Math.sqrt(
            Math.pow(screenX - screenPos.x, 2) +
            Math.pow(screenY - screenPos.y, 2)
          );
          if (screenDist < minScreenDist) {
            minScreenDist = screenDist;
            nearestSnap = snapPoint;
          }
        }

        // If no endpoint/midpoint snap found, check for on-edge snap (weaker threshold)
        if (!nearestSnap) {
          const onEdgeThreshold = 12; // 12 pixel threshold for on-edge snap
          let minEdgeDist = onEdgeThreshold;

          // Helper function: find nearest point on line segment (in screen space)
          const nearestPointOnSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
            const dx = bx - ax;
            const dy = by - ay;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 0.001) return { x: ax, y: ay, t: 0 };

            let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t)); // Clamp to segment
            return { x: ax + t * dx, y: ay + t * dy, t };
          };

          // Check all edge meshes for on-edge snapping
          scene.meshes.forEach(mesh => {
            if (mesh.metadata?.type === 'edge') {
              // Get edge path from mesh vertices
              const positions = mesh.getVerticesData('position');
              if (positions && positions.length >= 6) {
                // Get first and last vertex positions (start and end of edge)
                const startLocal = new Vector3(positions[0], positions[1], positions[2]);
                const endLocal = new Vector3(
                  positions[positions.length - 3],
                  positions[positions.length - 2],
                  positions[positions.length - 1]
                );

                // Transform to world coordinates
                const worldMatrix = mesh.getWorldMatrix();
                const startWorld = Vector3.TransformCoordinates(startLocal, worldMatrix);
                const endWorld = Vector3.TransformCoordinates(endLocal, worldMatrix);

                // Project to screen
                const startScreen = Vector3.Project(startWorld, Matrix.Identity(), scene.getTransformMatrix(), viewport);
                const endScreen = Vector3.Project(endWorld, Matrix.Identity(), scene.getTransformMatrix(), viewport);

                // Find nearest point on this edge in screen space
                const nearest = nearestPointOnSegment(
                  screenX, screenY,
                  startScreen.x, startScreen.y,
                  endScreen.x, endScreen.y
                );

                const dist = Math.sqrt(Math.pow(screenX - nearest.x, 2) + Math.pow(screenY - nearest.y, 2));

                // Only consider if not at endpoints (t between 0.05 and 0.95) to avoid overlap with endpoint snap
                if (dist < minEdgeDist && nearest.t > 0.05 && nearest.t < 0.95) {
                  minEdgeDist = dist;
                  // Interpolate world position
                  const worldPos = Vector3.Lerp(startWorld, endWorld, nearest.t);
                  nearestSnap = { position: worldPos, type: 'onedge' };
                }
              }
            }
          });
        }

        if (nearestSnap) {
          // Preserve actual Y coordinate for 3D snapping (top edges, etc.)
          activeSnapPointRef.current = {
            position: nearestSnap.position.clone(),
            type: nearestSnap.type
          };
          showSnapIndicator(nearestSnap.type);
        } else {
          activeSnapPointRef.current = null;
          hideSnapIndicator();
        }
      } else if (activeTool === 'pushpull') {
        const ppState = pushPullStateRef.current;
        activeSnapPointRef.current = null;
        hideSnapIndicator();

        if (ppState.isExtruding && ppState.baseFace && ppState.baseFaceNormal && ppState.baseFaceCenter) {
          // Currently extruding - update preview and measurement
          let distance = calculateExtrudeDistance(
            scene,
            ppState.baseFaceCenter,
            ppState.baseFaceNormal,
            scene.pointerX,
            scene.pointerY
          );

          // Shift key: Lock axis direction
          if (ppState.axisLocked) {
            // When first locking, store current distance
            if (ppState.lockedDistance === 0 && distance !== 0) {
              ppState.lockedDistance = distance;
            }
            // Keep the same sign (direction) as locked distance
            if (ppState.lockedDistance !== 0) {
              distance = Math.sign(ppState.lockedDistance) * Math.abs(distance);
            }
          }

          // Update preview mesh
          updatePushPullPreview(scene, ppState.baseFace, distance, ppState.baseFaceNormal);

          // Update measurement display (convert to mm)
          setMeasurementInput(Math.abs(distance * 1000).toFixed(0));
        } else {
          // Not extruding - show dotted pattern on hovered face (SketchUp-style)
          const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => {
            return mesh.metadata?.type === 'face';
          });

          if (pickResult?.hit && pickResult.pickedMesh && dottedHoverMaterialRef.current) {
            const hoveredMesh = pickResult.pickedMesh as Mesh;

            // Only update if hovering different face
            if (hoveredFaceRef.current !== hoveredMesh) {
              console.log('[PushPull] Hover detected face:', { name: hoveredMesh.name, id: hoveredMesh.id, metadata: hoveredMesh.metadata });
              // Restore previous face's original material
              if (hoveredFaceRef.current && hoveredFaceOriginalMaterialRef.current) {
                hoveredFaceRef.current.material = hoveredFaceOriginalMaterialRef.current;
              }
              // Store original material and apply dotted pattern
              hoveredFaceOriginalMaterialRef.current = hoveredMesh.material;
              hoveredMesh.material = dottedHoverMaterialRef.current;
              hoveredFaceRef.current = hoveredMesh;
            }
          } else {
            // Not hovering over a face - restore original material
            if (hoveredFaceRef.current && hoveredFaceOriginalMaterialRef.current) {
              hoveredFaceRef.current.material = hoveredFaceOriginalMaterialRef.current;
              hoveredFaceRef.current = null;
              hoveredFaceOriginalMaterialRef.current = null;
            }
          }
        }
      } else if (activeTool === 'offset') {
        // Offset tool - show hover highlight and update preview during offsetting
        const osState = offsetStateRef.current;
        activeSnapPointRef.current = null;
        hideSnapIndicator();

        if (osState.isOffsetting && osState.baseFace && osState.baseCenter) {
          // Currently offsetting - update preview based on mouse movement
          const distance = (osState.baseClickY - evt.clientY) * 0.005;

          // Update preview mesh
          updateOffsetPreview(scene, osState.baseFace, osState.baseVertices, osState.baseCenter, distance);

          // Update measurement display (convert to mm)
          setMeasurementInput(Math.abs(distance * 1000).toFixed(0));
        } else {
          // Not offsetting - show dotted pattern on hovered face (SketchUp-style)
          const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => {
            return mesh.metadata?.type === 'face';
          });

          if (pickResult?.hit && pickResult.pickedMesh && dottedHoverMaterialRef.current) {
            const hoveredMesh = pickResult.pickedMesh as Mesh;

            // Only update if hovering different face
            if (hoveredFaceRef.current !== hoveredMesh) {
              // Restore previous face's original material
              if (hoveredFaceRef.current && hoveredFaceOriginalMaterialRef.current) {
                hoveredFaceRef.current.material = hoveredFaceOriginalMaterialRef.current;
              }
              // Store original material and apply dotted pattern
              hoveredFaceOriginalMaterialRef.current = hoveredMesh.material;
              hoveredMesh.material = dottedHoverMaterialRef.current;
              hoveredFaceRef.current = hoveredMesh;
            }
          } else {
            // Not hovering over a face - restore original material
            if (hoveredFaceRef.current && hoveredFaceOriginalMaterialRef.current) {
              hoveredFaceRef.current.material = hoveredFaceOriginalMaterialRef.current;
              hoveredFaceRef.current = null;
              hoveredFaceOriginalMaterialRef.current = null;
            }
          }
        }
      } else if (activeTool === 'select') {
        const boxState = selectionBoxRef.current;
        if (boxState.isDragging) {
          updateSelectionBox(
            boxState.startX,
            boxState.startY,
            scene.pointerX,
            scene.pointerY,
            true
          );
        }
      } else {
        // Hide snap indicator when not using other tools
        activeSnapPointRef.current = null;
        hideSnapIndicator();
      }

      const state = drawingStateRef.current;
      if (!state.isDrawing || !state.startPoint) return;

      // Use active snap point if available for drawing previews
      // IMPORTANT: Force Y=0 for ALL points to ensure drawing on ground plane
      const getSnappedPoint = (): Vector3 | null => {
        const rawPoint = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        if (activeSnapPointRef.current) {
          return new Vector3(activeSnapPointRef.current.position.x, 0, activeSnapPointRef.current.position.z);
        }
        if (rawPoint) {
          return new Vector3(rawPoint.x, 0, rawPoint.z);
        }
        return null;
      };

      if (activeTool === 'line') {
        // Line tool uses getDrawingPointWithYInference for 3D drawing support including Y-axis
        const { point, inferredAxis } = getDrawingPointWithYInference(scene, scene.pointerX, scene.pointerY, state.startPoint);
        if (point) {
          state.currentPoint = point;
          updatePreviewLine(scene, state.startPoint, point);
          // Store inferred axis for visual feedback (could show axis color)
          lineInferenceRef.current.inferredAxis = inferredAxis;
        }
      } else if (activeTool === 'rectangle') {
        const point = getSnappedPoint();
        if (point) {
          state.currentPoint = point;
          updatePreviewRectangle(scene, state.startPoint, point);
          // Update measurement display (convert units to mm)
          const mods = shapeModifiersRef.current;
          let w = Math.abs(point.x - state.startPoint.x);
          let h = Math.abs(point.z - state.startPoint.z);
          if (mods.lockSquare) {
            const maxDim = Math.max(w, h);
            w = maxDim;
            h = maxDim;
          }
          if (mods.drawFromCenter) {
            w *= 2;
            h *= 2;
          }
          setCurrentMeasurement({ width: Math.round(w * UNIT_TO_MM), height: Math.round(h * UNIT_TO_MM) });
        }
      } else if (activeTool === 'circle') {
        const point = getSnappedPoint();
        if (point) {
          state.currentPoint = point;
          updatePreviewCircle(scene, state.startPoint, point);
          // Update measurement display (convert radius to mm)
          const dx = point.x - state.startPoint.x;
          const dz = point.z - state.startPoint.z;
          const radius = Math.sqrt(dx * dx + dz * dz);
          setCurrentMeasurement({ width: 0, height: Math.round(radius * UNIT_TO_MM) });
        }
      } else if (activeTool === 'polygon') {
        const point = getSnappedPoint();
        if (point) {
          state.currentPoint = point;
          const sides = currentMeasurement.sides || 6;
          updatePreviewPolygon(scene, state.startPoint, point, sides);
          // Update measurement display (convert radius to mm)
          const dx = point.x - state.startPoint.x;
          const dz = point.z - state.startPoint.z;
          const radius = Math.sqrt(dx * dx + dz * dz);
          setCurrentMeasurement(prev => ({ ...prev, width: 0, height: Math.round(radius * UNIT_TO_MM) }));
        }
      } else if (activeTool === 'pushpull') {
        const deltaY = (state.startPoint.y - scene.pointerY) * 0.05;
        const targetMesh = (state as DrawingState & { targetMesh?: Mesh }).targetMesh;
        if (targetMesh) {
          targetMesh.position.y = 0.01 + deltaY * 0.5;
        }
      }

      // Select tool - update box selection during drag
      // This block is now handled by the `else if (activeTool === 'select')` above.
      // if (activeTool === 'select') {
      //   const boxState = selectionBoxRef.current;
      //   if (boxState.isDragging) {
      //     updateSelectionBox(
      //       boxState.startX,
      //       boxState.startY,
      //       scene.pointerX,
      //       scene.pointerY,
      //       true
      //     );
      //   }
      // }
    };

    const handlePointerUp = (evt: PointerEvent) => {
      // Reset pan state
      if (activeTool === 'pan' || evt.button === 1) { // Also reset if middle mouse was used for pan
        panStateRef.current.isPanning = false;
        return;
      }

      if (evt.button !== 0) return;

      // Select tool - finalize box selection
      if (activeTool === 'select') {
        const boxState = selectionBoxRef.current;
        if (boxState.isDragging) {
          // Determine selection mode from modifier keys
          const isShift = evt.shiftKey;
          const isCtrl = evt.ctrlKey || evt.metaKey;
          let mode: 'replace' | 'add' | 'toggle' | 'subtract' = 'replace';

          if (isShift && isCtrl) {
            mode = 'subtract';
          } else if (isShift) {
            mode = 'toggle';
          } else if (isCtrl) {
            mode = 'add';
          }

          // Only perform box selection if dragged more than 5 pixels
          const currentX = scene.pointerX;
          const currentY = scene.pointerY;
          const dx = currentX - boxState.startX;
          const dy = currentY - boxState.startY;

          if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            performBoxSelection(
              boxState.startX,
              boxState.startY,
              currentX,
              currentY,
              mode
            );
          } else {
            // Clicked without dragging
            // Only clear selection if clicked on empty space and no modifier held
            if ((boxState as any).clickedOnEmptySpace && !isShift && !isCtrl) {
              // Clear both SelectionManager and visual highlights
              selectionManagerRef.current?.clear();
              deselectMesh();
              // Clear all face/edge highlights
              scene.meshes.forEach(m => {
                if (m.metadata?.type === 'face') {
                  m.renderOverlay = false;
                  if (m.material) {
                    (m.material as StandardMaterial).emissiveColor = Color3.Black();
                  }
                }
              });
            }
          }

          // Reset clickedOnEmptySpace flag
          (boxState as any).clickedOnEmptySpace = false;

          // Hide selection box and reset state
          boxState.isDragging = false;
          updateSelectionBox(0, 0, 0, 0, false);
        }
        return;
      }

      // Line, rectangle, circle, polygon, push/pull, and offset use click-click (SketchUp style), not drag
      // So don't finalize on mouse up for those tools
      if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon' || activeTool === 'pushpull' || activeTool === 'offset') {
        return;
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      if (canvas) {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointermove', handlePointerMove);
        canvas.removeEventListener('pointerup', handlePointerUp);
      }
    };
  }, [activeTool, selectedColor, getGroundPoint, updatePreviewLine, updatePreviewRectangle, updatePreviewCircle, updatePreviewPolygon, finalizeLine, finalizeRectangle, finalizeCircle, finalizePolygon, applyPushPull, applyOffset, zoomExtents, addLineSnapPoints, addRectangleSnapPoints, showSnapIndicator, hideSnapIndicator, findNearestSnapPoint, updatePushPullPreview, calculateExtrudeDistance, handleSelectionClick, handleDoubleClick, handleTripleClick, clearSelection, performBoxSelection, updateSelectionBox]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Alt/Option key: Toggle copy mode for push/pull tool (single press to toggle)
      if (e.key === 'Alt' && activeTool === 'pushpull') {
        e.preventDefault();
        const newCopyMode = !pushPullStateRef.current.copyMode;
        pushPullStateRef.current.copyMode = newCopyMode;
        setPushpullCopyMode(newCopyMode);
        console.log('[PushPull] Copy mode toggled:', newCopyMode);
        return;
      }

      const key = e.key.toLowerCase();
      const drawState = drawingStateRef.current;
      const isDrawingTool = ['line', 'rectangle', 'circle', 'polygon'].includes(activeTool);

      // SketchUp-style dimension input: type numbers while drawing
      if (isDrawingTool && drawState.isDrawing && drawState.startPoint) {
        // Numbers, comma, period, minus for dimension input
        if (/^[0-9]$/.test(e.key) || e.key === ',' || e.key === '.' || e.key === '-') {
          e.preventDefault();
          // Update ref immediately for synchronous access
          measurementInputValueRef.current += e.key;
          setMeasurementInput(measurementInputValueRef.current);
          return;
        }
        // Backspace to delete last character from input
        if (e.key === 'Backspace' && measurementInputValueRef.current.length > 0) {
          e.preventDefault();
          // Update ref immediately for synchronous access
          measurementInputValueRef.current = measurementInputValueRef.current.slice(0, -1);
          setMeasurementInput(measurementInputValueRef.current);
          return;
        }
        // Use ref for current value (always up-to-date)
        const inputValue = measurementInputValueRef.current;
        // Enter to apply dimensions and finalize
        if (e.key === 'Enter' && inputValue.length > 0) {
          e.preventDefault();
          const scene = sceneRef.current;
          if (!scene || !drawState.startPoint) return;

          const start = drawState.startPoint;

          if (activeTool === 'line') {
            // Line: single number = length in mm
            const lengthMm = parseFloat(inputValue);
            if (!isNaN(lengthMm) && lengthMm > 0) {
              const lengthUnits = lengthMm * MM_TO_UNIT;
              let endPoint: Vector3;

              // Use current direction if we have a current point
              if (drawState.currentPoint) {
                const dir = drawState.currentPoint.subtract(start);
                const currentLen = dir.length();
                if (currentLen > 0.01) {
                  endPoint = start.add(dir.normalize().scale(lengthUnits));
                } else {
                  // Default to X axis if no direction
                  endPoint = new Vector3(start.x + lengthUnits, start.y, start.z);
                }
              } else {
                // Default to X axis
                endPoint = new Vector3(start.x + lengthUnits, start.y, start.z);
              }

              // Finalize the line
              if (drawState.previewMesh) {
                drawState.previewMesh.dispose();
                drawState.previewMesh = null;
              }
              finalizeLine(scene, start, endPoint);

              // Continue drawing from endpoint (SketchUp style)
              lineInferenceRef.current.lastEndpoint = endPoint;
              drawState.startPoint = endPoint;
              drawState.currentPoint = null;
              drawState.isDrawing = true;
            }
          } else if (activeTool === 'rectangle') {
            // Rectangle: "width,height" or "size" for square
            const parts = inputValue.split(',');
            const widthMm = parseFloat(parts[0]);
            const heightMm = parts.length > 1 ? parseFloat(parts[1]) : widthMm;

            if (!isNaN(widthMm) && widthMm > 0) {
              const widthUnits = widthMm * MM_TO_UNIT;
              const heightUnits = heightMm * MM_TO_UNIT;
              const mods = shapeModifiersRef.current;

              let endX: number, endZ: number;
              if (mods.drawFromCenter) {
                endX = start.x + widthUnits / 2;
                endZ = start.z + heightUnits / 2;
              } else {
                endX = start.x + widthUnits;
                endZ = start.z + heightUnits;
              }

              const endPoint = new Vector3(endX, 0, endZ);

              // Finalize the rectangle
              if (drawState.previewMesh) {
                drawState.previewMesh.dispose();
                drawState.previewMesh = null;
              }
              finalizeRectangle(scene, start, endPoint);

              // Reset drawing state
              drawState.isDrawing = false;
              drawState.startPoint = null;
              drawState.currentPoint = null;
              setIsDrawing(false);
            }
          } else if (activeTool === 'circle') {
            // Circle: single number = radius in mm
            const radiusMm = parseFloat(inputValue);
            if (!isNaN(radiusMm) && radiusMm > 0) {
              const radiusUnits = radiusMm * MM_TO_UNIT;
              const endPoint = new Vector3(start.x + radiusUnits, 0, start.z);

              if (drawState.previewMesh) {
                drawState.previewMesh.dispose();
                drawState.previewMesh = null;
              }
              finalizeCircle(scene, start, endPoint);

              drawState.isDrawing = false;
              drawState.startPoint = null;
              drawState.currentPoint = null;
              setIsDrawing(false);
            }
          } else if (activeTool === 'polygon') {
            // Polygon: "radius" or "sides,radius"
            const parts = inputValue.split(',');
            let sides = currentMeasurement.sides || 6;
            let radiusMm: number;

            if (parts.length > 1) {
              sides = parseInt(parts[0]) || 6;
              radiusMm = parseFloat(parts[1]);
            } else {
              radiusMm = parseFloat(parts[0]);
            }

            if (!isNaN(radiusMm) && radiusMm > 0) {
              const radiusUnits = radiusMm * MM_TO_UNIT;
              const endPoint = new Vector3(start.x + radiusUnits, 0, start.z);

              if (drawState.previewMesh) {
                drawState.previewMesh.dispose();
                drawState.previewMesh = null;
              }
              finalizePolygon(scene, start, endPoint, sides);

              drawState.isDrawing = false;
              drawState.startPoint = null;
              drawState.currentPoint = null;
              setIsDrawing(false);
            }
          }

          measurementInputValueRef.current = '';
          setMeasurementInput('');
          return;
        }
      }

      // Push/Pull tool: dimension input while extruding
      if (activeTool === 'pushpull') {
        const ppState = pushPullStateRef.current;
        if (ppState.isExtruding && ppState.baseFace && ppState.baseFaceNormal) {
          // Numbers, period, minus for dimension input
          if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === '-') {
            e.preventDefault();
            // Update ref immediately for synchronous access
            measurementInputValueRef.current += e.key;
            setMeasurementInput(measurementInputValueRef.current);
            return;
          }
          // Backspace to delete last character
          if (e.key === 'Backspace' && measurementInputValueRef.current.length > 0) {
            e.preventDefault();
            // Update ref immediately for synchronous access
            measurementInputValueRef.current = measurementInputValueRef.current.slice(0, -1);
            setMeasurementInput(measurementInputValueRef.current);
            return;
          }
          // Use ref for current value (always up-to-date)
          const ppInputValue = measurementInputValueRef.current;
          // Enter to apply extrusion distance
          if (e.key === 'Enter' && ppInputValue.length > 0) {
            e.preventDefault();
            const scene = sceneRef.current;
            if (!scene) return;

            const distanceMm = parseFloat(ppInputValue);
            if (!isNaN(distanceMm)) {
              const distanceUnits = distanceMm * MM_TO_UNIT;  // Convert mm to units

              // Cleanup preview mesh
              if (ppState.previewMesh) {
                ppState.previewMesh.dispose();
                ppState.previewMesh = null;
              }

              // Apply the extrusion (with copyMode from Option key)
              applyPushPull(ppState.baseFace, distanceUnits, ppState.baseFaceNormal, ppState.copyMode);

              // Store last distance for double-click repeat
              ppState.lastExtrudeDistance = distanceUnits;

              // Reset push/pull state
              ppState.isExtruding = false;
              ppState.baseFace = null;
              ppState.baseFaceNormal = null;
              ppState.baseFaceCenter = null;
              ppState.baseClickPoint = null;
              ppState.axisLocked = false;
              ppState.lockedDistance = 0;
            }
            measurementInputValueRef.current = '';
            setMeasurementInput('');
            return;
          }
        }
      }

      // Offset tool: dimension input while offsetting
      if (activeTool === 'offset') {
        const osState = offsetStateRef.current;
        if (osState.isOffsetting && osState.baseFace) {
          // Numbers, period, minus for dimension input
          if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === '-') {
            e.preventDefault();
            measurementInputValueRef.current += e.key;
            setMeasurementInput(measurementInputValueRef.current);
            return;
          }
          // Backspace to delete last character
          if (e.key === 'Backspace' && measurementInputValueRef.current.length > 0) {
            e.preventDefault();
            measurementInputValueRef.current = measurementInputValueRef.current.slice(0, -1);
            setMeasurementInput(measurementInputValueRef.current);
            return;
          }
          // Enter to apply offset distance
          const osInputValue = measurementInputValueRef.current;
          if (e.key === 'Enter' && osInputValue.length > 0) {
            e.preventDefault();
            const scene = sceneRef.current;
            if (!scene) return;

            const distanceMm = parseFloat(osInputValue);
            if (!isNaN(distanceMm)) {
              const distanceUnits = distanceMm * MM_TO_UNIT;  // Convert mm to units

              // Cleanup preview mesh
              if (osState.previewMesh) {
                osState.previewMesh.dispose();
                osState.previewMesh = null;
              }

              // Apply the offset
              applyOffset(osState.baseFace, distanceUnits);

              // Store last distance for double-click repeat
              osState.lastOffsetDistance = distanceUnits;

              // Reset offset state
              osState.isOffsetting = false;
              osState.baseFace = null;
              osState.baseVertices = [];
              osState.baseCenter = null;
            }
            measurementInputValueRef.current = '';
            setMeasurementInput('');
            return;
          }
        }
      }

      // SketchUp-style Move tool keyboard handling
      if (activeTool === 'move') {
        const moveState = moveToolStateRef.current;

        // ESC to cancel move operation
        if (e.key === 'Escape') {
          if (moveState.isMoving && moveState.targetMesh && moveState.originalPosition) {
            e.preventDefault();
            // Restore original position
            moveState.targetMesh.position = moveState.originalPosition.clone();
            // Cleanup
            if (moveState.previewLine) moveState.previewLine.dispose();
            moveState.isMoving = false;
            moveState.startPoint = null;
            moveState.targetMesh = null;
            moveState.previewLine = null;
            moveState.originalPosition = null;
            moveState.inferredAxis = null;
            measurementInputValueRef.current = '';
            setMeasurementInput('');
          }
          return;
        }

        // Dimension input while moving
        if (moveState.isMoving && moveState.targetMesh && moveState.startPoint && moveState.originalPosition) {
          // Numbers, period, minus, comma for dimension input
          if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === '-' || e.key === ',') {
            e.preventDefault();
            measurementInputValueRef.current += e.key;
            setMeasurementInput(measurementInputValueRef.current);
            return;
          }
          // Backspace to delete last character
          if (e.key === 'Backspace' && measurementInputValueRef.current.length > 0) {
            e.preventDefault();
            measurementInputValueRef.current = measurementInputValueRef.current.slice(0, -1);
            setMeasurementInput(measurementInputValueRef.current);
            return;
          }
          // Enter to apply exact distance
          const moveInputValue = measurementInputValueRef.current;
          if (e.key === 'Enter' && moveInputValue.length > 0) {
            e.preventDefault();

            const distanceMm = parseFloat(moveInputValue.replace(',', '.'));
            if (!isNaN(distanceMm)) {
              const distanceUnits = distanceMm * MM_TO_UNIT;

              // Get current direction from preview
              const currentDelta = moveState.targetMesh.position.subtract(moveState.originalPosition);
              const currentLength = currentDelta.length();

              if (currentLength > 0.001) {
                // Apply exact distance in current direction
                const direction = currentDelta.normalize();
                const exactDelta = direction.scale(distanceUnits);
                moveState.targetMesh.position = moveState.originalPosition.add(exactDelta);
              } else if (moveState.inferredAxis) {
                // Use inferred axis if no movement yet
                let exactDelta: Vector3;
                if (moveState.inferredAxis === 'x') exactDelta = new Vector3(distanceUnits, 0, 0);
                else if (moveState.inferredAxis === 'y') exactDelta = new Vector3(0, distanceUnits, 0);
                else exactDelta = new Vector3(0, 0, distanceUnits);
                moveState.targetMesh.position = moveState.originalPosition.add(exactDelta);
              }

              // Complete the move
              if (moveState.previewLine) moveState.previewLine.dispose();
              moveState.isMoving = false;
              moveState.startPoint = null;
              moveState.targetMesh = null;
              moveState.previewLine = null;
              moveState.originalPosition = null;
              moveState.inferredAxis = null;
            }
            measurementInputValueRef.current = '';
            setMeasurementInput('');
            return;
          }

          // Arrow keys to force axis lock
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            moveState.inferredAxis = 'x';
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            moveState.inferredAxis = 'z';
            return;
          }
        }
      }

      // Push/Pull tool: Shift locks the axis direction
      if (activeTool === 'pushpull' && e.key === 'Shift') {
        const ppState = pushPullStateRef.current;
        if (ppState.isExtruding && !ppState.axisLocked) {
          e.preventDefault();
          ppState.axisLocked = true;
          // Lock at current distance - will be calculated in pointer move
        }
        return;
      }

      // Line tool modifiers
      if (activeTool === 'line') {
        // Shift key: Lock current axis (while held) - SketchUp style
        // When Shift is pressed, lock to the currently detected axis
        if (e.key === 'Shift') {
          e.preventDefault();
          const currentAxisColor = lineInferenceRef.current.axisColor;
          // Only lock if we're on a valid axis (red, green, or blue)
          if (currentAxisColor === 'red' || currentAxisColor === 'green' || currentAxisColor === 'blue') {
            lineInferenceRef.current.axisLock = currentAxisColor;
            lineInferenceRef.current.inferenceLocked = true;
            setLineInferenceUI(prev => ({
              ...prev,
              axisLock: currentAxisColor,
              inferenceLocked: true
            }));
          } else {
            // If not on an axis, just set inference locked flag
            lineInferenceRef.current.inferenceLocked = true;
            setLineInferenceUI(prev => ({ ...prev, inferenceLocked: true }));
          }
          return;
        }
        // Arrow keys: Axis lock (SketchUp style: Right=Red/X, Left=Green/Z, Up/Down=Blue/Y)
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const newValue = lineInferenceRef.current.axisLock === 'red' ? 'none' : 'red';
          lineInferenceRef.current.axisLock = newValue;
          setLineInferenceUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const newValue = lineInferenceRef.current.axisLock === 'green' ? 'none' : 'green';
          lineInferenceRef.current.axisLock = newValue;
          setLineInferenceUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const newValue = lineInferenceRef.current.axisLock === 'blue' ? 'none' : 'blue';
          lineInferenceRef.current.axisLock = newValue;
          setLineInferenceUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
      }

      // Shape modifiers (for rectangle, circle, and polygon tools)
      if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon') {
        // Option/Alt key: Toggle draw from center
        if (e.key === 'Alt') {
          e.preventDefault();
          const newValue = !shapeModifiersRef.current.drawFromCenter;
          shapeModifiersRef.current.drawFromCenter = newValue;
          setShapeModifiersUI(prev => ({ ...prev, drawFromCenter: newValue }));
          return;
        }
        // Shift key: Lock to square/circle (while held)
        if (e.key === 'Shift') {
          shapeModifiersRef.current.lockSquare = true;
          setShapeModifiersUI(prev => ({ ...prev, lockSquare: true }));
          return;
        }
        // Arrow keys: Axis lock
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const newValue = shapeModifiersRef.current.axisLock === 'red' ? 'none' : 'red';
          shapeModifiersRef.current.axisLock = newValue;
          setShapeModifiersUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const newValue = shapeModifiersRef.current.axisLock === 'green' ? 'none' : 'green';
          shapeModifiersRef.current.axisLock = newValue;
          setShapeModifiersUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const newValue = shapeModifiersRef.current.axisLock === 'blue' ? 'none' : 'blue';
          shapeModifiersRef.current.axisLock = newValue;
          setShapeModifiersUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const newValue = shapeModifiersRef.current.axisLock === 'parallel' ? 'none' : 'parallel';
          shapeModifiersRef.current.axisLock = newValue;
          setShapeModifiersUI(prev => ({ ...prev, axisLock: newValue }));
          return;
        }
      }

      switch (key) {
        case ' ':
          e.preventDefault();
          setActiveTool('select');
          break;
        case 'l':
          setActiveTool('line');
          break;
        case 'r':
          setActiveTool('rectangle');
          break;
        case 'c':
          setActiveTool('circle');
          break;
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+A: Select all
            e.preventDefault();
            selectAll();
          } else {
            setActiveTool('arc');
          }
          break;
        case 'p':
          setActiveTool('pushpull');
          break;
        case 'm':
          setActiveTool('move');
          break;
        case 'q':
          setActiveTool('rotate');
          break;
        case 's':
          if (!e.ctrlKey && !e.metaKey) setActiveTool('scale');
          break;
        case 'f':
          setActiveTool('offset');
          break;
        case 't':
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+T: Deselect all
            e.preventDefault();
            clearSelection();
          } else {
            setActiveTool('tape');
          }
          break;
        case 'd':
          setActiveTool('dimension');
          break;
        case 'g':
          setActiveTool('makeComponent');
          break;
        case 'b':
          setActiveTool('paint');
          break;
        case 'e':
          setActiveTool('eraser');
          break;
        case 'o':
          setActiveTool('orbit');
          break;
        case 'h':
          setActiveTool('pan');
          break;
        case 'z':
          if (e.shiftKey) {
            e.preventDefault();
            zoomExtents();
          } else if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('zoom');
          }
          break;
        case 'k':
          setActiveTool('section');
          break;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          if (selectedMesh) {
            selectedMesh.dispose();
            deselectMesh();
          }
          break;
        case 'escape':
          const state = drawingStateRef.current;
          if (state.previewMesh) {
            state.previewMesh.dispose();
            state.previewMesh = null;
          }
          state.isDrawing = false;
          state.startPoint = null;
          state.currentPoint = null;
          // Reset shape modifiers (rectangle/circle/polygon)
          const resetMods = {
            drawFromCenter: false,
            lockSquare: false,
            axisLock: 'none' as const,
          };
          shapeModifiersRef.current = resetMods;
          setShapeModifiersUI(resetMods);
          // Reset line inference (line tool)
          const resetLineInf: LineInference = {
            axisColor: 'black',
            axisLock: 'none',
            inferenceLocked: false,
            inferenceType: 'none',
            continuousMode: true,
            lastEndpoint: null,
            inferredAxis: null,
          };
          lineInferenceRef.current = resetLineInf;
          setLineInferenceUI(resetLineInf);
          setLineMeasurement(0);
          measurementInputValueRef.current = '';
          setMeasurementInput('');  // Clear dimension input
          deselectMesh();
          clearSelection();  // Clear multi-selection
          setActiveTool('select');
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Alt key for push/pull copy mode is now toggle-based (handled in keyDown)
      // No action needed on keyUp for Alt

      // Release Shift key: Unlock push/pull axis
      if (e.key === 'Shift' && activeTool === 'pushpull') {
        pushPullStateRef.current.axisLocked = false;
        pushPullStateRef.current.lockedDistance = 0;
      }
      // Release Shift key: Unlock shape constraint (rectangle/circle/polygon)
      if (e.key === 'Shift' && (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon')) {
        shapeModifiersRef.current.lockSquare = false;
        setShapeModifiersUI(prev => ({ ...prev, lockSquare: false }));
      }
      // Release Shift key: Unlock axis and inference lock (line tool)
      if (e.key === 'Shift' && activeTool === 'line') {
        lineInferenceRef.current.axisLock = 'none';
        lineInferenceRef.current.inferenceLocked = false;
        setLineInferenceUI(prev => ({ ...prev, axisLock: 'none', inferenceLocked: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedMesh, zoomExtents, activeTool, selectAll, clearSelection, finalizeLine, finalizeRectangle, finalizeCircle, finalizePolygon, currentMeasurement.sides, applyPushPull]);

  const selectMesh = (mesh: Mesh) => {
    // Remove selection from previous mesh using ref for fresh value
    const prevMesh = selectedMeshRef.current;
    if (prevMesh) {
      prevMesh.disableEdgesRendering();
      prevMesh.renderOverlay = false;
      // Restore edge material color if it was an edge (Tube mesh)
      if (prevMesh.metadata?.type === 'edge' && prevMesh.material) {
        const mat = prevMesh.material as StandardMaterial;
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
      }
    }

    setSelectedMesh(mesh);
    selectedMeshRef.current = mesh;

    // Show selection with blue highlight
    if (mesh.metadata?.type === 'edge') {
      // For edge (Tube mesh), change material color to blue
      if (mesh.material) {
        const mat = mesh.material as StandardMaterial;
        mat.diffuseColor = new Color3(0.2, 0.4, 1.0);
        mat.emissiveColor = new Color3(0.2, 0.4, 1.0);
      }
    } else {
      // For faces/solids, show overlay highlight only
      mesh.renderOverlay = true;
      mesh.overlayColor = new Color3(0.39, 0.4, 0.95); // Indigo
      mesh.overlayAlpha = 0.3;
    }

    if (gizmoManagerRef.current) {
      // For edges, attach gizmo to parent face to move the whole shape
      if (mesh.metadata?.type === 'edge' && mesh.parent) {
        gizmoManagerRef.current.attachToMesh(mesh.parent as Mesh);
      } else {
        gizmoManagerRef.current.attachToMesh(mesh);
      }
    }

    updateMeshProperties(mesh);

    // Show face dimensions in measurement box (mm)
    if (mesh.metadata?.type === 'face') {
      mesh.refreshBoundingInfo();
      const boundingInfo = mesh.getBoundingInfo();
      const size = boundingInfo.boundingBox.extendSizeWorld;
      const widthMm = Math.round(size.x * 2 * UNIT_TO_MM);
      const heightMm = Math.round(size.z * 2 * UNIT_TO_MM);
      setCurrentMeasurement({ width: widthMm, height: heightMm });
    }
  };

  const deselectMesh = () => {
    const mesh = selectedMeshRef.current;
    if (mesh) {
      mesh.disableEdgesRendering();
      mesh.renderOverlay = false;
      // Restore edge material color if it was an edge (Tube mesh)
      if (mesh.metadata?.type === 'edge' && mesh.material) {
        const mat = mesh.material as StandardMaterial;
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
      }
      // Restore face emissive and child edges if it was a face
      if (mesh.metadata?.type === 'face' && mesh.material) {
        const mat = mesh.material as StandardMaterial;
        mat.emissiveColor = new Color3(0, 0, 0);
        mesh.getChildMeshes().forEach((child: any) => {
          if (child.metadata?.type === 'edge' && child.material) {
            const edgeMat = child.material as StandardMaterial;
            edgeMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            edgeMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
          }
        });
      }
      // Restore child edge colors if it was a solid
      if (mesh.metadata?.type === 'solid') {
        mesh.getChildMeshes().forEach((child: any) => {
          if (child.metadata?.type === 'edge' && child.material) {
            const mat = child.material as StandardMaterial;
            mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
          }
        });
      }
    }
    setSelectedMesh(null);
    selectedMeshRef.current = null;
    setMeshProperties(null);
    if (gizmoManagerRef.current) {
      gizmoManagerRef.current.attachToMesh(null);
    }
  };

  const updateMeshProperties = (mesh: Mesh) => {
    setMeshProperties({
      name: mesh.name,
      position: {
        x: Math.round(mesh.position.x * 100) / 100,
        y: Math.round(mesh.position.y * 100) / 100,
        z: Math.round(mesh.position.z * 100) / 100,
      },
      rotation: {
        x: Math.round((mesh.rotation.x * 180 / Math.PI) * 100) / 100,
        y: Math.round((mesh.rotation.y * 180 / Math.PI) * 100) / 100,
        z: Math.round((mesh.rotation.z * 180 / Math.PI) * 100) / 100,
      },
      scale: {
        x: Math.round(mesh.scaling.x * 100) / 100,
        y: Math.round(mesh.scaling.y * 100) / 100,
        z: Math.round(mesh.scaling.z * 100) / 100,
      },
    });
  };

  const addPrimitive = (type: string) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    let mesh: Mesh | null = null;
    const material = new StandardMaterial('mat', scene);
    material.diffuseColor = Color3.FromHexString(selectedColor);
    material.specularColor = new Color3(0.2, 0.2, 0.2);

    switch (type) {
      case 'cube':
        mesh = MeshBuilder.CreateBox('Cube', { size: 1.5 }, scene);
        mesh.position.y = 0.75;
        break;
      case 'sphere':
        mesh = MeshBuilder.CreateSphere('Sphere', { diameter: 1.5 }, scene);
        mesh.position.y = 0.75;
        break;
      case 'cylinder':
        mesh = MeshBuilder.CreateCylinder('Cylinder', { height: 2, diameter: 1 }, scene);
        mesh.position.y = 1;
        break;
      case 'cone':
        mesh = MeshBuilder.CreateCylinder('Cone', { height: 2, diameterTop: 0, diameterBottom: 1.5 }, scene);
        mesh.position.y = 1;
        break;
      case 'torus':
        mesh = MeshBuilder.CreateTorus('Torus', { diameter: 1.5, thickness: 0.4 }, scene);
        mesh.position.y = 0.75;
        break;
      case 'plane':
        mesh = MeshBuilder.CreateGround('Plane', { width: 2, height: 2 }, scene);
        mesh.position.y = 0.01;
        break;
    }

    if (mesh) {
      mesh.material = material;
      selectMesh(mesh);
      setActiveTool('move');
    }
  };

  // Material colors
  const colorPalette = [
    '#FFFFFF', '#F5F5F5', '#E0E0E0', '#BDBDBD', '#9E9E9E', '#757575',
    '#EF5350', '#EC407A', '#AB47BC', '#7E57C2', '#5C6BC0', '#42A5F5',
    '#29B6F6', '#26C6DA', '#26A69A', '#66BB6A', '#9CCC65', '#D4E157',
    '#FFEE58', '#FFCA28', '#FFA726', '#FF7043', '#8D6E63', '#78909C'
  ];

  // Tool definitions with SVG icons
  const tools = [
    { id: 'select', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="currentColor" /></svg>, title: 'Select (Space)' },
    { id: 'makeComponent', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>, title: 'Make Component (G)' },
    { type: 'divider' },
    { id: 'line', icon: <LuPencilLine size={18} />, title: 'Line (L)' },
    { id: 'eraser', icon: <BsEraser size={18} />, title: 'Eraser (E)' },
    { id: 'freehand', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M4 17C8 15 10 8 14 10C18 12 16 17 20 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>, title: 'Freehand' },
    { id: 'rectangle', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" /></svg>, title: 'Rectangle (R)' },
    { id: 'circle', icon: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" /></svg>, title: 'Circle (C)' },
    { id: 'polygon', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M12 4L20 9V15L12 20L4 15V9L12 4Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" /></svg>, title: 'Polygon' },
    { id: 'arc', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M4 18C4 10 10 4 18 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>, title: 'Arc (A)' },
    { type: 'divider' },
    { id: 'paint', icon: <BsPaintBucket size={18} />, title: 'Paint (B)' },
    { id: 'move', icon: <BiMove size={18} />, title: 'Move (M)' },
    { id: 'pushpull', icon: <div style={{ position: 'relative' }}><PushPullIcon size={18} />{pushpullCopyMode && <span style={{ position: 'absolute', top: -6, left: -6, fontSize: 14, fontWeight: 'bold', color: '#fff', textShadow: '0 0 3px #000, 0 0 3px #000', lineHeight: 1 }}>+</span>}</div>, title: 'Push/Pull (P)' },
    { id: 'rotate', icon: <GrRotateRight size={18} />, title: 'Rotate (Q)' },
    { id: 'scale', icon: <LuScaling size={18} />, title: 'Scale (S)' },
    { id: 'offset', icon: <LuSquareSquare size={18} />, title: 'Offset (F)' },
    { type: 'divider' },
    { id: 'tape', icon: <FaTape size={18} />, title: 'Tape Measure (T)' },
    { id: 'dimension', icon: <svg viewBox="0 0 24 24" fill="none"><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5" /><line x1="4" y1="15" x2="4" y2="21" stroke="currentColor" strokeWidth="1.5" /><line x1="20" y1="15" x2="20" y2="21" stroke="currentColor" strokeWidth="1.5" /><text x="12" y="14" fontSize="8" textAnchor="middle" fill="currentColor">2.5m</text></svg>, title: 'Dimension' },
    { id: 'protractor', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M2 20h20M2 20A10 10 0 0 1 12 10a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="1.5" /><line x1="12" y1="20" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" /><line x1="12" y1="20" x2="5" y2="12" stroke="currentColor" strokeWidth="1" /><line x1="12" y1="20" x2="19" y2="12" stroke="currentColor" strokeWidth="1" /></svg>, title: 'Protractor' },
    { type: 'divider' },
    { id: 'orbit', icon: <LuRotate3D size={18} />, title: 'Orbit (O)' },
    { id: 'pan', icon: <IoHandRightOutline size={18} />, title: 'Pan (H)' },
    { id: 'zoom', icon: <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" /><line x1="14" y1="14" x2="20" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><line x1="10" y1="7" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" /><line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" /></svg>, title: 'Zoom (Z)' },
    { id: 'zoomExtents', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" /><path d="M4 8V4H8M16 4H20V8M20 16V20H16M8 20H4V16" stroke="currentColor" strokeWidth="1.5" /></svg>, title: 'Zoom Extents (Shift+Z)' },
    { type: 'divider' },
    { id: 'section', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="10.5" cy="12" r="7.5" strokeWidth="1.5" /><line x1="1.5" y1="12" x2="18" y2="12" strokeWidth="2" /><path d="M18 8 V16 L23.5 12 Z" fill="currentColor" stroke="none" /><text x="10.5" y="9" fontSize="7" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Times New Roman, serif" fontWeight="bold">C</text><text x="10.5" y="17.5" fontSize="5.5" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="Times New Roman, serif" fontWeight="bold">A-5</text></svg>, title: 'Section Plane' },
    { id: 'text', icon: <svg viewBox="0 0 24 24" fill="none"><text x="12" y="17" fontSize="14" textAnchor="middle" fill="currentColor" fontWeight="bold">T</text></svg>, title: 'Text' },
  ];

  return (
    <div className={`${styles.container} ${themeMode === 'light' ? styles.light : ''}`} style={{ '--theme-color': themeColor } as React.CSSProperties}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logoWrapper}>
            <img src="/images/archiple_logo.png" alt="Archiple Studio" className={styles.headerLogo} />
          </div>
        </div>

        <div className={styles.menuBar}>
          <div className={styles.menuDropdown}>
            <button
              className={`${styles.menuBtn} ${activeMenu === 'file' ? styles.menuBtnActive : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
            >
              File
            </button>
            {activeMenu === 'file' && (
              <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Open Recent
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>
                  Close
                  <span className={styles.shortcut}>⌘W</span>
                </button>
                <button className={styles.dropdownItem}>
                  Close All
                  <span className={styles.shortcut}>⌥⌘W</span>
                </button>
                <button className={styles.dropdownItem}>
                  Save
                  <span className={styles.shortcut}>⌘S</span>
                </button>
                <button className={styles.dropdownItem}>
                  Save As...
                  <span className={styles.shortcut}>⇧⌘S</span>
                </button>
                <button className={styles.dropdownItem}>Save a Copy As...</button>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>Import...</button>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Export
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>
                  Page Setup...
                  <span className={styles.shortcut}>⇧⌘P</span>
                </button>
                <button className={styles.dropdownItem}>Document Setup...</button>
                <button className={styles.dropdownItem}>
                  Print...
                  <span className={styles.shortcut}>⌘P</span>
                </button>
              </div>
            )}
          </div>
          <div className={styles.menuDropdown}>
            <button
              className={`${styles.menuBtn} ${activeMenu === 'edit' ? styles.menuBtnActive : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
            >
              Edit
            </button>
            {activeMenu === 'edit' && (
              <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dropdownItem}>
                  Undo
                  <span className={styles.shortcut}>⌘Z</span>
                </button>
                <button className={styles.dropdownItem} disabled>
                  Redo
                  <span className={styles.shortcut}>⇧⌘Z</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem} disabled>
                  Cut
                  <span className={styles.shortcut}>⌘X</span>
                </button>
                <button className={styles.dropdownItem} disabled>
                  Copy
                  <span className={styles.shortcut}>⌘C</span>
                </button>
                <button className={styles.dropdownItem}>
                  Paste
                  <span className={styles.shortcut}>⌘V</span>
                </button>
                <button className={styles.dropdownItem}>Paste in Place</button>
                <button className={styles.dropdownItem} disabled>Delete</button>
                <button className={styles.dropdownItem}>Delete Guides</button>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>
                  Select All
                  <span className={styles.shortcut}>⌘A</span>
                </button>
                <button className={styles.dropdownItem} disabled>
                  Deselect All
                  <span className={styles.shortcut}>⇧⌘A</span>
                </button>
                <button className={styles.dropdownItem}>
                  Invert Selection
                  <span className={styles.shortcut}>⇧⌘I</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem} disabled>
                  Hide
                  <span className={styles.shortcut}>⌘E</span>
                </button>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Unhide
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem} disabled>Lock</button>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Unlock
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>
                  Make Component...
                  <span className={styles.shortcut}>⇧⌘G</span>
                </button>
                <button className={styles.dropdownItem}>
                  Make Group
                  <span className={styles.shortcut}>⌘G</span>
                </button>
                <button className={styles.dropdownItem} disabled>
                  Close Group/Component
                  <span className={styles.shortcut}>^⇧⌘G</span>
                </button>
                <div className={styles.dropdownDivider} />
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Intersect Faces
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className={styles.menuDropdown}>
            <button
              className={`${styles.menuBtn} ${activeMenu === 'view' ? styles.menuBtnActive : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div className={styles.dropdownMenu} onClick={(e) => e.stopPropagation()}>
                <button className={styles.dropdownItem}>
                  Show Tab Bar
                </button>
                <button className={styles.dropdownItem}>
                  Show All Tabs
                  <span className={styles.shortcut}>⇧⌘\</span>
                </button>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Tool Palette
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <button className={styles.dropdownItem} disabled>Scene Tabs</button>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>Hidden Geometry</button>
                <button className={styles.dropdownItem}>Hidden Objects</button>
                <button className={styles.dropdownItem}>Section Planes</button>
                <button className={`${styles.dropdownItem} ${styles.dropdownItemChecked}`}>
                  Section Cuts
                </button>
                <button className={`${styles.dropdownItem} ${styles.dropdownItemChecked}`}>
                  Section Fill
                </button>
                <button className={`${styles.dropdownItem} ${styles.dropdownItemChecked}`}>
                  Axes
                </button>
                <button className={`${styles.dropdownItem} ${styles.dropdownItemChecked}`}>
                  Guides
                </button>
                <div className={styles.dropdownDivider} />
                <button
                  className={`${styles.dropdownItem} ${shadowEnabled ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setShadowEnabled(!shadowEnabled)}
                >
                  Shadows
                </button>
                <button className={styles.dropdownItem}>Fog</button>
                <div className={styles.dropdownDivider} />
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Edge Style
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Face Style
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Component Edit
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Animation
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>Hide Toolbar</button>
                <button className={styles.dropdownItem}>Customize Toolbar...</button>
                <button className={styles.dropdownItem}>
                  Exit Full Screen
                  <span className={styles.shortcut}>⌃F</span>
                </button>
              </div>
            )}
          </div>
          <div className={styles.menuDropdown}>
            <button
              className={`${styles.menuBtn} ${activeMenu === 'camera' ? styles.menuBtnActive : ''}`}
              onClick={() => setActiveMenu(activeMenu === 'camera' ? null : 'camera')}
            >
              Camera
            </button>
            {activeMenu === 'camera' && (
              <div className={styles.dropdownMenu} onClick={() => setActiveMenu(null)}>
                <button className={styles.dropdownItem}>Previous</button>
                <button className={styles.dropdownItem}>Next</button>
                <div className={styles.dropdownSubmenu}>
                  <button className={styles.dropdownItem}>
                    Standard Views
                    <span className={styles.submenuArrow}>›</span>
                  </button>
                </div>
                <div className={styles.dropdownDivider} />
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'orthographic' ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setCameraMode('orthographic')}
                >
                  Orthographic
                </button>
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'perspective' ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setCameraMode('perspective')}
                >
                  Perspective
                </button>
                <button
                  className={`${styles.dropdownItem} ${cameraMode === 'twoPoint' ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setCameraMode('twoPoint')}
                >
                  Two-Point Perspective
                </button>
                <div className={styles.dropdownDivider} />
                <button className={styles.dropdownItem}>Match New Photo...</button>
                <button className={styles.dropdownItem} disabled>Edit Matched Photo</button>
                <div className={styles.dropdownDivider} />
                <button
                  className={`${styles.dropdownItem} ${activeTool === 'orbit' ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setActiveTool('orbit')}
                >
                  Orbit
                  <span className={styles.shortcut}>⌘B</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${activeTool === 'pan' ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setActiveTool('pan')}
                >
                  Pan
                  <span className={styles.shortcut}>⌘R</span>
                </button>
                <button
                  className={`${styles.dropdownItem} ${activeTool === 'zoom' ? styles.dropdownItemChecked : ''}`}
                  onClick={() => setActiveTool('zoom')}
                >
                  Zoom
                  <span className={styles.shortcut}>⌘\</span>
                </button>
                <button className={styles.dropdownItem}>Field of View</button>
                <button
                  className={styles.dropdownItem}
                  onClick={() => setActiveTool('zoomWindow')}
                >
                  Zoom Window
                  <span className={styles.shortcut}>⌘]</span>
                </button>
                <button
                  className={styles.dropdownItem}
                  onClick={() => zoomExtents()}
                >
                  Zoom Extents
                  <span className={styles.shortcut}>⌘[</span>
                </button>
                <div className={styles.dropdownDivider} />
                <button
                  className={styles.dropdownItem}
                  onClick={() => setActiveTool('positionCamera')}
                >
                  Position Camera
                </button>
                <button
                  className={styles.dropdownItem}
                  onClick={() => setActiveTool('walk')}
                >
                  Walk
                  <span className={styles.shortcut}>⌘/</span>
                </button>
                <button
                  className={styles.dropdownItem}
                  onClick={() => setActiveTool('lookAround')}
                >
                  Look Around
                  <span className={styles.shortcut}>⌘.</span>
                </button>
              </div>
            )}
          </div>
          <button className={styles.menuBtn}>Draw</button>
          <button className={styles.menuBtn}>Tools</button>
          <button className={styles.menuBtn}>Window</button>
        </div>

        <div className={styles.headerRight}>
          <button className={styles.themeToggle} onClick={toggleTheme} title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {themeMode === 'dark' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>

          {/* Shadow Controls */}
          <ShadowControls
            enabled={shadowEnabled}
            onToggle={setShadowEnabled}
            time={sunTime}
            onTimeChange={setSunTime}
            azimuth={sunAzimuth}
            onAzimuthChange={setSunAzimuth}
          />
          <button className={`${styles.headerBtn} ${styles.headerBtnGhost}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Undo
          </button>
          <button className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Export
          </button>
          <div className={styles.headerDivider} />
          <button className={styles.exitBtn} onClick={() => navigate('/editor')} title="Exit to Editor">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Viewport */}
        <div className={styles.viewport}>
          <canvas
            ref={canvasRef}
            className={`${styles.canvas} ${activeTool === 'paint' ? styles.paintCursor : ''}`}
            data-tool={activeTool}
            data-copy-mode={pushpullCopyMode ? 'true' : undefined}
          />

          {/* Floating Left Toolbar */}
          <div className={styles.leftToolbar}>
            {tools.map((tool, idx) => {
              if (tool.type === 'divider') {
                return <div key={`divider-${idx}`} className={styles.toolDivider} />;
              }
              return (
                <button
                  key={tool.id}
                  className={`${styles.toolBtn} ${activeTool === tool.id ? styles.active : ''}`}
                  onClick={() => setActiveTool(tool.id as ToolType)}
                  title={tool.title}
                  data-tooltip={tool.title}
                >
                  {tool.icon}
                </button>
              );
            })}
          </div>

          {/* Floating Top Toolbar */}
          <div className={styles.topToolbar}>
            <button className={`${styles.topToolBtn} ${activeTool === 'select' ? styles.active : ''}`} onClick={() => setActiveTool('select')} title="Select">
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="currentColor" /></svg>
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'move' ? styles.active : ''}`} onClick={() => setActiveTool('move')} title="Move">
              <BiMove size={16} />
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'rotate' ? styles.active : ''}`} onClick={() => setActiveTool('rotate')} title="Rotate">
              <GrRotateRight size={16} />
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'scale' ? styles.active : ''}`} onClick={() => setActiveTool('scale')} title="Scale">
              <LuScaling size={16} />
            </button>
            <div className={styles.topToolDivider} />
            <button className={`${styles.topToolBtn} ${activeTool === 'line' ? styles.active : ''}`} onClick={() => setActiveTool('line')} title="Line">
              <LuPencilLine size={16} />
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'rectangle' ? styles.active : ''}`} onClick={() => setActiveTool('rectangle')} title="Rectangle">
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'circle' ? styles.active : ''}`} onClick={() => setActiveTool('circle')} title="Circle">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'pushpull' ? styles.active : ''}`} onClick={() => setActiveTool('pushpull')} title="Push/Pull">
              <div style={{ position: 'relative' }}>
                <PushPullIcon size={16} />
                {pushpullCopyMode && <span style={{ position: 'absolute', top: -6, left: -6, fontSize: 14, fontWeight: 'bold', color: '#fff', textShadow: '0 0 3px #000, 0 0 3px #000', lineHeight: 1 }}>+</span>}
              </div>
            </button>
            <div className={styles.topToolDivider} />
            <button className={`${styles.topToolBtn} ${activeTool === 'orbit' ? styles.active : ''}`} onClick={() => setActiveTool('orbit')} title="Orbit">
              <LuRotate3D size={16} />
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'pan' ? styles.active : ''}`} onClick={() => setActiveTool('pan')} title="Pan">
              <IoHandRightOutline size={16} />
            </button>
            <button className={`${styles.topToolBtn}`} onClick={zoomExtents} title="Zoom Extents">
              <svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1" /><path d="M4 8V4H8M16 4H20V8M20 16V20H16M8 20H4V16" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            <div className={styles.topToolDivider} />
            {/* Camera View Presets - SketchUp style house icons */}
            <button className={styles.topToolBtn} onClick={() => setCameraView('iso')} title="Isometric View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* 3D isometric house */}
                <path d="M12 3L4 8V12L12 17L20 12V8L12 3Z" fill="#9CA3AF" stroke="#6B7280" strokeWidth="1" />
                <path d="M4 12V18L12 23V17L4 12Z" fill="#D1D5DB" stroke="#6B7280" strokeWidth="1" />
                <path d="M20 12V18L12 23V17L20 12Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="1" />
                <path d="M4 8L12 13L20 8" stroke="#6B7280" strokeWidth="1" />
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('front')} title="Front View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Front view house - darker/filled */}
                <path d="M12 3L4 9V11L12 17L20 11V9L12 3Z" fill="#6B7280" stroke="#4B5563" strokeWidth="1" />
                <path d="M4 11V20H20V11L12 17L4 11Z" fill="#9CA3AF" stroke="#4B5563" strokeWidth="1" />
                <rect x="10" y="14" width="4" height="6" fill="#4B5563" />
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('top')} title="Top View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Top view - roof from above */}
                <path d="M12 4L3 12H6V20H18V12H21L12 4Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="1" />
                <path d="M12 4L3 12H21L12 4Z" fill="#D1D5DB" stroke="#6B7280" strokeWidth="1" />
                <line x1="12" y1="4" x2="12" y2="12" stroke="#6B7280" strokeWidth="1" />
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('right')} title="Right View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Right side view */}
                <path d="M5 20V11L12 5L19 11V20H5Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="1" />
                <path d="M5 11L12 5L19 11" fill="#D1D5DB" stroke="#6B7280" strokeWidth="1" />
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('back')} title="Back View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Back view - outline style */}
                <path d="M4 20V11L12 4L20 11V20H4Z" fill="none" stroke="#9CA3AF" strokeWidth="1.5" />
                <path d="M4 11L12 4L20 11" fill="none" stroke="#9CA3AF" strokeWidth="1.5" />
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('left')} title="Left View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Left view - simple outline */}
                <path d="M5 20V11L12 5L19 11V20H5Z" fill="none" stroke="#6B7280" strokeWidth="1.5" />
                <path d="M5 11L12 5L19 11" fill="none" stroke="#6B7280" strokeWidth="1.5" />
              </svg>
            </button>
          </div>

          {/* View Controls */}
          <div className={`${styles.viewControls} ${rightPanelCollapsed ? styles.viewControlsCollapsed : ''}`}>
            <button className={styles.viewBtn} onClick={zoomExtents} title="Fit All">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
            <button className={styles.viewBtn} title="Top View">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="8" width="16" height="12" rx="1" />
              </svg>
            </button>
            <button className={styles.viewBtn} title="Front View">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        {/* Panel Toggle */}
        <button
          className={`${styles.panelToggle} ${rightPanelCollapsed ? styles.collapsed : ''}`}
          onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
            {rightPanelCollapsed ? <path d="M15 19l-7-7 7-7" /> : <path d="M9 5l7 7-7 7" />}
          </svg>
        </button>

        {/* Right Panel */}
        <div className={`${styles.rightPanel} ${rightPanelCollapsed ? styles.collapsed : ''}`}>
          <div className={styles.rightPanelHeader}>
            <span className={styles.rightPanelTitle}>Properties</span>
            <div className={styles.rightPanelTabs}>
              <button className={`${styles.tabBtn} ${activeTab === 'info' ? styles.active : ''}`} onClick={() => setActiveTab('info')}>Info</button>
              <button className={`${styles.tabBtn} ${activeTab === 'materials' ? styles.active : ''}`} onClick={() => setActiveTab('materials')}>Materials</button>
              <button className={`${styles.tabBtn} ${activeTab === 'components' ? styles.active : ''}`} onClick={() => setActiveTab('components')}>Add</button>
            </div>
          </div>

          <div className={styles.rightPanelContent}>
            {activeTab === 'info' && (
              <>
                {/* Entity Info */}
                <div className={styles.panelSection}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionTitle}>Entity Info</span>
                  </div>
                  {meshProperties ? (
                    <div className={styles.entityCard}>
                      <div className={styles.entityType}>Selected Object</div>
                      <div className={styles.entityName}>{meshProperties.name}</div>
                      <div className={styles.entityStats}>
                        <div className={styles.statItem}>
                          <div className={styles.statValue}>{meshProperties.position.x.toFixed(1)}</div>
                          <div className={styles.statLabel}>X</div>
                        </div>
                        <div className={styles.statItem}>
                          <div className={styles.statValue}>{meshProperties.position.y.toFixed(1)}</div>
                          <div className={styles.statLabel}>Y</div>
                        </div>
                        <div className={styles.statItem}>
                          <div className={styles.statValue}>{meshProperties.position.z.toFixed(1)}</div>
                          <div className={styles.statLabel}>Z</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                      </svg>
                      <div className={styles.emptyText}>No object selected.<br />Click to select.</div>
                    </div>
                  )}
                </div>

                {/* Transform */}
                {meshProperties && (
                  <div className={styles.panelSection}>
                    <div className={styles.sectionHeader}>
                      <span className={styles.sectionTitle}>Transform</span>
                    </div>
                    <div className={styles.transformSection}>
                      <div className={styles.transformRow}>
                        <span className={styles.transformLabel}>Position</span>
                        <div className={styles.transformInputs}>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.position.x.toFixed(2)} readOnly />
                            <div className={styles.inputLabel}>X</div>
                          </div>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.position.y.toFixed(2)} readOnly />
                            <div className={styles.inputLabel}>Y</div>
                          </div>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.position.z.toFixed(2)} readOnly />
                            <div className={styles.inputLabel}>Z</div>
                          </div>
                        </div>
                      </div>
                      <div className={styles.transformRow}>
                        <span className={styles.transformLabel}>Rotation</span>
                        <div className={styles.transformInputs}>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.rotation.x.toFixed(1)} readOnly />
                            <div className={styles.inputLabel}>X</div>
                          </div>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.rotation.y.toFixed(1)} readOnly />
                            <div className={styles.inputLabel}>Y</div>
                          </div>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.rotation.z.toFixed(1)} readOnly />
                            <div className={styles.inputLabel}>Z</div>
                          </div>
                        </div>
                      </div>
                      <div className={styles.transformRow}>
                        <span className={styles.transformLabel}>Scale</span>
                        <div className={styles.transformInputs}>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.scale.x.toFixed(2)} readOnly />
                            <div className={styles.inputLabel}>X</div>
                          </div>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.scale.y.toFixed(2)} readOnly />
                            <div className={styles.inputLabel}>Y</div>
                          </div>
                          <div>
                            <input className={styles.transformInput} value={meshProperties.scale.z.toFixed(2)} readOnly />
                            <div className={styles.inputLabel}>Z</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'materials' && (
              <div className={styles.panelSection}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Material Editor</span>
                </div>

                <div className="custom-color-picker">
                  <IroColorPicker
                    color={selectedColor}
                    onChange={(newColor) => {
                      setSelectedColor(newColor);
                      // If paint tool is active and a mesh is selected, apply immediately
                      if (activeTool === 'paint' && selectedMesh && sceneRef.current) {
                        const material = selectedMesh.material as StandardMaterial;
                        if (material && material.diffuseColor) {
                          material.diffuseColor = Color3.FromHexString(newColor);
                        } else {
                          const newMat = new StandardMaterial(`paintMat_${Date.now()}`, sceneRef.current);
                          newMat.diffuseColor = Color3.FromHexString(newColor);
                          newMat.specularColor = new Color3(0.2, 0.2, 0.2);
                          selectedMesh.material = newMat;
                        }
                      }
                    }}
                  />
                </div>

                <div className={styles.sectionHeader} style={{ marginTop: '24px' }}>
                  <span className={styles.sectionTitle}>Quick Palette</span>
                </div>
                <div className={styles.materialsGrid}>
                  {colorPalette.map((color, idx) => (
                    <button
                      key={idx}
                      className={`${styles.colorSwatch} ${selectedColor === color ? styles.active : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setSelectedColor(color);
                        if (activeTool === 'paint' && selectedMesh && sceneRef.current) {
                          const material = selectedMesh.material as StandardMaterial;
                          if (material && material.diffuseColor) {
                            material.diffuseColor = Color3.FromHexString(color);
                          } else {
                            const newMat = new StandardMaterial(`paintMat_${Date.now()}`, sceneRef.current);
                            newMat.diffuseColor = Color3.FromHexString(color);
                            newMat.specularColor = new Color3(0.2, 0.2, 0.2);
                            selectedMesh.material = newMat;
                          }
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}


            {activeTab === 'components' && (
              <div className={styles.panelSection}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Primitives</span>
                </div>
                <div className={styles.primitivesGrid}>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('cube')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                    </svg>
                    <span>Cube</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('sphere')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <ellipse cx="12" cy="12" rx="9" ry="4" />
                    </svg>
                    <span>Sphere</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('cylinder')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <ellipse cx="12" cy="6" rx="8" ry="3" />
                      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
                    </svg>
                    <span>Cylinder</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('cone')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 3L4 19h16L12 3z" />
                      <ellipse cx="12" cy="19" rx="8" ry="2" />
                    </svg>
                    <span>Cone</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('torus')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <ellipse cx="12" cy="12" rx="9" ry="4" />
                      <ellipse cx="12" cy="12" rx="3" ry="1.5" />
                    </svg>
                    <span>Torus</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('plane')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 18L12 22L20 18L12 14L4 18Z" />
                    </svg>
                    <span>Plane</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div >

      {/* Status Bar */}
      < div className={styles.statusBar} >
        <div className={styles.statusLeft}>
          <div className={styles.statusItem}>
            <div className={styles.statusDot} />
            <span>Ready</span>
          </div>
          <div className={styles.statusItem}>
            <span>Tool: {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}</span>
          </div>
          {selectedMesh && (
            <div className={styles.statusItem}>
              <span>Selected: {selectedMesh.name}</span>
            </div>
          )}
          {/* Shape Modifiers Indicator (Rectangle, Circle, Polygon) */}
          {(activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon') && (shapeModifiersUI.drawFromCenter || shapeModifiersUI.lockSquare || shapeModifiersUI.axisLock !== 'none') && (
            <div className={styles.modifierIndicators}>
              {shapeModifiersUI.drawFromCenter && (
                <span className={styles.modifierBadge} style={{ background: '#f97316' }}>⌥ Center</span>
              )}
              {shapeModifiersUI.lockSquare && (
                <span className={styles.modifierBadge} style={{ background: '#22c55e' }}>
                  ⇧ {activeTool === 'rectangle' ? 'Square' : activeTool === 'circle' ? 'Circle' : 'Regular'}
                </span>
              )}
              {shapeModifiersUI.axisLock === 'red' && (
                <span className={styles.modifierBadge} style={{ background: '#ef4444' }}>→ Red Axis</span>
              )}
              {shapeModifiersUI.axisLock === 'green' && (
                <span className={styles.modifierBadge} style={{ background: '#22c55e' }}>← Green Axis</span>
              )}
              {shapeModifiersUI.axisLock === 'blue' && (
                <span className={styles.modifierBadge} style={{ background: '#3b82f6' }}>↑ Blue Axis</span>
              )}
              {shapeModifiersUI.axisLock === 'parallel' && (
                <span className={styles.modifierBadge} style={{ background: '#a855f7' }}>↓ Parallel</span>
              )}
            </div>
          )}
          {/* Line Tool Inference Indicators */}
          {activeTool === 'line' && (
            <div className={styles.modifierIndicators}>
              {/* Axis Color Indicator */}
              {lineInferenceUI.axisColor !== 'black' && (
                <span
                  className={styles.modifierBadge}
                  style={{
                    background: lineInferenceUI.axisColor === 'red' ? '#ef4444' :
                      lineInferenceUI.axisColor === 'green' ? '#22c55e' :
                        lineInferenceUI.axisColor === 'blue' ? '#3b82f6' :
                          lineInferenceUI.axisColor === 'magenta' ? '#d946ef' : '#6b7280'
                  }}
                >
                  {lineInferenceUI.axisColor === 'red' ? 'Red Axis' :
                    lineInferenceUI.axisColor === 'green' ? 'Green Axis' :
                      lineInferenceUI.axisColor === 'blue' ? 'Blue Axis' :
                        lineInferenceUI.axisColor === 'magenta' ? 'Parallel' : ''}
                </span>
              )}
              {/* Axis Lock Indicator */}
              {lineInferenceUI.axisLock !== 'none' && (
                <span
                  className={styles.modifierBadge}
                  style={{
                    background: lineInferenceUI.axisLock === 'red' ? '#ef4444' :
                      lineInferenceUI.axisLock === 'green' ? '#22c55e' : '#3b82f6'
                  }}
                >
                  🔒 {lineInferenceUI.axisLock === 'red' ? '→' : lineInferenceUI.axisLock === 'green' ? '←' : '↑'} Locked
                </span>
              )}
              {/* Inference Lock Indicator */}
              {lineInferenceUI.inferenceLocked && (
                <span className={styles.modifierBadge} style={{ background: '#f97316' }}>⇧ Inference Lock</span>
              )}
              {/* Inference Type Indicator */}
              {lineInferenceUI.inferenceType !== 'none' && (
                <span className={styles.modifierBadge} style={{ background: '#8b5cf6' }}>
                  {lineInferenceUI.inferenceType === 'endpoint' ? '⦿ Endpoint' :
                    lineInferenceUI.inferenceType === 'midpoint' ? '◎ Midpoint' :
                      lineInferenceUI.inferenceType === 'on-axis' ? '— On Axis' :
                        lineInferenceUI.inferenceType === 'perpendicular' ? '⊥ Perpendicular' :
                          lineInferenceUI.inferenceType === 'parallel' ? '∥ Parallel' : ''}
                </span>
              )}
              {/* Continuous Mode Indicator */}
              {lineInferenceUI.continuousMode && lineInferenceUI.lastEndpoint && (
                <span className={styles.modifierBadge} style={{ background: '#06b6d4' }}>⟳ Continuous</span>
              )}
            </div>
          )}
        </div>
        <div className={styles.statusRight}>
          {/* Line tool measurement display */}
          {activeTool === 'line' && isDrawing && lineMeasurement > 0 && (
            <span className={styles.measureDisplay}>
              Length: {Math.round(lineMeasurement)} mm
            </span>
          )}
          {/* Real-time measurement display */}
          {(activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon') && isDrawing && (
            <span className={styles.measureDisplay}>
              {activeTool === 'rectangle'
                ? `${Math.round(currentMeasurement.width)} x ${Math.round(currentMeasurement.height)} mm`
                : activeTool === 'circle'
                  ? `반지름: ${Math.round(currentMeasurement.height)} mm`
                  : `반지름: ${Math.round(currentMeasurement.height)} mm, ${currentMeasurement.sides || 6}각형`
              }
            </span>
          )}
          {/* Selected face measurement display */}
          {selectedMesh?.metadata?.type === 'face' && !isDrawing && currentMeasurement.width > 0 && (
            <span className={styles.measureDisplay}>
              {Math.round(currentMeasurement.width)} x {Math.round(currentMeasurement.height)} mm
            </span>
          )}
          <input
            ref={measureInputRef}
            className={styles.measureInput}
            placeholder={
              activeTool === 'line' ? '길이 (mm)' :
                activeTool === 'rectangle' ? '길이, 너비 (mm)' :
                  activeTool === 'circle' ? '반지름 (mm)' :
                    activeTool === 'polygon' ? '반지름 (mm) 또는 6s' :
                      '측정값'
            }
            value={measurementInput}
            onChange={(e) => setMeasurementInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyMeasurementInput(measurementInput);
                // If drawing, finalize the shape
                const state = drawingStateRef.current;
                const scene = sceneRef.current;
                if (state.isDrawing && state.startPoint && state.currentPoint && scene) {
                  if (activeTool === 'line') {
                    // Line tool with continuous drawing mode
                    finalizeLine(scene, state.startPoint, state.currentPoint);
                    // Cleanup preview
                    if (state.previewMesh) {
                      state.previewMesh.dispose();
                      state.previewMesh = null;
                    }
                    // Continuous mode: start next line from endpoint
                    const lineInf = lineInferenceRef.current;
                    if (lineInf.continuousMode && lineInf.lastEndpoint) {
                      state.startPoint = lineInf.lastEndpoint.clone();
                      state.isDrawing = true;
                    } else {
                      state.isDrawing = false;
                      state.startPoint = null;
                    }
                    state.currentPoint = null;
                    setLineMeasurement(0);
                  } else if (activeTool === 'rectangle') {
                    finalizeRectangle(scene, state.startPoint, state.currentPoint);
                    if (state.previewMesh) {
                      state.previewMesh.dispose();
                      state.previewMesh = null;
                    }
                    state.isDrawing = false;
                    state.startPoint = null;
                    state.currentPoint = null;
                  } else if (activeTool === 'circle') {
                    finalizeCircle(scene, state.startPoint, state.currentPoint);
                    if (state.previewMesh) {
                      state.previewMesh.dispose();
                      state.previewMesh = null;
                    }
                    state.isDrawing = false;
                    state.startPoint = null;
                    state.currentPoint = null;
                  } else if (activeTool === 'polygon') {
                    finalizePolygon(scene, state.startPoint, state.currentPoint, currentMeasurement.sides || 6);
                    if (state.previewMesh) {
                      state.previewMesh.dispose();
                      state.previewMesh = null;
                    }
                    state.isDrawing = false;
                    state.startPoint = null;
                    state.currentPoint = null;
                  }
                  setMeasurementInput('');
                }
                // Push/Pull: Apply entered distance
                if (activeTool === 'pushpull' && scene) {
                  const ppState = pushPullStateRef.current;
                  if (ppState.isExtruding && ppState.baseFace && ppState.baseFaceNormal) {
                    // Parse input as mm, convert to units
                    const inputValue = parseFloat(measurementInput);
                    if (!isNaN(inputValue) && inputValue !== 0) {
                      const distance = inputValue / 1000;  // mm to units
                      // Apply extrusion with exact distance (with copyMode from Option key)
                      applyPushPull(ppState.baseFace, distance, ppState.baseFaceNormal, ppState.copyMode);
                      ppState.lastExtrudeDistance = distance;

                      // Clean up preview
                      if (ppState.previewMesh) {
                        ppState.previewMesh.dispose();
                        ppState.previewMesh = null;
                      }

                      // Reset state
                      ppState.baseFace = null;
                      ppState.baseFaceNormal = null;
                      ppState.baseFaceCenter = null;
                      ppState.baseClickPoint = null;
                      ppState.isExtruding = false;
                      ppState.axisLocked = false;
                      ppState.lockedDistance = 0;

                      setMeasurementInput('');
                    }
                  }
                }
              } else if (e.key === 'Escape') {
                setMeasurementInput('');
                measureInputRef.current?.blur();
              }
              e.stopPropagation();
            }}
          />
        </div>
      </div >
      {
        selectionState.contextMenu && (
          <ModelingContextMenu
            x={selectionState.contextMenu.x}
            y={selectionState.contextMenu.y}
            onClose={() => setSelectionState(prev => ({ ...prev, contextMenu: null }))}
            onAction={handleContextMenuAction}
            selectionCount={selectionState.selectedIds.length}
            hasFaces={selectionState.selectedIds.some(id => sceneRef.current?.getMeshByID(id)?.metadata?.type === 'face')}
            hasEdges={selectionState.selectedIds.some(id => sceneRef.current?.getMeshByID(id)?.metadata?.type === 'edge')}
          />
        )
      }

      {/* Right-click handler for context menu */}
      <div
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        onContextMenu={handleContextMenu}
      />
    </div >
  );
};

export default CustomModelingPage;
