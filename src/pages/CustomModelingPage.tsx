import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  PointerEventTypes,
  Mesh,
  GizmoManager,
  UtilityLayerRenderer,
  HighlightLayer,
  LinesMesh,
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';

type ToolType = 'select' | 'eraser' | 'line' | 'arc' | 'rectangle' | 'circle' | 'polygon' | 'pushpull' | 'rotate' | 'move' | 'scale' | 'offset' | 'tape' | 'text' | 'paint' | 'orbit' | 'pan' | 'zoom' | 'zoomExtents' | 'makeComponent' | 'freehand' | 'rotatedRect' | 'arc2pt' | 'arc3pt' | 'pie' | 'followMe' | 'outerShell' | 'dimension' | 'protractor' | 'text3d' | 'axes' | 'section' | 'solidTools' | 'zoomWindow' | 'zoomPrevious' | 'lookAround' | 'walk' | 'tag' | 'positionCamera';

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
  const [meshProperties, setMeshProperties] = useState<{
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  } | null>(null);

  // Get ground point with grid snapping
  const getGroundPoint = useCallback((scene: Scene, pointerX: number, pointerY: number): Vector3 | null => {
    const pickResult = scene.pick(pointerX, pointerY, (mesh) => mesh.name === 'groundPicker');
    if (pickResult?.hit && pickResult.pickedPoint) {
      // Snap to 0.5 unit grid
      const snapped = new Vector3(
        Math.round(pickResult.pickedPoint.x * 2) / 2,
        0,
        Math.round(pickResult.pickedPoint.z * 2) / 2
      );
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
    line.color = new Color3(0, 0, 0);
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
      mat.diffuseColor = new Color3(0.8, 0.9, 1);
      mat.alpha = 0.5;
      rect.material = mat;
      rect.isPickable = false;
      state.previewMesh = rect;
    }
  }, []);

  // Finalize line as geometry
  const finalizeLine = useCallback((scene: Scene, start: Vector3, end: Vector3) => {
    meshCounterRef.current++;
    const edgeMat = new StandardMaterial(`edgeMat_${meshCounterRef.current}`, scene);
    edgeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);

    // Create a thin box to represent the line/edge
    const length = Vector3.Distance(start, end);
    const edge = MeshBuilder.CreateBox(`Edge_${meshCounterRef.current}`, {
      width: length,
      height: 0.02,
      depth: 0.02,
    }, scene);

    // Position and rotate to connect start and end
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
    faceMat.diffuseColor = Color3.FromHexString('#E5E7EB');
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    faceMat.backFaceCulling = false;
    face.material = faceMat;

    // Store face metadata for push/pull
    face.metadata = {
      type: 'face',
      width,
      depth,
      originalY: 0.01,
    };

    return face;
  }, []);

  // Push/Pull functionality - extrude face into solid
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
    solidMat.diffuseColor = Color3.FromHexString('#E5E7EB');
    solidMat.specularColor = new Color3(0.2, 0.2, 0.2);
    extruded.material = solidMat;

    // Dispose original face
    mesh.dispose();

    return extruded;
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
    scene.clearColor = new Color4(0.95, 0.95, 0.95, 1);
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
    camera.wheelPrecision = 10;
    camera.panningSensibility = 100;
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 100;
    cameraRef.current = camera;

    // Lights
    const light1 = new HemisphericLight('light1', new Vector3(1, 1, 0), scene);
    light1.intensity = 0.8;
    const light2 = new HemisphericLight('light2', new Vector3(-1, 1, 0), scene);
    light2.intensity = 0.4;

    // Infinite Grid
    const ground = MeshBuilder.CreateGround('ground', { width: 1000, height: 1000 }, scene);
    const gridMaterial = new GridMaterial('gridMaterial', scene);
    gridMaterial.majorUnitFrequency = 5;
    gridMaterial.minorUnitVisibility = 0.45;
    gridMaterial.gridRatio = 1;
    gridMaterial.mainColor = new Color3(0.95, 0.95, 0.95);
    gridMaterial.lineColor = new Color3(0.75, 0.75, 0.75);
    gridMaterial.opacity = 0.99;
    gridMaterial.useMaxLine = true;
    gridMaterial.gridOffset = Vector3.Zero();
    ground.material = gridMaterial;
    ground.isPickable = false;

    // Invisible ground picker for drawing tools
    const groundPicker = MeshBuilder.CreateGround('groundPicker', { width: 1000, height: 1000 }, scene);
    groundPicker.position.y = 0;
    groundPicker.visibility = 0;
    groundPicker.isPickable = true;
    groundPickerRef.current = groundPicker;

    // Axis lines (like SketchUp)
    const axisLength = 500;

    // X axis - Red (positive = solid, negative = dashed)
    const xAxisPos = MeshBuilder.CreateLines('xAxisPos', {
      points: [Vector3.Zero(), new Vector3(axisLength, 0, 0)],
    }, scene);
    xAxisPos.color = new Color3(1, 0, 0);
    xAxisPos.isPickable = false;

    const xAxisNeg = MeshBuilder.CreateDashedLines('xAxisNeg', {
      points: [Vector3.Zero(), new Vector3(-axisLength, 0, 0)],
      dashSize: 0.3,
      gapSize: 0.2,
      dashNb: 100,
    }, scene);
    xAxisNeg.color = new Color3(1, 0.5, 0.5);
    xAxisNeg.isPickable = false;

    // Y axis (Babylon Z) - Green (positive = solid, negative = dashed)
    const yAxisPos = MeshBuilder.CreateLines('yAxisPos', {
      points: [Vector3.Zero(), new Vector3(0, 0, axisLength)],
    }, scene);
    yAxisPos.color = new Color3(0, 0.7, 0);
    yAxisPos.isPickable = false;

    const yAxisNeg = MeshBuilder.CreateDashedLines('yAxisNeg', {
      points: [Vector3.Zero(), new Vector3(0, 0, -axisLength)],
      dashSize: 0.3,
      gapSize: 0.2,
      dashNb: 100,
    }, scene);
    yAxisNeg.color = new Color3(0.5, 0.8, 0.5);
    yAxisNeg.isPickable = false;

    // Z axis (Babylon Y) - Blue (positive = solid, negative = dashed)
    const zAxisPos = MeshBuilder.CreateLines('zAxisPos', {
      points: [Vector3.Zero(), new Vector3(0, axisLength, 0)],
    }, scene);
    zAxisPos.color = new Color3(0, 0, 1);
    zAxisPos.isPickable = false;

    const zAxisNeg = MeshBuilder.CreateDashedLines('zAxisNeg', {
      points: [Vector3.Zero(), new Vector3(0, -axisLength, 0)],
      dashSize: 0.3,
      gapSize: 0.2,
      dashNb: 100,
    }, scene);
    zAxisNeg.color = new Color3(0.5, 0.5, 1);
    zAxisNeg.isPickable = false;

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

    // Pointer events - stored reference for cleanup
    const pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
      // Selection/default behavior handled by separate useEffect
    });

    // Store observer reference for potential cleanup
    (scene as Scene & { _customPointerObserver?: typeof pointerObserver })._customPointerObserver = pointerObserver;

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

  // Handle pointer events for drawing and selection
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    const isDrawingTool = ['line', 'rectangle', 'circle', 'polygon', 'arc'].includes(activeTool);

    // Adjust camera controls based on tool
    const pointersInput = camera.inputs.attached.pointers as { buttons?: number[] };
    if (isDrawingTool) {
      // Only allow middle/right mouse for camera when drawing
      if (pointersInput) pointersInput.buttons = [1, 2];
    } else {
      // Allow all mouse buttons for camera
      if (pointersInput) pointersInput.buttons = [0, 1, 2];
    }

    const handlePointerDown = (evt: PointerEvent) => {
      if (evt.button !== 0) return; // Only left click

      const state = drawingStateRef.current;

      if (activeTool === 'line' || activeTool === 'rectangle') {
        const point = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        if (point) {
          state.isDrawing = true;
          state.startPoint = point;
          state.currentPoint = point;
        }
      } else if (activeTool === 'pushpull') {
        // Push/Pull on selected face
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.metadata?.type === 'face'
        );
        if (pickResult?.hit && pickResult.pickedMesh) {
          const face = pickResult.pickedMesh as Mesh;
          state.isDrawing = true;
          state.startPoint = new Vector3(0, scene.pointerY, 0);
          // Store reference to the face being extruded
          (state as DrawingState & { targetMesh?: Mesh }).targetMesh = face;
        }
      } else if (activeTool === 'select') {
        // Selection
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.isPickable && mesh.name !== 'ground' && mesh.name !== 'groundPicker'
        );
        if (pickResult?.hit && pickResult.pickedMesh) {
          selectMesh(pickResult.pickedMesh as Mesh);
        } else {
          deselectMesh();
        }
      } else if (activeTool === 'eraser') {
        // Delete clicked mesh
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) =>
          mesh.isPickable && mesh.name !== 'ground' && mesh.name !== 'groundPicker'
        );
        if (pickResult?.hit && pickResult.pickedMesh) {
          pickResult.pickedMesh.dispose();
          deselectMesh();
        }
      } else if (activeTool === 'zoomExtents') {
        zoomExtents();
      }
    };

    const handlePointerMove = (evt: PointerEvent) => {
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
        // Preview extrusion height based on mouse Y movement
        const deltaY = (state.startPoint.y - scene.pointerY) * 0.05;
        const targetMesh = (state as DrawingState & { targetMesh?: Mesh }).targetMesh;
        if (targetMesh) {
          // Update height preview (visual feedback)
          targetMesh.position.y = 0.01 + deltaY * 0.5;
        }
      }
    };

    const handlePointerUp = (evt: PointerEvent) => {
      if (evt.button !== 0) return;

      const state = drawingStateRef.current;
      if (!state.isDrawing) return;

      if (activeTool === 'line' && state.startPoint && state.currentPoint) {
        if (Vector3.Distance(state.startPoint, state.currentPoint) > 0.1) {
          const edge = finalizeLine(scene, state.startPoint, state.currentPoint);
          selectMesh(edge);
        }
      } else if (activeTool === 'rectangle' && state.startPoint && state.currentPoint) {
        const face = finalizeRectangle(scene, state.startPoint, state.currentPoint);
        if (face) {
          selectMesh(face);
        }
      } else if (activeTool === 'pushpull') {
        const deltaY = (state.startPoint!.y - scene.pointerY) * 0.05;
        const targetMesh = (state as DrawingState & { targetMesh?: Mesh }).targetMesh;
        if (targetMesh && Math.abs(deltaY) > 0.1) {
          const solid = applyPushPull(targetMesh, deltaY);
          if (solid) {
            selectMesh(solid);
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
      (state as DrawingState & { targetMesh?: Mesh }).targetMesh = undefined;
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
  }, [activeTool, getGroundPoint, updatePreviewLine, updatePreviewRectangle, finalizeLine, finalizeRectangle, applyPushPull, zoomExtents]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
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
          setActiveTool('arc');
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
          if (!e.ctrlKey && !e.metaKey) {
            setActiveTool('scale');
          }
          break;
        case 'f':
          setActiveTool('offset');
          break;
        case 'b':
          setActiveTool('paint');
          break;
        case 't':
          setActiveTool('tape');
          break;
        case 'e':
          setActiveTool('eraser');
          if (selectedMesh) {
            selectedMesh.dispose();
            deselectMesh();
          }
          break;
        case 'o':
          setActiveTool('orbit');
          break;
        case 'h':
          setActiveTool('pan');
          break;
        case 'z':
          if (e.shiftKey) {
            zoomExtents();
          } else {
            setActiveTool('zoom');
          }
          break;
        case 'delete':
        case 'backspace':
          if (selectedMesh) {
            selectedMesh.dispose();
            deselectMesh();
          }
          break;
        case 'escape':
          // Cancel drawing
          const state = drawingStateRef.current;
          if (state.previewMesh) {
            state.previewMesh.dispose();
            state.previewMesh = null;
          }
          state.isDrawing = false;
          state.startPoint = null;
          state.currentPoint = null;
          deselectMesh();
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
      highlightLayerRef.current.addMesh(mesh, Color3.FromHexString('#3B82F6'));
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

  const addModel = (modelId: string) => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    let mesh: Mesh | null = null;
    const material = new StandardMaterial('mat', scene);
    material.diffuseColor = Color3.FromHexString('#E5E7EB');
    material.specularColor = new Color3(0.2, 0.2, 0.2);

    switch (modelId) {
      case 'rectangle':
        mesh = MeshBuilder.CreateBox('Box', { width: 2, height: 0.1, depth: 1.5 }, scene);
        break;
      case 'circle':
        mesh = MeshBuilder.CreateCylinder('Cylinder', { height: 0.1, diameter: 2 }, scene);
        break;
      case 'polygon':
        mesh = MeshBuilder.CreateCylinder('Polygon', { height: 0.1, diameter: 2, tessellation: 6 }, scene);
        break;
      case 'star':
        mesh = MeshBuilder.CreateCylinder('Star', { height: 0.1, diameter: 2, tessellation: 5 }, scene);
        break;
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
      case 'lightStrip':
      case 'continuousLight':
        mesh = MeshBuilder.CreateBox('LightStrip', { width: 3, height: 0.05, depth: 0.1 }, scene);
        material.emissiveColor = Color3.FromHexString('#FEF3C7');
        mesh.position.y = 2.5;
        break;
      case 'doubleStairs':
      case 'singleStairs':
        // Create simple stairs
        const steps: Mesh[] = [];
        for (let i = 0; i < 5; i++) {
          const step = MeshBuilder.CreateBox(`step${i}`, { width: 1.5, height: 0.2, depth: 0.3 }, scene);
          step.position.y = i * 0.2;
          step.position.z = i * 0.3;
          step.material = material;
          steps.push(step);
        }
        mesh = Mesh.MergeMeshes(steps, true, true, undefined, false, true) as Mesh;
        mesh.name = 'Stairs';
        break;
      case 'table':
        const tableTop = MeshBuilder.CreateBox('tableTop', { width: 2, height: 0.1, depth: 1 }, scene);
        tableTop.position.y = 0.8;
        const leg1 = MeshBuilder.CreateBox('leg1', { width: 0.1, height: 0.8, depth: 0.1 }, scene);
        leg1.position.set(-0.9, 0.4, -0.4);
        const leg2 = MeshBuilder.CreateBox('leg2', { width: 0.1, height: 0.8, depth: 0.1 }, scene);
        leg2.position.set(0.9, 0.4, -0.4);
        const leg3 = MeshBuilder.CreateBox('leg3', { width: 0.1, height: 0.8, depth: 0.1 }, scene);
        leg3.position.set(-0.9, 0.4, 0.4);
        const leg4 = MeshBuilder.CreateBox('leg4', { width: 0.1, height: 0.8, depth: 0.1 }, scene);
        leg4.position.set(0.9, 0.4, 0.4);
        mesh = Mesh.MergeMeshes([tableTop, leg1, leg2, leg3, leg4], true, true, undefined, false, true) as Mesh;
        mesh.name = 'Table';
        break;
      case 'chair':
        const seat = MeshBuilder.CreateBox('seat', { width: 0.5, height: 0.05, depth: 0.5 }, scene);
        seat.position.y = 0.45;
        const back = MeshBuilder.CreateBox('back', { width: 0.5, height: 0.5, depth: 0.05 }, scene);
        back.position.set(0, 0.7, -0.225);
        const cLeg1 = MeshBuilder.CreateBox('cleg1', { width: 0.05, height: 0.45, depth: 0.05 }, scene);
        cLeg1.position.set(-0.2, 0.225, -0.2);
        const cLeg2 = MeshBuilder.CreateBox('cleg2', { width: 0.05, height: 0.45, depth: 0.05 }, scene);
        cLeg2.position.set(0.2, 0.225, -0.2);
        const cLeg3 = MeshBuilder.CreateBox('cleg3', { width: 0.05, height: 0.45, depth: 0.05 }, scene);
        cLeg3.position.set(-0.2, 0.225, 0.2);
        const cLeg4 = MeshBuilder.CreateBox('cleg4', { width: 0.05, height: 0.45, depth: 0.05 }, scene);
        cLeg4.position.set(0.2, 0.225, 0.2);
        mesh = Mesh.MergeMeshes([seat, back, cLeg1, cLeg2, cLeg3, cLeg4], true, true, undefined, false, true) as Mesh;
        mesh.name = 'Chair';
        break;
      default:
        mesh = MeshBuilder.CreateBox('Box', { size: 1 }, scene);
        mesh.position.y = 0.5;
    }

    if (mesh) {
      mesh.material = material;
      selectMesh(mesh);
      setActiveTool('move');
    }
  };

  const deleteSelected = () => {
    if (selectedMesh) {
      selectedMesh.dispose();
      deselectMesh();
    }
  };

  // SketchUp material colors
  const colorPalette = ['#FFFFFF', '#E0E0E0', '#BDBDBD', '#9E9E9E', '#757575', '#616161', '#424242', '#212121', '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#795548', '#607D8B'];

  return (
    <div className={styles.container}>
      {/* SketchUp Menu Bar */}
      <div className={styles.menuBar}>
        <button className={styles.menuItem}>File</button>
        <button className={styles.menuItem}>Edit</button>
        <button className={styles.menuItem}>View</button>
        <button className={styles.menuItem}>Camera</button>
        <button className={styles.menuItem}>Draw</button>
        <button className={styles.menuItem}>Tools</button>
        <button className={styles.menuItem}>Window</button>
        <button className={styles.menuItem}>Extensions</button>
        <button className={styles.menuItem}>Help</button>
      </div>

      {/* Two-Row Toolbar */}
      <div className={styles.toolbarContainer}>
        <div className={styles.horizontalToolbar}>
          <button className={styles.hTool} title="New"><svg viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="1" fill="#f8f8f8" stroke="#666" strokeWidth="1.5"/></svg></button>
          <button className={styles.hTool} title="Open"><svg viewBox="0 0 24 24" fill="none"><path d="M3 8V18a2 2 0 002 2h14a2 2 0 002-2V10a2 2 0 00-2-2H12l-2-2H5a2 2 0 00-2 2z" fill="#f0d860" stroke="#a08020" strokeWidth="1"/></svg></button>
          <button className={styles.hTool} title="Save"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="1" fill="#a8c8e8" stroke="#457fd3" strokeWidth="1.5"/></svg></button>
          <div className={styles.hToolDivider} />
          <button className={styles.hTool} title="Undo"><svg viewBox="0 0 24 24" fill="none"><path d="M4 10c0-4 3-7 8-7s8 3 8 7" stroke="#457fd3" strokeWidth="2"/><path d="M4 10L1 7L7 7L4 10Z" fill="#457fd3"/></svg></button>
          <button className={styles.hTool} title="Redo"><svg viewBox="0 0 24 24" fill="none"><path d="M20 10c0-4-3-7-8-7s-8 3-8 7" stroke="#457fd3" strokeWidth="2"/><path d="M20 10L23 7L17 7L20 10Z" fill="#457fd3"/></svg></button>
          <div className={styles.hToolDivider} />
          <button className={styles.hTool} onClick={() => navigate(-1)} title="Back"><svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="#666" strokeWidth="2"/></svg></button>
        </div>
        <div className={styles.horizontalToolbar}>
          <button className={`${styles.hTool} ${activeTool === 'select' ? styles.active : ''}`} onClick={() => setActiveTool('select')} title="Select"><svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="#2d2d2d"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'line' ? styles.active : ''}`} onClick={() => setActiveTool('line')} title="Line"><svg viewBox="0 0 24 24" fill="none"><line x1="4" y1="20" x2="20" y2="4" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="4" cy="20" r="2" fill="#22a352"/><circle cx="20" cy="4" r="2" fill="#e63946"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'rectangle' ? styles.active : ''}`} onClick={() => setActiveTool('rectangle')} title="Rectangle"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'circle' ? styles.active : ''}`} onClick={() => setActiveTool('circle')} title="Circle"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/></svg></button>
          <div className={styles.hToolDivider} />
          <button className={`${styles.hTool} ${activeTool === 'pushpull' ? styles.active : ''}`} onClick={() => setActiveTool('pushpull')} title="Push/Pull"><svg viewBox="0 0 24 24" fill="none"><path d="M4 15L10 12L16 15V19L10 22L4 19V15Z" fill="#c9a227" stroke="#8b6914"/><path d="M4 10L10 7L16 10V14L10 11L4 14V10Z" fill="#e0c040" stroke="#8b6914"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'move' ? styles.active : ''}`} onClick={() => setActiveTool('move')} title="Move"><svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="#e63946" strokeWidth="1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="#22a352" strokeWidth="1.5"/><path d="M12 4L9 8H15L12 4Z" fill="#e63946"/><path d="M12 20L9 16H15L12 20Z" fill="#e63946"/><path d="M4 12L8 9V15L4 12Z" fill="#22a352"/><path d="M20 12L16 9V15L20 12Z" fill="#22a352"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'rotate' ? styles.active : ''}`} onClick={() => setActiveTool('rotate')} title="Rotate"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="7" fill="none" stroke="#2d2d2d" strokeWidth="1" strokeDasharray="3 2"/><circle cx="12" cy="13" r="2" fill="#457fd3"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'scale' ? styles.active : ''}`} onClick={() => setActiveTool('scale')} title="Scale"><svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" fill="#e5e5e5" stroke="#2d2d2d" strokeWidth="1"/><rect x="4.5" y="4.5" width="3" height="3" fill="#22a352"/><rect x="16.5" y="4.5" width="3" height="3" fill="#22a352"/><rect x="4.5" y="16.5" width="3" height="3" fill="#22a352"/><rect x="16.5" y="16.5" width="3" height="3" fill="#22a352"/></svg></button>
          <div className={styles.hToolDivider} />
          <button className={`${styles.hTool} ${activeTool === 'tape' ? styles.active : ''}`} onClick={() => setActiveTool('tape')} title="Tape Measure"><svg viewBox="0 0 24 24" fill="none"><rect x="2" y="9" width="12" height="6" rx="1" fill="#f0d860" stroke="#a08020"/><line x1="14" y1="12" x2="21" y2="12" stroke="#2d2d2d" strokeWidth="1"/><circle cx="21" cy="12" r="2" fill="#e63946"/></svg></button>
          <div className={styles.hToolDivider} />
          <button className={`${styles.hTool} ${activeTool === 'orbit' ? styles.active : ''}`} onClick={() => setActiveTool('orbit')} title="Orbit"><svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="#22a352" strokeWidth="1.25" transform="rotate(50 12 12)"/><ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="#e63946" strokeWidth="1.25" transform="rotate(-50 12 12)"/><circle cx="12" cy="12" r="2.5" fill="#457fd3"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'pan' ? styles.active : ''}`} onClick={() => setActiveTool('pan')} title="Pan"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3V7M8 5V9M16 5V9M6 8V14M18 8V14" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/><path d="M6 14C6 17 8 20 12 20C16 20 18 17 18 14" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'zoom' ? styles.active : ''}`} onClick={() => setActiveTool('zoom')} title="Zoom"><svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round"/></svg></button>
          <div className={styles.hToolDivider} />
          <button className={`${styles.hTool} ${activeTool === 'paint' ? styles.active : ''}`} onClick={() => setActiveTool('paint')} title="Paint"><svg viewBox="0 0 24 24" fill="none"><path d="M6 5h12l2 3v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8l2-3z" fill="#a8c8e8" stroke="#2d2d2d" strokeWidth="1"/></svg></button>
          <button className={`${styles.hTool} ${activeTool === 'eraser' ? styles.active : ''}`} onClick={() => { setActiveTool('eraser'); deleteSelected(); }} title="Delete"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="10" rx="1" fill="#f5a0a0" stroke="#d44" strokeWidth="1"/></svg></button>
        </div>
      </div>

      <div className={styles.main}>
        {/* Left Vertical Toolbar - SketchUp Large Tool Set (2 columns) */}
        <div className={styles.leftToolbar}>
          {/* Row 1: Select, Orbit */}
          <button className={`${styles.verticalTool} ${activeTool === 'select' ? styles.active : ''}`} onClick={() => setActiveTool('select')} title="Select (Space)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="#2d2d2d"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'orbit' ? styles.active : ''}`} onClick={() => setActiveTool('orbit')} title="Orbit (O)">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="#22a352" strokeWidth="1.5" transform="rotate(50 12 12)"/><ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="#e63946" strokeWidth="1.5" transform="rotate(-50 12 12)"/><circle cx="12" cy="12" r="3" fill="#457fd3"/></svg>
          </button>
          {/* Row 2: Paint, Eraser */}
          <button className={`${styles.verticalTool} ${activeTool === 'paint' ? styles.active : ''}`} onClick={() => setActiveTool('paint')} title="Paint Bucket (B)">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="10" cy="6" rx="6" ry="3" fill="#f0d860" stroke="#a08020"/><path d="M4 6v10c0 1.5 2.7 3 6 3s6-1.5 6-3V6" fill="#f0d860" stroke="#a08020"/><path d="M16 12c2 1 4 3 4 5s-1 3-2 3-2-1-2-3" fill="#60a0e0" stroke="#2060a0"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'eraser' ? styles.active : ''}`} onClick={() => { setActiveTool('eraser'); deleteSelected(); }} title="Eraser (E)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="14" width="16" height="6" rx="1" fill="#f5a0b0" stroke="#c06080"/><rect x="4" y="10" width="16" height="4" fill="#f8c8d0" stroke="#c06080"/></svg>
          </button>
          {/* Row 3: Make Component, Tag */}
          <button className={`${styles.verticalTool} ${activeTool === 'makeComponent' ? styles.active : ''}`} onClick={() => setActiveTool('makeComponent')} title="Make Component (G)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 8L12 5L18 8V16L12 19L6 16V8Z" fill="#c8e8f8" stroke="#457fd3" strokeWidth="1" strokeDasharray="2 1"/><path d="M6 8L12 11L18 8M12 11V19" stroke="#457fd3" strokeWidth="1" strokeDasharray="2 1"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'tag' ? styles.active : ''}`} onClick={() => setActiveTool('tag')} title="Tag">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 4h8l8 8-8 8-8-8V4z" fill="#90c97d" stroke="#4a8035" strokeWidth="1.5"/><circle cx="8" cy="8" r="2" fill="white"/></svg>
          </button>
          <div className={styles.verticalDivider} />

          {/* Row 4: Line, Freehand */}
          <button className={`${styles.verticalTool} ${activeTool === 'line' ? styles.active : ''}`} onClick={() => setActiveTool('line')} title="Line (L)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M18 4L6 16" stroke="#8B4513" strokeWidth="3" strokeLinecap="round"/><path d="M5 17L7 19L3 21L5 17Z" fill="#2d2d2d"/><circle cx="18" cy="4" r="2" fill="#ffd700" stroke="#8B4513"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'freehand' ? styles.active : ''}`} onClick={() => setActiveTool('freehand')} title="Freehand">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 16Q8 8 12 14T20 10" stroke="#e63946" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </button>
          {/* Row 5: Rectangle, Rotated Rectangle */}
          <button className={`${styles.verticalTool} ${activeTool === 'rectangle' ? styles.active : ''}`} onClick={() => setActiveTool('rectangle')} title="Rectangle (R)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="4" cy="6" r="2" fill="#e63946"/><circle cx="20" cy="6" r="2" fill="#e63946"/><circle cx="4" cy="18" r="2" fill="#e63946"/><circle cx="20" cy="18" r="2" fill="#e63946"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'rotatedRect' ? styles.active : ''}`} onClick={() => setActiveTool('rotatedRect')} title="Rotated Rectangle">
            <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="14" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5" transform="rotate(15 12 12)"/><circle cx="7" cy="4" r="2" fill="#e63946"/><circle cx="20" cy="7" r="2" fill="#e63946"/><circle cx="17" cy="20" r="2" fill="#e63946"/><circle cx="4" cy="17" r="2" fill="#e63946"/></svg>
          </button>
          {/* Row 6: Circle, Polygon */}
          <button className={`${styles.verticalTool} ${activeTool === 'circle' ? styles.active : ''}`} onClick={() => setActiveTool('circle')} title="Circle (C)">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill="#e63946"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'polygon' ? styles.active : ''}`} onClick={() => setActiveTool('polygon')} title="Polygon">
            <svg viewBox="0 0 24 24" fill="none"><polygon points="12,3 21,9 18,20 6,20 3,9" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="2" fill="#e63946"/></svg>
          </button>
          {/* Row 7: Arc, 2-Point Arc */}
          <button className={`${styles.verticalTool} ${activeTool === 'arc' ? styles.active : ''}`} onClick={() => setActiveTool('arc')} title="Arc (A)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 18Q12 4 20 18" stroke="#2d2d2d" strokeWidth="1.5" fill="none"/><circle cx="4" cy="18" r="2" fill="#e63946"/><circle cx="20" cy="18" r="2" fill="#e63946"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'arc2pt' ? styles.active : ''}`} onClick={() => setActiveTool('arc2pt')} title="2 Point Arc">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 18Q12 4 20 18" stroke="#2d2d2d" strokeWidth="1.5" fill="none"/><circle cx="4" cy="18" r="2" fill="#e63946"/><circle cx="20" cy="18" r="2" fill="#e63946"/><path d="M12 8L10 12L14 12Z" fill="#e63946"/></svg>
          </button>
          {/* Row 8: 3-Point Arc, Pie */}
          <button className={`${styles.verticalTool} ${activeTool === 'arc3pt' ? styles.active : ''}`} onClick={() => setActiveTool('arc3pt')} title="3 Point Arc">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 16Q8 4 12 10T20 16" stroke="#2d2d2d" strokeWidth="1.5" fill="none"/><circle cx="4" cy="16" r="2" fill="#e63946"/><circle cx="12" cy="10" r="2" fill="#e63946"/><circle cx="20" cy="16" r="2" fill="#e63946"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'pie' ? styles.active : ''}`} onClick={() => setActiveTool('pie')} title="Pie">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 12L12 4A8 8 0 0 1 19 16Z" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="2" fill="#e63946"/></svg>
          </button>
          <div className={styles.verticalDivider} />

          {/* Row 9: Move, Push/Pull */}
          <button className={`${styles.verticalTool} ${activeTool === 'move' ? styles.active : ''}`} onClick={() => setActiveTool('move')} title="Move (M)">
            <svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="#e63946" strokeWidth="2"/><line x1="4" y1="12" x2="20" y2="12" stroke="#e63946" strokeWidth="2"/><path d="M12 4L9 8H15L12 4Z" fill="#e63946"/><path d="M12 20L9 16H15L12 20Z" fill="#e63946"/><path d="M4 12L8 9V15L4 12Z" fill="#e63946"/><path d="M20 12L16 9V15L20 12Z" fill="#e63946"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'pushpull' ? styles.active : ''}`} onClick={() => setActiveTool('pushpull')} title="Push/Pull (P)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 14L10 11L16 14V18L10 21L4 18V14Z" fill="#c9a227" stroke="#8b6914"/><path d="M4 9L10 6L16 9V13L10 10L4 13V9Z" fill="#e0c040" stroke="#8b6914"/><path d="M10 2L8 5H12L10 2Z" fill="#e63946"/><path d="M10 6V2" stroke="#e63946" strokeWidth="1.5"/></svg>
          </button>
          {/* Row 10: Rotate, Scale */}
          <button className={`${styles.verticalTool} ${activeTool === 'rotate' ? styles.active : ''}`} onClick={() => setActiveTool('rotate')} title="Rotate (Q)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 4A8 8 0 1 1 4.5 15" stroke="#e63946" strokeWidth="2" fill="none"/><path d="M12 4L9 8H15L12 4Z" fill="#e63946"/><path d="M4.5 15L2 11L7 11L4.5 15Z" fill="#e63946"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'scale' ? styles.active : ''}`} onClick={() => setActiveTool('scale')} title="Scale (S)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 10L12 7L18 10V16L12 19L6 16V10Z" fill="#e8e8e8" stroke="#2d2d2d"/><path d="M6 10L12 13L18 10M12 13V19" stroke="#2d2d2d"/><path d="M12 4L10 7H14L12 4Z" fill="#e63946"/><path d="M21 12L18 10V14L21 12Z" fill="#e63946"/><path d="M12 22L14 19H10L12 22Z" fill="#e63946"/><path d="M3 12L6 10V14L3 12Z" fill="#e63946"/></svg>
          </button>
          {/* Row 11: Offset, Outer Shell */}
          <button className={`${styles.verticalTool} ${activeTool === 'offset' ? styles.active : ''}`} onClick={() => setActiveTool('offset')} title="Offset (F)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="12" height="12" fill="none" stroke="#2d2d2d" strokeWidth="1.5"/><rect x="9" y="9" width="12" height="12" fill="none" stroke="#e63946" strokeWidth="1.5"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'outerShell' ? styles.active : ''}`} onClick={() => setActiveTool('outerShell')} title="Outer Shell">
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="10" height="10" fill="#c8daf0" stroke="#2d2d2d"/><rect x="11" y="10" width="10" height="10" fill="#f0c8c8" stroke="#2d2d2d"/><path d="M16 6L18 4M18 4L20 6M18 4V8" stroke="#e63946" strokeWidth="1.5"/><path d="M8 18L6 20M6 20L4 18M6 20V16" stroke="#e63946" strokeWidth="1.5"/></svg>
          </button>
          <div className={styles.verticalDivider} />

          {/* Row 12: Tape, Dimension */}
          <button className={`${styles.verticalTool} ${activeTool === 'tape' ? styles.active : ''}`} onClick={() => setActiveTool('tape')} title="Tape Measure (T)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="8" width="14" height="8" rx="1" fill="#f0d860" stroke="#a08020"/><line x1="16" y1="12" x2="22" y2="12" stroke="#2d2d2d" strokeWidth="1"/><circle cx="6" cy="12" r="3" fill="#a08020"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'dimension' ? styles.active : ''}`} onClick={() => setActiveTool('dimension')} title="Dimension">
            <svg viewBox="0 0 24 24" fill="none"><line x1="4" y1="18" x2="20" y2="18" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="4" y1="14" x2="4" y2="20" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="20" y1="14" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="1.5"/><text x="12" y="14" fontSize="8" fill="#2d2d2d" textAnchor="middle">3</text><line x1="10" y1="6" x2="14" y2="10" stroke="#e63946" strokeWidth="1.5"/><line x1="14" y1="6" x2="10" y2="10" stroke="#e63946" strokeWidth="1.5"/></svg>
          </button>
          {/* Row 13: Protractor, Text */}
          <button className={`${styles.verticalTool} ${activeTool === 'protractor' ? styles.active : ''}`} onClick={() => setActiveTool('protractor')} title="Protractor">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 18A10 10 0 0 1 20 18" fill="#f0d860" stroke="#a08020" strokeWidth="1.5"/><line x1="12" y1="18" x2="12" y2="8" stroke="#22a352" strokeWidth="1.5"/><line x1="12" y1="18" x2="18" y2="12" stroke="#e63946" strokeWidth="1.5"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'text' ? styles.active : ''}`} onClick={() => setActiveTool('text')} title="Text">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="white" stroke="#2d2d2d"/><text x="12" y="16" fontSize="10" fill="#2d2d2d" textAnchor="middle" fontWeight="bold">A1</text></svg>
          </button>
          {/* Row 14: 3D Text, Axes */}
          <button className={`${styles.verticalTool} ${activeTool === 'text3d' ? styles.active : ''}`} onClick={() => setActiveTool('text3d')} title="3D Text">
            <svg viewBox="0 0 24 24" fill="none"><path d="M8 18L12 4L16 18M9 14H15" stroke="#2d2d2d" strokeWidth="2" fill="none"/><path d="M10 18L14 14L18 18L14 16Z" fill="#22a352"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'axes' ? styles.active : ''}`} onClick={() => setActiveTool('axes')} title="Axes">
            <svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="20" x2="12" y2="8" stroke="#457fd3" strokeWidth="2"/><line x1="12" y1="12" x2="4" y2="16" stroke="#e63946" strokeWidth="2"/><line x1="12" y1="12" x2="20" y2="16" stroke="#22a352" strokeWidth="2"/><circle cx="12" cy="12" r="2" fill="#2d2d2d"/></svg>
          </button>
          <div className={styles.verticalDivider} />

          {/* Row 15: Section, Solid Tools */}
          <button className={`${styles.verticalTool} ${activeTool === 'section' ? styles.active : ''}`} onClick={() => setActiveTool('section')} title="Section Plane">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="10" fill="#f0a060" fillOpacity="0.5" stroke="#d06020" strokeWidth="1.5" transform="rotate(-10 12 13)"/><line x1="12" y1="4" x2="12" y2="10" stroke="#d06020" strokeWidth="2"/><path d="M10 4L12 2L14 4" fill="#d06020"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'solidTools' ? styles.active : ''}`} onClick={() => setActiveTool('solidTools')} title="Solid Tools">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 4V8M8 6V10M16 6V10M6 9V15M18 9V15" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/><path d="M6 15C6 18 8 21 12 21C16 21 18 18 18 15" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
          <div className={styles.verticalDivider} />

          {/* Row 16: Zoom, Zoom Window */}
          <button className={`${styles.verticalTool} ${activeTool === 'zoom' ? styles.active : ''}`} onClick={() => setActiveTool('zoom')} title="Zoom (Z)">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round"/><line x1="7" y1="10" x2="13" y2="10" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="10" y1="7" x2="10" y2="13" stroke="#2d2d2d" strokeWidth="1.5"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'zoomWindow' ? styles.active : ''}`} onClick={() => setActiveTool('zoomWindow')} title="Zoom Window">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round"/><rect x="7" y="7" width="6" height="6" fill="none" stroke="#457fd3" strokeWidth="1" strokeDasharray="2 1"/></svg>
          </button>
          {/* Row 17: Zoom Extents, Previous View */}
          <button className={`${styles.verticalTool} ${activeTool === 'zoomExtents' ? styles.active : ''}`} onClick={() => setActiveTool('zoomExtents')} title="Zoom Extents (Shift+Z)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 4L14 7H10L12 4Z" fill="#e63946"/><path d="M12 20L10 17H14L12 20Z" fill="#e63946"/><path d="M4 12L7 10V14L4 12Z" fill="#e63946"/><path d="M20 12L17 14V10L20 12Z" fill="#e63946"/><rect x="8" y="8" width="8" height="8" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'zoomPrevious' ? styles.active : ''}`} onClick={() => setActiveTool('zoomPrevious')} title="Previous View">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="14" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="18.5" y1="14.5" x2="22" y2="18" stroke="#2d2d2d" strokeWidth="2" strokeLinecap="round"/><path d="M8 8A6 6 0 0 0 3 14" stroke="#457fd3" strokeWidth="2" fill="none"/><path d="M3 10V14H7" fill="none" stroke="#457fd3" strokeWidth="2"/></svg>
          </button>
          <div className={styles.verticalDivider} />

          {/* Row 18: Look Around, Position Camera */}
          <button className={`${styles.verticalTool} ${activeTool === 'lookAround' ? styles.active : ''}`} onClick={() => setActiveTool('lookAround')} title="Look Around">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="9" ry="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="3" fill="#457fd3"/><circle cx="12" cy="12" r="1.5" fill="#2d2d2d"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'positionCamera' ? styles.active : ''}`} onClick={() => setActiveTool('positionCamera')} title="Position Camera">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="8" rx="3" ry="4" fill="none" stroke="#2d2d2d" strokeWidth="1.5"/><path d="M6 20V16C6 14 8 12 12 12C16 12 18 14 18 16V20" stroke="#2d2d2d" strokeWidth="1.5" fill="none"/></svg>
          </button>
          {/* Row 19: Walk, Pan */}
          <button className={`${styles.verticalTool} ${activeTool === 'walk' ? styles.active : ''}`} onClick={() => setActiveTool('walk')} title="Walk">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="8" cy="10" rx="3" ry="4" fill="#2d2d2d" transform="rotate(-20 8 10)"/><ellipse cx="16" cy="14" rx="3" ry="4" fill="#2d2d2d" transform="rotate(-20 16 14)"/></svg>
          </button>
          <button className={`${styles.verticalTool} ${activeTool === 'pan' ? styles.active : ''}`} onClick={() => setActiveTool('pan')} title="Pan (H)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 3V7M8 5V9M16 5V9M6 8V14M18 8V14" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/><path d="M6 14C6 17 8 20 12 20C16 20 18 17 18 14" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* 3D Viewport */}
        <div className={styles.viewport}>
          <canvas ref={canvasRef} className={styles.canvas} data-tool={activeTool} />
        </div>

        {/* Right Panel Toggle Button */}
        <button
          className={`${styles.panelToggle} ${rightPanelCollapsed ? styles.collapsed : ''}`}
          onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
          title={rightPanelCollapsed ? 'Show Panel' : 'Hide Panel'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {rightPanelCollapsed ? (
              <path d="M15 19l-7-7 7-7" />
            ) : (
              <path d="M9 5l7 7-7 7" />
            )}
          </svg>
        </button>

        {/* Right Panel - SketchUp Default Tray */}
        <div className={`${styles.rightPanel} ${rightPanelCollapsed ? styles.collapsed : ''}`}>
          {/* Tray Header */}
          <div className={styles.trayHeader}>
            <span className={styles.trayTitle}>Default Tray</span>
            <div className={styles.trayControls}>
              <button className={styles.trayBtn} title="Options">≡</button>
              <button className={styles.trayBtn} onClick={() => setRightPanelCollapsed(true)} title="Close">×</button>
            </div>
          </div>

          {/* Entity Info Section */}
          <div className={styles.traySection}>
            <div className={styles.traySectionHeader}>
              <span className={styles.traySectionTitle}>Entity Info</span>
              <svg className={styles.traySectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
            <div className={styles.traySectionContent}>
              {meshProperties ? (
                <div className={styles.entityInfo}>
                  <div className={styles.entityRow}><span className={styles.entityLabel}>Entity:</span><span className={styles.entityValue}>{meshProperties.name}</span></div>
                  <div className={styles.entityRow}><span className={styles.entityLabel}>Layer:</span><span className={styles.entityValue}>Layer0</span></div>
                  <div className={styles.entityRow}><span className={styles.entityLabel}>Position:</span><span className={styles.entityValue}>{meshProperties.position.x.toFixed(1)}, {meshProperties.position.y.toFixed(1)}, {meshProperties.position.z.toFixed(1)}</span></div>
                </div>
              ) : (
                <div className={styles.entityInfo}>
                  <div className={styles.entityRow}><span className={styles.entityLabel}>Entity:</span><span className={styles.entityValue}>Nothing selected</span></div>
                </div>
              )}
            </div>
          </div>

          {/* Materials Section */}
          <div className={styles.traySection}>
            <div className={styles.traySectionHeader}>
              <span className={styles.traySectionTitle}>Materials</span>
              <svg className={styles.traySectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
            <div className={styles.traySectionContent}>
              <div className={styles.materialsGrid}>
                {colorPalette.map((color, idx) => (
                  <button key={idx} className={styles.colorSwatch} style={{ backgroundColor: color }} title={color} />
                ))}
              </div>
            </div>
          </div>

          {/* Components Section */}
          <div className={styles.traySection}>
            <div className={styles.traySectionHeader}>
              <span className={styles.traySectionTitle}>Components</span>
              <svg className={styles.traySectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
            <div className={styles.traySectionContent}>
              <div className={styles.componentsList}>
                <div className={styles.componentItem}>
                  <div className={styles.componentIcon}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#666"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                  </div>
                  <span className={styles.componentName}>No components in model</span>
                </div>
              </div>
            </div>
          </div>

          {/* Styles Section */}
          <div className={styles.traySection}>
            <div className={styles.traySectionHeader}>
              <span className={styles.traySectionTitle}>Styles</span>
              <svg className={styles.traySectionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
            <div className={styles.traySectionContent}>
              <div className={styles.entityInfo}>
                <div className={styles.entityRow}><span className={styles.entityLabel}>Current:</span><span className={styles.entityValue}>Default Style</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className={styles.statusBar}>
        <span className={styles.statusText}>Select tool active. Click to select entities.</span>
        <div className={styles.measurementsGroup}>
          <span className={styles.measurementsLabel}>Measurements:</span>
          <input type="text" className={styles.measurementsInput} placeholder="Enter value" />
        </div>
      </div>
    </div>
  );
};

export default CustomModelingPage;
