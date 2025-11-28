import React, { useState, useRef, useEffect } from 'react';
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
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';

type ModelCategory = 'base' | 'scenario' | 'lighting' | 'furniture';
type ToolType = 'select' | 'eraser' | 'line' | 'arc' | 'rectangle' | 'pushpull' | 'rotate' | 'move' | 'scale' | 'offset' | 'tape' | 'text' | 'paint' | 'orbit' | 'pan' | 'zoom' | 'zoomExtents';

interface ModelItem {
  id: string;
  name: string;
  icon: React.ReactNode;
}

const CustomModelingPage: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const gizmoManagerRef = useRef<GizmoManager | null>(null);
  const highlightLayerRef = useRef<HighlightLayer | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    base: true,
    scenario: true,
    lighting: false,
    furniture: false,
  });
  const [selectedMesh, setSelectedMesh] = useState<Mesh | null>(null);
  const [meshProperties, setMeshProperties] = useState<{
    name: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  } | null>(null);

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

    // Pointer events for selection
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh) {
          const mesh = pointerInfo.pickInfo.pickedMesh as Mesh;
          if (mesh.name !== 'ground') {
            selectMesh(mesh);
          } else {
            deselectMesh();
          }
        } else {
          deselectMesh();
        }
      }
    });

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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const baseModels: ModelItem[] = [
    { id: 'rectangle', name: 'Rectangle', icon: <rect x="6" y="12" width="28" height="16" rx="2" /> },
    { id: 'circle', name: 'Circle', icon: <circle cx="20" cy="20" r="12" /> },
    { id: 'polygon', name: 'Polygon', icon: <polygon points="20,6 34,14 30,30 10,30 6,14" /> },
    { id: 'star', name: 'Star', icon: <polygon points="20,6 23,14 32,14 25,20 28,28 20,23 12,28 15,20 8,14 17,14" /> },
    { id: 'cube', name: 'Cube', icon: <><path d="M20 8L32 14V26L20 32L8 26V14L20 8Z" /><path d="M20 8L32 14L20 20L8 14Z" opacity="0.5" /></> },
    { id: 'sphere', name: 'Sphere', icon: <><circle cx="20" cy="20" r="12" /><ellipse cx="20" cy="20" rx="12" ry="4" opacity="0.3" /></> },
    { id: 'cylinder', name: 'Cylinder', icon: <><ellipse cx="20" cy="10" rx="10" ry="4" /><path d="M10 10V28C10 30 14.5 32 20 32C25.5 32 30 30 30 28V10" /></> },
    { id: 'cone', name: 'Cone', icon: <><path d="M20 6L10 30C10 32 14.5 34 20 34C25.5 34 30 32 30 30L20 6Z" /><ellipse cx="20" cy="30" rx="10" ry="4" opacity="0.5" /></> },
    { id: 'torus', name: 'Torus', icon: <><ellipse cx="20" cy="20" rx="14" ry="6" fill="none" strokeWidth="6" /><ellipse cx="20" cy="20" rx="14" ry="6" fill="none" strokeWidth="2" opacity="0.5" /></> },
  ];

  const scenarioModels: ModelItem[] = [
    { id: 'lightStrip', name: 'Light Strip', icon: <rect x="6" y="16" width="28" height="8" rx="2" /> },
    { id: 'continuousLight', name: 'LED Strip', icon: <><path d="M6 20H34" strokeWidth="4" strokeLinecap="round" /><circle cx="10" cy="20" r="2" /><circle cx="20" cy="20" r="2" /><circle cx="30" cy="20" r="2" /></> },
    { id: 'doubleStairs', name: 'Stairs', icon: <path d="M8 32H14V26H20V20H26V14H32V8" strokeWidth="2" fill="none" /> },
    { id: 'singleStairs', name: 'Steps', icon: <><rect x="10" y="28" width="20" height="4" /><rect x="10" y="22" width="20" height="4" /><rect x="10" y="16" width="20" height="4" /><rect x="10" y="10" width="20" height="4" /></> },
  ];

  const furnitureModels: ModelItem[] = [
    { id: 'table', name: 'Table', icon: <><rect x="8" y="14" width="24" height="3" /><rect x="10" y="17" width="2" height="14" /><rect x="28" y="17" width="2" height="14" /></> },
    { id: 'chair', name: 'Chair', icon: <><rect x="12" y="6" width="16" height="12" /><rect x="12" y="18" width="16" height="4" /><rect x="14" y="22" width="2" height="10" /><rect x="24" y="22" width="2" height="10" /></> },
  ];

  const renderModelGrid = (models: ModelItem[]) => (
    <div className={styles.modelGrid}>
      {models.map((model) => (
        <button
          key={model.id}
          className={styles.modelCard}
          onClick={() => addModel(model.id)}
          title={model.name}
        >
          <svg viewBox="0 0 40 40" fill="currentColor" stroke="currentColor" strokeWidth="1">
            {model.icon}
          </svg>
          <span>{model.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.container}>
      {/* Top Bar - Simplified */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <button className={styles.backBtn} onClick={() => navigate(-1)} title="Back to Editor">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className={styles.title}>Custom Modeling</span>
        </div>
        <div className={styles.topBarRight}>
          <button className={styles.finishBtn} onClick={() => navigate(-1)}>
            Finish
          </button>
        </div>
      </div>

      <div className={styles.main}>
        {/* Left Vertical Toolbar - SketchUp Large Tool Set Style */}
        <div className={styles.leftToolbar}>
          {/* Select */}
          <button className={`${styles.verticalTool} ${activeTool === 'select' ? styles.active : ''}`} onClick={() => setActiveTool('select')} title="Select (Space)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M5 3L5 19L9 15L12 21L14 20L11 14L17 14L5 3Z" fill="#2d2d2d" stroke="#1a1a1a" strokeWidth="0.5"/></svg>
          </button>
          {/* Make Component */}
          <button className={styles.verticalTool} title="Make Component">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="#d0d0d0" stroke="#505050" strokeWidth="1"/><rect x="7" y="7" width="10" height="10" fill="#a0c0e0" stroke="#4080c0" strokeWidth="1"/><circle cx="12" cy="12" r="2" fill="#4080c0"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Eraser */}
          <button className={`${styles.verticalTool} ${activeTool === 'eraser' ? styles.active : ''}`} onClick={() => { setActiveTool('eraser'); deleteSelected(); }} title="Eraser (E)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="13" width="14" height="6" rx="0.5" fill="#d4b8a0" stroke="#8b7355" strokeWidth="1"/><path d="M6 13V8.5a.5.5 0 01.5-.5h11a.5.5 0 01.5.5V13" fill="#e8d4c4" stroke="#8b7355" strokeWidth="1"/><line x1="9" y1="13" x2="9" y2="9" stroke="#a08060" strokeWidth="0.75"/><line x1="12" y1="13" x2="12" y2="8.5" stroke="#a08060" strokeWidth="0.75"/><line x1="15" y1="13" x2="15" y2="9" stroke="#a08060" strokeWidth="0.75"/></svg>
          </button>
          {/* Paint */}
          <button className={`${styles.verticalTool} ${activeTool === 'paint' ? styles.active : ''}`} onClick={() => setActiveTool('paint')} title="Paint Bucket (B)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 5h12l2 3v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8l2-3z" fill="#a8c8e8" stroke="#2d2d2d" strokeWidth="1"/><path d="M4 8h16" stroke="#2d2d2d" strokeWidth="1"/><ellipse cx="12" cy="6" rx="4.5" ry="1.3" fill="#7db0d8" stroke="#2d2d2d" strokeWidth="0.5"/><path d="M17 13c2 0 2.5 1.5 2.5 2.5s-1 1.5-2 1.5" fill="#7db0d8" stroke="#2d2d2d" strokeWidth="1"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Line */}
          <button className={`${styles.verticalTool} ${activeTool === 'line' ? styles.active : ''}`} onClick={() => setActiveTool('line')} title="Line (L)">
            <svg viewBox="0 0 24 24" fill="none"><line x1="4" y1="20" x2="20" y2="4" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="4" cy="20" r="2.5" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><circle cx="20" cy="4" r="2.5" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/></svg>
          </button>
          {/* Freehand */}
          <button className={styles.verticalTool} title="Freehand">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 18Q8 10 12 14T20 6" stroke="#e63946" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Rectangle */}
          <button className={`${styles.verticalTool} ${activeTool === 'rectangle' ? styles.active : ''}`} onClick={() => setActiveTool('rectangle')} title="Rectangle (R)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="4" cy="6" r="2" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/></svg>
          </button>
          {/* Rotated Rectangle */}
          <button className={styles.verticalTool} title="Rotated Rectangle">
            <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="5" width="14" height="10" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5" transform="rotate(15 12 12)"/><circle cx="6" cy="8" r="2" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Circle */}
          <button className={styles.verticalTool} title="Circle (C)">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/></svg>
          </button>
          {/* Polygon */}
          <button className={styles.verticalTool} title="Polygon">
            <svg viewBox="0 0 24 24" fill="none"><polygon points="12,3 21,9 18,20 6,20 3,9" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="1.5" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Arc 2-Point */}
          <button className={`${styles.verticalTool} ${activeTool === 'arc' ? styles.active : ''}`} onClick={() => setActiveTool('arc')} title="Arc (A)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 18Q12 4 20 18" stroke="#2d2d2d" strokeWidth="1.5" fill="none"/><circle cx="4" cy="18" r="2" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><circle cx="20" cy="18" r="2" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/></svg>
          </button>
          {/* Arc 3-Point */}
          <button className={styles.verticalTool} title="3-Point Arc">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 16Q12 4 20 16" stroke="#2d2d2d" strokeWidth="1.5" fill="none"/><circle cx="4" cy="16" r="1.5" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><circle cx="20" cy="16" r="1.5" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/><circle cx="12" cy="7" r="1.5" fill="#457fd3" stroke="#3366b3" strokeWidth="0.5"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Pie */}
          <button className={styles.verticalTool} title="Pie">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 12L12 4A8 8 0 0120 12Z" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1.5"/><circle cx="12" cy="12" r="8" fill="none" stroke="#2d2d2d" strokeWidth="1" strokeDasharray="2 2"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Push/Pull */}
          <button className={`${styles.verticalTool} ${activeTool === 'pushpull' ? styles.active : ''}`} onClick={() => setActiveTool('pushpull')} title="Push/Pull (P)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 15L10 12L16 15V19L10 22L4 19V15Z" fill="#c9a227" stroke="#8b6914" strokeWidth="0.75"/><path d="M4 15L10 18L16 15" stroke="#8b6914" strokeWidth="0.75"/><path d="M4 10L10 7L16 10V14L10 11L4 14V10Z" fill="#e0c040" stroke="#8b6914" strokeWidth="0.75"/><path d="M10 3L7 5L10 7L13 5L10 3Z" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/></svg>
          </button>
          {/* Follow Me */}
          <button className={styles.verticalTool} title="Follow Me">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="16" r="5" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1"/><path d="M8 11C12 8 16 8 20 11" stroke="#e63946" strokeWidth="2" strokeLinecap="round"/><path d="M17 8L20 11L17 14" fill="none" stroke="#e63946" strokeWidth="1.5"/></svg>
          </button>
          {/* Outer Shell */}
          <button className={styles.verticalTool} title="Outer Shell">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="10" height="10" fill="#e0e0e0" stroke="#2d2d2d" strokeWidth="1"/><rect x="10" y="6" width="10" height="10" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="1"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Move */}
          <button className={`${styles.verticalTool} ${activeTool === 'move' ? styles.active : ''}`} onClick={() => setActiveTool('move')} title="Move (M)">
            <svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="#e63946" strokeWidth="1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="#22a352" strokeWidth="1.5"/><path d="M12 4L9 8H15L12 4Z" fill="#e63946"/><path d="M12 20L9 16H15L12 20Z" fill="#e63946"/><path d="M4 12L8 9V15L4 12Z" fill="#22a352"/><path d="M20 12L16 9V15L20 12Z" fill="#22a352"/><rect x="10" y="10" width="4" height="4" fill="#457fd3" stroke="#3366b3" strokeWidth="0.5"/></svg>
          </button>
          {/* Rotate */}
          <button className={`${styles.verticalTool} ${activeTool === 'rotate' ? styles.active : ''}`} onClick={() => setActiveTool('rotate')} title="Rotate (Q)">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="7" fill="none" stroke="#2d2d2d" strokeWidth="1" strokeDasharray="3 2"/><circle cx="12" cy="13" r="2" fill="#457fd3" stroke="#3366b3" strokeWidth="0.5"/><line x1="12" y1="6" x2="12" y2="11" stroke="#e63946" strokeWidth="1.5"/><path d="M9 8L12 4L15 8" fill="#e63946"/><line x1="5" y1="13" x2="9" y2="13" stroke="#22a352" strokeWidth="1.5"/><path d="M7 10L3 13L7 16" fill="#22a352"/></svg>
          </button>
          {/* Scale */}
          <button className={`${styles.verticalTool} ${activeTool === 'scale' ? styles.active : ''}`} onClick={() => setActiveTool('scale')} title="Scale (S)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" fill="#e5e5e5" stroke="#2d2d2d" strokeWidth="1"/><rect x="4.5" y="4.5" width="3" height="3" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><rect x="16.5" y="4.5" width="3" height="3" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><rect x="4.5" y="16.5" width="3" height="3" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><rect x="16.5" y="16.5" width="3" height="3" fill="#22a352" stroke="#1a7a3a" strokeWidth="0.5"/><rect x="10.5" y="4.5" width="3" height="3" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/><rect x="10.5" y="16.5" width="3" height="3" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Offset */}
          <button className={`${styles.verticalTool} ${activeTool === 'offset' ? styles.active : ''}`} onClick={() => setActiveTool('offset')} title="Offset (F)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="11" height="11" fill="none" stroke="#2d2d2d" strokeWidth="1.5"/><rect x="10" y="10" width="11" height="11" fill="#c8daf0" stroke="#e63946" strokeWidth="1.5"/><line x1="10" y1="10" x2="6" y2="6" stroke="#e63946" strokeWidth="1" strokeDasharray="2 1"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Tape Measure */}
          <button className={`${styles.verticalTool} ${activeTool === 'tape' ? styles.active : ''}`} onClick={() => setActiveTool('tape')} title="Tape Measure (T)">
            <svg viewBox="0 0 24 24" fill="none"><rect x="2" y="9" width="12" height="6" rx="1" fill="#f0d860" stroke="#a08020" strokeWidth="0.75"/><line x1="4" y1="10.5" x2="4" y2="13.5" stroke="#a08020" strokeWidth="0.75"/><line x1="7" y1="10.5" x2="7" y2="13.5" stroke="#a08020" strokeWidth="0.75"/><line x1="10" y1="10.5" x2="10" y2="13.5" stroke="#a08020" strokeWidth="0.75"/><line x1="14" y1="12" x2="21" y2="12" stroke="#2d2d2d" strokeWidth="1"/><circle cx="21" cy="12" r="2" fill="#e63946" stroke="#b32d38" strokeWidth="0.5"/></svg>
          </button>
          {/* Dimensions */}
          <button className={`${styles.verticalTool} ${activeTool === 'text' ? styles.active : ''}`} onClick={() => setActiveTool('text')} title="Dimensions">
            <svg viewBox="0 0 24 24" fill="none"><line x1="4" y1="17" x2="20" y2="17" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="4" y1="14" x2="4" y2="20" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="20" y1="14" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="1.5"/><rect x="7" y="6" width="10" height="7" fill="white" stroke="#2d2d2d" strokeWidth="1"/><text x="12" y="11.5" fontSize="5" fontFamily="Arial" fontWeight="bold" fill="#2d2d2d" textAnchor="middle">A1</text></svg>
          </button>
          {/* Protractor */}
          <button className={styles.verticalTool} title="Protractor">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 20A12 12 0 0120 20" fill="none" stroke="#f0d860" strokeWidth="3"/><path d="M4 20A12 12 0 0120 20" fill="none" stroke="#a08020" strokeWidth="1"/><line x1="12" y1="20" x2="12" y2="10" stroke="#2d2d2d" strokeWidth="1"/><line x1="12" y1="20" x2="6" y2="12" stroke="#2d2d2d" strokeWidth="1" strokeDasharray="2 1"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Text */}
          <button className={styles.verticalTool} title="Text">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="10" r="5" fill="#f0d860" stroke="#a08020" strokeWidth="1"/><line x1="7" y1="15" x2="7" y2="20" stroke="#a08020" strokeWidth="1.5"/><rect x="12" y="5" width="9" height="12" fill="white" stroke="#2d2d2d" strokeWidth="1"/><text x="16.5" y="13" fontSize="7" fontFamily="Arial" fontWeight="bold" fill="#2d2d2d" textAnchor="middle">A</text></svg>
          </button>
          {/* 3D Text */}
          <button className={styles.verticalTool} title="3D Text">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 18L8 6H12L16 18" stroke="#2d2d2d" strokeWidth="2" fill="none"/><line x1="6" y1="14" x2="14" y2="14" stroke="#2d2d2d" strokeWidth="1.5"/><path d="M16 18L18 14L20 18L18 10Z" fill="#c8daf0" stroke="#457fd3" strokeWidth="1"/></svg>
          </button>
          {/* Axes */}
          <button className={styles.verticalTool} title="Axes">
            <svg viewBox="0 0 24 24" fill="none"><line x1="12" y1="20" x2="12" y2="6" stroke="#457fd3" strokeWidth="2"/><line x1="12" y1="20" x2="4" y2="16" stroke="#22a352" strokeWidth="2"/><line x1="12" y1="20" x2="20" y2="16" stroke="#e63946" strokeWidth="2"/><circle cx="12" cy="20" r="2" fill="#2d2d2d"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Orbit */}
          <button className={`${styles.verticalTool} ${activeTool === 'orbit' ? styles.active : ''}`} onClick={() => setActiveTool('orbit')} title="Orbit (O)">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="#22a352" strokeWidth="1.25" transform="rotate(50 12 12)"/><ellipse cx="12" cy="12" rx="8" ry="3.5" stroke="#e63946" strokeWidth="1.25" transform="rotate(-50 12 12)"/><circle cx="12" cy="12" r="2.5" fill="#457fd3" stroke="#3366b3" strokeWidth="0.75"/><path d="M5 6L7 8M3 8L6 5" stroke="#22a352" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
          {/* Pan */}
          <button className={`${styles.verticalTool} ${activeTool === 'pan' ? styles.active : ''}`} onClick={() => setActiveTool('pan')} title="Pan (H)">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 3V7M8 5V9M16 5V9M6 8V14M18 8V14" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/><path d="M6 14C6 17 8 20 12 20C16 20 18 17 18 14" stroke="#c4a060" strokeWidth="2.5" strokeLinecap="round"/><path d="M12 3V7M8 5V9M16 5V9M6 8V14M18 8V14" stroke="#e8d0a0" strokeWidth="1.5" strokeLinecap="round"/><path d="M6 14C6 17 8 20 12 20C16 20 18 17 18 14" stroke="#e8d0a0" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Zoom */}
          <button className={`${styles.verticalTool} ${activeTool === 'zoom' ? styles.active : ''}`} onClick={() => setActiveTool('zoom')} title="Zoom (Z)">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round"/><line x1="7" y1="10" x2="13" y2="10" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="10" y1="7" x2="10" y2="13" stroke="#2d2d2d" strokeWidth="1.5"/></svg>
          </button>
          {/* Zoom Window */}
          <button className={styles.verticalTool} title="Zoom Window">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round"/><rect x="7" y="7" width="6" height="6" fill="none" stroke="#e63946" strokeWidth="1" strokeDasharray="2 1"/></svg>
          </button>
          {/* Zoom Extents */}
          <button className={`${styles.verticalTool} ${activeTool === 'zoomExtents' ? styles.active : ''}`} onClick={() => setActiveTool('zoomExtents')} title="Zoom Extents (Shift+Z)">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="10" cy="10" r="6" fill="white" stroke="#2d2d2d" strokeWidth="1.5"/><line x1="14.5" y1="14.5" x2="20" y2="20" stroke="#2d2d2d" strokeWidth="2.5" strokeLinecap="round"/><rect x="7" y="7" width="6" height="6" fill="#c8daf0" stroke="#2d2d2d" strokeWidth="0.75"/><path d="M4 4L6.5 6.5M16 4L13.5 6.5M4 16L6.5 13.5M16 16L13.5 13.5" stroke="#e63946" strokeWidth="1.25" strokeLinecap="round"/></svg>
          </button>
          {/* Previous View */}
          <button className={styles.verticalTool} title="Previous View">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 12H20" stroke="#2d2d2d" strokeWidth="2"/><path d="M10 6L4 12L10 18" fill="none" stroke="#2d2d2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>

          <div className={styles.verticalDivider} />

          {/* Position Camera */}
          <button className={styles.verticalTool} title="Position Camera">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" fill="#e8d0a0" stroke="#a08020" strokeWidth="1"/><path d="M6 22V16C6 14 8 12 12 12C16 12 18 14 18 16V22" fill="#a08020" stroke="#805010" strokeWidth="1"/><circle cx="12" cy="5" r="1" fill="#2d2d2d"/></svg>
          </button>
          {/* Look Around */}
          <button className={styles.verticalTool} title="Look Around">
            <svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="12" rx="10" ry="6" fill="none" stroke="#2d2d2d" strokeWidth="1.5"/><ellipse cx="8" cy="11" rx="2" ry="2.5" fill="white" stroke="#2d2d2d" strokeWidth="1"/><ellipse cx="16" cy="11" rx="2" ry="2.5" fill="white" stroke="#2d2d2d" strokeWidth="1"/><circle cx="8" cy="11" r="1" fill="#457fd3"/><circle cx="16" cy="11" r="1" fill="#457fd3"/></svg>
          </button>
          {/* Walk */}
          <button className={styles.verticalTool} title="Walk">
            <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="3" fill="#2d2d2d"/><path d="M12 8V14M8 20L12 14L16 20M8 12L12 14L16 12" stroke="#2d2d2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
        {/* Left Panel - Model Library */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h3>Modeling Library</h3>
          </div>
          <div className={styles.panelContent}>
            {/* Base Models */}
            <div className={styles.section}>
              <button className={styles.sectionHeader} onClick={() => toggleSection('base')}>
                <span>Base Model</span>
                <svg className={`${styles.chevron} ${expandedSections.base ? styles.expanded : ''}`} viewBox="0 0 24 24">
                  <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              {expandedSections.base && renderModelGrid(baseModels)}
            </div>

            {/* Scenario Models */}
            <div className={styles.section}>
              <button className={styles.sectionHeader} onClick={() => toggleSection('scenario')}>
                <span>Scenario Models</span>
                <svg className={`${styles.chevron} ${expandedSections.scenario ? styles.expanded : ''}`} viewBox="0 0 24 24">
                  <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              {expandedSections.scenario && renderModelGrid(scenarioModels)}
            </div>

            {/* Furniture */}
            <div className={styles.section}>
              <button className={styles.sectionHeader} onClick={() => toggleSection('furniture')}>
                <span>Furniture</span>
                <svg className={`${styles.chevron} ${expandedSections.furniture ? styles.expanded : ''}`} viewBox="0 0 24 24">
                  <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              {expandedSections.furniture && renderModelGrid(furnitureModels)}
            </div>
          </div>
        </div>

        {/* 3D Viewport */}
        <div className={styles.viewport}>
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>

        {/* Right Panel - Properties */}
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h3>Properties</h3>
          </div>
          <div className={styles.panelContent}>
            {meshProperties ? (
              <div className={styles.properties}>
                <div className={styles.propGroup}>
                  <label>Name</label>
                  <input type="text" value={meshProperties.name} readOnly />
                </div>
                <div className={styles.propGroup}>
                  <label>Position</label>
                  <div className={styles.propRow}>
                    <span>X</span><input type="number" value={meshProperties.position.x} readOnly />
                    <span>Y</span><input type="number" value={meshProperties.position.y} readOnly />
                    <span>Z</span><input type="number" value={meshProperties.position.z} readOnly />
                  </div>
                </div>
                <div className={styles.propGroup}>
                  <label>Rotation</label>
                  <div className={styles.propRow}>
                    <span>X</span><input type="number" value={meshProperties.rotation.x} readOnly />
                    <span>Y</span><input type="number" value={meshProperties.rotation.y} readOnly />
                    <span>Z</span><input type="number" value={meshProperties.rotation.z} readOnly />
                  </div>
                </div>
                <div className={styles.propGroup}>
                  <label>Scale</label>
                  <div className={styles.propRow}>
                    <span>X</span><input type="number" value={meshProperties.scale.x} readOnly />
                    <span>Y</span><input type="number" value={meshProperties.scale.y} readOnly />
                    <span>Z</span><input type="number" value={meshProperties.scale.z} readOnly />
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
                </svg>
                <p>Select an object to<br/>edit properties</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomModelingPage;
