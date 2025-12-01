/**
 * Line Tool - SketchUp-style line drawing with inference
 *
 * Integrates with HalfEdgeMesh kernel for topology management.
 * Creates vertices and edges in the kernel, then renders via Babylon.js.
 *
 * CAD-Grade Features:
 * - Skew line shortest distance algorithm for precise 3D axis projection
 * - Screen-space axis proximity detection (20px threshold)
 * - Professional rubber band preview with axis-colored guide lines
 * - True 3D coordinates - lines can go anywhere in space (not just floor)
 */

import {
  Vector3,
  Mesh,
  MeshBuilder,
  Color3,
  StandardMaterial,
  PointerInfo,
  LinesMesh,
  Ray,
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
  private readonly AXIS_SCREEN_THRESHOLD = 20; // pixels - screen space proximity for axis lock
  private readonly AXIS_GUIDE_LENGTH = 50; // Length of axis guide line (50m for "infinite")

  // Axis direction vectors (unit vectors)
  private readonly AXIS_DIRECTIONS = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1),
  };

  // Manual axis lock state (set by arrow keys)
  private manualAxisLock: 'x' | 'y' | 'z' | null = null;

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
    // Reset manual axis lock
    this.manualAxisLock = null;
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
    if (!this.scene || !this.state.isDrawing || !this.state.startPoint || !this.canvas) return;

    // Get mouse position from pointer event
    const pointerX = info.event.offsetX;
    const pointerY = info.event.offsetY;

    // Generate mouse ray from camera through mouse position
    const mouseRay = this.scene.createPickingRay(
      pointerX,
      pointerY,
      null,
      this.camera!
    );

    // Determine which axis to use (manual lock takes priority)
    let selectedAxis: 'x' | 'y' | 'z' | null = this.manualAxisLock;

    // If no manual lock, check screen-space proximity to each axis
    if (!selectedAxis) {
      selectedAxis = this.detectAxisFromScreenSpace(pointerX, pointerY);
    }

    // Calculate the point based on axis or free movement
    let calculatedPoint: Vector3;

    if (selectedAxis) {
      // Project mouse ray to the selected axis using skew line algorithm
      calculatedPoint = this.projectMouseRayToAxis(
        mouseRay,
        this.state.startPoint,
        this.AXIS_DIRECTIONS[selectedAxis]
      );
      this.state.inferenceAxis = selectedAxis;
    } else {
      // Free movement - use the picked point from raycasting
      if (pickResult.snapped && pickResult.snapPoint) {
        calculatedPoint = pickResult.snapPoint.clone();
      } else if (pickResult.pickedPoint) {
        calculatedPoint = pickResult.pickedPoint.clone();
      } else {
        // Fallback: project to ground plane (Y=startPoint.y)
        calculatedPoint = this.projectRayToPlane(
          mouseRay,
          this.state.startPoint,
          Vector3.Up()
        );
      }
      this.state.inferenceAxis = null;
    }

    this.state.currentPoint = calculatedPoint;

    // Update preview visuals immediately (rubber band effect)
    this.updatePreviewLine();
    this.updateAxisGuideLine();

    // Calculate distance for display
    const distance = Vector3.Distance(this.state.startPoint, calculatedPoint);
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

      // Arrow keys manually lock/unlock axes
      case 'ArrowRight':
        // Toggle X-axis lock
        this.manualAxisLock = this.manualAxisLock === 'x' ? null : 'x';
        this.setStatus(this.manualAxisLock === 'x'
          ? 'Locked to Red Axis (X) - Press → again to unlock'
          : 'Axis unlocked');
        this.updateAxisGuideLine();
        break;

      case 'ArrowUp':
        // Toggle Y-axis lock (vertical)
        this.manualAxisLock = this.manualAxisLock === 'y' ? null : 'y';
        this.setStatus(this.manualAxisLock === 'y'
          ? 'Locked to Blue Axis (Y) - Press ↑ again to unlock'
          : 'Axis unlocked');
        this.updateAxisGuideLine();
        break;

      case 'ArrowLeft':
      case 'ArrowDown':
        // Toggle Z-axis lock
        this.manualAxisLock = this.manualAxisLock === 'z' ? null : 'z';
        this.setStatus(this.manualAxisLock === 'z'
          ? 'Locked to Green Axis (Z) - Press ←/↓ again to unlock'
          : 'Axis unlocked');
        this.updateAxisGuideLine();
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
  // CAD-Grade 3D Math Methods
  // ============================================

  /**
   * Project mouse ray to axis using Skew Line Shortest Distance Algorithm
   *
   * Given two lines in 3D space (mouse ray and axis line), finds the point
   * on the axis that is closest to the mouse ray.
   *
   * Math:
   *   Ray R(t) = O + t*D  (camera origin + direction)
   *   Axis A(s) = P + s*V (start point + axis direction)
   *
   *   We solve for s that minimizes |R(t) - A(s)|
   *
   * @param ray - The mouse picking ray
   * @param axisOrigin - The start point of the line (where axis starts)
   * @param axisDir - The axis direction (unit vector)
   * @returns The point on the axis closest to the ray
   */
  private projectMouseRayToAxis(ray: Ray, axisOrigin: Vector3, axisDir: Vector3): Vector3 {
    const O = ray.origin;      // Ray origin (camera position)
    const D = ray.direction;   // Ray direction (normalized)
    const P = axisOrigin;      // Axis origin (line start point)
    const V = axisDir;         // Axis direction (unit vector)

    // w0 = O - P (vector from axis origin to ray origin)
    const w0 = O.subtract(P);

    // Calculate dot products
    const a = Vector3.Dot(D, D);  // |D|² (should be 1 if normalized)
    const b = Vector3.Dot(D, V);  // D·V
    const c = Vector3.Dot(V, V);  // |V|² (should be 1 if normalized)
    const d = Vector3.Dot(D, w0); // D·w0
    const e = Vector3.Dot(V, w0); // V·w0

    // Denominator for the solution
    const denom = a * c - b * b;

    // If denominator is near zero, lines are parallel
    // In this case, just return the axis origin
    if (Math.abs(denom) < 0.0001) {
      return axisOrigin.clone();
    }

    // Solve for s (parameter on the axis line)
    // s = (b*d - a*e) / denom
    const s = (b * d - a * e) / denom;

    // Calculate the closest point on the axis: P + s*V
    const closestPoint = P.add(V.scale(s));

    return closestPoint;
  }

  /**
   * Project a ray to a plane (for free movement fallback)
   */
  private projectRayToPlane(ray: Ray, planePoint: Vector3, planeNormal: Vector3): Vector3 {
    const denom = Vector3.Dot(ray.direction, planeNormal);

    // Ray is parallel to plane - return plane point
    if (Math.abs(denom) < 0.0001) {
      return planePoint.clone();
    }

    const t = Vector3.Dot(planePoint.subtract(ray.origin), planeNormal) / denom;

    // Ray points away from plane
    if (t < 0) {
      return planePoint.clone();
    }

    return ray.origin.add(ray.direction.scale(t));
  }

  /**
   * Detect which axis the cursor is closest to in screen space
   *
   * Projects the axis lines to 2D screen coordinates and measures
   * the distance from the mouse cursor to each projected axis line.
   *
   * @returns The closest axis if within threshold, null otherwise
   */
  private detectAxisFromScreenSpace(mouseX: number, mouseY: number): 'x' | 'y' | 'z' | null {
    if (!this.scene || !this.camera || !this.state.startPoint) return null;

    const startPoint = this.state.startPoint;

    // Define axis end points (extend in both directions)
    const axes: Array<{ name: 'x' | 'y' | 'z'; dir: Vector3 }> = [
      { name: 'x', dir: this.AXIS_DIRECTIONS.x },
      { name: 'y', dir: this.AXIS_DIRECTIONS.y },
      { name: 'z', dir: this.AXIS_DIRECTIONS.z },
    ];

    let closestAxis: 'x' | 'y' | 'z' | null = null;
    let minDistance = this.AXIS_SCREEN_THRESHOLD;

    for (const axis of axes) {
      // Create axis line endpoints (extend 10m in each direction)
      const axisEnd = startPoint.add(axis.dir.scale(10));

      // Project to screen coordinates
      const startScreen = Vector3.Project(
        startPoint,
        this.scene.getTransformMatrix(),
        this.scene.getProjectionMatrix(),
        this.camera.viewport.toGlobal(
          this.scene.getEngine().getRenderWidth(),
          this.scene.getEngine().getRenderHeight()
        )
      );

      const endScreen = Vector3.Project(
        axisEnd,
        this.scene.getTransformMatrix(),
        this.scene.getProjectionMatrix(),
        this.camera.viewport.toGlobal(
          this.scene.getEngine().getRenderWidth(),
          this.scene.getEngine().getRenderHeight()
        )
      );

      // Calculate distance from mouse to the 2D line segment
      const dist = this.pointToLineDistance2D(
        mouseX, mouseY,
        startScreen.x, startScreen.y,
        endScreen.x, endScreen.y
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestAxis = axis.name;
      }
    }

    return closestAxis;
  }

  /**
   * Calculate perpendicular distance from a point to a 2D line segment
   */
  private pointToLineDistance2D(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      // Line is a point
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    // Project point onto line, clamped to segment
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
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
   * Shows a dashed line extending through the start point in both directions
   */
  private updateAxisGuideLine(): void {
    if (!this.scene || !this.state.startPoint) return;

    // Dispose existing guide line
    if (this.axisGuideLine) {
      this.axisGuideLine.dispose();
      this.axisGuideLine = null;
    }

    // Use manual lock or detected axis
    const activeAxis = this.manualAxisLock || this.state.inferenceAxis;

    // Only show guide when axis is active
    if (!activeAxis) return;

    const start = this.state.startPoint;
    const color = this.AXIS_COLORS[activeAxis];
    const direction = this.AXIS_DIRECTIONS[activeAxis];

    // Create long guide line in both directions (appears infinite)
    const guideStart = start.subtract(direction.scale(this.AXIS_GUIDE_LENGTH));
    const guideEnd = start.add(direction.scale(this.AXIS_GUIDE_LENGTH));

    this.axisGuideLine = MeshBuilder.CreateDashedLines(
      'axisGuideLine',
      {
        points: [guideStart, guideEnd],
        dashSize: 0.1,
        gapSize: 0.05,
        dashNb: 500,
      },
      this.scene
    );
    this.axisGuideLine.color = color;
    this.axisGuideLine.isPickable = false;
    this.axisGuideLine.alpha = 0.7;
    this.axisGuideLine.renderingGroupId = 1; // Render on top
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
