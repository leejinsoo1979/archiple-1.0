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
import '@babylonjs/loaders/glTF';
import earcut from 'earcut';
import styles from './Babylon3DCanvas.module.css';
import { eventBus } from '../core/events/EventBus';
import { EditorEvents } from '../core/events/EditorEvents';

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

const Babylon3DCanvas = ({ floorplanData, visible = true, sunSettings, playMode = false }: Babylon3DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const sunLightRef = useRef<DirectionalLight | null>(null);
  const arcCameraRef = useRef<ArcRotateCamera | null>(null);
  const fpsCameraRef = useRef<UniversalCamera | null>(null);
  const thirdPersonCameraRef = useRef<FollowCamera | null>(null);
  const characterRef = useRef<AbstractMesh | null>(null);
  const animationsRef = useRef<AnimationGroup[]>([]);

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
      fpsCamera.keysUp.push(87); // W
      fpsCamera.keysDown.push(83); // S
      fpsCamera.keysLeft.push(65); // A
      fpsCamera.keysRight.push(68); // D
      fpsCamera.checkCollisions = true;
      fpsCamera.applyGravity = false;
      fpsCamera.ellipsoid = new Vector3(0.5, 0.9, 0.5); // Collision ellipsoid (radius)

      console.log('[Babylon3DCanvas] FPS Camera created with keys:', {
        keysUp: fpsCamera.keysUp,
        keysDown: fpsCamera.keysDown,
        keysLeft: fpsCamera.keysLeft,
        keysRight: fpsCamera.keysRight
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

    // Create walls - split if doors present
    walls.forEach((wall, wallIndex) => {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);
      if (!startPoint || !endPoint) return;

      const wallThicknessMM = wall.thickness;
      const wallHeightMM = wall.height || 2400;

      // Find doors on this wall
      const wallDoors = doors.filter((door: any) => door.wallId === wall.id);

      if (wallIndex === 0) {
        console.log('[Babylon3DCanvas] Wall door check:', {
          wallId: wall.id,
          totalDoors: doors.length,
          wallDoors: wallDoors.length,
          doors: wallDoors
        });
      }

      // Convert to meters (flip Z axis for correct orientation)
      const startX = startPoint.x * MM_TO_METERS - centerX;
      const startZ = -(startPoint.y * MM_TO_METERS) - centerZ;
      const endX = endPoint.x * MM_TO_METERS - centerX;
      const endZ = -(endPoint.y * MM_TO_METERS) - centerZ;

      const dx = endX - startX;
      const dz = endZ - startZ;
      const wallLengthM = Math.sqrt(dx * dx + dz * dz);
      const wallThickness = wallThicknessMM * MM_TO_METERS;
      const wallHeight = wallHeightMM * MM_TO_METERS;

      const angle = Math.atan2(dz, dx);

      // Set face colors: top face = black
      const faceColors = new Array(6);
      faceColors[4] = new Color3(0, 0, 0);

      if (wallDoors.length === 0) {
        // No doors - full wall
        const extendedLength = wallLengthM + wallThickness;

        const wallMesh = MeshBuilder.CreateBox(
          `wall_${wallIndex}`,
          {
            width: extendedLength,
            height: wallHeight,
            depth: wallThickness,
            faceColors: faceColors,
          },
          scene
        );

        wallMesh.rotation.y = -angle;
        wallMesh.position = new Vector3(
          (startX + endX) / 2,
          wallHeight / 2,
          (startZ + endZ) / 2
        );

        wallMesh.material = wallMaterial;
        wallMesh.receiveShadows = true;
        wallMesh.checkCollisions = true;

        if (shadowGenerator) {
          shadowGenerator.addShadowCaster(wallMesh);
        }
      } else {
        // Has doors - split wall (NO EXTENSION - use original wall length)
        const openings: Array<{ start: number; end: number }> = [];

        wallDoors.forEach((door: any) => {
          const doorWidthM = door.width * MM_TO_METERS;
          const halfWidth = doorWidthM / 2;
          // door.position is 0-1 normalized along ORIGINAL wall length
          const openingStart = Math.max(0, door.position - halfWidth / wallLengthM);
          const openingEnd = Math.min(1, door.position + halfWidth / wallLengthM);
          openings.push({ start: openingStart, end: openingEnd });
        });

        openings.sort((a, b) => a.start - b.start);
        const merged: Array<{ start: number; end: number }> = [];
        openings.forEach(opening => {
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

        merged.forEach(opening => {
          if (currentPos < opening.start) {
            const segStart = currentPos;
            const segEnd = opening.start;
            const segLength = (segEnd - segStart) * wallLengthM;

            const segStartX = startX + dx * segStart;
            const segStartZ = startZ + dz * segStart;
            const segEndX = startX + dx * segEnd;
            const segEndZ = startZ + dz * segEnd;

            const segMesh = MeshBuilder.CreateBox(
              `wall_${wallIndex}_seg_${segIndex++}`,
              {
                width: segLength,
                height: wallHeight,
                depth: wallThickness,
                faceColors: faceColors,
              },
              scene
            );

            segMesh.rotation.y = -angle;
            segMesh.position = new Vector3(
              (segStartX + segEndX) / 2,
              wallHeight / 2,
              (segStartZ + segEndZ) / 2
            );

            segMesh.material = wallMaterial;
            segMesh.receiveShadows = true;
            segMesh.checkCollisions = true;

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
          const segLength = (segEnd - segStart) * wallLengthM;

          const segStartX = startX + dx * segStart;
          const segStartZ = startZ + dz * segStart;

          const segMesh = MeshBuilder.CreateBox(
            `wall_${wallIndex}_seg_${segIndex}`,
            {
              width: segLength,
              height: wallHeight,
              depth: wallThickness,
              faceColors: faceColors,
            },
            scene
          );

          segMesh.rotation.y = -angle;
          segMesh.position = new Vector3(
            (segStartX + endX) / 2,
            wallHeight / 2,
            (segStartZ + endZ) / 2
          );

          segMesh.material = wallMaterial;
          segMesh.receiveShadows = true;
          segMesh.checkCollisions = true;

          if (shadowGenerator) {
            shadowGenerator.addShadowCaster(segMesh);
          }
        }
      }
    });

    console.log('[Babylon3DCanvas] Created', walls.length, '3D walls');

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
      return;
    }

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

      // Attach controls
      setTimeout(() => {
        fpsCamera.attachControl(canvas, true);
        canvas.focus();
        console.log('[Babylon3DCanvas] FPS Camera activated and focused');
      }, 100);

      let lastCameraPos = fpsCamera.position.clone();

      scene.onBeforeRenderObservable.add(() => {
        if (!fpsCamera || !character) return;

        // Sync character position for collision
        const cameraDelta = fpsCamera.position.subtract(lastCameraPos);

        if (cameraDelta.length() > 0.001) {
          console.log('[Babylon3DCanvas] FPS Camera moved:', cameraDelta);
        }

        character.position.x += cameraDelta.x;
        character.position.z += cameraDelta.z;
        character.position.y = 0;

        character.rotation.y = fpsCamera.rotation.y;
        lastCameraPos = fpsCamera.position.clone();

        // Walking bob
        const keys = (fpsCamera as any)._keys;
        const isMoving = keys && (keys.forward || keys.backward || keys.left || keys.right);

        if (isMoving) {
          const time = performance.now() * 0.01;
          fpsCamera.position.y = DEFAULT_CAMERA_HEIGHT + Math.sin(time) * 0.015;
        } else {
          fpsCamera.position.y = DEFAULT_CAMERA_HEIGHT;
        }
      });

      return () => {
        scene.onBeforeRenderObservable.clear();
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

      // Attach controls and disable keyboard
      setTimeout(() => {
        arcCamera.attachControl(canvas, true);
        arcCamera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
        canvas.focus();
        console.log('[Babylon3DCanvas] 3D Camera activated and keyboard disabled');
      }, 100);

      // Character controls
      const inputMap: { [key: string]: boolean } = {};
      const onKeyDown = (evt: KeyboardEvent) => {
        const key = evt.key.toLowerCase();
        inputMap[key] = true;
        console.log('[Babylon3DCanvas] 3D Mode Key Down:', key, 'inputMap:', inputMap);
      };
      const onKeyUp = (evt: KeyboardEvent) => {
        const key = evt.key.toLowerCase();
        inputMap[key] = false;
        console.log('[Babylon3DCanvas] 3D Mode Key Up:', key);
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      console.log('[Babylon3DCanvas] 3D Mode keyboard listeners attached');

      const moveSpeed = 0.05;
      const rotateSpeed = 0.03;

      scene.onBeforeRenderObservable.add(() => {
        if (!character) return;

        let moved = false;

        // Rotation
        if (inputMap['a']) {
          character.rotation.y += rotateSpeed;
          console.log('[Babylon3DCanvas] Rotating left');
        }
        if (inputMap['d']) {
          character.rotation.y -= rotateSpeed;
          console.log('[Babylon3DCanvas] Rotating right');
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
          console.log('[Babylon3DCanvas] Moving forward, pos:', character.position);
        }
        if (inputMap['s']) {
          character.position.addInPlace(forward.scale(-moveSpeed));
          moved = true;
          console.log('[Babylon3DCanvas] Moving backward, pos:', character.position);
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
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        scene.onBeforeRenderObservable.clear();
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
