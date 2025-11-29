/**
 * InferenceEngine - SketchUp-style Inference System
 * Core engine that coordinates all inference detection and prioritization
 *
 * Based on SketchUp Drawing Basics documentation:
 * - Point inferences: Origin, Endpoint, Midpoint, Intersection, On Face/Edge, Center
 * - Linear inferences: Axis alignment, Parallel, Perpendicular, From/Through point
 * - Shape inferences: Square, Golden Section, Half/Quarter circle
 */

import { Vector3, Scene, Color3 } from '@babylonjs/core';
import type {
  Inference,
  InferenceState,
  InferenceLockAxis,
  LinearInferenceMode,
  PointInferenceType,
  LinearInferenceType,
  GeometryId,
} from '../types';
import { INFERENCE_COLORS } from '../types';
import { useGeometryStore } from '../stores/geometryStore';

// Inference priority weights (higher = more important)
const INFERENCE_PRIORITIES = {
  // Point inferences
  origin: 100,
  endpoint: 95,
  center: 90,
  midpoint: 85,
  intersection: 80,
  quarter_point: 75,
  arc_midpoint: 70,
  guide_point: 65,
  on_edge: 50,
  on_face: 40,

  // Linear inferences
  on_red_axis: 60,
  on_green_axis: 60,
  on_blue_axis: 60,
  parallel: 55,
  perpendicular: 55,
  from_point: 45,
  through_point: 45,
  extend_edge: 35,
  tangent: 30,

  // Shape inferences
  square: 70,
  golden_section: 65,
  half_circle: 60,
  quarter_circle: 55,
  three_quarter: 50,
} as const;

// Snap distances in 3D units
const SNAP_DISTANCES = {
  point: 0.15,      // Point snap radius
  edge: 0.1,        // Edge proximity
  axis: 0.08,       // Axis alignment tolerance (radians)
  parallel: 0.05,   // Parallel/perpendicular tolerance (radians)
} as const;

export interface InferenceEngineConfig {
  scene: Scene;
  snapDistance?: number;
  enablePointInferences?: boolean;
  enableLinearInferences?: boolean;
  enableShapeInferences?: boolean;
}

export interface InferenceResult {
  position: Vector3;
  inferences: Inference[];
  primaryInference: Inference | null;
  screenTip: string;
  color: Color3;
}

export class InferenceEngine {
  private scene: Scene;
  private config: Required<InferenceEngineConfig>;
  private state: InferenceState;
  private referencePoint: Vector3 | null = null;
  private referenceEdge: { start: Vector3; end: Vector3 } | null = null;

  // Axis directions (SketchUp coordinate system)
  private readonly RED_AXIS = new Vector3(1, 0, 0);    // X axis
  private readonly GREEN_AXIS = new Vector3(0, 0, 1);  // Z axis (SketchUp's green/Y)
  private readonly BLUE_AXIS = new Vector3(0, 1, 0);   // Y axis (SketchUp's blue/Z)

  constructor(config: InferenceEngineConfig) {
    this.scene = config.scene;
    this.config = {
      scene: config.scene,
      snapDistance: config.snapDistance ?? SNAP_DISTANCES.point,
      enablePointInferences: config.enablePointInferences ?? true,
      enableLinearInferences: config.enableLinearInferences ?? true,
      enableShapeInferences: config.enableShapeInferences ?? true,
    };

    this.state = {
      activeInferences: [],
      lockedAxis: 'none',
      lockedInference: null,
      linearMode: 'all_on',
      planeLock: 'none',
    };
  }

