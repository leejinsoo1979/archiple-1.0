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
    this.config = { ...this.config, ...config };
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || this.width === 0 || this.height === 0) return;

    this.applyOpacity(ctx);

    // Fill background
    ctx.fillStyle = this.config.backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw minor grid
    this.drawGrid(ctx, this.config.gridSize, this.config.minorColor, 0.5);

    // Draw major grid
    this.drawGrid(ctx, this.config.majorGridSize, this.config.majorColor, 1.0);

    this.resetOpacity(ctx);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    gridSize: number,
    color: string,
    lineWidth: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Vertical lines
    for (let x = 0; x <= this.width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }

    // Horizontal lines
    for (let y = 0; y <= this.height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }

    ctx.stroke();
  }
}
