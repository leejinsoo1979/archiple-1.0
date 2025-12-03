/**
 * PlayerController - 진정한 FPS 플레이어 컨트롤러
 *
 * Unity/Unreal 스타일의 완전 몰입형 1인칭 컨트롤러
 * - Pointer Lock (마우스 잠금)
 * - WASD 이동
 * - 물리 기반 충돌
 * - 점프/달리기
 */

import {
  Scene,
  UniversalCamera,
  Vector3,
  KeyboardEventTypes,
  PointerEventTypes,
} from '@babylonjs/core';
import { PlayerConfig, DEFAULT_PLAYER_CONFIG, GameSpawnPoint } from './types';

export class PlayerController {
  private scene: Scene;
  private canvas: HTMLCanvasElement;
  private camera: UniversalCamera;
  private config: PlayerConfig;

  // 입력 상태
  private keys: { [key: string]: boolean } = {};
  private isPointerLocked: boolean = false;
  private isRunning: boolean = false;

  // 물리 상태
  private velocity: Vector3 = Vector3.Zero();
  private isGrounded: boolean = true;

  // 이벤트 핸들러 참조 (정리용)
  private keyboardObserver: any;
  private pointerObserver: any;
  private pointerLockChangeHandler: () => void;
  private pointerLockErrorHandler: () => void;

  constructor(
    scene: Scene,
    canvas: HTMLCanvasElement,
    spawnPoint: GameSpawnPoint,
    config: Partial<PlayerConfig> = {}
  ) {
    this.scene = scene;
    this.canvas = canvas;
    this.config = { ...DEFAULT_PLAYER_CONFIG, ...config };

    // FPS 카메라 생성
    this.camera = new UniversalCamera('playerCamera', spawnPoint.position, scene);
    this.camera.rotation.y = spawnPoint.rotation;

    this.setupCamera();
    this.setupInput();
    this.setupPointerLock();
    this.setupPhysics();

    console.log('[PlayerController] Initialized at', spawnPoint.position);
  }

  private setupCamera(): void {
    // FOV 설정 (도 → 라디안)
    this.camera.fov = (this.config.fov * Math.PI) / 180;

    // 클리핑 평면
    this.camera.minZ = 0.05; // 5cm
    this.camera.maxZ = 500; // 500m

    // 충돌 설정
    this.camera.checkCollisions = true;
    this.camera.applyGravity = true;
    this.camera.ellipsoid = new Vector3(
      this.config.radius,
      this.config.height / 2,
      this.config.radius
    );

    // 기본 Babylon 입력 비활성화 (우리가 직접 처리)
    this.camera.inputs.clear();

    // 씬의 활성 카메라로 설정
    this.scene.activeCamera = this.camera;
  }

