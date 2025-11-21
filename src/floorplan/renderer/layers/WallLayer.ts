import { BaseLayer } from './Layer';
import type { Wall } from '../../../core/types/Wall';
import type { Point } from '../../../core/types/Point';
import type { Door } from '../../../core/types/Door';
import type { Room } from '../../../core/types/Room';
import type { Camera2D } from '../Camera2D';
import { Vector2 } from '../../../core/math/Vector2';

export interface WallLayerConfig {
  wallColor?: string;
  wallThickness?: number;
  previewColor?: string;
  previewStyle?: 'solid' | 'dashed';
}

/**
 * WallLayer - Renders walls
 *
 * Features:
 * - Solid walls (confirmed)
 * - Preview walls (dashed, while drawing)
 * - Thickness visualization
 * - Hover highlight
 * - Mitered corners (45 degrees)
 *
 * Units:
 * - Point coordinates are in mm (world space)
 * - Wall thickness: mm (200mm = 20cm)
 * - Camera transforms mm coordinates to screen px
 */
interface DimensionHitbox {
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderSegment {
  wallId: string;
  start: Point;
  end: Point;
  thickness: number;
  isHole?: boolean;
}

export class WallLayer extends BaseLayer {
  private walls: Wall[] = [];
  private points: Map<string, Point> = new Map();
  private rooms: Room[] = [];
  private doors: Door[] = [];
  private previewWall: { start: Point; end: Point } | null = null;
  private hoveredWallId: string | null = null;
  private selectedWallId: string | null = null;
  private camera: Camera2D | null = null;
  private dimensionHitboxes: DimensionHitbox[] = [];
  private renderStyle: 'wireframe' | 'hidden-line' | 'solid' | 'realistic' = 'solid';

  // Angle guide state
  private angleGuide: { from: Point; angle: number } | null = null;

  private config: Required<WallLayerConfig>;

  // Connectivity map for corner calculations
  // pointId -> list of connected wall IDs
  private connectivityMap: Map<string, string[]> = new Map();

  constructor(config?: WallLayerConfig) {
    super(2); // z-index: 2

    this.config = {
      wallColor: config?.wallColor || '#2c3e50',
      wallThickness: config?.wallThickness || 100, // 100mm = 10cm
      previewColor: config?.previewColor || '#3498db',
      previewStyle: config?.previewStyle || 'dashed',
    };
  }


  setWalls(walls: Wall[]): void {
    this.walls = walls;
    this.updateConnectivity();
  }

  setPoints(points: Point[]): void {
    this.points.clear();
    points.forEach((p) => this.points.set(p.id, p));
  }

  setRooms(rooms: Room[]): void {
    this.rooms = rooms;
  }

  setDoors(doors: Door[]): void {
    this.doors = doors;
  }

  setPreviewWall(start: Point | null, end: Point | null): void {
    if (start && end) {
      this.previewWall = { start, end };
    } else {
      this.previewWall = null;
    }
  }

  setHoveredWall(wallId: string | null): void {
    this.hoveredWallId = wallId;
  }

  setSelectedWall(wallId: string | null): void {
    this.selectedWallId = wallId;
  }

  setCamera(camera: Camera2D): void {
    this.camera = camera;
  }

  setRenderStyle(style: 'wireframe' | 'hidden-line' | 'solid' | 'realistic'): void {
    this.renderStyle = style;
  }

  setAngleGuide(from: Point | null, angle: number | null): void {
    if (from && angle !== null) {
      this.angleGuide = { from, angle };
    } else {
      this.angleGuide = null;
    }
  }

