import { Vector2 } from '../../core/math/Vector2';

/**
 * Camera2D - CAD-style viewport camera
 *
 * Features:
 * - Zoom in/out (mouse wheel)
 * - Pan (middle mouse drag or space + drag)
 * - Screen to world coordinate conversion
 * - World to screen coordinate conversion
 *
 * Coordinate system:
 * - Canvas coordinates are in pixels
 * - World coordinates are in pixels (NOT mm - simplified)
 * - Display scale: 1 pixel = 10mm = 1cm (only for display/rendering)
 * - Grid: gridSize (20px) = 20cm, major (100px) = 1m
 */
export class Camera2D {
  private position: Vector2; // Camera center position in pixels
  private zoom: number; // Zoom level (1.0 = normal, 2.0 = 2x zoom in)
  private canvasWidth: number;
  private canvasHeight: number;

  // Display scale: 1 pixel = 10mm = 1cm (for rendering/display only)
  // Grid: gridSize=20px = 200mm = 20cm, major grid (100px) = 1m
  private static readonly PIXELS_TO_MM = 10; // 1 pixel = 10mm = 1cm
  private static readonly MM_TO_PIXELS = 1 / 10; // 1mm = 0.1 pixels

  // Zoom constraints
  private minZoom = 0.1; // 10% (far out)
  private maxZoom = 10.0; // 1000% (close in)

  constructor(canvasWidth: number, canvasHeight: number) {
    // Camera starts at center in pixels
    this.position = new Vector2(canvasWidth / 2, canvasHeight / 2);
    this.zoom = 1.0;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  /**
   * Set canvas size
   */
  setSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.zoom;
  }

  /**
   * Set zoom level
   */
  setZoom(zoom: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /**
   * Zoom in/out at a specific screen point (for mouse wheel zoom)
   */
  zoomAt(screenX: number, screenY: number, zoomDelta: number): void {
    // Get world position before zoom
    const worldPosBefore = this.screenToWorld(screenX, screenY);

    // Apply zoom
    const newZoom = this.zoom * (1 + zoomDelta);
    this.setZoom(newZoom);

    // Get world position after zoom (it will have shifted)
    const worldPosAfter = this.screenToWorld(screenX, screenY);

    // Adjust camera position to keep the point under cursor stationary
    const dx = worldPosAfter.x - worldPosBefore.x;
    const dy = worldPosAfter.y - worldPosBefore.y;
    this.position.x -= dx;
    this.position.y -= dy;
  }

  /**
   * Pan camera by screen space delta
   */
  pan(screenDx: number, screenDy: number): void {
    // Convert screen delta to world delta (account for zoom)
    const worldDx = screenDx / this.zoom;
    const worldDy = screenDy / this.zoom;

    this.position.x -= worldDx;
    this.position.y -= worldDy;
  }

  /**
   * Set camera position
   */
  setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;
  }

  /**
   * Get camera position
   */
  getPosition(): Vector2 {
    return this.position.clone();
  }

  /**
   * Convert screen coordinates (pixels) to world coordinates (pixels)
   */
  screenToWorld(screenX: number, screenY: number): Vector2 {
    // Convert screen pixels to world pixels (accounting for zoom and camera position)
    const worldX = (screenX - this.canvasWidth / 2) / this.zoom + this.position.x;
    const worldY = (screenY - this.canvasHeight / 2) / this.zoom + this.position.y;

    return new Vector2(worldX, worldY);
  }

  /**
   * Convert world coordinates (pixels) to screen coordinates (pixels)
   */
  worldToScreen(worldX: number, worldY: number): Vector2 {
    // Convert world pixels to screen pixels (accounting for zoom and camera position)
    const screenX = (worldX - this.position.x) * this.zoom + this.canvasWidth / 2;
    const screenY = (worldY - this.position.y) * this.zoom + this.canvasHeight / 2;

    return new Vector2(screenX, screenY);
  }

  /**
   * Apply camera transform to canvas context
   */
  applyTransform(ctx: CanvasRenderingContext2D): void {
    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Translate to center
    ctx.translate(this.canvasWidth / 2, this.canvasHeight / 2);

    // Apply zoom
    ctx.scale(this.zoom, this.zoom);

    // Translate to camera position (already in pixels)
    ctx.translate(-this.position.x, -this.position.y);
  }

  /**
   * Get visible world bounds
   */
  getVisibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.canvasWidth, this.canvasHeight);

    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y,
    };
  }

  /**
   * Reset camera to default state
   */
  reset(): void {
    this.position.x = this.canvasWidth / 2;
    this.position.y = this.canvasHeight / 2;
    this.zoom = 1.0;
  }
}
