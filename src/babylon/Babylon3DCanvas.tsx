import { useEffect, useRef } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  Vector3,
  MeshBuilder,
  PolygonMeshBuilder,
  PBRMaterial,
  Color3,
  Texture,
  DirectionalLight,
  ShadowGenerator,
  HemisphericLight,
  GlowLayer,
  VertexData,
  Mesh,
  SceneLoader,
  AbstractMesh,
  AnimationGroup,
  FollowCamera
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
  calculateSegmentCorners,
  type WallCorners,
} from './utils/WallMiterUtils';
import type { Wall } from '../core/types/Wall';
import type { Point } from '../core/types/Point';

// Make earcut available globally for Babylon.js polygon operations
if (typeof window !== 'undefined') {
  (window as any).earcut = earcut;
}
(PolygonMeshBuilder as any).earcut = earcut;

interface Babylon3DCanvasProps {
  floorplanData?: { points: any[]; walls: any[]; rooms: any[]; doors?: any[]; floorplan?: any } | null;
  visible?: boolean;
  sunSettings?: {
    intensity: number;
    azimuth: number;
    altitude: number;
  };
  playMode?: boolean;
  showCharacter?: boolean;
  glbModelFile?: File | null;
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
    const wallThickness = wallMesh.scaling.z; // Thickness along Z

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

const Babylon3DCanvas = ({ floorplanData, visible = true, sunSettings, playMode = false, showCharacter = false, glbModelFile }: Babylon3DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const arcCameraRef = useRef<ArcRotateCamera | null>(null);
  const fpsCameraRef = useRef<UniversalCamera | null>(null);
  const thirdPersonCameraRef = useRef<FollowCamera | null>(null);
  const characterRef = useRef<AbstractMesh | null>(null);
  const animationsRef = useRef<AnimationGroup[]>([]);
  const loadedModelRef = useRef<AbstractMesh | null>(null); // Store loaded GLB model
  const wallMeshesRef = useRef<Mesh[]>([]); // Store wall meshes for snap detection

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
      // Create engine
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      engineRef.current = engine;

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
      fpsCamera.speed = 0.3; // Movement speed
      fpsCamera.angularSensibility = 2000; // Mouse sensitivity

      // Set WASD keys (key codes)
      fpsCamera.keysUp = [87]; // W
      fpsCamera.keysDown = [83]; // S
      fpsCamera.keysLeft = [65]; // A
      fpsCamera.keysRight = [68]; // D

      fpsCamera.checkCollisions = true;
      fpsCamera.applyGravity = false;
      fpsCamera.ellipsoid = new Vector3(0.5, 0.9, 0.5); // Collision ellipsoid (radius)

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

      // Shadow generator
      const shadowGenerator = new ShadowGenerator(2048, sunLight);
      shadowGenerator.useBlurExponentialShadowMap = true;
      shadowGenerator.blurKernel = 32;
      shadowGenerator.darkness = 0.3;

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
        gridMaterial.mainColor = new Color3(0.8, 0.8, 0.8); // Light gray background
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

      createInfiniteGrid();

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
      engine.runRenderLoop(() => {
        scene.render();
      });

      // Handle resize
      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      console.log('[Babylon3DCanvas] Initialized successfully');

      // Cleanup
      return () => {
        console.log('[Babylon3DCanvas] Cleaning up...');
        window.removeEventListener('resize', handleResize);
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
   */
  const createWallMeshFromCorners = (
    corners: WallCorners,
    height: number,
    centerX: number,
    centerZ: number,
    name: string,
    scene: Scene
  ): Mesh => {
    const MM_TO_METERS = 0.001;
    const wallHeight = height * MM_TO_METERS;

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

    // 8개 vertex (바닥 4개 + 천장 4개)
    // 바닥 (y=0)
    positions.push(c1.x, 0, c1.z); // 0
    positions.push(c2.x, 0, c2.z); // 1
    positions.push(c3.x, 0, c3.z); // 2
    positions.push(c4.x, 0, c4.z); // 3

    // 천장 (y=wallHeight)
    positions.push(c1.x, wallHeight, c1.z); // 4
    positions.push(c2.x, wallHeight, c2.z); // 5
    positions.push(c3.x, wallHeight, c3.z); // 6
    positions.push(c4.x, wallHeight, c4.z); // 7

    // Indices (각 면마다 2개의 삼각형)
    // 바닥 (시계방향) - submesh 0
    indices.push(0, 2, 1);
    indices.push(0, 3, 2);

    // 천장 (반시계방향 - 위에서 보면 시계방향) - submesh 0
    indices.push(4, 5, 6);
    indices.push(4, 6, 7);

    // 측면 4개
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

    // Normals 자동 계산
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;

    const mesh = new Mesh(name, scene);
    vertexData.applyToMesh(mesh);

    return mesh;
  };

  // Update 3D scene when floorplan data changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !floorplanData) return;

    console.log('[Babylon3DCanvas] Updating 3D scene from 2D data...', floorplanData);

    // Remove ALL old meshes (walls, floors, ceilings, corners, ceiling edges)
    const meshesToRemove = scene.meshes.filter(mesh =>
      mesh.name.startsWith('wall') ||
      mesh.name.startsWith('floor_') ||
      mesh.name.startsWith('ceiling_') ||
      mesh.name.startsWith('corner_')
    );
    meshesToRemove.forEach((mesh) => {
      console.log('[Babylon3DCanvas] Removing mesh:', mesh.name);
      mesh.dispose();
    });

    const { points, walls, doors = [], floorplan: _floorplan } = floorplanData;
    console.log('[Babylon3DCanvas] Points:', points?.length, 'Walls:', walls?.length, 'Doors:', doors?.length);
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

    // Create walls with Miter Joints - split if doors present
    walls.forEach((wall, wallIndex) => {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);
      if (!startPoint || !endPoint) return;

      const wallHeightMM = wall.height || 2400;

      // Find doors on this wall
      const wallDoors = doors.filter((door: any) => door.wallId === wall.id);

      if (wallIndex === 0) {
        console.log('[Babylon3DCanvas] Wall door check:', {
          wallId: wall.id,
          totalDoors: doors.length,
          wallDoors: wallDoors.length,
          doors: wallDoors,
        });
      }

      // Find connected walls and calculate miter joint corners
      const connections = findConnectedWalls(walls as Wall[], wall as Wall, pointMap);
      const corners = calculateWallCorners(wall as Wall, connections, pointMap);

      if (!corners) {
        console.error('[Babylon3DCanvas] Failed to calculate corners for wall:', wall.id);
        return;
      }

      if (wallDoors.length === 0) {
        // No doors - create full wall with miter joints
        const wallMesh = createWallMeshFromCorners(
          corners,
          wallHeightMM,
          centerX,
          centerZ,
          `wall_${wallIndex}`,
          scene
        );

        wallMesh.material = wallMaterial;
        wallMesh.receiveShadows = true;
        wallMesh.checkCollisions = true;

        // Store wall mesh for snap detection
        wallMeshesRef.current.push(wallMesh);

        if (shadowGenerator) {
          shadowGenerator.addShadowCaster(wallMesh);
        }
      } else {
        // Has doors - split wall into segments
        const openings: Array<{ start: number; end: number }> = [];

        // Calculate wall length
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        const wallLengthMM = Math.sqrt(dx * dx + dy * dy);

        wallDoors.forEach((door: any) => {
          const doorWidthMM = door.width;
          const halfWidth = doorWidthMM / 2;
          // door.position is 0-1 normalized along wall length
          const openingStart = Math.max(0, door.position - halfWidth / wallLengthMM);
          const openingEnd = Math.min(1, door.position + halfWidth / wallLengthMM);
          openings.push({ start: openingStart, end: openingEnd });
        });

        openings.sort((a, b) => a.start - b.start);
        const merged: Array<{ start: number; end: number }> = [];
        openings.forEach((opening) => {
          if (merged.length === 0) {
            merged.push(opening);
          } else {
            const last = merged[merged.length - 1];
            if (opening.start <= last.end) {
              last.end = Math.max(last.end, opening.end);
            } else {
              merged.push(opening);
            }
          }
        });

        // Create segments
        let currentPos = 0;
        let segIndex = 0;

        merged.forEach((opening) => {
          if (currentPos < opening.start) {
            const segStart = currentPos;
            const segEnd = opening.start;

            // Calculate segment corners
            const segCorners = calculateSegmentCorners(corners, segStart, segEnd);

            const segMesh = createWallMeshFromCorners(
              segCorners,
              wallHeightMM,
              centerX,
              centerZ,
              `wall_${wallIndex}_seg_${segIndex++}`,
              scene
            );

            segMesh.material = wallMaterial;
            segMesh.receiveShadows = true;
            segMesh.checkCollisions = true;

            // Store wall segment mesh for snap detection
            wallMeshesRef.current.push(segMesh);

            if (shadowGenerator) {
              shadowGenerator.addShadowCaster(segMesh);
            }
          }
          currentPos = opening.end;
        });

        // Final segment
        if (currentPos < 1) {
          const segStart = currentPos;
          const segEnd = 1;

          const segCorners = calculateSegmentCorners(corners, segStart, segEnd);

          const segMesh = createWallMeshFromCorners(
            segCorners,
            wallHeightMM,
            centerX,
            centerZ,
            `wall_${wallIndex}_seg_${segIndex}`,
            scene
          );

          segMesh.material = wallMaterial;
          segMesh.receiveShadows = true;
          segMesh.checkCollisions = true;

          // Store wall segment mesh for snap detection
          wallMeshesRef.current.push(segMesh);

          if (shadowGenerator) {
            shadowGenerator.addShadowCaster(segMesh);
          }
        }
      }
    });

    console.log('[Babylon3DCanvas] Created', walls.length, '3D walls,', wallMeshesRef.current.length, 'wall meshes for snap detection');

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
    }
  }, [floorplanData]);

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
      // ====== 3D VIEW MODE: Isometric orbit control ======
      console.log('[Babylon3DCanvas] 3D View Mode: Isometric orbit');

      const planMetrics = computePlanMetrics(floorplanData?.points);
      if (planMetrics) {
        character.position = new Vector3(
          planMetrics.centerX,
          0,
          planMetrics.centerZ
        );
        character.rotation.y = 0;

        // Setup isometric orbit camera
        arcCamera.setTarget(new Vector3(planMetrics.centerX, 0, planMetrics.centerZ));
        arcCamera.alpha = Math.PI / 4; // 45 degrees horizontal
        arcCamera.beta = Math.PI / 3; // 60 degrees from top (isometric)
        arcCamera.radius = 10;
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
      (scene, message, exception) => {
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
};

export default Babylon3DCanvas;