  private updateConnectivity(): void {
    this.connectivityMap.clear();
    this.walls.forEach(wall => {
      // Add to start point
      if (!this.connectivityMap.has(wall.startPointId)) {
        this.connectivityMap.set(wall.startPointId, []);
      }
      this.connectivityMap.get(wall.startPointId)?.push(wall.id);

      // Add to end point
      if (!this.connectivityMap.has(wall.endPointId)) {
        this.connectivityMap.set(wall.endPointId, []);
      }
      this.connectivityMap.get(wall.endPointId)?.push(wall.id);
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    // Update connectivity map before rendering
    this.updateConnectivity();

    // Clear hitboxes for this frame
    this.dimensionHitboxes = [];

    // Generate segments for all walls
    const segments = this.generateRenderSegments();

    // Build connectivity map for segments
    // Map<PointID, RenderSegment[]>
    const segmentMap = new Map<string, RenderSegment[]>();

    segments.forEach(seg => {
      if (seg.isHole) return; // Don't connect to holes? Actually we might need them for continuity, but for rendering corners, holes don't contribute geometry.
      // Wait, if a wall connects to a door edge, we need to know.
      // But usually walls connect to the main wall points.

      const add = (pid: string) => {
        if (!segmentMap.has(pid)) segmentMap.set(pid, []);
        segmentMap.get(pid)!.push(seg);
      };
      add(seg.start.id);
      add(seg.end.id);
    });

    // Render segments
    segments.forEach(segment => {
      if (segment.isHole) return;

      const isHovered = segment.wallId === this.hoveredWallId;
      const isSelected = segment.wallId === this.selectedWallId;

      this.renderSegment(ctx, segment, segmentMap, isHovered, isSelected);
    });

    // Render wall dimensions (keep original logic for now, or update to use segments if needed)
    // For dimensions, we probably still want the full wall length, so using this.walls is fine.
    this.walls.forEach((wall) => {
      this.renderWallDimension(ctx, wall);
    });

    // Render preview wall
    if (this.previewWall) {
      this.renderPreviewWall(ctx, this.previewWall.start, this.previewWall.end);
    }

    // Render angle guide
    if (this.angleGuide) {
      this.renderAngleGuide(ctx, this.angleGuide.from, this.angleGuide.angle);
    }

    this.resetOpacity(ctx);
  }

  /**
   * Represents a portion of a wall to be rendered.
   * A single wall might be split into multiple segments by T-junctions.
   */
  private generateRenderSegments(): RenderSegment[] {
    const segments: RenderSegment[] = [];

    // Helper to find points on a wall
    const getPointsOnWall = (wall: Wall): { point: Point, t: number, isEndpoint: boolean }[] => {
      const points: { point: Point, t: number, isEndpoint: boolean }[] = [];
      const start = this.points.get(wall.startPointId)!;
      const end = this.points.get(wall.endPointId)!;
      const startVec = Vector2.from(start);
      const endVec = Vector2.from(end);
      const wallVec = endVec.subtract(startVec);
      const wallLengthSq = wallVec.lengthSquared();

      // Add endpoints
      points.push({ point: start, t: 0, isEndpoint: true });
      points.push({ point: end, t: 1, isEndpoint: true });

      // Find other wall endpoints that lie on this wall
      this.walls.forEach(otherWall => {
        if (otherWall.id === wall.id) return;

        const checkPoint = (pid: string) => {
          const p = this.points.get(pid);
          if (!p) return;

          // Skip if this point is already one of our endpoints
          if (p.id === wall.startPointId || p.id === wall.endPointId) return;

          const pVec = Vector2.from(p);
          const toP = pVec.subtract(startVec);

          // Project p onto wall line
          const t = toP.dot(wallVec) / wallLengthSq;

          // Check if on segment (with small epsilon)
          if (t > 0.001 && t < 0.999) {
            // Check distance from line to ensure it's actually on the wall
            const projected = startVec.add(wallVec.multiply(t));
            const dist = pVec.distanceTo(projected);

            if (dist < 10) { // 10mm tolerance
              points.push({ point: p, t, isEndpoint: false });
            }
          }
        };

        checkPoint(otherWall.startPointId);
        checkPoint(otherWall.endPointId);
      });

      // Add door endpoints
      this.doors.forEach(door => {
        if (door.wallId !== wall.id) return;

        // Door position is 0-1 along the wall
        // We assume position is the CENTER of the door
        const wallLength = Math.sqrt(wallLengthSq);
        const halfWidthT = (door.width / 2) / wallLength;

        const startT = Math.max(0, door.position - halfWidthT);
        const endT = Math.min(1, door.position + halfWidthT);

        // Create points for door start/end
        // We need unique IDs for these temporary points
        const startP = startVec.add(wallVec.multiply(startT));
        const endP = startVec.add(wallVec.multiply(endT));

        points.push({
          point: { id: `door-${door.id}-start`, x: startP.x, y: startP.y },
          t: startT,
          isEndpoint: false
        });
        points.push({
          point: { id: `door-${door.id}-end`, x: endP.x, y: endP.y },
          t: endT,
          isEndpoint: false
        });
      });

      return points.sort((a, b) => a.t - b.t);
    };

    this.walls.forEach(wall => {
      const pointsOnWall = getPointsOnWall(wall);

      // Create segments between consecutive points
      for (let i = 0; i < pointsOnWall.length - 1; i++) {
        const p1 = pointsOnWall[i];
        const p2 = pointsOnWall[i + 1];

        // Check if this segment is a hole (inside a door)
        const midT = (p1.t + p2.t) / 2;
        const isHole = this.doors.some(door => {
          if (door.wallId !== wall.id) return false;
          const wallLength = Vector2.from(this.points.get(wall.endPointId)!).distance(Vector2.from(this.points.get(wall.startPointId)!));
          const halfWidthT = (door.width / 2) / wallLength;
          const startT = door.position - halfWidthT;
          const endT = door.position + halfWidthT;
          return midT >= startT && midT <= endT;
        });

        segments.push({
          wallId: wall.id,
          start: p1.point,
          end: p2.point,
          thickness: this.config.wallThickness,
          isHole
        });
      }
    });

    return segments;
  }

  private renderSegment(
    ctx: CanvasRenderingContext2D,
    segment: RenderSegment,
    segmentMap: Map<string, RenderSegment[]>,
    isHovered: boolean,
    isSelected: boolean
  ): void {
    if (segment.isHole) return;

    const start = Vector2.from(segment.start);
    const end = Vector2.from(segment.end);

    // Calculate corners at start and end using segment connectivity
    const startCorners = this.calculateJointCorners(segment.start, start, end, segment, segmentMap);
    const endCorners = this.calculateJointCorners(segment.end, end, start, segment, segmentMap);

    // startCorners returns { left, right } relative to the direction AWAY from the joint
    // For segment start: direction is Start->End. 
    // But calculateJointCorners expects 'dir' to be OUT of the joint.
    // So for Start point: dir is Start->End.
    // For End point: dir is End->Start.

    // Construct the polygon
    // We need to map 'left' and 'right' correctly.
    // Let's define 'left' as being on the left side when looking from Start to End.

    // At Start point (looking Start->End):
    // startCorners.left is on the left.
    // startCorners.right is on the right.

    // At End point (looking End->Start):
    // endCorners.left is on the left (relative to End->Start), which is RIGHT relative to Start->End.
    // endCorners.right is on the right (relative to End->Start), which is LEFT relative to Start->End.

    // Let's visualize:
    // Start -> End direction. Normal is to the Left (standard 2D geometry often uses CCW).
    // In our WallLayer, normal was (-dir.y, dir.x).
    // If dir = (1, 0) [Right], normal = (0, 1) [Down]. Wait, canvas Y is down.
    // So (1,0) -> (-0, 1) is +Y (Down). That is "Right" in screen coordinates if Y is down?
    // Let's stick to "Left" and "Right" relative to the wall vector.

    // WallLayer original: normal = (-dir.y, dir.x).
    // If dir=(1,0), normal=(0,1).
    // start + normal = (0,1). This is "Below" the line.
    // start - normal = (0,-1). This is "Above" the line.
    // If we walk (0,0) to (1,0), (0,1) is on our Right.
    // So 'normal' points to the Right.

    // My calculateJointCorners will return 'left' and 'right' relative to the given direction.
    // For Start Node: dir = Start->End. 'left' is Left of vector, 'right' is Right of vector.
    // For End Node: dir = End->Start. 'left' is Left of vector, 'right' is Right of vector.

    // Polygon order (CCW or CW):
    // Start.Left -> End.Right (which is on the same physical side as Start.Left) -> End.Left -> Start.Right -> Close.

    // Wait, if End.Left is Left of End->Start, that means it's Right of Start->End.
    // So:
    // 1. Start.Left
    // 2. End.Right (Left of Start->End)
    // 3. End.Left (Right of Start->End)
    // 4. Start.Right

    // Let's verify with calculateJointCorners implementation.

    const poly = [
      startCorners.left,
      endCorners.right,
      endCorners.left,
      startCorners.right
    ];

    // Determine color
    let color: string;
    const themeColorRaw = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
    const themeColor = themeColorRaw || '#3FAEA7';
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    if (isSelected) {
      color = themeColor;
    } else if (isHovered) {
      color = hexToRgba(themeColor, 0.5);
    } else {
      color = '#505050';
    }

    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    ctx.lineTo(poly[1].x, poly[1].y);
    ctx.lineTo(poly[2].x, poly[2].y);
    ctx.lineTo(poly[3].x, poly[3].y);
    ctx.closePath();

    // Render based on style
    switch (this.renderStyle) {
      case 'wireframe':
        // Only outline, no fill
        // Use selection/hover color for stroke
        ctx.strokeStyle = isSelected || isHovered ? color : this.config.wallColor;
        ctx.lineWidth = isSelected || isHovered ? 2 : 1;
        ctx.stroke();
        break;

      case 'hidden-line':
        // Fill with light color + outline
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        ctx.fill();
        // Use selection/hover color for stroke
        ctx.strokeStyle = isSelected || isHovered ? color : this.config.wallColor;
        ctx.lineWidth = isSelected || isHovered ? 2.5 : 1.5;
        ctx.stroke();
        break;

      case 'realistic':
        // Gradient fill for realistic effect
        const centerX = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
        const centerY = (poly[0].y + poly[1].y + poly[2].y + poly[3].y) / 4;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, this.config.wallThickness / 2);
        // Use selection/hover color for gradient
        const baseColor = isSelected || isHovered ? color : this.config.wallColor;
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, this.darkenColor(baseColor, 0.3));
        ctx.fillStyle = gradient;
        ctx.fill();
        // Subtle outline
        ctx.strokeStyle = this.darkenColor(baseColor, 0.5);
        ctx.lineWidth = isSelected || isHovered ? 1 : 0.5;
        ctx.stroke();
        break;

      case 'solid':
      default:
        // Standard solid fill
        ctx.fillStyle = color;
        ctx.fill();
        break;
    }
  }

