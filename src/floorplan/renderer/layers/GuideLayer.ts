import { BaseLayer } from './Layer';
import type { Point } from '../../../core/types/Point';

export interface GuideLayerConfig {
  angleGuideColor?: string;
  gridSnapColor?: string;
  distanceLabelColor?: string;
  showDistanceLabels?: boolean;
  orthogonalGuideColor?: string; // 수직/수평 가이드 색상
}

/**
 * GuideLayer - Renders drawing guides and measurements
 *
 * Features:
 * - Angle guide lines (0°, 45°, 90°, etc.)
 * - Grid snap indicators
 * - Distance measurements
 * - Perpendicular guides
 * - Orthogonal (수직/수평) guide lines
 */
export class GuideLayer extends BaseLayer {
  private angleGuide: { from: Point; angle: number } | null = null;
  private gridSnapPoint: Point | null = null;
  private distanceMeasurement: { from: Point; to: Point; distance: number } | null = null;
  private orthogonalGuides: { from: Point; to: Point; type: 'horizontal' | 'vertical' } | null = null;

  private config: Required<GuideLayerConfig>;

  constructor(config?: GuideLayerConfig) {
    super(4); // z-index: 4 (above points but below selection)

    this.config = {
      angleGuideColor: config?.angleGuideColor || 'rgba(155, 89, 182, 0.4)',
      gridSnapColor: config?.gridSnapColor || 'rgba(46, 204, 113, 0.6)',
      distanceLabelColor: config?.distanceLabelColor || '#34495e',
      showDistanceLabels: config?.showDistanceLabels ?? true,
      orthogonalGuideColor: config?.orthogonalGuideColor || 'rgba(52, 152, 219, 0.6)', // 파란색
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

      // 수직/수평 가이드 자동 감지 (오차 10px 이내)
      const threshold = 10;
      if (Math.abs(dy) <= threshold) {
        // 수평선
        this.orthogonalGuides = { from, to, type: 'horizontal' };
      } else if (Math.abs(dx) <= threshold) {
        // 수직선
        this.orthogonalGuides = { from, to, type: 'vertical' };
      } else {
        this.orthogonalGuides = null;
      }
    } else {
      this.distanceMeasurement = null;
      this.orthogonalGuides = null;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    // Render orthogonal guides first (background)
    if (this.orthogonalGuides) {
      this.renderOrthogonalGuide(ctx, this.orthogonalGuides);
    }

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

  private renderOrthogonalGuide(
    ctx: CanvasRenderingContext2D,
    guide: { from: Point; to: Point; type: 'horizontal' | 'vertical' }
  ): void {
    ctx.save();

    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 5]);

    if (guide.type === 'horizontal') {
      // 수평 가이드 (캔버스 전체 너비)
      const y = guide.from.y;
      ctx.beginPath();
      ctx.moveTo(-1000, y);
      ctx.lineTo(5000, y);
      ctx.stroke();

      // 라벨
      ctx.fillStyle = this.config.orthogonalGuideColor;
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('수평', guide.from.x + 10, y - 5);
    } else {
      // 수직 가이드 (캔버스 전체 높이)
      const x = guide.from.x;
      ctx.beginPath();
      ctx.moveTo(x, -1000);
      ctx.lineTo(x, 5000);
      ctx.stroke();

      // 라벨
      ctx.fillStyle = this.config.orthogonalGuideColor;
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('수직', x + 5, guide.from.y + 10);
    }

    ctx.restore();
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
