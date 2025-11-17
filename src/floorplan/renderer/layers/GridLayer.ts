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
      minorColor: config.minorColor || '#b0b0b0',
      majorColor: config.majorColor || '#808080',
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

    // Fill background (in world space, so it appears infinite)
    const margin = Math.max(this.width, this.height) * invZoom;
    ctx.fillStyle = this.config.backgroundColor;
    ctx.fillRect(viewLeft - margin, viewTop - margin, (viewRight - viewLeft) + margin * 2, (viewBottom - viewTop) + margin * 2);

    // Calculate grid opacity based on zoom level
    // Zoom < 0.05: opacity 0.5
    // Zoom 0.05-1.0: fade from 0.5 to 1.0
    // Zoom >= 1.0: opacity 1.0
    let gridOpacity = 1.0;
    if (zoom < 0.05) {
      gridOpacity = 0.5;
    } else if (zoom < 1.0) {
      gridOpacity = 0.5 + (zoom - 0.05) / 0.95 * 0.5; // Linear fade from 0.5 to 1.0
    }

    // Draw minor grid with fade effect
    this.drawGrid(ctx, this.config.gridSize, this.config.minorColor, 1.5, viewLeft, viewTop, viewRight, viewBottom, gridOpacity);

    // Draw major grid with fade effect
    this.drawGrid(ctx, this.config.majorGridSize, this.config.majorColor, 2.5, viewLeft, viewTop, viewRight, viewBottom, gridOpacity);

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

    // Vertical lines (draw beyond visible area for smooth panning)
    for (let x = startX; x <= viewRight; x += gridSize) {
      ctx.moveTo(x, viewTop);
      ctx.lineTo(x, viewBottom);
    }

    // Horizontal lines (draw beyond visible area for smooth panning)
    for (let y = startY; y <= viewBottom; y += gridSize) {
      ctx.moveTo(viewLeft, y);
      ctx.lineTo(viewRight, y);
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
