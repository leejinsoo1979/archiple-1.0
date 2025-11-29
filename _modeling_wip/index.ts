/**
 * SketchUp-style Modeling Module
 *
 * Complete implementation of SketchUp Drawing Basics:
 * - Inference Engine (Point, Linear, Shape inferences)
 * - Geometry Store (Edge/Vertex graph with automatic face creation)
 * - Drawing Tools (Line, Rectangle, Circle, etc.)
 * - HUD Components (ScreenTip, MeasurementsBox, StatusBar)
 *
 * Usage:
 * ```typescript
 * import { LineTool, InferenceEngine, useGeometryStore } from '@/modeling';
 *
 * // Initialize tool
 * const lineTool = new LineTool({ scene, groundMesh });
 * lineTool.activate();
 *
 * // Access geometry
 * const edges = useGeometryStore.getState().edges;
 * ```
 */

// Types
export * from './types';

// Stores
export { useGeometryStore } from './stores/geometryStore';
export { useInferenceStore } from './stores/inferenceStore';

// Inference System
export { InferenceEngine } from './inference/InferenceEngine';
export { LockController } from './inference/LockController';
export type { InferenceEngineConfig, InferenceResult } from './inference/InferenceEngine';
export type { LockState, LockControllerConfig } from './inference/LockController';

// Tools
export { LineTool } from './tools/LineTool';
export type { LineToolState, LineToolConfig } from './tools/LineTool';

// UI Components
export { ScreenTip, InferenceStatusBar } from './ui/ScreenTip';
export { MeasurementsBox, MeasurementDisplay } from './ui/MeasurementsBox';
export type { MeasurementsBoxProps, MeasurementResult, MeasurementDisplayProps } from './ui/MeasurementsBox';
