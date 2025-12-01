/**
 * Engine Event Bus - Pub/Sub system for decoupled communication
 * TODO: Add full implementation later
 */

import { IEngineEvent } from './EngineEvent';

export type EventHandler<T = unknown> = (event: IEngineEvent & { data?: T }) => void;

export interface IEventBus {
  /** Subscribe to an event type */
  on<T = unknown>(eventType: string, handler: EventHandler<T>): () => void;

  /** Subscribe to an event type (fires only once) */
  once<T = unknown>(eventType: string, handler: EventHandler<T>): () => void;

  /** Unsubscribe from an event type */
  off(eventType: string, handler: EventHandler): void;

  /** Emit an event */
  emit(event: IEngineEvent): void;

  /** Clear all subscriptions */
  clear(): void;
}

/**
 * Simple event bus implementation
 */
export class EngineEventBus implements IEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  /**
   * Subscribe to an event type
   * @returns Unsubscribe function
   */
  on<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    // TODO: Implement
    // 1. Add handler to handlers map
    // 2. Return unsubscribe function
    return () => {};
  }

  /**
   * Subscribe to an event type (fires only once)
   */
  once<T = unknown>(eventType: string, handler: EventHandler<T>): () => void {
    // TODO: Implement
    // 1. Wrap handler to auto-unsubscribe after first call
    // 2. Use on() internally
    return () => {};
  }

  /**
   * Unsubscribe from an event type
   */
  off(eventType: string, handler: EventHandler): void {
    // TODO: Implement
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: IEngineEvent): void {
    // TODO: Implement
    // 1. Get handlers for event type
    // 2. Call each handler with event
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.handlers.clear();
  }

  /**
   * Get number of handlers for an event type
   */
  listenerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size ?? 0;
  }
}

// Singleton instance for global event bus
export const globalEventBus = new EngineEventBus();
