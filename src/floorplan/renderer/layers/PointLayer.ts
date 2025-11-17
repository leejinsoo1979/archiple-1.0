import { BaseLayer } from './Layer';
import type { Point } from '../../../core/types/Point';

export interface PointLayerConfig {
  pointRadius?: number;
  pointColor?: string;
  selectedColor?: string;
  hoveredColor?: string;
  snapIndicatorColor?: string;
  snapIndicatorRadius?: number;
}

/**
 * PointLayer - Renders points (vertices)
 *
 * Features:
 * - Normal points
 * - Selected points (highlighted)
 * - Hovered points (highlight)
 * - Snap indicators (magnet effect)
 */
export class PointLayer extends BaseLayer {
  private points: Point[] = [];
  private selectedPointIds: Set<string> = new Set();
  private hoveredPointId: string | null = null;
  private snapPoint: Point | null = null;

  private config: Required<PointLayerConfig>;

  constructor(config?: PointLayerConfig) {
    super(3); // z-index: 3

    this.config = {
      pointRadius: config?.pointRadius || 8,
      pointColor: config?.pointColor || '#e74c3c',
      selectedColor: config?.selectedColor || '#3498db',
      hoveredColor: config?.hoveredColor || '#f39c12',
      snapIndicatorColor: config?.snapIndicatorColor || '#2ecc71',
      snapIndicatorRadius: config?.snapIndicatorRadius || 15,
    };
  }

  setPoints(points: Point[]): void {
    this.points = points;
  }

  setSelectedPoints(pointIds: string[]): void {
    this.selectedPointIds = new Set(pointIds);
  }

  setHoveredPoint(pointId: string | null): void {
    this.hoveredPointId = pointId;
  }

  setSnapPoint(point: Point | null): void {
    this.snapPoint = point;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    // Render snap indicator first (background)
    if (this.snapPoint) {
      this.renderSnapIndicator(ctx, this.snapPoint);
    }

    // Render all points
    this.points.forEach((point) => {
      const isSelected = this.selectedPointIds.has(point.id);
      const isHovered = point.id === this.hoveredPointId;
      this.renderPoint(ctx, point, isSelected, isHovered);
    });

    this.resetOpacity(ctx);
  }

  private renderPoint(
    ctx: CanvasRenderingContext2D,
    point: Point,
    isSelected: boolean,
    isHovered: boolean
  ): void {
    let color = this.config.pointColor;
    let radius = this.config.pointRadius;

    if (isHovered) {
      color = this.config.hoveredColor;
      radius = this.config.pointRadius * 1.3;
    } else if (isSelected) {
      color = this.config.selectedColor;
      radius = this.config.pointRadius * 1.2;
    }

    // Draw point
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private renderSnapIndicator(ctx: CanvasRenderingContext2D, point: Point): void {
    // Outer ring (pulsing effect)
    ctx.strokeStyle = this.config.snapIndicatorColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, this.config.snapIndicatorRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner ring
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, this.config.snapIndicatorRadius * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair
    const crossSize = 4;
    ctx.beginPath();
    ctx.moveTo(point.x - crossSize, point.y);
    ctx.lineTo(point.x + crossSize, point.y);
    ctx.moveTo(point.x, point.y - crossSize);
    ctx.lineTo(point.x, point.y + crossSize);
    ctx.stroke();
  }
}