  /**
   * Main inference detection method
   * Takes a 3D position and finds all applicable inferences
   */
  public detectInferences(
    cursorPosition: Vector3,
    startPoint: Vector3 | null = null
  ): InferenceResult {
    const inferences: Inference[] = [];
    let snappedPosition = cursorPosition.clone();

    // Set reference point for linear inferences
    if (startPoint) {
      this.referencePoint = startPoint;
    }

    // If axis is locked, constrain to that axis first
    if (this.state.lockedAxis !== 'none') {
      snappedPosition = this.constrainToLockedAxis(cursorPosition, startPoint);
      const axisInference = this.createAxisLockInference(snappedPosition);
      if (axisInference) {
        inferences.push(axisInference);
      }
    }

    // If a specific inference is locked (Shift key), use that
    if (this.state.lockedInference) {
      return this.applyLockedInference(cursorPosition, startPoint);
    }

    // Detect point inferences
    if (this.config.enablePointInferences) {
      const pointInferences = this.detectPointInferences(snappedPosition);
      inferences.push(...pointInferences);

      // Snap to highest priority point inference
      const highestPoint = pointInferences[0];
      if (highestPoint) {
        snappedPosition = highestPoint.position.clone();
      }
    }

    // Detect linear inferences (only if not snapped to a point)
    if (this.config.enableLinearInferences && startPoint && this.state.linearMode !== 'all_off') {
      const linearInferences = this.detectLinearInferences(snappedPosition, startPoint);
      inferences.push(...linearInferences);
    }

    // Sort by priority
    inferences.sort((a, b) => b.priority - a.priority);

    // Get primary inference for display
    const primaryInference = inferences[0] || null;

    // Update state
    this.state.activeInferences = inferences;

    return {
      position: snappedPosition,
      inferences,
      primaryInference,
      screenTip: primaryInference?.screenTip || '',
      color: primaryInference?.color || INFERENCE_COLORS.DEFAULT,
    };
  }

