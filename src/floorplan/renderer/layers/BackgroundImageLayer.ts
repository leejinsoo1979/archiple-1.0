import { BaseLayer } from './Layer';

/**
 * Background image layer for displaying uploaded floor plan images
 */
export class BackgroundImageLayer extends BaseLayer {
  private image: HTMLImageElement | null = null;
  private scale: number = 1.0;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private imageOpacity: number = 0.5;
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    super(-1); // z-index: -1 (below grid)
    this.ctx = ctx;
  }

  setImage(image: HTMLImageElement | null): void {
    this.image = image;
  }

  setScale(scale: number): void {
    this.scale = Math.max(0.1, Math.min(5, scale));
  }

  setOffset(x: number, y: number): void {
    this.offsetX = x;
    this.offsetY = y;
  }

  setImageOpacity(opacity: number): void {
    this.imageOpacity = Math.max(0, Math.min(1, opacity));
  }

  getScale(): number {
    return this.scale;
  }

  getImageOpacity(): number {
    return this.imageOpacity;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.image || !this.visible) return;

    ctx.save();

    // Set opacity
    ctx.globalAlpha = this.imageOpacity;

    // Draw image with scale at origin
    const width = this.image.width * this.scale;
    const height = this.image.height * this.scale;

    ctx.drawImage(this.image, this.offsetX, this.offsetY, width, height);

    ctx.restore();
  }
}
