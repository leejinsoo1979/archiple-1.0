import { BaseLayer } from './Layer';
import type { Wall } from '../../../core/types/Wall';
import type { Point } from '../../../core/types/Point';
import type { Door } from '../../../core/types/Door';
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
  private doors: Door[] = [];
  private previewWall: { start: Point; end: Point } | null = null;
  private hoveredWallId: string | null = null;
  private selectedWallId: string | null = null;
  private camera: Camera2D | null = null;
  private dimensionHitboxes: DimensionHitbox[] = [];

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

    // Determine color - 다크모드 대응
    let color = isDarkMode ? '#E0E0E0' : this.config.wallColor;
    if (isSelected) {
      color = isDarkMode ? '#64B5F6' : '#3498db'; // Blue for selected
    } else if (isHovered) {
      color = isDarkMode ? '#EF5350' : '#e74c3c'; // Red for hovered
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
    ctx.fill();
  }

  private calculateWallCorners(wall: Wall, startPoint: Point, endPoint: Point): { tl: Vector2, tr: Vector2, br: Vector2, bl: Vector2 } {
    const thickness = this.config.wallThickness;
    const halfThickness = thickness / 2;

    const start = Vector2.from(startPoint);
    const end = Vector2.from(endPoint);
    const dir = end.subtract(start).normalize();
    const normal = new Vector2(-dir.y, dir.x); // Left normal

    // Default corners (butt joint)
    let tl = start.add(normal.multiply(halfThickness));
    let bl = start.subtract(normal.multiply(halfThickness));
    let tr = end.add(normal.multiply(halfThickness));
    let br = end.subtract(normal.multiply(halfThickness));

    // Adjust start corners if connected
    const startConnectedWalls = this.connectivityMap.get(wall.startPointId) || [];
    if (startConnectedWalls.length === 2) {
      const otherWallId = startConnectedWalls.find(id => id !== wall.id);
      const otherWall = this.walls.find(w => w.id === otherWallId);
      if (otherWall) {
        const adjustment = this.calculateCornerAdjustment(wall, otherWall, startPoint, normal, halfThickness);
        if (adjustment) {
          tl = adjustment.left;
          bl = adjustment.right;
        }
      }
    }

    // Adjust end corners if connected
    const endConnectedWalls = this.connectivityMap.get(wall.endPointId) || [];
    if (endConnectedWalls.length === 2) {
      const otherWallId = endConnectedWalls.find(id => id !== wall.id);
      const otherWall = this.walls.find(w => w.id === otherWallId);
      if (otherWall) {
        const adjustment = this.calculateCornerAdjustment(wall, otherWall, endPoint, normal, halfThickness);
        if (adjustment) {
          tr = adjustment.left;
          br = adjustment.right;
        }
      }
    }

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
    ctx.fillStyle = isDarkMode ? '#E0E0E0' : this.config.wallColor;
    ctx.globalAlpha = 0.5;

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
   * Render wall dimension label in screen space
   */
  private renderWallDimension(ctx: CanvasRenderingContext2D, wall: Wall): void {
    if (!this.camera) return;

    const startPoint = this.points.get(wall.startPointId);
    const endPoint = this.points.get(wall.endPointId);

    if (!startPoint || !endPoint) return;

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distanceMm = Math.sqrt(dx * dx + dy * dy);

    // Calculate midpoint in world space (mm)
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;
    const angle = Math.atan2(dy, dx);

    // Offset perpendicular to wall in world space (mm)
    const offsetDistanceMm = 250; // 250mm = 25cm offset
    const labelWorldX = midX - Math.sin(angle) * offsetDistanceMm;
    const labelWorldY = midY + Math.cos(angle) * offsetDistanceMm;

    // Convert to screen space
    const labelScreen = this.camera.worldToScreen(labelWorldX, labelWorldY);

    // Format label: show whole mm without decimals
    const label = `${distanceMm.toFixed(0)}mm`;

    ctx.save();

    // Reset transform to screen space
    if (this.camera) {
      this.camera.applyScreenTransform(ctx);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    ctx.font = 'bold 13px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 6;

    const boxX = labelScreen.x - metrics.width / 2 - padding;
    const boxY = labelScreen.y - 10;
    const boxWidth = metrics.width + padding * 2;
    const boxHeight = 20;

    // Store hitbox for click detection
    this.dimensionHitboxes.push({
      wallId: wall.id,
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
    });

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Draw label background - 다크모드 대응
    ctx.fillStyle = isDarkMode ? 'rgba(45, 45, 45, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Draw border - 다크모드 대응
    ctx.strokeStyle = isDarkMode ? '#90CAF9' : '#2c3e50';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Draw text - 다크모드 대응
    ctx.fillStyle = isDarkMode ? '#E0E0E0' : '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelScreen.x, labelScreen.y);

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

