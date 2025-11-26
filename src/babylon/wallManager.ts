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
  normal: Vector3; // Wall facing direction
  originalAlpha: number;
}

interface WallManagerState {
  walls: WallInfo[];
  autoHideEnabled: boolean;
  isIsometricMode: boolean;
  hiddenWallIndex: number;
  fadedWallIndex: number;
}

type WallVisibilityMode = 'auto' | 'show-all' | 'hide-front';

// Constants
const ISOMETRIC_PITCH_MIN = 25 * (Math.PI / 180); // 25 degrees
const ISOMETRIC_PITCH_MAX = 60 * (Math.PI / 180); // 60 degrees
const FADE_DURATION = 200; // ms
const FADED_ALPHA = 0.4;
const HIDDEN_ALPHA = 0;
const VISIBLE_ALPHA = 1;

// State
let state: WallManagerState = {
  walls: [],
  autoHideEnabled: true,
  isIsometricMode: false,
  hiddenWallIndex: -1,
  fadedWallIndex: -1,
};

let currentMode: WallVisibilityMode = 'auto';
let scene: Scene | null = null;

/**
 * Calculate wall normal (facing direction) from wall mesh
 */
function calculateWallNormal(mesh: Mesh): Vector3 {
  // Get bounding box to determine wall orientation
  const boundingInfo = mesh.getBoundingInfo();
  const min = boundingInfo.boundingBox.minimumWorld;
  const max = boundingInfo.boundingBox.maximumWorld;

  const sizeX = max.x - min.x;
  const sizeZ = max.z - min.z;

  // Wall is thin in one direction - that's the normal direction
  if (sizeX < sizeZ) {
    // Wall faces X direction
    const centerX = (min.x + max.x) / 2;
    return centerX > 0 ? new Vector3(1, 0, 0) : new Vector3(-1, 0, 0);
  } else {
    // Wall faces Z direction
    const centerZ = (min.z + max.z) / 2;
    return centerZ > 0 ? new Vector3(0, 0, 1) : new Vector3(0, 0, -1);
  }
}

/**
 * Calculate wall center position
 */
function calculateWallCenter(mesh: Mesh): Vector3 {
  const boundingInfo = mesh.getBoundingInfo();
  return boundingInfo.boundingBox.centerWorld.clone();
}

/**
 * Get material alpha from mesh
 */
function getMaterialAlpha(mesh: AbstractMesh): number {
  const material = mesh.material;
  if (!material) return 1;

  if (material instanceof PBRMaterial) {
    return material.alpha;
  } else if (material instanceof StandardMaterial) {
    return material.alpha;
  }
  return 1;
}

/**
 * Set material alpha with animation
 */
