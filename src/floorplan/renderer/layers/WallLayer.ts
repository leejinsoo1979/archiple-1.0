import { BaseLayer } from './Layer';
import type { Wall } from '../../../core/types/Wall';
import type { Point } from '../../../core/types/Point';
import type { Door } from '../../../core/types/Door';
import type { Camera2D } from '../Camera2D';

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

    // FORCE same thickness for ALL walls (ignore wall.thickness)
    const thickness = this.config.wallThickness; // Always 100mm

    // Use stroke with square linecap and linejoin for sharp corners
    // Priority: selected > hovered > normal
    let color = this.config.wallColor;
    if (isSelected) {
      color = '#3498db'; // Blue for selected
    } else if (isHovered) {
      color = '#e74c3c'; // Red for hovered
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'butt'; // 도어 구멍에서 깔끔한 절단을 위해 butt 사용
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;

    // Find all doors on this wall
    const wallDoors = this.doors.filter(door => door.wallId === wall.id);

    if (wallDoors.length === 0) {
      // No doors - render full wall
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.stroke();
      return;
    }

    // Calculate wall length and direction
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);

    // Create door openings with normalized positions
    const openings: Array<{ start: number; end: number }> = [];

    wallDoors.forEach(door => {
      const halfWidth = door.width / 2;
      const openingStart = Math.max(0, door.position - halfWidth / wallLength);
      const openingEnd = Math.min(1, door.position + halfWidth / wallLength);
      openings.push({ start: openingStart, end: openingEnd });
    });

    // Sort openings by start position
    openings.sort((a, b) => a.start - b.start);

    // Merge overlapping openings
    const mergedOpenings: Array<{ start: number; end: number }> = [];
    openings.forEach(opening => {
      if (mergedOpenings.length === 0) {
        mergedOpenings.push(opening);
      } else {
        const last = mergedOpenings[mergedOpenings.length - 1];
        if (opening.start <= last.end) {
          // Overlapping - merge
          last.end = Math.max(last.end, opening.end);
        } else {
          // Non-overlapping - add new
          mergedOpenings.push(opening);
        }
      }
    });

    // Render wall segments between openings
    let currentPos = 0;

    mergedOpenings.forEach(opening => {
      if (currentPos < opening.start) {
        // Render segment before opening
        const segStartX = startPoint.x + dx * currentPos;
        const segStartY = startPoint.y + dy * currentPos;
        const segEndX = startPoint.x + dx * opening.start;
        const segEndY = startPoint.y + dy * opening.start;

        ctx.beginPath();
        ctx.moveTo(segStartX, segStartY);
        ctx.lineTo(segEndX, segEndY);
        ctx.stroke();
      }
      currentPos = opening.end;
    });

    // Render final segment after last opening
    if (currentPos < 1) {
      const segStartX = startPoint.x + dx * currentPos;
      const segStartY = startPoint.y + dy * currentPos;

      ctx.beginPath();
      ctx.moveTo(segStartX, segStartY);
      ctx.lineTo(endPoint.x, endPoint.y);
      ctx.stroke();
    }
  }

  private renderPreviewWall(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
    ctx.save();

    // EXACT SAME thickness as confirmed walls (100mm)
    const thickness = this.config.wallThickness;

    // Draw preview with SAME thickness but different style for visibility
    ctx.strokeStyle = this.config.wallColor; // Same color as confirmed walls
    ctx.globalAlpha = 0.5; // 50% transparent for preview
    ctx.lineWidth = thickness;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;

    // Dash pattern to differentiate from confirmed walls
    const dashLength = thickness * 2;
    const gapLength = thickness * 1;
    ctx.setLineDash([dashLength, gapLength]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

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

    // Dashed line style
    ctx.strokeStyle = '#3498db'; // Blue guide
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
    ctx.setTransform(1, 0, 0, 1, 0, 0);

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

    // Draw label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Draw border
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Draw text
    ctx.fillStyle = '#2c3e50';
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
