/**
 * FloorEvents - Event type definitions for floorplan operations
 */

export const FloorEvents = {
  // Point events
  POINT_ADDED: 'floor:point:added',
  POINT_MOVED: 'floor:point:moved',
  POINT_REMOVED: 'floor:point:removed',
  POINT_SNAPPED: 'floor:point:snapped',

  // Wall events
  WALL_ADDED: 'floor:wall:added',
  WALL_MODIFIED: 'floor:wall:modified',
  WALL_REMOVED: 'floor:wall:removed',
  WALL_SPLIT: 'floor:wall:split',
  WALL_PREVIEW_UPDATED: 'floor:wall:preview:updated',
  WALL_PREVIEW_CLEARED: 'floor:wall:preview:cleared',

  // Snap events
  SNAP_POINT_UPDATED: 'floor:snap:point:updated',
  ANGLE_GUIDE_UPDATED: 'floor:snap:angle:updated',
  GRID_SNAP_UPDATED: 'floor:snap:grid:updated',

  // Room events
  ROOM_DETECTED: 'floor:room:detected',
  ROOM_CREATED: 'floor:room:created',
  ROOM_MODIFIED: 'floor:room:modified',
  ROOM_REMOVED: 'floor:room:removed',
  POTENTIAL_ROOM_DETECTED: 'floor:room:potential',

  // Intersection events
  INTERSECTION_DETECTED: 'floor:intersection:detected',
  INTERSECTION_RESOLVED: 'floor:intersection:resolved',

  // Data events
  FLOORPLAN_LOADED: 'floor:loaded',
  FLOORPLAN_CLEARED: 'floor:cleared',
  FLOORPLAN_EXPORTED: 'floor:exported',
} as const;

export type FloorEventType = typeof FloorEvents[keyof typeof FloorEvents];
