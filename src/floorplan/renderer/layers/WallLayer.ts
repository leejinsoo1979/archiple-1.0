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
 * Units: Wall thickness and height are stored in mm
 * Rendering: 1mm = 0.1 pixels for display
 */
export class WallLayer extends BaseLayer {
  private walls: Wall[] = [];
  private points: Map<string, Point> = new Map();
  private previewWall: { start: Point; end: Point } | null = null;
  private hoveredWallId: string | null = null;

  private config: Required<WallLayerConfig>;
  private readonly MM_TO_PIXELS = 0.1; // 1mm = 0.1 pixels

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

    // Draw wall as filled rectangle (not line) for clean corners
    ctx.save();

    // Convert mm to pixels for rendering
    const thicknessMm = wall.thickness || this.config.wallThickness;
    const thicknessPixels = thicknessMm * this.MM_TO_PIXELS;

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Translate to start point
    ctx.translate(startPoint.x, startPoint.y);
    // Rotate to wall direction
    ctx.rotate(angle);

    // Draw wall as rectangle (centered)
    ctx.fillStyle = isHovered ? '#e74c3c' : this.config.wallColor;
    ctx.fillRect(0, -thicknessPixels / 2, length, thicknessPixels);

    ctx.restore();
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
}
