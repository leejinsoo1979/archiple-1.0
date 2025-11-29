/**
 * LineTool - SketchUp-style Line Drawing Tool
 *
 * Complete 1:1 implementation of SketchUp's Line Tool:
 * - Hotkey: L
 * - Click to set start point, move to preview, click to finish
 * - Continuous drawing mode (after finishing, start point = previous end point)
 * - Escape: Cancel current line, Escape again: Exit tool
 * - Inference engine integration for snapping
 * - Arrow key axis locking
 * - Shift inference locking
 * - Measurements input (length, coordinates)
 * - Automatic face creation when edges form closed loop
 *
 * Unit convention: 1 Babylon unit = 1000mm (1 meter)
 */

import {
  Scene,
  Vector3,
  Color3,
  MeshBuilder,
  LinesMesh,
  Mesh,
  PointerInfo,
  PointerEventTypes,
  Observer,
  KeyboardEventTypes,
  KeyboardInfo,
  AbstractMesh,
  StandardMaterial,
} from '@babylonjs/core';
import { InferenceEngine } from '../inference/InferenceEngine';
import type { InferenceResult } from '../inference/InferenceEngine';
import { LockController } from '../inference/LockController';
import type { LockState } from '../inference/LockController';
import { useGeometryStore } from '../stores/geometryStore';
import { useInferenceStore } from '../stores/inferenceStore';
import type { Edge } from '../types';
import { INFERENCE_COLORS, generateId } from '../types';
import type { MeasurementResult } from '../ui/MeasurementsBox';

// ============================================================================
// TOOL STATE
// ============================================================================

export interface LineToolState {
  isActive: boolean;
  startPoint: Vector3 | null;
  currentPoint: Vector3 | null;
  previewMesh: LinesMesh | null;
  inferenceResult: InferenceResult | null;
  pendingInput: string;
  continuousMode: boolean;
  escapeCount: number;
}

export interface LineToolConfig {
  scene: Scene;
  groundMesh?: AbstractMesh;
  onLineCreated?: (start: Vector3, end: Vector3, edgeId: string) => void;
  onToolActivated?: () => void;
  onToolDeactivated?: () => void;
  onStateChange?: (state: LineToolState) => void;
}

// ============================================================================
// LINE TOOL CLASS
// ============================================================================

export class LineTool {
  private scene: Scene;
  private config: LineToolConfig;
  private state: LineToolState;

  // Inference system
  private inferenceEngine: InferenceEngine;
  private lockController: LockController;

  // Observers
  private pointerObserver: Observer<PointerInfo> | null = null;
  private keyboardObserver: Observer<KeyboardInfo> | null = null;

  // Visual elements
  private startPointMarker: Mesh | null = null;
  private inferenceMarker: Mesh | null = null;

  constructor(config: LineToolConfig) {
    this.scene = config.scene;
    this.config = config;

    this.state = {
      isActive: false,
      startPoint: null,
      currentPoint: null,
      previewMesh: null,
      inferenceResult: null,
      pendingInput: '',
      continuousMode: false,
      escapeCount: 0,
    };

    // Initialize inference system
    this.inferenceEngine = new InferenceEngine({ scene: this.scene });
    this.lockController = new LockController({
      inferenceEngine: this.inferenceEngine,
      onStateChange: this.handleLockStateChange.bind(this),
    });
  }

  // ========== PUBLIC API ==========

  /**
   * Activate the line tool
   */
  public activate(): void {
    if (this.state.isActive) return;

    this.state.isActive = true;
    this.state.escapeCount = 0;

    // Attach observers
    this.attachPointerObserver();
    this.attachKeyboardObserver();
    this.lockController.attach();

    // Update cursor
    this.scene.getEngine().getRenderingCanvas()!.style.cursor = 'crosshair';

    this.config.onToolActivated?.();
    this.notifyStateChange();
  }

