/**
 * BaseTool - Abstract base class for all SketchUp-style drawing tools
 *
 * Provides common functionality:
 * - Pointer/keyboard event handling
 * - Inference engine integration
 * - Preview mesh management
 * - Measurements Box integration
 * - State management
 */

import {
  Scene,
  Vector3,
  Color3,
  AbstractMesh,
  PointerInfo,
  PointerEventTypes,
  Observer,
  KeyboardEventTypes,
  KeyboardInfo,
  Mesh,
  StandardMaterial,
  MeshBuilder,
} from '@babylonjs/core';
import { InferenceEngine } from '../inference/InferenceEngine';
import type { InferenceResult } from '../inference/InferenceEngine';
import { LockController } from '../inference/LockController';
import type { LockState } from '../inference/LockController';
import { useGeometryStore } from '../stores/geometryStore';
import { useInferenceStore } from '../stores/inferenceStore';
import type { MeasurementResult } from '../ui/MeasurementsBox';
import { INFERENCE_COLORS } from '../types';

// ============================================================================
// TOOL TYPES
// ============================================================================

export type ToolType = 'line' | 'rectangle' | 'rotated_rectangle' | 'circle' | 'polygon' | 'select' | 'push_pull' | 'move' | 'rotate' | 'scale';

export interface ToolState {
  isActive: boolean;
  phase: 'idle' | 'first_point' | 'second_point' | 'third_point' | 'complete';
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  endPoint: Vector3 | null;
  inferenceResult: InferenceResult | null;
  escapeCount: number;
}

export interface BaseToolConfig {
  scene: Scene;
  groundMesh?: AbstractMesh;
  onToolActivated?: () => void;
  onToolDeactivated?: () => void;
  onStateChange?: (state: ToolState) => void;
  onShapeCreated?: (shapeData: ShapeCreatedEvent) => void;
}

export interface ShapeCreatedEvent {
  type: ToolType;
  vertices: Vector3[];
  edgeIds: string[];
  faceId?: string;
}

// ============================================================================
// GOLDEN RATIO CONSTANT
// ============================================================================

export const GOLDEN_RATIO = 1.618033988749895;
export const GOLDEN_RATIO_TOLERANCE = 0.02; // 2% tolerance

// ============================================================================
// BASE TOOL CLASS
// ============================================================================

export abstract class BaseTool {
  protected scene: Scene;
  protected config: BaseToolConfig;
  protected state: ToolState;

  // Inference system
  protected inferenceEngine: InferenceEngine;
  protected lockController: LockController;

  // Observers
  protected pointerObserver: Observer<PointerInfo> | null = null;
  protected keyboardObserver: Observer<KeyboardInfo> | null = null;

  // Visual elements
  protected previewMeshes: Mesh[] = [];
  protected markerMeshes: Mesh[] = [];
  protected previewMaterial: StandardMaterial | null = null;
  protected markerMaterial: StandardMaterial | null = null;

  // Tool identity
  public abstract readonly toolType: ToolType;
  public abstract readonly hotkey: string;
  public abstract readonly displayName: string;

  constructor(config: BaseToolConfig) {
    this.scene = config.scene;
    this.config = config;

    this.state = {
      isActive: false,
      phase: 'idle',
      startPoint: null,
      currentPoint: null,
      endPoint: null,
      inferenceResult: null,
      escapeCount: 0,
    };

    // Initialize inference system
    this.inferenceEngine = new InferenceEngine({ scene: this.scene });
    this.lockController = new LockController({
      inferenceEngine: this.inferenceEngine,
      onStateChange: this.handleLockStateChange.bind(this),
    });

    // Create materials
    this.createMaterials();
  }

  // ========== ABSTRACT METHODS (to be implemented by subclasses) ==========

  /**
   * Handle pointer move - update preview
   */
  protected abstract onPointerMove(position: Vector3, inferenceResult: InferenceResult): void;

  /**
   * Handle click at current position
   */
  protected abstract onClick(position: Vector3): void;

  /**
   * Apply measurement input from Measurements Box
   */
  public abstract applyMeasurement(result: MeasurementResult): void;

  /**
   * Get current measurements for display
   */
  public abstract getCurrentMeasurements(): { primary: string; secondary?: string; inputType: string };

