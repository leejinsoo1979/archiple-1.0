/**
 * WallManager - Isometric Cutaway Wall System
 *
 * Automatically hides/fades walls based on camera angle in isometric mode.
 * - Front-facing wall (closest to camera): hidden
 * - Second closest wall: semi-transparent (alpha = 0.4)
 * - Other walls: fully visible
 */

import {
  Scene,
  Mesh,
  ArcRotateCamera,
  Vector3,
  Animation,
  AbstractMesh,
  PBRMaterial,
  StandardMaterial,
} from '@babylonjs/core';

// Types
interface WallInfo {
  mesh: Mesh;
  center: Vector3;
  normal: Vector3;
  originalAlpha: number;
}

type WallVisibilityMode = 'auto' | 'show-all' | 'hide-front';

// Constants
const ISOMETRIC_PITCH_MIN = 25 * (Math.PI / 180);
const ISOMETRIC_PITCH_MAX = 60 * (Math.PI / 180);
const FADE_DURATION = 200;
const FADED_ALPHA = 0.4;
const HIDDEN_ALPHA = 0;
const VISIBLE_ALPHA = 1;

/**
 * WallManager class - each canvas gets its own instance
 */
export class WallManager {
  private scene: Scene;
  private walls: WallInfo[] = [];
  private autoHideEnabled: boolean = true;
  private isIsometricMode: boolean = false;
  private hiddenWallIndex: number = -1;
  private fadedWallIndex: number = -1;
  private currentMode: WallVisibilityMode = 'auto';

  constructor(scene: Scene) {
    this.scene = scene;
    this.initWalls();
  }

  /**
   * Initialize walls from scene
   */
  private initWalls(): void {
    this.walls = [];

    const wallMeshes = this.scene.meshes.filter(mesh =>
      mesh.name.startsWith('wall_') && mesh instanceof Mesh
    ) as Mesh[];

    wallMeshes.forEach(mesh => {
      const wallInfo: WallInfo = {
        mesh,
        center: this.calculateWallCenter(mesh),
        normal: this.calculateWallNormal(mesh),
        originalAlpha: this.getMaterialAlpha(mesh),
      };
      this.walls.push(wallInfo);
    });

    console.log(`[WallManager] Initialized with ${this.walls.length} walls`);
  }

  /**
   * Calculate wall normal from bounding box
   */
  private calculateWallNormal(mesh: Mesh): Vector3 {
    const boundingInfo = mesh.getBoundingInfo();
    const min = boundingInfo.boundingBox.minimumWorld;
    const max = boundingInfo.boundingBox.maximumWorld;

    const sizeX = max.x - min.x;
    const sizeZ = max.z - min.z;

    if (sizeX < sizeZ) {
      const centerX = (min.x + max.x) / 2;
      return centerX > 0 ? new Vector3(1, 0, 0) : new Vector3(-1, 0, 0);
    } else {
      const centerZ = (min.z + max.z) / 2;
      return centerZ > 0 ? new Vector3(0, 0, 1) : new Vector3(0, 0, -1);
    }
  }

  private calculateWallCenter(mesh: Mesh): Vector3 {
    const boundingInfo = mesh.getBoundingInfo();
    return boundingInfo.boundingBox.centerWorld.clone();
  }

  private getMaterialAlpha(mesh: AbstractMesh): number {
    const material = mesh.material;
    if (!material) return 1;

    if (material instanceof PBRMaterial) {
      return material.alpha;
    } else if (material instanceof StandardMaterial) {
      return material.alpha;
    }
    return 1;
  }

