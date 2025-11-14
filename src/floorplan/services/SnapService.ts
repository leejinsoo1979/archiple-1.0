import { Vector2 } from '../../core/math/Vector2';
import { Point } from '../../core/types/Point';

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
  perpendicularSnapEnabled: boolean;
  midpointSnapEnabled: boolean;

  pointSnapThreshold: number;
  gridSize: number;
  angleSnapDegrees: number[];
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
      perpendicularSnapEnabled: true,
      midpointSnapEnabled: true,
      pointSnapThreshold: 15,
      gridSize: 20,
      angleSnapDegrees: [0, 45, 90, 135, 180, 225, 270, 315],
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

    // 2. Midpoint snap
    if (this.config.midpointSnapEnabled) {
      const midpointSnap = this.snapToMidpoint(position);
      if (midpointSnap) return midpointSnap;
    }

    // 3. Angle snap (when drawing from a point)
    if (this.config.angleSnapEnabled && this.lastPoint) {
      const angleSnap = this.snapToAngle(position, this.lastPoint);
      if (angleSnap) return angleSnap;
    }

    // 4. Grid snap (lowest priority)
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
    let minDistance = this.config.pointSnapThreshold;

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

    // Snap if within 10 degrees
    if (minDiff < 10) {
      const radians = (nearestAngle * Math.PI) / 180;
      const snappedX = fromPoint.x + Math.cos(radians) * distance;
      const snappedY = fromPoint.y + Math.sin(radians) * distance;

      return {
        position: new Vector2(snappedX, snappedY),
        snappedTo: 'angle',
      };
    }

    return null;
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
