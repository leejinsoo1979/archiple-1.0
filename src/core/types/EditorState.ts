import type { Point } from './Point';
import type { Wall } from './Wall';
import type { Room } from './Room';

/**
 * EditorState represents the complete state of the editor
 */
export interface EditorState {
  points: Map<string, Point>;
  walls: Map<string, Wall>;
  rooms: Map<string, Room>;
  selectedObjects: Set<string>;
  hoveredObject: string | null;
  currentTool: ToolType;
  gridSize: number;
  snapEnabled: boolean;
}

export enum ToolType {
  SELECT = 'select',
  WALL = 'wall',
  DRAW_WALL = 'draw_wall',
  MOVE = 'move',
  ERASE = 'erase',
}

export interface EditorConfig {
  gridSize: number;
  snapEnabled: boolean;
  snapThreshold: number;
  wallThickness: number;
  wallHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}
