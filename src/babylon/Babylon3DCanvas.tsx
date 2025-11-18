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
  Color4,
  Texture,
  DirectionalLight,
  ShadowGenerator,
  HemisphericLight,
  GlowLayer,
  VertexData,
  Mesh,
  SceneLoader,
  AbstractMesh,
  FollowCamera,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
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
  calculateBasicWallCorners,
  calculateSegmentCorners,
  type WallCorners,
} from './utils/WallMiterUtils';
import type { Wall } from '../core/types/Wall';
import type { Light, LightType } from '../core/types/Light';

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
  photoRealisticMode?: boolean;
  lights?: Light[];
  lightPlacementMode?: boolean;
  selectedLightType?: LightType;
  onLightPlaced?: (light: Light) => void;
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

const Babylon3DCanvas = ({
  floorplanData,
  visible = true,
  sunSettings,
  playMode = false,
  showCharacter = false,
  glbModelFile,
  photoRealisticMode = false,
  lights = [],
  lightPlacementMode = false,
  selectedLightType = 'point',
  onLightPlaced
}: Babylon3DCanvasProps) => {
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
    frameMaterial.albedoColor = new Color3(0.4, 0.3, 0.2); // 다크 브라운
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
    doorLeafMaterial.albedoColor = new Color3(0.85, 0.7, 0.5); // 밝은 나무색
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
      swing: swing // 열림방향 저장
    };

    console.log('[Babylon3DCanvas] Created door:', name, 'at position', doorCenter3D);

    return { doorGroup, doorLeaf, hotspot };
  };

  // Update 3D scene when floorplan data changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !floorplanData) return;

    console.log('[Babylon3DCanvas] Updating 3D scene from 2D data...', floorplanData);

    // Remove ALL old meshes (walls, floors, ceilings, doors, corners)
    const meshesToRemove = scene.meshes.filter(mesh =>
      mesh.name.startsWith('wall') ||
      mesh.name.startsWith('floor_') ||
      mesh.name.startsWith('ceiling_') ||
      mesh.name.startsWith('door_') ||
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
    wallMaterial.useVertexColor = false; // 모든 벽 세그먼트 동일한 색상

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

    // Create walls with proper miter joints using WallMiterUtils
    walls.forEach((wall, wallIndex) => {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);
      if (!startPoint || !endPoint) return;

      const wallHeightMM = wall.height || 2400;

      // Find doors on this wall
      const wallDoors = doors.filter((door: any) => door.wallId === wall.id);

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

      // If wall has doors, subtract door openings using CSG
      if (wallDoors.length > 0) {
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
          const openingBox = MeshBuilder.CreateBox(`temp_opening`, {
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

        // Convert CSG back to mesh
        wallMesh.dispose();
        wallMesh = wallCSG.toMesh(`wall_${wallIndex}`, wallMaterial, scene);
      }

      // Finalize wall mesh (with or without doors)
      wallMesh.receiveShadows = true;
      wallMesh.checkCollisions = true;
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

      // Hide all hotspots first
      scene.meshes.forEach((mesh) => {
        if (mesh.name.includes('_hotspot') && mesh.material) {
          (mesh.material as PBRMaterial).alpha = 0;
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

          // Show hotspot
          if (doorLeaf && doorLeaf.metadata && doorLeaf.metadata.hotspot) {
            const hotspot = doorLeaf.metadata.hotspot as Mesh;
            if (hotspot.material) {
              (hotspot.material as PBRMaterial).alpha = 0.8; // Show hotspot
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
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('pointermove', handlePointerMove as any);
      canvas.addEventListener('pointerdown', handlePointerDown as any);

      return () => {
        canvas.removeEventListener('pointermove', handlePointerMove as any);
        canvas.removeEventListener('pointerdown', handlePointerDown as any);
      };
    }
  }, [floorplanData, playMode]);

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

        // Enable SSAO (Screen Space Ambient Occlusion) for realistic shadows
        pipeline.ssaoEnabled = true;
        if (pipeline.ssao2) {
          pipeline.ssao2.radius = 1.0;
          pipeline.ssao2.totalStrength = 1.3;
          pipeline.ssao2.expensiveBlur = true;
          pipeline.ssao2.samples = 32;
          pipeline.ssao2.maxZ = 250;
        }

        // Enable Screen Space Reflections
        pipeline.screenSpaceReflectionsEnabled = true;
        if (pipeline.screenSpaceReflections) {
          pipeline.screenSpaceReflections.strength = 0.5;
          pipeline.screenSpaceReflections.reflectionSpecularFalloffExponent = 3;
          pipeline.screenSpaceReflections.threshold = 0.5;
          pipeline.screenSpaceReflections.roughnessFactor = 0.1;
        }

        // Enable Bloom for bright highlights
        pipeline.bloomEnabled = true;
        if (pipeline.bloom) {
          pipeline.bloom.threshold = 0.8;
          pipeline.bloom.weight = 0.3;
          pipeline.bloom.kernel = 64;
        }

        // Enable Depth of Field for camera focus effect
        pipeline.depthOfFieldEnabled = true;
        if (pipeline.depthOfField) {
          pipeline.depthOfField.focusDistance = 5000; // 5m focus distance
          pipeline.depthOfField.focalLength = 50; // 50mm lens
          pipeline.depthOfField.fStop = 2.8; // f/2.8 aperture
        }

        // Enable Image Processing with advanced tone mapping
        pipeline.imageProcessingEnabled = true;
        if (pipeline.imageProcessing) {
          pipeline.imageProcessing.toneMappingEnabled = true;
          pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; // ACES tone mapping
          pipeline.imageProcessing.exposure = 1.0;
          pipeline.imageProcessing.contrast = 1.1;
          pipeline.imageProcessing.vignetteEnabled = true;
          pipeline.imageProcessing.vignetteWeight = 1.5;
          pipeline.imageProcessing.vignetteStretch = 0.5;
          pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
          pipeline.imageProcessing.vignetteCameraFov = 0.8;
        }

        // Enable Chromatic Aberration for lens effect
        pipeline.chromaticAberrationEnabled = true;
        if (pipeline.chromaticAberration) {
          pipeline.chromaticAberration.aberrationAmount = 3; // Reduced from 30 to avoid rainbow artifacts
        }

        // Enable Grain for film-like quality
        pipeline.grainEnabled = true;
        if (pipeline.grain) {
          pipeline.grain.intensity = 5; // Reduced from 10 for subtle film grain
          pipeline.grain.animated = true;
        }

        // Sharpen for enhanced detail
        pipeline.sharpenEnabled = true;
        if (pipeline.sharpen) {
          pipeline.sharpen.edgeAmount = 0.3;
          pipeline.sharpen.colorAmount = 0.3;
        }

        console.log('[Babylon3DCanvas] ✅ Photo-realistic pipeline created with SSAO, SSR, Bloom, DOF, ACES tone mapping');
      }

      // Upgrade shadow quality
      if (sunLight) {
        const shadowGen = sunLight.getShadowGenerator();
        if (shadowGen) {
          shadowGen.mapSize = 4096; // Increase from 2048 to 4096
          shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
          shadowGen.contactHardeningLightSizeUVRatio = 0.05;
          shadowGen.darkness = 0.4;
          console.log('[Babylon3DCanvas] ✅ Shadow quality upgraded to 4096x4096');
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

      // Restore standard shadow quality
      if (sunLight) {
        const shadowGen = sunLight.getShadowGenerator();
        if (shadowGen) {
          shadowGen.mapSize = 2048; // Standard quality
          shadowGen.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
          shadowGen.darkness = 0.3;
          console.log('[Babylon3DCanvas] ✅ Shadow quality restored to standard');
        }
      }
    }
  }, [photoRealisticMode]);

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

    console.log('[Babylon3DCanvas] ✅ Rendered', lights.length, 'lights in 3D scene');
  }, [lights]);

  // Light placement mode - click to place lights
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;

    if (!scene || !canvas || !lightPlacementMode || !onLightPlaced) {
      return;
    }

    console.log('[Babylon3DCanvas] Light placement mode active, type:', selectedLightType);

    const handleLightPlacement = (event: PointerEvent) => {
      if (!scene || !onLightPlaced) return;

      console.log('[Babylon3DCanvas] Light placement click detected');

      // Get pick ray from mouse position
      const pickResult = scene.pick(event.offsetX, event.offsetY);

      let clickPosition: Vector3;

      if (pickResult && pickResult.hit && pickResult.pickedPoint) {
        // Clicked on an object - use that position
        clickPosition = pickResult.pickedPoint;
        console.log('[Babylon3DCanvas] Clicked on object at:', clickPosition);
      } else {
        // Clicked on empty space - place at camera direction, 5 meters away, at height 1.5m
        const camera = scene.activeCamera;
        if (!camera) return;

        const pickRay = scene.createPickingRay(event.offsetX, event.offsetY, null, camera);
        const distance = 5; // 5 meters from camera
        clickPosition = pickRay.origin.add(pickRay.direction.scale(distance));
        clickPosition.y = 1.5; // Fix height at 1.5 meters (typical ceiling light height)

        console.log('[Babylon3DCanvas] Clicked on empty space, placing at camera direction:', clickPosition);
      }

      // Convert Babylon position (meters) to mm coordinates for Light object
      const lightPosition = {
        x: clickPosition.x * 1000, // meters to mm
        y: clickPosition.y * 1000, // meters to mm
        z: -clickPosition.z * 1000 // meters to mm (flip Z back)
      };

      console.log('[Babylon3DCanvas] Light placement position (mm):', lightPosition);

      // Create light with default settings for selected type
      const { createDefaultLight } = require('../core/types/Light');
      const newLight = createDefaultLight(selectedLightType, lightPosition);

      // Call callback to add light to state
      onLightPlaced(newLight);

      console.log('[Babylon3DCanvas] ✅ Light placed:', newLight.type, 'at', lightPosition);
    };

    canvas.addEventListener('click', handleLightPlacement);

    return () => {
      canvas.removeEventListener('click', handleLightPlacement);
    };
  }, [lightPlacementMode, selectedLightType, onLightPlaced]);

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
