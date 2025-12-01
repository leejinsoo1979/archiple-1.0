/**
 * Line Tool - SketchUp-style line drawing with inference
 *
 * Integrates with HalfEdgeMesh kernel for topology management.
 * Creates vertices and edges in the kernel, then renders via Babylon.js.
 *
 * Visual Features:
 * - Rubber band preview line (instant feedback)
 * - Axis inference with colored guide lines (Red=X, Blue=Y, Green=Z)
 * - Status text feedback for snap/axis state
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

  // Additional preview meshes for better UX
  private axisGuideLine: LinesMesh | null = null;
  private startPointMarker: Mesh | null = null;

  // Inference colors (SketchUp standard)
  private readonly AXIS_COLORS = {
    x: Color3.Red(),       // Red axis (horizontal X)
    y: Color3.Blue(),      // Blue axis (vertical Y)
    z: Color3.Green(),     // Green axis (horizontal Z)
    free: Color3.Black(),  // No axis lock
  };

  // Axis names for status text
  private readonly AXIS_NAMES = {
    x: 'Red Axis (X)',
    y: 'Blue Axis (Y)',
    z: 'Green Axis (Z)',
  };

  private readonly SNAP_THRESHOLD = 0.15; // 150mm
  private readonly AXIS_DOMINANCE_THRESHOLD = 0.85; // 85% of movement must be on one axis
  private readonly AXIS_GUIDE_LENGTH = 10; // Length of infinite axis guide line (10m)

  // ============================================
  // Lifecycle
  // ============================================

  protected onActivate(): void {
    this.setStatus('Line Tool: Click to start drawing');
  }

  protected onDeactivate(): void {
    this.cleanupAllPreviews();
  }

  protected onReset(): void {
    this.cleanupAllPreviews();
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

      // Create start point marker (small sphere)
      this.createStartPointMarker(point);

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

    // Get the raw point (snapped if available)
    let rawPoint = pickResult.snapped && pickResult.snapPoint
      ? pickResult.snapPoint.clone()
      : pickResult.pickedPoint?.clone();

    if (!rawPoint) return;

    // Store previous axis for comparison
    const previousAxis = this.state.inferenceAxis;

    // Apply axis inference (modifies state.inferenceAxis)
    const snappedPoint = this.applyAxisInference(this.state.startPoint, rawPoint);
    this.state.currentPoint = snappedPoint;

    // Update preview visuals immediately (rubber band effect)
    this.updatePreviewLine();
    this.updateAxisGuideLine();

    // Calculate distance for display
    const distance = Vector3.Distance(this.state.startPoint, snappedPoint);
    const distanceMM = (distance * 1000).toFixed(0);
    this.setInput(`${distanceMM}mm`);

    // Update status text with axis/snap feedback
    this.updateStatusText(pickResult, distance);

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
    // If axis is manually locked by arrow key, enforce it
    if (this.state.inferenceAxis) {
      return this.constrainToAxis(start, end, this.state.inferenceAxis);
    }

    // Calculate movement deltas
    const delta = end.subtract(start);
    const dx = Math.abs(delta.x);
    const dy = Math.abs(delta.y);
    const dz = Math.abs(delta.z);
    const totalMovement = dx + dy + dz;

    // Too close to start point - no inference
    if (totalMovement < 0.01) {
      this.state.inferenceAxis = null;
      return end;
    }

    // Calculate axis dominance ratios
    const xRatio = dx / totalMovement;
    const yRatio = dy / totalMovement;
    const zRatio = dz / totalMovement;

    // Find the dominant axis
    const maxRatio = Math.max(xRatio, yRatio, zRatio);

    // Only snap if one axis is clearly dominant
    if (maxRatio >= this.AXIS_DOMINANCE_THRESHOLD) {
      if (yRatio === maxRatio) {
        // Y-Axis (BLUE) - Vertical movement priority
        this.state.inferenceAxis = 'y';
        return this.constrainToAxis(start, end, 'y');
      } else if (xRatio === maxRatio) {
        // X-Axis (RED)
        this.state.inferenceAxis = 'x';
        return this.constrainToAxis(start, end, 'x');
      } else if (zRatio === maxRatio) {
        // Z-Axis (GREEN)
        this.state.inferenceAxis = 'z';
        return this.constrainToAxis(start, end, 'z');
      }
    }

    // No dominant axis - free movement
    this.state.inferenceAxis = null;
    return end;
  }

  /**
   * Constrain a point to move only along a specific axis from the start point
   */
  private constrainToAxis(start: Vector3, end: Vector3, axis: 'x' | 'y' | 'z'): Vector3 {
    switch (axis) {
      case 'x':
        return new Vector3(end.x, start.y, start.z);
      case 'y':
        return new Vector3(start.x, end.y, start.z);
      case 'z':
        return new Vector3(start.x, start.y, end.z);
    }
  }

  /**
   * Update the rubber band preview line (from start to cursor)
   * This provides instant visual feedback
   */
  private updatePreviewLine(): void {
    if (!this.scene || !this.state.startPoint || !this.state.currentPoint) return;

    // Dispose existing preview immediately to prevent ghosting
    if (this.state.previewLine) {
      this.state.previewLine.dispose();
      this.state.previewLine = null;
    }

    // Determine line color based on axis
    let color = this.AXIS_COLORS.free;
    if (this.state.inferenceAxis) {
      color = this.AXIS_COLORS[this.state.inferenceAxis];
    }

    // Create rubber band line (from last click to current position)
    const points = [this.state.startPoint, this.state.currentPoint];
    const previewLine = MeshBuilder.CreateLines('previewLine', { points }, this.scene);
    previewLine.color = color;
    previewLine.isPickable = false;
    previewLine.renderingGroupId = 1; // Render on top

    this.state.previewLine = previewLine;
  }

  /**
   * Update the axis guide line (infinite line along the snapped axis)
   */
  private updateAxisGuideLine(): void {
    if (!this.scene || !this.state.startPoint) return;

    // Dispose existing guide line
    if (this.axisGuideLine) {
      this.axisGuideLine.dispose();
      this.axisGuideLine = null;
    }

    // Only show guide when axis is locked
    if (!this.state.inferenceAxis) return;

    const start = this.state.startPoint;
    const axis = this.state.inferenceAxis;
    const color = this.AXIS_COLORS[axis];

    // Create axis direction vector
    let direction: Vector3;
    switch (axis) {
      case 'x':
        direction = new Vector3(1, 0, 0);
        break;
      case 'y':
        direction = new Vector3(0, 1, 0);
        break;
      case 'z':
        direction = new Vector3(0, 0, 1);
        break;
    }

    // Create long guide line in both directions
    const guideStart = start.subtract(direction.scale(this.AXIS_GUIDE_LENGTH));
    const guideEnd = start.add(direction.scale(this.AXIS_GUIDE_LENGTH));

    this.axisGuideLine = MeshBuilder.CreateDashedLines(
      'axisGuideLine',
      {
        points: [guideStart, guideEnd],
        dashSize: 0.05,
        gapSize: 0.03,
        dashNb: 200,
      },
      this.scene
    );
    this.axisGuideLine.color = color;
    this.axisGuideLine.isPickable = false;
    this.axisGuideLine.alpha = 0.6;
  }

  /**
   * Update status text with current snap/axis state
   */
  private updateStatusText(pickResult: PickResultInfo, distance: number): void {
    const distanceMM = (distance * 1000).toFixed(0);
    let statusParts: string[] = [];

    // Snap type feedback
    if (pickResult.snapped && pickResult.snapType) {
      const snapLabels: Record<string, string> = {
        endpoint: 'Endpoint',
        midpoint: 'Midpoint',
        intersection: 'Intersection',
        perpendicular: 'Perpendicular',
        parallel: 'Parallel',
        onEdge: 'On Edge',
        onFace: 'On Face',
        origin: 'Origin',
        grid: 'Grid',
      };
      statusParts.push(snapLabels[pickResult.snapType] || pickResult.snapType);
    }

    // Axis inference feedback
    if (this.state.inferenceAxis) {
      statusParts.push(`On ${this.AXIS_NAMES[this.state.inferenceAxis]}`);
    }

    // Build status message
    if (statusParts.length > 0) {
      this.setStatus(`Line: ${distanceMM}mm - ${statusParts.join(', ')}`);
    } else {
      this.setStatus(`Line: ${distanceMM}mm - Click to finish, ESC to cancel`);
    }
  }

  /**
   * Create a small marker sphere at the start point
   */
  private createStartPointMarker(point: Vector3): void {
    if (!this.scene) return;

    // Dispose existing marker
    if (this.startPointMarker) {
      this.startPointMarker.dispose();
    }

    // Create small green sphere at start point
    this.startPointMarker = MeshBuilder.CreateSphere(
      'startPointMarker',
      { diameter: 0.03 },
      this.scene
    );
    this.startPointMarker.position = point.clone();
    this.startPointMarker.isPickable = false;

    // Green material
    const material = new StandardMaterial('startMarkerMat', this.scene);
    material.emissiveColor = new Color3(0, 0.8, 0);
    material.disableLighting = true;
    this.startPointMarker.material = material;
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

  /**
   * Cleanup the rubber band preview line only
   */
  private cleanupPreview(): void {
    if (this.state.previewLine) {
      this.state.previewLine.dispose();
      this.state.previewLine = null;
    }
    this.hideSnap();
  }

  /**
   * Cleanup all preview meshes (for reset/deactivate)
   */
  private cleanupAllPreviews(): void {
    // Cleanup preview line
    if (this.state.previewLine) {
      this.state.previewLine.dispose();
      this.state.previewLine = null;
    }

    // Cleanup axis guide line
    if (this.axisGuideLine) {
      this.axisGuideLine.dispose();
      this.axisGuideLine = null;
    }

    // Cleanup start point marker
    if (this.startPointMarker) {
      if (this.startPointMarker.material) {
        this.startPointMarker.material.dispose();
      }
      this.startPointMarker.dispose();
      this.startPointMarker = null;
    }

    this.hideSnap();
  }
}
