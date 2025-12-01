/**
 * Engine Event - Base event type for the event bus
 * TODO: Add full implementation later
 */

export interface IEngineEvent {
  /** Event type identifier */
  readonly type: string;

  /** Timestamp when event was created */
  readonly timestamp: number;

  /** Optional: Source that emitted the event */
  readonly source?: string;

  /** Event data payload */
  readonly data?: unknown;
}

/**
 * Base class for engine events
 */
export class EngineEvent implements IEngineEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly source?: string;
  readonly data?: unknown;

  constructor(type: string, data?: unknown, source?: string) {
    this.type = type;
    this.timestamp = Date.now();
    this.data = data;
    this.source = source;
  }
}

/**
 * Common event types - extend as needed
 */
export const EventTypes = {
  // Selection events
  SELECTION_CHANGED: 'selection:changed',
  SELECTION_CLEARED: 'selection:cleared',

  // Tool events
  TOOL_ACTIVATED: 'tool:activated',
  TOOL_DEACTIVATED: 'tool:deactivated',

  // Entity events
  ENTITY_CREATED: 'entity:created',
  ENTITY_MODIFIED: 'entity:modified',
  ENTITY_DELETED: 'entity:deleted',

  // Scene events
  SCENE_CHANGED: 'scene:changed',
  SCENE_RENDERED: 'scene:rendered',

  // Command events
  COMMAND_EXECUTED: 'command:executed',
  COMMAND_UNDONE: 'command:undone',
  COMMAND_REDONE: 'command:redone',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];