  /**
   * Reset tool to initial state (cancel current operation)
   */
  protected abstract resetTool(): void;

  /**
   * Finalize the current shape
   */
  protected abstract finalizeShape(): void;

  // ========== PUBLIC API ==========

  /**
   * Activate the tool
   */
  public activate(): void {
    if (this.state.isActive) return;

    this.state.isActive = true;
    this.state.phase = 'idle';
    this.state.escapeCount = 0;

    // Attach observers
    this.attachPointerObserver();
    this.attachKeyboardObserver();
    this.lockController.attach();

    // Update cursor
    this.setCursor('crosshair');

    this.config.onToolActivated?.();
    this.notifyStateChange();
  }

  /**
   * Deactivate the tool
   */
  public deactivate(): void {
    if (!this.state.isActive) return;

    // Clean up
    this.resetTool();
    this.detachObservers();
    this.lockController.detach();
    this.disposePreviewMeshes();
    this.disposeMarkerMeshes();

    // Reset state
    this.state.isActive = false;
    this.state.phase = 'idle';
    this.inferenceEngine.reset();

    // Reset cursor
    this.setCursor('default');

    this.config.onToolDeactivated?.();
    this.notifyStateChange();
  }

  /**
   * Check if tool is active
   */
  public isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get current state
   */
  public getState(): ToolState {
    return { ...this.state };
  }

  // ========== POINTER HANDLING ==========

  protected attachPointerObserver(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((info) => {
      if (!this.state.isActive) return;

      switch (info.type) {
        case PointerEventTypes.POINTERMOVE:
          this.handlePointerMove(info);
          break;
        case PointerEventTypes.POINTERDOWN:
          if (info.event.button === 0) { // Left click
            this.handleClick(info);
          }
          break;
      }
    });
  }

  protected handlePointerMove(info: PointerInfo): void {
    // Get 3D position from pointer
    const pickResult = this.scene.pick(
      info.event.offsetX,
      info.event.offsetY,
      (mesh) => mesh === this.config.groundMesh || mesh.name.startsWith('face_'),
      false
    );

    if (!pickResult?.hit || !pickResult.pickedPoint) return;

    const cursorPos = pickResult.pickedPoint;

    // Run inference engine
    const inferenceResult = this.inferenceEngine.detectInferences(
      cursorPos,
      this.state.startPoint
    );

    this.state.inferenceResult = inferenceResult;
    this.state.currentPoint = inferenceResult.position;

    // Update inference store for UI
    this.updateInferenceStore(inferenceResult, info.event.offsetX, info.event.offsetY);

    // Call subclass handler
    this.onPointerMove(inferenceResult.position, inferenceResult);

    this.notifyStateChange();
  }

  protected handleClick(info: PointerInfo): void {
    const clickPoint = this.state.inferenceResult?.position ||
                       this.state.currentPoint;

    if (!clickPoint) return;

    // Reset escape counter on click
    this.state.escapeCount = 0;

    // Call subclass handler
    this.onClick(clickPoint);
  }

  // ========== KEYBOARD HANDLING ==========

