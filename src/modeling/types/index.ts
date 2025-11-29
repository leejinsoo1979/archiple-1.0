/**
 * SketchUp-style Modeling Types
 * Core type definitions for geometry, inference, and tools
 */

import { Vector3, Color3 } from '@babylonjs/core';

// ============================================================================
// GEOMETRY TYPES
// ============================================================================

/** Unique identifier for geometry elements */
export type GeometryId = string;

/** Vertex in 3D space with metadata */
export interface Vertex {
  id: GeometryId;
  position: Vector3;
  connectedEdges: GeometryId[];
  createdAt: number;
  isConstruction: boolean;
}

/** Edge connecting two vertices */
export interface Edge {
  id: GeometryId;
  startVertexId: GeometryId;
  endVertexId: GeometryId;
  connectedFaces: GeometryId[];
  isConstruction: boolean;
  isSoft: boolean;
  isSmooth: boolean;
  isHidden: boolean;
  createdAt: number;
}

/** Face defined by ordered edges */
export interface Face {
  id: GeometryId;
  edgeIds: GeometryId[];
  normal: Vector3;
  material?: string;
  isHidden: boolean;
  createdAt: number;
}

/** Geometry operation for undo/redo */
export interface GeometryOperation {
  type: 'add_vertex' | 'add_edge' | 'add_face' | 'delete_vertex' | 'delete_edge' | 'delete_face' | 'modify_vertex';
  timestamp: number;
  data: {
    vertices?: Vertex[];
    edges?: Edge[];
    faces?: Face[];
    previousState?: Partial<Vertex | Edge | Face>;
  };
}

// ============================================================================
// INFERENCE TYPES
// ============================================================================

/** Point inference types (SketchUp documentation compliant) */
export type PointInferenceType =
  | 'origin'           // Green dot - Origin point (0,0,0)
  | 'endpoint'         // Green dot - Edge endpoint
  | 'midpoint'         // Cyan dot - Edge midpoint
  | 'arc_midpoint'     // Cyan dot - Arc midpoint
  | 'intersection'     // Black dot - Edge/edge or edge/face intersection
  | 'on_face'          // Blue square - Point on face
  | 'on_edge'          // Red square - Point on edge
  | 'guide_point'      // Red X - Construction point
  | 'center'           // Green dot - Circle/arc center
  | 'quarter_point';   // Cyan dot - Quarter point on arc

/** Linear inference types */
export type LinearInferenceType =
  | 'on_red_axis'      // Red line - Parallel to X axis
  | 'on_green_axis'    // Green line - Parallel to Y axis (SketchUp Z)
  | 'on_blue_axis'     // Blue line - Parallel to Z axis (SketchUp Y)
  | 'from_point'       // Dashed line from reference point
  | 'through_point'    // Line through reference point
  | 'parallel'         // Magenta - Parallel to edge
  | 'perpendicular'    // Magenta - Perpendicular to edge
  | 'tangent'          // Arc tangent
  | 'extend_edge';     // Edge extension line

/** Shape inference types */
export type ShapeInferenceType =
  | 'square'           // Rectangle with equal sides
  | 'golden_section'   // Golden ratio rectangle
  | 'half_circle'      // Arc is half circle
  | 'quarter_circle'   // Arc is quarter circle
  | 'three_quarter';   // Arc is three-quarter circle

/** Complete inference result */
export interface Inference {
  type: 'point' | 'linear' | 'shape';
  subType: PointInferenceType | LinearInferenceType | ShapeInferenceType;
  position: Vector3;
  direction?: Vector3;           // For linear inferences
  referenceGeometry?: GeometryId; // Source geometry
  color: Color3;
  screenTip: string;             // Text to display
  priority: number;              // Higher = more important
  isLocked: boolean;             // User-locked inference
}

/** Inference lock modes */
export type InferenceLockAxis = 'none' | 'red' | 'green' | 'blue' | 'magenta';

/** Linear inferencing toggle mode */
export type LinearInferenceMode = 'all_on' | 'all_off' | 'parallel_perpendicular_only';

/** Inference engine state */
export interface InferenceState {
  activeInferences: Inference[];
  lockedAxis: InferenceLockAxis;
  lockedInference: Inference | null;
  linearMode: LinearInferenceMode;
  planeLock: 'none' | 'red' | 'green' | 'blue';
}

// ============================================================================
// INFERENCE COLORS (SketchUp exact colors)
// ============================================================================

