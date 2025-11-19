import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import { eventBus } from '../../core/events/EventBus';
import { FloorEvents } from '../../core/events/FloorEvents';

export interface SnapResult {
  position: Vector2;
  snappedTo: 'point' | 'wall' | 'grid' | 'midpoint' | 'perpendicular' | 'angle' | 'none';
  snapPoint?: Point;
}

export interface SnapConfig {
  enabled: boolean;
  pointSnapEnabled: boolean;
  wallSnapEnabled: boolean;
  gridSnapEnabled: boolean;
  angleSnapEnabled: boolean;
  orthogonalSnapEnabled: boolean; // Force horizontal/vertical only
  perpendicularSnapEnabled: boolean;
  midpointSnapEnabled: boolean;

  pointSnapThreshold: number; // In world space (mm)
  wallSnapThreshold: number; // Distance to snap to wall (mm)
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
  private walls: Wall[] = [];
  private pointMap: Map<string, Point> = new Map();
  private lastPoint: Vector2 | null = null;

  constructor(config?: Partial<SnapConfig>) {
    this.config = {
      enabled: true,
      pointSnapEnabled: true,
      wallSnapEnabled: false, // DISABLED - causes wall disappearing bug
      gridSnapEnabled: false, // DISABLED - free drawing with 1mm precision
      angleSnapEnabled: true, // ENABLED - angle guides (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
      orthogonalSnapEnabled: false, // DISABLED by default - enable with Shift key
      perpendicularSnapEnabled: false, // DISABLED - free drawing
      midpointSnapEnabled: false, // DISABLED - free drawing
      pointSnapThreshold: 150, // 150mm = 15cm snap range (zoom independent)
      wallSnapThreshold: 50, // 50mm = 5cm snap range for walls
      gridSize: 100, // 100mm grid display only
      angleSnapDegrees: [0, 45, 90, 135, 180, 225, 270, 315], // 8-direction angle snap
      orthogonalAngles: [0, 90, 180, 270], // Orthogonal angles for Shift key
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
    // Update point map
    this.pointMap.clear();
    points.forEach(p => this.pointMap.set(p.id, p));
  }

  /**
   * Set available walls for snapping
   */
  setWalls(walls: Wall[]): void {
    this.walls = walls;
  }

  /**
   * Set last placed point (for angle snap)
   */
  setLastPoint(point: Vector2 | null): void {
    this.lastPoint = point;
  }

  /**
   * Snap coordinate to 1mm precision
   * Always use 1mm precision for accurate drawing
   */
  private snapToPrecision(value: number): number {
    const precision = 1; // 1mm precision
    return Math.round(value / precision) * precision;
  }

  /**
   * Main snap function
   */
  snap(position: Vector2): SnapResult {
    if (!this.config.enabled) {
      return { position, snappedTo: 'none' };
    }

    // Clear transient guides at the start of each snap cycle
    eventBus.emit(FloorEvents.VERTICAL_GUIDE_CLEARED, {});
    eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_CLEARED, {});
    // Note: We don't clear ANGLE_GUIDE here because it might be used by other snaps, 
    // but we should probably reset it if no snap occurs.
    // For now, let's rely on the specific snap methods to emit ANGLE_GUIDE_UPDATED if needed.
    // Actually, if we don't emit it, the layer keeps the old one. 
    // We should probably emit a "clear" if no snap happens at the end.

    // 1. Point snap (highest priority - snap to existing points)
    if (this.config.pointSnapEnabled) {
      const pointSnap = this.snapToPoint(position);
      if (pointSnap) {
        console.log('[SnapService] Point snap triggered');
        // Clear angle guide when point snapping
        eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, { from: null, angle: null });
        return pointSnap;
      }
    }

    // 2. Wall snap (snap to existing walls)
    if (this.config.wallSnapEnabled) {
      const wallSnap = this.snapToWall(position);
      if (wallSnap) {
        console.log('[SnapService] Wall snap triggered');
        return wallSnap;
      }
    }

    // 3. Orthogonal snap (when Shift key pressed)
    if (this.config.orthogonalSnapEnabled && this.lastPoint) {
      const orthogonalSnap = this.snapToOrthogonal(position, this.lastPoint);
      if (orthogonalSnap) {
        console.log('[SnapService] Orthogonal snap triggered');
        return orthogonalSnap;
      }
    }

    // 3.5 Intersection Snap (Smart Guides) - HIGH PRIORITY
    // Automatically finds rectangle corners
    if (this.lastPoint) {
      const intersectionSnap = this.snapToIntersection(position, this.lastPoint);
      if (intersectionSnap) {
        console.log('[SnapService] Intersection snap triggered');
        return intersectionSnap;
      }
    }