  /**
   * Deactivate the line tool
   */
  public deactivate(): void {
    if (!this.state.isActive) return;

    // Clean up
    this.cancelCurrentLine();
    this.detachObservers();
    this.lockController.detach();

    // Reset state
    this.state.isActive = false;
    this.state.continuousMode = false;
    this.inferenceEngine.reset();

    // Reset cursor
    this.scene.getEngine().getRenderingCanvas()!.style.cursor = 'default';

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
   * Apply measurement input from MeasurementsBox
   */
  public applyMeasurement(result: MeasurementResult): void {
    if (!this.state.startPoint) return;

    let endPoint: Vector3;

    if (result.type === 'length' && result.length) {
      // Length input: apply in current direction
      const direction = this.getCurrentDirection();
      const lengthInUnits = result.length / 1000; // Convert mm to units
      endPoint = this.state.startPoint.add(direction.scale(lengthInUnits));
    } else if (result.type === 'absolute' && result.position) {
      // Absolute coordinates
      endPoint = result.position;
    } else if (result.type === 'relative' && result.position) {
      // Relative coordinates (already computed by MeasurementsBox)
      endPoint = result.position;
    } else {
      return;
    }

    // Create the line
    this.finalizeLine(endPoint);
  }

  /**
   * Get current state
   */
  public getState(): LineToolState {
    return { ...this.state };
  }

  // ========== POINTER HANDLING ==========

  private attachPointerObserver(): void {
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

  private handlePointerMove(info: PointerInfo): void {
    // Get 3D position from pointer
    const pickResult = this.scene.pick(
      info.event.offsetX,
      info.event.offsetY,
      (mesh) => mesh === this.config.groundMesh,
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
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setCursorPosition(cursorPos);
    inferenceStore.setSnappedPosition(inferenceResult.position);
    inferenceStore.setActiveInferences(inferenceResult.inferences);
    inferenceStore.setPrimaryInference(inferenceResult.primaryInference);
    inferenceStore.setScreenTip({
      text: inferenceResult.screenTip,
      position: { x: info.event.offsetX, y: info.event.offsetY },
      visible: !!inferenceResult.primaryInference,
    });

    // Update preview line
    if (this.state.startPoint) {
      this.updatePreviewLine(this.state.startPoint, inferenceResult.position, inferenceResult.color);
    }

    // Update inference marker
    this.updateInferenceMarker(inferenceResult);

    this.notifyStateChange();
  }

  private handleClick(info: PointerInfo): void {
    if (!this.state.currentPoint && !this.state.inferenceResult) return;

    const clickPoint = this.state.inferenceResult?.position ||
                       this.state.currentPoint ||
                       info.pickInfo?.pickedPoint;

    if (!clickPoint) return;

    // Reset escape counter on click
    this.state.escapeCount = 0;

    if (!this.state.startPoint) {
      // First click: Set start point
      this.setStartPoint(clickPoint);
    } else {
      // Second click: Finish line
      this.finalizeLine(clickPoint);
    }
  }

  // ========== KEYBOARD HANDLING ==========

  private attachKeyboardObserver(): void {
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
        case 'l':
        case 'L':
          // Already in line tool, ignore
          break;
      }
    });
  }

  private handleEscape(): void {
    if (this.state.startPoint) {
      // Cancel current line
      this.cancelCurrentLine();
      this.state.escapeCount = 1;
    } else if (this.state.escapeCount >= 1) {
      // Second escape: Deactivate tool
      this.deactivate();
    } else {
      this.state.escapeCount++;
    }
    this.notifyStateChange();
  }

  private handleLockStateChange(lockState: LockState): void {
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setLockedAxis(lockState.axisLock);
    inferenceStore.setShiftHeld(lockState.shiftHeld);
    inferenceStore.setLinearMode(lockState.linearMode);
    this.notifyStateChange();
  }

  // ========== LINE CREATION ==========

  private setStartPoint(point: Vector3): void {
    this.state.startPoint = point.clone();

    // Create start point marker
    this.createStartPointMarker(point);

    // Update inference store
    useInferenceStore.getState().setStartPoint(point);

    this.notifyStateChange();
  }

  private finalizeLine(endPoint: Vector3): void {
    if (!this.state.startPoint) return;

    const start = this.state.startPoint;
    const end = endPoint.clone();

    // Check minimum length
    if (Vector3.Distance(start, end) < 0.01) {
      console.warn('LineTool: Line too short, ignoring');
      return;
    }

    // Add to geometry store
    const geometryStore = useGeometryStore.getState();

    // Find or create vertices
    const startVertex = geometryStore.findVertexOrCreate(start);
    const endVertex = geometryStore.findVertexOrCreate(end);

    // Create edge (addEdge takes vertex IDs and returns the created edge)
    const edge = geometryStore.addEdge(startVertex.id, endVertex.id, false);

    if (!edge) {
      console.warn('LineTool: Failed to create edge');
      return;
    }

    // Check for closed loops and create faces
    geometryStore.detectNewFaces(edge.id);

    // Create permanent line mesh
    this.createPermanentLine(start, end);

    // Notify callback
    this.config.onLineCreated?.(start, end, edge.id);

    // Clean up preview
    this.disposePreviewLine();
    this.disposeStartPointMarker();

    // Continuous mode: Start new line from end point
    this.state.startPoint = end.clone();
    this.state.continuousMode = true;
    this.createStartPointMarker(end);

    // Update inference store
    useInferenceStore.getState().setStartPoint(end);

    this.notifyStateChange();
  }

