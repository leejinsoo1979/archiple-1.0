/**
 * CharacterController - 3인칭 캐릭터 컨트롤러
 *
 * 게임 스타일의 3인칭 캐릭터 컨트롤
 * - 캐릭터 모델 로딩 및 애니메이션
 * - WASD 이동 + 마우스 회전
 * - 걷기/달리기/점프 애니메이션 전환
 * - 3인칭 카메라 팔로우
 */

import {
  Scene,
  Vector3,
  Mesh,
  MeshBuilder,
  AbstractMesh,
  AnimationGroup,
  SceneLoader,
  FollowCamera,
  KeyboardEventTypes,
  ArcRotateCamera,
  Skeleton,
  TransformNode,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

// 애니메이션 상태
export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'dance1' | 'dance2';

// 캐릭터 설정
export interface CharacterConfig {
  walkSpeed: number;
  runSpeed: number;
  rotationSpeed: number;
  jumpForce: number;
  gravity: number;
  height: number;
}

const DEFAULT_CHARACTER_CONFIG: CharacterConfig = {
  walkSpeed: 2.0,      // m/s
  runSpeed: 5.0,       // m/s
  rotationSpeed: 5.0,  // rad/s
  jumpForce: 5.0,      // m/s
  gravity: 15.0,       // m/s²
  height: 1.8,         // m
};

// 애니메이션 파일 경로
const ANIMATION_PATHS = {
  idle: '/animation/Neutral_Idle.glb',
  walk: '/animation/Walking.glb',
  run: '/animation/Running.glb',
  jump: '/animation/Jumping.glb',
  dance1: '/animation/Hip_Hop_Dancing.glb',
  dance2: '/animation/Tut_Hip_Hop_Dance.glb',
};

export class CharacterController {
  private scene: Scene;
  private config: CharacterConfig;

  // 캐릭터 메시
  private rootNode: TransformNode;
  private characterMesh: AbstractMesh | null = null;
  private skeleton: Skeleton | null = null;

  // 애니메이션
  private animations: Map<AnimationState, AnimationGroup> = new Map();
  private currentAnimation: AnimationState = 'idle';
  private isAnimationLoaded: boolean = false;

  // 물리 상태
  private velocity: Vector3 = Vector3.Zero();
  private isGrounded: boolean = true;
  private verticalVelocity: number = 0;

  // 입력 상태
  private keys: { [key: string]: boolean } = {};
  private isRunning: boolean = false;

  // 카메라
  private camera: FollowCamera | null = null;
  private cameraTarget: TransformNode;

  // 이벤트 핸들러
  private keyboardObserver: any;

  constructor(
    scene: Scene,
    spawnPosition: Vector3,
    config: Partial<CharacterConfig> = {}
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_CHARACTER_CONFIG, ...config };

    // 루트 노드 생성
    this.rootNode = new TransformNode('characterRoot', scene);
    this.rootNode.position = spawnPosition;

    // 카메라 타겟 (캐릭터 머리 위치)
    this.cameraTarget = new TransformNode('cameraTarget', scene);
    this.cameraTarget.parent = this.rootNode;
    this.cameraTarget.position = new Vector3(0, this.config.height * 0.8, 0);

    this.setupInput();
    this.setupPhysics();

    console.log('[CharacterController] Created at', spawnPosition);
  }

  /**
   * 캐릭터 모델과 애니메이션 로드
   */
  async load(): Promise<void> {
    console.log('[CharacterController] Loading character and animations...');

    try {
      // 기본 캐릭터 로드 (Idle 애니메이션에서)
      const result = await SceneLoader.ImportMeshAsync(
        '',
        '',
        ANIMATION_PATHS.idle,
        this.scene
      );

      // 메시 설정
      const meshes = result.meshes;
      if (meshes.length > 0) {
        // 루트 메시를 캐릭터 루트에 연결
        const rootMesh = meshes[0];
        rootMesh.parent = this.rootNode;
        rootMesh.position = Vector3.Zero();
        rootMesh.scaling = new Vector3(1, 1, 1);

        // 모든 메시에 그림자 설정
        for (const mesh of meshes) {
          mesh.receiveShadows = true;
          if (mesh instanceof Mesh) {
            this.characterMesh = mesh;
          }
        }
      }

      // 스켈레톤 저장
      if (result.skeletons.length > 0) {
        this.skeleton = result.skeletons[0];
      }

      // Idle 애니메이션 저장
      if (result.animationGroups.length > 0) {
        const idleAnim = result.animationGroups[0];
        idleAnim.name = 'idle';
        this.animations.set('idle', idleAnim);
        idleAnim.start(true); // 루프
      }

      // 다른 애니메이션 로드
      await this.loadAnimation('walk', ANIMATION_PATHS.walk);
      await this.loadAnimation('run', ANIMATION_PATHS.run);
      await this.loadAnimation('jump', ANIMATION_PATHS.jump);
      await this.loadAnimation('dance1', ANIMATION_PATHS.dance1);
      await this.loadAnimation('dance2', ANIMATION_PATHS.dance2);

      this.isAnimationLoaded = true;
      console.log('[CharacterController] All animations loaded');

    } catch (error) {
      console.error('[CharacterController] Failed to load character:', error);
      // 폴백: 간단한 박스 캐릭터 생성
      this.createFallbackCharacter();
    }
  }

  /**
   * 개별 애니메이션 로드
   */
  private async loadAnimation(name: AnimationState, path: string): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync('', '', path, this.scene);

      if (result.animationGroups.length > 0) {
        const anim = result.animationGroups[0];
        anim.name = name;

        // 기존 스켈레톤에 애니메이션 리타겟팅
        if (this.skeleton) {
          // 애니메이션 그룹을 현재 스켈레톤에 연결
          anim.stop();
          this.animations.set(name, anim);
        }

        // 임시 메시 제거 (애니메이션만 필요)
        for (const mesh of result.meshes) {
          mesh.dispose();
        }
      }

      console.log(`[CharacterController] Loaded animation: ${name}`);
    } catch (error) {
      console.warn(`[CharacterController] Failed to load animation ${name}:`, error);
    }
  }

  /**
   * 폴백 캐릭터 (모델 로드 실패 시)
   */
  private createFallbackCharacter(): void {
    console.log('[CharacterController] Creating fallback character');

    // 간단한 캡슐 형태
    const body = MeshBuilder.CreateCapsule('characterBody', {
      height: this.config.height,
      radius: 0.3,
    }, this.scene);
    body.parent = this.rootNode;
    body.position.y = this.config.height / 2;

    this.characterMesh = body;
  }

  /**
   * 입력 설정
   */
  private setupInput(): void {
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

        // 1, 2 = 댄스
        if (key === '1') {
          this.playAnimation('dance1');
        }
        if (key === '2') {
          this.playAnimation('dance2');
        }
      } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
        this.keys[key] = false;

        if (key === 'shift') {
          this.isRunning = false;
        }
      }
    });
  }

  /**
   * 물리 업데이트 설정
   */
  private setupPhysics(): void {
    this.scene.registerBeforeRender(() => {
      this.update();
    });
  }

  /**
   * 매 프레임 업데이트
   */
  private update(): void {
    const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;

    // 이동 처리
    this.processMovement(deltaTime);

    // 중력 처리
    this.processGravity(deltaTime);

    // 애니메이션 상태 업데이트
    this.updateAnimationState();
  }

  /**
   * 이동 처리
   */
  private processMovement(deltaTime: number): void {
    // 입력 방향 계산
    let inputX = 0;
    let inputZ = 0;

    if (this.keys['w']) inputZ = 1;
    if (this.keys['s']) inputZ = -1;
    if (this.keys['a']) inputX = -1;
    if (this.keys['d']) inputX = 1;

    const hasInput = inputX !== 0 || inputZ !== 0;

    if (!hasInput) {
      this.velocity = Vector3.Zero();
      return;
    }

    // 입력 정규화
    const inputLength = Math.sqrt(inputX * inputX + inputZ * inputZ);
    inputX /= inputLength;
    inputZ /= inputLength;

    // 속도 결정
    const speed = this.isRunning ? this.config.runSpeed : this.config.walkSpeed;

    // 카메라 방향 기준 이동 (카메라가 있는 경우)
    let forward = new Vector3(0, 0, 1);
    let right = new Vector3(1, 0, 0);

    if (this.camera) {
      // 카메라의 회전에서 전진 방향 계산
      const cameraRotation = this.camera.rotation.y;
      forward = new Vector3(Math.sin(cameraRotation), 0, Math.cos(cameraRotation));
      right = new Vector3(forward.z, 0, -forward.x);
    }

    // 이동 방향
    const moveDirection = forward.scale(inputZ).add(right.scale(inputX));
    moveDirection.normalize();

    // 캐릭터 회전 (이동 방향을 바라보게)
    if (moveDirection.length() > 0.1) {
      const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
      let currentRotation = this.rootNode.rotation.y;

      // 부드러운 회전
      let diff = targetRotation - currentRotation;
      // -PI ~ PI 범위로 정규화
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      this.rootNode.rotation.y += diff * this.config.rotationSpeed * deltaTime;
    }

    // 이동 적용
    this.velocity = moveDirection.scale(speed);
    this.rootNode.position.addInPlace(this.velocity.scale(deltaTime));
  }

  /**
   * 중력 처리
   */
  private processGravity(deltaTime: number): void {
    // 중력 적용
    this.verticalVelocity -= this.config.gravity * deltaTime;

    // 위치 업데이트
    this.rootNode.position.y += this.verticalVelocity * deltaTime;

    // 바닥 충돌 (간단한 y=0 바닥)
    if (this.rootNode.position.y <= 0) {
      this.rootNode.position.y = 0;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
  }

  /**
   * 점프
   */
  private jump(): void {
    if (!this.isGrounded) return;

    this.verticalVelocity = this.config.jumpForce;
    this.isGrounded = false;
    this.playAnimation('jump');

    console.log('[CharacterController] Jump!');
  }

  /**
   * 애니메이션 상태 업데이트
   */
  private updateAnimationState(): void {
    if (!this.isAnimationLoaded) return;

    // 현재 움직이고 있는지 확인
    const isMoving = this.velocity.length() > 0.1;

    // 점프 중이면 점프 애니메이션 유지
    if (!this.isGrounded) {
      // 점프 애니메이션은 jump() 에서 이미 시작됨
      return;
    }

    // 상태에 따른 애니메이션 선택
    let targetState: AnimationState = 'idle';

    if (isMoving) {
      targetState = this.isRunning ? 'run' : 'walk';
    }

    // 댄스 중이면 유지 (1, 2 키로 시작됨)
    if (this.currentAnimation === 'dance1' || this.currentAnimation === 'dance2') {
      const currentAnim = this.animations.get(this.currentAnimation);
      if (currentAnim && currentAnim.isPlaying) {
        return; // 댄스 계속
      }
    }

    // 애니메이션 전환
    if (targetState !== this.currentAnimation) {
      this.playAnimation(targetState);
    }
  }

  /**
   * 애니메이션 재생
   */
  private playAnimation(state: AnimationState): void {
    if (!this.isAnimationLoaded) return;

    const anim = this.animations.get(state);
    if (!anim) return;

    // 현재 애니메이션 중지
    const currentAnim = this.animations.get(this.currentAnimation);
    if (currentAnim) {
      currentAnim.stop();
    }

    // 새 애니메이션 시작
    const loop = state !== 'jump'; // 점프는 루프 안함
    anim.start(loop);

    this.currentAnimation = state;
    console.log(`[CharacterController] Playing animation: ${state}`);
  }

  /**
   * 3인칭 카메라 설정
   */
  setupCamera(): FollowCamera {
    this.camera = new FollowCamera(
      'characterCamera',
      new Vector3(0, 5, -10),
      this.scene
    );

    this.camera.lockedTarget = this.cameraTarget;
    this.camera.radius = 5;           // 캐릭터와의 거리
    this.camera.heightOffset = 2;     // 높이 오프셋
    this.camera.rotationOffset = 180; // 뒤에서 바라보기
    this.camera.cameraAcceleration = 0.05;
    this.camera.maxCameraSpeed = 10;

    // 씬의 활성 카메라로 설정
    this.scene.activeCamera = this.camera;

    console.log('[CharacterController] Camera setup complete');
    return this.camera;
  }

  /**
   * 위치 반환
   */
  getPosition(): Vector3 {
    return this.rootNode.position.clone();
  }

  /**
   * 텔레포트
   */
  teleport(position: Vector3): void {
    this.rootNode.position = position;
    this.verticalVelocity = 0;
    console.log('[CharacterController] Teleported to', position);
  }

  /**
   * 정리
   */
  dispose(): void {
    console.log('[CharacterController] Disposing');

    // 이벤트 제거
    this.scene.onKeyboardObservable.remove(this.keyboardObserver);

    // 애니메이션 정지
    for (const anim of this.animations.values()) {
      anim.stop();
      anim.dispose();
    }

    // 메시 정리
    this.rootNode.dispose();
    this.camera?.dispose();
  }
}
