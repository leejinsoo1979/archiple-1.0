import { BaseLayer } from './Layer';
import type { Wall } from '../../../core/types/Wall';
import type { Point } from '../../../core/types/Point';
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
export class WallLayer extends BaseLayer {
  private walls: Wall[] = [];
  private points: Map<string, Point> = new Map();
  private previewWall: { start: Point; end: Point } | null = null;
  private hoveredWallId: string | null = null;
  private camera: Camera2D | null = null;

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

  setCamera(camera: Camera2D): void {
    this.camera = camera;
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

    // FORCE same thickness for ALL walls (ignore wall.thickness)
    const thickness = this.config.wallThickness; // Always 100mm

    // Use stroke with square linecap and linejoin for sharp corners
    ctx.strokeStyle = isHovered ? '#e74c3c' : this.config.wallColor;
    ctx.lineWidth = thickness;
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

    // EXACT SAME thickness as confirmed walls (100mm)
    const thickness = this.config.wallThickness;

    // Draw preview with SAME thickness but different style for visibility
    ctx.strokeStyle = this.config.wallColor; // Same color as confirmed walls
    ctx.globalAlpha = 0.5; // 50% transparent for preview
    ctx.lineWidth = thickness;
    ctx.lineCap = 'square';
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

    // Draw label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      labelScreen.x - metrics.width / 2 - padding,
      labelScreen.y - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw border
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      labelScreen.x - metrics.width / 2 - padding,
      labelScreen.y - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw text
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelScreen.x, labelScreen.y);

    ctx.restore();
  }

}
