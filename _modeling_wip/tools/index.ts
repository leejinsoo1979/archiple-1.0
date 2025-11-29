/**
 * Tools Module - SketchUp-style Drawing Tools
 *
 * Exports:
 * - BaseTool: Abstract base class for all tools
 * - LineTool: Edge/line drawing with inference support
 * - RectangleTool: Axis-aligned rectangle with Square/Golden Section inference
 * - RotatedRectangleTool: Rotated rectangle (3-click)
 * - CircleTool: Circle drawing with segments
 * - PolygonTool: Regular polygon drawing with sides
 */

// Base Tool
export { BaseTool, GOLDEN_RATIO, GOLDEN_RATIO_TOLERANCE } from './BaseTool';
export type { ToolType, ToolState, BaseToolConfig, ShapeCreatedEvent } from './BaseTool';

// Line Tool
export { LineTool } from './LineTool';
export type { LineToolState, LineToolConfig } from './LineTool';

// Rectangle Tool
export { RectangleTool } from './RectangleTool';
export type { RectangleToolState } from './RectangleTool';

// Rotated Rectangle Tool
export { RotatedRectangleTool } from './RotatedRectangleTool';
export type { RotatedRectangleToolState } from './RotatedRectangleTool';

// Circle Tool
export { CircleTool } from './CircleTool';
export type { CircleToolState } from './CircleTool';

// Polygon Tool
export { PolygonTool } from './PolygonTool';
export type { PolygonToolState } from './PolygonTool';

// ============================================================================
// Tool Registry - Map of tool types to their constructors
// ============================================================================

import type { Scene, AbstractMesh } from '@babylonjs/core';
import type { BaseToolConfig } from './BaseTool';
import { LineTool } from './LineTool';
import { RectangleTool } from './RectangleTool';
import { RotatedRectangleTool } from './RotatedRectangleTool';
import { CircleTool } from './CircleTool';
import { PolygonTool } from './PolygonTool';

export type ToolConstructor = new (config: BaseToolConfig) => BaseTool;

export const TOOL_REGISTRY: Record<string, ToolConstructor> = {
  line: LineTool,
  rectangle: RectangleTool,
  rotated_rectangle: RotatedRectangleTool,
  circle: CircleTool,
  polygon: PolygonTool,
};

export const HOTKEY_MAP: Record<string, string> = {
  L: 'line',
  R: 'rectangle',
  C: 'circle',
  G: 'polygon',
};

/**
 * Create a tool instance by type
 */
export function createTool(
  toolType: string,
  scene: Scene,
  groundMesh?: AbstractMesh,
  callbacks?: Partial<Pick<BaseToolConfig, 'onToolActivated' | 'onToolDeactivated' | 'onStateChange' | 'onShapeCreated'>>
): BaseTool | null {
  const ToolClass = TOOL_REGISTRY[toolType];
  if (!ToolClass) return null;

  return new ToolClass({
    scene,
    groundMesh,
    ...callbacks,
  });
}

/**
 * Get tool type from hotkey
 */
export function getToolTypeFromHotkey(key: string): string | null {
  return HOTKEY_MAP[key.toUpperCase()] || null;
}
