import { BaseLayer } from './Layer';

export interface GridLayerConfig {
  gridSize: number;
  majorGridSize?: number;
  minorColor?: string;
  majorColor?: string;
  backgroundColor?: string;
}

/**
 * GridLayer - Renders background grid
 *
 * Features:
 * - Minor grid lines (every gridSize pixels)
 * - Major grid lines (every majorGridSize pixels)
 * - Customizable colors
 */
export class GridLayer extends BaseLayer {
  private config: Required<GridLayerConfig>;
  private width = 0;
  private height = 0;

  constructor(config: GridLayerConfig) {
    super(0); // z-index: 0 (background)

    this.config = {
      gridSize: config.gridSize,
      majorGridSize: config.majorGridSize || config.gridSize * 5,
      minorColor: config.minorColor || '#888888',
      majorColor: config.majorColor || '#606060',
      backgroundColor: config.backgroundColor || '#ffffff',
    };
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  updateConfig(config: Partial<GridLayerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      majorGridSize: config.majorGridSize || (config.gridSize ? config.gridSize * 5 : this.config.majorGridSize),
    };
    console.log('[GridLayer] Config updated:', this.config);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || this.width === 0 || this.height === 0) return;

    this.applyOpacity(ctx);

    // Get current transform to calculate visible bounds in world space
    const transform = ctx.getTransform();
    const zoom = transform.a; // a = scaleX = zoom
    const invZoom = 1 / zoom;

    // Calculate visible world bounds
    const viewLeft = (-transform.e) * invZoom;
    const viewTop = (-transform.f) * invZoom;
    const viewRight = (this.width - transform.e) * invZoom;
    const viewBottom = (this.height - transform.f) * invZoom;

    // Fill background - FULLY OPAQUE
    const margin = Math.max(this.width, this.height) * invZoom;
    ctx.fillStyle = this.config.backgroundColor;
    ctx.fillRect(viewLeft - margin, viewTop - margin, (viewRight - viewLeft) + margin * 2, (viewBottom - viewTop) + margin * 2);

    // Constant high opacity - no fade with zoom
    // Grid should always be clearly visible at any zoom level
    const minorOpacity = 0.8; // 80% for minor grid (clearly visible)
    const majorOpacity = 1.0; // 100% for major grid (always clear)

    // Draw minor grid (10cm) - lighter color with moderate opacity
    this.drawGrid(ctx, this.config.gridSize, this.config.minorColor, 1, viewLeft, viewTop, viewRight, viewBottom, minorOpacity);

    // Draw major grid (1m) - darker color with full opacity
    this.drawGrid(ctx, this.config.majorGridSize, this.config.majorColor, 2, viewLeft, viewTop, viewRight, viewBottom, majorOpacity);

    this.resetOpacity(ctx);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    gridSize: number,
    color: string,
    lineWidth: number,
    viewLeft: number,
    viewTop: number,
    viewRight: number,
    viewBottom: number,
    opacity: number = 1.0
  ): void {
    // Parse color and apply opacity
    const rgb = this.hexToRgb(color);
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Calculate grid start positions (snap to grid)
    const startX = Math.floor(viewLeft / gridSize) * gridSize;
    const startY = Math.floor(viewTop / gridSize) * gridSize;

    // Pixel alignment offset for crisp 1px lines (0.5px offset for odd lineWidth)
    const offset = lineWidth % 2 === 1 ? 0.5 : 0;

    // Vertical lines (draw beyond visible area for smooth panning)
    for (let x = startX; x <= viewRight; x += gridSize) {
      const alignedX = Math.floor(x) + offset;
      ctx.moveTo(alignedX, viewTop);
      ctx.lineTo(alignedX, viewBottom);
    }

    // Horizontal lines (draw beyond visible area for smooth panning)
    for (let y = startY; y <= viewBottom; y += gridSize) {
      const alignedY = Math.floor(y) + offset;
      ctx.moveTo(viewLeft, alignedY);
      ctx.lineTo(viewRight, alignedY);
    }

    ctx.stroke();
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }
}
