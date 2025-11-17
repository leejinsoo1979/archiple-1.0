import type { Tool } from './Tool';
import { Vector2 } from '../../core/math/Vector2';
import { ToolType } from '../../core/types/EditorState';

/**
 * ToolManager - Manages tool lifecycle and input routing
 *
 * Responsibilities:
 * - Register and store tools
 * - Activate/deactivate tools
 * - Route mouse/keyboard events to active tool
 */
export class ToolManager {
  private tools: Map<ToolType, Tool> = new Map();
  private activeTool: Tool | null = null;

  /**
   * Register a tool
   */
  registerTool(type: ToolType, tool: Tool): void {
    this.tools.set(type, tool);
    console.log(`[ToolManager] Registered tool: ${type}`);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(type: ToolType): void {
    const tool = this.tools.get(type);
    if (tool && tool.isActive) {
      tool.deactivate();
    }
    this.tools.delete(type);
  }

  /**
   * Set active tool
   */
  setActiveTool(type: ToolType): boolean {
    const tool = this.tools.get(type);
    if (!tool) {
      console.warn(`[ToolManager] Tool not found: ${type}`);
      return false;
    }

    // Deactivate current tool
    if (this.activeTool && this.activeTool !== tool) {
      this.activeTool.deactivate();
    }

    // Activate new tool
    this.activeTool = tool;
    tool.activate();

    console.log(`[ToolManager] Activated tool: ${type}`);
    return true;
  }

  /**
   * Get active tool
   */
  getActiveTool(): Tool | null {
    return this.activeTool;
  }

  /**
   * Get tool by type
   */
  getTool(type: ToolType): Tool | undefined {
    return this.tools.get(type);
  }

  /**
   * Route mouse down event to active tool
   */
  handleMouseDown(position: Vector2, event: MouseEvent): void {
    if (this.activeTool) {
      console.log('[ToolManager] Routing mouse down to active tool:', this.activeTool.name);
      this.activeTool.handleMouseDown(position, event);
    } else {
      console.warn('[ToolManager] No active tool to route mouse down to!');
    }
  }

  /**
   * Route mouse move event to active tool
   */
  handleMouseMove(position: Vector2, event: MouseEvent): void {
    if (this.activeTool) {
      this.activeTool.handleMouseMove(position, event);
    }
  }

  /**
   * Route mouse up event to active tool
   */
  handleMouseUp(position: Vector2, event: MouseEvent): void {
    if (this.activeTool) {
      console.log('[ToolManager] Routing mouse up to active tool:', this.activeTool.name);
      this.activeTool.handleMouseUp(position, event);
    }
  }

  /**
   * Route key down event to active tool
   */
  handleKeyDown(event: KeyboardEvent): void {
    if (this.activeTool) {
      this.activeTool.handleKeyDown(event);
    }
  }

  /**
   * Route key up event to active tool
   */
  handleKeyUp(event: KeyboardEvent): void {
    if (this.activeTool) {
      this.activeTool.handleKeyUp(event);
    }
  }

  /**
   * Get cursor for active tool
   */
  getCursor(): string {
    return this.activeTool?.getCursor() || 'default';
  }

  /**
   * Get all registered tool types
   */
  getRegisteredTools(): ToolType[] {
    return Array.from(this.tools.keys());
  }
}
