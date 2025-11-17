import { BaseLayer } from './Layer';
import type { Wall } from '../../../core/types/Wall';
import type { Point } from '../../../core/types/Point';

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
 * Units: Wall thickness and height are stored in mm (world space)
 * Rendering: 1 pixel = 10mm for display (1mm thickness → 0.1px)
 */
export class WallLayer extends BaseLayer {
  private walls: Wall[] = [];
  private points: Map<string, Point> = new Map();
  private previewWall: { start: Point; end: Point } | null = null;
  private hoveredWallId: string | null = null;

  private config: Required<WallLayerConfig>;
  private readonly MM_TO_PIXELS = 0.1; // Visual scale: 1mm thickness → 0.1px

  constructor(config?: WallLayerConfig) {
    super(2); // z-index: 2

    this.config = {
      wallColor: config?.wallColor || '#2c3e50',
      wallThickness: config?.wallThickness || 200, // 200mm = 20cm
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

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    // Render confirmed walls
    this.walls.forEach((wall) => {
      const isHovered = wall.id === this.hoveredWallId;
      this.renderWall(ctx, wall, isHovered);
    });

    // Render wall dimensions
    this.walls.forEach((wall) => {
      this.renderWallDimension(ctx, wall);
    });

    // Render preview wall
    if (this.previewWall) {
      this.renderPreviewWall(ctx, this.previewWall.start, this.previewWall.end);
    }

    this.resetOpacity(ctx);
  }

  private renderWall(ctx: CanvasRenderingContext2D, wall: Wall, isHovered: boolean): void {
    const startPoint = this.points.get(wall.startPointId);
    const endPoint = this.points.get(wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Convert mm to pixels for rendering
    const thicknessMm = wall.thickness || this.config.wallThickness;
    const thicknessPixels = thicknessMm * this.MM_TO_PIXELS;

    // Use stroke with square linecap and linejoin for sharp corners
    ctx.strokeStyle = isHovered ? '#e74c3c' : this.config.wallColor;
    ctx.lineWidth = thicknessPixels;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();
  }

  private renderPreviewWall(ctx: CanvasRenderingContext2D, start: Point, end: Point): void {
    ctx.save();

    // Convert mm to pixels for rendering
    const thicknessPixels = this.config.wallThickness * this.MM_TO_PIXELS;

    // Draw background glow for better visibility
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.3)';
    ctx.lineWidth = thicknessPixels + 4;
    ctx.lineCap = 'butt'; // Square corners
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Draw main preview line
    ctx.strokeStyle = this.config.previewColor;
    ctx.lineWidth = 3; // Thicker for better visibility
    ctx.lineCap = 'butt'; // Square corners

    if (this.config.previewStyle === 'dashed') {
      ctx.setLineDash([12, 6]);
    }

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Render wall dimension label
   */
  private renderWallDimension(ctx: CanvasRenderingContext2D, wall: Wall): void {
    const startPoint = this.points.get(wall.startPointId);
    const endPoint = this.points.get(wall.endPointId);

    if (!startPoint || !endPoint) return;

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Convert pixels to mm (1 pixel = 10mm)
    const PIXELS_TO_MM = 10;
    const millimeters = distance * PIXELS_TO_MM;

    // Calculate label position (midpoint, offset perpendicular to wall)
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;
    const angle = Math.atan2(dy, dx);

    // Offset label perpendicular to wall
    const offsetDistance = 25;
    const labelX = midX - Math.sin(angle) * offsetDistance;
    const labelY = midY + Math.cos(angle) * offsetDistance;

    // Format label in mm only
    const label = `${Math.round(millimeters)}mm`;

    ctx.save();
    ctx.font = 'bold 11px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 4;

    // Draw label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
      labelX - metrics.width / 2 - padding,
      labelY - 8,
      metrics.width + padding * 2,
      16
    );

    // Draw border
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      labelX - metrics.width / 2 - padding,
      labelY - 8,
      metrics.width + padding * 2,
      16
    );

    // Draw text
    ctx.fillStyle = '#34495e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX, labelY);

    ctx.restore();
  }

}
