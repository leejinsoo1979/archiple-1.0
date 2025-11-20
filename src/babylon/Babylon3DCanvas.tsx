import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useCameraSettingsStore } from '../stores/cameraSettingsStore';
import { horizontalFovToVertical } from './utils/cameraUtils';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  Vector3,
  MeshBuilder,
  PolygonMeshBuilder,
  PBRMaterial,
  StandardMaterial,
  Color3,
  Color4,
  Texture,
  CubeTexture,
  DirectionalLight,
  PointLight,
  SpotLight,
  ShadowGenerator,
  HemisphericLight,
  GlowLayer,
  VertexData,
  Mesh,
  SceneLoader,
  PointerEventTypes,
  GizmoManager,
  AbstractMesh,
  FollowCamera,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  RenderTargetTexture,
  Constants,
  CSG
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid';
import { SkyMaterial } from '@babylonjs/materials/sky';
import '@babylonjs/loaders/glTF';
import earcut from 'earcut';
import styles from './Babylon3DCanvas.module.css';
import { eventBus } from '../core/events/EventBus';
import { EditorEvents } from '../core/events/EditorEvents';
import {
  findConnectedWalls,
  calculateWallCorners,
  type WallCorners,
} from './utils/WallMiterUtils';
import { createCSGWalls } from './utils/CSGWallBuilder';
import type { Wall } from '../core/types/Wall';
import type { Light, LightType } from '../core/types/Light';
import { createDefaultLight } from '../core/types/Light';

// Make earcut available globally for Babylon.js polygon operations
if (typeof window !== 'undefined') {
  (window as any).earcut = earcut;
}
(PolygonMeshBuilder as any).earcut = earcut;

interface Babylon3DCanvasProps {
  floorplanData?: { points: any[]; walls: any[]; rooms: any[]; doors?: any[]; windows?: any[]; floorplan?: any } | null;
  visible?: boolean;
  sunSettings?: {
    intensity: number;
    azimuth: number;
    altitude: number;
  };
  playMode?: boolean;
  showCharacter?: boolean;
  glbModelFile?: File | null;
  photoRealisticMode?: boolean;
  displayStyle?: 'material' | 'white' | 'sketch' | 'transparent';
  showGrid?: boolean;
  renderSettings?: {
    ssaoRadius: number;
    ssaoStrength: number;
    ssrStrength: number;
    bloomThreshold: number;
    bloomWeight: number;
    dofFocusDistance: number;
    dofFStop: number;
    chromaticAberration: number;
    grainIntensity: number;
    vignetteWeight: number;
    sharpenAmount: number;
  };
  lights?: Light[];
  lightPlacementMode?: boolean;
  selectedLightType?: LightType;
  onLightPlaced?: (light: Light) => void;
  onLightMoved?: (lightId: string, newPosition: { x: number; y: number; z: number }) => void;
  controlMode?: 'touch' | 'joystick';
}

// 2D 좌표(mm)를 Babylon 미터 단위로 변환
// BlueprintToBabylonAdapter already converts pixels to mm
// So we only need MM_TO_METERS conversion here
const MM_TO_METERS = 0.001; // 1mm = 0.001m
const DEFAULT_CAMERA_RADIUS = 8; // 8m orbit distance
const DEFAULT_CAMERA_HEIGHT = 1.7; // 1.7m eye height

interface PlanMetrics {
  centerX: number;
  centerZ: number;
  extentX: number;
  extentZ: number;
  boundingRadius: number;
}

const computePlanMetrics = (points?: any[] | null): PlanMetrics | null => {
  if (!points || points.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  points.forEach((point) => {
    const worldX = point.x * MM_TO_METERS;
    const worldZ = -(point.y * MM_TO_METERS); // Flip Z axis

    if (worldX < minX) minX = worldX;
    if (worldX > maxX) maxX = worldX;
    if (worldZ < minZ) minZ = worldZ;
    if (worldZ > maxZ) maxZ = worldZ;
  });

  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minZ) || !isFinite(maxZ)) {
    return null;
  }

  const extentX = Math.max(maxX - minX, 0.1); // min 0.1m
  const extentZ = Math.max(maxZ - minZ, 0.1);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const boundingRadius = Math.max(extentX, extentZ) * 0.75 + 2; // +2m margin

  return {
    centerX,
    centerZ,
    extentX,
    extentZ,
    boundingRadius,
  };
};

/**
 * Find nearest wall and snap to it if within threshold
 * @param x - Click position X (meters)
 * @param z - Click position Z (meters)
 * @param wallMeshes - Array of wall meshes
 * @returns Snapped position or original position
 */
const findNearestWallSnap = (
  x: number,
  z: number,
  wallMeshes: Mesh[]
): { x: number; z: number } => {
  const SNAP_THRESHOLD = 0.5; // 0.5m = 500mm snap distance

  if (wallMeshes.length === 0) {
    return { x, z };
  }

  let nearestDistance = Infinity;
  let nearestPoint = { x, z };

  wallMeshes.forEach((wallMesh) => {
    // Get wall position (center)
    const wallPos = wallMesh.position;
    const wallX = wallPos.x;
    const wallZ = wallPos.z;

    // Get wall rotation and dimensions (assume wall is aligned with X or Z axis)
    const wallRotation = wallMesh.rotation.y;
    const wallLength = wallMesh.scaling.x; // Length along X when not rotated
    // const wallThickness = wallMesh.scaling.z; // Thickness along Z

    // Determine if wall is horizontal or vertical
    const isVertical = Math.abs(Math.sin(wallRotation)) > 0.5;

    let closestX = x;
    let closestZ = z;

    if (isVertical) {
      // Vertical wall (aligned with Z axis) - snap to X position
      closestX = wallX;
      // Clamp Z to wall length
      const minZ = wallZ - wallLength / 2;
      const maxZ = wallZ + wallLength / 2;
      closestZ = Math.max(minZ, Math.min(maxZ, z));
    } else {
      // Horizontal wall (aligned with X axis) - snap to Z position
      closestZ = wallZ;
      // Clamp X to wall length
      const minX = wallX - wallLength / 2;
      const maxX = wallX + wallLength / 2;
      closestX = Math.max(minX, Math.min(maxX, x));
    }

    // Calculate distance
    const dx = x - closestX;
    const dz = z - closestZ;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = { x: closestX, z: closestZ };
    }
  });

  // Snap if within threshold
  if (nearestDistance <= SNAP_THRESHOLD) {
    console.log('[Wall Snap] Snapped to wall at distance:', nearestDistance.toFixed(3), 'm');
    return nearestPoint;
  }

  // No snap - return original position
  return { x, z };
};

type Babylon3DCanvasRef = { captureRender: (width: number, height: number) => Promise<string> };

