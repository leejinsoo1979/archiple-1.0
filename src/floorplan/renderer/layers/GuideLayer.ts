import { BaseLayer } from './Layer';
import type { Point } from '../../../core/types/Point';
import type { Camera2D } from '../Camera2D';

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
  private camera: Camera2D | null = null;
  private wallThickness: number = 100; // 100mm default

  private config: Required<GuideLayerConfig>;

  constructor(config?: GuideLayerConfig) {
    super(4); // z-index: 4 (above points but below selection)

    this.config = {
      angleGuideColor: config?.angleGuideColor || 'rgba(52, 152, 219, 0.8)', // Brighter blue for visibility
      gridSnapColor: config?.gridSnapColor || 'rgba(46, 204, 113, 0.8)',
      distanceLabelColor: config?.distanceLabelColor || '#34495e',
      showDistanceLabels: config?.showDistanceLabels ?? true,
      orthogonalGuideColor: config?.orthogonalGuideColor || 'rgba(231, 76, 60, 0.8)', // 빨간색 for better visibility
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

  setCamera(camera: Camera2D): void {
    this.camera = camera;
  }

  setWallThickness(thickness: number): void {
    this.wallThickness = thickness;
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

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Emissive effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = isDarkMode ? '#64B5F6' : '#3498db';

    ctx.strokeStyle = isDarkMode ? '#64B5F6' : '#2980b9'; // Slightly darker in light mode for contrast
    ctx.lineWidth = 2; // Bolder
    ctx.setLineDash([10, 5]);

    if (guide.type === 'horizontal') {
      // 수평 가이드 (캔버스 전체 너비)
      const y = guide.from.y;
      ctx.beginPath();
      ctx.moveTo(-1000000, y);
      ctx.lineTo(1000000, y);
      ctx.stroke();

      // 라벨
      ctx.shadowBlur = 0; // Remove shadow for text
      ctx.fillStyle = this.config.orthogonalGuideColor;
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('수평', guide.from.x + 10, y - 5);
    } else {
      // 수직 가이드 (캔버스 전체 높이)
      const x = guide.from.x;
      ctx.beginPath();
      ctx.moveTo(x, -1000000);
      ctx.lineTo(x, 1000000);
      ctx.stroke();

      // 라벨
      ctx.shadowBlur = 0; // Remove shadow for text
      ctx.fillStyle = this.config.orthogonalGuideColor;
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('수직', x + 5, guide.from.y + 10);
    }

    ctx.restore();
  }

  private renderAngleGuide(ctx: CanvasRenderingContext2D, from: Point, angle: number): void {
    if (!this.camera) return;

    // Calculate visible bounds in world space
    const transform = ctx.getTransform();
    // We need to invert the transform to get world bounds
    // But easier to just use a very large number relative to the view
    // Or use camera.getWorldBounds() if available.
    // Let's use a sufficiently large number (e.g. 1,000,000 mm = 1km) which covers most floorplans
    const length = 1000000;

    const radians = (angle * Math.PI) / 180;

    const endX = from.x + Math.cos(radians) * length;
    const endY = from.y + Math.sin(radians) * length;
    const startX = from.x - Math.cos(radians) * length;
    const startY = from.y - Math.sin(radians) * length;

    ctx.save();

    // Emissive effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.config.angleGuideColor;

    ctx.strokeStyle = this.config.angleGuideColor;
    ctx.lineWidth = 2.5; // Even thicker for angle guide
    ctx.setLineDash([15, 8]); // Longer dashes

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw angle label
    // Position label at a fixed screen distance from 'from' point, not world distance
    // This ensures label is always visible regardless of zoom

    // Convert 'from' to screen
    const screenFrom = this.camera.worldToScreen(from.x, from.y);
    const labelOffsetPx = 60; // 60px offset
    const labelScreenX = screenFrom.x + Math.cos(radians) * labelOffsetPx;
    const labelScreenY = screenFrom.y + Math.sin(radians) * labelOffsetPx;

    // Reset transform to draw label in screen space
    this.camera.applyScreenTransform(ctx);

    ctx.fillStyle = this.config.angleGuideColor;
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add background for better readability
    const label = angle === 0 ? '수평 (0°)' : angle === 90 ? '수직 (90°)' : `${angle}°`;
    const metrics = ctx.measureText(label);
    const padding = 4;

    // Check current theme for background color
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isDarkMode ? 'rgba(45, 45, 45, 0.9)' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(
      labelScreenX - metrics.width / 2 - padding,
      labelScreenY - 10,
      metrics.width + padding * 2,
      20
    );

    ctx.fillStyle = this.config.angleGuideColor;
    ctx.fillText(label, labelScreenX, labelScreenY);

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
    if (!this.camera) return;

    ctx.save();

    // Distance is already in mm
    const millimeters = distance;

    // Calculate label position in world space (mm)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    // Offset label perpendicular to wall in world space (mm)
    const offsetDistanceMm = 250; // 250mm = 25cm offset
    const labelWorldX = midX - Math.sin(angle) * offsetDistanceMm;
    const labelWorldY = midY + Math.cos(angle) * offsetDistanceMm;

    // Convert to screen space
    const labelScreen = this.camera.worldToScreen(labelWorldX, labelWorldY);

    // Format label in mm only
    const label = `${Math.round(millimeters)}mm`;

    // Reset transform to screen space (with DPI scaling)
    this.camera.applyScreenTransform(ctx);

    ctx.font = 'bold 13px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 6;

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Draw label background - 다크모드 대응
    ctx.fillStyle = isDarkMode ? 'rgba(45, 45, 45, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      labelScreen.x - metrics.width / 2 - padding,
      labelScreen.y - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw border - 다크모드 대응
    ctx.strokeStyle = isDarkMode ? '#90CAF9' : '#2c3e50';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      labelScreen.x - metrics.width / 2 - padding,
      labelScreen.y - 10,
      metrics.width + padding * 2,
      20
    );

    // Draw text - 다크모드 대응
    ctx.fillStyle = isDarkMode ? '#E0E0E0' : '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelScreen.x, labelScreen.y);

    ctx.restore();
  }

  private renderVerticalGuideLine(
    ctx: CanvasRenderingContext2D,
    guide: { x: number; fromY: number; toY: number }
  ): void {
    ctx.save();

    // Emissive effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#e74c3c';

    // Draw vertical guide line (수직 가이드)
    ctx.strokeStyle = '#e74c3c'; // 빨간색으로 명확하게 표시
    ctx.lineWidth = 2;
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

    // Emissive effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#e74c3c';

    // Draw horizontal guide line (수평 가이드)
    ctx.strokeStyle = '#e74c3c'; // 빨간색으로 명확하게 표시
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(guide.fromX, guide.y);
    ctx.lineTo(guide.toX, guide.y);
    ctx.stroke();

    ctx.restore();
  }

  private renderRectanglePreview(ctx: CanvasRenderingContext2D, corners: Point[]): void {
    ctx.save();

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // EXACT SAME thickness as confirmed walls (100mm) - 다크모드 대응
    ctx.strokeStyle = isDarkMode ? '#E0E0E0' : '#2c3e50';
    ctx.globalAlpha = 0.7; // 70% transparent for preview
    ctx.lineWidth = this.wallThickness; // Use actual wall thickness
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    // Solid line for preview
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.stroke();

    ctx.setLineDash([]);

    // Calculate dimensions (1 pixel = 1mm)
    const width = Math.abs(corners[1].x - corners[0].x);
    const height = Math.abs(corners[2].y - corners[1].y);
    const widthMm = width; // Already in mm
    const heightMm = height; // Already in mm

    // Format labels
    const widthLabel = `${Math.round(widthMm)}mm`;
    const heightLabel = `${Math.round(heightMm)}mm`;

    // Top edge - width label (offset in mm)
    const topMidX = (corners[0].x + corners[1].x) / 2;
    const topY = corners[0].y;
    this.renderDimensionLabel(ctx, widthLabel, topMidX, topY - 300); // 300mm offset

    // Right edge - height label (offset in mm)
    const rightX = corners[1].x;
    const rightMidY = (corners[1].y + corners[2].y) / 2;
    this.renderDimensionLabel(ctx, heightLabel, rightX + 400, rightMidY); // 400mm offset

    // Bottom edge - width label (offset in mm)
    const bottomMidX = (corners[2].x + corners[3].x) / 2;
    const bottomY = corners[2].y;
    this.renderDimensionLabel(ctx, widthLabel, bottomMidX, bottomY + 300); // 300mm offset

    // Left edge - height label (offset in mm)
    const leftX = corners[0].x;
    const leftMidY = (corners[0].y + corners[3].y) / 2;
    this.renderDimensionLabel(ctx, heightLabel, leftX - 400, leftMidY); // 400mm offset

    ctx.restore();
  }

  private renderDimensionLabel(ctx: CanvasRenderingContext2D, label: string, worldX: number, worldY: number): void {
    if (!this.camera) return;

    // Convert world position to screen space
    const screenPos = this.camera.worldToScreen(worldX, worldY);

    // Reset transform to screen space (with DPI scaling)
    this.camera.applyScreenTransform(ctx);

    ctx.font = 'bold 12px system-ui';
    const metrics = ctx.measureText(label);
    const padding = 5;

    // Check current theme for color selection
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';

    // Background - 다크모드 대응
    ctx.fillStyle = isDarkMode ? 'rgba(45, 45, 45, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(
      screenPos.x - metrics.width / 2 - padding,
      screenPos.y - 9,
      metrics.width + padding * 2,
      18
    );

    // Border - 다크모드 대응
    ctx.strokeStyle = isDarkMode ? '#64B5F6' : '#3498db';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      screenPos.x - metrics.width / 2 - padding,
      screenPos.y - 9,
      metrics.width + padding * 2,
      18
    );

    // Text - 다크모드 대응
    ctx.fillStyle = isDarkMode ? '#E0E0E0' : '#2c3e50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, screenPos.x, screenPos.y);
  }
}
