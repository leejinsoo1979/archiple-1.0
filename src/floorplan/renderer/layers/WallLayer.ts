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

    // Clear hitboxes for this frame
    this.dimensionHitboxes = [];

    // Render confirmed walls
    this.walls.forEach((wall) => {
      const isHovered = wall.id === this.hoveredWallId;
      const isSelected = wall.id === this.selectedWallId;
      this.renderWall(ctx, wall, isHovered, isSelected);
    });

    // Render wall dimensions
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

  private renderWall(ctx: CanvasRenderingContext2D, wall: Wall, isHovered: boolean, isSelected: boolean): void {
    const startPoint = this.points.get(wall.startPointId);
    const endPoint = this.points.get(wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Calculate wall corners (mitered or butt)
    const corners = this.calculateWallCorners(wall, startPoint, endPoint);

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Determine color with transparency - 다크모드 대응
    let color: string;
    if (isSelected) {
      color = isDarkMode ? 'rgba(100, 181, 246, 1)' : 'rgba(52, 152, 219, 1)'; // Blue for selected (opaque)
    } else if (isHovered) {
      color = 'rgba(63, 174, 122, 0.8)'; // Theme color for hovered (semi-transparent)
    } else {
      color = isDarkMode ? 'rgba(224, 224, 224, 0.3)' : 'rgba(51, 51, 51, 0.3)'; // Normal wall (transparent)
    }

    ctx.fillStyle = color;

    // Find all doors on this wall
    const wallDoors = this.doors.filter(door => door.wallId === wall.id);

    if (wallDoors.length === 0) {
      // No doors - render full wall polygon
      ctx.beginPath();
      ctx.moveTo(corners.tl.x, corners.tl.y);
      ctx.lineTo(corners.tr.x, corners.tr.y);
      ctx.lineTo(corners.br.x, corners.br.y);
      ctx.lineTo(corners.bl.x, corners.bl.y);
      ctx.closePath();
      ctx.fill();
      return;
    }

    // Calculate wall length
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);

    // Create door openings
    const openings: Array<{ start: number; end: number }> = [];

    wallDoors.forEach(door => {
      const halfWidth = door.width / 2;
      const openingStart = Math.max(0, door.position - halfWidth / wallLength);
      const openingEnd = Math.min(1, door.position + halfWidth / wallLength);
      openings.push({ start: openingStart, end: openingEnd });
    });

    // Sort and merge openings
    openings.sort((a, b) => a.start - b.start);

    const mergedOpenings: Array<{ start: number; end: number }> = [];
    openings.forEach(opening => {
      if (mergedOpenings.length === 0) {
        mergedOpenings.push(opening);
      } else {
        const last = mergedOpenings[mergedOpenings.length - 1];
        if (opening.start <= last.end) {
          last.end = Math.max(last.end, opening.end);
        } else {
          mergedOpenings.push(opening);
        }
      }
    });

    // Render wall segments between openings
    let currentPos = 0;

    mergedOpenings.forEach(opening => {
      if (currentPos < opening.start) {
        this.renderWallSegment(ctx, corners, currentPos, opening.start);
      }
      currentPos = opening.end;
    });

    // Render final segment
    if (currentPos < 1) {
      this.renderWallSegment(ctx, corners, currentPos, 1);
    }
  }

  private renderWallSegment(
    ctx: CanvasRenderingContext2D,
    corners: { tl: Vector2, tr: Vector2, br: Vector2, bl: Vector2 },
    tStart: number,
    tEnd: number
  ): void {
    // Interpolate points
    const p1 = corners.tl.lerp(corners.tr, tStart); // Top-Left of segment
    const p2 = corners.tl.lerp(corners.tr, tEnd);   // Top-Right of segment
    const p3 = corners.bl.lerp(corners.br, tEnd);   // Bottom-Right of segment
    const p4 = corners.bl.lerp(corners.br, tStart); // Bottom-Left of segment

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();

    // Render based on style
    switch (this.renderStyle) {
      case 'wireframe':
        // Only outline, no fill
        ctx.strokeStyle = this.config.wallColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        break;

      case 'hidden-line':
        // Fill with light color + outline
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        ctx.fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        ctx.fill();
        ctx.strokeStyle = this.config.wallColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;

      case 'realistic':
        // Gradient fill for realistic effect
        const centerX = (p1.x + p2.x + p3.x + p4.x) / 4;
        const centerY = (p1.y + p2.y + p3.y + p4.y) / 4;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, this.config.wallThickness / 2);
        const baseColor = this.config.wallColor;
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, this.darkenColor(baseColor, 0.3));
        ctx.fillStyle = gradient;
        ctx.fill();
        // Subtle outline
        ctx.strokeStyle = this.darkenColor(baseColor, 0.5);
        ctx.lineWidth = 0.5;
        ctx.stroke();
        break;

      case 'solid':
      default:
        // Standard solid fill
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

  private calculateWallCorners(wall: Wall, startPoint: Point, endPoint: Point): { tl: Vector2, tr: Vector2, br: Vector2, bl: Vector2 } {
    const thickness = this.config.wallThickness;
    const halfThickness = thickness / 2;

    const start = Vector2.from(startPoint);
    const end = Vector2.from(endPoint);
    const dir = end.subtract(start).normalize();
    const normal = new Vector2(-dir.y, dir.x); // CW normal (Right side)

    // Default corners (butt join)
    // tl/tr are on "Right" side (start + normal)
    // bl/br are on "Left" side (start - normal)
    let tl = start.add(normal.multiply(halfThickness));
    let bl = start.subtract(normal.multiply(halfThickness));
    let tr = end.add(normal.multiply(halfThickness));
    let br = end.subtract(normal.multiply(halfThickness));

    // Helper to apply intersections
    const applyIntersections = (isStart: boolean) => {
      const junctionPoint = isStart ? startPoint : endPoint;
      const connectedIds = this.connectivityMap.get(junctionPoint.id) || [];

      // Filter out self
      const otherIds = connectedIds.filter(id => id !== wall.id);
      if (otherIds.length === 0) return;

      // Candidates for Left and Right side intersections
      const leftCandidates: Vector2[] = [];
      const rightCandidates: Vector2[] = [];

      otherIds.forEach(otherId => {
        const otherWall = this.walls.find(w => w.id === otherId);
        if (!otherWall) return;

        // const relDir = this.getRelativeDirection(wall, otherWall, junctionPoint);
        const adjustment = this.calculateCornerAdjustment(wall, otherWall, junctionPoint, normal, halfThickness);

        if (adjustment) {
          // Note: adjustment.left corresponds to 'tl'/'tr' (Right side in our variable naming)
          // adjustment.right corresponds to 'bl'/'br' (Left side)
          // This naming confusion comes from calculateCornerAdjustment using add(normal) for 'left'

          // Always apply to BOTH sides to ensure miter joint on both inner and outer corners
          rightCandidates.push(adjustment.left); // Right side (tl/tr)
          leftCandidates.push(adjustment.right); // Left side (bl/br)
        }
      });

      // Pick best candidates (shortest wall segment / most cut back)
      // For Start corners: Pick point furthest from Start (closest to End)? No, closest to End means shortest.
      // Wait, Start corners move *into* the wall. So we want the one that is *furthest* along the wall direction?
      // Or simply the one closest to the *other* end of the wall.

      const pickBest = (candidates: Vector2[], defaultPoint: Vector2) => {
        if (candidates.length === 0) return defaultPoint;
        // Sort by distance to the *other* end of the wall
        // We want the intersection that makes the wall shortest (avoids overlap)
        const target = isStart ? end : start;
        candidates.sort((a, b) => a.distanceTo(target) - b.distanceTo(target));
        return candidates[0];
      };

      if (isStart) {
        tl = pickBest(rightCandidates, tl);
        bl = pickBest(leftCandidates, bl);
      } else {
        tr = pickBest(rightCandidates, tr);
        br = pickBest(leftCandidates, br);
      }
    };

    applyIntersections(true);
    applyIntersections(false);

    return { tl, tr, br, bl };
  }



  private calculateCornerAdjustment(
    currentWall: Wall,
    otherWall: Wall,
    junctionPoint: Point,
    _currentNormal: Vector2,
    halfThickness: number
  ): { left: Vector2, right: Vector2 } | null {

    // Helper to get wall lines
    const getWallLines = (wall: Wall) => {
      const start = Vector2.from(this.points.get(wall.startPointId)!);
      const end = Vector2.from(this.points.get(wall.endPointId)!);
      const dir = end.subtract(start).normalize();
      const normal = new Vector2(-dir.y, dir.x);

      // Define lines by a point and direction
      // Left line: passes through start + normal * halfThickness
      // Right line: passes through start - normal * halfThickness
      const leftOrigin = start.add(normal.multiply(halfThickness));
      const rightOrigin = start.subtract(normal.multiply(halfThickness));

      return {
        left: { p: leftOrigin, d: dir },
        right: { p: rightOrigin, d: dir }
      };
    };

    // Helper to intersect two lines
    const intersect = (l1: { p: Vector2, d: Vector2 }, l2: { p: Vector2, d: Vector2 }): Vector2 | null => {
      const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
      if (Math.abs(det) < 0.0001) return null; // Parallel
      const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / det;
      return l1.p.add(l1.d.multiply(t));
    };

    const w1Lines = getWallLines(currentWall);
    const w2Lines = getWallLines(otherWall);

    const isW1Start = currentWall.startPointId === junctionPoint.id;
    const isW2Start = otherWall.startPointId === junctionPoint.id;

    // Determine connectivity type and intersect appropriate lines
    // Case 1: Head-Tail or Tail-Head (Sequential) -> Same sides intersect
    // Case 2: Head-Head or Tail-Tail (Opposing) -> Opposite sides intersect

    // If W1 End meets W2 Start (Standard): W1 Left <-> W2 Left
    // If W1 Start meets W2 End (Reverse): W1 Left <-> W2 Left
    // If W1 End meets W2 End (Head-Head): W1 Left <-> W2 Right
    // If W1 Start meets W2 Start (Tail-Tail): W1 Left <-> W2 Right

    // Logic:
    // If (isW1Start == isW2Start) -> Tail-Tail (true, true) or Head-Head (false, false) -> Opposite sides
    // If (isW1Start != isW2Start) -> Head-Tail or Tail-Head -> Same sides

    let newLeft: Vector2 | null = null;
    let newRight: Vector2 | null = null;

    if (isW1Start === isW2Start) {
      // Tail-Tail or Head-Head: Connect Left to Right, Right to Left
      newLeft = intersect(w1Lines.left, w2Lines.right);
      newRight = intersect(w1Lines.right, w2Lines.left);
    } else {
      // Head-Tail or Tail-Head: Connect Left to Left, Right to Right
      newLeft = intersect(w1Lines.left, w2Lines.left);
      newRight = intersect(w1Lines.right, w2Lines.right);
    }

    if (newLeft && newRight) {
      // Miter limit check
      // If intersection is too far from junction, clamp it?
      // For now, just return the intersection. 
      // The user wants "correct" geometry, which mathematically IS the intersection.
      return { left: newLeft, right: newRight };
    }

    return null;
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

    // Check current theme for color selection - 다크모드 대응
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    // Use rgba for transparency directly in fillStyle
    ctx.fillStyle = isDarkMode ? 'rgba(224, 224, 224, 0.3)' : 'rgba(51, 51, 51, 0.3)';

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

