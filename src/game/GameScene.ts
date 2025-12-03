/**
 * GameScene - 최적화된 게임 전용 씬
 *
 * 에디터 씬과 완전히 분리된 게임 런타임 씬
 * - 에디터 UI/헬퍼 없음
 * - 최적화된 렌더링
 * - 충돌 메시 설정
 */

import {
  Engine,
  Scene,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  ShadowGenerator,
  PolygonMeshBuilder,
  Mesh,
  VertexData,
  AbstractMesh,
} from '@babylonjs/core';
import earcut from 'earcut';
import { GameData, GameFloor, GameWall, GameCeiling, GameLight } from './types';

// Make earcut available for polygon operations
(PolygonMeshBuilder as any).earcut = earcut;

export class GameScene {
  private engine: Engine;
  private scene: Scene;
  private gameData: GameData;
  private shadowGenerator?: ShadowGenerator;

  // 생성된 메시 추적
  private floorMeshes: Mesh[] = [];
  private wallMeshes: Mesh[] = [];
  private ceilingMeshes: Mesh[] = [];
  private furnitureMeshes: AbstractMesh[] = [];

  constructor(engine: Engine, gameData: GameData) {
    this.engine = engine;
    this.gameData = gameData;

    // 새로운 씬 생성 (에디터 씬과 완전 분리)
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.1, 0.1, 0.12, 1);

    // 충돌 감지 활성화
    this.scene.collisionsEnabled = true;
    this.scene.gravity = new Vector3(0, -9.81, 0);