  /**
   * Detect point-based inferences
   */
  private detectPointInferences(position: Vector3): Inference[] {
    const inferences: Inference[] = [];
    const geometryStore = useGeometryStore.getState();
    const snapDist = this.config.snapDistance;

    // Check origin point
    const origin = Vector3.Zero();
    if (Vector3.Distance(position, origin) < snapDist) {
      inferences.push({
        type: 'point',
        subType: 'origin',
        position: origin,
        color: INFERENCE_COLORS.ORIGIN,
        screenTip: 'Origin',
        priority: INFERENCE_PRIORITIES.origin,
        isLocked: false,
      });
    }

    // Check existing vertex endpoints
    geometryStore.vertices.forEach((vertex) => {
      const dist = Vector3.Distance(position, vertex.position);
      if (dist < snapDist) {
        inferences.push({
          type: 'point',
          subType: 'endpoint',
          position: vertex.position.clone(),
          referenceGeometry: vertex.id,
          color: INFERENCE_COLORS.ENDPOINT,
          screenTip: 'Endpoint',
          priority: INFERENCE_PRIORITIES.endpoint,
          isLocked: false,
        });
      }
    });

    // Check edge midpoints and on-edge
    geometryStore.edges.forEach((edge) => {
      const startVertex = geometryStore.vertices.get(edge.startVertexId);
      const endVertex = geometryStore.vertices.get(edge.endVertexId);

      if (!startVertex || !endVertex) return;

      const start = startVertex.position;
      const end = endVertex.position;
      const midpoint = Vector3.Center(start, end);

      // Check midpoint
      if (Vector3.Distance(position, midpoint) < snapDist) {
        inferences.push({
          type: 'point',
          subType: 'midpoint',
          position: midpoint,
          referenceGeometry: edge.id,
          color: INFERENCE_COLORS.MIDPOINT,
          screenTip: 'Midpoint',
          priority: INFERENCE_PRIORITIES.midpoint,
          isLocked: false,
        });
      }

      // Check on-edge (closest point on edge)
      const closestPoint = this.closestPointOnSegment(position, start, end);
      const distToEdge = Vector3.Distance(position, closestPoint);

      if (distToEdge < snapDist * 0.5 &&
          Vector3.Distance(closestPoint, start) > snapDist &&
          Vector3.Distance(closestPoint, end) > snapDist &&
          Vector3.Distance(closestPoint, midpoint) > snapDist) {
        inferences.push({
          type: 'point',
          subType: 'on_edge',
          position: closestPoint,
          referenceGeometry: edge.id,
          color: INFERENCE_COLORS.ON_EDGE,
          screenTip: 'On Edge',
          priority: INFERENCE_PRIORITIES.on_edge,
          isLocked: false,
        });
      }
    });

    // Check edge-edge intersections
    const intersections = this.findEdgeIntersections(position, snapDist);
    inferences.push(...intersections);

    // Sort by priority
    return inferences.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Detect linear/axis-based inferences
   */
  private detectLinearInferences(position: Vector3, startPoint: Vector3): Inference[] {
    const inferences: Inference[] = [];
    const direction = position.subtract(startPoint).normalize();
    const parallelOnly = this.state.linearMode === 'parallel_perpendicular_only';

    // Check axis alignments (always check unless all_off)
    if (!parallelOnly) {
      // Red axis (X)
      const redDot = Math.abs(Vector3.Dot(direction, this.RED_AXIS));
      if (redDot > 1 - SNAP_DISTANCES.axis) {
        const constrainedPos = this.projectToAxis(position, startPoint, this.RED_AXIS);
        inferences.push({
          type: 'linear',
          subType: 'on_red_axis',
          position: constrainedPos,
          direction: this.RED_AXIS,
          color: INFERENCE_COLORS.RED_AXIS,
          screenTip: 'On Red Axis',
          priority: INFERENCE_PRIORITIES.on_red_axis,
          isLocked: false,
        });
      }

      // Green axis (Z in our system, Y in SketchUp)
      const greenDot = Math.abs(Vector3.Dot(direction, this.GREEN_AXIS));
      if (greenDot > 1 - SNAP_DISTANCES.axis) {
        const constrainedPos = this.projectToAxis(position, startPoint, this.GREEN_AXIS);
        inferences.push({
          type: 'linear',
          subType: 'on_green_axis',
          position: constrainedPos,
          direction: this.GREEN_AXIS,
          color: INFERENCE_COLORS.GREEN_AXIS,
          screenTip: 'On Green Axis',
          priority: INFERENCE_PRIORITIES.on_green_axis,
          isLocked: false,
        });
      }

      // Blue axis (Y in our system, Z in SketchUp)
      const blueDot = Math.abs(Vector3.Dot(direction, this.BLUE_AXIS));
      if (blueDot > 1 - SNAP_DISTANCES.axis) {
        const constrainedPos = this.projectToAxis(position, startPoint, this.BLUE_AXIS);
        inferences.push({
          type: 'linear',
          subType: 'on_blue_axis',
          position: constrainedPos,
          direction: this.BLUE_AXIS,
          color: INFERENCE_COLORS.BLUE_AXIS,
          screenTip: 'On Blue Axis',
          priority: INFERENCE_PRIORITIES.on_blue_axis,
          isLocked: false,
        });
      }
    }

    // Check parallel/perpendicular to existing edges
    const geometryStore = useGeometryStore.getState();
    geometryStore.edges.forEach((edge) => {
      const startVertex = geometryStore.vertices.get(edge.startVertexId);
      const endVertex = geometryStore.vertices.get(edge.endVertexId);
      if (!startVertex || !endVertex) return;

      const edgeDir = endVertex.position.subtract(startVertex.position).normalize();

      // Parallel check
      const parallelDot = Math.abs(Vector3.Dot(direction, edgeDir));
      if (parallelDot > 1 - SNAP_DISTANCES.parallel) {
        inferences.push({
          type: 'linear',
          subType: 'parallel',
          position: position.clone(),
          direction: edgeDir,
          referenceGeometry: edge.id,
          color: INFERENCE_COLORS.PARALLEL,
          screenTip: 'Parallel to Edge',
          priority: INFERENCE_PRIORITIES.parallel,
          isLocked: false,
        });
      }

      // Perpendicular check
      const perpDot = Math.abs(Vector3.Dot(direction, edgeDir));
      if (perpDot < SNAP_DISTANCES.parallel) {
        inferences.push({
          type: 'linear',
          subType: 'perpendicular',
          position: position.clone(),
          direction: Vector3.Cross(edgeDir, this.BLUE_AXIS).normalize(),
          referenceGeometry: edge.id,
          color: INFERENCE_COLORS.PERPENDICULAR,
          screenTip: 'Perpendicular to Edge',
          priority: INFERENCE_PRIORITIES.perpendicular,
          isLocked: false,
        });
      }
    });

    // Check "from point" inference (alignment with other vertices)
    if (!parallelOnly) {
      geometryStore.vertices.forEach((vertex) => {
        if (Vector3.Distance(vertex.position, startPoint) < 0.01) return; // Skip start point

        // Check if current position aligns with this vertex on any axis
        const toVertex = vertex.position.subtract(startPoint).normalize();
        const toCursor = position.subtract(startPoint).normalize();

        // Check X alignment
        if (Math.abs(position.x - vertex.position.x) < SNAP_DISTANCES.point) {
          inferences.push({
            type: 'linear',
            subType: 'from_point',
            position: new Vector3(vertex.position.x, position.y, position.z),
            direction: this.RED_AXIS,
            referenceGeometry: vertex.id,
            color: INFERENCE_COLORS.FROM_POINT,
            screenTip: `From Point (X: ${vertex.position.x.toFixed(2)})`,
            priority: INFERENCE_PRIORITIES.from_point,
            isLocked: false,
          });
        }

        // Check Y alignment
        if (Math.abs(position.y - vertex.position.y) < SNAP_DISTANCES.point) {
          inferences.push({
            type: 'linear',
            subType: 'from_point',
            position: new Vector3(position.x, vertex.position.y, position.z),
            direction: this.BLUE_AXIS,
            referenceGeometry: vertex.id,
            color: INFERENCE_COLORS.FROM_POINT,
            screenTip: `From Point (Y: ${vertex.position.y.toFixed(2)})`,
            priority: INFERENCE_PRIORITIES.from_point,
            isLocked: false,
          });
        }

        // Check Z alignment
        if (Math.abs(position.z - vertex.position.z) < SNAP_DISTANCES.point) {
          inferences.push({
            type: 'linear',
            subType: 'from_point',
            position: new Vector3(position.x, position.y, vertex.position.z),
            direction: this.GREEN_AXIS,
            referenceGeometry: vertex.id,
            color: INFERENCE_COLORS.FROM_POINT,
            screenTip: `From Point (Z: ${vertex.position.z.toFixed(2)})`,
            priority: INFERENCE_PRIORITIES.from_point,
            isLocked: false,
          });
        }
      });
    }

    return inferences.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Find edge-edge intersections near a position
   */
  private findEdgeIntersections(position: Vector3, snapDist: number): Inference[] {
    const inferences: Inference[] = [];
    const geometryStore = useGeometryStore.getState();
    const edges = Array.from(geometryStore.edges.values());

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const edge1 = edges[i];
        const edge2 = edges[j];

        const s1 = geometryStore.vertices.get(edge1.startVertexId);
        const e1 = geometryStore.vertices.get(edge1.endVertexId);
        const s2 = geometryStore.vertices.get(edge2.startVertexId);
        const e2 = geometryStore.vertices.get(edge2.endVertexId);

        if (!s1 || !e1 || !s2 || !e2) continue;

        const intersection = this.lineLineIntersection(
          s1.position, e1.position,
          s2.position, e2.position
        );

        if (intersection && Vector3.Distance(position, intersection) < snapDist) {
          inferences.push({
            type: 'point',
            subType: 'intersection',
            position: intersection,
            color: INFERENCE_COLORS.INTERSECTION,
            screenTip: 'Intersection',
            priority: INFERENCE_PRIORITIES.intersection,
            isLocked: false,
          });
        }
      }
    }

    return inferences;
  }

