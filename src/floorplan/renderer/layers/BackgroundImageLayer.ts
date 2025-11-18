import { BaseLayer } from './BaseLayer';

/**
 * Background image layer for displaying uploaded floor plan images
 */
export class BackgroundImageLayer extends BaseLayer {
  private image: HTMLImageElement | null = null;
  private scale: number = 1.0;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private opacity: number = 0.5;

  constructor(ctx: CanvasRenderingContext2D) {
    super(ctx);
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

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
  }

  getScale(): number {
    return this.scale;
  }

  getOpacity(): number {
    return this.opacity;
  }

  render(viewport: { offsetX: number; offsetY: number; zoom: number }): void {
    if (!this.image) return;

    const ctx = this.ctx;

    ctx.save();

    // Apply viewport transform
    ctx.translate(viewport.offsetX, viewport.offsetY);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Apply image offset
    ctx.translate(this.offsetX, this.offsetY);

    // Set opacity
    ctx.globalAlpha = this.opacity;

    // Draw image with scale
    const width = this.image.width * this.scale;
    const height = this.image.height * this.scale;

    ctx.drawImage(this.image, 0, 0, width, height);

    ctx.restore();
  }
}