    // 4. Axis alignment snap - SECOND PRIORITY (before angle snap)
    // Locks axis when aligned with existing points
    const axisSnap = this.snapToAxisAlignment(position);
    if (axisSnap) {
      console.log('[SnapService] Axis snap triggered');
      return axisSnap;
    }

    // 5. Angle snap (when drawing from a point)
    if (this.config.angleSnapEnabled && this.lastPoint && !this.config.orthogonalSnapEnabled) {
      const angleSnap = this.snapToAngle(position, this.lastPoint);
      if (angleSnap) {
        console.log('[SnapService] Angle snap triggered');
        return angleSnap;
      }
    }

    // 6. Midpoint snap
    if (this.config.midpointSnapEnabled) {
      const midpointSnap = this.snapToMidpoint(position);
      if (midpointSnap) return midpointSnap;
    }

    // 7. Grid snap (lowest priority)
    if (this.config.gridSnapEnabled) {
      return this.snapToGrid(position);
    }

    // No snap - return position with 1mm precision
    console.log('[SnapService] No snap - free position');
    return {
      position: new Vector2(
        this.snapToPrecision(position.x),
        this.snapToPrecision(position.y)
      ),
      snappedTo: 'none'
    };
  }

  /**
   * Snap to nearest wall
   * Finds closest point on any wall within threshold
   */
  private snapToWall(position: Vector2): SnapResult | null {
    if (this.walls.length === 0) return null;

    let nearestWall: Wall | null = null;
    let nearestPoint: Vector2 | null = null;
    let minDistance = this.config.wallSnapThreshold;

    for (const wall of this.walls) {
      const startPt = this.pointMap.get(wall.startPointId);
      const endPt = this.pointMap.get(wall.endPointId);

      if (!startPt || !endPt) continue;

      const wallStart = new Vector2(startPt.x, startPt.y);
      const wallEnd = new Vector2(endPt.x, endPt.y);

      // Calculate closest point on wall line segment
      const closestPoint = this.closestPointOnLineSegment(position, wallStart, wallEnd);
      const distance = position.distanceTo(closestPoint);

      if (distance < minDistance) {
        minDistance = distance;
        nearestWall = wall;
        nearestPoint = closestPoint;
      }
    }

    if (nearestWall && nearestPoint) {
      // Create a temporary point for snap indicator
      const snapPoint: Point = {
        id: 'wall-snap-temp',
        x: nearestPoint.x,
        y: nearestPoint.y,
        connectedWalls: []
      };

      return {
        position: nearestPoint,
        snappedTo: 'wall',
        snapPoint: snapPoint,
      };
    }

    return null;
  }

  /**
   * Calculate closest point on line segment
   */
  private closestPointOnLineSegment(point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 {
    const px = point.x - lineStart.x;
    const py = point.y - lineStart.y;
    const lx = lineEnd.x - lineStart.x;
    const ly = lineEnd.y - lineStart.y;
    const lineLengthSq = lx * lx + ly * ly;

    if (lineLengthSq === 0) {
      return lineStart.clone();
    }

    const t = Math.max(0, Math.min(1, (px * lx + py * ly) / lineLengthSq));
    const closestX = lineStart.x + t * lx;
    const closestY = lineStart.y + t * ly;

    return new Vector2(
      this.snapToPrecision(closestX),
      this.snapToPrecision(closestY)
    );
  }

  /**
   * Snap to nearest point
   * Use small threshold to not interfere with axis alignment
   */
  private snapToPoint(position: Vector2): SnapResult | null {
    let nearestPoint: Point | null = null;
    let minDistance = 30; // 30mm - very tight snap range to not interfere with axis snap

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
    // Snap to gridSize precision (coordinates are already in mm)
    const snapPrecision = this.config.gridSize;
    const snappedX = Math.round(position.x / snapPrecision) * snapPrecision;
    const snappedY = Math.round(position.y / snapPrecision) * snapPrecision;

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
      const snappedX = this.snapToPrecision(fromPoint.x + Math.cos(radians) * distance);
      const snappedY = this.snapToPrecision(fromPoint.y + Math.sin(radians) * distance);

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
      snappedX = this.snapToPrecision(position.x);
      snappedY = this.snapToPrecision(fromPoint.y);
      angle = dx >= 0 ? 0 : 180;
    } else {
      // Snap to vertical (90° or 270°)
      snappedX = this.snapToPrecision(fromPoint.x);
      snappedY = this.snapToPrecision(position.y);
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
   * When X or Y axis aligns with existing point, LOCK that axis
   */
  private snapToAxisAlignment(position: Vector2): SnapResult | null {
    if (this.points.length === 0) return null;

    const threshold = 500; // Increased threshold for easier snapping (500mm = 50cm)

    // Find closest point to align with vertically or horizontally
    let snapPointVertical: Point | null = null;
    let snapPointHorizontal: Point | null = null;
    let minDistVertical = threshold;
    let minDistHorizontal = threshold;

    for (const point of this.points) {
      // Vertical alignment (matching X coordinate) - creates vertical line
      const distX = Math.abs(position.x - point.x);
      if (distX < minDistVertical) {
        minDistVertical = distX;
        snapPointVertical = point;
      }

      // Horizontal alignment (matching Y coordinate) - creates horizontal line
      const distY = Math.abs(position.y - point.y);
      if (distY < minDistHorizontal) {
        minDistHorizontal = distY;
        snapPointHorizontal = point;
      }
    }

    // Prioritize the closer alignment
    if (snapPointVertical || snapPointHorizontal) {
      let snappedX = this.snapToPrecision(position.x);
      let snappedY = this.snapToPrecision(position.y);
      let guideAngle: number | null = null;
      let guideFrom: Point | null = null;

      if (snapPointVertical && (!snapPointHorizontal || minDistVertical <= minDistHorizontal)) {
        // Vertical alignment - LOCK X coordinate to create vertical line
        snappedX = this.snapToPrecision(snapPointVertical.x);
        snappedY = this.snapToPrecision(position.y); // Y is free to move
        guideAngle = 90; // Vertical guide
        guideFrom = snapPointVertical;
      } else if (snapPointHorizontal) {
        // Horizontal alignment - LOCK Y coordinate to create horizontal line
        snappedX = this.snapToPrecision(position.x); // X is free to move
        snappedY = this.snapToPrecision(snapPointHorizontal.y);
        guideAngle = 0; // Horizontal guide
        guideFrom = snapPointHorizontal;
      }

      // Emit vertical or horizontal guide line
      if (guideFrom && guideAngle !== null) {
        eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, {
          from: { id: 'axis-alignment-guide', x: guideFrom.x, y: guideFrom.y },
          angle: guideAngle,
        });
      }

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

  /**
   * Snap to intersection of orthogonal lines from last point and other points
   * This allows closing rectangles perfectly (U -> Square)
   */
  private snapToIntersection(position: Vector2, lastPoint: Vector2): SnapResult | null {
    if (this.points.length === 0) return null;

    const threshold = 500; // 500mm threshold

    for (const point of this.points) {
      // Skip if point is the last point itself
      if (point.x === lastPoint.x && point.y === lastPoint.y) continue;

      // Case 1: Horizontal from lastPoint + Vertical from point
      // Intersection is (point.x, lastPoint.y)
      const intersection1 = new Vector2(point.x, lastPoint.y);
      const dist1 = position.distanceTo(intersection1);
      if (dist1 < threshold) {
        console.log('[SnapService] Intersection Case 1 found:', intersection1, 'Distance:', dist1);
        // Emit guides
        eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, {
          from: { id: 'intersection-h', x: lastPoint.x, y: lastPoint.y },
          angle: 0, // Horizontal from lastPoint
        });

        eventBus.emit(FloorEvents.VERTICAL_GUIDE_UPDATED, {
          x: point.x,
          fromY: -1000000,
          toY: 1000000,
        });

        // Highlight the reference point
        eventBus.emit(FloorEvents.POINT_HOVERED, { point });

        return {
          position: intersection1,
          snappedTo: 'perpendicular', // Treat as perpendicular/intersection
        };
      }

      // Case 2: Vertical from lastPoint + Horizontal from point
      // Intersection is (lastPoint.x, point.y)
      const intersection2 = new Vector2(lastPoint.x, point.y);
      const dist2 = position.distanceTo(intersection2);
      if (dist2 < threshold) {
        console.log('[SnapService] Intersection Case 2 found:', intersection2, 'Distance:', dist2);

        // Emit guides
        eventBus.emit(FloorEvents.ANGLE_GUIDE_UPDATED, {
          from: { id: 'intersection-v', x: lastPoint.x, y: lastPoint.y },
          angle: 90, // Vertical from lastPoint
        });

        eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_UPDATED, {
          y: point.y,
          fromX: -1000000,
          toX: 1000000,
        });

        // Highlight the reference point
        eventBus.emit(FloorEvents.POINT_HOVERED, { point });

        return {
          position: intersection2,
          snappedTo: 'perpendicular',
        };
      }
    }

    return null;
  }
}