  /**
   * Calculate line-line intersection point (3D)
   */
  private lineLineIntersection(
    p1: Vector3, p2: Vector3,
    p3: Vector3, p4: Vector3
  ): Vector3 | null {
    const d1 = p2.subtract(p1);
    const d2 = p4.subtract(p3);
    const d3 = p3.subtract(p1);

    const cross1 = Vector3.Cross(d1, d2);
    const cross2 = Vector3.Cross(d3, d2);

    const denom = cross1.lengthSquared();
    if (denom < 0.0001) return null; // Parallel lines

    const t = Vector3.Dot(cross2, cross1) / denom;

    if (t < 0 || t > 1) return null; // Outside first segment

    const intersection = p1.add(d1.scale(t));

    // Verify intersection is on second segment
    const t2 = this.parameterOnSegment(intersection, p3, p4);
    if (t2 < 0 || t2 > 1) return null;

    return intersection;
  }

  /**
   * Get parameter t for point on segment (0-1 if on segment)
   */
  private parameterOnSegment(point: Vector3, start: Vector3, end: Vector3): number {
    const d = end.subtract(start);
    const len = d.length();
    if (len < 0.0001) return 0;

    const t = Vector3.Dot(point.subtract(start), d.normalize()) / len;
    return t;
  }

  /**
   * Find closest point on a line segment to a given point
   */
  private closestPointOnSegment(point: Vector3, start: Vector3, end: Vector3): Vector3 {
    const line = end.subtract(start);
    const len = line.length();
    if (len < 0.0001) return start.clone();

    const lineDir = line.normalize();
    const v = point.subtract(start);
    const d = Vector3.Dot(v, lineDir);

    if (d <= 0) return start.clone();
    if (d >= len) return end.clone();

    return start.add(lineDir.scale(d));
  }

