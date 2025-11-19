import { Vector2 } from '../../core/math/Vector2';
import { ToolManager } from '../tools/ToolManager';
import type { Camera2D } from '../renderer/Camera2D';

/**
 * MouseController - Handles mouse input for the canvas
 *
 * Features:
 * - Canvas coordinate conversion with camera transform
 * - Event routing to ToolManager
 * - Right-click prevention
 */
export class MouseController {
  private canvas: HTMLCanvasElement;
  private toolManager: ToolManager;
  private camera: Camera2D | null = null;

  constructor(canvas: HTMLCanvasElement, toolManager: ToolManager) {
    this.canvas = canvas;
    this.toolManager = toolManager;

    this.setupEventListeners();
  }

  /**
   * Set camera for coordinate transformation
   */
  setCamera(camera: Camera2D): void {
    this.camera = camera;
  }

  /**
   * Setup mouse event listeners
   */
  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
  }

  /**
   * Remove event listeners (cleanup)
   */
  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.removeEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.removeEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu.bind(this));
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave.bind(this));
  }

  /**
   * Convert mouse event to world coordinates (with camera transform)
   */
  private getCanvasPosition(event: MouseEvent): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Convert screen coordinates to world coordinates using camera
    if (this.camera) {
      return this.camera.screenToWorld(screenX, screenY);
    }

    // Fallback to screen coordinates if no camera
    return new Vector2(screenX, screenY);
  }

  /**
   * Handle mouse down
   */
  private handleMouseDown(event: MouseEvent): void {
    const position = this.getCanvasPosition(event);
    this.toolManager.handleMouseDown(position, event);

    // Update cursor
    this.updateCursor();
  }

  /**
   * Handle mouse move
   */
  private handleMouseMove(event: MouseEvent): void {
    const position = this.getCanvasPosition(event);
    this.toolManager.handleMouseMove(position, event);

    // Update cursor
    this.updateCursor();
  }

  /**
   * Handle mouse up
   */
  private handleMouseUp(event: MouseEvent): void {
    const position = this.getCanvasPosition(event);
    this.toolManager.handleMouseUp(position, event);

    // Update cursor
    this.updateCursor();
  }

  /**
   * Handle context menu (right-click)
   */
  private handleContextMenu(event: MouseEvent): void {
    event.preventDefault();

    // Right-click is used to finish wall chains
    const position = this.getCanvasPosition(event);
    this.toolManager.handleMouseDown(position, event);
  }

  /**
   * Handle mouse leave
   */
  private handleMouseLeave(_event: MouseEvent): void {
    // Reset cursor
    this.canvas.style.cursor = 'default';
  }

  /**
   * Update canvas cursor based on active tool
   */
  private updateCursor(): void {
    const cursor = this.toolManager.getCursor();
    this.canvas.style.cursor = cursor;
  }
}
