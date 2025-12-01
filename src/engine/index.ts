/**
 * Archiple Engine v1.0 - Core Engine Layer
 *
 * This is the foundation for Archiple's architecture-agnostic engine.
 * It provides:
 * - Geometry Kernel: Pure math operations (Vector2, Line, Polygon)
 * - Command Engine: Undo/Redo system
 * - Event Bus: Decoupled pub/sub communication
 * - Adapters: Bridge to existing modeling and viewer code
 *
 * The engine is independent of:
 * - Babylon.js (3D rendering)
 * - React (UI framework)
 * - Existing src/modeling/ code
 *
 * This allows:
 * - Gradual migration from current codebase
 * - Unit testing without 3D context
 * - Future flexibility (swap renderers, etc.)
 */

// Core modules
export * from './core';

// Adapters
export * from './adapters';

// Version info
export const ENGINE_VERSION = '1.0.0-skeleton';
