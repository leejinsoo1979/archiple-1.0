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
      minorColor: config.minorColor || '#e8e8e8',
      majorColor: config.majorColor || '#d0d0d0',
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
    const invZoom = 1 / transform.a; // a = scaleX = zoom

    // Calculate visible world bounds
    const viewLeft = (-transform.e) * invZoom;
    const viewTop = (-transform.f) * invZoom;
    const viewRight = (this.width - transform.e) * invZoom;
    const viewBottom = (this.height - transform.f) * invZoom;

    // Fill background (in world space, so it appears infinite)
    const margin = Math.max(this.width, this.height) * invZoom;
    ctx.fillStyle = this.config.backgroundColor;
    ctx.fillRect(viewLeft - margin, viewTop - margin, (viewRight - viewLeft) + margin * 2, (viewBottom - viewTop) + margin * 2);

    // Draw minor grid
    this.drawGrid(ctx, this.config.gridSize, this.config.minorColor, 0.5, viewLeft, viewTop, viewRight, viewBottom);

    // Draw major grid
    this.drawGrid(ctx, this.config.majorGridSize, this.config.majorColor, 1.0, viewLeft, viewTop, viewRight, viewBottom);

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
    viewBottom: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth / ctx.getTransform().a; // Scale line width with zoom
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
}