  private darkenColor(color: string, amount: number): string {
    // Simple color darkening - works with hex colors
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const newR = Math.max(0, Math.floor(r * (1 - amount)));
    const newG = Math.max(0, Math.floor(g * (1 - amount)));
    const newB = Math.max(0, Math.floor(b * (1 - amount)));

    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  private calculateJointCorners(
    junctionPoint: Point,
    currentStart: Vector2,
    currentEnd: Vector2,
    currentSegment: RenderSegment,
    segmentMap: Map<string, RenderSegment[]>
  ): { left: Vector2, right: Vector2 } {
    const halfThickness = this.config.wallThickness / 2;
    const currentDir = currentEnd.subtract(currentStart).normalize();

    // Get all connected segments at this junction
    const connected = segmentMap.get(junctionPoint.id) || [];

    // Filter and map to vectors
    const connectedSegments: { vec: Vector2, angle: number, segment: RenderSegment, isCurrent: boolean }[] = [];

    connected.forEach(seg => {
      // Determine vector pointing AWAY from junction
      let dir: Vector2;
      if (seg.start.id === junctionPoint.id) {
        dir = Vector2.from(seg.end).subtract(Vector2.from(seg.start)).normalize();
      } else if (seg.end.id === junctionPoint.id) {
        dir = Vector2.from(seg.start).subtract(Vector2.from(seg.end)).normalize();
      } else {
        // Should not happen if map is built correctly
        return;
      }

      // Check if this is the current segment (same object reference)
      const isCurrent = seg === currentSegment;

      connectedSegments.push({
        vec: dir,
        angle: Math.atan2(dir.y, dir.x),
        segment: seg,
        isCurrent
      });
    });

    // Sort segments by angle
    connectedSegments.sort((a, b) => a.angle - b.angle);

    // Find current segment index
    const currentIndex = connectedSegments.findIndex(s => s.isCurrent);

    if (currentIndex === -1) {
      // Should not happen
      const normal = new Vector2(-currentDir.y, currentDir.x);
      return {
        left: currentStart.add(normal.multiply(halfThickness)),
        right: currentStart.subtract(normal.multiply(halfThickness))
      };
    }

    // Find neighbors (cyclic)
    const prevIndex = (currentIndex - 1 + connectedSegments.length) % connectedSegments.length;
    const nextIndex = (currentIndex + 1) % connectedSegments.length;

    const prevSeg = connectedSegments[prevIndex];
    const nextSeg = connectedSegments[nextIndex];

    // If Current is the ONLY segment (endpoint), corners are just perpendicular.
    if (connectedSegments.length === 1) {
      const normal = new Vector2(-currentDir.y, currentDir.x);
      return {
        left: currentStart.add(normal.multiply(halfThickness)),
        right: currentStart.subtract(normal.multiply(halfThickness))
      };
    }

    // Calculate miter vectors
    // Left side interacts with Next segment
    // We pass the vectors pointing AWAY from the junction.
    // calculateMiterVector expects (Dir1, Dir2) where Dir1 is Current and Dir2 is Next?
    // No, calculateMiterVector expects two vectors and finds the intersection of their "left" and "right" offsets.
    // My previous analysis:
    // "Left" of Current meets "Right" of Next.
    // calculateMiterVector(current, next) finds intersection of Left(current) and Right(next).
    const leftMiter = this.calculateMiterVector(currentDir, nextSeg.vec, halfThickness);

    // Right side interacts with Prev segment
    // "Right" of Current meets "Left" of Prev.
    // So we want intersection of Left(Prev) and Right(Current).
    // This is calculateMiterVector(prev, current).
    const rightMiter = this.calculateMiterVector(prevSeg.vec, currentDir, halfThickness);

    return {
      left: currentStart.add(leftMiter),
      right: currentStart.add(rightMiter)
    };
  }

  private calculateMiterVector(dir1: Vector2, dir2: Vector2, offset: number): Vector2 {
    // Returns the vector from the junction point to the intersection of the two offset lines.
    // Line 1: parallel to dir1, at distance 'offset' to the LEFT (rotated 90 deg CCW).
    // Line 2: parallel to dir2, at distance 'offset' to the RIGHT (rotated -90 deg)?

    // Wait, let's standardize.
    // We are looking for the corner between Dir1 and Dir2.
    // In the sorted list: Dir1 -> Dir2.
    // This is the gap "Left" of Dir1 and "Right" of Dir2.
    // So we want intersection of:
    // L1: Left of Dir1.
    // L2: Right of Dir2.

    const normal1 = new Vector2(-dir1.y, dir1.x); // Left of Dir1
    const normal2 = new Vector2(dir2.y, -dir2.x); // Right of Dir2 (CW rotation)

    // If walls are collinear (180 deg), normals are opposite.
    // If walls are same (0 deg), normals are opposite? No.

    // Check angle between walls
    const dot = dir1.dot(dir2);
    if (dot < -0.99) {
      // Collinear, opposite directions (End of one, Start of another).
      // This is a straight wall joint.
      // Miter is just the normal.
      return normal1.multiply(offset);
    }

    // Line 1 point: P + normal1 * offset
    // Line 2 point: P + normal2 * offset
    // We want intersection of these two lines.
    // L1: P + n1*w + t*d1
    // L2: P + n2*w + u*d2
    // n1*w + t*d1 = n2*w + u*d2
    // t*d1 - u*d2 = (n2 - n1)*w

    // Solve for t.
    // Cross product in 2D is determinant.
    // det(d1, -d2) = -d1.x*d2.y + d1.y*d2.x = -(d1 x d2)

    const det = dir2.x * dir1.y - dir2.y * dir1.x; // Cross product (z component)

    if (Math.abs(det) < 0.001) {
      // Parallel lines? Should be caught by dot check, but maybe close.
      return normal1.multiply(offset);
    }

    // Solve system:
    // t * d1.x - u * d2.x = (n2.x - n1.x) * offset
    // t * d1.y - u * d2.y = (n2.y - n1.y) * offset

    // Using Cramer's rule or simple substitution.
    // Vector delta = (n2 - n1) * offset
    // t * d1 - u * d2 = delta
    // Cross both sides with d2:
    // t * (d1 x d2) = delta x d2
    // t = (delta x d2) / (d1 x d2)

    const nDiff = normal2.subtract(normal1).multiply(offset);
    const num = nDiff.x * dir2.y - nDiff.y * dir2.x;
    const den = dir1.x * dir2.y - dir1.y * dir2.x;

    const t = num / den;

    // Result vector is normal1*offset + dir1*t
    return normal1.multiply(offset).add(dir1.multiply(t));
  }





  private renderPreviewWall(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
    ctx.save();

    const thickness = this.config.wallThickness;

    // Draw preview as a simple rectangle (no miter)
    const s = Vector2.from(start);
    const e = Vector2.from(end);
    const dir = e.subtract(s).normalize();
    const normal = new Vector2(-dir.y, dir.x);
    const halfThickness = thickness / 2;

    const p1 = s.add(normal.multiply(halfThickness));
    const p2 = e.add(normal.multiply(halfThickness));
    const p3 = e.subtract(normal.multiply(halfThickness));
    const p4 = s.subtract(normal.multiply(halfThickness));

    // Use dark gray with no transparency
    ctx.fillStyle = '#505050';

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Render angle guide line
   */
  private renderAngleGuide(ctx: CanvasRenderingContext2D, from: Point, angleDeg: number): void {
    ctx.save();

    // Convert angle to radians
    const angleRad = (angleDeg * Math.PI) / 180;

    // Draw a long line in that direction (10000mm = 10m)
    const length = 10000;
    const toX = from.x + Math.cos(angleRad) * length;
    const toY = from.y + Math.sin(angleRad) * length;

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Dashed line style - 다크모드 대응
    ctx.strokeStyle = isDarkMode ? '#64B5F6' : '#3498db';
    ctx.lineWidth = 2; // Thin guide line
    ctx.setLineDash([20, 10]); // Dashed pattern
    ctx.globalAlpha = 0.6;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Render wall dimension label in CAD style with extension lines and arrows
   * Dimensions are ALWAYS placed OUTSIDE the room space
   */
  private renderWallDimension(ctx: CanvasRenderingContext2D, wall: Wall): void {
    if (!this.camera) return;

    const startPoint = this.points.get(wall.startPointId);
    const endPoint = this.points.get(wall.endPointId);

    if (!startPoint || !endPoint) return;

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distanceMm = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // CAD-style configuration
    const wallHalfThickness = this.config.wallThickness / 2; // 50mm (half of 100mm)
    const extensionGap = 100; // 100mm gap from wall surface
    const offsetDistanceMm = 600; // 600mm offset for dimension line from wall surface
    const extensionOverhang = 100; // Extension line extends 100mm beyond dimension line

    // Calculate perpendicular offset direction
    // Find which room this wall belongs to and place dimension OUTSIDE the room
    let perpX = -Math.sin(angle); // Default: left side
    let perpY = Math.cos(angle);

    // Find the room containing this wall
    const parentRoom = this.rooms.find(room => room.walls.includes(wall.id));

    if (parentRoom && parentRoom.points.length > 0) {
      // Calculate room centroid
      let centerX = 0;
      let centerY = 0;
      parentRoom.points.forEach(pointId => {
        const point = this.points.get(pointId);
        if (point) {
          centerX += point.x;
          centerY += point.y;
        }
      });
      centerX /= parentRoom.points.length;
      centerY /= parentRoom.points.length;

      // Calculate wall midpoint
      const wallMidX = (startPoint.x + endPoint.x) / 2;
      const wallMidY = (startPoint.y + endPoint.y) / 2;

      // Vector from room center to wall midpoint
      const toWallX = wallMidX - centerX;
      const toWallY = wallMidY - centerY;

      // Two possible perpendicular directions
      const perp1X = -Math.sin(angle);
      const perp1Y = Math.cos(angle);
      const perp2X = Math.sin(angle);
      const perp2Y = -Math.cos(angle);

      // Choose the direction that points AWAY from room center
      // Dot product with toWall vector: positive means same direction (away from center)
      const dot1 = perp1X * toWallX + perp1Y * toWallY;
      const dot2 = perp2X * toWallX + perp2Y * toWallY;

      if (dot2 > dot1) {
        perpX = perp2X;
        perpY = perp2Y;
      }
    }

    // Start extension lines from wall inner edge (center - half thickness on inside)
    // perpX/perpY points OUTWARD, so we need to go INWARD (opposite direction) by wallHalfThickness
    const innerEdgeOffset = -wallHalfThickness + extensionGap;
    const ext1StartX = startPoint.x + perpX * innerEdgeOffset;
    const ext1StartY = startPoint.y + perpY * innerEdgeOffset;
    const ext2StartX = endPoint.x + perpX * innerEdgeOffset;
    const ext2StartY = endPoint.y + perpY * innerEdgeOffset;

    // Extension line end points (beyond dimension line) - from inner edge
    const totalExtension = -wallHalfThickness + extensionGap + offsetDistanceMm + extensionOverhang;
    const ext1EndX = startPoint.x + perpX * totalExtension;
    const ext1EndY = startPoint.y + perpY * totalExtension;
    const ext2EndX = endPoint.x + perpX * totalExtension;
    const ext2EndY = endPoint.y + perpY * totalExtension;

    // Dimension line points (offset from inner edge)
    const dimOffset = -wallHalfThickness + extensionGap + offsetDistanceMm;
    const dim1X = startPoint.x + perpX * dimOffset;
    const dim1Y = startPoint.y + perpY * dimOffset;
    const dim2X = endPoint.x + perpX * dimOffset;
    const dim2Y = endPoint.y + perpY * dimOffset;

    // Convert to screen space
    const ext1Start = this.camera.worldToScreen(ext1StartX, ext1StartY);
    const ext1End = this.camera.worldToScreen(ext1EndX, ext1EndY);
    const ext2Start = this.camera.worldToScreen(ext2StartX, ext2StartY);
    const ext2End = this.camera.worldToScreen(ext2EndX, ext2EndY);
    const dim1 = this.camera.worldToScreen(dim1X, dim1Y);
    const dim2 = this.camera.worldToScreen(dim2X, dim2Y);

    // Midpoint for label
    const labelX = (dim1.x + dim2.x) / 2;
    const labelY = (dim1.y + dim2.y) / 2;

    ctx.save();
    this.camera.applyScreenTransform(ctx);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const dimColor = isDarkMode ? '#90CAF9' : '#666666';
    const textColor = isDarkMode ? '#E0E0E0' : '#333333';

    // Draw extension lines (thin, solid) - CAD style
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    ctx.beginPath();
    ctx.moveTo(ext1Start.x, ext1Start.y);
    ctx.lineTo(ext1End.x, ext1End.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ext2Start.x, ext2Start.y);
    ctx.lineTo(ext2End.x, ext2End.y);
    ctx.stroke();

    // Draw dimension line (thin, solid)
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dim1.x, dim1.y);
    ctx.lineTo(dim2.x, dim2.y);
    ctx.stroke();

    // Draw slashes at dimension line endpoints - CAD style
    const slashSize = 8;
    const dimLineAngle = Math.atan2(dim2.y - dim1.y, dim2.x - dim1.x);
    const slashAngle = Math.PI / 4; // 45 degrees

    ctx.lineWidth = 1.5;

    // Slash at start (diagonal line)
    ctx.beginPath();
    ctx.moveTo(
      dim1.x - slashSize * Math.cos(dimLineAngle + slashAngle) / 2,
      dim1.y - slashSize * Math.sin(dimLineAngle + slashAngle) / 2
    );
    ctx.lineTo(
      dim1.x + slashSize * Math.cos(dimLineAngle + slashAngle) / 2,
      dim1.y + slashSize * Math.sin(dimLineAngle + slashAngle) / 2
    );
    ctx.stroke();

    // Slash at end (diagonal line)
    ctx.beginPath();
    ctx.moveTo(
      dim2.x - slashSize * Math.cos(dimLineAngle + slashAngle) / 2,
      dim2.y - slashSize * Math.sin(dimLineAngle + slashAngle) / 2
    );
    ctx.lineTo(
      dim2.x + slashSize * Math.cos(dimLineAngle + slashAngle) / 2,
      dim2.y + slashSize * Math.sin(dimLineAngle + slashAngle) / 2
    );
    ctx.stroke();

    // Draw dimension text - rotated to align with dimension line
    const label = `${distanceMm.toFixed(0)}mm`;
    ctx.font = '12px system-ui';

    ctx.save();
    ctx.translate(labelX, labelY);

    // Rotate text to align with dimension line
    // Keep text readable (not upside down)
    let textAngle = dimLineAngle;
    if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) {
      textAngle += Math.PI;
    }
    ctx.rotate(textAngle);

    // Draw text without background
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 0, -4);

    ctx.restore();

    ctx.restore();
  }

  /**
   * Check if screen coordinates are clicking a dimension label
   * Returns wall ID if clicked, null otherwise
   */
  getDimensionAtPoint(screenX: number, screenY: number): string | null {
    for (const hitbox of this.dimensionHitboxes) {
      if (
        screenX >= hitbox.x &&
        screenX <= hitbox.x + hitbox.width &&
        screenY >= hitbox.y &&
        screenY <= hitbox.y + hitbox.height
      ) {
        return hitbox.wallId;
      }
    }
    return null;
  }

}