  /**
   * Project a point onto an axis from a start point
   */
  private projectToAxis(point: Vector3, startPoint: Vector3, axis: Vector3): Vector3 {
    const v = point.subtract(startPoint);
    const projection = Vector3.Dot(v, axis);
    return startPoint.add(axis.scale(projection));
  }

  /**
   * Constrain position to the locked axis
   */
  private constrainToLockedAxis(position: Vector3, startPoint: Vector3 | null): Vector3 {
    if (!startPoint) return position;

    switch (this.state.lockedAxis) {
      case 'red':
        return this.projectToAxis(position, startPoint, this.RED_AXIS);
      case 'green':
        return this.projectToAxis(position, startPoint, this.GREEN_AXIS);
      case 'blue':
        return this.projectToAxis(position, startPoint, this.BLUE_AXIS);
      default:
        return position;
    }
  }

  /**
   * Create inference for the currently locked axis
   */
  private createAxisLockInference(position: Vector3): Inference | null {
    switch (this.state.lockedAxis) {
      case 'red':
        return {
          type: 'linear',
          subType: 'on_red_axis',
          position,
          direction: this.RED_AXIS,
          color: INFERENCE_COLORS.RED_AXIS,
          screenTip: 'Constrained on Red Axis',
          priority: INFERENCE_PRIORITIES.on_red_axis + 10, // Boost locked axis
          isLocked: true,
        };
      case 'green':
        return {
          type: 'linear',
          subType: 'on_green_axis',
          position,
          direction: this.GREEN_AXIS,
          color: INFERENCE_COLORS.GREEN_AXIS,
          screenTip: 'Constrained on Green Axis',
          priority: INFERENCE_PRIORITIES.on_green_axis + 10,
          isLocked: true,
        };
      case 'blue':
        return {
          type: 'linear',
          subType: 'on_blue_axis',
          position,
          direction: this.BLUE_AXIS,
          color: INFERENCE_COLORS.BLUE_AXIS,
          screenTip: 'Constrained on Blue Axis',
          priority: INFERENCE_PRIORITIES.on_blue_axis + 10,
          isLocked: true,
        };
      case 'magenta':
        return {
          type: 'linear',
          subType: 'parallel',
          position,
          direction: this.referenceEdge
            ? this.referenceEdge.end.subtract(this.referenceEdge.start).normalize()
            : this.RED_AXIS,
          color: INFERENCE_COLORS.PARALLEL,
          screenTip: 'Constrained Parallel/Perpendicular',
          priority: INFERENCE_PRIORITIES.parallel + 10,
          isLocked: true,
        };
      default:
        return null;
    }
  }

