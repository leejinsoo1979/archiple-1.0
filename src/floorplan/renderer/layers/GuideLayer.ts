import { BaseLayer } from './Layer';
import type { Point } from '../../../core/types/Point';

export interface GuideLayerConfig {
  angleGuideColor?: string;
  gridSnapColor?: string;
  distanceLabelColor?: string;
  showDistanceLabels?: boolean;
}

/**
 * GuideLayer - Renders drawing guides and measurements
 *
 * Features:
 * - Angle guide lines (0°, 45°, 90°, etc.)
 * - Grid snap indicators
 * - Distance measurements
 * - Perpendicular guides
 */
export class GuideLayer extends BaseLayer {
  private angleGuide: { from: Point; angle: number } | null = null;
  private gridSnapPoint: Point | null = null;
  private distanceMeasurement: { from: Point; to: Point; distance: number } | null = null;

  private config: Required<GuideLayerConfig>;

  constructor(config?: GuideLayerConfig) {
    super(4); // z-index: 4 (above points but below selection)

    this.config = {
      angleGuideColor: config?.angleGuideColor || 'rgba(155, 89, 182, 0.4)',
      gridSnapColor: config?.gridSnapColor || 'rgba(46, 204, 113, 0.6)',
      distanceLabelColor: config?.distanceLabelColor || '#34495e',
      showDistanceLabels: config?.showDistanceLabels ?? true,
    };
  }

  setAngleGuide(from: Point | null, angle: number | null): void {
    if (from && angle !== null) {
      this.angleGuide = { from, angle };
    } else {
      this.angleGuide = null;
    }
  }

  setGridSnapPoint(point: Point | null): void {
    this.gridSnapPoint = point;
  }

  setDistanceMeasurement(from: Point | null, to: Point | null): void {
    if (from && to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.distanceMeasurement = { from, to, distance };
    } else {
      this.distanceMeasurement = null;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    // Render angle guide line
    if (this.angleGuide) {
      this.renderAngleGuide(ctx, this.angleGuide.from, this.angleGuide.angle);
    }

    // Render grid snap indicator
    if (this.gridSnapPoint) {
      this.renderGridSnapIndicator(ctx, this.gridSnapPoint);
    }

    // Render distance measurement
    if (this.distanceMeasurement && this.config.showDistanceLabels) {
      this.renderDistanceMeasurement(
        ctx,
        this.distanceMeasurement.from,
        this.distanceMeasurement.to,
        this.distanceMeasurement.distance
      );
    }

    this.resetOpacity(ctx);
  }

  private renderAngleGuide(ctx: CanvasRenderingContext2D, from: Point, angle: number): void {
    const radians = (angle * Math.PI) / 180;
    const length = 2000; // Extend guide line across canvas

    const endX = from.x + Math.cos(radians) * length;
    const endY = from.y + Math.sin(radians) * length;

    ctx.save();

    ctx.strokeStyle = this.config.angleGuideColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 4]);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw angle label
    const labelX = from.x + Math.cos(radians) * 50;
    const labelY = from.y + Math.sin(radians) * 50;

    ctx.fillStyle = this.config.angleGuideColor;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${angle}°`, labelX, labelY);

    ctx.restore();
  }

  private renderGridSnapIndicator(ctx: CanvasRenderingContext2D, point: Point): void {
    ctx.save();

    // Crosshair at snap point
    ctx.strokeStyle = this.config.gridSnapColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    const size = 10;
    ctx.beginPath();
    ctx.moveTo(point.x - size, point.y);
    ctx.lineTo(point.x + size, point.y);
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x, point.y + size);
    ctx.stroke();

    // Small circle
    ctx.strokeStyle = this.config.gridSnapColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderDistanceMeasurement(
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    distance: number
  ): void {
    ctx.save();

    // Convert pixels to meters (20 pixels = 1 meter)
    const PIXELS_PER_METER = 20;
    const meters = distance / PIXELS_PER_METER;

    // Calculate label position (midpoint)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    // Draw label background
    const label = `${meters.toFixed(2)}m`;
    ctx.font = 'bold 12px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 4;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
      midX - metrics.width / 2 - padding,
      midY - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw border
    ctx.strokeStyle = this.config.distanceLabelColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(
      midX - metrics.width / 2 - padding,
      midY - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw text
    ctx.fillStyle = this.config.distanceLabelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);

    ctx.restore();
  }
}