  private setupInput(): void {
    // 키보드 입력
    this.keyboardObserver = this.scene.onKeyboardObservable.add((kbInfo) => {
      const key = kbInfo.event.key.toLowerCase();

      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        this.keys[key] = true;

        // Shift = 달리기
        if (key === 'shift') {
          this.isRunning = true;
        }

        // Space = 점프
        if (key === ' ' && this.isGrounded) {
          this.jump();
        }

        // ESC = Pointer Lock 해제
        if (key === 'escape') {
          this.releasePointerLock();
        }
      } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
        this.keys[key] = false;

        if (key === 'shift') {
          this.isRunning = false;
        }
      }
    });

    // 마우스 입력 (Pointer Lock 상태에서만)
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (!this.isPointerLocked) return;

      if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
        const event = pointerInfo.event as PointerEvent;

        // 마우스 이동으로 카메라 회전
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.camera.rotation.y += movementX * this.config.mouseSensitivity;
        this.camera.rotation.x += movementY * this.config.mouseSensitivity;

        // 수직 회전 제한 (-90도 ~ 90도)
        const maxPitch = Math.PI / 2 - 0.01;
        this.camera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.camera.rotation.x));
      }
    });
  }

  private setupPointerLock(): void {
    // 캔버스 클릭 시 Pointer Lock 요청
    this.canvas.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.requestPointerLock();
      }
    });

    // Pointer Lock 상태 변경 이벤트
    this.pointerLockChangeHandler = () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      console.log('[PlayerController] Pointer lock:', this.isPointerLocked);
    };

    this.pointerLockErrorHandler = () => {
      console.error('[PlayerController] Pointer lock error');
    };

    document.addEventListener('pointerlockchange', this.pointerLockChangeHandler);
    document.addEventListener('pointerlockerror', this.pointerLockErrorHandler);
  }

  private setupPhysics(): void {
    // 매 프레임마다 물리 업데이트
    this.scene.registerBeforeRender(() => {
      this.update();
    });
  }

  private update(): void {
    const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;

    // 이동 처리
    this.processMovement(deltaTime);

    // 중력 처리
    this.processGravity(deltaTime);
  }

  private processMovement(deltaTime: number): void {
    const speed = this.isRunning ? this.config.runSpeed : this.config.walkSpeed;

    // 이동 방향 계산
    let moveX = 0;
    let moveZ = 0;

    if (this.keys['w']) moveZ = 1;
    if (this.keys['s']) moveZ = -1;
    if (this.keys['a']) moveX = -1;
    if (this.keys['d']) moveX = 1;

    if (moveX === 0 && moveZ === 0) return;

    // 방향 정규화
    const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
    moveX /= length;
    moveZ /= length;

    // 카메라 방향 기준으로 변환
    const forward = this.camera.getDirection(Vector3.Forward());
    const right = this.camera.getDirection(Vector3.Right());

    // Y축 이동 무시 (수평 이동만)
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    // 최종 이동 벡터
    const movement = forward.scale(moveZ).add(right.scale(moveX));
    movement.normalize();
    movement.scaleInPlace(speed * deltaTime);

    // 카메라 이동 (충돌 감지 포함)
    this.camera.position.addInPlace(movement);
  }

  private processGravity(deltaTime: number): void {
    // 간단한 중력 처리
    // TODO: 더 정교한 물리 시스템 구현

    // 바닥 감지 (카메라 높이가 설정값보다 낮으면 바닥에 있음)
    if (this.camera.position.y <= this.config.height) {
      this.camera.position.y = this.config.height;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
      this.velocity.y -= 9.81 * deltaTime;
      this.camera.position.y += this.velocity.y * deltaTime;
    }
  }

  private jump(): void {
    if (!this.isGrounded) return;

    // 점프 초기 속도 계산 (v = sqrt(2 * g * h))
    const jumpVelocity = Math.sqrt(2 * 9.81 * this.config.jumpHeight);
    this.velocity.y = jumpVelocity;
    this.isGrounded = false;

    console.log('[PlayerController] Jump!');
  }

  /**
   * Pointer Lock 요청
   */
  requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  /**
   * Pointer Lock 해제
   */
  releasePointerLock(): void {
    document.exitPointerLock();
  }

  /**
   * Pointer Lock 상태
   */
  isLocked(): boolean {
    return this.isPointerLocked;
  }

  /**
   * 카메라 반환
   */
  getCamera(): UniversalCamera {
    return this.camera;
  }

  /**
   * 플레이어 위치 반환
   */
  getPosition(): Vector3 {
    return this.camera.position.clone();
  }

  /**
   * 플레이어 텔레포트
   */
  teleport(position: Vector3, rotation?: number): void {
    this.camera.position = position;
    if (rotation !== undefined) {
      this.camera.rotation.y = rotation;
    }
    this.velocity = Vector3.Zero();
    console.log('[PlayerController] Teleported to', position);
  }

  /**
   * 정리
   */
  dispose(): void {
    console.log('[PlayerController] Disposing');

    // 이벤트 리스너 제거
    this.scene.onKeyboardObservable.remove(this.keyboardObserver);
    this.scene.onPointerObservable.remove(this.pointerObserver);
    document.removeEventListener('pointerlockchange', this.pointerLockChangeHandler);
    document.removeEventListener('pointerlockerror', this.pointerLockErrorHandler);

    // Pointer Lock 해제
    if (this.isPointerLocked) {
      this.releasePointerLock();
    }

    // 카메라 정리
    this.camera.dispose();
  }
}