  protected attachKeyboardObserver(): void {
    this.keyboardObserver = this.scene.onKeyboardObservable.add((info) => {
      if (!this.state.isActive) return;
      if (info.type !== KeyboardEventTypes.KEYDOWN) return;

      // Don't handle if input is focused
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return;
      }

      switch (info.event.key) {
        case 'Escape':
          this.handleEscape();
          break;
      }
    });
  }

  protected handleEscape(): void {
    if (this.state.phase !== 'idle') {
      // Cancel current operation
      this.resetTool();
      this.state.escapeCount = 1;
    } else if (this.state.escapeCount >= 1) {
      // Second escape: Deactivate tool
      this.deactivate();
    } else {
      this.state.escapeCount++;
    }
    this.notifyStateChange();
  }

  protected handleLockStateChange(lockState: LockState): void {
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setLockedAxis(lockState.axisLock);
    inferenceStore.setShiftHeld(lockState.shiftHeld);
    inferenceStore.setLinearMode(lockState.linearMode);
    this.notifyStateChange();
  }

  // ========== VISUAL HELPERS ==========

  protected createMaterials(): void {
    // Preview material (semi-transparent)
    this.previewMaterial = new StandardMaterial('previewMat', this.scene);
    this.previewMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
    this.previewMaterial.alpha = 0.5;
    this.previewMaterial.backFaceCulling = false;

    // Marker material (green for start point)
    this.markerMaterial = new StandardMaterial('markerMat', this.scene);
    this.markerMaterial.diffuseColor = INFERENCE_COLORS.ENDPOINT;
    this.markerMaterial.emissiveColor = INFERENCE_COLORS.ENDPOINT.scale(0.5);
  }

  protected createPointMarker(position: Vector3, color: Color3 = INFERENCE_COLORS.ENDPOINT): Mesh {
    const marker = MeshBuilder.CreateSphere(
      `marker_${Date.now()}`,
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    marker.position = position.clone();
    marker.isPickable = false;

    const mat = new StandardMaterial(`markerMat_${Date.now()}`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.5);
    marker.material = mat;

    this.markerMeshes.push(marker);
    return marker;
  }

  protected disposePreviewMeshes(): void {
    for (const mesh of this.previewMeshes) {
      mesh.dispose();
    }
    this.previewMeshes = [];
  }

  protected disposeMarkerMeshes(): void {
    for (const mesh of this.markerMeshes) {
      mesh.material?.dispose();
      mesh.dispose();
    }
    this.markerMeshes = [];
  }

  // ========== INFERENCE STORE UPDATE ==========

  protected updateInferenceStore(result: InferenceResult, screenX: number, screenY: number): void {
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setCursorPosition(result.position);
    inferenceStore.setSnappedPosition(result.position);
    inferenceStore.setActiveInferences(result.inferences);
    inferenceStore.setPrimaryInference(result.primaryInference);
    inferenceStore.setScreenTip({
      text: result.screenTip,
      position: { x: screenX, y: screenY },
      visible: !!result.primaryInference,
    });
  }

  // ========== GEOMETRY CREATION HELPERS ==========

  protected createEdge(start: Vector3, end: Vector3): { edgeId: string; startVertexId: string; endVertexId: string } | null {
    const geometryStore = useGeometryStore.getState();

    const startVertex = geometryStore.findVertexOrCreate(start);
    const endVertex = geometryStore.findVertexOrCreate(end);

    const edge = geometryStore.addEdge(startVertex.id, endVertex.id, false);

    if (!edge) return null;

    return {
      edgeId: edge.id,
      startVertexId: startVertex.id,
      endVertexId: endVertex.id,
    };
  }

  protected createEdgesFromVertices(vertices: Vector3[]): string[] {
    const edgeIds: string[] = [];

    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];

      const result = this.createEdge(start, end);
      if (result) {
        edgeIds.push(result.edgeId);
      }
    }

    return edgeIds;
  }

  protected detectAndCreateFaces(edgeIds: string[]): void {
    const geometryStore = useGeometryStore.getState();

    for (const edgeId of edgeIds) {
      geometryStore.detectNewFaces(edgeId);
    }
  }

  // ========== UTILITIES ==========

  protected setCursor(cursor: string): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      canvas.style.cursor = cursor;
    }
  }

  protected detachObservers(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.keyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }
  }

  protected notifyStateChange(): void {
    this.config.onStateChange?.({ ...this.state });
  }

  /**
   * Check if a rectangle has golden ratio proportions
   */
  protected isGoldenRatio(width: number, height: number): boolean {
    if (width <= 0 || height <= 0) return false;

    const ratio = Math.max(width, height) / Math.min(width, height);
    return Math.abs(ratio - GOLDEN_RATIO) < GOLDEN_RATIO_TOLERANCE;
  }

  /**
   * Check if dimensions form a square
   */
  protected isSquare(width: number, height: number, tolerance: number = 0.01): boolean {
    if (width <= 0 || height <= 0) return false;
    return Math.abs(width - height) / Math.max(width, height) < tolerance;
  }

  /**
   * Clean up all resources
   */
  public dispose(): void {
    this.deactivate();
    this.previewMaterial?.dispose();
    this.markerMaterial?.dispose();
  }
}

export default BaseTool;
