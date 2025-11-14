import { Point } from './Point';
import { Wall } from './Wall';
import { Room } from './Room';

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
  DRAW_WALL = 'draw_wall',
  MOVE = 'move',
  ERASE = 'erase',
}

export interface EditorConfig {
  gridSize: number;
  snapThreshold: number;
  wallThickness: number;
  wallHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}