  /**
   * Apply a locked inference (Shift key held)
   */
  private applyLockedInference(
    cursorPosition: Vector3,
    startPoint: Vector3 | null
  ): InferenceResult {
    const locked = this.state.lockedInference!;
    let position = cursorPosition.clone();

    // Apply the locked inference constraint
    if (locked.type === 'linear' && locked.direction && startPoint) {
      position = this.projectToAxis(cursorPosition, startPoint, locked.direction);
    } else if (locked.type === 'point') {
      position = locked.position.clone();
    }

    return {
      position,
      inferences: [{ ...locked, isLocked: true }],
      primaryInference: { ...locked, isLocked: true },
      screenTip: `${locked.screenTip} [Locked]`,
      color: locked.color,
    };
  }

  // ========== PUBLIC API FOR LOCK CONTROL ==========

  /**
   * Lock to a specific axis (Arrow key pressed)
   */
  public lockAxis(axis: InferenceLockAxis): void {
    this.state.lockedAxis = axis;
    this.state.lockedInference = null; // Clear inference lock when axis changes
  }

  /**
   * Unlock axis
   */
  public unlockAxis(): void {
    this.state.lockedAxis = 'none';
  }

  /**
   * Lock the current inference (Shift pressed)
   */
  public lockCurrentInference(): void {
    if (this.state.activeInferences.length > 0) {
      this.state.lockedInference = this.state.activeInferences[0];
    }
  }

  /**
   * Unlock the inference (Shift released)
   */
  public unlockInference(): void {
    this.state.lockedInference = null;
  }

  /**
   * Toggle linear inference mode (Alt/Command key)
   * Cycles: All On → All Off → Parallel/Perpendicular Only → All On
   */
  public toggleLinearInferenceMode(): LinearInferenceMode {
    switch (this.state.linearMode) {
      case 'all_on':
        this.state.linearMode = 'all_off';
        break;
      case 'all_off':
        this.state.linearMode = 'parallel_perpendicular_only';
        break;
      case 'parallel_perpendicular_only':
        this.state.linearMode = 'all_on';
        break;
    }
    return this.state.linearMode;
  }

  /**
   * Set plane lock (for 2D constraints)
   */
  public setPlaneLock(plane: 'none' | 'red' | 'green' | 'blue'): void {
    this.state.planeLock = plane;
  }

  /**
   * Set reference edge for parallel/perpendicular detection
   */
  public setReferenceEdge(start: Vector3, end: Vector3): void {
    this.referenceEdge = { start, end };
  }

  /**
   * Clear all reference geometry
   */
  public clearReferences(): void {
    this.referencePoint = null;
    this.referenceEdge = null;
  }

  /**
   * Get current state
   */
  public getState(): InferenceState {
    return { ...this.state };
  }

  /**
   * Reset all locks and state
   */
  public reset(): void {
    this.state = {
      activeInferences: [],
      lockedAxis: 'none',
      lockedInference: null,
      linearMode: 'all_on',
      planeLock: 'none',
    };
    this.referencePoint = null;
    this.referenceEdge = null;
  }
}

export default InferenceEngine;
