import { useEffect, useRef } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  MeshBuilder,
  PBRMaterial,
  Color3,
  Texture,
  CubeTexture,
  DirectionalLight,
  ShadowGenerator,
  HemisphericLight,
  GlowLayer
} from '@babylonjs/core';
import earcut from 'earcut';
import styles from './Babylon3DCanvas.module.css';

// Make earcut available for ExtrudePolygon
(window as any).earcut = earcut;

interface Babylon3DCanvasProps {
  floorplanData?: { points: any[]; walls: any[]; rooms: any[]; floorplan?: any } | null;
  visible?: boolean;
  sunSettings?: {
    intensity: number;
    azimuth: number;
    altitude: number;
  };
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
    const worldZ = point.y * MM_TO_METERS;

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

const Babylon3DCanvas = ({ floorplanData, visible = true, sunSettings }: Babylon3DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const arcCameraRef = useRef<ArcRotateCamera | null>(null);

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
      scene.clearColor = new Color3(0.95, 0.95, 0.97).toColor4(1);
      scene.ambientColor = new Color3(0.3, 0.3, 0.3);
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

    const { points, walls, floorplan } = floorplanData;
    console.log('[Babylon3DCanvas] Points:', points?.length, 'Walls:', walls?.length);
    if (!walls || walls.length === 0) return;

    const planMetrics = computePlanMetrics(points);
    const centerX = planMetrics?.centerX ?? 0;
    const centerZ = planMetrics?.centerZ ?? 0;
    const boundingRadius = planMetrics?.boundingRadius ?? 15;

    if (planMetrics && arcCameraRef.current) {
      const arcCamera = arcCameraRef.current;
      const maxWallHeight = walls.reduce((max, wall) => Math.max(max, wall.height || 2800), 2800);
      const targetY = Math.max((maxWallHeight * MM_TO_METERS) / 2, DEFAULT_CAMERA_HEIGHT);

      // Camera target at floor level (Y=0) to see room properly
      arcCamera.setTarget(new Vector3(0, 0, 0));

      // CRITICAL FIX: 작은 방(< 1m)을 위한 카메라 거리 자동 조정
      const roomSize = Math.max(planMetrics.extentX, planMetrics.extentZ);
      const optimalRadius = roomSize < 2 ? roomSize * 3 : boundingRadius;

      const minRadius = Math.max(0.5, optimalRadius * 0.6);
      const maxRadius = Math.max(minRadius * 4, optimalRadius * 2.5);
      arcCamera.lowerRadiusLimit = minRadius;
      arcCamera.upperRadiusLimit = maxRadius;
      arcCamera.radius = optimalRadius;

      console.log('[Babylon3DCanvas] Camera setup:', {
        target: arcCamera.target,
        radius: arcCamera.radius,
        planMetrics: { centerX, centerZ, boundingRadius },
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
    diffuseTexture.uScale = 0.01; // Scale to meters
    diffuseTexture.vScale = 0.01;
    diffuseTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    diffuseTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.albedoTexture = diffuseTexture;

    const glossTexture = new Texture('/texture/floor/f2 gloss.png', scene);
    glossTexture.uScale = 0.01;
    glossTexture.vScale = 0.01;
    glossTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    glossTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.metallicTexture = glossTexture;
    floorMaterial.useMetallnessFromMetallicTextureBlue = false;
    floorMaterial.useRoughnessFromMetallicTextureGreen = false;
    floorMaterial.useRoughnessFromMetallicTextureAlpha = true;

    const normalTexture = new Texture('/texture/floor/f2 normal.png', scene);
    normalTexture.uScale = 0.01;
    normalTexture.vScale = 0.01;
    normalTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    normalTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.bumpTexture = normalTexture;

    // Create walls using simple CreateBox (works reliably)
    walls.forEach((wall, index) => {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);
      if (!startPoint || !endPoint) return;

      const wallThicknessMM = wall.thickness;
      const wallHeightMM = wall.height || 2800;

      // Convert to meters
      const start = new Vector3(
        startPoint.x * MM_TO_METERS - centerX,
        wallHeightMM * MM_TO_METERS / 2,
        startPoint.y * MM_TO_METERS - centerZ
      );
      const end = new Vector3(
        endPoint.x * MM_TO_METERS - centerX,
        wallHeightMM * MM_TO_METERS / 2,
        endPoint.y * MM_TO_METERS - centerZ
      );

      const wallDirection = end.subtract(start);
      const wallLength = wallDirection.length();
      const wallThickness = wallThicknessMM * MM_TO_METERS;
      const wallHeight = wallHeightMM * MM_TO_METERS;

      const wallMesh = MeshBuilder.CreateBox(
        `wall_${index}`,
        {
          width: wallLength,
          height: wallHeight,
          depth: wallThickness,
        },
        scene
      );

      // Calculate rotation
      const angle = Math.atan2(wallDirection.z, wallDirection.x);
      wallMesh.rotation.y = -angle;

      // Position at center
      wallMesh.position = start.add(end).scale(0.5);

      wallMesh.material = wallMaterial;
      wallMesh.receiveShadows = true;
      wallMesh.checkCollisions = true;

      if (shadowGenerator) {
        shadowGenerator.addShadowCaster(wallMesh);
      }
    });

    console.log('[Babylon3DCanvas] Created', walls.length, '3D walls with miter joints');

    // Create floors for each room
    const { rooms } = floorplanData;
    if (rooms && rooms.length > 0) {
      rooms.forEach((room, roomIndex) => {
        // Get room boundary points
        const roomPoints = room.points.map((pid: string) => {
          const p = pointMap.get(pid);
          if (!p) return null;
          return {
            x: p.x * MM_TO_METERS - centerX,
            z: p.y * MM_TO_METERS - centerZ,
          };
        }).filter((p: any) => p !== null);

        if (roomPoints.length < 3) return;

        // Calculate bounding box for floor
        const minX = Math.min(...roomPoints.map((p: any) => p.x));
        const maxX = Math.max(...roomPoints.map((p: any) => p.x));
        const minZ = Math.min(...roomPoints.map((p: any) => p.z));
        const maxZ = Math.max(...roomPoints.map((p: any) => p.z));

        const width = maxX - minX;
        const depth = maxZ - minZ;
        const floorCenterX = (minX + maxX) / 2;
        const floorCenterZ = (minZ + maxZ) / 2;

        // Create floor
        const floor = MeshBuilder.CreateGround(
          `floor_${roomIndex}`,
          { width, height: depth, subdivisions: 1 },
          scene
        );
        floor.position.set(floorCenterX, 0.01, floorCenterZ);

        // Clone material for each floor to have independent texture scaling
        const roomFloorMat = floorMaterial.clone(`floorMat_room_${roomIndex}`);
        if (roomFloorMat.albedoTexture) {
          // Scale texture: 1 repeat = 1 meter
          roomFloorMat.albedoTexture.uScale = width; // width in meters
          roomFloorMat.albedoTexture.vScale = depth; // depth in meters
        }
        floor.material = roomFloorMat;
        floor.receiveShadows = true;

        console.log(`[Babylon3DCanvas] Floor ${roomIndex} size:`, {
          width_m: width,
          depth_m: depth,
          width_mm: width * 1000,
          depth_mm: depth * 1000,
        });
      });

      console.log('[Babylon3DCanvas] Created floors for', rooms.length, 'rooms');
    }
  }, [floorplanData]);

  // Update sun light when settings change
  useEffect(() => {
    const sunLight = sunLightRef.current;
    if (!sunLight || !sunSettings) return;

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
  }, [sunSettings]);

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

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default Babylon3DCanvas;