function setMaterialAlpha(mesh: AbstractMesh, targetAlpha: number, animate: boolean = true): void {
  const material = mesh.material;
  if (!material || !scene) return;

  // Ensure material supports transparency
  if (targetAlpha < 1) {
    material.transparencyMode = 2; // ALPHABLEND
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

  // Animate alpha
  const frameRate = 60;
  const totalFrames = Math.round((FADE_DURATION / 1000) * frameRate);

  const currentAlpha = getMaterialAlpha(mesh);

  // Create animation for visibility
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
  scene.beginAnimation(mesh, 0, totalFrames, false, 1, () => {
    // Also set material alpha after animation
    if (material instanceof PBRMaterial || material instanceof StandardMaterial) {
      material.alpha = targetAlpha;
    }
  });
}

/**
 * Initialize wall manager with scene
 */
export function initWalls(sceneInstance: Scene): void {
  scene = sceneInstance;
  state.walls = [];

  // Find all wall meshes
  const wallMeshes = scene.meshes.filter(mesh =>
    mesh.name.startsWith('wall_') && mesh instanceof Mesh
  ) as Mesh[];

  wallMeshes.forEach(mesh => {
    const wallInfo: WallInfo = {
      mesh,
      center: calculateWallCenter(mesh),
      normal: calculateWallNormal(mesh),
      originalAlpha: getMaterialAlpha(mesh),
    };
    state.walls.push(wallInfo);
  });

  console.log(`[WallManager] Initialized with ${state.walls.length} walls`);
}

/**
 * Check if camera is in isometric viewing angle
 */
function isIsometricAngle(camera: ArcRotateCamera): boolean {
  // Beta is the vertical angle (0 = top-down, PI/2 = horizontal)
  const pitch = camera.beta;
  return pitch >= ISOMETRIC_PITCH_MIN && pitch <= ISOMETRIC_PITCH_MAX;
}

/**
 * Get camera forward direction on XZ plane
 */
function getCameraForwardXZ(camera: ArcRotateCamera): Vector3 {
  // Camera looks at target from position
  const direction = camera.target.subtract(camera.position);
  direction.y = 0; // Project to XZ plane
  direction.normalize();
  return direction;
}

/**
 * Calculate dot product between camera direction and wall normal
 * Higher value = wall is more front-facing (should be hidden)
 */
function calculateWallFacing(wallInfo: WallInfo, cameraForward: Vector3): number {
  return Vector3.Dot(wallInfo.normal, cameraForward);
}

/**
 * Update wall visibility based on camera position/angle
 */
export function updateWallVisibility(camera: ArcRotateCamera): void {
  if (!scene || state.walls.length === 0) return;

  // Check if in isometric mode
  const isIsometric = isIsometricAngle(camera);
  state.isIsometricMode = isIsometric;

  // If not in auto mode or not isometric, handle accordingly
  if (currentMode === 'show-all') {
    showAllWalls();
    return;
  }

  if (currentMode === 'hide-front') {
    // Always hide front wall regardless of angle
    applyFrontWallHiding(camera);
    return;
  }

  // Auto mode
  if (!state.autoHideEnabled || !isIsometric) {
    // Show all walls when not in isometric mode
    if (state.hiddenWallIndex !== -1 || state.fadedWallIndex !== -1) {
      restoreAllWalls();
    }
    return;
  }

  applyFrontWallHiding(camera);
}

/**
 * Apply front wall hiding logic
 */
function applyFrontWallHiding(camera: ArcRotateCamera): void {
  const cameraForward = getCameraForwardXZ(camera);

  // Calculate facing value for each wall
  const wallFacings: { index: number; facing: number }[] = state.walls.map((wall, index) => ({
    index,
    facing: calculateWallFacing(wall, cameraForward),
  }));

  // Sort by facing value (highest = most front-facing)
  wallFacings.sort((a, b) => b.facing - a.facing);

  // Get front-most and second front-most walls
  const frontWallIndex = wallFacings.length > 0 && wallFacings[0].facing > 0
    ? wallFacings[0].index
    : -1;
  const secondWallIndex = wallFacings.length > 1 && wallFacings[1].facing > 0.3
    ? wallFacings[1].index
    : -1;

  // Update visibility for each wall
  state.walls.forEach((wall, index) => {
    if (index === frontWallIndex && frontWallIndex !== state.hiddenWallIndex) {
      // Hide front wall
      setMaterialAlpha(wall.mesh, HIDDEN_ALPHA);
    } else if (index === secondWallIndex && secondWallIndex !== state.fadedWallIndex) {
      // Fade second wall
      setMaterialAlpha(wall.mesh, FADED_ALPHA);
    } else if (index !== frontWallIndex && index !== secondWallIndex) {
      // Show other walls
      const currentAlpha = getMaterialAlpha(wall.mesh);
      if (currentAlpha < VISIBLE_ALPHA) {
        setMaterialAlpha(wall.mesh, VISIBLE_ALPHA);
      }
    }
  });

  state.hiddenWallIndex = frontWallIndex;
  state.fadedWallIndex = secondWallIndex;
}

/**
 * Restore all walls to visible state
 */
function restoreAllWalls(): void {
  state.walls.forEach(wall => {
    const currentAlpha = getMaterialAlpha(wall.mesh);
    if (currentAlpha < VISIBLE_ALPHA) {
      setMaterialAlpha(wall.mesh, VISIBLE_ALPHA);
    }
  });

  state.hiddenWallIndex = -1;
  state.fadedWallIndex = -1;
}

/**
 * Enable/disable auto-hide feature
 */
export function enableAutoHide(enabled: boolean): void {
  state.autoHideEnabled = enabled;
  currentMode = enabled ? 'auto' : 'show-all';

  if (!enabled) {
    restoreAllWalls();
  }

  console.log(`[WallManager] Auto-hide ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Show all walls (override auto-hide)
 */
export function showAllWalls(): void {
  currentMode = 'show-all';
  restoreAllWalls();
  console.log('[WallManager] Showing all walls');
}

/**
 * Hide only front wall (manual mode)
 */
export function hideFrontWall(): void {
  currentMode = 'hide-front';
  console.log('[WallManager] Hide front wall mode enabled');
}

/**
 * Set visibility mode
 */
export function setVisibilityMode(mode: WallVisibilityMode): void {
  currentMode = mode;

  switch (mode) {
    case 'auto':
      state.autoHideEnabled = true;
      break;
    case 'show-all':
      showAllWalls();
      break;
    case 'hide-front':
      hideFrontWall();
      break;
  }
}

/**
 * Get current visibility mode
 */
export function getVisibilityMode(): WallVisibilityMode {
  return currentMode;
}

/**
 * Check if currently in isometric mode
 */
export function isInIsometricMode(): boolean {
  return state.isIsometricMode;
}

/**
 * Refresh wall list (call after walls are created/destroyed)
 */
export function refreshWalls(): void {
  if (scene) {
    initWalls(scene);
  }
}

/**
 * Cleanup
 */
export function dispose(): void {
  restoreAllWalls();
  state.walls = [];
  scene = null;
}
