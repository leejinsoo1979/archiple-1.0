/**
 * Game Runtime - Public API
 */

export { GameRuntime } from './GameRuntime';
export { GameBuilder } from './GameBuilder';
export { GameScene } from './GameScene';
export { PlayerController } from './PlayerController';
export { CharacterController } from './CharacterController';
export { GameUI } from './GameUI';
export { useGameRuntime } from './useGameRuntime';

export type {
  GameState,
  GameData,
  GameEvent,
  BuildProgress,
  PlayerConfig,
  GameSpawnPoint,
} from './types';

export type { AnimationState, CharacterConfig } from './CharacterController';

export { DEFAULT_PLAYER_CONFIG } from './types';
