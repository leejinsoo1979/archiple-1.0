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
  private rectanglePreview: Point[] | null = null;
  private verticalGuide: { x: number; fromY: number; toY: number } | null = null;
  private horizontalGuide: { y: number; fromX: number; toX: number } | null = null;

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

  setRectanglePreview(corners: Point[] | null): void {
    this.rectanglePreview = corners;
  }

  setVerticalGuide(x: number, fromY: number, toY: number): void {
    this.verticalGuide = { x, fromY, toY };
  }

  clearVerticalGuide(): void {
    this.verticalGuide = null;
  }

  setHorizontalGuide(y: number, fromX: number, toX: number): void {
    this.horizontalGuide = { y, fromX, toX };
  }

  clearHorizontalGuide(): void {
    this.horizontalGuide = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    // Render vertical/horizontal guide lines (축 정렬 가이드)
    if (this.verticalGuide) {
      this.renderVerticalGuideLine(ctx, this.verticalGuide);
    }

    if (this.horizontalGuide) {
      this.renderHorizontalGuideLine(ctx, this.horizontalGuide);
    }

    // Render rectangle preview
    if (this.rectanglePreview && this.rectanglePreview.length === 4) {
      this.renderRectanglePreview(ctx, this.rectanglePreview);
    }

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

    // Convert pixels to mm (1 pixel = 10mm)
    const PIXELS_TO_MM = 10;
    const millimeters = distance * PIXELS_TO_MM;

    // Calculate label position (midpoint, offset slightly above)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    // Offset label perpendicular to wall
    const offsetDistance = 20;
    const labelX = midX - Math.sin(angle) * offsetDistance;
    const labelY = midY + Math.cos(angle) * offsetDistance;

    // Format label in mm only
    const label = `${Math.round(millimeters)}mm`;

    ctx.font = 'bold 13px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 6;

    // Draw label background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      labelX - metrics.width / 2 - padding,
      labelY - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw border
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      labelX - metrics.width / 2 - padding,
      labelY - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw text
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX, labelY);

    ctx.restore();
  }

  private renderVerticalGuideLine(
    ctx: CanvasRenderingContext2D,
    guide: { x: number; fromY: number; toY: number }
  ): void {
    ctx.save();

    // Draw vertical guide line (수직 가이드)
    ctx.strokeStyle = '#e74c3c'; // 빨간색으로 명확하게 표시
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(guide.x, guide.fromY);
    ctx.lineTo(guide.x, guide.toY);
    ctx.stroke();

    ctx.restore();
  }

  private renderHorizontalGuideLine(
    ctx: CanvasRenderingContext2D,
    guide: { y: number; fromX: number; toX: number }
  ): void {
    ctx.save();

    // Draw horizontal guide line (수평 가이드)
    ctx.strokeStyle = '#e74c3c'; // 빨간색으로 명확하게 표시
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(guide.fromX, guide.y);
    ctx.lineTo(guide.toX, guide.y);
    ctx.stroke();

    ctx.restore();
  }

  private renderRectanglePreview(ctx: CanvasRenderingContext2D, corners: Point[]): void {
    ctx.save();

    // Draw dashed rectangle outline
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.stroke();

    // NO fill - just outline

    ctx.setLineDash([]);

    // Calculate dimensions
    const PIXELS_TO_MM = 10;
    const width = Math.abs(corners[1].x - corners[0].x);
    const height = Math.abs(corners[2].y - corners[1].y);
    const widthMm = width * PIXELS_TO_MM;
    const heightMm = height * PIXELS_TO_MM;

    // Format labels
    const widthLabel = `${Math.round(widthMm)}mm`;
    const heightLabel = `${Math.round(heightMm)}mm`;

    // Top edge - width label
    const topMidX = (corners[0].x + corners[1].x) / 2;
    const topY = corners[0].y;
    this.renderDimensionLabel(ctx, widthLabel, topMidX, topY - 15);

    // Right edge - height label
    const rightX = corners[1].x;
    const rightMidY = (corners[1].y + corners[2].y) / 2;
    this.renderDimensionLabel(ctx, heightLabel, rightX + 40, rightMidY);

    // Bottom edge - width label
    const bottomMidX = (corners[2].x + corners[3].x) / 2;
    const bottomY = corners[2].y;
    this.renderDimensionLabel(ctx, widthLabel, bottomMidX, bottomY + 25);

    // Left edge - height label
    const leftX = corners[0].x;
    const leftMidY = (corners[0].y + corners[3].y) / 2;
    this.renderDimensionLabel(ctx, heightLabel, leftX - 40, leftMidY);

    ctx.restore();
  }

  private renderDimensionLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
    ctx.font = 'bold 12px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 5;

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      x - metrics.width / 2 - padding,
      y - 9,
      metrics.width + padding * 2,
      18
    );

    // Border
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      x - metrics.width / 2 - padding,
      y - 9,
      metrics.width + padding * 2,
      18
    );

    // Text
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }
}
