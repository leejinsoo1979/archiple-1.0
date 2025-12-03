/**
 * Game Runtime Type Definitions
 *
 * Unity/Unreal 스타일의 게임 런타임을 위한 타입 정의
 */

import { Vector3 } from '@babylonjs/core';

// 게임 상태
export type GameState = 'idle' | 'building' | 'ready' | 'playing' | 'paused';

// 빌드된 게임 데이터 (에디터 데이터와 분리)
export interface GameData {
  // 기하학 데이터
  floors: GameFloor[];
  walls: GameWall[];
  ceilings: GameCeiling[];

  // 오브젝트
  furniture: GameFurniture[];
  doors: GameDoor[];
  windows: GameWindow[];

  // 조명
  lights: GameLight[];

  // 플레이어 스폰 포인트
  spawnPoint: GameSpawnPoint;

  // 메타데이터
  metadata: GameMetadata;
}

export interface GameFloor {
  id: string;
  vertices: Vector3[];
  materialId: string;
  collisionEnabled: boolean;
}

export interface GameWall {
  id: string;
  start: Vector3;
  end: Vector3;
  height: number;
  thickness: number;
  materialId: string;
  hasCollision: boolean;
  // 문/창문 개구부
  openings: WallOpening[];
}

export interface WallOpening {
  type: 'door' | 'window';
  position: number; // 벽 시작점으로부터의 거리 (0-1)
  width: number;
  height: number;
  elevation: number; // 바닥으로부터의 높이
}

export interface GameCeiling {
  id: string;
  vertices: Vector3[];
  height: number;
  materialId: string;
}

export interface GameFurniture {
  id: string;
  modelUrl: string;
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  hasCollision: boolean;
  isInteractable: boolean;
  interactionType?: 'pickup' | 'use' | 'sit' | 'toggle';
}

export interface GameDoor {
  id: string;
  position: Vector3;
  rotation: number;
  width: number;
  height: number;
  isOpen: boolean;
  isLocked: boolean;
  opensInward: boolean;
}

export interface GameWindow {
  id: string;
  position: Vector3;
  rotation: number;
  width: number;
  height: number;
  isOpenable: boolean;
  isOpen: boolean;
}

export interface GameLight {
  id: string;
  type: 'point' | 'spot' | 'directional' | 'area';
  position: Vector3;
  direction?: Vector3;
  color: { r: number; g: number; b: number };
  intensity: number;
  range?: number;
  castShadows: boolean;
}

export interface GameSpawnPoint {
  position: Vector3;
  rotation: number; // Y축 회전 (라디안)
}

export interface GameMetadata {
  name: string;
  version: string;
  buildTime: number;
  totalMeshes: number;
  totalLights: number;
}

// 플레이어 설정
export interface PlayerConfig {
  height: number;        // 플레이어 눈높이 (미터)
  radius: number;        // 충돌 반경
  walkSpeed: number;     // 걷기 속도 (m/s)
  runSpeed: number;      // 달리기 속도 (m/s)
  jumpHeight: number;    // 점프 높이 (미터)
  mouseSensitivity: number;
  fov: number;           // 시야각 (도)
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  height: 1.7,
  radius: 0.3,
  walkSpeed: 3.0,
  runSpeed: 6.0,
  jumpHeight: 0.5,
  mouseSensitivity: 0.002,
  fov: 75,
};

// 게임 이벤트
export type GameEventType =
  | 'build_start'
  | 'build_progress'
  | 'build_complete'
  | 'build_error'
  | 'game_start'
  | 'game_pause'
  | 'game_resume'
  | 'game_stop'
  | 'player_interact'
  | 'door_open'
  | 'door_close'
  | 'light_toggle';

export interface GameEvent {
  type: GameEventType;
  data?: any;
  timestamp: number;
}

// 빌드 진행 상황
export interface BuildProgress {
  stage: 'parsing' | 'geometry' | 'materials' | 'lighting' | 'physics' | 'finalizing';
  percent: number;
  message: string;
}
