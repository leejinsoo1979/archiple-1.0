/**
 * LockController - SketchUp-style Inference Lock System
 *
 * Handles keyboard-based inference locking:
 * - Arrow keys: Lock to axis (Right=Red/X, Left=Green/Z, Up=Blue/Y, Down=Toggle)
 * - Shift: Lock current inference
 * - Alt/Command: Toggle linear inference mode
 *
 * Based on SketchUp Drawing Basics documentation
 */

import { Vector3 } from '@babylonjs/core';
import type { InferenceLockAxis, LinearInferenceMode } from '../types';
import { InferenceEngine } from './InferenceEngine';

export interface LockState {
  axisLock: InferenceLockAxis;
  inferenceLocked: boolean;
  linearMode: LinearInferenceMode;
  shiftHeld: boolean;
  planeLock: 'none' | 'red' | 'green' | 'blue';
}

export interface LockControllerConfig {
  inferenceEngine: InferenceEngine;
  onStateChange?: (state: LockState) => void;
}

export class LockController {
  private engine: InferenceEngine;
  private state: LockState;
  private onStateChange?: (state: LockState) => void;
  private keyDownHandler: (e: KeyboardEvent) => void;
  private keyUpHandler: (e: KeyboardEvent) => void;

  constructor(config: LockControllerConfig) {
    this.engine = config.inferenceEngine;
    this.onStateChange = config.onStateChange;

    this.state = {
      axisLock: 'none',
      inferenceLocked: false,
      linearMode: 'all_on',
      shiftHeld: false,
      planeLock: 'none',
    };

    // Bind event handlers
    this.keyDownHandler = this.handleKeyDown.bind(this);
    this.keyUpHandler = this.handleKeyUp.bind(this);
  }

  /**
   * Start listening for keyboard events
   */
  public attach(): void {
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
  }

  /**
   * Stop listening for keyboard events
   */
  public detach(): void {
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
  }

  /**
   * Handle key down events
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // Ignore if in input field
    if (this.isInputFocused()) return;

    let handled = false;

    switch (e.key) {
      case 'ArrowRight':
        // Lock to Red (X) axis
        this.setAxisLock('red');
        handled = true;
        break;

      case 'ArrowLeft':
        // Lock to Green (Z) axis
        this.setAxisLock('green');
        handled = true;
        break;

      case 'ArrowUp':
        // Lock to Blue (Y) axis
        this.setAxisLock('blue');
        handled = true;
        break;

      case 'ArrowDown':
        // Toggle axis lock off or cycle
        if (this.state.axisLock !== 'none') {
          this.setAxisLock('none');
        }
        handled = true;
        break;

      case 'Shift':
        // Lock current inference
        if (!this.state.shiftHeld) {
          this.state.shiftHeld = true;
          this.engine.lockCurrentInference();
          this.state.inferenceLocked = true;
          this.notifyChange();
        }
        handled = true;
        break;

      case 'Alt':
      case 'Meta': // Command key on Mac
        // Toggle linear inference mode
        if (!e.repeat) {
          this.toggleLinearMode();
        }
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
    }
  }

  /**
   * Handle key up events
   */
  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Shift') {
      this.state.shiftHeld = false;
      this.engine.unlockInference();
      this.state.inferenceLocked = false;
      this.notifyChange();
    }
  }

  /**
   * Set axis lock
   */
  public setAxisLock(axis: InferenceLockAxis): void {
    // Toggle off if same axis pressed again
    if (this.state.axisLock === axis && axis !== 'none') {
      this.state.axisLock = 'none';
      this.engine.unlockAxis();
    } else {
      this.state.axisLock = axis;
      this.engine.lockAxis(axis);
    }
    this.notifyChange();
  }

  /**
   * Lock to magenta (parallel/perpendicular to reference edge)
   */
  public lockToParallel(edgeStart: Vector3, edgeEnd: Vector3): void {
    this.state.axisLock = 'magenta';
    this.engine.setReferenceEdge(edgeStart, edgeEnd);
    this.engine.lockAxis('magenta');
    this.notifyChange();
  }

  /**
   * Toggle linear inference mode
   * Cycles: All On → All Off → Parallel/Perpendicular Only → All On
   */
  public toggleLinearMode(): void {
    this.state.linearMode = this.engine.toggleLinearInferenceMode();
    this.notifyChange();
  }

  /**
   * Set plane lock for 2D constraints
   */
  public setPlaneLock(plane: 'none' | 'red' | 'green' | 'blue'): void {
    this.state.planeLock = plane;
    this.engine.setPlaneLock(plane);
    this.notifyChange();
  }

  /**
   * Reset all locks
   */
  public reset(): void {
    this.state = {
      axisLock: 'none',
      inferenceLocked: false,
      linearMode: 'all_on',
      shiftHeld: false,
      planeLock: 'none',
    };
    this.engine.reset();
    this.notifyChange();
  }

  /**
   * Get current lock state
   */
  public getState(): LockState {
    return { ...this.state };
  }

  /**
   * Check if focus is on an input element
   */
  private isInputFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement ||
           active instanceof HTMLTextAreaElement ||
           active?.getAttribute('contenteditable') === 'true';
  }

  /**
   * Notify state change
   */
  private notifyChange(): void {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }

  /**
   * Get status display text
   */
  public getStatusText(): string {
    const parts: string[] = [];

    // Axis lock status
    if (this.state.axisLock !== 'none') {
      const axisNames: Record<InferenceLockAxis, string> = {
        none: '',
        red: 'Red Axis (X)',
        green: 'Green Axis (Z)',
        blue: 'Blue Axis (Y)',
        magenta: 'Parallel/Perpendicular',
      };
      parts.push(`Locked: ${axisNames[this.state.axisLock]}`);
    }

    // Inference lock status
    if (this.state.inferenceLocked) {
      parts.push('[Shift Lock]');
    }

    // Linear mode status
    if (this.state.linearMode !== 'all_on') {
      const modeNames: Record<LinearInferenceMode, string> = {
        all_on: '',
        all_off: 'Linear Off',
        parallel_perpendicular_only: 'Parallel/Perp Only',
      };
      parts.push(modeNames[this.state.linearMode]);
    }

    return parts.join(' | ');
  }

  /**
   * Get color for current axis lock
   */
  public getAxisColor(): string {
    switch (this.state.axisLock) {
      case 'red': return '#FF0000';
      case 'green': return '#00CC00';
      case 'blue': return '#0000FF';
      case 'magenta': return '#FF00FF';
      default: return '#888888';
    }
  }
}

export default LockController;
