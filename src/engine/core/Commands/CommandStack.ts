/**
 * Command Stack - Manages Undo/Redo history
 * TODO: Add full implementation later
 */

import { ICommand } from './Command';

export interface CommandStackOptions {
  /** Maximum number of commands to keep in history */
  maxHistory?: number;
}

export class CommandStack {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private maxHistory: number;

  constructor(options?: CommandStackOptions) {
    this.maxHistory = options?.maxHistory ?? 100;
  }

  /**
   * Execute a command and add to history
   */
  execute(command: ICommand): void {
    // TODO: Implement
    // 1. Execute the command
    // 2. Add to undo stack
    // 3. Clear redo stack
    // 4. Trim history if exceeds maxHistory
  }

  /**
   * Undo the last command
   */
  undo(): boolean {
    // TODO: Implement
    // 1. Pop from undo stack
    // 2. Call command.undo()
    // 3. Push to redo stack
    return false;
  }

  /**
   * Redo the last undone command
   */
  redo(): boolean {
    // TODO: Implement
    // 1. Pop from redo stack
    // 2. Call command.redo() or command.execute()
    // 3. Push to undo stack
    return false;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Get undo stack length
   */
  get undoCount(): number {
    return this.undoStack.length;
  }

  /**
   * Get redo stack length
   */
  get redoCount(): number {
    return this.redoStack.length;
  }
}
