/**
 * AutoWallHider - Normal-based Auto Wall Transparency
 *
 * Automatically hides walls facing the camera to show interior.
 * Uses wall normal direction for clean "corner view" like Coohom.
 *
 * Wall meshes must have: mesh.metadata = { type: 'wall' }
 */

import {
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  Camera,
  AbstractMesh,
  Vector3,
} from '@babylonjs/core';

export interface AutoWallHiderOptions {
  /** Visibility when hidden (0 = invisible, 0.1 = ghost) */
  hiddenVisibility?: number;
  /** Visibility when visible */
  visibleVisibility?: number;
  /** Enable smooth fade transition */
  smoothTransition?: boolean;
  /** Fade speed (0-1, higher = faster) */
  fadeSpeed?: number;
  /** Additional rays for better coverage */
  multiRay?: boolean;
  /** Camera beta angle threshold for showing ceiling (radians) */
  ceilingBetaThreshold?: number;
  /** Always show ceiling (useful for play mode with FPS camera) */
  alwaysShowCeiling?: boolean;
}

const DEFAULT_OPTIONS: AutoWallHiderOptions = {
  hiddenVisibility: 0,
  visibleVisibility: 1,
  smoothTransition: false,
  fadeSpeed: 0.15,
  multiRay: true,
  ceilingBetaThreshold: Math.PI / 2, // Show ceiling when looking up (beta > 90 degrees)
  alwaysShowCeiling: false,
};

export class AutoWallHider {
  private scene: Scene;
  private hiddenWalls: Set<AbstractMesh> = new Set();
  private enabled: boolean = true;
  private options: AutoWallHiderOptions;
  private wallVisibilityTargets: Map<AbstractMesh, number> = new Map();

  // Performance optimization: Cache wall meshes and throttle updates
  private cachedWallMeshes: AbstractMesh[] = [];
  private cachedCeilingMeshes: AbstractMesh[] = [];
  private wallCacheTime: number = 0;
  private ceilingCacheTime: number = 0;
  private lastUpdateTime: number = 0;
  private readonly CACHE_DURATION = 2000; // Refresh wall cache every 2 seconds
  private readonly UPDATE_INTERVAL = 100; // Only update every 100ms (10 FPS for wall hiding)

