/**
 * Line Tool - SketchUp-style line drawing with inference
 *
 * Integrates with HalfEdgeMesh kernel for topology management.
 * Creates vertices and edges in the kernel, then renders via Babylon.js.
 */

import {
  Vector3,
  Mesh,
  MeshBuilder,
  Color3,
  StandardMaterial,
  PointerInfo,
  LinesMesh,
} from '@babylonjs/core';
import { BaseTool } from './BaseTool';
import { LineToolState, PickResultInfo } from '../types';
import { VertexID, EdgeID } from '../core/kernel';

export class LineTool extends BaseTool {
  name = 'line' as const;
  cursor = 'crosshair';

  private state: LineToolState = {
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    previewLine: null,
    inferenceAxis: null,
  };

  // Track kernel vertex IDs for continuous line drawing
  private startVertexId: VertexID | null = null;
  private lastCreatedEdgeId: EdgeID | null = null;

  // Inference colors
  private readonly AXIS_COLORS = {
    x: Color3.Red(),       // Red axis
    y: Color3.Blue(),      // Blue axis (vertical)
    z: Color3.Green(),     // Green axis
    free: Color3.Black(),  // No axis lock
  };

  private readonly SNAP_THRESHOLD = 0.15; // 150mm

  // ============================================
  // Lifecycle
  // ============================================

  protected onActivate(): void {
    this.setStatus('Line Tool: Click to start drawing');
  }

  protected onDeactivate(): void {
    this.cleanupPreview();
  }

  protected onReset(): void {
    this.cleanupPreview();
    this.state = {
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      previewLine: null,
      inferenceAxis: null,
    };
    // Reset kernel tracking
    this.startVertexId = null;
    this.lastCreatedEdgeId = null;
  }

  // ============================================
  // Input Handling
  // ============================================

  onPointerDown(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene) return;

    // Get the point (snapped if available)
    const point = pickResult.snapped && pickResult.snapPoint
      ? pickResult.snapPoint
      : pickResult.pickedPoint;

    if (!point) return;

