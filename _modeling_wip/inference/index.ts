/**
 * Inference Module - SketchUp-style Inference System
 *
 * Exports:
 * - InferenceEngine: Core inference detection
 * - LockController: Keyboard-based lock handling
 * - useInferenceStore: Zustand store for React binding
 */

export { InferenceEngine } from './InferenceEngine';
export type { InferenceEngineConfig, InferenceResult } from './InferenceEngine';

export { LockController } from './LockController';
export type { LockState, LockControllerConfig } from './LockController';