    this.buildScene();
  }

  getScene(): Scene {
    return this.scene;
  }

  private buildScene(): void {
    console.log('[GameScene] Building game scene...');

    // 1. 조명 설정
    this.setupLighting();

    // 2. 바닥 생성
    this.createFloors();

    // 3. 벽 생성
    this.createWalls();

    // 4. 천장 생성
    this.createCeilings();

    // 5. 가구 로드 (비동기)
    this.loadFurniture();

    console.log('[GameScene] Scene build complete');
  }

  private setupLighting(): void {
    // 기본 환경광
    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 0.4;
    hemiLight.diffuse = new Color3(1, 1, 1);
    hemiLight.groundColor = new Color3(0.5, 0.5, 0.52);

    // 메인 태양광 (그림자용)
    const sunLight = new DirectionalLight('sunLight', new Vector3(-0.5, -1, -0.5), this.scene);
    sunLight.intensity = 0.8;
    sunLight.position = new Vector3(10, 20, 10);

    // 그림자 생성기
    this.shadowGenerator = new ShadowGenerator(2048, sunLight);
    this.shadowGenerator.useBlurExponentialShadowMap = true;
    this.shadowGenerator.blurKernel = 32;
    this.shadowGenerator.darkness = 0.3;

    // GameData의 조명 추가
    for (const light of this.gameData.lights) {
      this.createLight(light);
    }
  }

  private createLight(lightData: GameLight): void {
    const color = new Color3(lightData.color.r, lightData.color.g, lightData.color.b);

    switch (lightData.type) {
      case 'point': {
        const pointLight = new PointLight(lightData.id, lightData.position, this.scene);
        pointLight.diffuse = color;
        pointLight.intensity = lightData.intensity;
        if (lightData.range) pointLight.range = lightData.range;
        break;
      }
      case 'spot': {
        const spotLight = new SpotLight(
          lightData.id,
          lightData.position,
          lightData.direction || new Vector3(0, -1, 0),
          Math.PI / 4,
          2,
          this.scene
        );
        spotLight.diffuse = color;
        spotLight.intensity = lightData.intensity;
        break;
      }
      case 'directional': {
        const dirLight = new DirectionalLight(
          lightData.id,
          lightData.direction || new Vector3(0, -1, 0),
          this.scene
        );
        dirLight.diffuse = color;
        dirLight.intensity = lightData.intensity;
        break;
      }
    }
  }

  private createFloors(): void {
    for (const floor of this.gameData.floors) {
      const mesh = this.createFloorMesh(floor);
      if (mesh) {
        this.floorMeshes.push(mesh);
      }
    }
  }

  private createFloorMesh(floor: GameFloor): Mesh | null {
    if (floor.vertices.length < 3) return null;

    try {
      // 2D 좌표로 변환 (Y는 Babylon에서 위쪽)
      const shape = floor.vertices.map(v => ({ x: v.x, y: v.z }));

      // 역순으로 정렬하여 노말이 위를 향하게
      const polygon = new PolygonMeshBuilder(floor.id, shape.reverse(), this.scene, earcut);
      const mesh = polygon.build(false, 0.02); // 약간의 두께

      mesh.position.y = 0;

      // 재질 설정
      const material = new PBRMaterial(`${floor.id}_mat`, this.scene);
      material.albedoColor = new Color3(0.9, 0.85, 0.8); // 밝은 나무색
      material.metallic = 0;
      material.roughness = 0.7;
      mesh.material = material;

      // 충돌 및 그림자
      mesh.checkCollisions = floor.collisionEnabled;
      mesh.receiveShadows = true;

      // 메타데이터
      mesh.metadata = { type: 'floor', gameId: floor.id };

      return mesh;
    } catch (error) {
      console.error(`[GameScene] Failed to create floor ${floor.id}:`, error);
      return null;
    }
  }

  private createWalls(): void {
    for (const wall of this.gameData.walls) {
      const mesh = this.createWallMesh(wall);
      if (mesh) {
        this.wallMeshes.push(mesh);
        this.shadowGenerator?.addShadowCaster(mesh);
      }
    }
  }

  private createWallMesh(wall: GameWall): Mesh | null {
    try {
      // 벽의 방향 벡터
      const direction = wall.end.subtract(wall.start);
      const length = direction.length();
      const angle = Math.atan2(direction.z, direction.x);

      // 박스로 벽 생성
      const mesh = MeshBuilder.CreateBox(wall.id, {
        width: length,
        height: wall.height,
        depth: wall.thickness,
      }, this.scene);

      // 위치 (시작점과 끝점의 중간)
      const center = wall.start.add(wall.end).scale(0.5);
      mesh.position = new Vector3(center.x, wall.height / 2, center.z);

      // 회전
      mesh.rotation.y = -angle;

      // 재질
      const material = new PBRMaterial(`${wall.id}_mat`, this.scene);
      material.albedoColor = new Color3(0.95, 0.95, 0.95); // 흰색 벽
      material.metallic = 0;
      material.roughness = 0.9;
      mesh.material = material;

      // 충돌 설정
      mesh.checkCollisions = wall.hasCollision;

      // 메타데이터
      mesh.metadata = { type: 'wall', gameId: wall.id };

      return mesh;
    } catch (error) {
      console.error(`[GameScene] Failed to create wall ${wall.id}:`, error);
      return null;
    }
  }

  private createCeilings(): void {
    for (const ceiling of this.gameData.ceilings) {
      const mesh = this.createCeilingMesh(ceiling);
      if (mesh) {
        this.ceilingMeshes.push(mesh);
      }
    }
  }

  private createCeilingMesh(ceiling: GameCeiling): Mesh | null {
    if (ceiling.vertices.length < 3) return null;

    try {
      // 2D 좌표로 변환
      const shape = ceiling.vertices.map(v => ({ x: v.x, y: v.z }));

      const polygon = new PolygonMeshBuilder(ceiling.id, shape, this.scene, earcut);
      const mesh = polygon.build(false, 0.02);

      mesh.position.y = ceiling.height;

      // 재질
      const material = new PBRMaterial(`${ceiling.id}_mat`, this.scene);
      material.albedoColor = new Color3(1, 1, 1);
      material.metallic = 0;
      material.roughness = 0.95;
      mesh.material = material;

      // 천장은 충돌 없음 (플레이어가 지나갈 일 없음)
      mesh.checkCollisions = false;

      // 게임 모드에서는 천장 항상 보임
      mesh.visibility = 1;

      // 메타데이터
      mesh.metadata = { type: 'ceiling', gameId: ceiling.id };

      return mesh;
    } catch (error) {
      console.error(`[GameScene] Failed to create ceiling ${ceiling.id}:`, error);
      return null;
    }
  }

  private async loadFurniture(): Promise<void> {
    // TODO: 가구 모델 로딩 구현
    // SceneLoader.ImportMeshAsync를 사용하여 GLB 모델 로드
    console.log('[GameScene] Furniture loading not yet implemented');
  }

  /**
   * 씬 정리
   */
  dispose(): void {
    console.log('[GameScene] Disposing game scene');

    // 모든 메시 정리
    for (const mesh of this.floorMeshes) mesh.dispose();
    for (const mesh of this.wallMeshes) mesh.dispose();
    for (const mesh of this.ceilingMeshes) mesh.dispose();
    for (const mesh of this.furnitureMeshes) mesh.dispose();

    this.floorMeshes = [];
    this.wallMeshes = [];
    this.ceilingMeshes = [];
    this.furnitureMeshes = [];

    // 씬 정리
    this.scene.dispose();
  }
}
