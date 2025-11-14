import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import { eventBus } from '../../core/events/EventBus';
import { FloorEvents } from '../../core/events/FloorEvents';

export interface SnapResult {
  position: Vector2;
  snappedTo: 'point' | 'grid' | 'midpoint' | 'perpendicular' | 'angle' | 'none';
  snapPoint?: Point;
}

export interface SnapConfig {
  enabled: boolean;
  pointSnapEnabled: boolean;
  gridSnapEnabled: boolean;
  angleSnapEnabled: boolean;
  orthogonalSnapEnabled: boolean; // Force horizontal/vertical only
  perpendicularSnapEnabled: boolean;
  midpointSnapEnabled: boolean;

  pointSnapThreshold: number;
  gridSize: number;
  angleSnapDegrees: number[];
  orthogonalAngles: number[]; // [0, 90, 180, 270] for strict horizontal/vertical
}

/**
 * SnapService - Advanced snapping system (Coohom-level)
 *
 * Priority order:
 * 1. Point snap (highest priority)
 * 2. Midpoint snap
 * 3. Perpendicular snap
 * 4. Angle snap
 * 5. Grid snap
 */
export class SnapService {
  private config: SnapConfig;
  private points: Point[] = [];
  private lastPoint: Vector2 | null = null;

  constructor(config?: Partial<SnapConfig>) {
    this.config = {
      enabled: true,
      pointSnapEnabled: true,
      gridSnapEnabled: true,
      angleSnapEnabled: true,
      orthogonalSnapEnabled: false, // Smart snap: only when near horizontal/vertical
      perpendicularSnapEnabled: true,
      midpointSnapEnabled: true,
      pointSnapThreshold: 15,
      gridSize: 20,
      angleSnapDegrees: [0, 90, 180, 270], // Only 90 degree angles
      orthogonalAngles: [0, 90, 180, 270], // Strict horizontal/vertical
      ...config,
    };
  }

  /**
   * Update snap configuration
   */
  updateConfig(config: Partial<SnapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set available points for snapping
   */
  setPoints(points: Point[]): void {
    this.points = points;
  }

  /**
   * Set last placed point (for angle snap)
   */
  setLastPoint(point: Vector2 | null): void {
    this.lastPoint = point;
  }

  /**
   * Main snap function
   */
  snap(position: Vector2): SnapResult {
    if (!this.config.enabled) {
      return { position, snappedTo: 'none' };
    }

    // 1. Point snap (highest priority)
    if (this.config.pointSnapEnabled) {
      const pointSnap = this.snapToPoint(position);
      if (pointSnap) return pointSnap;
    }

    // 2. Orthogonal snap (when Shift key pressed - takes priority over everything)
    if (this.config.orthogonalSnapEnabled && this.lastPoint) {
      const orthogonalSnap = this.snapToOrthogonal(position, this.lastPoint);
      if (orthogonalSnap) return orthogonalSnap;
    }

    // 3. Axis alignment snap (ONLY when creating perfect 90° angles)
    const axisSnap = this.snapToAxisAlignment(position);
    if (axisSnap) return axisSnap;

    // 4. Midpoint snap
    if (this.config.midpointSnapEnabled) {
      const midpointSnap = this.snapToMidpoint(position);
      if (midpointSnap) return midpointSnap;
    }

    // 5. Angle snap (when drawing from a point)
    if (this.config.angleSnapEnabled && this.lastPoint && !this.config.orthogonalSnapEnabled) {
      const angleSnap = this.snapToAngle(position, this.lastPoint);
      if (angleSnap) return angleSnap;
    }

    // 6. Grid snap (lowest priority)
    if (this.config.gridSnapEnabled) {
      return this.snapToGrid(position);
    }

    return { position, snappedTo: 'none' };
  }

  /**
   * Snap to nearest point
   */
  private snapToPoint(position: Vector2): SnapResult | null {
    let nearestPoint: Point | null = null;
    let minDistance = this.config.pointSnapThreshold * 1.5; // Increase snap range for easier connection

    for (const point of this.points) {
      const pointVec = new Vector2(point.x, point.y);
      const distance = position.distanceTo(pointVec);

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    if (nearestPoint) {
      return {
        position: new Vector2(nearestPoint.x, nearestPoint.y),
        snappedTo: 'point',
        snapPoint: nearestPoint,
      };
    }

    return null;
  }

  /**
   * Snap to grid
   */
  private snapToGrid(position: Vector2): SnapResult {
    const gridSize = this.config.gridSize;
    const snappedX = Math.round(position.x / gridSize) * gridSize;
    const snappedY = Math.round(position.y / gridSize) * gridSize;

    // Emit grid snap event
    eventBus.emit(FloorEvents.GRID_SNAP_UPDATED, {
      point: { id: 'grid-snap', x: snappedX, y: snappedY },
    });

    return {
      position: new Vector2(snappedX, snappedY),
      snappedTo: 'grid',
    };
  }

  /**
   * Snap to angle (0°, 45°, 90°, etc.)
   */
  private snapToAngle(position: Vector2, fromPoint: Vector2): SnapResult | null {
    const dx = position.x - fromPoint.x;
    const dy = position.y - fromPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) return null; // Too close to origin

    const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const angles = this.config.angleSnapDegrees;

    // Find nearest snap angle
    let nearestAngle = angles[0];
    let minDiff = Math.abs(this.angleDifference(currentAngle, angles[0]));

    for (const angle of angles) {
      const diff = Math.abs(this.angleDifference(currentAngle, angle));
      if (diff < minDiff) {
        minDiff = diff;
        nearestAngle = angle;
      }
    }

    // Snap if within 15 degrees (more forgiving for orthogonal snap)
    if (minDiff < 15) {
      const radians = (nearestAngle * Math.PI) / 180;
      const snappedX = fromPoint.x + Math.cos(radians) * distance;
      const snappedY = fromPoint.y + Math.sin(radians) * distance;

      // Emit angle guide event
      eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, {
        from: { id: 'angle-guide', x: fromPoint.x, y: fromPoint.y },
        angle: nearestAngle,
      });

      return {
        position: new Vector2(snappedX, snappedY),
        snappedTo: 'angle',
      };
    }

    return null;
  }

