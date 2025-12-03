/**
 * GameRuntime - 게임 런타임 코어
 *
 * Unity/Unreal의 Play 모드처럼 작동하는 게임 런타임 시스템
 * - 빌드 프로세스 관리
 * - 게임 상태 관리
 * - 씬 및 플레이어 오케스트레이션
 */

import { Engine, Scene } from '@babylonjs/core';
import {
  GameState,
  GameData,
  BuildProgress,
  GameEvent,
  PlayerConfig,
} from './types';
import { GameBuilder } from './GameBuilder';
import { GameScene } from './GameScene';
import { PlayerController } from './PlayerController';

export type GameEventCallback = (event: GameEvent) => void;
export type BuildProgressCallback = (progress: BuildProgress) => void;
export type StateChangeCallback = (state: GameState) => void;

export class GameRuntime {
  private engine: Engine;
  private canvas: HTMLCanvasElement;

  // 상태
  private state: GameState = 'idle';
  private gameData: GameData | null = null;
  private gameScene: GameScene | null = null;
  private playerController: PlayerController | null = null;

  // 원본 에디터 씬 (복원용)
  private editorScene: Scene | null = null;

  // 콜백
  private onStateChange?: StateChangeCallback;
  private onBuildProgress?: BuildProgressCallback;
  private onGameEvent?: GameEventCallback;

  // 렌더 루프
  private renderLoopId: number | null = null;

  constructor(
    engine: Engine,
    canvas: HTMLCanvasElement,
    options: {
      onStateChange?: StateChangeCallback;
      onBuildProgress?: BuildProgressCallback;
      onGameEvent?: GameEventCallback;
    } = {}
  ) {
    this.engine = engine;
    this.canvas = canvas;
    this.onStateChange = options.onStateChange;
    this.onBuildProgress = options.onBuildProgress;
    this.onGameEvent = options.onGameEvent;

    console.log('[GameRuntime] Initialized');
  }

  /**
   * 현재 상태 반환
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * 게임 빌드 및 시작
   * Unity의 Play 버튼과 같은 역할
   */
  async play(floorplanData: any, editorScene: Scene): Promise<void> {
    if (this.state !== 'idle') {
      console.warn('[GameRuntime] Cannot play: state is', this.state);
      return;
    }

    try {
      // 에디터 씬 저장
      this.editorScene = editorScene;

      // 1. 빌드 시작
      this.setState('building');
      this.emitEvent('build_start');

      const builder = new GameBuilder((progress) => {
        this.onBuildProgress?.(progress);
        this.emitEvent('build_progress', progress);
      });

      this.gameData = await builder.build(floorplanData);
      this.emitEvent('build_complete', this.gameData.metadata);

      // 2. 게임 씬 생성
      this.gameScene = new GameScene(this.engine, this.gameData);

      // 3. 플레이어 컨트롤러 생성
      this.playerController = new PlayerController(
        this.gameScene.getScene(),
        this.canvas,
        this.gameData.spawnPoint
      );

      // 4. 렌더 루프 시작
      this.startRenderLoop();

      // 5. 게임 시작
      this.setState('playing');
      this.emitEvent('game_start');

      // 자동으로 Pointer Lock 요청 (클릭 후)
      console.log('[GameRuntime] Game started - click to capture mouse');

    } catch (error) {
      console.error('[GameRuntime] Play failed:', error);
      this.emitEvent('build_error', error);
      this.setState('idle');
      throw error;
    }
  }

  /**
   * 게임 일시정지
   */
  pause(): void {
    if (this.state !== 'playing') return;

    this.setState('paused');
    this.emitEvent('game_pause');

    // Pointer Lock 해제
    this.playerController?.releasePointerLock();

    console.log('[GameRuntime] Game paused');
  }

  /**
   * 게임 재개
   */
  resume(): void {
    if (this.state !== 'paused') return;

    this.setState('playing');
    this.emitEvent('game_resume');

    console.log('[GameRuntime] Game resumed');
  }

  /**
   * 게임 중지 및 에디터로 복귀
   * Unity의 Stop 버튼과 같은 역할
   */
  stop(): void {
    if (this.state === 'idle') return;

    console.log('[GameRuntime] Stopping game...');

    // 렌더 루프 중지
    this.stopRenderLoop();

    // Pointer Lock 해제
    this.playerController?.releasePointerLock();

    // 플레이어 컨트롤러 정리
    this.playerController?.dispose();
    this.playerController = null;

    // 게임 씬 정리
    this.gameScene?.dispose();
    this.gameScene = null;

    // 게임 데이터 정리
    this.gameData = null;

    // 에디터 씬 복원
    if (this.editorScene) {
      this.engine.scenes.length = 0;
      this.engine.scenes.push(this.editorScene);
      this.editorScene = null;
    }

    this.setState('idle');
    this.emitEvent('game_stop');

    console.log('[GameRuntime] Game stopped, returned to editor');
  }

  /**
   * Pointer Lock 수동 요청
   */
  requestPointerLock(): void {
    this.playerController?.requestPointerLock();
  }

  /**
   * Pointer Lock 상태
   */
  isPointerLocked(): boolean {
    return this.playerController?.isLocked() ?? false;
  }

  private startRenderLoop(): void {
    if (this.renderLoopId !== null) return;

    const gameScene = this.gameScene?.getScene();
    if (!gameScene) return;

    this.engine.runRenderLoop(() => {
      if (this.state === 'playing' || this.state === 'paused') {
        gameScene.render();
      }
    });

    console.log('[GameRuntime] Render loop started');
  }

  private stopRenderLoop(): void {
    this.engine.stopRenderLoop();
    console.log('[GameRuntime] Render loop stopped');
  }

  private setState(newState: GameState): void {
    const oldState = this.state;
    this.state = newState;
    console.log(`[GameRuntime] State: ${oldState} → ${newState}`);
    this.onStateChange?.(newState);
  }

  private emitEvent(type: GameEvent['type'], data?: any): void {
    const event: GameEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.onGameEvent?.(event);
  }

  /**
   * 정리
   */
  dispose(): void {
    this.stop();
    console.log('[GameRuntime] Disposed');
  }
}