  constructor(scene: Scene, options: AutoWallHiderOptions = {}) {
    this.scene = scene;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get wall meshes with caching for performance
   */
  private getWallMeshes(): AbstractMesh[] {
    const now = performance.now();
    if (now - this.wallCacheTime > this.CACHE_DURATION || this.cachedWallMeshes.length === 0) {
      this.cachedWallMeshes = this.scene.meshes.filter(
        (mesh) => mesh.metadata?.type === 'wall' && mesh.isEnabled()
      );
      this.wallCacheTime = now;
    }
    return this.cachedWallMeshes;
  }

  /**
   * Get ceiling meshes with caching
   */
  private getCeilingMeshes(): AbstractMesh[] {
    const now = performance.now();
    if (now - this.ceilingCacheTime > this.CACHE_DURATION || this.cachedCeilingMeshes.length === 0) {
      this.cachedCeilingMeshes = this.scene.meshes.filter(
        (mesh) => mesh.metadata?.type === 'ceiling' && mesh.isEnabled()
      );
      this.ceilingCacheTime = now;
    }
    return this.cachedCeilingMeshes;
  }

  /**
   * Invalidate cache (call when walls/ceilings are added/removed)
   */
  public invalidateCache(): void {
    this.wallCacheTime = 0;
    this.cachedWallMeshes = [];
    this.ceilingCacheTime = 0;
    this.cachedCeilingMeshes = [];
  }

  /**
   * Update wall visibility based on camera position
   * Uses wall normal direction - hides walls whose inside faces the camera
   * This creates the clean "corner view" like professional interior design tools
   * Supports both ArcRotateCamera (edit mode) and UniversalCamera (play mode)
   */
  public update(camera: ArcRotateCamera | UniversalCamera | Camera): void {
    if (!this.enabled) return;

    // Throttle updates for performance
    const now = performance.now();
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL) return;
    this.lastUpdateTime = now;

    const wallsToHide = new Set<AbstractMesh>();
    const wallMeshes = this.getWallMeshes();

    if (wallMeshes.length === 0) return;

    const camPos = camera.position;
    // Get room center - ArcRotateCamera has target, UniversalCamera uses getTarget()
    const roomCenter = (camera as ArcRotateCamera).target || camera.getTarget();

    // For each wall, hide if it's BETWEEN camera and room center
    for (const wall of wallMeshes) {
      // Skip internal walls - they should never be hidden
      // Internal walls are shared between multiple rooms
      if (wall.metadata?.isInternal) continue;

      const bounds = wall.getBoundingInfo().boundingBox;
      const wallCenter = bounds.centerWorld;

      // Get wall dimensions to determine orientation
      const size = bounds.maximumWorld.subtract(bounds.minimumWorld);

      // Determine wall orientation
      const isXWall = size.x < size.z; // Thin in X = East/West wall

      if (isXWall) {
        // East/West wall - check X position
        const cameraOnPositiveSide = camPos.x > wallCenter.x;
        const roomOnPositiveSide = roomCenter.x > wallCenter.x;

        // Hide if camera and room center are on OPPOSITE sides of wall
        if (cameraOnPositiveSide !== roomOnPositiveSide) {
          wallsToHide.add(wall);
        }
      } else {
        // North/South wall - check Z position
        const cameraOnPositiveSide = camPos.z > wallCenter.z;
        const roomOnPositiveSide = roomCenter.z > wallCenter.z;

        if (cameraOnPositiveSide !== roomOnPositiveSide) {
          wallsToHide.add(wall);
        }
      }
    }

    // Apply visibility changes
    if (this.options.smoothTransition) {
      this.applySmoothTransition(wallMeshes, wallsToHide);
    } else {
      this.applyInstantTransition(wallMeshes, wallsToHide);
    }

    this.hiddenWalls = wallsToHide;

    // Update ceiling visibility based on camera angle
    this.updateCeilingVisibility(camera);
  }

  /**
   * Show ceiling when camera looks up (high beta angle)
   * Supports both ArcRotateCamera (edit mode) and UniversalCamera (play mode)
   */
  private updateCeilingVisibility(camera: ArcRotateCamera | UniversalCamera | Camera): void {
    const ceilingMeshes = this.getCeilingMeshes();
    if (ceilingMeshes.length === 0) return;

    // Always show ceiling if option is set (useful for play mode)
    if (this.options.alwaysShowCeiling) {
      for (const ceiling of ceilingMeshes) {
        ceiling.visibility = this.options.visibleVisibility!;
        ceiling.isPickable = true;
      }
      return;
    }

    const threshold = this.options.ceilingBetaThreshold!;
    let shouldShow = false;

    // Check camera type and calculate viewing angle accordingly
    if ((camera as ArcRotateCamera).beta !== undefined) {
      // ArcRotateCamera - use beta angle directly
      const arcCamera = camera as ArcRotateCamera;
      // beta > threshold means looking more upward (towards ceiling)
      shouldShow = arcCamera.beta > threshold;
    } else {
      // UniversalCamera or other cameras - calculate angle from direction vector
      // Get the camera's forward direction
      const direction = camera.getDirection(Vector3.Forward());
      // Calculate the vertical angle (pitch)
      // direction.y > 0 means looking up, direction.y < 0 means looking down
      // For ceiling visibility in FPS mode, show ceiling when looking up significantly
      // or always show it since player is inside the room
      const pitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
      // Convert pitch to equivalent beta: beta = PI/2 - pitch
      // When looking straight ahead: pitch=0, beta=PI/2
      // When looking up: pitch>0, beta<PI/2
      // When looking down: pitch<0, beta>PI/2
      const equivalentBeta = Math.PI / 2 - pitch;
      shouldShow = equivalentBeta > threshold;

      // In play mode (FPS), always show ceiling since user is inside the room
      // The ceiling should be visible when walking around
      shouldShow = true;
    }

    const targetVis = shouldShow ? this.options.visibleVisibility! : this.options.hiddenVisibility!;

    for (const ceiling of ceilingMeshes) {
      if (this.options.smoothTransition) {
        const diff = targetVis - ceiling.visibility;
        if (Math.abs(diff) > 0.01) {
          ceiling.visibility += diff * this.options.fadeSpeed!;
        } else {
          ceiling.visibility = targetVis;
        }
        // Update pickability based on visibility threshold
        ceiling.isPickable = ceiling.visibility > 0.5;
      } else {
        ceiling.visibility = targetVis;
        // Hidden ceiling shouldn't block picking
        ceiling.isPickable = shouldShow;
      }
    }
  }

