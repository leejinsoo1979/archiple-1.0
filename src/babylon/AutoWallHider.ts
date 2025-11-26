/**
 * AutoWallHider - 카메라 위치 기반 벽 자동 숨김
 *
 * 원리: 카메라에서 방 중심을 볼 때, 카메라 쪽에 있는 벽만 숨김
 * 벽이 카메라와 타겟 사이에 있고, 카메라를 향하고 있으면 숨김
 */

import {
  Scene,
  ArcRotateCamera,
  AbstractMesh,
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

    // 모든 벽 메시 가져오기
    const wallMeshes = this.scene.meshes.filter(
      (mesh) => mesh.metadata?.type === 'wall'
    );

    for (const wall of wallMeshes) {
      const bounds = wall.getBoundingInfo().boundingBox;
      const wallCenterX = (bounds.minimumWorld.x + bounds.maximumWorld.x) / 2;
      const wallCenterZ = (bounds.minimumWorld.z + bounds.maximumWorld.z) / 2;

      // 핵심: 벽이 카메라와 같은 쪽에 있는지 확인
      // 타겟에서 카메라 방향
      const targetToCamX = camX - targetX;
      const targetToCamZ = camZ - targetZ;

      // 타겟에서 벽 방향
      const targetToWallX = wallCenterX - targetX;
      const targetToWallZ = wallCenterZ - targetZ;

      // 내적: 양수면 벽이 카메라와 같은 쪽에 있음 (숨겨야 함)
      const dot = targetToCamX * targetToWallX + targetToCamZ * targetToWallZ;

      if (dot > 0) {
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
