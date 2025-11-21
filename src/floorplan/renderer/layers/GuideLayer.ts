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
  private angleMeasurement: { point: Point; angle: number } | null = null;
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

  setAngleMeasurement(point: Point | null, angle: number | null): void {
    if (point && angle !== null) {
      this.angleMeasurement = { point, angle };
    } else {
      this.angleMeasurement = null;
    }
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

    // Render angle measurement
    if (this.angleMeasurement) {
      this.renderAngleMeasurement(ctx, this.angleMeasurement.point, this.angleMeasurement.angle);
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

      // 라벨 (Screen Space) - removed text label
    } else {
      // 수직 가이드 (캔버스 전체 높이)
      const x = guide.from.x;
      ctx.beginPath();
      ctx.moveTo(x, -1000000);
      ctx.lineTo(x, 1000000);
      ctx.stroke();

      // 라벨 (Screen Space) - removed text label
    }

    ctx.restore();
  }

  private renderAngleGuide(ctx: CanvasRenderingContext2D, from: Point, angle: number): void {
    if (!this.camera) return;

    // Calculate visible bounds in world space
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
    const label = `${angle}°`;
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

    const size = 5; // Reduced from 10 to 5
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
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2); // Reduced from 6 to 3
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

    // CAD Style Configuration
    const offsetDistanceMm = 600; // Increased offset for CAD style
    const extensionGap = 100; // Gap from wall
    const extensionOverhang = 100; // Extension beyond dimension line

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    // Calculate perpendicular offset direction
    // Flip signs to switch from Right-side to Left-side offset (Outside for Clockwise)
    const perpX = Math.sin(angle);
    const perpY = -Math.cos(angle);

    // Extension Lines
    // Start after gap
    const ext1StartX = from.x + perpX * extensionGap;
    const ext1StartY = from.y + perpY * extensionGap;
    const ext2StartX = to.x + perpX * extensionGap;
    const ext2StartY = to.y + perpY * extensionGap;

    // End after dimension line
    const totalOffset = offsetDistanceMm + extensionOverhang;
    const ext1EndX = from.x + perpX * totalOffset;
    const ext1EndY = from.y + perpY * totalOffset;
    const ext2EndX = to.x + perpX * totalOffset;
    const ext2EndY = to.y + perpY * totalOffset;

    // Dimension Line
    const dim1X = from.x + perpX * offsetDistanceMm;
    const dim1Y = from.y + perpY * offsetDistanceMm;
    const dim2X = to.x + perpX * offsetDistanceMm;
    const dim2Y = to.y + perpY * offsetDistanceMm;

    // Convert to Screen Space (Logical Pixels)
    const ext1Start = this.camera.worldToScreen(ext1StartX, ext1StartY);
    const ext1End = this.camera.worldToScreen(ext1EndX, ext1EndY);
    const ext2Start = this.camera.worldToScreen(ext2StartX, ext2StartY);
    const ext2End = this.camera.worldToScreen(ext2EndX, ext2EndY);
    const dim1 = this.camera.worldToScreen(dim1X, dim1Y);
    const dim2 = this.camera.worldToScreen(dim2X, dim2Y);

    // Apply Screen Transform (for DPI)
    this.camera.applyScreenTransform(ctx);

    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineColor = isDarkMode ? '#90CAF9' : '#2c3e50';
    const textColor = isDarkMode ? '#E0E0E0' : '#2c3e50';

    // Draw Extension Lines (Thin, Solid)
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.5; // Thinner
    ctx.setLineDash([]); // Solid

    ctx.beginPath();
    ctx.moveTo(ext1Start.x, ext1Start.y);
    ctx.lineTo(ext1End.x, ext1End.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ext2Start.x, ext2Start.y);
    ctx.lineTo(ext2End.x, ext2End.y);
    ctx.stroke();

    // Draw Dimension Line
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dim1.x, dim1.y);
    ctx.lineTo(dim2.x, dim2.y);
    ctx.stroke();

    // Draw Ticks (Oblique strokes) instead of arrows for CAD style
    const tickSize = 4;
    ctx.lineWidth = 1.5;

    // Tick 1
    ctx.beginPath();
    ctx.moveTo(dim1.x - tickSize, dim1.y + tickSize);
    ctx.lineTo(dim1.x + tickSize, dim1.y - tickSize);
    ctx.stroke();

    // Tick 2
    ctx.beginPath();
    ctx.moveTo(dim2.x - tickSize, dim2.y + tickSize);
    ctx.lineTo(dim2.x + tickSize, dim2.y - tickSize);
    ctx.stroke();

    // Draw Text
    const midX = (dim1.x + dim2.x) / 2;
    const midY = (dim1.y + dim2.y) / 2;

    ctx.save();
    ctx.translate(midX, midY);

    // Rotate text to align with line
    // Ensure text is readable (not upside down)
    let textAngle = angle;
    if (textAngle > Math.PI / 2 || textAngle <= -Math.PI / 2) {
      textAngle += Math.PI;
    }
    ctx.rotate(textAngle);

    // Text Style
    ctx.fillStyle = textColor;
    ctx.font = '12px system-ui'; // Regular font
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom'; // Draw above the line

    const label = `${Math.round(distance)}mm`;
    // Offset slightly above line (-4px)
    ctx.fillText(label, 0, -4);

    ctx.restore();
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

  private renderAngleMeasurement(ctx: CanvasRenderingContext2D, point: Point, angle: number): void {
    if (!this.camera) return;

    ctx.save();

    // Offset from corner point (world space)
    const offsetMm = 400; // 400mm = 40cm offset from corner

    // Position angle label offset from corner point
    const labelX = point.x + offsetMm;
    const labelY = point.y - offsetMm;

    // Convert to screen space
    const screenPos = this.camera.worldToScreen(labelX, labelY);

    // Apply screen transform
    this.camera.applyScreenTransform(ctx);

    // Format angle text
    const angleText = `${angle.toFixed(1)}°`;

    ctx.font = 'bold 13px system-ui';
    const metrics = ctx.measureText(angleText);
    const padding = 8;

    const boxWidth = metrics.width + padding * 2;
    const boxHeight = 24;
    const boxX = screenPos.x - boxWidth / 2;
    const boxY = screenPos.y - boxHeight / 2;

    // Blue background (like reference image)
    ctx.fillStyle = 'rgba(52, 152, 219, 0.95)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
    ctx.fill();

    // White text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(angleText, screenPos.x, screenPos.y);

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
