/**
 * AutoWallHider - 카메라 위치 기반 벽 자동 숨김
 *
 * 카메라가 방을 볼 때, 카메라를 향하고 있는 벽만 숨김
 * 벽의 법선(normal)과 카메라 방향을 비교하여 판단
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
   * 벽의 법선 벡터 계산 (XZ 평면에서)
   * 벽이 얇은 방향이 법선 방향
   */
  private getWallNormal(wall: AbstractMesh): { nx: number; nz: number } {
    const bounds = wall.getBoundingInfo().boundingBox;
    const sizeX = bounds.maximumWorld.x - bounds.minimumWorld.x;
    const sizeZ = bounds.maximumWorld.z - bounds.minimumWorld.z;

    // 벽이 얇은 방향이 법선
    // X가 더 작으면 (벽이 Z축을 따라 길게 뻗어있으면) 법선은 X 방향
    // Z가 더 작으면 (벽이 X축을 따라 길게 뻗어있으면) 법선은 Z 방향
    if (sizeX < sizeZ) {
      return { nx: 1, nz: 0 }; // X 방향 법선
    } else {
      return { nx: 0, nz: 1 }; // Z 방향 법선
    }
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

    // 카메라 → 타겟 방향 벡터 (정규화)
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

      // 벽의 법선 방향
      const wallNormal = this.getWallNormal(wall);

      // 타겟(방 중심)에서 벽 중심까지의 방향
      const targetToWallX = wallCenterX - targetX;
      const targetToWallZ = wallCenterZ - targetZ;
      const targetToWallLen = Math.sqrt(targetToWallX * targetToWallX + targetToWallZ * targetToWallZ);

      if (targetToWallLen < 0.01) continue; // 벽이 중심에 있으면 스킵

      // 정규화된 타겟→벽 방향
      const normTargetToWallX = targetToWallX / targetToWallLen;
      const normTargetToWallZ = targetToWallZ / targetToWallLen;

      // 벽 법선이 양방향 모두 가능하므로, 타겟에서 바깥으로 향하는 방향을 선택
      // (타겟→벽 방향과 같은 방향의 법선 선택)
      const normalDotToWall = wallNormal.nx * normTargetToWallX + wallNormal.nz * normTargetToWallZ;
      const adjustedNormalX = normalDotToWall >= 0 ? wallNormal.nx : -wallNormal.nx;
      const adjustedNormalZ = normalDotToWall >= 0 ? wallNormal.nz : -wallNormal.nz;

      // 카메라 방향과 조정된 벽 법선의 내적
      // 양수 = 카메라가 벽의 바깥 면을 보고 있음 (숨겨야 함)
      // 음수 = 카메라가 벽의 안쪽 면을 보고 있음 (보여야 함)
      const camDotNormal = normDirX * adjustedNormalX + normDirZ * adjustedNormalZ;

      // 카메라가 벽의 바깥 면을 향하고 있으면 숨김
      // 임계값 0.3으로 약간의 여유를 둠
      if (camDotNormal > 0.3) {
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