export const INFERENCE_COLORS = {
  // Axis colors
  RED_AXIS: new Color3(1, 0, 0),
  GREEN_AXIS: new Color3(0, 0.5, 0),
  BLUE_AXIS: new Color3(0, 0, 1),

  // Point inference colors
  ORIGIN: new Color3(0, 0.5, 0),          // Dark green
  ENDPOINT: new Color3(0, 0.8, 0),        // Green
  MIDPOINT: new Color3(0, 0.8, 0.8),      // Cyan
  INTERSECTION: new Color3(0.1, 0.1, 0.1), // Black
  ON_FACE: new Color3(0, 0, 0.8),         // Blue
  ON_EDGE: new Color3(0.8, 0, 0),         // Red
  GUIDE_POINT: new Color3(0.8, 0, 0),     // Red
  CENTER: new Color3(0, 0.8, 0),          // Green

  // Linear inference colors
  PARALLEL: new Color3(0.9, 0, 0.9),      // Magenta
  PERPENDICULAR: new Color3(0.9, 0, 0.9), // Magenta
  FROM_POINT: new Color3(0.5, 0.5, 0.5),  // Gray (dashed)

  // Shape inference
  GOLDEN_SECTION: new Color3(0, 0.8, 0.8), // Cyan

  // Default
  DEFAULT: new Color3(0.3, 0.3, 0.3),
} as const;

// ============================================================================
// TOOL TYPES
// ============================================================================

/** Tool state for Line Tool */
export interface LineToolState {
  isActive: boolean;
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  previewPoints: Vector3[];
  measurements: {
    length: number;
    angle: number;
  };
  inputMode: 'length' | 'absolute' | 'relative' | 'none';
  pendingInput: string;
}

/** Measurement input format */
export interface MeasurementInput {
  type: 'length' | 'absolute' | 'relative';
  value: number | Vector3;
  unit: 'mm' | 'm' | 'cm' | 'in' | 'ft';
  raw: string;
}

/** Parsed coordinate input */
export interface CoordinateInput {
  isAbsolute: boolean;  // [x, y, z] format
  isRelative: boolean;  // <x, y, z> format
  values: { x: number; y: number; z: number };
}

// ============================================================================
// HUD/SCREEN TIP TYPES
// ============================================================================

/** Screen tip display data */
export interface ScreenTip {
  text: string;
  position: { x: number; y: number };
  color: string;
  icon?: 'dot' | 'square' | 'x' | 'line';
  visible: boolean;
}

/** Measurements box display */
export interface MeasurementsBoxState {
  visible: boolean;
  value: string;
  placeholder: string;
  isEditing: boolean;
  inputType: 'length' | 'coordinates' | 'angle';
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/** Tool events */
export type ToolEventType =
  | 'tool_activated'
  | 'tool_deactivated'
  | 'point_clicked'
  | 'point_moved'
  | 'edge_created'
  | 'face_created'
  | 'inference_changed'
  | 'measurement_entered';

export interface ToolEvent {
  type: ToolEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function generateId(): GeometryId {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function vectorToString(v: Vector3, precision: number = 2): string {
  return `[${v.x.toFixed(precision)}, ${v.y.toFixed(precision)}, ${v.z.toFixed(precision)}]`;
}

export function formatLength(mm: number, unit: 'mm' | 'm' | 'cm' = 'mm'): string {
  switch (unit) {
    case 'm': return `${(mm / 1000).toFixed(3)}m`;
    case 'cm': return `${(mm / 10).toFixed(2)}cm`;
    default: return `${Math.round(mm)}mm`;
  }
}

export function parseLength(input: string): number | null {
  const trimmed = input.trim().toLowerCase();

  // Match number with optional unit
  const match = trimmed.match(/^(-?\d+\.?\d*)\s*(mm|m|cm|in|ft|'|")?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'mm';

  switch (unit) {
    case 'm': return value * 1000;
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
    case 'ft':
    case "'": return value * 304.8;
    case '"': return value * 25.4;
    default: return value;
  }
}

export function parseCoordinates(input: string): CoordinateInput | null {
  const trimmed = input.trim();

  // Absolute coordinates: [x, y, z]
  const absoluteMatch = trimmed.match(/^\[([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\]$/);
  if (absoluteMatch) {
    return {
      isAbsolute: true,
      isRelative: false,
      values: {
        x: parseFloat(absoluteMatch[1]),
        y: parseFloat(absoluteMatch[2]),
        z: parseFloat(absoluteMatch[3]),
      },
    };
  }

  // Relative coordinates: <x, y, z>
  const relativeMatch = trimmed.match(/^<([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)>$/);
  if (relativeMatch) {
    return {
      isAbsolute: false,
      isRelative: true,
      values: {
        x: parseFloat(relativeMatch[1]),
        y: parseFloat(relativeMatch[2]),
        z: parseFloat(relativeMatch[3]),
      },
    };
  }

  return null;
}
