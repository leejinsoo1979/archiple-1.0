/**
 * WorldEditorPage - Archiple World Level Editor
 *
 * Features:
 * - Play mode with character and WASD controls
 * - Three camera modes: First-person, Third-person, ISO
 * - Terrain with infinite grid
 * - Road drawing tool
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  Color3,
  Color4,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  CubeTexture,
  AbstractMesh,
  AnimationGroup,
  SceneLoader,
  ShadowGenerator,
  TransformNode,
  KeyboardEventTypes,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { GridMaterial } from '@babylonjs/materials/grid';
import styles from './WorldEditorPage.module.css';

// Types
interface WorldArea {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  name?: string;
}

type ViewMode = 'third-person' | 'first-person' | 'iso';

const WorldEditorPage: React.FC = () => {
  const navigate = useNavigate();

  // Play mode state
  const [playMode, setPlayMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('third-person');

  // Theme state
  const [themeColor] = useState('#10b981');

  // Canvas ref
  const canvas3DRef = useRef<HTMLCanvasElement>(null);

  // Babylon.js refs
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const arcCameraRef = useRef<ArcRotateCamera | null>(null);
  const shadowGeneratorRef = useRef<ShadowGenerator | null>(null);

  // Character refs
  const characterRootRef = useRef<TransformNode | null>(null);
  const idleAnimationRef = useRef<AnimationGroup | null>(null);
  const walkAnimationRef = useRef<AnimationGroup | null>(null);
  const runAnimationRef = useRef<AnimationGroup | null>(null);

  // Play mode camera refs
  const thirdPersonCameraRef = useRef<ArcRotateCamera | null>(null);
  const fpsCameraRef = useRef<UniversalCamera | null>(null);
  const isoCameraRef = useRef<ArcRotateCamera | null>(null);

  // Movement state
  const keysPressed = useRef<Set<string>>(new Set());
  const currentAnimRef = useRef<string>('idle');
  const characterVelocityYRef = useRef<number>(0);
  const isJumpingRef = useRef<boolean>(false);

  // Axis refs (to hide in play mode)
  const axisXRef = useRef<Mesh | null>(null);
  const axisYRef = useRef<Mesh | null>(null);
  const axisZRef = useRef<Mesh | null>(null);

  // Helper function
  const hexToColor3 = (hex: string): Color3 => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return new Color3(
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      );
    }
    return new Color3(0.063, 0.725, 0.506);
  };

  // Initialize Babylon.js 3D scene
  useEffect(() => {
    if (!canvas3DRef.current) return;

    // Create engine
    const engine = new Engine(canvas3DRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    // Create scene
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.1, 0.1, 0.1, 1);
    sceneRef.current = scene;

    // Apply HDRI skybox
    const hdrTexture = CubeTexture.CreateFromPrefilteredData(
      'https://playground.babylonjs.com/textures/environment.env',
      scene
    );
    scene.environmentTexture = hdrTexture;
    scene.createDefaultSkybox(hdrTexture, true, 10000, 0.3, false);

    // Create editor camera (ArcRotateCamera)
    const arcCamera = new ArcRotateCamera(
      'editorCamera',
      -Math.PI / 2,
      Math.PI / 3,
      100,
      new Vector3(0, 0, 0),
      scene
    );
    arcCamera.attachControl(canvas3DRef.current, true);
    arcCamera.lowerRadiusLimit = 10;
    arcCamera.upperRadiusLimit = 500;
    arcCamera.wheelDeltaPercentage = 0.01;
    arcCameraRef.current = arcCamera;

    // Create lights
    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;

    const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -2, -1), scene);
    dirLight.intensity = 0.8;
    dirLight.position = new Vector3(50, 100, 50);

    // Create shadow generator
    const shadowGenerator = new ShadowGenerator(2048, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
    shadowGeneratorRef.current = shadowGenerator;

    // Create infinite grid
    const gridSize = 1000;
    const ground = MeshBuilder.CreateGround('infiniteGrid', {
      width: gridSize,
      height: gridSize,
      subdivisions: 1,
    }, scene);

    const gridMaterial = new GridMaterial('gridMaterial', scene);
    const themeColorObj = hexToColor3(themeColor);
    gridMaterial.majorUnitFrequency = 10;
    gridMaterial.minorUnitVisibility = 0.3;
    gridMaterial.gridRatio = 1;
    gridMaterial.backFaceCulling = false;
    gridMaterial.mainColor = themeColorObj;
    gridMaterial.lineColor = themeColorObj;
    gridMaterial.opacity = 0.98;

    ground.material = gridMaterial;
    ground.position.y = 0;
    ground.receiveShadows = true;
    ground.isPickable = false;

    // Create axis indicator
    const axisLength = 5;
    const axisWidth = 0.1;

    // X axis (red)
    const xAxis = MeshBuilder.CreateCylinder('xAxis', { height: axisLength, diameter: axisWidth }, scene);
    xAxis.rotation.z = Math.PI / 2;
    xAxis.position.x = axisLength / 2;
    const xMat = new StandardMaterial('xMat', scene);
    xMat.diffuseColor = new Color3(1, 0.3, 0.3);
    xMat.emissiveColor = new Color3(0.5, 0.1, 0.1);
    xAxis.material = xMat;
    xAxis.isPickable = false;
    axisXRef.current = xAxis;

    // Y axis (blue)
    const yAxis = MeshBuilder.CreateCylinder('yAxis', { height: axisLength, diameter: axisWidth }, scene);
    yAxis.position.y = axisLength / 2;
    const yMat = new StandardMaterial('yMat', scene);
    yMat.diffuseColor = new Color3(0.3, 0.3, 1);
    yMat.emissiveColor = new Color3(0.1, 0.1, 0.5);
    yAxis.material = yMat;
    yAxis.isPickable = false;
    axisYRef.current = yAxis;

    // Z axis (green)
    const zAxis = MeshBuilder.CreateCylinder('zAxis', { height: axisLength, diameter: axisWidth }, scene);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.position.z = axisLength / 2;
    const zMat = new StandardMaterial('zMat', scene);
    zMat.diffuseColor = new Color3(0.3, 1, 0.3);
    zMat.emissiveColor = new Color3(0.1, 0.5, 0.1);
    zAxis.material = zMat;
    zAxis.isPickable = false;
    axisZRef.current = zAxis;

    // Render loop
    engine.runRenderLoop(() => {
      scene.render();
    });

    // Handle resize
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      scene.dispose();
      engineRef.current = null;
      sceneRef.current = null;
    };
  }, [themeColor]);

  // Play mode effect - load character and setup controls
  useEffect(() => {
    const scene = sceneRef.current;
    const shadowGenerator = shadowGeneratorRef.current;
    const arcCamera = arcCameraRef.current;

    if (!scene) return;

    // Hide/show axis in play mode
    if (axisXRef.current) axisXRef.current.isVisible = !playMode;
    if (axisYRef.current) axisYRef.current.isVisible = !playMode;
    if (axisZRef.current) axisZRef.current.isVisible = !playMode;

    if (!playMode) {
      // Clean up when exiting play mode
      if (characterRootRef.current) {
        characterRootRef.current.dispose();
        characterRootRef.current = null;
      }
      if (thirdPersonCameraRef.current) {
        thirdPersonCameraRef.current.dispose();
        thirdPersonCameraRef.current = null;
      }
      if (fpsCameraRef.current) {
        fpsCameraRef.current.dispose();
        fpsCameraRef.current = null;
      }
      if (isoCameraRef.current) {
        isoCameraRef.current.dispose();
        isoCameraRef.current = null;
      }

      // Switch back to editor camera
      if (arcCamera) {
        scene.activeCamera = arcCamera;
        arcCamera.attachControl(canvas3DRef.current!, true);
      }
      return;
    }

    console.log('[WorldEditor] Play mode activated, loading character...');

    // Load character
    const loadCharacter = async () => {
      try {
        const result = await SceneLoader.ImportMeshAsync(
          '',
          '/animation/moving/',
          'female_walking.glb',
          scene
        );

        // Create character root
        const characterRoot = new TransformNode('characterRoot', scene);
        let minY = Infinity;
        let maxY = -Infinity;

        result.meshes.forEach((mesh) => {
          if (mesh !== result.meshes[0]) {
            mesh.parent = characterRoot;
          }
          if (shadowGenerator) {
            shadowGenerator.addShadowCaster(mesh);
          }
          mesh.receiveShadows = true;

          // Matte material
          if (mesh.material) {
            const mat = mesh.material as any;
            if (mat.metallic !== undefined) {
              mat.metallic = 0;
              mat.roughness = 1.0;
              mat.environmentIntensity = 0.4;
            }
          }

          const boundingInfo = mesh.getBoundingInfo();
          if (boundingInfo) {
            minY = Math.min(minY, boundingInfo.boundingBox.minimumWorld.y);
            maxY = Math.max(maxY, boundingInfo.boundingBox.maximumWorld.y);
          }
        });

        // Scale character to ~1.8m
        const originalHeight = maxY - minY;
        const targetHeight = 1.8;
        const scale = originalHeight > 0 ? targetHeight / originalHeight : 1;
        characterRoot.scaling = new Vector3(scale, scale, scale);

        const groundOffset = -minY * scale;
        characterRoot.position = new Vector3(0, groundOffset, 0);

        characterRootRef.current = characterRoot;

        // Store animations
        result.animationGroups.forEach((anim) => {
          const animName = anim.name.toLowerCase();
          if (animName.includes('idle')) {
            idleAnimationRef.current = anim;
          } else if (animName.includes('walk') && !animName.includes('run')) {
            walkAnimationRef.current = anim;
          } else if (animName.includes('run')) {
            runAnimationRef.current = anim;
          }
          anim.stop();
        });

        // Start idle animation
        if (idleAnimationRef.current) {
          idleAnimationRef.current.start(true);
          currentAnimRef.current = 'idle';
        }

        // Create 3rd person camera - unlocked beta to 180 degrees, angle adjusted
        const thirdPersonCamera = new ArcRotateCamera(
          'thirdPersonCamera',
          -Math.PI / 2,  // alpha (looking from behind)
          1.0,           // beta (~57 degrees - shows full body)
          8,             // radius (distance from character)
          new Vector3(0, 0.5, 0),  // target offset (lowered)
          scene
        );
        thirdPersonCamera.lowerRadiusLimit = 3;
        thirdPersonCamera.upperRadiusLimit = 20;
        thirdPersonCamera.lowerBetaLimit = 0.1;
        thirdPersonCamera.upperBetaLimit = Math.PI - 0.1;  // Unlocked to 180 degrees
        thirdPersonCamera.wheelDeltaPercentage = 0.01;
        thirdPersonCameraRef.current = thirdPersonCamera;

        // Create first-person camera
        const fpsCamera = new UniversalCamera(
          'firstPersonCamera',
          new Vector3(0, 1.7, 0),
          scene
        );
        fpsCamera.minZ = 0.1;
        fpsCameraRef.current = fpsCamera;

        // Create ISO camera - same controls as 3rd person
        const isoCamera = new ArcRotateCamera(
          'isoCamera',
          -Math.PI / 4,  // 45 degrees horizontal
          Math.PI / 4,   // 45 degrees from top
          15,            // further distance
          new Vector3(0, 0.5, 0),
          scene
        );
        isoCamera.lowerRadiusLimit = 5;
        isoCamera.upperRadiusLimit = 30;
        isoCamera.lowerBetaLimit = 0.1;
        isoCamera.upperBetaLimit = Math.PI - 0.1;  // Same as 3rd person
        isoCamera.wheelDeltaPercentage = 0.01;
        isoCameraRef.current = isoCamera;

        // Attach initial camera
        if (arcCamera) {
          arcCamera.detachControl();
        }
        scene.activeCamera = thirdPersonCamera;
        thirdPersonCamera.attachControl(canvas3DRef.current!, true);

        console.log('[WorldEditor] Character loaded, cameras created');
      } catch (error) {
        console.error('[WorldEditor] Failed to load character:', error);
      }
    };

    loadCharacter();

    // Keyboard input handling
    const onKeyboardObservable = scene.onKeyboardObservable.add((kbInfo) => {
      const key = kbInfo.event.key.toLowerCase();

      if (kbInfo.type === KeyboardEventTypes.KEYDOWN) {
        keysPressed.current.add(key);

        // Jump on space
        if (key === ' ' && !isJumpingRef.current) {
          isJumpingRef.current = true;
          characterVelocityYRef.current = 8;
        }
      } else if (kbInfo.type === KeyboardEventTypes.KEYUP) {
        keysPressed.current.delete(key);
      }
    });

    // Movement constants
    const walkSpeed = 4;
    const runSpeed = 8;
    const gravity = -20;

    // Movement update loop
    const updateMovement = () => {
      if (!characterRootRef.current || !playMode) return;

      const character = characterRootRef.current;
      const keys = keysPressed.current;
      const deltaTime = scene.getEngine().getDeltaTime() / 1000;
      const isRunning = keys.has('shift');
      const speed = isRunning ? runSpeed : walkSpeed;

      // Get current view mode's camera for forward direction
      const currentViewMode = viewMode;
      let playCamera: ArcRotateCamera | UniversalCamera | null = null;

      if (currentViewMode === 'first-person') {
        playCamera = fpsCameraRef.current;
      } else if (currentViewMode === 'iso') {
        playCamera = isoCameraRef.current;
      } else {
        playCamera = thirdPersonCameraRef.current;
      }

      // Calculate forward direction based on camera
      let forward: Vector3;
      let right: Vector3;

      if (currentViewMode === 'first-person' && fpsCameraRef.current) {
        // First-person uses camera rotation.y
        const fpsCamera = fpsCameraRef.current;
        const yRotation = fpsCamera.rotation.y;
        forward = new Vector3(Math.sin(yRotation), 0, Math.cos(yRotation));
        right = new Vector3(Math.cos(yRotation), 0, -Math.sin(yRotation));
      } else if (playCamera && playCamera instanceof ArcRotateCamera) {
        // 3rd person and ISO use alpha
        const alpha = playCamera.alpha;
        forward = new Vector3(Math.sin(alpha), 0, Math.cos(alpha));
        right = new Vector3(Math.cos(alpha), 0, -Math.sin(alpha));
      } else {
        forward = new Vector3(0, 0, 1);
        right = new Vector3(1, 0, 0);
      }

      // Calculate movement direction
      let moveX = 0;
      let moveZ = 0;

      if (keys.has('w')) moveZ = 1;
      if (keys.has('s')) moveZ = -1;
      if (keys.has('a')) moveX = -1;
      if (keys.has('d')) moveX = 1;

      const isMoving = moveX !== 0 || moveZ !== 0;

      if (isMoving) {
        const moveDirection = forward.scale(moveZ).add(right.scale(moveX)).normalize();

        // Move character
        character.position.x += moveDirection.x * speed * deltaTime;
        character.position.z += moveDirection.z * speed * deltaTime;

        // Rotate character to face movement direction
        const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
        character.rotation.y = targetAngle;

        // Play walk/run animation
        const targetAnim = isRunning ? 'run' : 'walk';
        if (currentAnimRef.current !== targetAnim) {
          idleAnimationRef.current?.stop();
          walkAnimationRef.current?.stop();
          runAnimationRef.current?.stop();

          if (isRunning && runAnimationRef.current) {
            runAnimationRef.current.start(true);
          } else if (walkAnimationRef.current) {
            walkAnimationRef.current.start(true);
          }
          currentAnimRef.current = targetAnim;
        }
      } else {
        // Play idle animation
        if (currentAnimRef.current !== 'idle') {
          walkAnimationRef.current?.stop();
          runAnimationRef.current?.stop();
          idleAnimationRef.current?.start(true);
          currentAnimRef.current = 'idle';
        }
      }

      // Apply gravity and jump
      characterVelocityYRef.current += gravity * deltaTime;
      character.position.y += characterVelocityYRef.current * deltaTime;

      // Ground collision (simple)
      const groundY = 0;  // Ground level
      if (character.position.y <= groundY) {
        character.position.y = groundY;
        characterVelocityYRef.current = 0;
        isJumpingRef.current = false;
      }

      // Camera follow
      if (currentViewMode === 'first-person' && fpsCameraRef.current) {
        fpsCameraRef.current.position.x = character.position.x;
        fpsCameraRef.current.position.y = character.position.y + 1.7;
        fpsCameraRef.current.position.z = character.position.z;
      } else if (currentViewMode === 'third-person' && thirdPersonCameraRef.current) {
        thirdPersonCameraRef.current.target.x = character.position.x;
        thirdPersonCameraRef.current.target.y = character.position.y + 0.5;
        thirdPersonCameraRef.current.target.z = character.position.z;
      } else if (currentViewMode === 'iso' && isoCameraRef.current) {
        isoCameraRef.current.target.x = character.position.x;
        isoCameraRef.current.target.y = character.position.y + 0.5;
        isoCameraRef.current.target.z = character.position.z;
      }
    };

    scene.registerBeforeRender(updateMovement);

    return () => {
      scene.onKeyboardObservable.remove(onKeyboardObservable);
      scene.unregisterBeforeRender(updateMovement);
      keysPressed.current.clear();
    };
  }, [playMode, viewMode]);

  // Handle view mode change
  const handleViewModeChange = useCallback((newMode: ViewMode) => {
    const scene = sceneRef.current;
    if (!scene) return;

    setViewMode(newMode);

    // Detach all cameras
    thirdPersonCameraRef.current?.detachControl();
    fpsCameraRef.current?.detachControl();
    isoCameraRef.current?.detachControl();

    // Attach new camera
    if (newMode === 'first-person' && fpsCameraRef.current) {
      scene.activeCamera = fpsCameraRef.current;
      fpsCameraRef.current.attachControl(canvas3DRef.current!, true);
    } else if (newMode === 'iso' && isoCameraRef.current) {
      scene.activeCamera = isoCameraRef.current;
      isoCameraRef.current.attachControl(canvas3DRef.current!, true);
    } else if (thirdPersonCameraRef.current) {
      scene.activeCamera = thirdPersonCameraRef.current;
      thirdPersonCameraRef.current.attachControl(canvas3DRef.current!, true);
    }
  }, []);

  return (
    <div className={styles.editorContainer}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>ARCHIPLE WORLD</h1>
        </div>

        <div className={styles.headerCenter}>
          <span>World Editor</span>
        </div>

        <div className={styles.headerRight}>
          <button
            className={`${styles.playBtn} ${playMode ? styles.stopBtn : ''}`}
            onClick={() => setPlayMode(!playMode)}
          >
            {playMode ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                STOP
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                PLAY
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* 3D Canvas */}
        <div className={styles.canvasArea}>
          <canvas ref={canvas3DRef} className={styles.canvas3D} />

          {/* View Mode Toggle - Top Left in Play Mode */}
          {playMode && (
            <div className={styles.playModeControls}>
              <div className={styles.viewModeToggle}>
                <button
                  className={viewMode === 'first-person' ? styles.active : ''}
                  onClick={() => handleViewModeChange('first-person')}
                >
                  1인칭
                </button>
                <button
                  className={viewMode === 'third-person' ? styles.active : ''}
                  onClick={() => handleViewModeChange('third-person')}
                >
                  3인칭
                </button>
                <button
                  className={viewMode === 'iso' ? styles.active : ''}
                  onClick={() => handleViewModeChange('iso')}
                >
                  ISO
                </button>
              </div>

              <div className={styles.controlsHelp}>
                <span>WASD: 이동</span>
                <span>Space: 점프</span>
                <span>Shift: 달리기</span>
                <span>마우스: 카메라</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WorldEditorPage;
