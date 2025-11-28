import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuRotate3D, LuPencilLine, LuArrowUpFromLine, LuSquareSquare, LuScaling } from 'react-icons/lu';
import { BiMove } from 'react-icons/bi';
import { FaTape, FaHandPaper } from 'react-icons/fa';
import { GrRotateRight } from 'react-icons/gr';
import styles from './CustomModelingPage.module.css';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  Color3,
  Color4,
  StandardMaterial,
  Mesh,
  GizmoManager,
  UtilityLayerRenderer,
  HighlightLayer,
  LinesMesh,
} from '@babylonjs/core';

type ToolType = 'select' | 'eraser' | 'line' | 'arc' | 'rectangle' | 'circle' | 'polygon' | 'pushpull' | 'rotate' | 'move' | 'scale' | 'offset' | 'tape' | 'text' | 'paint' | 'orbit' | 'pan' | 'zoom' | 'zoomExtents' | 'makeComponent' | 'freehand' | 'rotatedRect' | 'arc2pt' | 'arc3pt' | 'pie' | 'followMe' | 'outerShell' | 'dimension' | 'protractor' | 'text3d' | 'axes' | 'section' | 'solidTools' | 'zoomWindow' | 'zoomPrevious' | 'lookAround' | 'walk' | 'tag' | 'positionCamera' | 'flip';