  /**
   * Snap to orthogonal (horizontal/vertical only)
   * Forces 0°, 90°, 180°, 270° angles
   */
  private snapToOrthogonal(position: Vector2, fromPoint: Vector2): SnapResult {
    const dx = position.x - fromPoint.x;
    const dy = position.y - fromPoint.y;

    // Determine if more horizontal or vertical
    const isMoreHorizontal = Math.abs(dx) > Math.abs(dy);

    let snappedX: number, snappedY: number, angle: number;

    if (isMoreHorizontal) {
      // Snap to horizontal (0° or 180°)
      snappedX = position.x;
      snappedY = fromPoint.y;
      angle = dx >= 0 ? 0 : 180;
    } else {
      // Snap to vertical (90° or 270°)
      snappedX = fromPoint.x;
      snappedY = position.y;
      angle = dy >= 0 ? 90 : 270;
    }

    // Emit orthogonal guide event
    eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, {
      from: { id: 'orthogonal-guide', x: fromPoint.x, y: fromPoint.y },
      angle,
    });

    return {
      position: new Vector2(snappedX, snappedY),
      snappedTo: 'angle',
    };
  }

  /**
   * Snap to midpoint of existing lines
   */
  private snapToMidpoint(_position: Vector2): SnapResult | null {
    // TODO: Implement midpoint snap for walls
    // This requires wall data, will implement in Phase 3
    return null;
  }

  /**
   * Snap to axis alignment with existing points
   * ONLY snaps when forming perfect right angles (90°)
   * Requires lastPoint to determine if alignment creates perpendicular angle
   */
  private snapToAxisAlignment(position: Vector2): SnapResult | null {
    if (!this.lastPoint) return null;

    const threshold = 15; // Snap tolerance in pixels
    const dx = position.x - this.lastPoint.x;
    const dy = position.y - this.lastPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) return null; // Too close

    // Calculate current angle from lastPoint
    const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    const normalizedAngle = ((currentAngle % 360) + 360) % 360;

    // Check if angle is close to 0°, 90°, 180°, or 270° (within 15 degrees)
    const angles = [0, 90, 180, 270];
    let nearestAngle: number | null = null;
    let minAngleDiff = 15; // Maximum 15 degree tolerance

    for (const angle of angles) {
      const diff = Math.abs(this.angleDifference(normalizedAngle, angle));
      if (diff < minAngleDiff) {
        minAngleDiff = diff;
        nearestAngle = angle;
      }
    }

    // Only snap if close to a right angle
    if (nearestAngle !== null) {
      // Find closest point to align with
      let snapPoint: Point | null = null;
      let minDist = threshold;

      for (const point of this.points) {
        // Skip lastPoint
        if (this.lastPoint.x === point.x && this.lastPoint.y === point.y) continue;

        let dist: number;
        if (nearestAngle === 0 || nearestAngle === 180) {
          // Horizontal - find points with matching Y
          dist = Math.abs(position.y - point.y);
        } else {
          // Vertical - find points with matching X
          dist = Math.abs(position.x - point.x);
        }

        if (dist < minDist) {
          minDist = dist;
          snapPoint = point;
        }
      }

      // Apply snap
      let snappedX: number, snappedY: number;

      if (nearestAngle === 0 || nearestAngle === 180) {
        // Horizontal snap
        snappedX = position.x;
        snappedY = snapPoint ? snapPoint.y : this.lastPoint.y;
      } else {
        // Vertical snap
        snappedX = snapPoint ? snapPoint.x : this.lastPoint.x;
        snappedY = position.y;
      }

      // Emit guide
      eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, {
        from: { id: 'right-angle-guide', x: this.lastPoint.x, y: this.lastPoint.y },
        angle: nearestAngle,
      });

      return {
        position: new Vector2(snappedX, snappedY),
        snappedTo: 'angle',
      };
    }

    return null;
  }

  /**
   * Calculate angle difference (handles wraparound)
   */
  private angleDifference(angle1: number, angle2: number): number {
    let diff = angle1 - angle2;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
  }

  /**
   * Get snap config
   */
  getConfig(): SnapConfig {
    return { ...this.config };
  }
}