    if (!this.state.isDrawing) {
      // Start drawing
      this.state.isDrawing = true;
      this.state.startPoint = point.clone();
      this.state.currentPoint = point.clone();

      // Add vertex to kernel (with auto-snap to existing vertices)
      if (this.kernel) {
        const snapType = pickResult.snapped ? pickResult.snapType : undefined;
        const vertex = this.kernel.addVertex(point, {
          snapThreshold: this.SNAP_THRESHOLD,
          mergeCoincident: true,
          metadata: snapType ? { snapType: snapType as 'endpoint' | 'midpoint' | 'intersection' | 'grid' } : undefined,
        });
        this.startVertexId = vertex.id;
      }

      // Add inference point for SketchUp-style inference
      this.snapSystem?.addInferencePoint(point, 'lineStart');

      this.setStatus('Line Tool: Click to finish, ESC to cancel');

      if (pickResult.snapped && pickResult.snapType) {
        this.showSnap(pickResult.snapType);
      }
    } else {
      // Finish drawing
      this.finalizeLine();

      // Start new line from endpoint (continuous mode)
      this.state.startPoint = point.clone();
      this.state.currentPoint = point.clone();

      // Add inference point
      this.snapSystem?.addInferencePoint(point, 'lineEnd');

      this.setStatus('Line Tool: Click to continue, ESC to stop');
    }
  }

  onPointerMove(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene || !this.state.isDrawing || !this.state.startPoint) return;

    // Get the point (snapped if available)
    let point = pickResult.snapped && pickResult.snapPoint
      ? pickResult.snapPoint.clone()
      : pickResult.pickedPoint?.clone();

    if (!point) return;

    // Apply axis inference
    point = this.applyAxisInference(this.state.startPoint, point);
    this.state.currentPoint = point;

    // Update preview line
    this.updatePreviewLine();

    // Update input display
    const distance = Vector3.Distance(this.state.startPoint, point);
    this.setInput(distance.toFixed(3));

    // Show snap indicator
    if (pickResult.snapped && pickResult.snapType) {
      this.showSnap(pickResult.snapType);
    } else if (this.state.inferenceAxis) {
      this.showSnap('axis');
    } else {
      this.hideSnap();
    }
  }

  onPointerUp(_info: PointerInfo, _pickResult: PickResultInfo): void {
    // Line tool uses click-click, not drag
  }

  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.reset();
        this.setStatus('Line Tool: Click to start drawing');
        break;

      case 'ArrowRight':
        this.state.inferenceAxis = this.state.inferenceAxis === 'x' ? null : 'x';
        this.updatePreviewLine();
        break;

      case 'ArrowUp':
        this.state.inferenceAxis = this.state.inferenceAxis === 'y' ? null : 'y';
        this.updatePreviewLine();
        break;

      case 'ArrowLeft':
      case 'ArrowDown':
        this.state.inferenceAxis = this.state.inferenceAxis === 'z' ? null : 'z';
        this.updatePreviewLine();
        break;
    }
  }

  onValueInput(value: string): boolean {
    if (!this.state.isDrawing || !this.state.startPoint) return false;

    // Parse distance value
    const distance = parseFloat(value);
    if (isNaN(distance) || distance <= 0) return false;

    // Calculate direction
    let direction: Vector3;
    if (this.state.currentPoint) {
      direction = this.state.currentPoint.subtract(this.state.startPoint).normalize();
    } else if (this.state.inferenceAxis) {
      switch (this.state.inferenceAxis) {
        case 'x': direction = new Vector3(1, 0, 0); break;
        case 'y': direction = new Vector3(0, 1, 0); break;
        case 'z': direction = new Vector3(0, 0, 1); break;
        default: direction = new Vector3(1, 0, 0);
      }
    } else {
      direction = new Vector3(1, 0, 0);
    }

    // Calculate end point with exact distance
    const endPoint = this.state.startPoint.add(direction.scale(distance / 1000)); // Convert mm to m
    this.state.currentPoint = endPoint;

    // Finalize the line
    this.finalizeLine();

    // Continue from endpoint
    this.state.startPoint = endPoint.clone();

    return true;
  }

  // ============================================
  // State
  // ============================================

  getState(): LineToolState {
    return { ...this.state };
  }

  // ============================================
  // Private Methods
  // ============================================

  private applyAxisInference(start: Vector3, end: Vector3): Vector3 {
    // If axis is locked by arrow key
    if (this.state.inferenceAxis) {
      switch (this.state.inferenceAxis) {
        case 'x':
          return new Vector3(end.x, start.y, start.z);
        case 'y':
          return new Vector3(start.x, end.y, start.z);
        case 'z':
          return new Vector3(start.x, start.y, end.z);
      }
    }

    // Auto-detect axis alignment
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const dz = Math.abs(end.z - start.z);
    const total = dx + dy + dz;

    if (total < 0.001) return end;

    // Check if aligned to an axis
    if (dx / total > 0.9 && dy < this.SNAP_THRESHOLD && dz < this.SNAP_THRESHOLD) {
      this.state.inferenceAxis = 'x';
      return new Vector3(end.x, start.y, start.z);
    }
    if (dy / total > 0.9 && dx < this.SNAP_THRESHOLD && dz < this.SNAP_THRESHOLD) {
      this.state.inferenceAxis = 'y';
      return new Vector3(start.x, end.y, start.z);
    }
    if (dz / total > 0.9 && dx < this.SNAP_THRESHOLD && dy < this.SNAP_THRESHOLD) {
      this.state.inferenceAxis = 'z';
      return new Vector3(start.x, start.y, end.z);
    }

    this.state.inferenceAxis = null;
    return end;
  }

  private updatePreviewLine(): void {
    if (!this.scene || !this.state.startPoint || !this.state.currentPoint) return;

    // Remove existing preview
    if (this.state.previewLine) {
      this.state.previewLine.dispose();
    }

    // Determine line color based on axis
    let color = this.AXIS_COLORS.free;
    if (this.state.inferenceAxis) {
      color = this.AXIS_COLORS[this.state.inferenceAxis];
    }

    // Create preview line
    const points = [this.state.startPoint, this.state.currentPoint];
    const lines = MeshBuilder.CreateLines('previewLine', { points }, this.scene);
    lines.color = color;
    lines.isPickable = false;

    this.state.previewLine = lines;
  }

  private finalizeLine(): void {
    if (!this.scene || !this.context || !this.state.startPoint || !this.state.currentPoint) return;

    const start = this.state.startPoint;
    const end = this.state.currentPoint;
    const distance = Vector3.Distance(start, end);

    // Minimum length check
    if (distance < 0.001) return;

    // Add to kernel topology
    let endVertexId: VertexID | null = null;
    if (this.kernel && this.startVertexId) {
      // Add end vertex (with auto-snap to existing vertices)
      const endVertex = this.kernel.addVertex(end, {
        snapThreshold: this.SNAP_THRESHOLD,
        mergeCoincident: true,
      });
      endVertexId = endVertex.id;

      // Add edge between vertices
      const edge = this.kernel.addEdge(this.startVertexId, endVertexId, {
        createTwin: true,
      });
      this.lastCreatedEdgeId = edge?.id ?? null;

      // Update start vertex for continuous drawing
      this.startVertexId = endVertexId;

      console.log(`[LineTool] Kernel: Added edge ${edge?.id} from ${this.startVertexId} to ${endVertexId}`);
    }

    // Create the visual edge (Babylon.js mesh)
    this.context.createEdge(start, end, {
      color: '#000000',
      metadata: {
        type: 'edge',
        startPoint: { x: start.x, y: start.y, z: start.z },
        endPoint: { x: end.x, y: end.y, z: end.z },
        length: distance,
        // Link to kernel topology
        kernelEdgeId: this.lastCreatedEdgeId,
        kernelStartVertexId: this.startVertexId,
        kernelEndVertexId: endVertexId,
      },
    });

    // Cleanup preview
    this.cleanupPreview();

    console.log(`[LineTool] Created line: ${(distance * 1000).toFixed(0)}mm`);
  }

  private cleanupPreview(): void {
    if (this.state.previewLine) {
      this.state.previewLine.dispose();
      this.state.previewLine = null;
    }
    this.hideSnap();
  }
}
