/**
 * AutoWallHider - Raycasting 기반 벽 자동 숨김
 *
 * 카메라에서 타겟으로 레이를 쏴서 벽에 맞으면 그 벽을 숨김
 */

import {
  Scene,
  ArcRotateCamera,
  Ray,
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

    // 현재 프레임에서 숨겨야 할 벽들
    const wallsToHide = new Set<AbstractMesh>();

    // 카메라에서 타겟으로의 레이
    const origin = camera.position;
    const direction = camera.target.subtract(camera.position);
    const length = direction.length();
    direction.normalize();

    const ray = new Ray(origin, direction, length);

    // 메인 레이로 히트 체크
    const hit = this.scene.pickWithRay(ray, (mesh) => {
      return mesh.metadata?.type === 'wall';
    });

    if (hit?.hit && hit.pickedMesh) {
      wallsToHide.add(hit.pickedMesh);
    }

    // 추가: 여러 방향으로 레이를 쏴서 코너 벽도 감지
    const offsets = [
      new Vector3(0.5, 0, 0),
      new Vector3(-0.5, 0, 0),
      new Vector3(0, 0, 0.5),
      new Vector3(0, 0, -0.5),
      new Vector3(0, 0.5, 0),
      new Vector3(0, -0.5, 0),
    ];

    for (const offset of offsets) {
      const targetWithOffset = camera.target.add(offset);
      const dir = targetWithOffset.subtract(camera.position);
      const len = dir.length();
      dir.normalize();

      const offsetRay = new Ray(camera.position, dir, len);
      const offsetHit = this.scene.pickWithRay(offsetRay, (mesh) => {
        return mesh.metadata?.type === 'wall';
      });

      if (offsetHit?.hit && offsetHit.pickedMesh) {
        wallsToHide.add(offsetHit.pickedMesh);
      }
    }

    // 이전에 숨겼지만 이제 숨길 필요 없는 벽 복원
    for (const wall of this.hiddenWalls) {
      if (!wallsToHide.has(wall)) {
        wall.visibility = 1;
        wall.setEnabled(true);
      }
    }

    // 새로 숨겨야 할 벽 숨김
    for (const wall of wallsToHide) {
      wall.visibility = 0;
    }

    // 현재 숨긴 벽 목록 업데이트
    this.hiddenWalls = wallsToHide;
  }

  /**
   * 활성화/비활성화
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.restoreAllWalls();
    }
  }

  /**
   * 모든 벽 복원
   */
  public restoreAllWalls(): void {
    for (const wall of this.hiddenWalls) {
      wall.visibility = 1;
      wall.setEnabled(true);
    }
    this.hiddenWalls.clear();
  }

  /**
   * 정리
   */
  public dispose(): void {
    this.restoreAllWalls();
  }
}
