/**
 * AutoWallHider - Raycasting 기반 벽 자동 숨김
 *
 * 카메라에서 타겟 영역으로 여러 레이를 쏴서 시야를 막는 모든 벽을 숨김
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

    const wallsToHide = new Set<AbstractMesh>();
    const origin = camera.position;
    const target = camera.target;

    // 타겟 주변 그리드로 여러 레이를 쏨 (넓은 영역 커버)
    const gridSize = 5; // 5x5 그리드
    const spread = 2.0; // 타겟 주변 2미터 범위

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        // 그리드 오프셋 계산
        const offsetX = (i / (gridSize - 1) - 0.5) * spread * 2;
        const offsetZ = (j / (gridSize - 1) - 0.5) * spread * 2;

        // 다양한 높이에서도 레이 쏨
        for (const offsetY of [0, 0.5, 1.0, 1.5]) {
          const targetPoint = new Vector3(
            target.x + offsetX,
            target.y + offsetY,
            target.z + offsetZ
          );

          const direction = targetPoint.subtract(origin);
          const length = direction.length();
          direction.normalize();

          const ray = new Ray(origin, direction, length + 1); // 약간 더 길게

          const hit = this.scene.pickWithRay(ray, (mesh) => {
            return mesh.metadata?.type === 'wall';
          });

          if (hit?.hit && hit.pickedMesh) {
            wallsToHide.add(hit.pickedMesh);
          }
        }
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