const Babylon3DCanvas = forwardRef(function Babylon3DCanvas(
  {
    floorplanData,
    visible = true,
    sunSettings,
    playMode = false,
    showCharacter = false,
    glbModelFile,
    photoRealisticMode = false,
    displayStyle = 'material',
    showGrid = true,
    renderSettings,
    lights = [],
    lightPlacementMode = false,
    selectedLightType = 'point',
    onLightPlaced,
    onLightMoved,
    controlMode = 'touch'
  }: Babylon3DCanvasProps,
  ref: React.ForwardedRef<Babylon3DCanvasRef>
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const arcCameraRef = useRef<ArcRotateCamera | null>(null);
  const fpsCameraRef = useRef<UniversalCamera | null>(null);
  const thirdPersonCameraRef = useRef<FollowCamera | null>(null);
  const characterRef = useRef<AbstractMesh | null>(null);
  // const animationsRef = useRef<AnimationGroup[]>([]);
  const loadedModelRef = useRef<AbstractMesh | null>(null); // Store loaded GLB model
  const wallMeshesRef = useRef<Mesh[]>([]); // Store wall meshes for snap detection
  const pipelineRef = useRef<DefaultRenderingPipeline | null>(null); // Store rendering pipeline
  const gizmoManagerRef = useRef<GizmoManager | null>(null); // Store gizmo manager
  const selectedLightMeshRef = useRef<Mesh | null>(null); // Store selected light indicator mesh
  const infiniteGridRef = useRef<Mesh | null>(null); // Store infinite grid mesh

  // Camera settings from Zustand store
  const cameraSettings = useCameraSettingsStore();

  // Expose captureRender function via ref
  useImperativeHandle(ref, () => ({
    captureRender: async (width: number, height: number): Promise<string> => {
      const scene = sceneRef.current;
      const engine = engineRef.current;
      const sunLight = sunLightRef.current;

      if (!scene || !engine) {
        throw new Error('Scene or Engine not initialized');
      }

      console.log(`[Babylon3DCanvas] 🎨 Starting ULTRA-QUALITY rendering at ${width}x${height}...`);

      return new Promise((resolve, reject) => {
        try {
          const camera = scene.activeCamera;
          if (!camera) {
            reject(new Error('No active camera'));
            return;
          }

          // ===== STEP 1: Save current settings =====
          const shadowGen = sunLight?.getShadowGenerator() as ShadowGenerator | null;
          const originalShadowMapSize = shadowGen?.mapSize || 4096;
          const originalShadowBlurKernel = shadowGen?.blurKernel || 64;
          const originalEnvIntensity = scene.environmentIntensity;

          console.log('[Babylon3DCanvas] 📋 Saved original settings');

          // ===== STEP 2: Apply ULTRA-QUALITY settings =====
          if (shadowGen) {
            shadowGen.mapSize = 16384; // Ultra 16K shadow maps
            shadowGen.blurKernel = 256; // Maximum blur for ultra-soft shadows
            shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
            console.log('[Babylon3DCanvas] ✅ Shadow quality: 16K ultra-quality');
          }

          // Boost environment reflections
          scene.environmentIntensity = 2.0;

          // Boost all material quality
          scene.meshes.forEach(mesh => {
            if (mesh.material && mesh.material instanceof PBRMaterial) {
              const mat = mesh.material as PBRMaterial;
              mat.environmentIntensity = Math.max(mat.environmentIntensity, 1.0);
            }
          });

          console.log('[Babylon3DCanvas] ✅ Material quality boosted');

          // Create high-resolution RenderTargetTexture with multi-sampling
          const renderTarget = new RenderTargetTexture(
            'highResRender',
            { width, height },
            scene,
            false, // generateMipMaps
            true, // doNotChangeAspectRatio
            Constants.TEXTURETYPE_UNSIGNED_INT,
            false, // isCube
            Constants.TEXTURE_BILINEAR_SAMPLINGMODE, // Changed to bilinear for better quality
            true, // generateDepthBuffer
            false, // generateStencilBuffer
            false, // isMulti
            Constants.TEXTUREFORMAT_RGBA,
            false // delayAllocation
          );

          // Enable 8x MSAA for ultra-smooth edges
          renderTarget.samples = 8;

          console.log(`[Babylon3DCanvas] 📐 RenderTargetTexture created: ${width}x${height} with 8x MSAA`);

          // Set active camera
          renderTarget.activeCamera = camera;

          // Render all meshes except grid (hide grid for clean render)
          const gridMesh = infiniteGridRef.current;
          const originalGridVisibility = gridMesh?.isVisible;
          if (gridMesh) {
            gridMesh.isVisible = false;
          }

          renderTarget.renderList = scene.meshes.filter(m => m !== gridMesh);

          console.log('[Babylon3DCanvas] 🎬 Starting render...');

          // Render once
          renderTarget.onAfterRenderObservable.addOnce(async () => {
            // Read pixels from render target - need to use scene.getEngine()
            const textureSize = renderTarget.getSize();
            console.log(`[Babylon3DCanvas] RenderTarget actual size: ${textureSize.width}x${textureSize.height}`);

            // Read pixels
            const pixels = await engine.readPixels(0, 0, textureSize.width, textureSize.height, true);

            // Create canvas to convert pixels to image
            const canvas = document.createElement('canvas');
            canvas.width = textureSize.width;
            canvas.height = textureSize.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              renderTarget.dispose();
              reject(new Error('Failed to create canvas context'));
              return;
            }

            // Create ImageData from pixels
            const imageData = ctx.createImageData(textureSize.width, textureSize.height);
            imageData.data.set(new Uint8ClampedArray(pixels.buffer));
            ctx.putImageData(imageData, 0, 0);

            // Convert to blob and then data URL
            canvas.toBlob((blob) => {
              if (!blob) {
                renderTarget.dispose();
                reject(new Error('Failed to create blob from canvas'));
                return;
              }

              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result as string;
                console.log(`[Babylon3DCanvas] ✅ ULTRA-QUALITY render completed (${width}x${height})`);

                // ===== STEP 3: Restore original settings =====
                if (shadowGen) {
                  shadowGen.mapSize = originalShadowMapSize;
                  shadowGen.blurKernel = originalShadowBlurKernel;
                  console.log('[Babylon3DCanvas] 🔄 Shadow settings restored');
                }

                scene.environmentIntensity = originalEnvIntensity;

                // Restore grid visibility
                if (gridMesh && originalGridVisibility !== undefined) {
                  gridMesh.isVisible = originalGridVisibility;
                }

                // Restore material settings
                scene.meshes.forEach(mesh => {
                  if (mesh.material && mesh.material instanceof PBRMaterial) {
                    const mat = mesh.material as PBRMaterial;
                    if (mat.name.includes('wallMat')) {
                      mat.environmentIntensity = 0.7;
                    } else if (mat.name.includes('floorMat')) {
                      mat.environmentIntensity = 0.6;
                    } else if (mat.name.includes('ceilingMat')) {
                      mat.environmentIntensity = 0.7;
                    }
                  }
                });

                console.log('[Babylon3DCanvas] 🔄 All settings restored');

                // Clean up
                renderTarget.dispose();
                resolve(dataUrl);
              };
              reader.onerror = () => {
                // Restore settings even on error
                if (shadowGen) {
                  shadowGen.mapSize = originalShadowMapSize;
                  shadowGen.blurKernel = originalShadowBlurKernel;
                }
                scene.environmentIntensity = originalEnvIntensity;
                if (gridMesh && originalGridVisibility !== undefined) {
                  gridMesh.isVisible = originalGridVisibility;
                }

                renderTarget.dispose();
                reject(new Error('Failed to read blob as data URL'));
              };
              reader.readAsDataURL(blob);
            }, 'image/png', 1.0); // Quality 1.0 for maximum PNG quality
          });

          // Trigger render
          scene.incrementRenderId();
          scene.resetCachedMaterial();
          renderTarget.render(false, false);
        } catch (error) {
          console.error('[Babylon3DCanvas] ❌ Render capture failed:', error);
          reject(error);
        }
      });
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent double initialization
    if (engineRef.current || sceneRef.current) {
      console.log('[Babylon3DCanvas] Already initialized, skipping...');
      return;
    }

    console.log('[Babylon3DCanvas] Initializing Babylon.js...');

    const initScene = () => {
      // Create engine with high-performance GPU preference
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        powerPreference: 'high-performance', // Request dedicated GPU if available
      });
      engineRef.current = engine;

      console.log('[Babylon3DCanvas] WebGL Info:', {
        renderer: engine.isWebGPU ? 'WebGPU' : 'WebGL',
        version: engine.webGLVersion,
        // GPU info (if available)
        vendor: (canvas.getContext('webgl2') as any)?.getParameter((canvas.getContext('webgl2') as any)?.VENDOR),
        renderer_name: (canvas.getContext('webgl2') as any)?.getParameter((canvas.getContext('webgl2') as any)?.RENDERER),
      });

      // Create scene with advanced settings
      const scene = new Scene(engine);
      // Remove clearColor to show skybox (skybox will provide background)
      scene.clearColor = new Color3(0.5, 0.7, 1.0).toColor4(0); // Transparent - skybox shows through
      scene.ambientColor = new Color3(0.3, 0.3, 0.3);
      scene.collisionsEnabled = true; // Enable collisions for FPS mode
      scene.gravity = new Vector3(0, 0, 0); // No gravity in FPS mode
      sceneRef.current = scene;

      // Enable glow layer for better visuals
      const glowLayer = new GlowLayer('glow', scene);
      glowLayer.intensity = 0.3;

      // Create ArcRotate camera (default 3D view)
      const arcCamera = new ArcRotateCamera(
        'arcCamera',
        -Math.PI / 4,
        Math.PI / 3.5,
        DEFAULT_CAMERA_RADIUS,
        new Vector3(0, DEFAULT_CAMERA_HEIGHT, 0),
        scene
      );
      arcCamera.attachControl(canvas, true);
      arcCamera.lowerRadiusLimit = 0.5;
      arcCamera.upperRadiusLimit = 50;
      arcCamera.upperBetaLimit = Math.PI / 2.05;
      arcCamera.wheelPrecision = 20;
      arcCamera.panningSensibility = 200;
      arcCamera.inertia = 0.9;
      arcCamera.angularSensibilityX = 1000;
      arcCamera.angularSensibilityY = 1000;
      arcCameraRef.current = arcCamera;

      // Create FPS camera (first-person view)
      const fpsCamera = new UniversalCamera(
        'fpsCamera',
        new Vector3(0, DEFAULT_CAMERA_HEIGHT, 0),
        scene
      );
      fpsCamera.fov = 1.3; // 75 degrees (default 0.8 = 45 degrees is too narrow)
      fpsCamera.minZ = 0.05; // Near clipping plane: 5cm (prevent objects from disappearing when close)
      fpsCamera.maxZ = 1000; // Far clipping plane: 1000m
      fpsCamera.speed = 0.08; // Movement speed (meters/sec)
      fpsCamera.angularSensibility = 2000; // Mouse sensitivity

      // Set WASD keys (key codes)
      fpsCamera.keysUp = [87]; // W
      fpsCamera.keysDown = [83]; // S
      fpsCamera.keysLeft = [65]; // A
      fpsCamera.keysRight = [68]; // D

      fpsCamera.checkCollisions = true;
      fpsCamera.applyGravity = false;
      fpsCamera.ellipsoid = new Vector3(0.2, 0.85, 0.2); // Collision ellipsoid (radius in meters)

      console.log('[Babylon3DCanvas] FPS Camera created with keys:', {
        keysUp: fpsCamera.keysUp,
        keysDown: fpsCamera.keysDown,
        keysLeft: fpsCamera.keysLeft,
        keysRight: fpsCamera.keysRight,
        speed: fpsCamera.speed
      });

      fpsCameraRef.current = fpsCamera;

      // Create 3rd Person Follow Camera
      const thirdPersonCamera = new FollowCamera(
        'thirdPersonCamera',
        new Vector3(0, DEFAULT_CAMERA_HEIGHT, -3), // Behind character
        scene
      );
      thirdPersonCamera.radius = 3; // Distance from character (3m)
      thirdPersonCamera.heightOffset = 1.5; // Camera height offset
      thirdPersonCamera.rotationOffset = 0; // No rotation offset
      thirdPersonCamera.cameraAcceleration = 0.05; // Smooth follow
      thirdPersonCamera.maxCameraSpeed = 10; // Max speed
      thirdPersonCameraRef.current = thirdPersonCamera;

      // Set default camera
      scene.activeCamera = arcCamera;

      // Advanced lighting setup
      // 1. Ambient light
      const hemisphericLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
      hemisphericLight.intensity = 0.7;
      hemisphericLight.groundColor = new Color3(0.5, 0.5, 0.55);

      // 2. Main directional light (sun) with shadows
      const azimuth = sunSettings?.azimuth ?? 45;
      const altitude = sunSettings?.altitude ?? 45;
      const intensity = sunSettings?.intensity ?? 1.5;

      // Convert azimuth/altitude to 3D position (in mm)
      const radius = 50; // 50m
      const azimuthRad = (azimuth * Math.PI) / 180;
      const altitudeRad = (altitude * Math.PI) / 180;

      const x = radius * Math.cos(altitudeRad) * Math.sin(azimuthRad);
      const y = radius * Math.sin(altitudeRad);
      const z = radius * Math.cos(altitudeRad) * Math.cos(azimuthRad);

      const sunLight = new DirectionalLight('sunLight', new Vector3(-1, -2, -1), scene);
      sunLight.position = new Vector3(x, y, z);
      sunLight.intensity = intensity;
      sunLight.diffuse = new Color3(1, 1, 1);
      sunLight.specular = new Color3(1, 1, 1);
      sunLightRef.current = sunLight;

      // Shadow generator with maximum quality
      const shadowGenerator = new ShadowGenerator(4096, sunLight); // Increased from 2048 to 4096
      shadowGenerator.useBlurExponentialShadowMap = true;
      shadowGenerator.blurKernel = 64; // Increased from 32 to 64 for smoother shadows
      shadowGenerator.darkness = 0.3;
      shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;

      // Create infinite grid floor
      const createInfiniteGrid = () => {
        // Create large ground plane (1000m x 1000m - fixed at origin)
        const gridPlane = MeshBuilder.CreateGround(
          'infiniteGrid',
          { width: 1000, height: 1000 },
          scene
        );
        gridPlane.position = new Vector3(0, -0.01, 0); // Fixed at origin, slightly below Y=0

        // Create GridMaterial with realistic settings
        const gridMaterial = new GridMaterial('gridMaterial', scene);

        // Grid appearance - natural look
        gridMaterial.mainColor = new Color3(1, 1, 1); // White background
        gridMaterial.lineColor = new Color3(0.4, 0.4, 0.4); // Dark gray lines

        // Grid spacing - 1 unit = 1 meter
        gridMaterial.gridRatio = 1.0; // 1m grid cells
        gridMaterial.majorUnitFrequency = 10; // Major line every 10 cells (10m)
        gridMaterial.minorUnitVisibility = 0.3; // Minor lines at 30% opacity

        // Fade out with distance
        gridMaterial.opacity = 0.95; // Overall opacity
        gridMaterial.gridOffset = new Vector3(0, 0, 0);

        // Apply material
        gridPlane.material = gridMaterial;

        // Enable shadow receiving
        gridPlane.receiveShadows = true;

        // Disable collisions (don't interfere with character movement)
        gridPlane.checkCollisions = false;

        // Lower render priority so it renders below everything else
        gridPlane.renderingGroupId = 0;

        console.log('[Babylon3DCanvas] Infinite grid floor created at origin');

        return gridPlane;
      };

      infiniteGridRef.current = createInfiniteGrid();

      // Create outdoor skybox with clouds
      const createSkybox = () => {
        // Create large skybox (1000m cube)
        const skybox = MeshBuilder.CreateBox(
          'skybox',
          { size: 1000 },
          scene
        );

        // Create sky material with clouds
        const skyMaterial = new SkyMaterial('skyMaterial', scene);

        // CRITICAL: Disable backface culling to see inside of box
        skyMaterial.backFaceCulling = false;

        // Realistic sky appearance settings
        skyMaterial.turbidity = 3; // Clear sky (1-20, lower = clearer)
        skyMaterial.luminance = 1.0; // Overall brightness (0-1)
        skyMaterial.rayleigh = 3.0; // Strong blue sky scattering (0-4)
        skyMaterial.mieCoefficient = 0.003; // Subtle cloud scattering (0-0.1)
        skyMaterial.mieDirectionalG = 0.82; // Cloud sharpness (0-1)
        skyMaterial.useSunPosition = true; // Use sun position for realistic lighting

        // Sun position for lighting (matches directional light)
        const azimuth = sunSettings?.azimuth ?? 45;
        const altitude = sunSettings?.altitude ?? 45;

        // Convert to 3D position for realistic sun position
        const azimuthRad = (azimuth * Math.PI) / 180;
        const altitudeRad = (altitude * Math.PI) / 180;

        const sunX = Math.cos(altitudeRad) * Math.sin(azimuthRad);
        const sunY = Math.sin(altitudeRad);
        const sunZ = Math.cos(altitudeRad) * Math.cos(azimuthRad);

        skyMaterial.sunPosition = new Vector3(sunX, sunY, sunZ);

        // Apply material
        skybox.material = skyMaterial;

        // Render skybox first (behind everything)
        skybox.renderingGroupId = 0;
        skybox.infiniteDistance = true; // Always at infinite distance

        // Disable interactions
        skybox.isPickable = false;
        skybox.checkCollisions = false;

        console.log('[Babylon3DCanvas] Outdoor skybox created with clouds');

        return skybox;
      };

      createSkybox();

      // Create realistic human character
      const createCharacter = () => {
        const character = MeshBuilder.CreateBox('characterRoot', { size: 0.01 }, scene);
        character.position = new Vector3(0, 0, 0);
        character.isVisible = false; // Root is invisible

        // Body proportions (realistic human)
        const headRadius = 0.12; // Head ~24cm diameter
        const bodyHeight = 0.6; // Torso ~60cm
        const bodyWidth = 0.4; // Shoulders ~40cm
        const armLength = 0.6; // Arms ~60cm
        const legLength = 0.9; // Legs ~90cm
        const totalHeight = headRadius * 2 + bodyHeight + legLength; // ~1.74m

        // Skin color
        const skinMat = new PBRMaterial('skinMat', scene);
        skinMat.albedoColor = new Color3(0.95, 0.76, 0.65); // Skin tone
        skinMat.metallic = 0;
        skinMat.roughness = 0.7;

        // Clothing color
        const clothMat = new PBRMaterial('clothMat', scene);
        clothMat.albedoColor = new Color3(0.2, 0.3, 0.5); // Blue shirt
        clothMat.metallic = 0;
        clothMat.roughness = 0.8;

        const pantsMat = new PBRMaterial('pantsMat', scene);
        pantsMat.albedoColor = new Color3(0.15, 0.15, 0.2); // Dark pants
        pantsMat.metallic = 0;
        pantsMat.roughness = 0.9;

        // Head (sphere)
        const head = MeshBuilder.CreateSphere('head', { diameter: headRadius * 2 }, scene);
        head.position.y = totalHeight - headRadius;
        head.material = skinMat;
        head.parent = character;
        shadowGenerator.addShadowCaster(head);

        // Torso (box)
        const torso = MeshBuilder.CreateBox('torso', {
          width: bodyWidth,
          height: bodyHeight,
          depth: 0.2
        }, scene);
        torso.position.y = legLength + bodyHeight / 2;
        torso.material = clothMat;
        torso.parent = character;
        shadowGenerator.addShadowCaster(torso);

        // Left arm
        const leftArm = MeshBuilder.CreateCylinder('leftArm', {
          diameter: 0.08,
          height: armLength
        }, scene);
        leftArm.position.set(-bodyWidth / 2 - 0.05, legLength + bodyHeight - armLength / 2, 0);
        leftArm.material = skinMat;
        leftArm.parent = character;
        shadowGenerator.addShadowCaster(leftArm);

        // Right arm
        const rightArm = MeshBuilder.CreateCylinder('rightArm', {
          diameter: 0.08,
          height: armLength
        }, scene);
        rightArm.position.set(bodyWidth / 2 + 0.05, legLength + bodyHeight - armLength / 2, 0);
        rightArm.material = skinMat;
        rightArm.parent = character;
        shadowGenerator.addShadowCaster(rightArm);

        // Left leg
        const leftLeg = MeshBuilder.CreateCylinder('leftLeg', {
          diameter: 0.12,
          height: legLength
        }, scene);
        leftLeg.position.set(-0.1, legLength / 2, 0);
        leftLeg.material = pantsMat;
        leftLeg.parent = character;
        shadowGenerator.addShadowCaster(leftLeg);

        // Right leg
        const rightLeg = MeshBuilder.CreateCylinder('rightLeg', {
          diameter: 0.12,
          height: legLength
        }, scene);
        rightLeg.position.set(0.1, legLength / 2, 0);
        rightLeg.material = pantsMat;
        rightLeg.parent = character;
        shadowGenerator.addShadowCaster(rightLeg);

        // Enable collisions
        character.checkCollisions = true;
        character.ellipsoid = new Vector3(0.3, totalHeight / 2, 0.3);

        characterRef.current = character;
        console.log('[Babylon3DCanvas] Created realistic human character (height: 1.74m)');

        return character;
      };

      createCharacter();

      // Render loop
      // Create GizmoManager for light manipulation
      // Create GizmoManager for light manipulation
      const gizmoManager = new GizmoManager(scene);
      gizmoManager.positionGizmoEnabled = true;
      gizmoManager.rotationGizmoEnabled = false;
      gizmoManager.scaleGizmoEnabled = false;
      gizmoManager.boundingBoxGizmoEnabled = false;
      gizmoManager.usePointerToAttachGizmos = false; // Manual attachment
      gizmoManager.clearGizmoOnEmptyPointerEvent = true; // Auto-deselect

      // Make gizmo bigger and easier to grab
      if (gizmoManager.gizmos.positionGizmo) {
        gizmoManager.gizmos.positionGizmo.scaleRatio = 2.0;
      }

      gizmoManagerRef.current = gizmoManager;

      engine.runRenderLoop(() => {
        scene.render();
      });

      // Handle resize
      const handleResize = () => {
        engine.resize();
        console.log('[Babylon3DCanvas] Resized:', canvas.width, 'x', canvas.height);
      };
      window.addEventListener('resize', handleResize);

      // Handle fullscreen changes (aspect ratio fix)
      const handleFullscreenChange = () => {
        setTimeout(() => {
          engine.resize();
          console.log('[Babylon3DCanvas] Fullscreen changed, resized:', canvas.width, 'x', canvas.height);
        }, 100);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);

      console.log('[Babylon3DCanvas] Initialized successfully');

      // Cleanup
      return () => {
        console.log('[Babylon3DCanvas] Cleaning up...');
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        scene.dispose();
        engine.dispose();
      };
    };

    initScene();
  }, []);

  /**
   * Miter Joint 적용된 벽 mesh 생성
   *
   * @param corners 4개 코너 (mm 단위)
   * @param height 벽 높이 (mm 단위)
   * @param centerX, centerZ 중심점 offset (meters)
   * @param name mesh 이름
   * @param scene Babylon scene
   * @param startHeight 시작 높이 (mm 단위, 기본값 0 = 바닥부터)
   */
  const createWallMeshFromCorners = (
    corners: WallCorners,
    height: number,
    centerX: number,
    centerZ: number,
    name: string,
    scene: Scene,
    startHeight: number = 0,
    skipTopFace: boolean = false,
    skipBottomFace: boolean = false
  ): Mesh => {
    const MM_TO_METERS = 0.001;
    const wallHeight = height * MM_TO_METERS;
    const wallStartHeight = startHeight * MM_TO_METERS;

    // 코너를 meters로 변환하고 중심점 offset 적용
    const toMeters = (x: number, z: number) => ({
      x: x * MM_TO_METERS - centerX,
      z: -(z * MM_TO_METERS) - centerZ, // Z축 반전
    });

    const c1 = toMeters(corners.startLeft.x, corners.startLeft.z);
    const c2 = toMeters(corners.endLeft.x, corners.endLeft.z);
    const c3 = toMeters(corners.endRight.x, corners.endRight.z);
    const c4 = toMeters(corners.startRight.x, corners.startRight.z);

    // VertexData로 직접 mesh 생성
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    // 바닥 4개 vertex (y=wallStartHeight) - 흰색
    positions.push(c1.x, wallStartHeight, c1.z); // 0
    colors.push(1, 1, 1, 1);
    positions.push(c2.x, wallStartHeight, c2.z); // 1
    colors.push(1, 1, 1, 1);
    positions.push(c3.x, wallStartHeight, c3.z); // 2
    colors.push(1, 1, 1, 1);
    positions.push(c4.x, wallStartHeight, c4.z); // 3
    colors.push(1, 1, 1, 1);

    // 측면용 윗 vertex 4개 (y=wallStartHeight+wallHeight) - 흰색 (측면에 그라데이션 방지)
    const topY = wallStartHeight + wallHeight;
    positions.push(c1.x, topY, c1.z); // 4
    colors.push(1, 1, 1, 1);
    positions.push(c2.x, topY, c2.z); // 5
    colors.push(1, 1, 1, 1);
    positions.push(c3.x, topY, c3.z); // 6
    colors.push(1, 1, 1, 1);
    positions.push(c4.x, topY, c4.z); // 7
    colors.push(1, 1, 1, 1);

    // 천장 단면용 vertex 4개 (y=wallStartHeight+wallHeight)
    // 천장 단면은 항상 검정색 (startHeight 상관없이)
    const topFaceColor = 0;
    positions.push(c1.x, topY, c1.z); // 8
    colors.push(topFaceColor, topFaceColor, topFaceColor, 1);
    positions.push(c2.x, topY, c2.z); // 9
    colors.push(topFaceColor, topFaceColor, topFaceColor, 1);
    positions.push(c3.x, topY, c3.z); // 10
    colors.push(topFaceColor, topFaceColor, topFaceColor, 1);
    positions.push(c4.x, topY, c4.z); // 11
    colors.push(topFaceColor, topFaceColor, topFaceColor, 1);

    // Indices
    // 바닥 (시계방향) - skipBottomFace가 false일 때만 생성
    if (!skipBottomFace) {
      indices.push(0, 2, 1);
      indices.push(0, 3, 2);
    }

    // 천장 단면 (반시계방향) - skipTopFace가 false일 때만 생성
    if (!skipTopFace) {
      indices.push(8, 9, 10);
      indices.push(8, 10, 11);
    }

    // 측면 4개 - 흰색 vertex 사용 (4-7)
    // Left side (0-1-5-4)
    indices.push(0, 1, 5);
    indices.push(0, 5, 4);

    // Front side (1-2-6-5)
    indices.push(1, 2, 6);
    indices.push(1, 6, 5);

    // Right side (2-3-7-6)
    indices.push(2, 3, 7);
    indices.push(2, 7, 6);

    // Back side (3-0-4-7)
    indices.push(3, 0, 4);
    indices.push(3, 4, 7);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.colors = colors;

    // Normals 자동 계산
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;

    const mesh = new Mesh(name, scene);
    vertexData.applyToMesh(mesh);

    // 얇은 그레이 윤곽선 추가 (도어 관련 세그먼트 제외)
    // skipTopFace=true: 도어 개구부 하단 세그먼트
    // skipBottomFace=true: 인방 (도어 위)
    if (!skipTopFace && !skipBottomFace) {
      mesh.enableEdgesRendering();
      mesh.edgesWidth = 1.0; // 얇은 선
      mesh.edgesColor = new Color4(0.5, 0.5, 0.5, 1); // 그레이색
    }

    return mesh;
  };

  /**
   * 사실적인 도어 mesh 생성 (문틀, 문짝, 손잡이 포함)
   *
   * @param position 도어 위치 (벽 상의 0-1 normalized position)
   * @param wallStart 벽 시작점 (mm)
   * @param wallEnd 벽 끝점 (mm)
   * @param wallThickness 벽 두께 (mm)
   * @param centerX, centerZ 중심점 offset (meters)
   * @param name mesh 이름
   * @param scene Babylon scene
   */
  const createDoorMesh = (
    position: number,
    wallStart: { x: number; y: number },
    wallEnd: { x: number; y: number },
    wallThickness: number,
    centerX: number,
    centerZ: number,
    name: string,
    scene: Scene,
    swing: 'left' | 'right' | 'double' = 'right'
  ): { doorGroup: Mesh; doorLeaf: Mesh; hotspot: Mesh } => {
    const MM_TO_METERS = 0.001;
    const DOOR_WIDTH = 900; // 900mm
    const DOOR_HEIGHT = 2050; // 2050mm
    const FRAME_DEPTH = 40; // 문틀 깊이 40mm
    const FRAME_WIDTH = 50; // 문틀 너비 50mm

    // 벽 방향 계산
    const dx = wallEnd.x - wallStart.x;
    const dy = wallEnd.y - wallStart.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    const wallDir = { x: dx / wallLength, y: dy / wallLength };

    // 도어 중심 위치 (mm 단위)
    const doorCenterMM = {
      x: wallStart.x + wallDir.x * position * wallLength,
      y: wallStart.y + wallDir.y * position * wallLength
    };

    // meters로 변환
    const doorCenter3D = new Vector3(
      doorCenterMM.x * MM_TO_METERS - centerX,
      DOOR_HEIGHT * MM_TO_METERS / 2,
      -(doorCenterMM.y * MM_TO_METERS) - centerZ
    );

    // 도어 회전 (벽 방향) - Z축 반전 고려, 90도 보정
    const doorRotationY = Math.atan2(wallDir.x, -wallDir.y) + Math.PI / 2;

    // 도어 그룹 (회전 pivot)
    const doorGroup = new Mesh(`${name}_group`, scene);
    doorGroup.position = doorCenter3D;
    doorGroup.rotation.y = doorRotationY;

    // === 문틀 (Frame) ===
    const frameMaterial = new PBRMaterial(`${name}_frameMat`, scene);
    frameMaterial.albedoColor = new Color3(1, 1, 1); // 흰색
    frameMaterial.metallic = 0;
    frameMaterial.roughness = 0.7;

    // 좌측 문틀
    const leftFrame = MeshBuilder.CreateBox(`${name}_leftFrame`, {
      width: FRAME_WIDTH * MM_TO_METERS,
      height: DOOR_HEIGHT * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    leftFrame.position.x = -(DOOR_WIDTH / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    leftFrame.material = frameMaterial;
    leftFrame.parent = doorGroup;

    // 우측 문틀
    const rightFrame = MeshBuilder.CreateBox(`${name}_rightFrame`, {
      width: FRAME_WIDTH * MM_TO_METERS,
      height: DOOR_HEIGHT * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    rightFrame.position.x = (DOOR_WIDTH / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    rightFrame.material = frameMaterial;
    rightFrame.parent = doorGroup;

    // 상단 문틀
    const topFrame = MeshBuilder.CreateBox(`${name}_topFrame`, {
      width: (DOOR_WIDTH + FRAME_WIDTH * 2) * MM_TO_METERS,
      height: FRAME_WIDTH * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    topFrame.position.y = (DOOR_HEIGHT / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    topFrame.material = frameMaterial;
    topFrame.parent = doorGroup;

    // === 문짝 (Door Leaf) - 경첩을 pivot으로 회전 ===
    const doorLeafMaterial = new PBRMaterial(`${name}_leafMat`, scene);
    doorLeafMaterial.albedoColor = new Color3(1, 1, 1); // 흰색
    doorLeafMaterial.metallic = 0;
    doorLeafMaterial.roughness = 0.5;

    // 경첩 위치 및 문짝 방향 (swing에 따라)
    const isLeftHinge = swing === 'left';
    const hingeX = isLeftHinge ? -(DOOR_WIDTH / 2) : (DOOR_WIDTH / 2);
    const panelOffsetX = isLeftHinge ? (DOOR_WIDTH / 2) : -(DOOR_WIDTH / 2);

    // 문짝 pivot (경첩 위치)
    const doorLeaf = new Mesh(`${name}_leaf`, scene);
    doorLeaf.position.x = hingeX * MM_TO_METERS;
    doorLeaf.parent = doorGroup;

    // 문짝 본체
    const doorPanel = MeshBuilder.CreateBox(`${name}_panel`, {
      width: DOOR_WIDTH * MM_TO_METERS,
      height: DOOR_HEIGHT * MM_TO_METERS,
      depth: FRAME_DEPTH * MM_TO_METERS
    }, scene);
    doorPanel.position.x = panelOffsetX * MM_TO_METERS;
    doorPanel.material = doorLeafMaterial;
    doorPanel.parent = doorLeaf;

    // 손잡이 (경첩 반대편) - doorLeaf 로컬 좌표
    const handleMaterial = new PBRMaterial(`${name}_handleMat`, scene);
    handleMaterial.albedoColor = new Color3(0.7, 0.7, 0.7); // 은색
    handleMaterial.metallic = 0.8;
    handleMaterial.roughness = 0.2;

    // doorLeaf pivot이 경첩 위치이므로, 손잡이는 경첩에서 멀리 떨어진 곳
    // left: pivot에서 +방향 (오른쪽), right: pivot에서 -방향 (왼쪽)
    const handleLocalX = isLeftHinge ? (DOOR_WIDTH * 0.85) : -(DOOR_WIDTH * 0.85);
    const handle = MeshBuilder.CreateCylinder(`${name}_handle`, {
      diameter: 20 * MM_TO_METERS,
      height: 120 * MM_TO_METERS
    }, scene);
    handle.rotation.z = Math.PI / 2; // 수평으로 회전
    handle.position.set(
      handleLocalX * MM_TO_METERS,
      0, // 중간 높이
      (FRAME_DEPTH / 2 + 15) * MM_TO_METERS // 문 앞쪽
    );
    handle.material = handleMaterial;
    handle.parent = doorLeaf;

    // === 호버 핫스팟 (작은 초록색 구) ===
    const hotspotMaterial = new PBRMaterial(`${name}_hotspotMat`, scene);
    hotspotMaterial.albedoColor = new Color3(0.25, 0.68, 0.48); // 초록색 #3fae7a
    hotspotMaterial.emissiveColor = new Color3(0.25, 0.68, 0.48);
    hotspotMaterial.alpha = 0; // 초기에는 숨김

    const hotspot = MeshBuilder.CreateSphere(`${name}_hotspot`, {
      diameter: 0.1
    }, scene);
    hotspot.position.set(
      handleLocalX * MM_TO_METERS,
      0,
      (FRAME_DEPTH / 2 + 60) * MM_TO_METERS
    );
    hotspot.material = hotspotMaterial;
    hotspot.isPickable = true;
    hotspot.parent = doorLeaf;

    // 문짝 초기 상태 (닫힘)
    doorLeaf.rotation.y = 0;
    doorLeaf.metadata = {
      isOpen: false,
      swing: swing, // 열림방향 저장
      hotspot: hotspot // hotspot 메쉬 참조 저장
    };

    console.log('[Babylon3DCanvas] Created door:', name, 'at position', doorCenter3D);

    return { doorGroup, doorLeaf, hotspot };
  };

  /**
   * 사실적인 슬라이딩 창문 mesh 생성 (창틀, 유리창 2개, 손잡이 포함)
   *
   * @param position 창문 위치 (벽 상의 0-1 normalized position)
   * @param wallStart 벽 시작점 (mm)
   * @param wallEnd 벽 끝점 (mm)
   * @param wallThickness 벽 두께 (mm)
   * @param width 창문 폭 (mm)
   * @param height 창문 높이 (mm)
   * @param sillHeight 창틀 하단 높이 (mm from floor)
   * @param centerX, centerZ 중심점 offset (meters)
   * @param name mesh 이름
   * @param scene Babylon scene
   */
  const createSlidingWindowMesh = (
    position: number,
    wallStart: { x: number; y: number },
    wallEnd: { x: number; y: number },
    wallThickness: number,
    width: number,
    height: number,
    sillHeight: number,
    centerX: number,
    centerZ: number,
    name: string,
    scene: Scene
  ): { windowGroup: Mesh; slidingPane: Mesh; hotspot: Mesh } => {
    const MM_TO_METERS = 0.001;
    const FRAME_WIDTH = 50; // 창틀 너비 50mm
    const GLASS_THICKNESS = 5; // 유리 두께 5mm

    // 벽 방향 계산
    const dx = wallEnd.x - wallStart.x;
    const dy = wallEnd.y - wallStart.y;
    const wallLength = Math.sqrt(dx * dx + dy * dy);
    const wallDir = { x: dx / wallLength, y: dy / wallLength };

    // 창문 중심 위치 (mm 단위)
    const windowCenterMM = {
      x: wallStart.x + wallDir.x * position * wallLength,
      y: wallStart.y + wallDir.y * position * wallLength
    };

    // meters로 변환 - 창문 중심 높이는 sillHeight + height/2
    const windowCenter3D = new Vector3(
      windowCenterMM.x * MM_TO_METERS - centerX,
      (sillHeight + height / 2) * MM_TO_METERS,
      -(windowCenterMM.y * MM_TO_METERS) - centerZ
    );

    // 창문 회전 (벽 방향) - Z축 반전 고려, 90도 보정
    const windowRotationY = Math.atan2(wallDir.x, -wallDir.y) + Math.PI / 2;

    // 창문 그룹 (회전 pivot)
    const windowGroup = new Mesh(`${name}_group`, scene);
    windowGroup.position = windowCenter3D;
    windowGroup.rotation.y = windowRotationY;

    // === 창틀 (Aluminum Frame) ===
    const frameMaterial = new PBRMaterial(`${name}_frameMat`, scene);
    frameMaterial.albedoColor = new Color3(0.7, 0.7, 0.75); // 알루미늄 회색
    frameMaterial.metallic = 0.6;
    frameMaterial.roughness = 0.3;

    // 좌측 창틀
    const leftFrame = MeshBuilder.CreateBox(`${name}_leftFrame`, {
      width: FRAME_WIDTH * MM_TO_METERS,
      height: height * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    leftFrame.position.x = -(width / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    leftFrame.material = frameMaterial;
    leftFrame.parent = windowGroup;

    // 우측 창틀
    const rightFrame = MeshBuilder.CreateBox(`${name}_rightFrame`, {
      width: FRAME_WIDTH * MM_TO_METERS,
      height: height * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    rightFrame.position.x = (width / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    rightFrame.material = frameMaterial;
    rightFrame.parent = windowGroup;

    // 상단 창틀
    const topFrame = MeshBuilder.CreateBox(`${name}_topFrame`, {
      width: (width + FRAME_WIDTH * 2) * MM_TO_METERS,
      height: FRAME_WIDTH * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    topFrame.position.y = (height / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    topFrame.material = frameMaterial;
    topFrame.parent = windowGroup;

    // 하단 창틀 (Sill)
    const bottomFrame = MeshBuilder.CreateBox(`${name}_bottomFrame`, {
      width: (width + FRAME_WIDTH * 2) * MM_TO_METERS,
      height: FRAME_WIDTH * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    bottomFrame.position.y = -(height / 2 + FRAME_WIDTH / 2) * MM_TO_METERS;
    bottomFrame.material = frameMaterial;
    bottomFrame.parent = windowGroup;

    // 중앙 세로 구분선 (두 유리창 사이)
    const centerDivider = MeshBuilder.CreateBox(`${name}_centerDivider`, {
      width: FRAME_WIDTH * 0.5 * MM_TO_METERS,
      height: height * MM_TO_METERS,
      depth: wallThickness * MM_TO_METERS
    }, scene);
    centerDivider.position.x = 0;
    centerDivider.material = frameMaterial;
    centerDivider.parent = windowGroup;

    // === 유리 재질 (투명) ===
    const glassMaterial = new PBRMaterial(`${name}_glassMat`, scene);
    glassMaterial.albedoColor = new Color3(0.8, 0.9, 1.0); // 약간 파란 틴트
    glassMaterial.alpha = 0.3; // 투명도
    glassMaterial.metallic = 0.0;
    glassMaterial.roughness = 0.1; // 매우 매끄러움
    glassMaterial.indexOfRefraction = 1.5; // 유리 굴절률
    glassMaterial.transparencyMode = 2; // Alpha blend mode

    // === 고정 유리창 (Fixed Pane - 왼쪽) ===
    const fixedPane = MeshBuilder.CreateBox(`${name}_fixedPane`, {
      width: (width / 2 - FRAME_WIDTH * 0.25) * MM_TO_METERS,
      height: (height - FRAME_WIDTH * 0.5) * MM_TO_METERS,
      depth: GLASS_THICKNESS * MM_TO_METERS
    }, scene);
    fixedPane.position.x = -(width / 4 + FRAME_WIDTH * 0.125) * MM_TO_METERS;
    fixedPane.material = glassMaterial;
    fixedPane.parent = windowGroup;

    // === 슬라이딩 유리창 (Sliding Pane - 오른쪽, 좌우 이동 가능) ===
    const slidingPane = new Mesh(`${name}_slidingPane`, scene);
    slidingPane.position.x = (width / 4 + FRAME_WIDTH * 0.125) * MM_TO_METERS; // 초기 위치 (닫힘)
    slidingPane.parent = windowGroup;

    const glassPane = MeshBuilder.CreateBox(`${name}_glassPane`, {
      width: (width / 2 - FRAME_WIDTH * 0.25) * MM_TO_METERS,
      height: (height - FRAME_WIDTH * 0.5) * MM_TO_METERS,
      depth: GLASS_THICKNESS * MM_TO_METERS
    }, scene);
    glassPane.material = glassMaterial;
    glassPane.parent = slidingPane;

    // 슬라이딩 창문 손잡이 (작은 실린더)
    const handleMaterial = new PBRMaterial(`${name}_handleMat`, scene);
    handleMaterial.albedoColor = new Color3(0.3, 0.3, 0.3); // 검은색
    handleMaterial.metallic = 0.7;
    handleMaterial.roughness = 0.2;

    const handle = MeshBuilder.CreateCylinder(`${name}_handle`, {
      diameter: 15 * MM_TO_METERS,
      height: 80 * MM_TO_METERS
    }, scene);
    handle.rotation.z = Math.PI / 2; // 수평으로 회전
    handle.position.set(
      -(width / 4) * MM_TO_METERS, // 왼쪽 가장자리
      0,
      (GLASS_THICKNESS / 2 + 10) * MM_TO_METERS // 유리 앞쪽
    );
    handle.material = handleMaterial;
    handle.parent = slidingPane;

    // === 호버 핫스팟 (작은 초록색 구) ===
    const hotspotMaterial = new PBRMaterial(`${name}_hotspotMat`, scene);
    hotspotMaterial.albedoColor = new Color3(0.25, 0.68, 0.48); // 초록색 #3fae7a
    hotspotMaterial.emissiveColor = new Color3(0.25, 0.68, 0.48);
    hotspotMaterial.alpha = 0; // 초기에는 숨김

    const hotspot = MeshBuilder.CreateSphere(`${name}_hotspot`, {
      diameter: 0.08
    }, scene);
    hotspot.position.set(
      -(width / 4) * MM_TO_METERS,
      0,
      (GLASS_THICKNESS / 2 + 50) * MM_TO_METERS
    );
    hotspot.material = hotspotMaterial;
    hotspot.isPickable = true;
    hotspot.parent = slidingPane;

    // 슬라이딩 창문 초기 상태 (닫힘)
    slidingPane.metadata = {
      isOpen: false,
      closedPosX: (width / 4 + FRAME_WIDTH * 0.125) * MM_TO_METERS,
      openPosX: -(width / 4 + FRAME_WIDTH * 0.125) * MM_TO_METERS, // 왼쪽으로 슬라이딩
      hotspot: hotspot // hotspot 메쉬 참조 저장
    };

    console.log('[Babylon3DCanvas] Created sliding window:', name, 'at position', windowCenter3D);

    return { windowGroup, slidingPane, hotspot };
  };

  // Update 3D scene when floorplan data changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !floorplanData) return;

    console.log('[Babylon3DCanvas] Updating 3D scene from 2D data...', floorplanData);

    // Remove ALL old meshes (walls, floors, ceilings, doors, windows, corners)
    const meshesToRemove = scene.meshes.filter(mesh =>
      mesh.name.startsWith('wall') ||
      mesh.name.startsWith('floor_') ||
      mesh.name.startsWith('ceiling_') ||
      mesh.name.startsWith('door_') ||
      mesh.name.startsWith('window_') ||
      mesh.name.startsWith('corner_')
    );
    meshesToRemove.forEach((mesh) => {
      console.log('[Babylon3DCanvas] Removing mesh:', mesh.name);
      mesh.dispose();
    });

    const { points, walls, doors = [], windows = [], floorplan: _floorplan } = floorplanData;
    console.log('[Babylon3DCanvas] Points:', points?.length, 'Walls:', walls?.length, 'Doors:', doors?.length, 'Windows:', windows?.length);
    if (!walls || walls.length === 0) return;

    const planMetrics = computePlanMetrics(points);
    const centerX = planMetrics?.centerX ?? 0;
    const centerZ = planMetrics?.centerZ ?? 0;

    if (planMetrics && arcCameraRef.current) {
      const arcCamera = arcCameraRef.current;
      const maxWallHeight = walls.reduce((max, wall) => Math.max(max, wall.height || 2400), 2400);
      const targetY = (maxWallHeight * MM_TO_METERS) / 2; // Center of wall height

      // CRITICAL: Camera must look at actual room center
      arcCamera.setTarget(new Vector3(centerX, targetY, centerZ));

      // Calculate optimal viewing distance based on room size
      const roomSize = Math.max(planMetrics.extentX, planMetrics.extentZ);
      const optimalRadius = roomSize * 1.5; // 1.5x room size for good view

      const minRadius = Math.max(0.5, roomSize * 0.8);
      const maxRadius = Math.max(minRadius * 5, roomSize * 3);
      arcCamera.lowerRadiusLimit = minRadius;
      arcCamera.upperRadiusLimit = maxRadius;
      arcCamera.radius = optimalRadius;

      console.log('[Babylon3DCanvas] Camera optimized:', {
        target: `(${centerX.toFixed(2)}, ${targetY.toFixed(2)}, ${centerZ.toFixed(2)})`,
        radius: optimalRadius.toFixed(2),
        roomSize: roomSize.toFixed(2),
      });
    }

    // Create point lookup map
    const pointMap = new Map();
    points.forEach((p) => pointMap.set(p.id, p));

    // Get shadow generator
    const sunLight = scene.getLightByName('sunLight') as DirectionalLight;
    const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator;

    // Create high-quality wall material (PBR)
    const wallMaterial = new PBRMaterial('wallMat_2d', scene);
    wallMaterial.albedoColor = new Color3(0.96, 0.96, 0.94);
    wallMaterial.metallic = 0.0;
    wallMaterial.roughness = 0.6;
    wallMaterial.environmentIntensity = 0.7;

    // Create floor material with real wood texture
    const floorMaterial = new PBRMaterial('floorMat_2d', scene);
    floorMaterial.metallic = 0.0;
    floorMaterial.environmentIntensity = 0.6;

    // Load real wood textures
    const diffuseTexture = new Texture('/texture/floor/f2 diffuse.JPG', scene);
    diffuseTexture.uScale = 1.0; // Will be set per-room based on size
    diffuseTexture.vScale = 1.0;
    diffuseTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    diffuseTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.albedoTexture = diffuseTexture;

    const glossTexture = new Texture('/texture/floor/f2 gloss.png', scene);
    glossTexture.uScale = 1.0;
    glossTexture.vScale = 1.0;
    glossTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    glossTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.metallicTexture = glossTexture;
    floorMaterial.useMetallnessFromMetallicTextureBlue = false;
    floorMaterial.useRoughnessFromMetallicTextureGreen = false;
    floorMaterial.useRoughnessFromMetallicTextureAlpha = true;

    const normalTexture = new Texture('/texture/floor/f2 normal.png', scene);
    normalTexture.uScale = 1.0;
    normalTexture.vScale = 1.0;
    normalTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    normalTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.bumpTexture = normalTexture;

    // Clear and prepare wall meshes array for snap detection
    wallMeshesRef.current = [];

    // Toggle between CSG and Miter wall generation
    // Miter mode is default (CSG has issues)
    const USE_CSG_WALLS = localStorage.getItem('USE_CSG_WALLS') === 'true'; // Default: false (Miter)

    if (USE_CSG_WALLS) {
      console.log('[Babylon3DCanvas] Using CSG-based wall system');

      // Create all walls with CSG trimming
      const csgWalls = createCSGWalls(
        walls as Wall[],
        points, // Use points array from floorplanData
        2400, // Default wall height
        scene,
        { x: centerX, z: centerZ }
      );

      // Apply material to all CSG walls
      const wallMaterial = new PBRMaterial('wallMaterial', scene);
      wallMaterial.albedoColor = new Color3(1, 1, 1);
      wallMaterial.roughness = 0.9;
      wallMaterial.metallic = 0.0;

      csgWalls.forEach((wallMesh) => {
        wallMesh.material = wallMaterial;
        wallMesh.receiveShadows = true;

        if (shadowGenerator) {
          shadowGenerator.addShadowCaster(wallMesh);
        }

        // Store for snap detection
        wallMeshesRef.current.push(wallMesh);
      });

      console.log(`[Babylon3DCanvas] Created ${csgWalls.length} CSG walls`);
    } else {
      console.log('[Babylon3DCanvas] Using Miter-based wall system');

      // Create walls with proper miter joints using WallMiterUtils
      walls.forEach((wall, wallIndex) => {
        const startPoint = pointMap.get(wall.startPointId);
        const endPoint = pointMap.get(wall.endPointId);
        if (!startPoint || !endPoint) return;

        const wallHeightMM = wall.height || 2400;

        // Find doors and windows on this wall
        const wallDoors = doors.filter((door: any) => door.wallId === wall.id);
        const wallWindows = windows.filter((window: any) => window.wallId === wall.id);

        // Find connected walls and calculate miter joint corners
        const connections = findConnectedWalls(walls as Wall[], wall as Wall, pointMap);
        const corners = calculateWallCorners(wall as Wall, connections, pointMap);

        if (!corners) {
          console.error('[Babylon3DCanvas] Failed to calculate corners for wall:', wall.id);
          return;
        }

        // Create full wall with miter joints
        let wallMesh = createWallMeshFromCorners(
          corners,
          wallHeightMM,
          centerX,
          centerZ,
          `wall_${wallIndex}`,
          scene
        );

        // If wall has doors or windows, subtract openings using CSG
        if (wallDoors.length > 0 || wallWindows.length > 0) {
          const DOOR_HEIGHT = 2050; // 도어 높이 (mm)
          const FRAME_WIDTH = 50; // 문틀 너비 (mm)
          const OPENING_HEIGHT = DOOR_HEIGHT + FRAME_WIDTH; // 타공 높이 (도어 + 상단 문틀)
          const OPENING_WIDTH_MM = 900 + FRAME_WIDTH * 2; // 타공 폭 (도어 + 양쪽 문틀)

          // Calculate wall direction and length
          const dx = endPoint.x - startPoint.x;
          const dy = endPoint.y - startPoint.y;
          const wallLengthMM = Math.sqrt(dx * dx + dy * dy);
          const wallDir = { x: dx / wallLengthMM, y: dy / wallLengthMM };
          const wallRotationY = Math.atan2(wallDir.x, -wallDir.y);

          // Convert wall mesh to CSG
          let wallCSG = CSG.FromMesh(wallMesh);

          // Subtract each door opening
          wallDoors.forEach((door: any) => {
            // Calculate door center position along wall
            const doorCenterMM = {
              x: startPoint.x + wallDir.x * door.position * wallLengthMM,
              y: startPoint.y + wallDir.y * door.position * wallLengthMM
            };

            // Create door opening box (in meters)
            const openingBox = MeshBuilder.CreateBox(`temp_door_opening`, {
              width: OPENING_WIDTH_MM * MM_TO_METERS,
              height: OPENING_HEIGHT * MM_TO_METERS,
              depth: (wall.thickness + 100) * MM_TO_METERS // Slightly larger than wall thickness
            }, scene);

            openingBox.position = new Vector3(
              doorCenterMM.x * MM_TO_METERS - centerX,
              (OPENING_HEIGHT / 2) * MM_TO_METERS,
              -(doorCenterMM.y * MM_TO_METERS) - centerZ
            );
            openingBox.rotation.y = wallRotationY + Math.PI / 2;

            // Subtract opening from wall
            const openingCSG = CSG.FromMesh(openingBox);
            wallCSG = wallCSG.subtract(openingCSG);

            // Dispose temporary box
            openingBox.dispose();
          });

          // Subtract each window opening
          wallWindows.forEach((window: any) => {
            const windowWidth = window.width || 1200;
            const windowHeight = window.height || 1200;
            const windowSillHeight = window.sillHeight || 900;
            const WINDOW_FRAME_WIDTH = 50;

            // Calculate window center position along wall
            const windowCenterMM = {
              x: startPoint.x + wallDir.x * window.position * wallLengthMM,
              y: startPoint.y + wallDir.y * window.position * wallLengthMM
            };

            // Create window opening box (in meters)
            const windowOpeningBox = MeshBuilder.CreateBox(`temp_window_opening`, {
              width: (windowWidth + WINDOW_FRAME_WIDTH * 2) * MM_TO_METERS,
              height: (windowHeight + WINDOW_FRAME_WIDTH * 2) * MM_TO_METERS,
              depth: (wall.thickness + 100) * MM_TO_METERS
            }, scene);

            // Window center Y position (from floor)
            const windowCenterY = (windowSillHeight + windowHeight / 2) * MM_TO_METERS;

            windowOpeningBox.position = new Vector3(
              windowCenterMM.x * MM_TO_METERS - centerX,
              windowCenterY,
              -(windowCenterMM.y * MM_TO_METERS) - centerZ
            );
            windowOpeningBox.rotation.y = wallRotationY + Math.PI / 2;

            // Subtract opening from wall
            const windowOpeningCSG = CSG.FromMesh(windowOpeningBox);
            wallCSG = wallCSG.subtract(windowOpeningCSG);

            // Dispose temporary box
            windowOpeningBox.dispose();
          });

          // Convert CSG back to mesh
          wallMesh.dispose();
          wallMesh = wallCSG.toMesh(`wall_${wallIndex}`, wallMaterial, scene);

          if (!wallMesh) {
            console.error('[Babylon3DCanvas] Failed to create wall mesh from CSG:', wall.id);
            return;
          }
        }

        // Finalize wall mesh (with or without doors/windows)
        wallMesh.receiveShadows = true;
        wallMesh.checkCollisions = true;

        // Ensure collision is properly set for CSG-generated meshes
        if (wallMesh.checkCollisions !== true) {
          console.warn('[Babylon3DCanvas] Collision not set for wall:', wall.id);
          wallMesh.checkCollisions = true;
        }
        wallMeshesRef.current.push(wallMesh);

        if (shadowGenerator) {
          shadowGenerator.addShadowCaster(wallMesh);
        }

        // Enable edge rendering for clean wall edges
        wallMesh.enableEdgesRendering();
        wallMesh.edgesWidth = 1.0;
        wallMesh.edgesColor = new Color4(0.5, 0.5, 0.5, 1);

        // === CREATE DOOR MESHES ===
        if (wallDoors.length > 0) {
          wallDoors.forEach((door: any, doorIndex: number) => {
            const { doorGroup, doorLeaf, hotspot } = createDoorMesh(
              door.position,
              { x: startPoint.x, y: startPoint.y },
              { x: endPoint.x, y: endPoint.y },
              wall.thickness,
              centerX,
              centerZ,
              `door_${wallIndex}_${doorIndex}`,
              scene,
              door.swing || 'right' // 2D에서 설정한 열림방향
            );

            // Add to shadow caster
            if (shadowGenerator) {
              doorGroup.getChildMeshes().forEach((mesh) => {
                shadowGenerator.addShadowCaster(mesh);
              });
            }

            // Store door leaf for interaction
            doorLeaf.metadata = {
              ...doorLeaf.metadata,
              hotspot: hotspot,
              wallIndex,
              doorIndex
            };
          });
        }

        // === CREATE WINDOW MESHES ===
        if (wallWindows.length > 0) {
          wallWindows.forEach((window: any, windowIndex: number) => {
            const { windowGroup, slidingPane, hotspot } = createSlidingWindowMesh(
              window.position,
              { x: startPoint.x, y: startPoint.y },
              { x: endPoint.x, y: endPoint.y },
              wall.thickness,
              window.width || 1200,
              window.height || 1200,
              window.sillHeight || 900,
              centerX,
              centerZ,
              `window_${wallIndex}_${windowIndex}`,
              scene
            );

            // Add to shadow caster
            if (shadowGenerator) {
              windowGroup.getChildMeshes().forEach((mesh) => {
                shadowGenerator.addShadowCaster(mesh);
              });
            }

            // Store sliding pane for interaction
            slidingPane.metadata = {
              ...slidingPane.metadata,
              hotspot: hotspot,
              wallIndex,
              windowIndex
            };
          });
        }
      });
    } // End of USE_CSG_WALLS else block

    console.log('[Babylon3DCanvas] Created', walls.length, '3D walls in', USE_CSG_WALLS ? 'CSG' : 'Miter', 'mode,', wallMeshesRef.current.length, 'wall meshes for snap detection');

    // Create floors for each room - ONLY inside walls (polygon shape)
    const { rooms } = floorplanData;
    if (rooms && rooms.length > 0) {
      rooms.forEach((room, roomIndex) => {
        // Get room boundary points in 3D space (flip Z axis)
        const roomPoints = room.points.map((pid: string) => {
          const p = pointMap.get(pid);
          if (!p) return null;
          return new Vector3(
            p.x * MM_TO_METERS - centerX,
            0.01, // Slightly above Y=0 to prevent z-fighting
            -(p.y * MM_TO_METERS) - centerZ
          );
        }).filter((p: any) => p !== null);

        if (roomPoints.length < 3) return;

        // Create polygon floor directly on XZ plane (horizontal ground)
        // Using custom mesh with earcut triangulation

        console.log(`[Babylon3DCanvas] Creating polygon floor ${roomIndex} with ${roomPoints.length} points`);

        // Calculate bounds for texture scaling
        const minX = Math.min(...roomPoints.map((p: Vector3) => p.x));
        const maxX = Math.max(...roomPoints.map((p: Vector3) => p.x));
        const minZ = Math.min(...roomPoints.map((p: Vector3) => p.z));
        const maxZ = Math.max(...roomPoints.map((p: Vector3) => p.z));
        const width = maxX - minX;
        const depth = maxZ - minZ;

        // Flatten XZ coordinates for earcut (format: [x1, z1, x2, z2, ...])
        const flatCoords: number[] = [];
        roomPoints.forEach((p: Vector3) => {
          flatCoords.push(p.x, p.z);
        });

        // Triangulate using earcut
        const triangleIndices = earcut(flatCoords, undefined, 2);

        if (triangleIndices.length === 0) {
          console.error(`[Babylon3DCanvas] Earcut failed for room ${roomIndex}`);
          return;
        }

        // Build custom mesh directly on XZ plane
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];

        roomPoints.forEach((p: Vector3) => {
          // Position on XZ plane (Y=0.01 for floor height)
          positions.push(p.x, 0.01, p.z);

          // Normal pointing UP (+Y)
          normals.push(0, 1, 0);

          // UV coordinates based on physical size (2000mm = 2.0m per texture tile)
          const u = (p.x - minX) / 2.0; // Every 2.0m = 1 UV unit
          const v = (p.z - minZ) / 2.0; // Every 2.0m = 1 UV unit
          uvs.push(u, v);
        });

        // Create mesh
        const floor = new Mesh(`floor_${roomIndex}`, scene);
        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.normals = normals;
        vertexData.uvs = uvs;
        vertexData.indices = Array.from(triangleIndices);
        vertexData.applyToMesh(floor);

        // Apply material with correct texture tiling
        const roomFloorMat = floorMaterial.clone(`floorMat_room_${roomIndex}`);

        // UV coordinates already calculated based on 0.1m (100mm) physical size
        // Set scale to 1.0 since UV already contains the correct tiling
        if (roomFloorMat.albedoTexture && roomFloorMat.albedoTexture instanceof Texture) {
          (roomFloorMat.albedoTexture as Texture).uScale = 1.0;
          (roomFloorMat.albedoTexture as Texture).vScale = 1.0;
        }
        if (roomFloorMat.metallicTexture && roomFloorMat.metallicTexture instanceof Texture) {
          (roomFloorMat.metallicTexture as Texture).uScale = 1.0;
          (roomFloorMat.metallicTexture as Texture).vScale = 1.0;
        }
        if (roomFloorMat.bumpTexture && roomFloorMat.bumpTexture instanceof Texture) {
          (roomFloorMat.bumpTexture as Texture).uScale = 1.0;
          (roomFloorMat.bumpTexture as Texture).vScale = 1.0;
        }

        floor.material = roomFloorMat;
        floor.receiveShadows = true;
        floor.checkCollisions = true; // Enable collision for FPS mode

        console.log(`[Babylon3DCanvas] ✅ Custom floor ${roomIndex} created on XZ plane:`, {
          points: roomPoints.length,
          triangles: triangleIndices.length / 3,
          width_m: width.toFixed(2),
          depth_m: depth.toFixed(2),
        });
      });

      console.log('[Babylon3DCanvas] Created polygon floors for', rooms.length, 'rooms');

      // Create ceilings for each room - ONLY in play mode
      if (playMode) {
        // Calculate maximum wall height for ceiling position
        const maxWallHeight = walls.reduce((max, wall) => Math.max(max, wall.height || 2400), 2400);
        const ceilingY = maxWallHeight * MM_TO_METERS;

        // Create ceiling material (white)
        const ceilingMaterial = new PBRMaterial('ceilingMat_2d', scene);
        ceilingMaterial.albedoColor = new Color3(0.96, 0.96, 0.94);
        ceilingMaterial.metallic = 0.0;
        ceilingMaterial.roughness = 0.6;
        ceilingMaterial.environmentIntensity = 0.7;

        rooms.forEach((room, roomIndex) => {
          // Get room boundary points
          const roomPoints = room.points.map((pid: string) => {
            const p = pointMap.get(pid);
            if (!p) return null;
            return new Vector3(
              p.x * MM_TO_METERS - centerX,
              ceilingY,
              -(p.y * MM_TO_METERS) - centerZ
            );
          }).filter((p: any) => p !== null);

          if (roomPoints.length < 3) return;

          // Flatten XZ coordinates for earcut
          const flatCoords: number[] = [];
          roomPoints.forEach((p: Vector3) => {
            flatCoords.push(p.x, p.z);
          });

          // Triangulate using earcut
          const triangleIndices = earcut(flatCoords, undefined, 2);
          if (triangleIndices.length === 0) return;

          // Build ceiling mesh
          const positions: number[] = [];
          const normals: number[] = [];

          roomPoints.forEach((p: Vector3) => {
            positions.push(p.x, ceilingY, p.z);
            // Normal pointing DOWN (-Y) for ceiling
            normals.push(0, -1, 0);
          });

          // Create ceiling mesh
          const ceiling = new Mesh(`ceiling_${roomIndex}`, scene);
          const vertexData = new VertexData();
          vertexData.positions = positions;
          vertexData.normals = normals;
          // Reverse indices for correct winding order (viewed from below)
          vertexData.indices = Array.from(triangleIndices).reverse();
          vertexData.applyToMesh(ceiling);

          ceiling.material = ceilingMaterial;
          ceiling.receiveShadows = true;
          ceiling.checkCollisions = true;

          console.log(`[Babylon3DCanvas] ✅ Ceiling ${roomIndex} created at Y=${ceilingY.toFixed(2)}m`);
        });

        console.log('[Babylon3DCanvas] Created ceilings for', rooms.length, 'rooms (play mode)');
      }
    }

    // === DOOR INTERACTION: Hover and Click ===
    // Pointer move for hover hotspot
    const handlePointerMove = (evt: PointerEvent) => {
      if (!scene) return;

      const pickResult = scene.pick(evt.offsetX, evt.offsetY);

      // Hide all hotspots first (but keep them visible in play mode)
      scene.meshes.forEach((mesh) => {
        if (mesh.name.includes('_hotspot') && mesh.material) {
          (mesh.material as PBRMaterial).alpha = playMode ? 0.6 : 0;
        }
      });

      // Check if hovering over door
      if (pickResult && pickResult.hit && pickResult.pickedMesh) {
        const picked = pickResult.pickedMesh;

        // Check if picked mesh is part of door
        if (picked.name.includes('door_') || picked.name.includes('_panel') || picked.name.includes('_handle')) {
          // Find parent door leaf
          let doorLeaf: Mesh | null = null;
          let current = picked.parent;
          while (current) {
            if (current.name.includes('_leaf')) {
              doorLeaf = current as Mesh;
              break;
            }
            current = current.parent;
          }

          // Show hotspot (brighter on hover, always visible in play mode)
          if (doorLeaf && doorLeaf.metadata && doorLeaf.metadata.hotspot) {
            const hotspot = doorLeaf.metadata.hotspot as Mesh;
            if (hotspot.material) {
              (hotspot.material as PBRMaterial).alpha = playMode ? 1.0 : 0.8; // Brighter on hover in play mode
            }
          }
        }

        // Check if picked mesh is part of window
        if (picked.name.includes('window_') || picked.name.includes('_glassPane') || picked.name.includes('_handle')) {
          // Find parent sliding pane
          let slidingPane: Mesh | null = null;
          let current = picked.parent;
          while (current) {
            if (current.name.includes('_slidingPane')) {
              slidingPane = current as Mesh;
              break;
            }
            current = current.parent;
          }

          // Show hotspot (brighter on hover, always visible in play mode)
          if (slidingPane && slidingPane.metadata && slidingPane.metadata.hotspot) {
            const hotspot = slidingPane.metadata.hotspot as Mesh;
            if (hotspot.material) {
              (hotspot.material as PBRMaterial).alpha = playMode ? 1.0 : 0.8; // Brighter on hover in play mode
            }
          }
        }
      }
    };

    // Click to open/close door
    const handlePointerDown = (evt: PointerEvent) => {
      if (!scene) return;

      const pickResult = scene.pick(evt.offsetX, evt.offsetY);

      if (pickResult && pickResult.hit && pickResult.pickedMesh) {
        const picked = pickResult.pickedMesh;

        // Check if clicked on door or hotspot
        if (picked.name.includes('door_') || picked.name.includes('_hotspot') ||
          picked.name.includes('_panel') || picked.name.includes('_handle')) {

          // Find parent door leaf
          let doorLeaf: Mesh | null = null;
          let current = picked.parent;
          while (current) {
            if (current.name.includes('_leaf')) {
              doorLeaf = current as Mesh;
              break;
            }
            current = current.parent;
          }

          if (doorLeaf && doorLeaf.metadata) {
            const isOpen = doorLeaf.metadata.isOpen;
            const swing = doorLeaf.metadata.swing || 'right';
            // swing에 따라 회전 방향 결정
            // left: 왼쪽 경첩, 반시계방향 (-90도)
            // right: 오른쪽 경첩, 시계방향 (+90도)
            const openRotation = swing === 'left' ? -Math.PI / 2 : Math.PI / 2;
            const targetRotation = isOpen ? 0 : openRotation;

            // Smooth animation
            const startRotation = doorLeaf.rotation.y;
            const duration = 500; // 0.5 seconds
            const startTime = performance.now();

            const animate = () => {
              const elapsed = performance.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);

              // Ease-in-out
              const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              doorLeaf.rotation.y = startRotation + (targetRotation - startRotation) * eased;

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                // Update state
                doorLeaf.metadata.isOpen = !isOpen;
                console.log('[Babylon3DCanvas] Door', doorLeaf.name, isOpen ? 'closed' : 'opened');
              }
            };

            animate();
          }
        }

        // Check if clicked on window or hotspot
        if (picked.name.includes('window_') || picked.name.includes('_hotspot') ||
          picked.name.includes('_glassPane') || picked.name.includes('_handle')) {

          // Find parent sliding pane
          let slidingPane: Mesh | null = null;
          let current = picked.parent;
          while (current) {
            if (current.name.includes('_slidingPane')) {
              slidingPane = current as Mesh;
              break;
            }
            current = current.parent;
          }

          if (slidingPane && slidingPane.metadata) {
            const isOpen = slidingPane.metadata.isOpen;
            const closedPosX = slidingPane.metadata.closedPosX;
            const openPosX = slidingPane.metadata.openPosX;
            const targetPosX = isOpen ? closedPosX : openPosX;

            // Smooth sliding animation
            const startPosX = slidingPane.position.x;
            const duration = 500; // 0.5 seconds
            const startTime = performance.now();

            const animate = () => {
              const elapsed = performance.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);

              // Ease-in-out
              const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

              slidingPane.position.x = startPosX + (targetPosX - startPosX) * eased;

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                // Update state
                slidingPane.metadata.isOpen = !isOpen;
                console.log('[Babylon3DCanvas] Window', slidingPane.name, isOpen ? 'closed' : 'opened');
              }
            };

            animate();
          }
        }
      }
    };

    // Double-click to teleport in play mode
    const handleDoubleClick = (evt: MouseEvent) => {
      if (!scene || !playMode) return;

      const fpsCamera = fpsCameraRef.current;
      if (!fpsCamera) return;

      const pickResult = scene.pick(evt.offsetX, evt.offsetY);

      if (pickResult && pickResult.hit && pickResult.pickedPoint) {
        const pickedMesh = pickResult.pickedMesh;

        // Only teleport if clicked on floor
        if (!pickedMesh || !pickedMesh.name.includes('floor')) {
          console.log('[Babylon3DCanvas] Teleport cancelled - not a floor surface:', pickedMesh?.name);
          return;
        }

        const targetPosition = pickResult.pickedPoint.clone();
        // Keep camera at eye height
        targetPosition.y = DEFAULT_CAMERA_HEIGHT;

        console.log('[Babylon3DCanvas] Teleporting to:', targetPosition);

        // Smooth camera movement animation (slower)
        const startPosition = fpsCamera.position.clone();
        const duration = 1500; // 1.5 seconds (slower)
        const startTime = performance.now();

        const animate = () => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // Ease-in-out cubic (smoother)
          const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

          fpsCamera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * eased;
          fpsCamera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * eased;
          fpsCamera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * eased;

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            console.log('[Babylon3DCanvas] Teleport complete');
          }
        };

        animate();
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('pointermove', handlePointerMove as any);
      canvas.addEventListener('pointerdown', handlePointerDown as any);
      canvas.addEventListener('dblclick', handleDoubleClick as any);

      return () => {
        canvas.removeEventListener('pointermove', handlePointerMove as any);
        canvas.removeEventListener('pointerdown', handlePointerDown as any);
        canvas.removeEventListener('dblclick', handleDoubleClick as any);
      };
    }
  }, [floorplanData, playMode]);

  // Adjust ambient lighting based on play mode
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const hemisphericLight = scene.getLightByName('hemiLight') as HemisphericLight;
    const sunLight = sunLightRef.current;
    if (!hemisphericLight || !sunLight) return;

    // Count windows and lights to determine lighting conditions
    const windowCount = floorplanData?.windows?.length || 0;
    const lightCount = lights.length;

    if (playMode) {
      // Reduce ambient light in play mode to simulate indoor lighting with ceiling
      hemisphericLight.intensity = 0.2;

      // Disable sunlight if there are no windows (no natural light can enter)
      if (windowCount === 0) {
        sunLight.intensity = 0;
        console.log('[Babylon3DCanvas] Disabled sunlight for play mode (no windows)');
      } else {
        // Restore sunlight if windows exist
        const intensity = sunSettings?.intensity ?? 1.5;
        sunLight.intensity = intensity;
        console.log(`[Babylon3DCanvas] Enabled sunlight for play mode (${windowCount} windows, intensity: ${intensity})`);
      }

      // Adjust material environment intensity based on lighting conditions
      // If no lights and no windows, materials should be very dark
      const hasLighting = windowCount > 0 || lightCount > 0;
      const targetEnvironmentIntensity = hasLighting ? 0.3 : 0.05; // Very low if no lighting

      scene.meshes.forEach(mesh => {
        // Hide light indicator meshes in play mode
        if (mesh.metadata?.isLightIndicator) {
          mesh.isVisible = false;
        }

        if (mesh.material && mesh.material instanceof PBRMaterial) {
          const material = mesh.material as PBRMaterial;
          // Only adjust wall, floor, ceiling materials
          if (material.name.includes('wallMat') || material.name.includes('floorMat') || material.name.includes('ceilingMat')) {
            material.environmentIntensity = targetEnvironmentIntensity;
          }
        }
      });

      console.log(`[Babylon3DCanvas] Set environment intensity to ${targetEnvironmentIntensity} for play mode (${windowCount} windows, ${lightCount} lights)`);
    } else {
      // Restore normal ambient light and sunlight for editing mode
      hemisphericLight.intensity = 0.7;
      const intensity = sunSettings?.intensity ?? 1.5;
      sunLight.intensity = intensity;

      // Restore normal environment intensity for editing mode
      scene.meshes.forEach(mesh => {
        // Show light indicator meshes in edit mode
        if (mesh.metadata?.isLightIndicator) {
          mesh.isVisible = true;
        }

        if (mesh.material && mesh.material instanceof PBRMaterial) {
          const material = mesh.material as PBRMaterial;
          if (material.name.includes('wallMat')) {
            material.environmentIntensity = 0.7;
          } else if (material.name.includes('floorMat')) {
            material.environmentIntensity = 0.6;
          } else if (material.name.includes('ceilingMat')) {
            material.environmentIntensity = 0.7;
          }
        }
      });

      console.log('[Babylon3DCanvas] Restored hemispheric light and sunlight for edit mode');
    }
  }, [playMode, floorplanData?.windows, sunSettings?.intensity, lights.length]);

  // Update sun light and skybox when settings change
  useEffect(() => {
    const sunLight = sunLightRef.current;
    const scene = sceneRef.current;
    if (!sunLight || !sunSettings || !scene) return;

    const { azimuth, altitude, intensity } = sunSettings;

    // Convert azimuth/altitude to 3D position
    const radius = 50;
    const azimuthRad = (azimuth * Math.PI) / 180;
    const altitudeRad = (altitude * Math.PI) / 180;

    const x = radius * Math.cos(altitudeRad) * Math.sin(azimuthRad);
    const y = radius * Math.sin(altitudeRad);
    const z = radius * Math.cos(altitudeRad) * Math.cos(azimuthRad);

    sunLight.position.set(x, y, z);
    sunLight.intensity = intensity;

    // Update skybox sun position with Vector3 for realistic appearance
    const skybox = scene.getMeshByName('skybox');
    if (skybox && skybox.material instanceof SkyMaterial) {
      const skyMaterial = skybox.material as SkyMaterial;

      // Convert azimuth/altitude to Vector3 (matching createSkybox logic)
      const sunX = Math.cos(altitudeRad) * Math.sin(azimuthRad);
      const sunY = Math.sin(altitudeRad);
      const sunZ = Math.cos(altitudeRad) * Math.cos(azimuthRad);

      skyMaterial.sunPosition = new Vector3(sunX, sunY, sunZ);
      console.log('[Babylon3DCanvas] Skybox updated - sunPosition:', sunX.toFixed(2), sunY.toFixed(2), sunZ.toFixed(2));
    }
  }, [sunSettings]);

  // Switch camera and controls based on view mode and play mode
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const arcCamera = arcCameraRef.current;
    const fpsCamera = fpsCameraRef.current;
    const thirdPersonCamera = thirdPersonCameraRef.current;
    const character = characterRef.current;

    if (!scene || !canvas || !arcCamera || !fpsCamera || !thirdPersonCamera || !character) {
      console.log('[Babylon3DCanvas] Missing refs, skipping');
      return;
    }

    if (!visible) {
      console.log('[Babylon3DCanvas] Not visible, skipping');
      // Detach all controls when not visible
      arcCamera.detachControl();
      fpsCamera.detachControl();
      thirdPersonCamera.detachControl();
      return;
    }

    console.log('[Babylon3DCanvas] Starting camera switch, playMode:', playMode);

    if (playMode) {
      // ====== PLAY MODE: 1st Person FPS (game mode) ======
      console.log('[Babylon3DCanvas] Play Mode: 1st Person FPS');

      const planMetrics = computePlanMetrics(floorplanData?.points);
      if (planMetrics) {
        fpsCamera.position = new Vector3(
          planMetrics.centerX,
          DEFAULT_CAMERA_HEIGHT,
          planMetrics.centerZ
        );
        fpsCamera.rotation = new Vector3(0, 0, 0);

        character.position = new Vector3(
          planMetrics.centerX,
          0,
          planMetrics.centerZ
        );
      }

      // Hide character in FPS mode
      character.isVisible = false;

      // Detach all other cameras
      arcCamera.detachControl();
      thirdPersonCamera.detachControl();
      fpsCamera.detachControl();

      // Set as active camera
      scene.activeCamera = fpsCamera;

      // Attach mouse controls only
      fpsCamera.attachControl(canvas, true);

      // Focus canvas
      canvas.focus();

      console.log('[Babylon3DCanvas] FPS Camera activated');

      // Manual WASD keyboard controls
      const fpsInputMap: { [key: string]: boolean } = {};
      const onFpsKeyDown = (evt: KeyboardEvent) => {
        fpsInputMap[evt.key.toLowerCase()] = true;
      };
      const onFpsKeyUp = (evt: KeyboardEvent) => {
        fpsInputMap[evt.key.toLowerCase()] = false;
      };

      window.addEventListener('keydown', onFpsKeyDown);
      window.addEventListener('keyup', onFpsKeyUp);

      let lastCameraPos = fpsCamera.position.clone();
      const moveSpeed = 0.02; // Movement speed for WASD

      const fpsObserver = scene.onBeforeRenderObservable.add(() => {
        if (!fpsCamera || !character) return;

        // Manual WASD movement
        const forward = new Vector3(
          Math.sin(fpsCamera.rotation.y),
          0,
          Math.cos(fpsCamera.rotation.y)
        );
        const right = new Vector3(
          Math.sin(fpsCamera.rotation.y + Math.PI / 2),
          0,
          Math.cos(fpsCamera.rotation.y + Math.PI / 2)
        );

        let moved = false;

        if (fpsInputMap['w']) {
          fpsCamera.position.addInPlace(forward.scale(moveSpeed));
          moved = true;
        }
        if (fpsInputMap['s']) {
          fpsCamera.position.addInPlace(forward.scale(-moveSpeed));
          moved = true;
        }
        if (fpsInputMap['a']) {
          fpsCamera.position.addInPlace(right.scale(-moveSpeed));
          moved = true;
        }
        if (fpsInputMap['d']) {
          fpsCamera.position.addInPlace(right.scale(moveSpeed));
          moved = true;
        }

        // Sync character position for collision
        const cameraDelta = fpsCamera.position.subtract(lastCameraPos);
        character.position.x += cameraDelta.x;
        character.position.z += cameraDelta.z;
        character.position.y = 0;

        character.rotation.y = fpsCamera.rotation.y;
        lastCameraPos = fpsCamera.position.clone();

        // Walking bob
        if (moved) {
          const time = performance.now() * 0.01;
          fpsCamera.position.y = DEFAULT_CAMERA_HEIGHT + Math.sin(time) * 0.015;
        } else {
          fpsCamera.position.y = DEFAULT_CAMERA_HEIGHT;
        }
      });

      return () => {
        console.log('[Babylon3DCanvas] Cleanup Play Mode');
        window.removeEventListener('keydown', onFpsKeyDown);
        window.removeEventListener('keyup', onFpsKeyUp);
        scene.onBeforeRenderObservable.remove(fpsObserver);
        fpsCamera.detachControl();
        character.isVisible = true;
      };
    } else {
      // ====== 3D VIEW MODE: Restore Orbit control ======
      console.log('[Babylon3DCanvas] 3D View Mode: Restoring Orbit control (keeping previous position)');

      const planMetrics = computePlanMetrics(floorplanData?.points);
      if (planMetrics) {
        character.position = new Vector3(
          planMetrics.centerX,
          0,
          planMetrics.centerZ
        );
        character.rotation.y = 0;

        // Setup orbit camera (Standard Perspective)
        arcCamera.mode = 0; // Camera.PERSPECTIVE_CAMERA

        // Don't force reset camera position - let it stay where user left it
        // arcCamera.setTarget(new Vector3(planMetrics.centerX, 0, planMetrics.centerZ));
        // arcCamera.alpha = Math.PI / 4; 
        // arcCamera.beta = Math.PI / 3; 
        // arcCamera.radius = 10;
      }

      // Show character
      character.isVisible = true;

      // Configure orbit controls
      arcCamera.lowerRadiusLimit = 5;
      arcCamera.upperRadiusLimit = 50;
      arcCamera.lowerBetaLimit = 0.1; // Prevent going under floor
      arcCamera.upperBetaLimit = Math.PI / 2.1; // Prevent going too vertical

      arcCamera.panningSensibility = 50;
      arcCamera.wheelPrecision = 50;

      // Detach all other cameras
      fpsCamera.detachControl();
      thirdPersonCamera.detachControl();
      arcCamera.detachControl();

      // Set as active camera
      scene.activeCamera = arcCamera;

      // Attach controls and disable camera keyboard
      arcCamera.attachControl(canvas, true);
      arcCamera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

      // Focus canvas
      canvas.focus();

      console.log('[Babylon3DCanvas] 3D Camera activated, keyboard controls removed for character');

      // Character controls
      const inputMap: { [key: string]: boolean } = {};
      const onKeyDown = (evt: KeyboardEvent) => {
        const key = evt.key.toLowerCase();
        inputMap[key] = true;
      };
      const onKeyUp = (evt: KeyboardEvent) => {
        const key = evt.key.toLowerCase();
        inputMap[key] = false;
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      const moveSpeed = 0.05;
      const rotateSpeed = 0.03;

      const characterObserver = scene.onBeforeRenderObservable.add(() => {
        if (!character) return;

        let moved = false;

        // Rotation
        if (inputMap['a']) {
          character.rotation.y += rotateSpeed;
        }
        if (inputMap['d']) {
          character.rotation.y -= rotateSpeed;
        }

        // Movement
        const forward = new Vector3(
          Math.sin(character.rotation.y),
          0,
          Math.cos(character.rotation.y)
        );

        if (inputMap['w']) {
          character.position.addInPlace(forward.scale(moveSpeed));
          moved = true;
        }
        if (inputMap['s']) {
          character.position.addInPlace(forward.scale(-moveSpeed));
          moved = true;
        }

        // Camera follows character only when moving
        if (moved) {
          arcCamera.setTarget(character.position);
        }

        // Walking animation
        if (moved) {
          const time = performance.now() * 0.005;
          const head = scene.getMeshByName('head');
          const leftArm = scene.getMeshByName('leftArm');
          const rightArm = scene.getMeshByName('rightArm');

          if (head) head.position.y = 1.62 + Math.sin(time) * 0.03;
          if (leftArm) leftArm.rotation.x = Math.sin(time) * 0.3;
          if (rightArm) rightArm.rotation.x = Math.sin(time + Math.PI) * 0.3;
        } else {
          const head = scene.getMeshByName('head');
          const leftArm = scene.getMeshByName('leftArm');
          const rightArm = scene.getMeshByName('rightArm');

          if (head) head.position.y = 1.62;
          if (leftArm) leftArm.rotation.x = 0;
          if (rightArm) rightArm.rotation.x = 0;
        }
      });

      return () => {
        console.log('[Babylon3DCanvas] Cleanup 3D Mode');
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        scene.onBeforeRenderObservable.remove(characterObserver);
        arcCamera.detachControl();
      };
    }
  }, [playMode, floorplanData, visible]);

  // Resize engine when visibility changes
  useEffect(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;

    if (visible) {
      console.log('[Babylon3DCanvas] Visible! Resizing engine...');
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        // Force canvas to take full parent size
        const parent = canvas.parentElement;
        if (parent) {
          const width = parent.clientWidth;
          const height = parent.clientHeight;
          console.log(`[Babylon3DCanvas] Resizing to ${width}x${height}`);
          canvas.width = width;
          canvas.height = height;
          engine.resize();
        }
      }, 100);
    }
  }, [visible]);

  // Control character visibility
  useEffect(() => {
    const character = characterRef.current;
    if (!character) return;

    character.setEnabled(showCharacter);
    console.log('[Babylon3DCanvas] Character visibility:', showCharacter);
  }, [showCharacter]);

  // Camera reset event
  useEffect(() => {
    const handleCameraReset = () => {
      console.log('[Babylon3DCanvas] Camera reset requested');
      const arcCamera = arcCameraRef.current;
      const planMetrics = computePlanMetrics(floorplanData?.points);

      if (arcCamera && planMetrics) {
        const centerX = planMetrics.centerX;
        const centerZ = planMetrics.centerZ;
        const roomSize = Math.max(planMetrics.extentX, planMetrics.extentZ);
        const optimalRadius = roomSize * 1.5;

        // Reset camera position and target
        arcCamera.setTarget(new Vector3(centerX, DEFAULT_CAMERA_HEIGHT, centerZ));
        arcCamera.radius = optimalRadius;
        arcCamera.alpha = -Math.PI / 4; // Default horizontal angle
        arcCamera.beta = Math.PI / 3.5; // Default vertical angle

        console.log('[Babylon3DCanvas] Camera reset to center:', {
          target: `(${centerX.toFixed(2)}, ${DEFAULT_CAMERA_HEIGHT.toFixed(2)}, ${centerZ.toFixed(2)})`,
          radius: optimalRadius.toFixed(2),
        });
      } else if (arcCamera) {
        // No floorplan data - reset to default
        arcCamera.setTarget(new Vector3(0, DEFAULT_CAMERA_HEIGHT, 0));
        arcCamera.radius = DEFAULT_CAMERA_RADIUS;
        arcCamera.alpha = -Math.PI / 4;
        arcCamera.beta = Math.PI / 3.5;
        console.log('[Babylon3DCanvas] Camera reset to default position');
      }
    };

    eventBus.on(EditorEvents.CAMERA_RESET, handleCameraReset);

    return () => {
      eventBus.off(EditorEvents.CAMERA_RESET, handleCameraReset);
    };
  }, [floorplanData]);

  // GLB model loading and placement with click-to-place
  useEffect(() => {
    console.log('[Babylon3DCanvas] GLB useEffect triggered, glbModelFile:', glbModelFile?.name, 'scene:', !!sceneRef.current, 'canvas:', !!canvasRef.current);

    if (!glbModelFile || !sceneRef.current || !canvasRef.current) {
      console.log('[Babylon3DCanvas] GLB loading skipped - missing dependencies');
      return;
    }

    const scene = sceneRef.current;
    const canvas = canvasRef.current;

    // Cleanup previous model if exists
    if (loadedModelRef.current) {
      loadedModelRef.current.dispose();
      loadedModelRef.current = null;
    }

    // Create object URL from File
    const objectUrl = URL.createObjectURL(glbModelFile);

    console.log('[Babylon3DCanvas] Loading GLB file:', glbModelFile.name, 'from URL:', objectUrl);

    // Load GLB model - use objectUrl as sceneFilename with empty rootUrl
    SceneLoader.ImportMesh(
      '', // Load all meshes (empty = all)
      '', // Empty root URL
      objectUrl, // Full object URL as filename
      scene,
      (meshes) => {
        console.log('[Babylon3DCanvas] GLB loaded successfully:', meshes.length, 'meshes');
        if (meshes.length > 0) {
          console.log('[Babylon3DCanvas] First mesh:', meshes[0].name, 'position:', meshes[0].position);
        }

        if (meshes.length === 0) {
          console.warn('[Babylon3DCanvas] No meshes found in GLB file');
          return;
        }

        // Get root mesh (or parent)
        const rootMesh = meshes[0];
        loadedModelRef.current = rootMesh;

        // Initially hide model below ground (will be placed on click)
        rootMesh.position.y = -1000;

        // Make meshes pickable for future interaction
        meshes.forEach((mesh) => {
          mesh.isPickable = true;
        });

        console.log('[Babylon3DCanvas] GLB loaded. Click on floor to place.');

        // Add click handler for placement
        const handleCanvasClick = (event: PointerEvent) => {
          if (!loadedModelRef.current || !scene.activeCamera) return;

          // Get pick ray from mouse position
          const pickResult = scene.pick(event.offsetX, event.offsetY);

          if (pickResult && pickResult.hit && pickResult.pickedMesh) {
            const pickedMesh = pickResult.pickedMesh;

            // Check if clicked on floor (mesh name contains 'floor' or 'room')
            if (pickedMesh.name.toLowerCase().includes('floor') ||
              pickedMesh.name.toLowerCase().includes('room')) {

              const clickPosition = pickResult.pickedPoint;
              if (clickPosition && loadedModelRef.current) {
                // Find nearest wall for snap detection
                const snappedPosition = findNearestWallSnap(
                  clickPosition.x,
                  clickPosition.z,
                  wallMeshesRef.current
                );

                // Place model at clicked position (snapped if near wall)
                loadedModelRef.current.position.x = snappedPosition.x;
                loadedModelRef.current.position.z = snappedPosition.z;
                loadedModelRef.current.position.y = 0; // On floor

                console.log('[Babylon3DCanvas] Model placed at:', snappedPosition);
              }
            } else {
              console.log('[Babylon3DCanvas] Click on floor to place model');
            }
          }
        };

        canvas.addEventListener('click', handleCanvasClick);

        // Cleanup
        return () => {
          canvas.removeEventListener('click', handleCanvasClick);
        };
      },
      null, // onProgress
      (_scene, message, exception) => {
        console.error('[Babylon3DCanvas] GLB loading error!');
        console.error('[Babylon3DCanvas] Error message:', message);
        console.error('[Babylon3DCanvas] Error exception:', exception);
        alert('GLB 파일 로드 실패: ' + message + '\n콘솔을 확인하세요.');
      }
    );

    console.log('[Babylon3DCanvas] SceneLoader.ImportMesh called');

    // Cleanup object URL
    return () => {
      console.log('[Babylon3DCanvas] Cleaning up GLB object URL');
      URL.revokeObjectURL(objectUrl);
    };
  }, [glbModelFile]); // Remove floorplanData dependency - GLB can load independently

  // Photo-realistic rendering pipeline
  useEffect(() => {
    const scene = sceneRef.current;
    const sunLight = sunLightRef.current;

    if (!scene) return;

    console.log('[Babylon3DCanvas] Photo-realistic mode:', photoRealisticMode);

    if (photoRealisticMode) {
      // Set hardware scaling to 1.0 for maximum quality (no downscaling)
      const engine = engineRef.current;
      if (engine) {
        engine.setHardwareScalingLevel(1.0);
      }

      // Create high-quality rendering pipeline
      if (!pipelineRef.current) {
        console.log('[Babylon3DCanvas] Creating photo-realistic rendering pipeline...');

        const pipeline = new DefaultRenderingPipeline(
          'photoRealisticPipeline',
          true, // HDR enabled
          scene,
          scene.cameras
        );

        pipelineRef.current = pipeline;

        // Maximum quality anti-aliasing
        pipeline.samples = 8; // Increased from 4 to 8 for maximum smoothness

        const pipelineAny = pipeline as any;

        // Enable high-quality SSAO with maximum samples and noise reduction
        if (pipelineAny.ssaoEnabled !== undefined) {
          pipelineAny.ssaoEnabled = true;
        }
        if (pipelineAny.ssao2) {
          pipelineAny.ssao2.radius = 1.0; // Subtle ambient occlusion
          pipelineAny.ssao2.totalStrength = 1.5; // Moderate strength
          pipelineAny.ssao2.base = 0.2; // Minimum ambient occlusion
          pipelineAny.ssao2.samples = 64; // Maximum samples for smoothness
          pipelineAny.ssao2.textureSamples = 8; // High multi-sampling
          pipelineAny.ssao2.expensiveBlur = true;
          pipelineAny.ssao2.bilateralBlur = true;
          pipelineAny.ssao2.bilateralSoften = 0.02; // Very subtle softening
          pipelineAny.ssao2.bilateralTolerance = 0.00001; // Minimal tolerance for sharp edges
        }

        // Disable SSR (still causes artifacts)
        if (pipelineAny.screenSpaceReflectionsEnabled !== undefined) {
          pipelineAny.screenSpaceReflectionsEnabled = false;
        }

        // Enable subtle Bloom for realistic bright areas
        pipeline.bloomEnabled = true;
        if (pipelineAny.bloom) {
          pipelineAny.bloom.threshold = 0.9; // Only very bright areas glow
          pipelineAny.bloom.weight = 0.3; // Subtle glow
          pipelineAny.bloom.kernel = 128; // Large kernel for smooth glow
        }

        // Disable DOF (causes blur)
        pipeline.depthOfFieldEnabled = false;

        // High-quality image processing
        pipeline.imageProcessingEnabled = true;
        if (pipeline.imageProcessing) {
          pipeline.imageProcessing.toneMappingEnabled = true;
          pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; // Cinematic tone mapping
          pipeline.imageProcessing.exposure = 1.0;
          pipeline.imageProcessing.contrast = 1.05; // Very subtle contrast boost
          pipeline.imageProcessing.vignetteEnabled = false; // No vignette
        }

        // Disable visual noise effects
        pipeline.chromaticAberrationEnabled = false;
        pipeline.grainEnabled = false;

        // Enable subtle sharpening
        pipeline.sharpenEnabled = true;
        if (pipeline.sharpen) {
          pipeline.sharpen.edgeAmount = 0.1; // Very subtle sharpening
          pipeline.sharpen.colorAmount = 0.1;
        }

        // Enable FXAA
        pipeline.fxaaEnabled = true;

        console.log('[Babylon3DCanvas] ✅ Ultra-quality rendering pipeline created (8x MSAA, 64 SSAO samples, subtle bloom)');
      }

      // Create environment texture for PBR materials
      if (!scene.environmentTexture) {
        // Use skybox as environment reflection source
        const skybox = scene.getMeshByName('skybox');
        if (skybox && skybox.material instanceof SkyMaterial) {
          // Create procedural environment from skybox for reflections
          const hdrTexture = CubeTexture.CreateFromPrefilteredData(
            'https://assets.babylonjs.com/environments/environmentSpecular.env',
            scene
          );
          scene.environmentTexture = hdrTexture;
          console.log('[Babylon3DCanvas] ✅ HDR environment texture loaded for PBR reflections');
        }
      }

      // Enhance environment reflections for PBR materials
      if (scene.environmentIntensity !== 1.5) {
        scene.environmentIntensity = 1.5; // Boost environment reflections
        console.log('[Babylon3DCanvas] ✅ Environment intensity boosted for PBR reflections');
      }

      // Ultra shadow quality for photo-realistic mode
      if (sunLight) {
        const shadowGen = sunLight.getShadowGenerator() as ShadowGenerator | null;
        if (shadowGen) {
          shadowGen.mapSize = 8192; // Ultra quality 8K shadows (from 4096)
          shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
          shadowGen.contactHardeningLightSizeUVRatio = 0.025; // Softer contact shadows
          shadowGen.darkness = 0.35; // Subtle shadow darkness
          shadowGen.blurKernel = 128; // Maximum blur for ultra-soft shadows
          console.log('[Babylon3DCanvas] ✅ Shadow quality upgraded to 8192x8192 ultra quality');
        }
      }

    } else {
      // Disable photo-realistic pipeline
      if (pipelineRef.current) {
        console.log('[Babylon3DCanvas] Disabling photo-realistic pipeline...');
        pipelineRef.current.dispose();
        pipelineRef.current = null;
        console.log('[Babylon3DCanvas] ✅ Photo-realistic pipeline disabled');
      }

      // Reset scene image processing to defaults
      if (scene.imageProcessingConfiguration) {
        scene.imageProcessingConfiguration.toneMappingEnabled = false;
        scene.imageProcessingConfiguration.contrast = 1.0;
        scene.imageProcessingConfiguration.exposure = 1.0;
        scene.imageProcessingConfiguration.vignetteEnabled = false;
        console.log('[Babylon3DCanvas] ✅ Scene image processing reset to defaults');
      }

      // Remove environment texture
      if (scene.environmentTexture) {
        scene.environmentTexture.dispose();
        scene.environmentTexture = null;
        console.log('[Babylon3DCanvas] ✅ Environment texture removed');
      }

      // Reset environment intensity to standard
      if (scene.environmentIntensity !== 1.0) {
        scene.environmentIntensity = 1.0;
        console.log('[Babylon3DCanvas] ✅ Environment intensity reset to standard');
      }

      // Restore standard shadow quality
      if (sunLight) {
        const shadowGen = sunLight.getShadowGenerator() as ShadowGenerator | null;
        if (shadowGen) {
          shadowGen.mapSize = 4096; // Keep high quality even in standard mode
          shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
          shadowGen.darkness = 0.3;
          shadowGen.blurKernel = 64; // Keep smooth shadows
          console.log('[Babylon3DCanvas] ✅ Shadow quality restored to 4096x4096');
        }
      }
    }
  }, [photoRealisticMode]);

  // Update rendering settings in real-time without recreating pipeline
  useEffect(() => {
    if (!photoRealisticMode || !pipelineRef.current || !renderSettings) return;

    const pipeline = pipelineRef.current;
    const pipelineAny = pipeline as any;

    console.log('[Babylon3DCanvas] Updating rendering settings...', renderSettings);

    // Update SSAO
    if (pipelineAny.ssao2) {
      pipelineAny.ssao2.radius = renderSettings.ssaoRadius;
      pipelineAny.ssao2.totalStrength = renderSettings.ssaoStrength;
      console.log('[Babylon3DCanvas] SSAO updated:', renderSettings.ssaoRadius, renderSettings.ssaoStrength);
    }

    // Update SSR
    if (pipelineAny.screenSpaceReflections) {
      pipelineAny.screenSpaceReflections.strength = renderSettings.ssrStrength;
      console.log('[Babylon3DCanvas] SSR updated:', renderSettings.ssrStrength);
    }

    // Update Bloom
    if (pipelineAny.bloom) {
      pipelineAny.bloom.threshold = renderSettings.bloomThreshold;
      pipelineAny.bloom.weight = renderSettings.bloomWeight;
      console.log('[Babylon3DCanvas] Bloom updated:', renderSettings.bloomThreshold, renderSettings.bloomWeight);
    }

    // Update DOF
    if (pipeline.depthOfField) {
      pipeline.depthOfField.focusDistance = renderSettings.dofFocusDistance;
      pipeline.depthOfField.fStop = renderSettings.dofFStop;
      console.log('[Babylon3DCanvas] DOF updated:', renderSettings.dofFocusDistance, renderSettings.dofFStop);
    }

    // Update Image Processing
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.vignetteWeight = renderSettings.vignetteWeight;
      console.log('[Babylon3DCanvas] Vignette updated:', renderSettings.vignetteWeight);
    }

    // Update Chromatic Aberration
    if (pipeline.chromaticAberration) {
      pipeline.chromaticAberration.aberrationAmount = renderSettings.chromaticAberration;
      console.log('[Babylon3DCanvas] Chromatic Aberration updated:', renderSettings.chromaticAberration);
    }

    // Update Grain
    if (pipeline.grain) {
      pipeline.grain.intensity = renderSettings.grainIntensity;
      console.log('[Babylon3DCanvas] Grain updated:', renderSettings.grainIntensity);
    }

    // Update Sharpen
    if (pipeline.sharpen) {
      pipeline.sharpen.edgeAmount = renderSettings.sharpenAmount;
      pipeline.sharpen.colorAmount = renderSettings.sharpenAmount;
      console.log('[Babylon3DCanvas] Sharpen updated:', renderSettings.sharpenAmount);
    }

    console.log('[Babylon3DCanvas] ✅ All rendering settings updated');
  }, [
    photoRealisticMode,
    renderSettings?.ssaoRadius,
    renderSettings?.ssaoStrength,
    renderSettings?.ssrStrength,
    renderSettings?.bloomThreshold,
    renderSettings?.bloomWeight,
    renderSettings?.dofFocusDistance,
    renderSettings?.dofFStop,
    renderSettings?.chromaticAberration,
    renderSettings?.grainIntensity,
    renderSettings?.vignetteWeight,
    renderSettings?.sharpenAmount,
  ]);

  // Render lights in 3D scene with visual indicators
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    console.log('[Babylon3DCanvas] Updating lights, count:', lights?.length || 0);

    // Remove all existing light meshes and light objects
    const lightMeshes = scene.meshes.filter(mesh => mesh.name.startsWith('light_indicator_'));
    lightMeshes.forEach(mesh => mesh.dispose());

    const babylonLights = scene.lights.filter(light =>
      light.name.startsWith('userLight_') ||
      light.name.startsWith('pointLight_') ||
      light.name.startsWith('spotLight_') ||
      light.name.startsWith('directionalLight_')
    );
    babylonLights.forEach(light => light.dispose());

    if (!lights || lights.length === 0) {
      console.log('[Babylon3DCanvas] No lights to render');
      return;
    }

    // Create visual indicators and Babylon.js lights for each light
    lights.forEach((light) => {
      // Convert mm position to meters (Babylon units)
      const positionMeters = new Vector3(
        light.position.x * MM_TO_METERS,
        light.position.y * MM_TO_METERS,
        -light.position.z * MM_TO_METERS // Flip Z axis
      );

      // Create visual indicator mesh
      const indicatorColor = new Color3(
        light.color.r / 255,
        light.color.g / 255,
        light.color.b / 255
      );

      // Light indicator sphere (small glowing sphere)
      const indicator = MeshBuilder.CreateSphere(`light_indicator_${light.id}`, {
        diameter: 0.15 // 15cm diameter
      }, scene);
      indicator.position = positionMeters;
      indicator.metadata = { lightId: light.id, isLightIndicator: true }; // Store light ID

      const indicatorMat = new PBRMaterial(`light_indicator_mat_${light.id}`, scene);
      indicatorMat.albedoColor = indicatorColor;
      indicatorMat.emissiveColor = indicatorColor;
      indicatorMat.metallic = 0;
      indicatorMat.roughness = 0.3;
      indicator.material = indicatorMat;

      // Add glow to indicator
      const glowLayer = scene.getGlowLayerByName('glow');
      if (glowLayer) {
        glowLayer.addIncludedOnlyMesh(indicator);
      }

      // Make indicator clickable for gizmo manipulation
      indicator.isPickable = true;

      // Create Babylon.js light based on type
      if (!light.enabled) {
        console.log('[Babylon3DCanvas] Light', light.id, 'is disabled, skipping light creation');
        return;
      }

      const lightColor = new Color3(
        light.color.r / 255,
        light.color.g / 255,
        light.color.b / 255
      );

      if (light.type === 'point') {
        const pointLight = new PointLight(`pointLight_${light.id}`, positionMeters, scene);
        pointLight.intensity = light.intensity;
        pointLight.diffuse = lightColor;
        pointLight.specular = lightColor;
        if (light.range) {
          pointLight.range = light.range;
        }

        // Shadow generator for point light
        if (light.castShadows) {
          const shadowGen = new ShadowGenerator(1024, pointLight);
          shadowGen.useBlurExponentialShadowMap = true;
          shadowGen.blurKernel = 16;
        }

        console.log('[Babylon3DCanvas] Created PointLight:', light.id, 'at', positionMeters);
      } else if (light.type === 'spot') {
        const direction = light.direction ? new Vector3(
          light.direction.x,
          light.direction.y,
          -light.direction.z // Flip Z
        ) : new Vector3(0, -1, 0);

        const spotLight = new SpotLight(
          `spotLight_${light.id}`,
          positionMeters,
          direction,
          light.angle ? (light.angle * Math.PI / 180) : Math.PI / 4, // Convert degrees to radians
          2, // Exponent
          scene
        );
        spotLight.intensity = light.intensity;
        spotLight.diffuse = lightColor;
        spotLight.specular = lightColor;
        if (light.range) {
          spotLight.range = light.range;
        }

        // Shadow generator for spot light
        if (light.castShadows) {
          const shadowGen = new ShadowGenerator(1024, spotLight);
          shadowGen.useBlurExponentialShadowMap = true;
          shadowGen.blurKernel = 16;
        }

        console.log('[Babylon3DCanvas] Created SpotLight:', light.id, 'at', positionMeters, 'direction:', direction);
      } else if (light.type === 'directional') {
        const direction = light.direction ? new Vector3(
          light.direction.x,
          light.direction.y,
          -light.direction.z // Flip Z
        ) : new Vector3(0, -1, 0);

        const directionalLight = new DirectionalLight(
          `directionalLight_${light.id}`,
          direction,
          scene
        );
        directionalLight.position = positionMeters;
        directionalLight.intensity = light.intensity;
        directionalLight.diffuse = lightColor;
        directionalLight.specular = lightColor;

        // Shadow generator for directional light
        if (light.castShadows) {
          const shadowGen = new ShadowGenerator(1024, directionalLight);
          shadowGen.useBlurExponentialShadowMap = true;
          shadowGen.blurKernel = 16;
        }

        console.log('[Babylon3DCanvas] Created DirectionalLight:', light.id, 'at', positionMeters, 'direction:', direction);
      }
    });

    // Setup click handler for light indicator selection
    const gizmoManager = gizmoManagerRef.current;
    if (gizmoManager) {
      scene.onPointerObservable.add((pointerInfo) => {
        if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
          const pickResult = pointerInfo.pickInfo;

          if (pickResult && pickResult.hit && pickResult.pickedMesh) {
            const mesh = pickResult.pickedMesh;

            // Check if clicked mesh is a light indicator
            if (mesh.metadata && mesh.metadata.isLightIndicator) {
              console.log('[Babylon3DCanvas] Light indicator clicked:', mesh.metadata.lightId);

              // Attach gizmo to this mesh
              gizmoManager.attachToMesh(mesh);
              selectedLightMeshRef.current = mesh as Mesh;

              // Listen for position changes
              if (gizmoManager.gizmos.positionGizmo) {
                gizmoManager.gizmos.positionGizmo.onDragEndObservable.clear();
                gizmoManager.gizmos.positionGizmo.onDragEndObservable.add(() => {
                  const newPosition = mesh.position;
                  const lightId = mesh.metadata.lightId;

                  // Convert position back to mm
                  const newPositionMm = {
                    x: newPosition.x * 1000,
                    y: newPosition.y * 1000,
                    z: -newPosition.z * 1000
                  };

                  console.log('[Babylon3DCanvas] Light moved to:', newPositionMm);

                  // Update light position in parent component
                  if (onLightMoved) {
                    onLightMoved(lightId, newPositionMm);
                  }
                });
              }
            } else {
              // Clicked something else - detach gizmo
              gizmoManager.attachToMesh(null);
              selectedLightMeshRef.current = null;
            }
          } else {
            // Clicked empty space - detach gizmo
            gizmoManager.attachToMesh(null);
            selectedLightMeshRef.current = null;
          }
        }
      });
    }

    console.log('[Babylon3DCanvas] ✅ Rendered', lights.length, 'lights in 3D scene');
  }, [lights]);

  // Light placement mode - click to place lights
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;

    if (!scene || !canvas || !lightPlacementMode || !onLightPlaced || playMode) {
      if (lightPlacementMode && playMode) {
        console.log('[Babylon3DCanvas] ⚠️ Light placement disabled - playMode is active');
      }
      return;
    }

    console.log('[Babylon3DCanvas] ✅ Light placement mode active, type:', selectedLightType);

    // Create Ghost Light (Preview)
    let ghostLightMesh: Mesh | null = null;

    // Create a visual indicator for the ghost light
    const createGhostLight = () => {
      if (ghostLightMesh) return;

      // Create a sphere to represent the light
      ghostLightMesh = MeshBuilder.CreateSphere('ghostLight', { diameter: 0.3 }, scene);
      ghostLightMesh.isPickable = false; // Don't block clicks

      // Create material
      const material = new PBRMaterial('ghostLightMat', scene);
      material.emissiveColor = new Color3(1, 1, 0.5); // Warm yellow
      material.alpha = 0.5; // Semi-transparent
      material.unlit = true;
      ghostLightMesh.material = material;

      // Add a light source to it for preview effect? 
      // Maybe too heavy. Just the mesh is enough for positioning.
    };

    createGhostLight();

    const getPlacementPosition = (evt: PointerEvent | MouseEvent): Vector3 | null => {
      const pickResult = scene.pick(evt.offsetX, evt.offsetY);

      if (pickResult && pickResult.hit && pickResult.pickedPoint) {
        // Clicked on an object - use X,Z position but fix Y to ceiling height
        const pos = pickResult.pickedPoint.clone();
        pos.y = 2.4; // Ceiling height
        return pos;
      }

      // If no hit (empty space), project from camera
      const camera = scene.activeCamera;
      if (!camera) return null;

      const pickRay = scene.createPickingRay(evt.offsetX, evt.offsetY, null, camera);
      const distance = 5; // 5 meters from camera
      const pos = pickRay.origin.add(pickRay.direction.scale(distance));
      pos.y = 2.4; // Ceiling height
      return pos;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!ghostLightMesh) return;

      const pos = getPlacementPosition(event);
      if (pos) {
        ghostLightMesh.position = pos;
        ghostLightMesh.isVisible = true;
      } else {
        ghostLightMesh.isVisible = false;
      }
    };

    const handleLightPlacement = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!scene || !onLightPlaced) return;

      console.log('[Babylon3DCanvas] 🖱️ Click detected at', event.offsetX, event.offsetY);

      const clickPosition = getPlacementPosition(event);

      if (!clickPosition) return;

      // Convert Babylon position (meters) to mm coordinates for Light object
      const lightPosition = {
        x: clickPosition.x * 1000, // meters to mm
        y: clickPosition.y * 1000, // meters to mm (always 2400mm = ceiling)
        z: -clickPosition.z * 1000 // meters to mm (flip Z back)
      };

      console.log('[Babylon3DCanvas] Light placement position (mm):', lightPosition);

      // Create light with default settings for selected type
      const newLight = createDefaultLight(selectedLightType, lightPosition);

      // Call callback to add light to state
      onLightPlaced(newLight);

      console.log('[Babylon3DCanvas] ✅ Light placed:', newLight.type, 'at', lightPosition);
    };

    console.log('[Babylon3DCanvas] 📌 Registering click event listener for light placement');
    canvas.addEventListener('click', handleLightPlacement);
    canvas.addEventListener('pointermove', handlePointerMove);

    return () => {
      console.log('[Babylon3DCanvas] 🗑️ Removing click event listener for light placement');
      canvas.removeEventListener('click', handleLightPlacement);
      canvas.removeEventListener('pointermove', handlePointerMove);

      // Cleanup ghost light
      if (ghostLightMesh) {
        ghostLightMesh.dispose();
        ghostLightMesh = null;
      }
    };
  }, [lightPlacementMode, selectedLightType, onLightPlaced, playMode]);

  // Apply display style to all meshes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    console.log('[Babylon3DCanvas] Applying display style:', displayStyle);
    console.log('[Babylon3DCanvas] Scene meshes:', scene.meshes.map(m => ({ name: m.name, hasMaterial: !!m.material })));

    scene.meshes.forEach((mesh) => {
      if (!mesh.material) return;

      const material = mesh.material;
      const isFloor = mesh.name.startsWith('floor_');
      const isWall = mesh.name.startsWith('wall');

      console.log(`[Babylon3DCanvas] Processing mesh: ${mesh.name}, isFloor: ${isFloor}, isWall: ${isWall}`);

      // Store original properties if not already stored
      if (!(material as any)._originalProps) {
        (material as any)._originalProps = {
          albedoColor: material instanceof PBRMaterial ? material.albedoColor?.clone() : null,
          diffuseColor: material instanceof StandardMaterial ? material.diffuseColor?.clone() : null,
          albedoTexture: material instanceof PBRMaterial ? material.albedoTexture : null,
          diffuseTexture: material instanceof StandardMaterial ? material.diffuseTexture : null,
          alpha: material.alpha,
          wireframe: material.wireframe,
          transparencyMode: material.transparencyMode
        };
      }

      const originalProps = (material as any)._originalProps;

      switch (displayStyle) {
        case 'white':
          // 화이트 모델: 모든 표면 연한 회색 (음영 있음)
          material.wireframe = false;
          material.alpha = 1.0;
          material.transparencyMode = originalProps.transparencyMode;
          mesh.disableEdgesRendering();

          if (material instanceof PBRMaterial) {
            material.albedoTexture = null;
            material.albedoColor = new Color3(0.85, 0.85, 0.85); // 연한 회색
          } else if (material instanceof StandardMaterial) {
            material.diffuseTexture = null;
            material.diffuseColor = new Color3(0.85, 0.85, 0.85);
          }
          break;

        case 'transparent':
          // 투명 (Hidden Line): 벽 거의 투명, 선만 강조
          material.wireframe = false;
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 1.5;
          mesh.edgesColor = new Color4(0.2, 0.2, 0.2, 1);

          if (material instanceof PBRMaterial) {
            material.albedoTexture = null;
            material.albedoColor = new Color3(0.9, 0.9, 0.9);
            material.alpha = isWall ? 0.05 : 0.3; // 벽은 거의 투명
          } else if (material instanceof StandardMaterial) {
            material.diffuseTexture = null;
            material.diffuseColor = new Color3(0.9, 0.9, 0.9);
            material.alpha = isWall ? 0.05 : 0.3;
          }
          material.transparencyMode = 2; // ALPHABLEND
          break;

        case 'sketch':
          // 스케치: 바닥만 나무 텍스처, 벽은 연한 회색
          material.wireframe = false;
          material.alpha = 1.0;
          material.transparencyMode = originalProps.transparencyMode;
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 1.0;
          mesh.edgesColor = new Color4(0.3, 0.3, 0.3, 1);

          if (isFloor) {
            // 바닥: 나무 텍스처 복원
            if (material instanceof PBRMaterial) {
              material.albedoTexture = originalProps.albedoTexture;
              material.albedoColor = originalProps.albedoColor || Color3.White();
            } else if (material instanceof StandardMaterial) {
              material.diffuseTexture = originalProps.diffuseTexture;
              material.diffuseColor = originalProps.diffuseColor || Color3.White();
            }
          } else {
            // 벽: 연한 회색
            if (material instanceof PBRMaterial) {
              material.albedoTexture = null;
              material.albedoColor = new Color3(0.88, 0.88, 0.88);
            } else if (material instanceof StandardMaterial) {
              material.diffuseTexture = null;
              material.diffuseColor = new Color3(0.88, 0.88, 0.88);
            }
          }
          break;

        case 'material':
        default:
          // 재질: 바닥은 나무 텍스처, 벽은 하얀색
          material.wireframe = false;
          material.alpha = 1.0;
          material.transparencyMode = originalProps.transparencyMode;
          mesh.disableEdgesRendering();

          if (isFloor) {
            // 바닥: 나무 텍스처
            if (material instanceof PBRMaterial) {
              material.albedoTexture = originalProps.albedoTexture;
              material.albedoColor = originalProps.albedoColor || Color3.White();
            } else if (material instanceof StandardMaterial) {
              material.diffuseTexture = originalProps.diffuseTexture;
              material.diffuseColor = originalProps.diffuseColor || Color3.White();
            }
          } else {
            // 벽: 하얀색
            if (material instanceof PBRMaterial) {
              material.albedoTexture = null;
              material.albedoColor = Color3.White();
            } else if (material instanceof StandardMaterial) {
              material.diffuseTexture = null;
              material.diffuseColor = Color3.White();
            }
          }
          break;
      }
    });
  }, [displayStyle]);

  // Update grid visibility when showGrid changes
  useEffect(() => {
    const gridMesh = infiniteGridRef.current;
    if (gridMesh) {
      gridMesh.setEnabled(showGrid);
      console.log('[Babylon3DCanvas] Grid visibility:', showGrid);
    }
  }, [showGrid]);

  // Apply camera settings in real-time (only in play mode)
  useEffect(() => {
    if (!playMode) return;

    const fpsCamera = fpsCameraRef.current;
    const pipeline = pipelineRef.current;
    const engine = engineRef.current;
    const canvas = canvasRef.current;

    if (!fpsCamera || !engine || !canvas) return;

    console.log('[Babylon3DCanvas] Applying camera settings:', cameraSettings);

    // 1. Projection Type
    const arcCamera = arcCameraRef.current;
    if (cameraSettings.projectionType === 'orthographic') {
      fpsCamera.mode = 1; // Camera.ORTHOGRAPHIC_CAMERA
      if (arcCamera) {
        arcCamera.mode = 1;
        // Auto-calculate orthographic bounds based on viewport
        const aspectRatio = canvas.width / canvas.height;
        const orthoSize = 10; // 10 meters view size
        arcCamera.orthoLeft = -orthoSize * aspectRatio;
        arcCamera.orthoRight = orthoSize * aspectRatio;
        arcCamera.orthoTop = orthoSize;
        arcCamera.orthoBottom = -orthoSize;
      }

      // Auto-calculate orthographic bounds based on viewport
      const aspectRatio = canvas.width / canvas.height;
      const orthoSize = 10; // 10 meters view size
      fpsCamera.orthoLeft = -orthoSize * aspectRatio;
      fpsCamera.orthoRight = orthoSize * aspectRatio;
      fpsCamera.orthoTop = orthoSize;
      fpsCamera.orthoBottom = -orthoSize;
    } else {
      fpsCamera.mode = 0; // Camera.PERSPECTIVE_CAMERA
      if (arcCamera) arcCamera.mode = 0;
    }

    // 2. Field of View (Horizontal → Vertical conversion)
    const aspectRatio = canvas.width / canvas.height;
    const verticalFov = horizontalFovToVertical(cameraSettings.horizontalFov, aspectRatio);
    fpsCamera.fov = verticalFov;

    // 3. Exposure (only if pipeline exists)
    if (pipeline && pipeline.imageProcessing) {
      if (cameraSettings.autoExposure) {
        // Auto exposure
        pipeline.imageProcessing.toneMappingEnabled = true;
        pipeline.imageProcessing.exposure = 1.0;
      } else {
        // Manual exposure
        pipeline.imageProcessing.toneMappingEnabled = true;
        // Map 0-100% to 0.5-1.5 exposure range
        const exposure = 0.5 + (cameraSettings.exposure / 100);
        pipeline.imageProcessing.exposure = exposure;
      }

      // 4. Depth of Field
      if (cameraSettings.depthOfField > 0) {
        pipeline.depthOfFieldEnabled = true;
        // @ts-ignore - Babylon.js typing issue
        if (pipeline.depthOfField) {
          // Map 0-100% to focal length (0-200mm equivalent)
          // @ts-ignore
          pipeline.depthOfField.focalLength = cameraSettings.depthOfField * 2;
          // @ts-ignore
          pipeline.depthOfField.fStop = 1.4; // Wide aperture for more blur
          // @ts-ignore
          pipeline.depthOfField.focusDistance = 3000; // Focus at 3m
        }
      } else {
        pipeline.depthOfFieldEnabled = false;
      }
    }

    console.log('[Babylon3DCanvas] Camera settings applied successfully');
  }, [
    playMode,
    cameraSettings.projectionType,
    cameraSettings.horizontalFov,
    cameraSettings.autoExposure,
    cameraSettings.exposure,
    cameraSettings.depthOfField,
  ]);

  // Handle mobile controls (Touch mode or Joystick mode)
  useEffect(() => {
    if (!playMode) return;

    const canvas = canvasRef.current;
    const fpsCamera = fpsCameraRef.current;
    const scene = sceneRef.current;
    if (!canvas || !fpsCamera || !scene) return;

    // ===== TOUCH MODE (ShapeSpark style) =====
    if (controlMode === 'touch') {
      let lastTouchX = 0;
      let lastTouchY = 0;
      let isTouching = false;

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
        isTouching = true;
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (!isTouching || e.touches.length !== 1) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchX;
        const deltaY = touch.clientY - lastTouchY;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        // Rotate camera: horizontal drag = yaw, vertical drag = pitch
        const rotationSensitivity = 0.003;
        fpsCamera.rotation.y -= deltaX * rotationSensitivity;
        fpsCamera.rotation.x -= deltaY * rotationSensitivity;

        // Limit vertical rotation to avoid gimbal lock
        const maxPitch = Math.PI / 2.5; // ~72 degrees up/down
        fpsCamera.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, fpsCamera.rotation.x));
      };

      const handleTouchEnd = () => {
        isTouching = false;
      };

      canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: true });
      canvas.addEventListener('touchcancel', handleTouchEnd, { passive: true });

      return () => {
        canvas.removeEventListener('touchstart', handleTouchStart);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchend', handleTouchEnd);
        canvas.removeEventListener('touchcancel', handleTouchEnd);
      };
    }

    // ===== JOYSTICK MODE =====
    if (controlMode === 'joystick') {
      const leftJoystickElement = document.getElementById('joystick-left');
      const rightJoystickElement = document.getElementById('joystick-right');

      if (!leftJoystickElement || !rightJoystickElement) return;

      // Joystick state
      let leftJoystickActive = false;
      let rightJoystickActive = false;
      let leftJoystickDelta = { x: 0, y: 0 };
      let rightJoystickDelta = { x: 0, y: 0 };

      // Helper function to calculate joystick delta
      const getJoystickDelta = (element: HTMLElement, touch: Touch) => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = touch.clientX - centerX;
        const deltaY = touch.clientY - centerY;

        // Limit to joystick radius
        const maxRadius = rect.width / 2;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const clampedDistance = Math.min(distance, maxRadius);

        if (distance === 0) return { x: 0, y: 0 };

        const angle = Math.atan2(deltaY, deltaX);
        return {
          x: (Math.cos(angle) * clampedDistance) / maxRadius,
          y: (Math.sin(angle) * clampedDistance) / maxRadius
        };
      };

      // Update joystick stick visual position
      const updateJoystickStick = (element: HTMLElement, delta: { x: number; y: number }) => {
        const stick = element.querySelector('.joystickStick') as HTMLElement;
        if (!stick) return;

        const maxOffset = 35; // pixels
        const offsetX = delta.x * maxOffset;
        const offsetY = delta.y * maxOffset;

        stick.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
      };

      // Touch event handlers
      const handleTouchStart = (e: TouchEvent) => {
        Array.from(e.touches).forEach((touch) => {
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (!target) return;

          if (leftJoystickElement.contains(target)) {
            leftJoystickActive = true;
            leftJoystickDelta = getJoystickDelta(leftJoystickElement, touch);
            updateJoystickStick(leftJoystickElement, leftJoystickDelta);
          } else if (rightJoystickElement.contains(target)) {
            rightJoystickActive = true;
            rightJoystickDelta = getJoystickDelta(rightJoystickElement, touch);
            updateJoystickStick(rightJoystickElement, rightJoystickDelta);
          }
        });
      };

      const handleTouchMove = (e: TouchEvent) => {
        Array.from(e.touches).forEach((touch) => {
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (!target) return;

          if (leftJoystickActive && leftJoystickElement.contains(target)) {
            leftJoystickDelta = getJoystickDelta(leftJoystickElement, touch);
            updateJoystickStick(leftJoystickElement, leftJoystickDelta);
          } else if (rightJoystickActive && rightJoystickElement.contains(target)) {
            rightJoystickDelta = getJoystickDelta(rightJoystickElement, touch);
            updateJoystickStick(rightJoystickElement, rightJoystickDelta);
          }
        });
      };

      const handleTouchEnd = (e: TouchEvent) => {
        const remainingTouches = Array.from(e.touches);

        // Check if left joystick is still touched
        const leftStillTouched = remainingTouches.some((touch) => {
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          return target && leftJoystickElement.contains(target);
        });

        if (!leftStillTouched && leftJoystickActive) {
          leftJoystickActive = false;
          leftJoystickDelta = { x: 0, y: 0 };
          updateJoystickStick(leftJoystickElement, leftJoystickDelta);
        }

        // Check if right joystick is still touched
        const rightStillTouched = remainingTouches.some((touch) => {
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          return target && rightJoystickElement.contains(target);
        });

        if (!rightStillTouched && rightJoystickActive) {
          rightJoystickActive = false;
          rightJoystickDelta = { x: 0, y: 0 };
          updateJoystickStick(rightJoystickElement, rightJoystickDelta);
        }
      };

      // Apply joystick movement and rotation in render loop
      const renderLoopObserver = scene.onBeforeRenderObservable.add(() => {
        // Left joystick - Movement (collision detection via checkCollisions=true)
        if (leftJoystickActive) {
          const movementSpeed = 0.03; // Reduced from 0.1 for better control
          const forward = fpsCamera.getDirection(new Vector3(0, 0, 1));
          const right = fpsCamera.getDirection(new Vector3(1, 0, 0));

          forward.y = 0;
          right.y = 0;
          forward.normalize();
          right.normalize();

          const movement = forward
            .scale(-leftJoystickDelta.y * movementSpeed)
            .add(right.scale(leftJoystickDelta.x * movementSpeed));

          // Collision detection handled by fpsCamera.checkCollisions = true
          fpsCamera.position.addInPlace(movement);
        }

        // Right joystick - Rotation
        if (rightJoystickActive) {
          const rotationSpeed = 0.02; // Reduced from 0.05 for smoother control
          fpsCamera.rotation.y -= rightJoystickDelta.x * rotationSpeed;
        }
      });

      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
      document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

      return () => {
        scene.onBeforeRenderObservable.remove(renderLoopObserver);
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        document.removeEventListener('touchcancel', handleTouchEnd);
      };
    }
  }, [playMode, controlMode]);

  return (
    <div className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        tabIndex={0}
        style={{ outline: 'none' }}
      />
    </div>
  );
});

export default Babylon3DCanvas;
