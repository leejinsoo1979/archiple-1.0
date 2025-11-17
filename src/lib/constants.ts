/**
 * Global constants for Archiple editor
 */

// Grid settings
export const GRID_SIZE = 20;
export const GRID_COLOR = '#e0e0e0';
export const GRID_MAJOR_COLOR = '#c0c0c0';
export const GRID_MAJOR_INTERVAL = 5;

// Snap settings
export const SNAP_THRESHOLD = 10;
export const SNAP_ANGLE_STEP = 45;
export const SNAP_AXIS_THRESHOLD = 10;

// Wall settings
export const DEFAULT_WALL_THICKNESS = 20;
export const DEFAULT_WALL_HEIGHT = 280;
export const MIN_WALL_LENGTH = 10;
export const MAX_WALL_LENGTH = 10000;

// Point settings
export const POINT_RADIUS = 4;
export const POINT_HOVER_RADIUS = 6;
export const POINT_SELECT_RADIUS = 8;
export const MIN_POINT_DISTANCE = 5;

// Selection settings
export const SELECTION_COLOR = '#0066ff';
export const HOVER_COLOR = '#00aaff';
export const SELECTION_LINE_WIDTH = 2;

// Canvas settings
export const DEFAULT_CANVAS_WIDTH = 1000;
export const DEFAULT_CANVAS_HEIGHT = 800;
export const CANVAS_BACKGROUND = '#ffffff';

// Rendering settings
export const DEFAULT_LINE_WIDTH = 2;
export const DEFAULT_FONT = '12px Arial';
export const DEFAULT_TEXT_COLOR = '#333333';

// Z-index layers
export const Z_INDEX = {
  GRID: 0,
  ROOM_FILL: 1,
  WALLS: 2,
  POINTS: 3,
  SELECTION: 4,
  HOVER: 5,
  LABELS: 6,
  UI: 10,
} as const;

// Colors
export const COLORS = {
  WALL: '#333333',
  WALL_FILL: '#f0f0f0',
  POINT: '#0066ff',
  POINT_HOVER: '#00aaff',
  POINT_SELECTED: '#ff6600',
  ROOM: '#e0f0ff',
  ROOM_STROKE: '#0066ff',
  GRID: '#e0e0e0',
  GRID_MAJOR: '#c0c0c0',
  BACKGROUND: '#ffffff',
  TEXT: '#333333',
} as const;

// Room detection
export const MIN_ROOM_AREA = 100;
export const MAX_ROOM_AREA = 1000000;
export const ROOM_DETECTION_TOLERANCE = 1;

// 3D conversion
export const SCALE_2D_TO_3D = 0.01; // 1 pixel = 1cm (10mm) in 3D
export const DEFAULT_FLOOR_THICKNESS = 10;
export const DEFAULT_CEILING_HEIGHT = 280;

// Performance
export const RENDER_THROTTLE_MS = 16; // 60fps
export const HISTORY_MAX_SIZE = 100;

// File export
export const EXPORT_FORMATS = ['json', 'svg', 'png'] as const;
export const DEFAULT_EXPORT_FORMAT = 'json';