  private applyInstantTransition(
    allWalls: AbstractMesh[],
    wallsToHide: Set<AbstractMesh>
  ): void {
    for (const wall of allWalls) {
      if (wallsToHide.has(wall)) {
        wall.visibility = this.options.hiddenVisibility!;
        wall.isPickable = false; // Hidden walls shouldn't block picking
      } else {
        wall.visibility = this.options.visibleVisibility!;
        wall.isPickable = true;
      }
    }
  }

  private applySmoothTransition(
    allWalls: AbstractMesh[],
    wallsToHide: Set<AbstractMesh>
  ): void {
    const speed = this.options.fadeSpeed!;

    for (const wall of allWalls) {
      const targetVisibility = wallsToHide.has(wall)
        ? this.options.hiddenVisibility!
        : this.options.visibleVisibility!;

      // Lerp towards target
      const current = wall.visibility;
      const diff = targetVisibility - current;

      if (Math.abs(diff) > 0.01) {
        wall.visibility = current + diff * speed;
      } else {
        wall.visibility = targetVisibility;
      }

      // Update pickability based on visibility threshold
      wall.isPickable = wall.visibility > 0.5;
    }
  }

  /**
   * Enable or disable auto wall hiding
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.restoreAllWalls();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Restore all walls and ceilings to full visibility
   */
  public restoreAllWalls(): void {
    const wallMeshes = this.scene.meshes.filter(
      (mesh) => mesh.metadata?.type === 'wall'
    );
    for (const wall of wallMeshes) {
      wall.visibility = this.options.visibleVisibility!;
      wall.isPickable = true;
    }

    const ceilingMeshes = this.scene.meshes.filter(
      (mesh) => mesh.metadata?.type === 'ceiling'
    );
    for (const ceiling of ceilingMeshes) {
      ceiling.visibility = this.options.visibleVisibility!;
      ceiling.isPickable = true;
    }

    this.hiddenWalls.clear();
    this.wallVisibilityTargets.clear();
  }

  /**
   * Update options at runtime
   */
  public setOptions(options: Partial<AutoWallHiderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get currently hidden walls
   */
  public getHiddenWalls(): AbstractMesh[] {
    return Array.from(this.hiddenWalls);
  }

  /**
   * Clean up
   */
  public dispose(): void {
    this.restoreAllWalls();
  }
}

/**
 * Helper: Tag a mesh as a wall for AutoWallHider
 */
export function tagAsWall(mesh: AbstractMesh, wallId?: string): void {
  mesh.metadata = {
    ...mesh.metadata,
    type: 'wall',
    wallId: wallId || mesh.name,
  };
  mesh.isPickable = true;
}

/**
 * Helper: Create AutoWallHider with scene.onBeforeRenderObservable integration
 * Supports both ArcRotateCamera (edit mode) and UniversalCamera (play mode)
 */
export function createAutoWallHider(
  scene: Scene,
  camera: ArcRotateCamera | UniversalCamera | Camera,
  options?: AutoWallHiderOptions
): AutoWallHider {
  const hider = new AutoWallHider(scene, options);

  // Register with render loop
  scene.onBeforeRenderObservable.add(() => {
    hider.update(camera);
  });

  return hider;
}
