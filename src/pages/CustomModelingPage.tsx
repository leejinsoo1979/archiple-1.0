import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuRotate3D, LuPencilLine, LuArrowUpFromLine, LuSquareSquare, LuScaling } from 'react-icons/lu';
import { BiMove } from 'react-icons/bi';
import { FaTape } from 'react-icons/fa';
import { IoHandRightOutline } from 'react-icons/io5';
import { GrRotateRight } from 'react-icons/gr';
import { BsEraser } from 'react-icons/bs';
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
  Ray,  // Required for scene.pick() to work
  Matrix,
} from '@babylonjs/core';
// Side-effect import for scene.pick() to work
import '@babylonjs/core/Culling/ray';
import { AdvancedDynamicTexture, Ellipse, Control } from '@babylonjs/gui';

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
  const activeSnapPointRef = useRef<Vector3 | null>(null);  // Currently active snap point for click handling
  const hoveredFaceRef = useRef<Mesh | null>(null);  // Currently hovered face for push/pull highlight

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
  });

  // Measurement input state for rectangle dimensions
  const [measurementInput, setMeasurementInput] = useState<string>('');
  const [showMeasurementInput, setShowMeasurementInput] = useState(false);
  const measurementInputRef = useRef<HTMLInputElement>(null);

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
  });

  // Line measurement display state
  const [lineMeasurement, setLineMeasurement] = useState<number>(0);  // in mm

  // Drawing state for UI (mirrors ref for re-rendering)
  const [isDrawing, setIsDrawing] = useState(false);

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

      // Priority 2: Snap to existing snap points (endpoints, vertices, corners)
      for (const snapPoint of snapPointsRef.current) {
        const dist = Vector3.Distance(rawPoint, snapPoint);
        if (dist < snapThreshold) {
          return snapPoint.clone();
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

    // Create line with appropriate color (flat on ground plane at Y=0.01)
    const linePoints = [
      new Vector3(start.x, 0.01, start.z),
      new Vector3(constrainedEnd.x, 0.01, constrainedEnd.z)
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
      const y = 0.02;  // Slightly above ground

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
  const finalizeLine = useCallback((scene: Scene, start: Vector3, end: Vector3): Mesh => {
    const lineInf = lineInferenceRef.current;

    // Apply axis lock constraint
    const constrainedEnd = applyAxisLock(start, end, lineInf.axisLock);

    meshCounterRef.current++;

    // Set edge color based on current axis color
    let lineColor: Color3;
    switch (lineInf.axisColor) {
      case 'red':
        lineColor = new Color3(0.9, 0.2, 0.2);
        break;
      case 'green':
        lineColor = new Color3(0.2, 0.8, 0.2);
        break;
      case 'blue':
        lineColor = new Color3(0.3, 0.5, 1);
        break;
      case 'magenta':
        lineColor = new Color3(0.9, 0.3, 0.9);
        break;
      default:
        lineColor = new Color3(0.1, 0.1, 0.1);  // Dark gray/black for no inference
    }

    // Create flat line on ground plane (Y=0.01 to avoid z-fighting)
    const linePoints = [
      new Vector3(start.x, 0.01, start.z),
      new Vector3(constrainedEnd.x, 0.01, constrainedEnd.z)
    ];

    const edge = MeshBuilder.CreateLines(`Edge_${meshCounterRef.current}`, {
      points: linePoints,
      updatable: false
    }, scene);

    edge.color = lineColor;
    edge.isPickable = true;

    // Store edge metadata for future operations
    edge.metadata = {
      type: 'edge',
      startPoint: start.clone(),
      endPoint: constrainedEnd.clone()
    };

    // Store the endpoint for continuous drawing mode
    lineInf.lastEndpoint = constrainedEnd.clone();
    setLineInferenceUI(prev => ({ ...prev, lastEndpoint: constrainedEnd.clone() }));

    // Reset axis lock after finalizing (but keep continuous mode)
    lineInf.axisLock = 'none';
    lineInf.inferenceLocked = false;
    setLineInferenceUI(prev => ({ ...prev, axisLock: 'none', inferenceLocked: false }));

    return edge as unknown as Mesh;
  }, [applyAxisLock]);

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

    meshCounterRef.current++;
    const face = MeshBuilder.CreateGround(`Face_${meshCounterRef.current}`, {
      width,
      height: depth,
    }, scene);
    face.position = new Vector3(centerX, 0.01, centerZ);

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

    // Reset modifiers after finalizing
    const resetMods = {
      drawFromCenter: false,
      lockSquare: false,
      axisLock: 'none' as const,
    };
    shapeModifiersRef.current = resetMods;
    setShapeModifiersUI(resetMods);

    return face;
  }, [selectedColor]);

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
      disc.position = new Vector3(centerX, 0.01, centerZ);

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

    meshCounterRef.current++;
    const disc = MeshBuilder.CreateDisc(`Circle_${meshCounterRef.current}`, {
      radius: radius,
      tessellation: 48
    }, scene);
    disc.rotation.x = Math.PI / 2;
    disc.position = new Vector3(centerX, 0.01, centerZ);

    const faceMat = new StandardMaterial(`circleMat_${meshCounterRef.current}`, scene);
    faceMat.diffuseColor = Color3.FromHexString(selectedColor);
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    disc.material = faceMat;
    disc.enableEdgesRendering();
    disc.edgesWidth = 1.0;
    disc.edgesColor = new Color4(0.3, 0.3, 0.3, 1);

    // Store metadata
    (disc as any).faceData = {
      type: 'circle',
      centerX,
      centerZ,
      radius,
      originalY: 0.01,
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
  }, [selectedColor]);

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

      // Create polygon using disc with fewer tessellations
      const polygon = MeshBuilder.CreateDisc('previewPolygon', {
        radius: radius,
        tessellation: sides
      }, scene);
      polygon.rotation.x = Math.PI / 2;
      polygon.position = new Vector3(centerX, 0.01, centerZ);

      const mat = new StandardMaterial('previewPolygonMat', scene);

      if (mods.drawFromCenter && mods.lockSquare) {
        mat.diffuseColor = new Color3(0.9, 0.5, 0.9);
      } else if (mods.drawFromCenter) {
        mat.diffuseColor = new Color3(0.9, 0.6, 0.4);
      } else if (mods.lockSquare) {
        mat.diffuseColor = new Color3(0.4, 0.9, 0.5);
      } else {
        mat.diffuseColor = new Color3(0.4, 0.5, 0.9);
      }
      mat.alpha = 0.4;
      polygon.material = mat;
      polygon.isPickable = false;

      polygon.enableEdgesRendering();
      polygon.edgesWidth = 2.0;
      polygon.edgesColor = new Color4(0.4, 0.6, 1, 1);

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

    meshCounterRef.current++;
    const polygon = MeshBuilder.CreateDisc(`Polygon_${meshCounterRef.current}`, {
      radius: radius,
      tessellation: sides
    }, scene);
    polygon.rotation.x = Math.PI / 2;
    polygon.position = new Vector3(centerX, 0.01, centerZ);

    const faceMat = new StandardMaterial(`polygonMat_${meshCounterRef.current}`, scene);
    faceMat.diffuseColor = Color3.FromHexString(selectedColor);
    faceMat.specularColor = new Color3(0.2, 0.2, 0.2);
    polygon.material = faceMat;
    polygon.enableEdgesRendering();
    polygon.edgesWidth = 1.0;
    polygon.edgesColor = new Color4(0.3, 0.3, 0.3, 1);

    (polygon as any).faceData = {
      type: 'polygon',
      centerX,
      centerZ,
      radius,
      sides,
      originalY: 0.01,
    };

    const resetMods = {
      drawFromCenter: false,
      lockSquare: false,
      axisLock: 'none' as const,
    };
    shapeModifiersRef.current = resetMods;
    setShapeModifiersUI(resetMods);

    return polygon;
  }, [selectedColor]);

  // Add snap points for line (start and end points)
  const addLineSnapPoints = useCallback((start: Vector3, end: Vector3) => {
    const newPoints = [
      new Vector3(start.x, 0, start.z),
      new Vector3(end.x, 0, end.z),
    ];

    newPoints.forEach(point => {
      // Check if point already exists
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p, point) < 0.1);
      if (!exists) {
        snapPointsRef.current.push(point);
      }
    });
  }, []);

  // Add snap points for rectangle (4 corners)
  const addRectangleSnapPoints = useCallback((start: Vector3, end: Vector3) => {
    const corners = [
      new Vector3(start.x, 0, start.z),
      new Vector3(end.x, 0, start.z),
      new Vector3(end.x, 0, end.z),
      new Vector3(start.x, 0, end.z),
    ];

    corners.forEach(corner => {
      const exists = snapPointsRef.current.some(p => Vector3.Distance(p, corner) < 0.1);
      if (!exists) {
        snapPointsRef.current.push(corner);
      }
    });
  }, []);

  // Snap indicator ref for GUI element (screen-space, fixed size)
  const snapDotRef = useRef<Ellipse | null>(null);

  // Show snap indicator - GUI dot at screen position (fixed size, doesn't scale with zoom)
  const showSnapIndicator = useCallback((position: Vector3) => {
    const scene = sceneRef.current;
    const guiTexture = guiTextureRef.current;
    if (!scene || !guiTexture) return;

    // Create snap dot GUI element if it doesn't exist
    if (!snapDotRef.current) {
      const dot = new Ellipse('snapDot');
      dot.width = '10px';
      dot.height = '10px';
      dot.color = '#90EE90';  // Light green border
      dot.thickness = 2;
      dot.background = '#FFFFFF';  // White fill
      dot.isVisible = false;
      guiTexture.addControl(dot);
      snapDotRef.current = dot;
    }

    // Convert 3D position to screen coordinates
    const engine = scene.getEngine();
    const camera = cameraRef.current;
    if (!camera) return;

    const screenPos = Vector3.Project(
      new Vector3(position.x, 0, position.z),
      Matrix.Identity(),
      scene.getTransformMatrix(),
      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
    );

    // Position the dot at screen coordinates
    snapDotRef.current.left = screenPos.x - engine.getRenderWidth() / 2;
    snapDotRef.current.top = screenPos.y - engine.getRenderHeight() / 2;
    snapDotRef.current.isVisible = true;

    // Also change HUD cursor color
    const pointerCircle = pointerCircleRef.current;
    if (pointerCircle) {
      pointerCircle.color = 'rgba(0, 255, 136, 0.9)';
      pointerCircle.background = 'rgba(0, 255, 136, 0.4)';
    }
  }, []);

  // Hide snap indicator - hide GUI dot
  const hideSnapIndicator = useCallback(() => {
    if (snapDotRef.current) {
      snapDotRef.current.isVisible = false;
    }

    // Reset HUD color
    const pointerCircle = pointerCircleRef.current;
    if (pointerCircle) {
      pointerCircle.color = 'rgba(0, 122, 255, 0.9)';
      pointerCircle.background = 'rgba(0, 122, 255, 0.3)';
    }
  }, []);

  // Find nearest snap point to a position (uses dynamic threshold based on camera distance)
  const findNearestSnapPoint = useCallback((position: Vector3): Vector3 | null => {
    const camera = cameraRef.current;
    // Dynamic threshold: scales with camera distance for consistent "screen feel"
    // When zoomed out (large radius), larger threshold; when zoomed in, smaller threshold
    // Minimum of 1.0 world units ensures snap works well even when zoomed in very close
    const snapThreshold = camera ? Math.max(camera.radius * SNAP_THRESHOLD_BASE, 1.0) : 2.0;

    let nearest: Vector3 | null = null;
    let minDist = snapThreshold;

    // Check origin first (highest priority snap point)
    const distToOrigin = Vector3.Distance(position, Vector3.Zero());
    if (distToOrigin < minDist) {
      minDist = distToOrigin;
      nearest = Vector3.Zero();
    }

    // Check all snap points (endpoints, vertices, etc.)
    for (const snapPoint of snapPointsRef.current) {
      const dist = Vector3.Distance(position, snapPoint);
      if (dist < minDist) {
        minDist = dist;
        nearest = snapPoint;
      }
    }

    return nearest;
  }, []);

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

    // Origin marker - no longer used, snap indicator will show when hovering near origin
    // Keeping the ref for backward compatibility but not creating visible marker
    originMarkerRef.current = null;

    // Snap indicator - GUI dot created on demand in showSnapIndicator
    snapDotRef.current = null;

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

  // Update HUD pointer circle visibility based on active tool
  useEffect(() => {
    const scene = sceneRef.current;
    const pointerCircle = pointerCircleRef.current;
    if (!scene || !pointerCircle) return;

    // Drawing tools that should show the HUD pointer circle
    const isDrawingTool = ['line', 'rectangle', 'circle', 'polygon', 'arc', 'freehand'].includes(activeTool);
    pointerCircle.isVisible = isDrawingTool;

    // Set up pointer move observer for HUD position update
    const observer = scene.onPointerObservable.add((pointerInfo) => {
      if (!pointerCircle.isVisible) return;
      // Filter for move events (type 4 is POINTERMOVE)
      if (pointerInfo.type !== 4) return;

      // Get screen position from pointer info
      const screenX = scene.pointerX;
      const screenY = scene.pointerY;

      // Update HUD circle position - offset to appear at cursor tip (pencil point)
      // The pencil cursor hotspot is at bottom-left, so offset circle to that position
      // Offset by half the circle size to center it on the cursor tip
      pointerCircle.left = screenX - 8;  // Center horizontally on cursor
      pointerCircle.top = screenY - 8;   // Center vertically on cursor
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

    // Clear pushpull face highlight when switching away from pushpull tool
    if (activeTool !== 'pushpull' && hoveredFaceRef.current && highlightLayerRef.current) {
      highlightLayerRef.current.removeMesh(hoveredFaceRef.current);
      hoveredFaceRef.current = null;
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

      // Line tool with continuous drawing mode
      if (activeTool === 'line') {
        const lineInf = lineInferenceRef.current;
        // Use active snap point if available, otherwise get ground point
        const rawPoint = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        const point = activeSnapPointRef.current ? activeSnapPointRef.current.clone() : rawPoint;
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
        const point = activeSnapPointRef.current ? activeSnapPointRef.current.clone() : rawPoint;
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

      // Show/hide snap indicator for drawing tools (SketchUp style)
      // Also save active snap point for use in click handling
      // IMPORTANT: Use RAW coordinates for snap detection, not pre-rounded coordinates
      // This ensures snap works like a magnet based on actual cursor proximity
      if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon') {
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh.name === 'groundPicker');
        if (pickResult?.hit && pickResult.pickedPoint) {
          // Use RAW coordinates for snap detection (not rounded)
          // This makes snap feel magnetic - cursor pulls to nearby points
          const rawPoint = new Vector3(
            pickResult.pickedPoint.x,
            0,
            pickResult.pickedPoint.z
          );
          const nearestSnap = findNearestSnapPoint(rawPoint);
          if (nearestSnap) {
            activeSnapPointRef.current = nearestSnap.clone();  // Save for click handling
            showSnapIndicator(nearestSnap);
          } else {
            activeSnapPointRef.current = null;  // Clear when no snap
            hideSnapIndicator();
          }
        } else {
          activeSnapPointRef.current = null;
          hideSnapIndicator();
        }
      } else if (activeTool === 'pushpull') {
        // Push/pull tool: highlight face on hover (SketchUp-style)
        activeSnapPointRef.current = null;
        hideSnapIndicator();

        // Pick faces to highlight
        const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => {
          return mesh.metadata?.type === 'face';
        });

        if (pickResult?.hit && pickResult.pickedMesh && highlightLayerRef.current) {
          const hoveredMesh = pickResult.pickedMesh as Mesh;

          // Only update if hovering different face
          if (hoveredFaceRef.current !== hoveredMesh) {
            // Remove previous highlight
            if (hoveredFaceRef.current) {
              highlightLayerRef.current.removeMesh(hoveredFaceRef.current);
            }
            // Add new highlight (blue like SketchUp)
            highlightLayerRef.current.addMesh(hoveredMesh, new Color3(0.4, 0.6, 1));
            hoveredFaceRef.current = hoveredMesh;
          }
        } else {
          // Not hovering over a face - clear highlight
          if (hoveredFaceRef.current && highlightLayerRef.current) {
            highlightLayerRef.current.removeMesh(hoveredFaceRef.current);
            hoveredFaceRef.current = null;
          }
        }
      } else {
        // Hide snap indicator when not using other tools
        activeSnapPointRef.current = null;
        hideSnapIndicator();
      }

      const state = drawingStateRef.current;
      if (!state.isDrawing || !state.startPoint) return;

      // Use active snap point if available for drawing previews
      const getSnappedPoint = () => {
        const rawPoint = getGroundPoint(scene, scene.pointerX, scene.pointerY);
        return activeSnapPointRef.current ? activeSnapPointRef.current.clone() : rawPoint;
      };

      if (activeTool === 'line') {
        const point = getSnappedPoint();
        if (point) {
          state.currentPoint = point;
          updatePreviewLine(scene, state.startPoint, point);
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
    };

    const handlePointerUp = (evt: PointerEvent) => {
      // Reset pan state
      if (activeTool === 'pan') {
        panStateRef.current.isPanning = false;
        return;
      }

      if (evt.button !== 0) return;

      // Line, rectangle, circle, polygon, and push/pull use click-click (SketchUp style), not drag
      // So don't finalize on mouse up for those tools
      if (activeTool === 'line' || activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon' || activeTool === 'pushpull') {
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
  }, [activeTool, selectedColor, getGroundPoint, updatePreviewLine, updatePreviewRectangle, updatePreviewCircle, updatePreviewPolygon, finalizeLine, finalizeRectangle, finalizeCircle, finalizePolygon, applyPushPull, zoomExtents, addLineSnapPoints, addRectangleSnapPoints, showSnapIndicator, hideSnapIndicator, findNearestSnapPoint]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      // Line tool modifiers
      if (activeTool === 'line') {
        // Shift key: Lock current inference (while held)
        if (e.key === 'Shift') {
          e.preventDefault();
          lineInferenceRef.current.inferenceLocked = true;
          setLineInferenceUI(prev => ({ ...prev, inferenceLocked: true }));
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
          };
          lineInferenceRef.current = resetLineInf;
          setLineInferenceUI(resetLineInf);
          setLineMeasurement(0);
          deselectMesh();
          setActiveTool('select');
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Release Shift key: Unlock shape constraint (rectangle/circle/polygon)
      if (e.key === 'Shift' && (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'polygon')) {
        shapeModifiersRef.current.lockSquare = false;
        setShapeModifiersUI(prev => ({ ...prev, lockSquare: false }));
      }
      // Release Shift key: Unlock inference lock (line tool)
      if (e.key === 'Shift' && activeTool === 'line') {
        lineInferenceRef.current.inferenceLocked = false;
        setLineInferenceUI(prev => ({ ...prev, inferenceLocked: false }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedMesh, zoomExtents, activeTool]);

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
    { type: 'divider' },
    { id: 'line', icon: <LuPencilLine size={18} />, title: 'Line (L)' },
    { id: 'eraser', icon: <BsEraser size={18} />, title: 'Eraser (E)' },
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
    { id: 'pan', icon: <IoHandRightOutline size={18} />, title: 'Pan (H)' },
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
              <IoHandRightOutline size={16} />
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
              } else if (e.key === 'Escape') {
                setMeasurementInput('');
                measureInputRef.current?.blur();
              }
              e.stopPropagation();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default CustomModelingPage;