  private cancelCurrentLine(): void {
    this.disposePreviewLine();
    this.disposeStartPointMarker();
    this.disposeInferenceMarker();

    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.inferenceResult = null;
    this.state.continuousMode = false;

    // Reset inference store
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setStartPoint(null);
    inferenceStore.setActiveInferences([]);
    inferenceStore.setPrimaryInference(null);

    // Reset inference engine
    this.inferenceEngine.reset();
    this.lockController.reset();

    this.notifyStateChange();
  }

  // ========== VISUAL HELPERS ==========

  private updatePreviewLine(start: Vector3, end: Vector3, color: Color3): void {
    // Dispose old preview
    if (this.state.previewMesh) {
      this.state.previewMesh.dispose();
    }

    // Create new preview line
    const line = MeshBuilder.CreateLines(
      'previewLine',
      { points: [start, end], updatable: false },
      this.scene
    );
    line.color = color;
    line.isPickable = false;

    this.state.previewMesh = line;
  }

  private createPermanentLine(start: Vector3, end: Vector3): void {
    const line = MeshBuilder.CreateLines(
      `edge_${generateId()}`,
      { points: [start, end], updatable: false },
      this.scene
    );
    line.color = new Color3(0.1, 0.1, 0.1); // Dark gray for edges
    line.isPickable = true;
  }

  private createStartPointMarker(position: Vector3): void {
    this.disposeStartPointMarker();

    // Green dot for start point (SketchUp style)
    this.startPointMarker = MeshBuilder.CreateSphere(
      'startPointMarker',
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    this.startPointMarker.position = position;
    this.startPointMarker.isPickable = false;

    // Create green material
    const material = new StandardMaterial('startPointMat', this.scene);
    material.diffuseColor = INFERENCE_COLORS.ENDPOINT;
    material.emissiveColor = INFERENCE_COLORS.ENDPOINT.scale(0.5);
    this.startPointMarker.material = material;
  }

  private updateInferenceMarker(result: InferenceResult): void {
    this.disposeInferenceMarker();

    if (!result.primaryInference) return;

    // Create appropriate marker based on inference type
    const inference = result.primaryInference;
    let mesh: Mesh;

    if (inference.type === 'point') {
      // Sphere for point inferences
      mesh = MeshBuilder.CreateSphere(
        'inferenceMarker',
        { diameter: 0.06, segments: 8 },
        this.scene
      );
    } else {
      // Smaller disc for linear inferences
      mesh = MeshBuilder.CreateDisc(
        'inferenceMarker',
        { radius: 0.04, tessellation: 8 },
        this.scene
      );
      mesh.rotation.x = Math.PI / 2; // Make horizontal
    }

    mesh.position = result.position.clone();
    mesh.isPickable = false;

    // Create colored material
    const material = new StandardMaterial('inferenceMat', this.scene);
    material.diffuseColor = inference.color;
    material.emissiveColor = inference.color.scale(0.5);
    mesh.material = material;

    this.inferenceMarker = mesh;
  }

  private disposePreviewLine(): void {
    if (this.state.previewMesh) {
      this.state.previewMesh.dispose();
      this.state.previewMesh = null;
    }
  }

  private disposeStartPointMarker(): void {
    if (this.startPointMarker) {
      this.startPointMarker.material?.dispose();
      this.startPointMarker.dispose();
      this.startPointMarker = null;
    }
  }

  private disposeInferenceMarker(): void {
    if (this.inferenceMarker) {
      this.inferenceMarker.material?.dispose();
      this.inferenceMarker.dispose();
      this.inferenceMarker = null;
    }
  }

  // ========== UTILITIES ==========

  private getCurrentDirection(): Vector3 {
    if (!this.state.startPoint || !this.state.currentPoint) {
      return new Vector3(1, 0, 0); // Default to X axis
    }

    const dir = this.state.currentPoint.subtract(this.state.startPoint);
    const len = dir.length();
    return len > 0.001 ? dir.normalize() : new Vector3(1, 0, 0);
  }

  private detachObservers(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.keyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }
  }

  private notifyStateChange(): void {
    this.config.onStateChange?.({ ...this.state });
  }

  /**
   * Clean up all resources
   */
  public dispose(): void {
    this.deactivate();
    this.disposePreviewLine();
    this.disposeStartPointMarker();
    this.disposeInferenceMarker();
  }
}

export default LineTool;