// Drawing state interface
interface DrawingState {
  isDrawing: boolean;
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  previewMesh: Mesh | LinesMesh | null;
  points: Vector3[];
}

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
  const snapPointsRef = useRef<Vector3[]>([]);  // Store snap point positions (not meshes)

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

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedMesh, setSelectedMesh] = useState<Mesh | null>(null);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'materials' | 'components'>('info');
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

  // Theme color - read from localStorage (from main Archiple tool)
  const [themeColor, setThemeColor] = useState<string>(() => {
    const saved = localStorage.getItem('themeColor');
    return saved || '#6366F1';
  });

  // Snap threshold for origin and endpoints
  const SNAP_THRESHOLD = 0.5;

  // Get ground point with grid snapping and magnetic snap to origin
  const getGroundPoint = useCallback((scene: Scene, pointerX: number, pointerY: number): Vector3 | null => {
    const pickResult = scene.pick(pointerX, pointerY, (mesh) => mesh.name === 'groundPicker');
    if (pickResult?.hit && pickResult.pickedPoint) {
      const snapped = new Vector3(
        Math.round(pickResult.pickedPoint.x * 2) / 2,
        0,
        Math.round(pickResult.pickedPoint.z * 2) / 2
      );

      // Magnetic snap to origin (0,0,0)
      const distanceToOrigin = snapped.length();
      if (distanceToOrigin < SNAP_THRESHOLD) {
        return Vector3.Zero();
      }

      // Also check for snap to existing snap points (vertices/corners)
      for (const snapPoint of snapPointsRef.current) {
        const dist = Vector3.Distance(snapped, snapPoint);
        if (dist < SNAP_THRESHOLD) {
          return snapPoint.clone();
        }
      }

      return snapped;
    }
    return null;
  }, []);

  // Create/update preview line
  const updatePreviewLine = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    const state = drawingStateRef.current;
    if (state.previewMesh) {
      state.previewMesh.dispose();
    }
    const line = MeshBuilder.CreateLines('previewLine', {
      points: [start, end],
      updatable: false,
    }, scene);
    line.color = new Color3(0.4, 0.6, 1);
    line.isPickable = false;
    state.previewMesh = line;
  }, []);

  // Create/update preview rectangle
  const updatePreviewRectangle = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    const state = drawingStateRef.current;
    if (state.previewMesh) {
      state.previewMesh.dispose();
    }
    const width = Math.abs(end.x - start.x);
    const depth = Math.abs(end.z - start.z);
    if (width > 0.01 && depth > 0.01) {
      const rect = MeshBuilder.CreateGround('previewRect', { width, height: depth }, scene);
      rect.position = new Vector3((start.x + end.x) / 2, 0.01, (start.z + end.z) / 2);
      const mat = new StandardMaterial('previewMat', scene);
      mat.diffuseColor = new Color3(0.4, 0.5, 0.9);
      mat.alpha = 0.4;
      rect.material = mat;
      rect.isPickable = false;

      // Enable edge rendering for preview outline
      rect.enableEdgesRendering();
      rect.edgesWidth = 2.0;
      rect.edgesColor = new Color4(0.4, 0.6, 1, 1);

      state.previewMesh = rect;
    }
  }, []);

  // Finalize line as geometry
  const finalizeLine = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    meshCounterRef.current++;
    const edgeMat = new StandardMaterial(`edgeMat_${meshCounterRef.current}`, scene);
    edgeMat.diffuseColor = new Color3(0.3, 0.3, 0.3);

    const length = Vector3.Distance(start, end);
    const edge = MeshBuilder.CreateBox(`Edge_${meshCounterRef.current}`, {
      width: length,
      height: 0.02,
      depth: 0.02,
    }, scene);

    const midPoint = start.add(end).scale(0.5);
    edge.position = new Vector3(midPoint.x, 0.01, midPoint.z);

    const angle = Math.atan2(end.z - start.z, end.x - start.x);
    edge.rotation.y = -angle;

    edge.material = edgeMat;
    return edge;
  }, []);

  // Finalize rectangle as face geometry
  const finalizeRectangle = useCallback((scene: Scene, start: Vector3, end: Vector3): Mesh | null => {
    const width = Math.abs(end.x - start.x);
    const depth = Math.abs(end.z - start.z);

    if (width < 0.1 || depth < 0.1) return null;

    meshCounterRef.current++;
    const face = MeshBuilder.CreateGround(`Face_${meshCounterRef.current}`, {
      width,
      height: depth,
    }, scene);
    face.position = new Vector3((start.x + end.x) / 2, 0.01, (start.z + end.z) / 2);

    const faceMat = new StandardMaterial(`faceMat_${meshCounterRef.current}`, scene);
    faceMat.diffuseColor = Color3.FromHexString(selectedColor);
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    faceMat.backFaceCulling = false;
    face.material = faceMat;

    // Enable edge rendering for thin outline
    face.enableEdgesRendering();
    face.edgesWidth = 2.0;
    face.edgesColor = new Color4(0.2, 0.2, 0.2, 1);

    face.metadata = {
      type: 'face',
      width,
      depth,
      originalY: 0.01,
    };

    return face;
  }, [selectedColor]);

  // Create green endpoint marker at a position
  const createEndpointMarker = useCallback((scene: Scene, position: Vector3): Mesh => {
    const marker = MeshBuilder.CreateSphere(`endpoint_${Date.now()}_${Math.random()}`, {
      diameter: 0.12,
      segments: 8,
    }, scene);
    marker.position = position.clone();
    marker.position.y = 0.06; // Slightly above ground

    const markerMat = new StandardMaterial(`endpointMat_${Date.now()}`, scene);
    markerMat.diffuseColor = new Color3(0.2, 0.9, 0.2); // Green
    markerMat.emissiveColor = new Color3(0.1, 0.4, 0.1); // Slight glow
    markerMat.specularColor = new Color3(0.5, 0.5, 0.5);
    marker.material = markerMat;
    marker.isPickable = false;

    endpointMarkersRef.current.push(marker);
    return marker;
  }, []);

  // Create endpoint markers for line (start and end points)
  const createLineEndpoints = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    // Check if markers already exist at these positions
    const existingPositions = endpointMarkersRef.current
      .filter(m => m && !m.isDisposed())
      .map(m => m.position);

    const startExists = existingPositions.some(p => Vector3.Distance(p, new Vector3(start.x, 0.06, start.z)) < 0.1);
    const endExists = existingPositions.some(p => Vector3.Distance(p, new Vector3(end.x, 0.06, end.z)) < 0.1);

    if (!startExists) {
      createEndpointMarker(scene, start);
    }
    if (!endExists) {
      createEndpointMarker(scene, end);
    }
  }, [createEndpointMarker]);

  // Create endpoint markers for rectangle (4 corners)
  const createRectangleEndpoints = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    const corners = [
      new Vector3(start.x, 0, start.z),
      new Vector3(end.x, 0, start.z),
      new Vector3(end.x, 0, end.z),
      new Vector3(start.x, 0, end.z),
    ];

    const existingPositions = endpointMarkersRef.current
      .filter(m => m && !m.isDisposed())
      .map(m => new Vector3(m.position.x, 0, m.position.z));

    corners.forEach(corner => {
      const exists = existingPositions.some(p => Vector3.Distance(p, corner) < 0.1);
      if (!exists) {
        createEndpointMarker(scene, corner);
      }
    });
  }, [createEndpointMarker]);

  // Push/Pull functionality
  const applyPushPull = useCallback((mesh: Mesh, height: number): Mesh | null => {
    if (!mesh.metadata || mesh.metadata.type !== 'face') return null;

    const scene = mesh.getScene();
    const { width, depth } = mesh.metadata;

    meshCounterRef.current++;
    const extruded = MeshBuilder.CreateBox(`Solid_${meshCounterRef.current}`, {
      width,
      height: Math.abs(height),
      depth,
    }, scene);

    extruded.position = new Vector3(
      mesh.position.x,
      Math.abs(height) / 2,
      mesh.position.z
    );

    const solidMat = new StandardMaterial(`solidMat_${meshCounterRef.current}`, scene);
    solidMat.diffuseColor = Color3.FromHexString(selectedColor);
    solidMat.specularColor = new Color3(0.2, 0.2, 0.2);
    extruded.material = solidMat;

    mesh.dispose();

    return extruded;
  }, [selectedColor]);

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
      20,
      Vector3.Zero(),
      scene
    );

    camera.attachControl(canvas, true);

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
    camera.lowerRadiusLimit = 1;
    camera.upperRadiusLimit = 500;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI - 0.1;
    camera.inertia = 0.7;
    camera.panningInertia = 0.7;

    cameraRef.current = camera;

    // Lights
    const light1 = new HemisphericLight('light1', new Vector3(1, 1, 0), scene);
    light1.intensity = 0.8;
    const light2 = new HemisphericLight('light2', new Vector3(-1, 1, 0), scene);
    light2.intensity = 0.4;

    // Ground picker
    const groundPicker = MeshBuilder.CreateGround('groundPicker', { width: 1000, height: 1000 }, scene);
    groundPicker.position.y = 0;
    groundPicker.visibility = 0;
    groundPicker.isPickable = true;
    groundPickerRef.current = groundPicker;

    // Axis lines
    const axisLength = 500;

    const xAxisPos = MeshBuilder.CreateLines('xAxisPos', {
      points: [Vector3.Zero(), new Vector3(axisLength, 0, 0)],
    }, scene);
    xAxisPos.color = new Color3(0.9, 0.2, 0.2);
    xAxisPos.isPickable = false;

    const xAxisNeg = MeshBuilder.CreateDashedLines('xAxisNeg', {
      points: [Vector3.Zero(), new Vector3(-axisLength, 0, 0)],
      dashSize: 0.1,
      gapSize: 0.1,
      dashNb: 5000,
    }, scene);
    xAxisNeg.color = new Color3(0.5, 0.2, 0.2);
    xAxisNeg.isPickable = false;

    const yAxisPos = MeshBuilder.CreateLines('yAxisPos', {
      points: [Vector3.Zero(), new Vector3(0, 0, axisLength)],
    }, scene);
    yAxisPos.color = new Color3(0.2, 0.8, 0.2);
    yAxisPos.isPickable = false;

    const yAxisNeg = MeshBuilder.CreateDashedLines('yAxisNeg', {
      points: [Vector3.Zero(), new Vector3(0, 0, -axisLength)],
      dashSize: 0.1,
      gapSize: 0.1,
      dashNb: 5000,
    }, scene);
    yAxisNeg.color = new Color3(0.2, 0.4, 0.2);
    yAxisNeg.isPickable = false;

    const zAxisPos = MeshBuilder.CreateLines('zAxisPos', {
      points: [Vector3.Zero(), new Vector3(0, axisLength, 0)],
    }, scene);
    zAxisPos.color = new Color3(0.3, 0.5, 1);
    zAxisPos.isPickable = false;

    const zAxisNeg = MeshBuilder.CreateDashedLines('zAxisNeg', {
      points: [Vector3.Zero(), new Vector3(0, -axisLength, 0)],
      dashSize: 0.1,
      gapSize: 0.1,
      dashNb: 5000,
    }, scene);
    zAxisNeg.color = new Color3(0.2, 0.3, 0.5);
    zAxisNeg.isPickable = false;

    // Origin marker - green sphere at (0,0,0) for snap indication
    const originMarker = MeshBuilder.CreateSphere('originMarker', {
      diameter: 0.15,
      segments: 16,
    }, scene);
    originMarker.position = new Vector3(0, 0.075, 0);
    const originMat = new StandardMaterial('originMat', scene);
    originMat.diffuseColor = new Color3(0.2, 0.9, 0.2); // Green
    originMat.emissiveColor = new Color3(0.1, 0.5, 0.1); // Slight glow
    originMat.specularColor = new Color3(0.5, 0.5, 0.5);
    originMarker.material = originMat;
    originMarker.isPickable = false;
    originMarkerRef.current = originMarker;

    // Add origin to endpoint markers list for snap detection
    endpointMarkersRef.current.push(originMarker);

    // Highlight layer
    highlightLayerRef.current = new HighlightLayer('highlight', scene);

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
      window.removeEventListener('resize', handleResize);
      engine.dispose();
    };
  }, []);

  // Update gizmo based on active tool
  useEffect(() => {
    if (!gizmoManagerRef.current) return;
    const gm = gizmoManagerRef.current;

    gm.positionGizmoEnabled = activeTool === 'move';
    gm.rotationGizmoEnabled = activeTool === 'rotate';
    gm.scaleGizmoEnabled = activeTool === 'scale';
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
      // Handle pan tool manually (camera panning, not rotation)
      if (activeTool === 'pan' && evt.button === 0) {
        panStateRef.current.isPanning = true;
        panStateRef.current.lastX = evt.clientX;
        panStateRef.current.lastY = evt.clientY;
        return;
      }

      // Skip if using camera navigation tools (camera handles these)
      if (activeTool === 'orbit' || activeTool === 'zoom') {
        return;
      }
      if (evt.button !== 0) return;

      const state = drawingStateRef.current;

      if (activeTool === 'line' || activeTool === 'rectangle') {
        const point = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        if (point) {
          if (!state.isDrawing) {
            // First click: Start drawing
            state.isDrawing = true;
            state.startPoint = point;
            state.currentPoint = point;
          } else {
            // Second click: Finalize the shape
            if (state.startPoint && state.currentPoint) {
              if (activeTool === 'line') {
                if (Vector3.Distance(state.startPoint, state.currentPoint) > 0.1) {
                  finalizeLine(scene, state.startPoint, state.currentPoint);
                  createLineEndpoints(scene, state.startPoint, state.currentPoint);
                }
              } else if (activeTool === 'rectangle') {
                const rectResult = finalizeRectangle(scene, state.startPoint, state.currentPoint);
                if (rectResult) {
                  createRectangleEndpoints(scene, state.startPoint, state.currentPoint);
                }
              }
            }
            // Cleanup preview
            if (state.previewMesh) {
              state.previewMesh.dispose();
              state.previewMesh = null;
            }
            // Reset state
            state.isDrawing = false;
            state.startPoint = null;
            state.currentPoint = null;
          }
        }
      } else if (activeTool === 'pushpull') {
        if (!state.isDrawing) {
          // First click: Select face to extrude
          const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
            mesh.metadata?.type === 'face'
          );
          if (pickResult?.hit && pickResult.pickedMesh) {
            const face = pickResult.pickedMesh as Mesh;
            state.isDrawing = true;
            state.startPoint = new Vector3(0, scene.pointerY, 0);
            (state as DrawingState & { targetMesh?: Mesh }).targetMesh = face;
          }
        } else {
          // Second click: Finalize extrusion
          const targetMesh = (state as DrawingState & { targetMesh?: Mesh }).targetMesh;
          if (targetMesh && state.startPoint) {
            const deltaY = (state.startPoint.y - scene.pointerY) * 0.05;
            if (Math.abs(deltaY) > 0.1) {
              const solid = applyPushPull(targetMesh, deltaY);
              if (solid) {
                selectMesh(solid);
              }
            }
          }
          // Reset state
          state.isDrawing = false;
          state.startPoint = null;
          state.currentPoint = null;
          (state as DrawingState & { targetMesh?: Mesh }).targetMesh = undefined;
        }
      } else if (activeTool === 'select') {
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.isPickable && mesh.name !== 'ground' && mesh.name !== 'groundPicker'
        );
        if (pickResult?.hit && pickResult.pickedMesh) {
          selectMesh(pickResult.pickedMesh as Mesh);
        } else {
          deselectMesh();
        }
      } else if (activeTool === 'eraser') {
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.isPickable && mesh.name !== 'ground' && mesh.name !== 'groundPicker'
        );
        if (pickResult?.hit && pickResult.pickedMesh) {
          pickResult.pickedMesh.dispose();
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

      const state = drawingStateRef.current;
      if (!state.isDrawing || !state.startPoint) return;

      if (activeTool === 'line') {
        const point = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        if (point) {
          state.currentPoint = point;
          updatePreviewLine(scene, state.startPoint, point);
        }
      } else if (activeTool === 'rectangle') {
        const point = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        if (point) {
          state.currentPoint = point;
          updatePreviewRectangle(scene, state.startPoint, point);
        }
      } else if (activeTool === 'pushpull') {
        const deltaY = (state.startPoint.y - scene.pointerY) * 0.05;
        const targetMesh = (state as DrawingState & { targetMesh?: Mesh }).targetMesh;
        if (targetMesh) {
          targetMesh.position.y = 0.01 + deltaY * 0.5;
        }
      }
    };

    const handlePointerUp = (evt: PointerEvent) => {
      // Reset pan state
      if (activeTool === 'pan') {
        panStateRef.current.isPanning = false;
        return;
      }

      if (evt.button !== 0) return;

      // Line, rectangle, and push/pull use click-click (SketchUp style), not drag
      // So don't finalize on mouse up for those tools
      if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'pushpull') {
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
  }, [activeTool, selectedColor, getGroundPoint, updatePreviewLine, updatePreviewRectangle, finalizeLine, finalizeRectangle, applyPushPull, zoomExtents, createLineEndpoints, createRectangleEndpoints]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

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
          if (!e.ctrlKey && !e.metaKey) setActiveTool('arc');
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
          setActiveTool('tape');
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
          deselectMesh();
          setActiveTool('select');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedMesh, zoomExtents]);

  const selectMesh = (mesh: Mesh) => {
    if (highlightLayerRef.current && selectedMesh) {
      highlightLayerRef.current.removeMesh(selectedMesh);
    }

    setSelectedMesh(mesh);
    if (highlightLayerRef.current) {
      highlightLayerRef.current.addMesh(mesh, Color3.FromHexString('#6366f1'));
    }

    if (gizmoManagerRef.current) {
      gizmoManagerRef.current.attachToMesh(mesh);
    }

    updateMeshProperties(mesh);
  };

  const deselectMesh = () => {
    if (highlightLayerRef.current && selectedMesh) {
      highlightLayerRef.current.removeMesh(selectedMesh);
    }
    setSelectedMesh(null);
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
    { id: 'select', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="currentColor"/></svg>, title: 'Select (Space)' },
    { id: 'makeComponent', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>, title: 'Make Component (G)' },
    { id: 'paint', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M19 6L17 4L7 14V17H10L20 7L19 6Z" fill="currentColor" opacity="0.3"/><path d="M19 6L17 4L7 14V17H10L20 7L19 6ZM4 20H20" stroke="currentColor" strokeWidth="1.5"/></svg>, title: 'Paint (B)' },
    { id: 'eraser', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M18 5L9 14L5 17H10L19 8L18 5Z" fill="currentColor" opacity="0.3"/><path d="M18 5L9 14L5 17H10L19 8L18 5Z" stroke="currentColor" strokeWidth="1.5"/></svg>, title: 'Eraser (E)' },
    { type: 'divider' },
    { id: 'line', icon: <LuPencilLine size={18} />, title: 'Line (L)' },
    { id: 'freehand', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M4 17C8 15 10 8 14 10C18 12 16 17 20 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>, title: 'Freehand' },
    { id: 'rectangle', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/></svg>, title: 'Rectangle (R)' },
    { id: 'circle', icon: <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/></svg>, title: 'Circle (C)' },
    { id: 'polygon', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M12 4L20 9V15L12 20L4 15V9L12 4Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/></svg>, title: 'Polygon' },
    { id: 'arc', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M4 18C4 10 10 4 18 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>, title: 'Arc (A)' },
    { type: 'divider' },
    { id: 'move', icon: <BiMove size={18} />, title: 'Move (M)' },
    { id: 'pushpull', icon: <LuArrowUpFromLine size={18} />, title: 'Push/Pull (P)' },
    { id: 'rotate', icon: <GrRotateRight size={18} />, title: 'Rotate (Q)' },
    { id: 'scale', icon: <LuScaling size={18} />, title: 'Scale (S)' },
    { id: 'offset', icon: <LuSquareSquare size={18} />, title: 'Offset (F)' },
    { type: 'divider' },
    { id: 'tape', icon: <FaTape size={18} />, title: 'Tape Measure (T)' },
    { id: 'dimension', icon: <svg viewBox="0 0 24 24" fill="none"><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5"/><line x1="4" y1="15" x2="4" y2="21" stroke="currentColor" strokeWidth="1.5"/><line x1="20" y1="15" x2="20" y2="21" stroke="currentColor" strokeWidth="1.5"/><text x="12" y="14" fontSize="8" textAnchor="middle" fill="currentColor">2.5m</text></svg>, title: 'Dimension' },
    { id: 'protractor', icon: <svg viewBox="0 0 24 24" fill="none"><path d="M2 20h20M2 20A10 10 0 0 1 12 10a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="20" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5"/><line x1="12" y1="20" x2="5" y2="12" stroke="currentColor" strokeWidth="1"/><line x1="12" y1="20" x2="19" y2="12" stroke="currentColor" strokeWidth="1"/></svg>, title: 'Protractor' },
    { type: 'divider' },
    { id: 'orbit', icon: <LuRotate3D size={18} />, title: 'Orbit (O)' },
    { id: 'pan', icon: <FaHandPaper size={18} />, title: 'Pan (H)' },
    { id: 'zoom', icon: <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5"/><line x1="14" y1="14" x2="20" y2="20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><line x1="10" y1="7" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5"/><line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5"/></svg>, title: 'Zoom (Z)' },
    { id: 'zoomExtents', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1"/><path d="M4 8V4H8M16 4H20V8M20 16V20H16M8 20H4V16" stroke="currentColor" strokeWidth="1.5"/></svg>, title: 'Zoom Extents (Shift+Z)' },
    { type: 'divider' },
    { id: 'section', icon: <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="8" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="#f97316" strokeWidth="2"/></svg>, title: 'Section Plane' },
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

        <div className={styles.headerCenter}>
          <button className={styles.menuBtn}>File</button>
          <button className={styles.menuBtn}>Edit</button>
          <button className={styles.menuBtn}>View</button>
          <button className={styles.menuBtn}>Draw</button>
          <button className={styles.menuBtn}>Tools</button>
          <button className={styles.menuBtn}>Window</button>
        </div>

        <div className={styles.headerRight}>
          <button className={styles.themeToggle} onClick={toggleTheme} title={themeMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {themeMode === 'dark' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            )}
          </button>
          <button className={`${styles.headerBtn} ${styles.headerBtnGhost}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Undo
          </button>
          <button className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
            </svg>
            Export
          </button>
          <div className={styles.headerDivider} />
          <button className={styles.exitBtn} onClick={() => navigate('/editor')} title="Exit to Editor">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Viewport */}
        <div className={styles.viewport}>
          <canvas ref={canvasRef} className={styles.canvas} data-tool={activeTool} />

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
              <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="currentColor"/></svg>
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
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'circle' ? styles.active : ''}`} onClick={() => setActiveTool('circle')} title="Circle">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'pushpull' ? styles.active : ''}`} onClick={() => setActiveTool('pushpull')} title="Push/Pull">
              <LuArrowUpFromLine size={16} />
            </button>
            <div className={styles.topToolDivider} />
            <button className={`${styles.topToolBtn} ${activeTool === 'orbit' ? styles.active : ''}`} onClick={() => setActiveTool('orbit')} title="Orbit">
              <LuRotate3D size={16} />
            </button>
            <button className={`${styles.topToolBtn} ${activeTool === 'pan' ? styles.active : ''}`} onClick={() => setActiveTool('pan')} title="Pan">
              <FaHandPaper size={16} />
            </button>
            <button className={`${styles.topToolBtn}`} onClick={zoomExtents} title="Zoom Extents">
              <svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1"/><path d="M4 8V4H8M16 4H20V8M20 16V20H16M8 20H4V16" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <div className={styles.topToolDivider} />
            {/* Camera View Presets - SketchUp style house icons */}
            <button className={styles.topToolBtn} onClick={() => setCameraView('iso')} title="Isometric View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* 3D isometric house */}
                <path d="M12 3L4 8V12L12 17L20 12V8L12 3Z" fill="#9CA3AF" stroke="#6B7280" strokeWidth="1"/>
                <path d="M4 12V18L12 23V17L4 12Z" fill="#D1D5DB" stroke="#6B7280" strokeWidth="1"/>
                <path d="M20 12V18L12 23V17L20 12Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="1"/>
                <path d="M4 8L12 13L20 8" stroke="#6B7280" strokeWidth="1"/>
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('front')} title="Front View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Front view house - darker/filled */}
                <path d="M12 3L4 9V11L12 17L20 11V9L12 3Z" fill="#6B7280" stroke="#4B5563" strokeWidth="1"/>
                <path d="M4 11V20H20V11L12 17L4 11Z" fill="#9CA3AF" stroke="#4B5563" strokeWidth="1"/>
                <rect x="10" y="14" width="4" height="6" fill="#4B5563"/>
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('top')} title="Top View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Top view - roof from above */}
                <path d="M12 4L3 12H6V20H18V12H21L12 4Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="1"/>
                <path d="M12 4L3 12H21L12 4Z" fill="#D1D5DB" stroke="#6B7280" strokeWidth="1"/>
                <line x1="12" y1="4" x2="12" y2="12" stroke="#6B7280" strokeWidth="1"/>
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('right')} title="Right View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Right side view */}
                <path d="M5 20V11L12 5L19 11V20H5Z" fill="#E5E7EB" stroke="#6B7280" strokeWidth="1"/>
                <path d="M5 11L12 5L19 11" fill="#D1D5DB" stroke="#6B7280" strokeWidth="1"/>
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('back')} title="Back View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Back view - outline style */}
                <path d="M4 20V11L12 4L20 11V20H4Z" fill="none" stroke="#9CA3AF" strokeWidth="1.5"/>
                <path d="M4 11L12 4L20 11" fill="none" stroke="#9CA3AF" strokeWidth="1.5"/>
              </svg>
            </button>
            <button className={styles.topToolBtn} onClick={() => setCameraView('left')} title="Left View">
              <svg viewBox="0 0 24 24" fill="none">
                {/* Left view - simple outline */}
                <path d="M5 20V11L12 5L19 11V20H5Z" fill="none" stroke="#6B7280" strokeWidth="1.5"/>
                <path d="M5 11L12 5L19 11" fill="none" stroke="#6B7280" strokeWidth="1.5"/>
              </svg>
            </button>
          </div>

          {/* View Controls */}
          <div className={`${styles.viewControls} ${rightPanelCollapsed ? styles.viewControlsCollapsed : ''}`}>
            <button className={styles.viewBtn} onClick={zoomExtents} title="Fit All">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            </button>
            <button className={styles.viewBtn} title="Top View">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="8" width="16" height="12" rx="1"/>
              </svg>
            </button>
            <button className={styles.viewBtn} title="Front View">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="1"/>
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
            {rightPanelCollapsed ? <path d="M15 19l-7-7 7-7"/> : <path d="M9 5l7 7-7 7"/>}
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
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                      </svg>
                      <div className={styles.emptyText}>No object selected.<br/>Click to select.</div>
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
                  <span className={styles.sectionTitle}>Current Color</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: selectedColor,
                      borderRadius: '8px',
                      border: '2px solid rgba(255,255,255,0.2)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Selected</div>
                    <div style={{ fontSize: '14px', color: '#fff', fontWeight: 500 }}>{selectedColor}</div>
                  </div>
                  {selectedMesh && (
                    <button
                      onClick={() => {
                        if (selectedMesh && sceneRef.current) {
                          const material = selectedMesh.material as StandardMaterial;
                          if (material && material.diffuseColor) {
                            material.diffuseColor = Color3.FromHexString(selectedColor);
                          } else {
                            const newMat = new StandardMaterial(`paintMat_${Date.now()}`, sceneRef.current);
                            newMat.diffuseColor = Color3.FromHexString(selectedColor);
                            newMat.specularColor = new Color3(0.2, 0.2, 0.2);
                            selectedMesh.material = newMat;
                          }
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      Apply
                    </button>
                  )}
                </div>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Color Palette</span>
                </div>
                <div className={styles.materialsGrid}>
                  {colorPalette.map((color, idx) => (
                    <button
                      key={idx}
                      className={`${styles.colorSwatch} ${selectedColor === color ? styles.active : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setSelectedColor(color);
                        // If paint tool is active and a mesh is selected, apply immediately
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
                      title={color}
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
                      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                    </svg>
                    <span>Cube</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('sphere')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9"/>
                      <ellipse cx="12" cy="12" rx="9" ry="4"/>
                    </svg>
                    <span>Sphere</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('cylinder')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <ellipse cx="12" cy="6" rx="8" ry="3"/>
                      <path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/>
                    </svg>
                    <span>Cylinder</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('cone')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 3L4 19h16L12 3z"/>
                      <ellipse cx="12" cy="19" rx="8" ry="2"/>
                    </svg>
                    <span>Cone</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('torus')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <ellipse cx="12" cy="12" rx="9" ry="4"/>
                      <ellipse cx="12" cy="12" rx="3" ry="1.5"/>
                    </svg>
                    <span>Torus</span>
                  </button>
                  <button className={styles.primitiveBtn} onClick={() => addPrimitive('plane')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M4 18L12 22L20 18L12 14L4 18Z"/>
                    </svg>
                    <span>Plane</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className={styles.statusBar}>
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
        </div>
        <div className={styles.statusRight}>
          <input className={styles.measureInput} placeholder="Measurements" />
        </div>
      </div>
    </div>
  );
};

export default CustomModelingPage;
