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
import styles from './Babylon3DCanvas.module.css';

interface Babylon3DCanvasProps {
  floorplanData?: { points: any[]; walls: any[]; rooms: any[] } | null;
  visible?: boolean;
}

const Babylon3DCanvas = ({ floorplanData, visible = true }: Babylon3DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

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

      // Create camera with smooth controls
      const camera = new ArcRotateCamera(
        'camera',
        -Math.PI / 4,
        Math.PI / 3.5,
        20,
        new Vector3(0, 1.5, 0),
        scene
      );
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 5;
      camera.upperRadiusLimit = 150;
      camera.upperBetaLimit = Math.PI / 2.05;
      camera.wheelPrecision = 20;
      camera.panningSensibility = 200; // Slower panning (higher = slower)
      camera.inertia = 0.9;
      camera.angularSensibilityX = 1000;
      camera.angularSensibilityY = 1000;

      // Advanced lighting setup
      // 1. Ambient light
      const hemisphericLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
      hemisphericLight.intensity = 0.7;
      hemisphericLight.groundColor = new Color3(0.5, 0.5, 0.55);

      // 2. Main directional light (sun) with shadows
      const sunLight = new DirectionalLight('sunLight', new Vector3(-1, -2, -1), scene);
      sunLight.position = new Vector3(20, 40, 20);
      sunLight.intensity = 1.5;
      sunLight.diffuse = new Color3(1, 1, 1);
      sunLight.specular = new Color3(1, 1, 1);

      // Shadow generator
      const shadowGenerator = new ShadowGenerator(2048, sunLight);
      shadowGenerator.useBlurExponentialShadowMap = true;
      shadowGenerator.blurKernel = 32;
      shadowGenerator.darkness = 0.3;

      // Create high-quality ground with PBR material
      const ground = MeshBuilder.CreateGround('ground', { width: 200, height: 200, subdivisions: 50 }, scene);
      ground.position.y = 0;
      ground.receiveShadows = true;

      // PBR Ground material with subtle grid
      const groundMaterial = new PBRMaterial('groundMat', scene);
      groundMaterial.albedoColor = new Color3(0.95, 0.95, 0.96);
      groundMaterial.metallic = 0.0;
      groundMaterial.roughness = 0.8;
      groundMaterial.environmentIntensity = 0.5;

      // Subtle grid texture
      const gridTexture = new Texture('data:image/svg+xml;base64,' + btoa(`
        <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(0,0,0,0.03)" stroke-width="0.5"/>
            </pattern>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <rect width="50" height="50" fill="url(#smallGrid)"/>
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)"/>
        </svg>
      `), scene);
      gridTexture.uScale = 200;
      gridTexture.vScale = 200;
      groundMaterial.albedoTexture = gridTexture;
      ground.material = groundMaterial;

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

    const { points, walls } = floorplanData;
    console.log('[Babylon3DCanvas] Points:', points?.length, 'Walls:', walls?.length);
    if (!walls || walls.length === 0) return;

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

    // Create floor material (wood texture)
    const floorMaterial = new PBRMaterial('floorMat_2d', scene);
    floorMaterial.albedoColor = new Color3(0.8, 0.65, 0.45);
    floorMaterial.metallic = 0.0;
    floorMaterial.roughness = 0.7;
    floorMaterial.environmentIntensity = 0.5;

    // Create walls from 2D data
    // Units: wall.thickness and wall.height are in mm
    const PIXELS_PER_METER = 20;
    const MM_TO_METERS = 0.001; // 1mm = 0.001m

    walls.forEach((wall, index) => {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);

      if (startPoint && endPoint) {
        // Convert 2D coordinates to 3D
        // 2D: x,y in pixels  →  3D: x,z in meters (y=height)
        const x1 = (startPoint.x / PIXELS_PER_METER) - 10; // Center at origin
        const z1 = (startPoint.y / PIXELS_PER_METER) - 10;
        const x2 = (endPoint.x / PIXELS_PER_METER) - 10;
        const z2 = (endPoint.y / PIXELS_PER_METER) - 10;

        // Calculate wall dimensions
        const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const angle = Math.atan2(z2 - z1, x2 - x1);

        // Convert mm to meters
        const wallHeightMeters = (wall.height || 2800) * MM_TO_METERS; // default 2800mm = 2.8m
        const thicknessMeters = (wall.thickness || 200) * MM_TO_METERS; // default 200mm = 0.2m

        console.log(`[Babylon3DCanvas] Wall ${index}:`, {
          start: { x: startPoint.x, y: startPoint.y },
          end: { x: endPoint.x, y: endPoint.y },
          '3D': { x1, z1, x2, z2 },
          length,
          position: { x: midX, z: midZ },
          angle: angle * (180 / Math.PI),
          heightMm: wall.height || 2800,
          thicknessMm: wall.thickness || 200,
        });

        // Create wall mesh
        const wallMesh = MeshBuilder.CreateBox(
          `wall_${index}`,
          { width: length, height: wallHeightMeters, depth: thicknessMeters },
          scene
        );

        // Position and rotate
        wallMesh.position.set(midX, wallHeightMeters / 2, midZ);
        wallMesh.rotation.y = angle;
        wallMesh.material = wallMaterial;
        wallMesh.receiveShadows = true;

        // Add to shadow casters
        if (shadowGenerator) {
          shadowGenerator.addShadowCaster(wallMesh);
        }
      } else {
        console.warn(`[Babylon3DCanvas] Missing point for wall ${index}:`, {
          startId: wall.startPointId,
          endId: wall.endPointId,
          hasStart: !!startPoint,
          hasEnd: !!endPoint,
        });
      }
    });

    console.log('[Babylon3DCanvas] Created', walls.length, '3D walls from 2D data');

    // Create wall corner joints (boxes at connection points) for clean 3D corners
    const connectedPoints = new Map<string, any>();
    walls.forEach((wall) => {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);

      if (startPoint && startPoint.connectedWalls && startPoint.connectedWalls.length > 1) {
        connectedPoints.set(startPoint.id, startPoint);
      }
      if (endPoint && endPoint.connectedWalls && endPoint.connectedWalls.length > 1) {
        connectedPoints.set(endPoint.id, endPoint);
      }
    });

    connectedPoints.forEach((point) => {
      // Find the thickest wall connected to this point
      let maxThickness = 200; // default 200mm
      let maxHeight = 2800; // default 2800mm

      if (point.connectedWalls) {
        point.connectedWalls.forEach((wallId: string) => {
          const wall = walls.find((w) => w.id === wallId);
          if (wall) {
            maxThickness = Math.max(maxThickness, wall.thickness || 200);
            maxHeight = Math.max(maxHeight, wall.height || 2800);
          }
        });
      }

      const thicknessMeters = maxThickness * MM_TO_METERS;
      const heightMeters = maxHeight * MM_TO_METERS;

      // Convert point position to 3D
      const x = (point.x / PIXELS_PER_METER) - 10;
      const z = (point.y / PIXELS_PER_METER) - 10;

      // Create a box at the corner
      const cornerJoint = MeshBuilder.CreateBox(
        `corner_${point.id}`,
        { width: thicknessMeters, height: heightMeters, depth: thicknessMeters },
        scene
      );

      cornerJoint.position.set(x, heightMeters / 2, z);
      cornerJoint.material = wallMaterial;
      cornerJoint.receiveShadows = true;

      if (shadowGenerator) {
        shadowGenerator.addShadowCaster(cornerJoint);
      }
    });

    console.log('[Babylon3DCanvas] Created', connectedPoints.size, 'corner joints');

    // Create floors for each room
    const { rooms } = floorplanData;
    if (rooms && rooms.length > 0) {
      rooms.forEach((room, roomIndex) => {
        // Get room boundary points
        const roomPoints = room.points.map((pid: string) => {
          const p = pointMap.get(pid);
          if (!p) return null;
          return {
            x: (p.x / PIXELS_PER_METER) - 10,
            z: (p.y / PIXELS_PER_METER) - 10
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
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Create floor
        const floor = MeshBuilder.CreateGround(
          `floor_${roomIndex}`,
          { width, height: depth, subdivisions: 1 },
          scene
        );
        floor.position.set(centerX, 0.01, centerZ);
        floor.material = floorMaterial;
        floor.receiveShadows = true;

        // Create ceiling (at wall height, typically 2.8m)
        const ceilingHeight = 2.8; // meters
        const ceiling = MeshBuilder.CreateGround(
          `ceiling_${roomIndex}`,
          { width, height: depth, subdivisions: 1 },
          scene
        );
        ceiling.position.set(centerX, ceilingHeight, centerZ);
        ceiling.rotation.x = Math.PI; // Flip upside down
        ceiling.material = ceilingMaterial;

        // Create ceiling edge rim (black cross-section border)
        const edgeThickness = 0.05; // 5cm thick edge
        const edgeHeight = 0.02; // 2cm height

        // Create 4 edge pieces (top, bottom, left, right)
        const edgeTop = MeshBuilder.CreateBox(
          `ceiling_edge_top_${roomIndex}`,
          { width, height: edgeHeight, depth: edgeThickness },
          scene
        );
        edgeTop.position.set(centerX, ceilingHeight - edgeHeight/2, maxZ + edgeThickness/2);
        edgeTop.material = ceilingEdgeMaterial;

        const edgeBottom = MeshBuilder.CreateBox(
          `ceiling_edge_bottom_${roomIndex}`,
          { width, height: edgeHeight, depth: edgeThickness },
          scene
        );
        edgeBottom.position.set(centerX, ceilingHeight - edgeHeight/2, minZ - edgeThickness/2);
        edgeBottom.material = ceilingEdgeMaterial;

        const edgeLeft = MeshBuilder.CreateBox(
          `ceiling_edge_left_${roomIndex}`,
          { width: edgeThickness, height: edgeHeight, depth: depth },
          scene
        );
        edgeLeft.position.set(minX - edgeThickness/2, ceilingHeight - edgeHeight/2, centerZ);
        edgeLeft.material = ceilingEdgeMaterial;

        const edgeRight = MeshBuilder.CreateBox(
          `ceiling_edge_right_${roomIndex}`,
          { width: edgeThickness, height: edgeHeight, depth: depth },
          scene
        );
        edgeRight.position.set(maxX + edgeThickness/2, ceilingHeight - edgeHeight/2, centerZ);
        edgeRight.material = ceilingEdgeMaterial;
      });

      console.log('[Babylon3DCanvas] Created floors and ceilings for', rooms.length, 'rooms');
    }
  }, [floorplanData]);

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