  private setMaterialAlpha(mesh: AbstractMesh, targetAlpha: number, animate: boolean = true): void {
    const material = mesh.material;
    if (!material) return;

    if (targetAlpha < 1) {
      material.transparencyMode = 2;
      if (material instanceof PBRMaterial) {
        material.needDepthPrePass = true;
      }
    }

    if (!animate) {
      if (material instanceof PBRMaterial || material instanceof StandardMaterial) {
        material.alpha = targetAlpha;
      }
      mesh.visibility = targetAlpha;
      return;
    }

    const frameRate = 60;
    const totalFrames = Math.round((FADE_DURATION / 1000) * frameRate);
    const currentAlpha = this.getMaterialAlpha(mesh);

    const visibilityAnim = new Animation(
      'wallVisibility',
      'visibility',
      frameRate,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    visibilityAnim.setKeys([
      { frame: 0, value: currentAlpha },
      { frame: totalFrames, value: targetAlpha },
    ]);

    mesh.animations = [visibilityAnim];
    this.scene.beginAnimation(mesh, 0, totalFrames, false, 1, () => {
      if (material instanceof PBRMaterial || material instanceof StandardMaterial) {
        material.alpha = targetAlpha;
      }
    });
  }

  private isIsometricAngle(camera: ArcRotateCamera): boolean {
    const pitch = camera.beta;
    return pitch >= ISOMETRIC_PITCH_MIN && pitch <= ISOMETRIC_PITCH_MAX;
  }

  private getCameraForwardXZ(camera: ArcRotateCamera): Vector3 {
    const direction = camera.target.subtract(camera.position);
    direction.y = 0;
    direction.normalize();
    return direction;
  }

  private calculateWallFacing(wallInfo: WallInfo, cameraForward: Vector3): number {
    return Vector3.Dot(wallInfo.normal, cameraForward);
  }

  /**
   * Update wall visibility based on camera
   */
  public updateWallVisibility(camera: ArcRotateCamera): void {
    if (this.walls.length === 0) return;

    const isIsometric = this.isIsometricAngle(camera);
    this.isIsometricMode = isIsometric;

    if (this.currentMode === 'show-all') {
      return;
    }

    if (this.currentMode === 'hide-front') {
      this.applyFrontWallHiding(camera);
      return;
    }

    // Auto mode
    if (!this.autoHideEnabled || !isIsometric) {
      if (this.hiddenWallIndex !== -1 || this.fadedWallIndex !== -1) {
        this.restoreAllWalls();
      }
      return;
    }

    this.applyFrontWallHiding(camera);
  }

  private applyFrontWallHiding(camera: ArcRotateCamera): void {
    const cameraForward = this.getCameraForwardXZ(camera);

    const wallFacings: { index: number; facing: number }[] = this.walls.map((wall, index) => ({
      index,
      facing: this.calculateWallFacing(wall, cameraForward),
    }));

    wallFacings.sort((a, b) => b.facing - a.facing);

    const frontWallIndex = wallFacings.length > 0 && wallFacings[0].facing > 0
      ? wallFacings[0].index
      : -1;
    const secondWallIndex = wallFacings.length > 1 && wallFacings[1].facing > 0.3
      ? wallFacings[1].index
      : -1;

    this.walls.forEach((wall, index) => {
      if (index === frontWallIndex && frontWallIndex !== this.hiddenWallIndex) {
        this.setMaterialAlpha(wall.mesh, HIDDEN_ALPHA);
      } else if (index === secondWallIndex && secondWallIndex !== this.fadedWallIndex) {
        this.setMaterialAlpha(wall.mesh, FADED_ALPHA);
      } else if (index !== frontWallIndex && index !== secondWallIndex) {
        const currentAlpha = this.getMaterialAlpha(wall.mesh);
        if (currentAlpha < VISIBLE_ALPHA) {
          this.setMaterialAlpha(wall.mesh, VISIBLE_ALPHA);
        }
      }
    });

    this.hiddenWallIndex = frontWallIndex;
    this.fadedWallIndex = secondWallIndex;
  }

  private restoreAllWalls(): void {
    this.walls.forEach(wall => {
      const currentAlpha = this.getMaterialAlpha(wall.mesh);
      if (currentAlpha < VISIBLE_ALPHA) {
        this.setMaterialAlpha(wall.mesh, VISIBLE_ALPHA);
      }
    });

    this.hiddenWallIndex = -1;
    this.fadedWallIndex = -1;
  }

  public enableAutoHide(enabled: boolean): void {
    this.autoHideEnabled = enabled;
    this.currentMode = enabled ? 'auto' : 'show-all';

    if (!enabled) {
      this.restoreAllWalls();
    }
  }

  public showAllWalls(): void {
    this.currentMode = 'show-all';
    this.restoreAllWalls();
  }

  public hideFrontWall(): void {
    this.currentMode = 'hide-front';
  }

  public setVisibilityMode(mode: WallVisibilityMode): void {
    this.currentMode = mode;

    switch (mode) {
      case 'auto':
        this.autoHideEnabled = true;
        break;
      case 'show-all':
        this.showAllWalls();
        break;
      case 'hide-front':
        this.hideFrontWall();
        break;
    }
  }

  public getVisibilityMode(): WallVisibilityMode {
    return this.currentMode;
  }

  public isInIsometricMode(): boolean {
    return this.isIsometricMode;
  }

  public refresh(): void {
    this.initWalls();
  }

  public dispose(): void {
    this.restoreAllWalls();
    this.walls = [];
  }
}
