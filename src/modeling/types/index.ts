/**
 * Core types for the modeling system
 */

import { Scene, Mesh, Vector3, ArcRotateCamera, PointerInfo } from '@babylonjs/core';
import { HalfEdgeMesh } from '../core/kernel';

// ============================================
// Tool System Types
// ============================================

export type ToolType =
  | 'select'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'polygon'
  | 'pushpull'
  | 'offset'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'eraser'
  | 'paint'
  | 'text'
  | 'orbit'
  | 'pan'
  | 'zoom';

export interface ToolContext {
  scene: Scene;
  camera: ArcRotateCamera | null;
  canvas: HTMLCanvasElement | null;

  // Geometry kernel (half-edge mesh for topology)
  kernel: HalfEdgeMesh;

  // Snap system
  snapSystem: ISnapSystem;

  // Selection system
  selectionSystem: ISelectionSystem;

  // Scene management
  getAllMeshes: () => Mesh[];
  getAllFaces: () => Mesh[];
  getAllEdges: () => Mesh[];
  getAllSolids: () => Mesh[];

  // UI callbacks
  setStatusText: (text: string) => void;
  showSnapIndicator: (type: SnapType) => void;
  hideSnapIndicator: () => void;
  setInputValue: (value: string) => void;

  // Entity creation
  createFace: (vertices: Vector3[], options?: FaceOptions) => Mesh | null;
  createEdge: (start: Vector3, end: Vector3, options?: EdgeOptions) => Mesh | null;
  createSolid: (baseVertices: Vector3[], height: number, options?: SolidOptions) => Mesh | null;

  // Entity modification
  deleteMesh: (mesh: Mesh) => void;
  updateMesh: (mesh: Mesh, vertices: Vector3[]) => void;
}

export interface BaseTool {
  name: ToolType;
  cursor: string;

  // Lifecycle
  activate(context: ToolContext): void;
  deactivate(): void;
  reset(): void;

  // Input handling
  onPointerDown(info: PointerInfo, pickResult: PickResultInfo): void;
  onPointerMove(info: PointerInfo, pickResult: PickResultInfo): void;
  onPointerUp(info: PointerInfo, pickResult: PickResultInfo): void;
  onKeyDown(event: KeyboardEvent): void;
  onKeyUp(event: KeyboardEvent): void;

  // Value input (for numeric input like "1000,500")
  onValueInput(value: string): boolean;

  // State
  isActive(): boolean;
  getState(): unknown;
}

export interface PickResultInfo {
  hit: boolean;
  pickedPoint: Vector3 | null;
  pickedMesh: Mesh | null;
  faceId?: number;
  distance?: number;

  // Snapped info
  snapped: boolean;
  snapType: SnapType | null;
  snapPoint: Vector3 | null;
}

// ============================================
// Snap System Types
// ============================================

export type SnapType =
  | 'endpoint'
  | 'midpoint'
  | 'intersection'
  | 'perpendicular'
  | 'parallel'
  | 'onEdge'
  | 'onFace'
  | 'origin'
  | 'axis'
  | 'grid';

export interface SnapResult {
  snapped: boolean;
  point: Vector3;
  type: SnapType | null;
  reference?: Mesh | null;
  distance?: number;
}

export interface SnapOptions {
  enableEndpoint?: boolean;
  enableMidpoint?: boolean;
  enableIntersection?: boolean;
  enablePerpendicular?: boolean;
  enableParallel?: boolean;
  enableOnEdge?: boolean;
  enableOnFace?: boolean;
  enableOrigin?: boolean;
  enableAxis?: boolean;
  enableGrid?: boolean;
  threshold?: number;
  excludeMeshes?: Mesh[];
}

export interface ISnapSystem {
  snap(point: Vector3, options?: SnapOptions): SnapResult;
  getSnapThreshold(): number;
  setSnapThreshold(threshold: number): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;

  // Inference engine (SketchUp-style)
  addInferencePoint(point: Vector3, type: string): void;
  clearInferencePoints(): void;
  getInferenceLines(): { start: Vector3; end: Vector3; type: string }[];
}

// ============================================
// Selection System Types
// ============================================

export type SelectionMode = 'single' | 'multiple' | 'add' | 'subtract';

export interface SelectionInfo {
  meshes: Mesh[];
  faces: Mesh[];
  edges: Mesh[];
  vertices: Vector3[];
}

export interface ISelectionSystem {
  select(mesh: Mesh, mode?: SelectionMode): void;
  deselect(mesh: Mesh): void;
  clear(): void;
  toggle(mesh: Mesh): void;

  getSelection(): SelectionInfo;
  isSelected(mesh: Mesh): boolean;
  hasSelection(): boolean;
  getSelectedCount(): number;

  // Box selection
  startBoxSelect(startPoint: { x: number; y: number }): void;
  updateBoxSelect(currentPoint: { x: number; y: number }): void;
  endBoxSelect(): Mesh[];

  // Events
  onSelectionChange(callback: (selection: SelectionInfo) => void): () => void;
}

// ============================================
// Entity Types
// ============================================

export interface FaceOptions {
  color?: string;
  opacity?: number;
  metadata?: Record<string, unknown>;
}

export interface EdgeOptions {
  color?: string;
  width?: number;
  dashed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SolidOptions {
  faceColor?: string;
  edgeColor?: string;
  metadata?: Record<string, unknown>;
}

export interface EntityMetadata {
  type: 'face' | 'edge' | 'solid' | 'vertex' | 'group';
  id: string;
  parentId?: string;
  vertices?: Vector3[];
  faceNormal?: Vector3;
  faceDir?: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
  createdAt: number;
  modifiedAt: number;
}

// ============================================
// Tool-Specific Types
// ============================================

export interface LineToolState {
  isDrawing: boolean;
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  previewLine: Mesh | null;
  inferenceAxis: 'x' | 'y' | 'z' | null;
}

export interface RectangleToolState {
  isDrawing: boolean;
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  previewMesh: Mesh | null;
  drawingPlane: 'xz' | 'xy' | 'yz';
}

export interface PushPullToolState {
  isExtruding: boolean;
  baseFace: Mesh | null;
  baseFaceCenter: Vector3 | null;
  baseFaceNormal: Vector3 | null;
  baseFaceVertices: Vector3[];
  startY: number;
  currentDistance: number;
  previewMesh: Mesh | null;
  isSnapped: boolean;
  snapDistance: number | null;
  parentSolid: Mesh | null;
}

export interface OffsetToolState {
  isOffsetting: boolean;
  baseFace: Mesh | null;
  baseFaceCenter: Vector3 | null;
  baseFaceVertices: Vector3[];
  currentDistance: number;
  previewLines: Mesh[];
}

export interface MoveToolState {
  isMoving: boolean;
  selectedMeshes: Mesh[];
  startPoint: Vector3 | null;
  currentOffset: Vector3;
  previewMeshes: Mesh[];
  copyMode: boolean;
}

export interface RotateToolState {
  isRotating: boolean;
  selectedMeshes: Mesh[];
  center: Vector3 | null;
  startAngle: number;
  currentAngle: number;
  axis: Vector3;
  previewMeshes: Mesh[];
  copyMode: boolean;
}
