/**
 * useCharacterController - Character physics and animation controller hook
 *
 * Handles character loading, movement, animations, and camera following
 * for play mode in World Editor.
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  Scene,
  Vector3,
  Ray,
  Mesh,
  Color3,
  ArcRotateCamera,
  UniversalCamera,
  AnimationGroup,
  AbstractMesh,
  ShadowGenerator,
  SceneLoader,
} from '@babylonjs/core';
import type { CharacterConfig, ViewMode } from '../types';
import { DEFAULT_CHARACTER_CONFIG } from '../types';

interface UseCharacterControllerProps {
  scene: Scene | null;
  shadowGenerator: ShadowGenerator | null;
  arcCamera: ArcRotateCamera | null;
  thirdPersonCamera: ArcRotateCamera | null;
  fpsCamera: UniversalCamera | null;
  isoCamera: ArcRotateCamera | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  playMode: boolean;
  viewMode: ViewMode;
  currentStep: number;
  config?: CharacterConfig;
}

interface CharacterControllerResult {
  characterRef: React.MutableRefObject<AbstractMesh | null>;
  characterRootRef: React.MutableRefObject<AbstractMesh | null>;
  playModeRef: React.MutableRefObject<boolean>;
  viewModeRef: React.MutableRefObject<ViewMode>;
}

export const useCharacterController = ({
  scene,
  shadowGenerator,
  arcCamera,
  thirdPersonCamera,
  fpsCamera,
  isoCamera,
  canvasRef,
  playMode,
  viewMode,
  currentStep,
  config = DEFAULT_CHARACTER_CONFIG,
}: UseCharacterControllerProps): CharacterControllerResult => {
  // Character refs
  const characterRef = useRef<AbstractMesh | null>(null);
  const characterRootRef = useRef<AbstractMesh | null>(null);
  const idleAnimationRef = useRef<AnimationGroup | null>(null);
  const walkAnimationRef = useRef<AnimationGroup | null>(null);
  const runAnimationRef = useRef<AnimationGroup | null>(null);
  const characterGroundOffsetRef = useRef<number>(0);

  // Emote animation refs (1,2,3,4 keys)
  const emote1Ref = useRef<AnimationGroup | null>(null);
  const emote2Ref = useRef<AnimationGroup | null>(null);
  const emote3Ref = useRef<AnimationGroup | null>(null);
  const emote4Ref = useRef<AnimationGroup | null>(null);
  const runningJumpAnimRef = useRef<AnimationGroup | null>(null);
  const isEmotingRef = useRef<boolean>(false);

  // Movement state
  const currentAnimRef = useRef<string>('idle');
  const isRunningRef = useRef<boolean>(false);
  const playModeRef = useRef<boolean>(false);
  const viewModeRef = useRef<ViewMode>('third-person');

  // Helper: Get ground height at position using Ray
  const getGroundHeight = useCallback((position: Vector3, sceneInstance: Scene): number => {
    const rayOrigin = new Vector3(position.x, position.y + 5.0, position.z);
    const rayDirection = new Vector3(0, -1, 0);
    const ray = new Ray(rayOrigin, rayDirection, 15.0);

    const pickInfo = sceneInstance.pickWithRay(ray, (mesh) => {
      const name = mesh.name.toLowerCase();
      if (name.includes('character')) return false;
      if (name.includes('ch02')) return false;
      if (name.includes('armature')) return false;
      if (name.includes('__root__')) return false;
      if (name.includes('skybox')) return false;
      if (name.includes('sundisk')) return false;
      if (name.includes('infinitegrid')) return false;
      if (name.includes('axis')) return false;
      return true;
    });

    if (pickInfo?.hit && pickInfo.pickedPoint) {
      return pickInfo.pickedPoint.y;
    }
    return 0;
  }, []);

  // Play mode - load character and setup controls
  useEffect(() => {
    if (!scene) return;

    // Sync refs with state
    playModeRef.current = playMode;
    viewModeRef.current = viewMode;

    // Only run in step 2 (3D mode)
    if (currentStep !== 2) return;

    // Hide/show axis based on play mode
    const xAxis = scene.getMeshByName('xAxis');
    const yAxis = scene.getMeshByName('yAxis');
    const zAxis = scene.getMeshByName('zAxis');
    if (xAxis) xAxis.isVisible = !playMode;
    if (yAxis) yAxis.isVisible = !playMode;
    if (zAxis) zAxis.isVisible = !playMode;

    if (!playMode) {
      // Clean up character when exiting play mode
      if (characterRootRef.current) {
        characterRootRef.current.dispose();
        characterRootRef.current = null;
        characterRef.current = null;
      }

      // Reset physics state
      isRunningRef.current = false;
      currentAnimRef.current = 'idle';

      // Switch back to arc camera
      if (arcCamera) {
        scene.activeCamera = arcCamera;
        arcCamera.attachControl(canvasRef.current!, true);
      }
      return;
    }

    console.log('[CharacterController] Play mode activated, loading character...');

    // Load character
    const loadCharacter = async () => {
      try {
        const result = await SceneLoader.ImportMeshAsync(
          '',
          '/animation/moving/',
          'female_walking.glb',
          scene
        );

        const characterRoot = new Mesh('characterRoot', scene);
        characterRoot.position = new Vector3(0, 0, 0);
        characterRoot.isVisible = false;

        // Setup meshes and calculate height
        let minY = Infinity, maxY = -Infinity;
        for (const mesh of result.meshes) {
          if (!mesh.parent) {
            mesh.parent = characterRoot;
          }
          mesh.receiveShadows = true;
          if (shadowGenerator) {
            shadowGenerator.addShadowCaster(mesh);
          }

          // Matte material
          if (mesh.material) {
            const mat = mesh.material as any;
            if (mat.metallic !== undefined) {
              mat.metallic = 0;
              mat.roughness = 1.0;
              mat.environmentIntensity = 0.4;
              mat.directIntensity = 2.5;
              mat.specularIntensity = 0;
              mat.reflectionTexture = null;
            }
            if (mat.specularColor) {
              mat.specularColor = new Color3(0, 0, 0);
              mat.specularPower = 0;
            }
          }

          // Calculate bounding box
          const boundingInfo = mesh.getBoundingInfo();
          if (boundingInfo) {
            minY = Math.min(minY, boundingInfo.boundingBox.minimumWorld.y);
            maxY = Math.max(maxY, boundingInfo.boundingBox.maximumWorld.y);
          }
        }

        // Scale to 1.8m
        const originalHeight = maxY - minY;
        const targetHeight = 1.8;
        const scale = originalHeight > 0 ? targetHeight / originalHeight : 1;
        characterRoot.scaling = new Vector3(scale, scale, scale);

        // Ground offset
        const groundOffset = -minY * scale;
        characterGroundOffsetRef.current = groundOffset;
        characterRoot.position.y = groundOffset;

        characterRootRef.current = characterRoot;
        characterRef.current = characterRoot;

        console.log(`[CharacterController] Character loaded, scale: ${scale.toFixed(2)}`);

        // Get skeleton for animation retargeting
        const characterSkeleton = result.skeletons?.[0] || null;

        // Store walk animation from loaded model
        if (result.animationGroups?.length > 0) {
          walkAnimationRef.current = result.animationGroups[0];
          walkAnimationRef.current.loopAnimation = true;
          walkAnimationRef.current.stop();
        }

        // Helper function to load and retarget animation
        const loadRetargetedAnimation = async (
          filename: string,
          folder: string,
          animName: string,
          loop: boolean = true
        ): Promise<AnimationGroup | null> => {
          try {
            const animResult = await SceneLoader.ImportMeshAsync('', folder, filename, scene);

            if (animResult.animationGroups?.length > 0 && characterSkeleton) {
              const anim = animResult.animationGroups[0];
              const clonedAnim = anim.clone(`${animName}_cloned`, (oldTarget) => {
                if (oldTarget?.name) {
                  const bone = characterSkeleton.bones.find(b => b.name === oldTarget.name);
                  if (bone) return bone.getTransformNode();
                }
                return null;
              });

              if (clonedAnim) {
                clonedAnim.loopAnimation = loop;
                clonedAnim.stop();

                // Dispose temporary meshes
                animResult.meshes.forEach(mesh => mesh.dispose());
                animResult.skeletons?.forEach(skeleton => skeleton.dispose());

                return clonedAnim;
              }
            }

            // Cleanup on failure
            animResult.meshes.forEach(mesh => mesh.dispose());
            animResult.skeletons?.forEach(skeleton => skeleton.dispose());
          } catch (error) {
            console.warn(`[CharacterController] Failed to load ${animName}:`, error);
          }
          return null;
        };

        // Load animations
        const [idleAnim, runAnim, emote1, emote2, emote3, emote4, runningJumpAnim] = await Promise.all([
          loadRetargetedAnimation('idle.glb', '/animation/moving/', 'idle', true),
          loadRetargetedAnimation('running2.glb', '/animation/moving/', 'run', true),
          loadRetargetedAnimation('Tut_Hip_Hop_Dance.glb', '/animation/', 'dance1', false),
          loadRetargetedAnimation('booty_hip_hop_dance.glb', '/animation/moving/', 'dance2', false),
          loadRetargetedAnimation('snake_hip_hop_dance.glb', '/animation/moving/', 'dance3', false),
          loadRetargetedAnimation('standing_greeting.glb', '/animation/moving/', 'greeting', false),
          loadRetargetedAnimation('RunningJump.glb', '/animation/moving/', 'runningJump', false),
        ]);

        if (idleAnim) {
          idleAnimationRef.current = idleAnim;
          idleAnim.start(true);
          currentAnimRef.current = 'idle';
        }
        if (runAnim) runAnimationRef.current = runAnim;
        if (emote1) emote1Ref.current = emote1;
        if (emote2) emote2Ref.current = emote2;
        if (emote3) emote3Ref.current = emote3;
        if (emote4) emote4Ref.current = emote4;
        if (runningJumpAnim) runningJumpAnimRef.current = runningJumpAnim;

        // Setup camera
        if (arcCamera) {
          arcCamera.detachControl();
        }

        if (viewMode === 'first-person' && fpsCamera) {
          fpsCamera.position = characterRoot.position.add(new Vector3(0, 1.7, 0));
          fpsCamera.rotation = new Vector3(0, characterRoot.rotation.y, 0);
          scene.activeCamera = fpsCamera;
          fpsCamera.attachControl(canvasRef.current!, true);
        } else if (viewMode === 'iso' && isoCamera) {
          isoCamera.target = characterRoot.position.clone();
          scene.activeCamera = isoCamera;
          isoCamera.attachControl(canvasRef.current!, true);
        } else if (thirdPersonCamera) {
          thirdPersonCamera.target = characterRoot.position.add(new Vector3(0, 1, 0));
          scene.activeCamera = thirdPersonCamera;
          thirdPersonCamera.attachControl(canvasRef.current!, true);
        }

        console.log('[CharacterController] Character loaded, viewMode:', viewMode);
      } catch (error) {
        console.error('[CharacterController] Failed to load character:', error);
      }
    };

    loadCharacter();

    // Korean key mapping
    const koreanToWasd: Record<string, string> = {
      'ㅈ': 'w', 'ㅁ': 'a', 'ㄴ': 's', 'ㅇ': 'd'
    };

    const inputMap: { [key: string]: boolean } = {};
    let isJumping = false;
    let localVerticalVelocity = 0;
    const groundY = characterGroundOffsetRef.current;

    // Play emote animation
    const playEmote = (emoteAnim: AnimationGroup | null) => {
      if (!emoteAnim || isEmotingRef.current) return;

      idleAnimationRef.current?.stop();
      walkAnimationRef.current?.stop();
      runAnimationRef.current?.stop();

      isEmotingRef.current = true;
      emoteAnim.start(false);

      emoteAnim.onAnimationGroupEndObservable.addOnce(() => {
        isEmotingRef.current = false;
        idleAnimationRef.current?.start(true);
        currentAnimRef.current = 'idle';
      });
    };

    // Keyboard controls
    const handleKeyDown = (e: KeyboardEvent) => {
      let key = e.key.toLowerCase();
      if (koreanToWasd[key]) key = koreanToWasd[key];

      if (['w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
        inputMap[key] = true;
        if (isEmotingRef.current) {
          isEmotingRef.current = false;
          emote1Ref.current?.stop();
          emote2Ref.current?.stop();
          emote3Ref.current?.stop();
          emote4Ref.current?.stop();
        }
      }

      if (key === 'shift') isRunningRef.current = true;

      if (key === ' ' && !isJumping && characterRootRef.current) {
        isJumping = true;
        localVerticalVelocity = config.jumpForce;

        if (isRunningRef.current && runningJumpAnimRef.current) {
          idleAnimationRef.current?.stop();
          walkAnimationRef.current?.stop();
          runAnimationRef.current?.stop();
          runningJumpAnimRef.current.start(false);
          currentAnimRef.current = 'runningJump';
        }
      }

      if (e.key === '1') playEmote(emote1Ref.current);
      else if (e.key === '2') playEmote(emote2Ref.current);
      else if (e.key === '3') playEmote(emote3Ref.current);
      else if (e.key === '4') playEmote(emote4Ref.current);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let key = e.key.toLowerCase();
      if (koreanToWasd[key]) key = koreanToWasd[key];

      if (['w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
        inputMap[key] = false;
      }
      if (key === 'shift') isRunningRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    let targetRotationY = 0;

    // Movement update
    const updateMovement = () => {
      if (!characterRootRef.current || !playModeRef.current) return;

      const character = characterRootRef.current;
      const currentViewMode = viewModeRef.current;
      const isRunning = isRunningRef.current;
      const currentMoveSpeed = isRunning ? config.runSpeed : config.walkSpeed;

      let playCamera: ArcRotateCamera | UniversalCamera | null = null;
      if (currentViewMode === 'first-person') playCamera = fpsCamera;
      else if (currentViewMode === 'iso') playCamera = isoCamera;
      else playCamera = thirdPersonCamera;

      if (!playCamera) return;

      // Camera direction
      let forward: Vector3;
      if (currentViewMode === 'first-person' && fpsCamera) {
        const yRotation = fpsCamera.rotation.y;
        forward = new Vector3(Math.sin(yRotation), 0, Math.cos(yRotation));
      } else {
        const camPos = playCamera.position;
        const camTarget = (playCamera as ArcRotateCamera).target;
        forward = new Vector3(camTarget.x - camPos.x, 0, camTarget.z - camPos.z);
        forward.normalize();
      }

      const right = new Vector3(forward.z, 0, -forward.x);

      // Input handling
      let moveDirection = Vector3.Zero();
      if (inputMap['w']) moveDirection.addInPlace(forward);
      if (inputMap['s']) moveDirection.subtractInPlace(forward);
      if (inputMap['a']) moveDirection.subtractInPlace(right);
      if (inputMap['d']) moveDirection.addInPlace(right);

      const isMoving = moveDirection.lengthSquared() > 0.0001;

      if (isMoving) {
        moveDirection.normalize();
        const newPosition = character.position.add(moveDirection.scale(currentMoveSpeed));
        character.position.x = newPosition.x;
        character.position.z = newPosition.z;
        targetRotationY = Math.atan2(moveDirection.x, moveDirection.z);
      }

      // Ground collision
      const groundHeight = getGroundHeight(character.position, scene);
      if (groundHeight > character.position.y) {
        character.position.y = groundHeight;
      } else if (groundHeight < character.position.y - 0.1) {
        character.position.y = Math.max(groundHeight, character.position.y - 0.3);
      }

      // Rotation interpolation
      let angleDiff = targetRotationY - character.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      character.rotation.y += angleDiff * config.rotationSpeed;

      // Camera follow
      if (currentViewMode === 'first-person' && fpsCamera) {
        fpsCamera.position.x = character.position.x;
        fpsCamera.position.y = character.position.y + 1.7;
        fpsCamera.position.z = character.position.z;
      } else {
        const arcCam = playCamera as ArcRotateCamera;
        arcCam.target.x = character.position.x;
        arcCam.target.y = character.position.y + 0.5;
        arcCam.target.z = character.position.z;
      }

      // Jump physics
      if (isJumping) {
        character.position.y += localVerticalVelocity;
        localVerticalVelocity -= config.gravity;
        if (character.position.y <= groundY) {
          character.position.y = groundY;
          isJumping = false;
          localVerticalVelocity = 0;
        }
      }

      // Animation state
      if (isEmotingRef.current) return;
      if (isJumping && currentAnimRef.current === 'runningJump') return;

      if (currentViewMode !== 'first-person') {
        let targetAnim = 'idle';
        if (isJumping) {
          if (currentAnimRef.current === 'runningJump') return;
          targetAnim = 'jump';
        } else if (isMoving) {
          targetAnim = isRunning ? 'run' : 'walk';
        }

        if (targetAnim !== currentAnimRef.current) {
          idleAnimationRef.current?.stop();
          walkAnimationRef.current?.stop();
          runAnimationRef.current?.stop();
          runningJumpAnimRef.current?.stop();

          if (targetAnim === 'run' && runAnimationRef.current) {
            runAnimationRef.current.start(true);
          } else if (targetAnim === 'walk' && walkAnimationRef.current) {
            walkAnimationRef.current.start(true);
          } else if (targetAnim === 'idle' && idleAnimationRef.current) {
            idleAnimationRef.current.start(true);
          }

          currentAnimRef.current = targetAnim;
        }
      }
    };

    scene.registerBeforeRender(updateMovement);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      scene.unregisterBeforeRender(updateMovement);
    };
  }, [
    scene,
    shadowGenerator,
    arcCamera,
    thirdPersonCamera,
    fpsCamera,
    isoCamera,
    canvasRef,
    playMode,
    currentStep,
    config,
    getGroundHeight,
  ]);

  // Handle camera switching when viewMode changes
  useEffect(() => {
    viewModeRef.current = viewMode;

    if (!scene || !playMode || !characterRootRef.current) return;

    thirdPersonCamera?.detachControl();
    fpsCamera?.detachControl();
    isoCamera?.detachControl();

    if (viewMode === 'first-person' && fpsCamera) {
      fpsCamera.position = characterRootRef.current.position.add(new Vector3(0, 1.7, 0));
      fpsCamera.rotation = new Vector3(0, characterRootRef.current.rotation.y, 0);
      scene.activeCamera = fpsCamera;
      fpsCamera.attachControl(canvasRef.current!, true);
      characterRootRef.current.setEnabled(false);
    } else if (viewMode === 'iso' && isoCamera) {
      isoCamera.target = characterRootRef.current.position.clone();
      scene.activeCamera = isoCamera;
      isoCamera.attachControl(canvasRef.current!, true);
      characterRootRef.current.setEnabled(true);
    } else if (thirdPersonCamera) {
      thirdPersonCamera.target = characterRootRef.current.position.add(new Vector3(0, 1, 0));
      scene.activeCamera = thirdPersonCamera;
      thirdPersonCamera.attachControl(canvasRef.current!, true);
      characterRootRef.current.setEnabled(true);
    }

    console.log('[CharacterController] Camera switched to:', viewMode);
  }, [viewMode, playMode, scene, thirdPersonCamera, fpsCamera, isoCamera, canvasRef]);

  return {
    characterRef,
    characterRootRef,
    playModeRef,
    viewModeRef,
  };
};

export default useCharacterController;
