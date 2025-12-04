/**
 * World Editor Types
 *
 * Type definitions for the Archiple World Level Editor
 */

import type { AbstractMesh, AnimationGroup, Mesh } from '@babylonjs/core';

// ===== World Configuration Types =====

export interface WorldArea {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  name?: string;
}

export interface TerrainOptions {
  enabled: boolean;
  verticalExaggeration: number;
  resolution: 'low' | 'medium' | 'high';
  dataSource: 'mapbox' | 'mapzen' | 'custom';
}

export interface BuildingOptions {
  enabled: boolean;
  lod: 'low' | 'medium' | 'high';
  showRoofs: boolean;
  colorMode: 'uniform' | 'height' | 'satellite';
}

export interface MeshOptions {
  hollow: boolean;
  thickness: number;
  baseHeight: number;
  maxSideLength: number;
}

export interface ExportOptions {
  format: 'glb' | 'obj' | 'stl' | 'fbx';
  includeTextures: boolean;
  scale: number;
}

export interface WorldConfig {
  id: string;
  name: string;
  area: WorldArea | null;
  terrain: TerrainOptions;
  buildings: BuildingOptions;
  mesh: MeshOptions;
  export: ExportOptions;
}

// ===== World Object Types =====

export type WorldObjectType = 'terrain' | 'building' | 'road' | 'vegetation' | 'water' | 'custom' | 'group' | 'mesh';

export interface WorldObject {
  id: string;
  name: string;
  type: WorldObjectType;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  locked: boolean;
  expanded?: boolean;  // For collapsible groups
  parentId?: string;   // For hierarchy
  children?: string[]; // Child object IDs
}

// ===== Tool Types =====

/** Terrain editing tools (Unity/Unreal style) */
export type TerrainTool = 'select' | 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'foliage' | 'erode';

/** Editor tools for object manipulation */
export type EditorTool = 'select' | 'move' | 'rotate' | 'scale' | 'place' | 'terrain' | 'road';

/** Road drawing modes (Cities: Skylines style) */
export type RoadMode = 'straight' | 'curved' | 'freeform';

// ===== Road Drawing State =====

export interface RoadDrawingState {
  isDrawing: boolean;
  mode: RoadMode;
  // For straight: start -> end
  // For curved: start -> control -> end (quadratic bezier)
  startPoint: { x: number; y: number; z: number } | null;
  controlPoint: { x: number; y: number; z: number } | null;
  endPoint: { x: number; y: number; z: number } | null;
  // Legacy waypoints for freeform mode
  waypoints: { x: number; y: number; z: number }[];
  previewMesh: Mesh | null;
  waypointMarkers: Mesh[];
  guideLines: Mesh[];
  directionArrows: Mesh[];
  width: number;
}

// ===== Sun Settings =====

export interface SunSettings {
  month: number;    // 1-12
  hour: number;     // 0-24
  intensity: number;
  azimuth: number;  // 0-360 degrees
}

// ===== Character Controller Types =====

export interface CharacterConfig {
  walkSpeed: number;
  runSpeed: number;
  rotationSpeed: number;
  jumpForce: number;
  gravity: number;
}

export interface CharacterRefs {
  character: AbstractMesh | null;
  characterRoot: AbstractMesh | null;
  idleAnimation: AnimationGroup | null;
  walkAnimation: AnimationGroup | null;
  runAnimation: AnimationGroup | null;
  characterGroundOffset: number;
  // Emote animations (1,2,3,4 keys)
  emote1: AnimationGroup | null;  // greeting
  emote2: AnimationGroup | null;  // dance1
  emote3: AnimationGroup | null;  // dance2
  emote4: AnimationGroup | null;  // greeting
  runningJumpAnim: AnimationGroup | null;
}

// ===== View Mode Types =====

export type ViewMode = 'third-person' | 'first-person' | 'iso';

// ===== Marquee Selection State =====

export interface MarqueeState {
  startX: number;
  startY: number;
  active: boolean;
  ctrlKey: boolean;
}

// ===== Road Dragging State =====

export interface RoadDraggingState {
  isDragging: boolean;
  startPoint: { x: number; y: number; z: number } | null;
  endPoint: { x: number; y: number; z: number } | null;
  startMarker: Mesh | null;
  previewMesh: Mesh | null;
  guideLines: Mesh[];
  directionArrows: Mesh[];
}

// ===== Logo Props =====

export interface ArchipleWorldLogoProps {
  color?: string;
  height?: number;
}

// ===== Default Values =====

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  id: `world_${Date.now()}`,
  name: 'New World',
  area: null,
  terrain: {
    enabled: true,
    verticalExaggeration: 1.0,
    resolution: 'medium',
    dataSource: 'mapzen',
  },
  buildings: {
    enabled: true,
    lod: 'medium',
    showRoofs: true,
    colorMode: 'height',
  },
  mesh: {
    hollow: false,
    thickness: 2.0,
    baseHeight: 5.0,
    maxSideLength: 200,
  },
  export: {
    format: 'glb',
    includeTextures: true,
    scale: 1.0,
  },
};

export const DEFAULT_ROAD_DRAWING_STATE: RoadDrawingState = {
  isDrawing: false,
  mode: 'straight',
  startPoint: null,
  controlPoint: null,
  endPoint: null,
  waypoints: [],
  previewMesh: null,
  waypointMarkers: [],
  guideLines: [],
  directionArrows: [],
  width: 6,
};

export const DEFAULT_SUN_SETTINGS: SunSettings = {
  month: 6,      // June
  hour: 14,      // 2 PM
  intensity: 1.5,
  azimuth: 180,  // South
};

export const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  walkSpeed: 0.08,    // Per frame speed
  runSpeed: 0.16,     // Per frame speed
  rotationSpeed: 0.15, // Rotation lerp factor
  jumpForce: 0.12,    // Initial jump velocity
  gravity: 0.008,     // Gravity per frame
};

// ===== Non-selectable mesh names =====

export const NON_SELECTABLE_MESHES = [
  'ground',
  'skybox',
  'xAxis',
  'yAxis',
  'zAxis',
  'infiniteGrid',
  'sunDisk'
];
