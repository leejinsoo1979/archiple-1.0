/**
 * Base class for all modeling tools
 * Provides common functionality and lifecycle management
 */

import { PointerInfo } from '@babylonjs/core';
import { BaseTool as IBaseTool, ToolContext, ToolType, PickResultInfo } from '../types';

export abstract class BaseTool implements IBaseTool {
  abstract name: ToolType;
  abstract cursor: string;

  protected context: ToolContext | null = null;
  protected active: boolean = false;

  // ============================================
  // Lifecycle Methods
  // ============================================

  activate(context: ToolContext): void {
    this.context = context;
    this.active = true;
    this.onActivate();
  }

  deactivate(): void {
    this.onDeactivate();
    this.reset();
    this.active = false;
    this.context = null;
  }

  reset(): void {
    this.onReset();
  }

  // Override these in subclasses
  protected onActivate(): void {}
  protected onDeactivate(): void {}
  protected onReset(): void {}

  // ============================================
  // Input Handling (to be overridden)
  // ============================================

  onPointerDown(_info: PointerInfo, _pickResult: PickResultInfo): void {}
  onPointerMove(_info: PointerInfo, _pickResult: PickResultInfo): void {}
  onPointerUp(_info: PointerInfo, _pickResult: PickResultInfo): void {}
  onKeyDown(_event: KeyboardEvent): void {}
  onKeyUp(_event: KeyboardEvent): void {}

  /**
   * Handle numeric value input (e.g., "1000,500" for dimensions)
   * @returns true if the value was handled, false otherwise
   */
  onValueInput(_value: string): boolean {
    return false;
  }

  // ============================================
  // State
  // ============================================

  isActive(): boolean {
    return this.active;
  }

  abstract getState(): unknown;

  // ============================================
  // Helper Methods
  // ============================================

  protected setStatus(text: string): void {
    this.context?.setStatusText(text);
  }

  protected showSnap(type: Parameters<ToolContext['showSnapIndicator']>[0]): void {
    this.context?.showSnapIndicator(type);
  }

  protected hideSnap(): void {
    this.context?.hideSnapIndicator();
  }

  protected setInput(value: string): void {
    this.context?.setInputValue(value);
  }

  protected get scene() {
    return this.context?.scene ?? null;
  }

  protected get camera() {
    return this.context?.camera ?? null;
  }

  protected get canvas() {
    return this.context?.canvas ?? null;
  }

  protected get snapSystem() {
    return this.context?.snapSystem ?? null;
  }

  protected get selectionSystem() {
    return this.context?.selectionSystem ?? null;
  }
}
