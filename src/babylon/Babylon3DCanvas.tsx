import { useEffect, useRef } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Texture
} from '@babylonjs/core';
import styles from './Babylon3DCanvas.module.css';

interface Babylon3DCanvasProps {
  floorplanData?: { points: any[]; walls: any[]; rooms: any[] } | null;
}

const Babylon3DCanvas = ({ floorplanData }: Babylon3DCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('[Babylon3DCanvas] Initializing Babylon.js...');

    const initScene = () => {
      // Create engine
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
      });
      engineRef.current = engine;

      // Create scene
      const scene = new Scene(engine);
      scene.clearColor.set(0.85, 0.9, 0.95, 1); // Sky blue background
      sceneRef.current = scene;

      // Create camera
      const camera = new ArcRotateCamera(
        'camera',
        -Math.PI / 4, // Alpha (horizontal rotation) - diagonal view
        Math.PI / 3.5, // Beta (vertical rotation) - looking down at angle
        15, // Radius - farther out
        new Vector3(0, 1, 0), // Target slightly above ground
        scene
      );
      camera.attachControl(canvas, true);
      camera.lowerRadiusLimit = 3;
      camera.upperRadiusLimit = 100;
      camera.upperBetaLimit = Math.PI / 2.1; // Don't go below ground
      camera.wheelPrecision = 50;
      camera.panningSensibility = 50;

      // Create lights
      const hemisphericLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
      hemisphericLight.intensity = 0.6;

      const directionalLight = new HemisphericLight('dirLight', new Vector3(1, -0.5, 0.5), scene);
      directionalLight.intensity = 0.4;

      // Create ground with grid material
      const ground = MeshBuilder.CreateGround('ground', { width: 50, height: 50, subdivisions: 50 }, scene);
      ground.position.y = 0;

      // Create grid material for ground
      const groundMaterial = new StandardMaterial('groundMat', scene);
      groundMaterial.diffuseColor = new Color3(0.95, 0.95, 0.95);
      groundMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

      // Create grid texture
      const gridTexture = new Texture('data:image/svg+xml;base64,' + btoa(`
        <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#d0d0d0" stroke-width="0.5"/>
            </pattern>
            <pattern id="majorGrid" width="50" height="50" patternUnits="userSpaceOnUse">
              <rect width="50" height="50" fill="url(#grid)"/>
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#a0a0a0" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#majorGrid)"/>
        </svg>
      `), scene);
      gridTexture.uScale = 50;
      gridTexture.vScale = 50;
      groundMaterial.diffuseTexture = gridTexture;
      ground.material = groundMaterial;

      // Create sample room with walls
      const wallHeight = 2.8;
      const wallThickness = 0.2;
      const wallMaterial = new StandardMaterial('wallMat', scene);
      wallMaterial.diffuseColor = new Color3(0.95, 0.95, 0.9);
      wallMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

      // Back wall
      const wall1 = MeshBuilder.CreateBox('wall1', { width: 6, height: wallHeight, depth: wallThickness }, scene);
      wall1.position.set(0, wallHeight / 2, -3);
      wall1.material = wallMaterial;

      // Left wall
      const wall2 = MeshBuilder.CreateBox('wall2', { width: wallThickness, height: wallHeight, depth: 6 }, scene);
      wall2.position.set(-3, wallHeight / 2, 0);
      wall2.material = wallMaterial;

      // Right wall with door opening
      const wall3a = MeshBuilder.CreateBox('wall3a', { width: wallThickness, height: wallHeight, depth: 2 }, scene);
      wall3a.position.set(3, wallHeight / 2, -2);
      wall3a.material = wallMaterial;

      const wall3b = MeshBuilder.CreateBox('wall3b', { width: wallThickness, height: wallHeight, depth: 2 }, scene);
      wall3b.position.set(3, wallHeight / 2, 2);
      wall3b.material = wallMaterial;

      const wall3c = MeshBuilder.CreateBox('wall3c', { width: wallThickness, height: wallHeight - 2.1, depth: 2 }, scene);
      wall3c.position.set(3, wallHeight - (wallHeight - 2.1) / 2, 0);
      wall3c.material = wallMaterial;

      // Front wall with window
      const wall4a = MeshBuilder.CreateBox('wall4a', { width: 2, height: wallHeight, depth: wallThickness }, scene);
      wall4a.position.set(-2, wallHeight / 2, 3);
      wall4a.material = wallMaterial;

      const wall4b = MeshBuilder.CreateBox('wall4b', { width: 2, height: wallHeight, depth: wallThickness }, scene);
      wall4b.position.set(2, wallHeight / 2, 3);
      wall4b.material = wallMaterial;

      const wall4c = MeshBuilder.CreateBox('wall4c', { width: 2, height: 0.8, depth: wallThickness }, scene);
      wall4c.position.set(0, 0.4, 3);
      wall4c.material = wallMaterial;

      const wall4d = MeshBuilder.CreateBox('wall4d', { width: 2, height: 0.6, depth: wallThickness }, scene);
      wall4d.position.set(0, wallHeight - 0.3, 3);
      wall4d.material = wallMaterial;

      // Add floor inside room
      const floor = MeshBuilder.CreateGround('floor', { width: 6, height: 6 }, scene);
      floor.position.set(0, 0.01, 0);
      const floorMaterial = new StandardMaterial('floorMat', scene);
      floorMaterial.diffuseColor = new Color3(0.8, 0.75, 0.7);
      floor.material = floorMaterial;

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

    // Remove ALL old wall meshes (including sample walls)
    scene.meshes.forEach((mesh) => {
      if (mesh.name.startsWith('wall')) {
        console.log('[Babylon3DCanvas] Removing mesh:', mesh.name);
        mesh.dispose();
      }
    });

    const { points, walls } = floorplanData;
    console.log('[Babylon3DCanvas] Points:', points?.length, 'Walls:', walls?.length);
    if (!walls || walls.length === 0) return;

    // Create point lookup map
    const pointMap = new Map();
    points.forEach((p) => pointMap.set(p.id, p));

    // Create wall material
    const wallMaterial = new StandardMaterial('wallMat_2d', scene);
    wallMaterial.diffuseColor = new Color3(0.95, 0.95, 0.9);
    wallMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

    // Create walls from 2D data
    const wallHeight = 2.8;
    const PIXELS_PER_METER = 20; // 2D scale: 20px = 1m

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

        console.log(`[Babylon3DCanvas] Wall ${index}:`, {
          start: { x: startPoint.x, y: startPoint.y },
          end: { x: endPoint.x, y: endPoint.y },
          '3D': { x1, z1, x2, z2 },
          length,
          position: { x: midX, z: midZ },
          angle: angle * (180 / Math.PI),
        });

        // Create wall mesh
        const thickness = (wall.thickness || 20) / PIXELS_PER_METER;
        const wallMesh = MeshBuilder.CreateBox(
          `wall_${index}`,
          { width: length, height: wallHeight, depth: thickness },
          scene
        );

        // Position and rotate
        wallMesh.position.set(midX, wallHeight / 2, midZ);
        wallMesh.rotation.y = angle;
        wallMesh.material = wallMaterial;
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
  }, [floorplanData]);

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};

export default Babylon3DCanvas;
