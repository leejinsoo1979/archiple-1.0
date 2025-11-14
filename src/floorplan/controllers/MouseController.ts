import { Vector2 } from '../../core/math/Vector2';
import { ToolManager } from '../tools/ToolManager';

/**
 * MouseController - Handles mouse input for the canvas
 *
 * Features:
 * - Canvas coordinate conversion
 * - Event routing to ToolManager
 * - Right-click prevention
 */
export class MouseController {
  private canvas: HTMLCanvasElement;
  private toolManager: ToolManager;

  constructor(canvas: HTMLCanvasElement, toolManager: ToolManager) {
    this.canvas = canvas;
    this.toolManager = toolManager;

    this.setupEventListeners();
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
   * Convert mouse event to canvas coordinates
   */
  private getCanvasPosition(event: MouseEvent): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector2(event.clientX - rect.left, event.clientY - rect.top);
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
