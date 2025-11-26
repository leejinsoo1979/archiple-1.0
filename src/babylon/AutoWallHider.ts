/**
 * AutoWallHider - 카메라 위치 기반 벽 자동 숨김
 *
 * 카메라가 방을 볼 때, 카메라와 방 중심 사이에 있는 벽만 숨김
 */

import {
  Scene,
  ArcRotateCamera,
  AbstractMesh,
  Vector3,
} from '@babylonjs/core';

export class AutoWallHider {
  private scene: Scene;
  private hiddenWalls: Set<AbstractMesh> = new Set();
  private enabled: boolean = true;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * 카메라 기준으로 벽 숨김 업데이트
   */
  public update(camera: ArcRotateCamera): void {
    if (!this.enabled) return;

    const wallsToHide = new Set<AbstractMesh>();

    // 카메라 위치 (XZ 평면)
    const camX = camera.position.x;
    const camZ = camera.position.z;

    // 타겟 위치 (방 중심)
    const targetX = camera.target.x;
    const targetZ = camera.target.z;

    // 카메라 → 타겟 방향 벡터
    const dirX = targetX - camX;
    const dirZ = targetZ - camZ;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const normDirX = dirX / dirLen;
    const normDirZ = dirZ / dirLen;

    // 모든 벽 메시 가져오기
    const wallMeshes = this.scene.meshes.filter(
      (mesh) => mesh.metadata?.type === 'wall'
    );

    for (const wall of wallMeshes) {
      const bounds = wall.getBoundingInfo().boundingBox;
      const wallCenterX = (bounds.minimumWorld.x + bounds.maximumWorld.x) / 2;
      const wallCenterZ = (bounds.minimumWorld.z + bounds.maximumWorld.z) / 2;

      // 카메라에서 벽 중심까지 벡터
      const toWallX = wallCenterX - camX;
      const toWallZ = wallCenterZ - camZ;

      // 벽까지의 투영 거리 (카메라 방향으로)
      const projDist = toWallX * normDirX + toWallZ * normDirZ;

      // 벽이 카메라 앞에 있고 (projDist > 0)
      // 타겟보다 카메라에 가까우면 (projDist < dirLen) 숨김
      if (projDist > 0 && projDist < dirLen * 0.9) {
        wallsToHide.add(wall);
      }
    }

    // 이전에 숨겼지만 이제 숨길 필요 없는 벽 복원
    for (const wall of this.hiddenWalls) {
      if (!wallsToHide.has(wall)) {
        wall.visibility = 1;
      }
    }

    // 새로 숨겨야 할 벽 숨김
    for (const wall of wallsToHide) {
      wall.visibility = 0;
    }

    this.hiddenWalls = wallsToHide;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.restoreAllWalls();
    }
  }

  public restoreAllWalls(): void {
    for (const wall of this.hiddenWalls) {
      wall.visibility = 1;
    }
    this.hiddenWalls.clear();
  }

  public dispose(): void {
    this.restoreAllWalls();
  }
}
