import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { useCameraSettingsStore } from '../stores/cameraSettingsStore';
import { horizontalFovToVertical } from './utils/cameraUtils';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  Vector2,
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
  HighlightLayer,
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
  CSG,
  Tools,
  Matrix,
  SSAO2RenderingPipeline,
  Animation,
  Material,
  VertexBuffer
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials/grid';
import { SkyMaterial } from '@babylonjs/materials/sky';
import '@babylonjs/loaders/glTF';
import earcut from 'earcut';
import styles from './Babylon3DCanvas.module.css';
import { eventBus } from '../core/events/EventBus';
import { EditorEvents } from '../core/events/EditorEvents';
import {
  calculateWallCorners,
  type WallCorners,
} from './utils/WallMiterUtils';
import { createCSGWalls } from './utils/CSGWallBuilder';
import type { Wall } from '../core/types/Wall';
import type { Point } from '../core/types/Point';
import type { Light, LightType } from '../core/types/Light';
import { createDefaultLight } from '../core/types/Light';
import { WallSplitService } from '../floorplan/services/WallSplitService';
import { AutoWallHider } from './AutoWallHider';

// Make earcut available globally for Babylon.js polygon operations
if (typeof window !== 'undefined') {
  (window as any).earcut = earcut;
}
(PolygonMeshBuilder as any).earcut = earcut;

// Helper function to convert hex color to Color3
const hexToColor3 = (hex: string): Color3 => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return new Color3(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    );
  }
  return new Color3(0.25, 0.68, 0.48); // Default theme color #3fae7a
};

// Get theme color from localStorage
const getThemeColor = (): Color3 => {
  const savedColor = localStorage.getItem('themeColor');
  return hexToColor3(savedColor || '#3fae7a');
};

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
  showWalls?: boolean;
  showEdges?: boolean;
}

// 2D 좌표(mm)를 Babylon 미터 단위로 변환
// BlueprintToBabylonAdapter already converts pixels to mm
// So we only need MM_TO_METERS conversion here
const MM_TO_METERS = 0.001; // 1mm = 0.001m
const DEFAULT_CAMERA_RADIUS = 8; // 8m orbit distance
const DEFAULT_CAMERA_HEIGHT = 1.7; // 1.7m eye height
const DEFAULT_WALL_THICKNESS = 200; // Default wall thickness 200mm

/**
 * Inset a 2D polygon by moving each vertex inward by the specified distance
 * Used to calculate inner floor polygon from wall centerline points
 */
const insetPolygon2D = (points: { x: number; y: number }[], insetDistance: number): { x: number; y: number }[] => {
  if (points.length < 3) return [];

  const n = points.length;

  // Calculate signed area to determine winding order
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  signedArea = signedArea / 2;

  // Determine inset direction based on winding order
  // Positive area = CCW, negative area = CW
  // We want to inset inward (shrink the polygon)
  const insetSign = signedArea > 0 ? 1 : -1;

  const insetPoints: { x: number; y: number }[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    // Edge vectors
    const edge1X = curr.x - prev.x;
    const edge1Y = curr.y - prev.y;
    const edge2X = next.x - curr.x;
    const edge2Y = next.y - curr.y;

    // Edge lengths
    const len1 = Math.sqrt(edge1X * edge1X + edge1Y * edge1Y);
    const len2 = Math.sqrt(edge2X * edge2X + edge2Y * edge2Y);

    if (len1 === 0 || len2 === 0) {
      insetPoints.push({ ...curr });
      continue;
    }

    // Normalized edge vectors
    const norm1X = edge1X / len1;
    const norm1Y = edge1Y / len1;
    const norm2X = edge2X / len2;
    const norm2Y = edge2Y / len2;

    // Perpendicular vectors (90° rotation)
    // Use insetSign to ensure inward direction
    const perp1X = -norm1Y * insetSign;
    const perp1Y = norm1X * insetSign;
    const perp2X = -norm2Y * insetSign;
    const perp2Y = norm2X * insetSign;

    // Bisector
    const bisectorX = perp1X + perp2X;
    const bisectorY = perp1Y + perp2Y;
    const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);

    if (bisectorLen < 0.001) {
      // Parallel edges
      insetPoints.push({
        x: curr.x + perp1X * insetDistance,
        y: curr.y + perp1Y * insetDistance,
      });
      continue;
    }

    // Normalize and scale bisector
    const normBisectorX = bisectorX / bisectorLen;
    const normBisectorY = bisectorY / bisectorLen;

    // Calculate offset distance
    const sinHalfAngle = bisectorLen / 2;
    const offsetDist = sinHalfAngle > 0.001 ? insetDistance / sinHalfAngle : insetDistance;
    const clampedOffset = Math.min(offsetDist, insetDistance * 10);

    insetPoints.push({
      x: curr.x + normBisectorX * clampedOffset,
      y: curr.y + normBisectorY * clampedOffset,
    });
  }

  return insetPoints;
};

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
    return nearestPoint;
  }

  // No snap - return original position
  return { x, z };
};

export interface Babylon3DCanvasRef {
  captureRender: (width: number, height: number) => Promise<string>;
  takeScreenshot: () => Promise<string | null>;
  getScene: () => Scene | null;
  getEngine: () => Engine | null;
}

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
    controlMode = 'touch',
    showWalls = false,
    showEdges = false
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
  const planMetricsRef = useRef<PlanMetrics | null>(null); // Store plan metrics for cutaway logic
  const autoWallHiderRef = useRef<AutoWallHider | null>(null); // Wall cutaway manager
  const originalMaterialsRef = useRef<Map<string, Material | null>>(new Map()); // Store original materials for display style switching
  const ssaoRef = useRef<SSAO2RenderingPipeline | null>(null); // Store SSAO pipeline for display style control
  const hoverOutlineRef = useRef<Mesh | null>(null); // Store hover outline mesh (tube)
  const lastHoverKeyRef = useRef<string>(''); // Track last hovered mesh+face to prevent flickering
  const highlightLayerRef = useRef<HighlightLayer | null>(null); // Highlight layer for hover effect
  const lastHoveredMeshRef = useRef<Mesh | null>(null); // Track last hovered mesh
  const selectedFloorOutlineRef = useRef<Mesh | null>(null); // Store selected floor outline mesh
  const selectedFloorMeshRef = useRef<Mesh | null>(null); // Store selected floor mesh
  const clickFaceOverlayRef = useRef<Mesh | null>(null); // Store click face overlay (for glow effect)

  // Floor selection state
  const [selectedFloor, setSelectedFloor] = useState<{
    mesh: Mesh;
    roomId: string;
    roomName: string;
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Wall selection state
  const [selectedWall, setSelectedWall] = useState<{
    mesh: Mesh;
    wallId: string;
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Ceiling selection state
  const selectedCeilingOutlineRef = useRef<Mesh | null>(null);
  const selectedCeilingMeshRef = useRef<Mesh | null>(null);
  const [selectedCeiling, setSelectedCeiling] = useState<{
    mesh: Mesh;
    roomIndex: number;
    screenPosition: { x: number; y: number };
  } | null>(null);

  // Camera settings from Zustand store
  const cameraSettings = useCameraSettingsStore();

  // Expose captureRender function via ref
  useImperativeHandle(ref, () => ({
    takeScreenshot: async () => {
      if (!engineRef.current || !sceneRef.current || !sceneRef.current.activeCamera) return null;

      // Store original states
      const gridMesh = infiniteGridRef.current;
      const wasGridVisible = gridMesh ? gridMesh.isVisible : false;
      const gizmoManager = gizmoManagerRef.current;
      const previouslyAttachedMesh = gizmoManager?.attachedMesh;
      const selectedLightMesh = selectedLightMeshRef.current;
      const wasSelectedLightVisible = selectedLightMesh ? selectedLightMesh.isVisible : false;

      // Find all hotspot meshes
      const hotspotMeshes = sceneRef.current.meshes.filter(m => m.name.includes('_hotspot'));
      const hotspotVisibilities = new Map<AbstractMesh, boolean>();
      hotspotMeshes.forEach(m => hotspotVisibilities.set(m, m.isVisible));

      try {
        // Hide grid
        if (gridMesh) {
          gridMesh.isVisible = false;
        }

        // Hide gizmos (detach from mesh)
        if (gizmoManager) {
          gizmoManager.attachToMesh(null);
        }

        // Hide selected light indicator
        if (selectedLightMesh) {
          selectedLightMesh.isVisible = false;
        }

        // Hide all hotspots
        hotspotMeshes.forEach(m => {
          m.isVisible = false;
        });

        // Force a render to ensure changes are applied before screenshot
        sceneRef.current.render();

        return await Tools.CreateScreenshotAsync(
          engineRef.current,
          sceneRef.current.activeCamera,
          { precision: 1 }
        );
      } catch (error) {
        console.error('Screenshot capture failed:', error);
        return null;
      } finally {
        // Restore states
        if (gridMesh) {
          gridMesh.isVisible = wasGridVisible;
        }
        if (gizmoManager && previouslyAttachedMesh) {
          gizmoManager.attachToMesh(previouslyAttachedMesh);
        }
        if (selectedLightMesh) {
          selectedLightMesh.isVisible = wasSelectedLightVisible;
        }
        hotspotMeshes.forEach(m => {
          const wasVisible = hotspotVisibilities.get(m);
          if (wasVisible !== undefined) {
            m.isVisible = wasVisible;
          }
        });
      }
    },
    captureRender: async (width: number, height: number): Promise<string> => {
      const scene = sceneRef.current;
      const engine = engineRef.current;
      const sunLight = sunLightRef.current;

      if (!scene || !engine) {
        throw new Error('Scene or Engine not initialized');
      }
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
          const originalHardwareScaling = engine.getHardwareScalingLevel();
          // ===== STEP 2: Apply ULTRA-QUALITY settings =====
          // Force hardware scaling to 1.0 for maximum quality
          engine.setHardwareScalingLevel(1.0);

          if (shadowGen) {
            shadowGen.mapSize = 16384; // Ultra 16K shadow maps
            shadowGen.blurKernel = 256; // Maximum blur for ultra-soft shadows
            shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
          }

          // Boost environment reflections
          scene.environmentIntensity = 2.5;

          // Boost all material quality and save original values
          const originalMaterialIntensities = new Map<PBRMaterial, number>();
          const originalMaterialRoughness = new Map<PBRMaterial, number | null>();
          const originalMaterialMetallic = new Map<PBRMaterial, number | null>();

          scene.meshes.forEach(mesh => {
            if (mesh.material && mesh.material instanceof PBRMaterial) {
              const mat = mesh.material as PBRMaterial;
              originalMaterialIntensities.set(mat, mat.environmentIntensity);
              originalMaterialRoughness.set(mat, mat.roughness);
              originalMaterialMetallic.set(mat, mat.metallic);

              // Boost reflections
              mat.environmentIntensity = Math.max(mat.environmentIntensity, 1.5);

              // Slightly reduce roughness for more reflective surfaces
              if (mat.roughness !== null && mat.roughness !== undefined) {
                if (mat.roughness > 0.3) {
                  mat.roughness = mat.roughness * 0.8;
                }
              }
              // Enable more accurate PBR calculations
              mat.usePhysicalLightFalloff = true;
              mat.useRadianceOverAlpha = true;
            }
          });

          // Add additional fill lights for Global Illumination effect
          const additionalLights: PointLight[] = [];

          // Soft ambient fill light
          const fillLight1 = new PointLight('renderFillLight1', new Vector3(0, 2, 0), scene);
          fillLight1.intensity = 0.3;
          fillLight1.diffuse = new Color3(1, 0.95, 0.9); // Warm white
          fillLight1.range = 50;
          additionalLights.push(fillLight1);

          // Ceiling bounce light simulation
          const fillLight2 = new PointLight('renderFillLight2', new Vector3(0, 2.3, 0), scene);
          fillLight2.intensity = 0.2;
          fillLight2.diffuse = new Color3(0.9, 0.92, 1); // Cool white (sky bounce)
          fillLight2.range = 40;
          additionalLights.push(fillLight2);

          // Increase hemispheric light for better ambient
          const hemisphericLight = scene.getLightByName('hemiLight') as HemisphericLight;
          const originalHemiIntensity = hemisphericLight?.intensity || 0.7;
          if (hemisphericLight) {
            hemisphericLight.intensity = 0.4;
          }

          // Enable scene image processing for better colors
          scene.imageProcessingConfiguration.toneMappingEnabled = true;
          scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
          scene.imageProcessingConfiguration.exposure = 1.0;
          scene.imageProcessingConfiguration.contrast = 1.05;
          // Hide grid for clean render
          const gridMesh = infiniteGridRef.current;
          const originalGridVisibility = gridMesh?.isVisible;
          if (gridMesh) {
            gridMesh.isVisible = false;
          }
          // Create RenderTargetTexture with MSAA
          const renderTarget = new RenderTargetTexture(
            'ultraHighResRender',
            { width, height },
            scene,
            false, // generateMipMaps
            true, // doNotChangeAspectRatio
            Constants.TEXTURETYPE_UNSIGNED_INT,
            false, // isCube
            Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
            true, // generateDepthBuffer
            false, // generateStencilBuffer
            false, // isMulti
            Constants.TEXTUREFORMAT_RGBA,
            false // delayAllocation
          );

          // Enable maximum MSAA (8x)
          renderTarget.samples = 8;

          // Set camera
          renderTarget.activeCamera = camera;

          // Render all meshes except grid
          renderTarget.renderList = scene.meshes.filter(m => m !== gridMesh);

          // Fix aspect ratio for render target by overriding getProjectionMatrix temporarily
          const renderAspectRatio = width / height;
          const originalGetProjectionMatrix = camera.getProjectionMatrix.bind(camera);

          // Override getProjectionMatrix to use render target's aspect ratio
          camera.getProjectionMatrix = (force?: boolean) => {
            if (camera instanceof ArcRotateCamera) {
              const fov = camera.fov;
              const near = camera.minZ;
              const far = camera.maxZ;

              // Create new projection matrix with render target's aspect ratio
              return Matrix.PerspectiveFovLH(fov, renderAspectRatio, near, far);
            }
            return originalGetProjectionMatrix(force);
          };

          // Render and capture
          renderTarget.onAfterRenderObservable.addOnce(() => {
            // Read pixels directly from render target texture
            const internalTexture = renderTarget.getInternalTexture();
            if (!internalTexture) {
              renderTarget.dispose();
              reject(new Error('Failed to get internal texture'));
              return;
            }

            // Bind the render target texture
            engine._bindTextureDirectly(engine._gl.TEXTURE_2D, internalTexture, true);

            // Create temporary canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              renderTarget.dispose();
              reject(new Error('Failed to create canvas context'));
              return;
            }

            // Use readPixels to read from bound texture
            const gl = engine._gl;
            const pixels = new Uint8Array(width * height * 4);

            // Create framebuffer and attach texture
            const fb = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, internalTexture._hardwareTexture?.underlyingResource, 0);

            // Read pixels
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

            // Clean up framebuffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.deleteFramebuffer(fb);

            // Create ImageData and flip Y
            const imageData = ctx.createImageData(width, height);
            const rowSize = width * 4;

            for (let y = 0; y < height; y++) {
              const srcRow = (height - 1 - y) * rowSize;
              const dstRow = y * rowSize;
              imageData.data.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
            }

            ctx.putImageData(imageData, 0, 0);
            // Convert to blob
            canvas.toBlob((blob) => {
              if (!blob) {
                renderTarget.dispose();
                reject(new Error('Failed to create blob'));
                return;
              }

              // ===== STEP 3: Restore original settings =====
              engine.setHardwareScalingLevel(originalHardwareScaling);

              // Restore camera projection matrix
              camera.getProjectionMatrix = originalGetProjectionMatrix;

              if (shadowGen) {
                shadowGen.mapSize = originalShadowMapSize;
                shadowGen.blurKernel = originalShadowBlurKernel;
              }

              scene.environmentIntensity = originalEnvIntensity;

              // Restore hemispheric light
              if (hemisphericLight) {
                hemisphericLight.intensity = originalHemiIntensity;
              }

              // Remove additional fill lights
              additionalLights.forEach(light => light.dispose());

              // Restore scene image processing
              scene.imageProcessingConfiguration.toneMappingEnabled = false;
              scene.imageProcessingConfiguration.contrast = 1.0;

              // Restore grid visibility
              if (gridMesh && originalGridVisibility !== undefined) {
                gridMesh.isVisible = originalGridVisibility;
              }

              // Restore material settings
              originalMaterialIntensities.forEach((intensity, mat) => {
                mat.environmentIntensity = intensity;
              });
              originalMaterialRoughness.forEach((roughness, mat) => {
                mat.roughness = roughness;
              });
              originalMaterialMetallic.forEach((metallic, mat) => {
                mat.metallic = metallic;
              });
              // Clean up
              renderTarget.dispose();

              // Create Blob URL and resolve
              const blobUrl = URL.createObjectURL(blob);
              resolve(blobUrl);
            }, 'image/png', 1.0);
          });

          // Trigger render
          scene.incrementRenderId();
          scene.resetCachedMaterial();
          renderTarget.render(false, false);
        } catch (error) {
          console.error('[Babylon3DCanvas] Render capture failed:', error);
          reject(error);
        }
      });
    },
    getScene: () => sceneRef.current,
    getEngine: () => engineRef.current,
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent double initialization
    if (engineRef.current || sceneRef.current) {
      return;
    }
    const initScene = () => {
      // Create engine with standard quality settings
      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      engineRef.current = engine;
      // Create scene
      const scene = new Scene(engine);
      scene.clearColor = new Color4(1, 1, 1, 1); // Pure white background
      scene.ambientColor = new Color3(0.3, 0.3, 0.3);
      scene.collisionsEnabled = true;
      scene.gravity = new Vector3(0, 0, 0);
      sceneRef.current = scene;

      // Glow layer for emissive materials
      const glowLayer = new GlowLayer('glow', scene);
      glowLayer.intensity = 0.3;

      // Highlight layer for hover effect
      highlightLayerRef.current = new HighlightLayer('hoverHighlight', scene);
      highlightLayerRef.current.outerGlow = true;
      highlightLayerRef.current.innerGlow = false;

      // High-quality rendering pipeline (Archidraw/Cuhome style)
      const pipeline = new DefaultRenderingPipeline('defaultPipeline', true, scene, []);
      pipeline.samples = 4; // 4x MSAA for smooth edges
      pipeline.fxaaEnabled = false; // MSAA is enough

      // Image processing for natural, bright look
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.exposure = 1.2; // Slightly brighter
      pipeline.imageProcessing.contrast = 1.1; // More vibrant
      pipeline.imageProcessing.vignetteEnabled = false;

      // Bloom disabled
      pipeline.bloomEnabled = false;

      pipeline.sharpenEnabled = false;
      pipelineRef.current = pipeline;

      // SSAO2 for ambient occlusion (soft shadows in corners) - high quality
      const ssao = new SSAO2RenderingPipeline('ssao', scene, {
        ssaoRatio: 1.0,
        blurRatio: 2
      });
      ssao.radius = 3.5;
      ssao.totalStrength = 2.5;
      ssao.base = 0.3;
      ssao.samples = 32;
      ssao.maxZ = 150;
      ssao.minZAspect = 0.2;
      ssao.expensiveBlur = true;
      ssaoRef.current = ssao; // Store for display style control
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
      arcCamera.lowerRadiusLimit = 0.001; // Allow ultra close zoom (1mm minimum distance)
      arcCamera.upperRadiusLimit = 50;
      arcCamera.upperBetaLimit = Math.PI * 0.85; // Allow looking up at ceiling
      arcCamera.wheelPrecision = 1; // Maximum zoom speed
      arcCamera.panningSensibility = 0.1; // Lower = faster panning
      arcCamera.inertia = 0; // No inertia - immediate stop
      arcCamera.panningInertia = 0; // No panning inertia
      arcCamera.panningDistanceLimit = 1000; // Allow far panning
      arcCamera.angularSensibilityX = 200; // Fast rotation (lower = faster)
      arcCamera.angularSensibilityY = 200;
      // Enable middle mouse button for panning as well
      arcCamera._panningMouseButton = 2; // Right click for pan
      arcCamera.zoomToMouseLocation = true; // Enable zoom to mouse pointer
      // Use wheelDeltaPercentage for direct zoom control (overrides wheelPrecision)
      arcCamera.wheelDeltaPercentage = 0.05; // 5% zoom per scroll tick
      arcCameraRef.current = arcCamera;

      // Custom 3D rotation cursor - two crossing ellipses with arrows (white outline + black line)
      const rotateCursorActive = 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxlbGxpcHNlIGN4PSIxMiIgY3k9IjEyIiByeD0iMTAiIHJ5PSI0IiB0cmFuc2Zvcm09InJvdGF0ZSg5MCAxMiAxMikiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzIi8+PGVsbGlwc2UgY3g9IjEyIiBjeT0iMTIiIHJ4PSIxMCIgcnk9IjQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIzIi8+PHBhdGggZD0iTTUgOGwtMiAyIDIgMiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjMiLz48cGF0aCBkPSJNOCAxOWwyIDIgMi0yIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMyIvPjxlbGxpcHNlIGN4PSIxMiIgY3k9IjEyIiByeD0iMTAiIHJ5PSI0IiB0cmFuc2Zvcm09InJvdGF0ZSg5MCAxMiAxMikiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48ZWxsaXBzZSBjeD0iMTIiIGN5PSIxMiIgcng9IjEwIiByeT0iNCIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjEuMiIvPjxwYXRoIGQ9Ik01IDhsLTIgMiAyIDIiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIxLjIiLz48cGF0aCBkPSJNOCAxOWwyIDIgMi0yIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0aD0iMS4yIi8+PC9zdmc+") 12 12, move';

      // Track dragging state for cursor change
      // Left click: rotate (rotation icon), Right click: pan (grab cursor)
      let isDragging = false;
      let dragButton = -1; // 0 = left (rotate), 2 = right (pan)
      let lastPointerX = 0;
      let lastPointerY = 0;

      // Disable Babylon's default cursor management
      scene.defaultCursor = 'default';
      scene.hoverCursor = 'default';

      scene.onPointerObservable.add((pointerInfo) => {
        const evt = pointerInfo.event as PointerEvent;
        switch (pointerInfo.type) {
          case PointerEventTypes.POINTERDOWN:
            isDragging = true;
            dragButton = evt.button;
            lastPointerX = evt.clientX;
            lastPointerY = evt.clientY;
            if (evt.button === 2) {
              // Right click = pan
              canvas.style.cursor = 'grabbing';
            } else {
              // Left click = rotate
              canvas.style.cursor = rotateCursorActive;
            }
            break;
          case PointerEventTypes.POINTERUP:
            isDragging = false;
            dragButton = -1;
            canvas.style.cursor = 'default';
            break;
          case PointerEventTypes.POINTERMOVE:
            if (isDragging) {
              if (dragButton === 2) {
                // Custom panning - directly move camera target
                const deltaX = evt.clientX - lastPointerX;
                const deltaY = evt.clientY - lastPointerY;
                lastPointerX = evt.clientX;
                lastPointerY = evt.clientY;

                // Calculate movement in world space based on camera orientation
                const panSpeed = 0.003 * arcCamera.radius; // Scale with zoom level
                const forward = arcCamera.getDirection(Vector3.Forward());
                const right = arcCamera.getDirection(Vector3.Right());

                // Move target (and camera follows)
                const moveX = right.scale(-deltaX * panSpeed);
                const moveZ = forward.scale(deltaY * panSpeed);
                moveX.y = 0; // Keep on horizontal plane
                moveZ.y = 0;

                arcCamera.target.addInPlace(moveX);
                arcCamera.target.addInPlace(moveZ);

                canvas.style.cursor = 'grabbing';
              } else {
                canvas.style.cursor = rotateCursorActive;
              }
            } else {
              canvas.style.cursor = 'default';
            }
            break;
        }
      });
      canvas.style.cursor = 'default';

      // Expose camera control globally for Gizmo
      if (typeof window !== 'undefined') {
        (window as any).__setCameraRotation = (alpha: number, beta: number) => {
          if (!scene || !arcCamera) return;

          // Animate camera rotation
          const framerate = 60;
          const speed = 60; // Speed of animation

          // Create animation for Alpha (horizontal)
          const animAlpha = new Animation(
            "animAlpha",
            "alpha",
            framerate,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
          );

          const keysAlpha = [];
          keysAlpha.push({ frame: 0, value: arcCamera.alpha });
          keysAlpha.push({ frame: speed, value: alpha });
          animAlpha.setKeys(keysAlpha);

          // Create animation for Beta (vertical)
          const animBeta = new Animation(
            "animBeta",
            "beta",
            framerate,
            Animation.ANIMATIONTYPE_FLOAT,
            Animation.ANIMATIONLOOPMODE_CONSTANT
          );

          const keysBeta = [];
          keysBeta.push({ frame: 0, value: arcCamera.beta });
          keysBeta.push({ frame: speed, value: beta });
          animBeta.setKeys(keysBeta);

          // Start animation
          scene.beginDirectAnimation(arcCamera, [animAlpha, animBeta], 0, speed, false);
        };
      }

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

      // Advanced lighting setup - soft, diffuse lighting like professional renders
      // 1. Ambient light - reduced intensity to make sun shadows more visible
      const hemisphericLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
      hemisphericLight.intensity = 0.4; // Reduced from 0.8 for better shadow contrast
      hemisphericLight.diffuse = new Color3(1, 1, 1);
      hemisphericLight.groundColor = new Color3(0.5, 0.5, 0.52); // Darker ground bounce
      hemisphericLight.specular = new Color3(0.1, 0.1, 0.1);

      // 2. Main directional light (sun) with shadows
      const azimuth = sunSettings?.azimuth ?? -45; // Sun from front-left
      const altitude = sunSettings?.altitude ?? 50; // Higher sun = shadows more directly below
      const intensity = sunSettings?.intensity ?? 2.5; // Increased for stronger shadows

      // Calculate sun direction from azimuth/altitude
      const azimuthRad = (azimuth * Math.PI) / 180;
      const altitudeRad = (altitude * Math.PI) / 180;

      // Light direction pointing down into the scene
      const dirX = -Math.cos(altitudeRad) * Math.sin(azimuthRad);
      const dirY = -Math.sin(altitudeRad);
      const dirZ = -Math.cos(altitudeRad) * Math.cos(azimuthRad);

      // DirectionalLight: sun from side, casting clear shadows on floor
      const sunLight = new DirectionalLight('sunLight', new Vector3(1, -2, 1).normalize(), scene);
      sunLight.intensity = intensity;
      sunLight.diffuse = new Color3(1, 0.98, 0.95);
      sunLight.specular = new Color3(1, 1, 1);
      sunLight.position = new Vector3(-50, 100, -50);
      sunLight.shadowMinZ = 0.1;
      sunLight.shadowMaxZ = 500;
      sunLightRef.current = sunLight;

      // Shadow generator - strong visible shadows
      const shadowGenerator = new ShadowGenerator(4096, sunLight);
      shadowGenerator.useExponentialShadowMap = true;
      shadowGenerator.bias = 0.00001;
      shadowGenerator.normalBias = 0.001;
      // darkness: 0 = completely black shadow
      shadowGenerator.setDarkness(0);

      // Create infinite grid floor
      const createInfiniteGrid = () => {
        // Create large ground plane (1000m x 1000m - fixed at origin)
        // Use BACKSIDE so grid is only visible from below, not from above
        const gridPlane = MeshBuilder.CreateGround(
          'infiniteGrid',
          { width: 1000, height: 1000 },
          scene
        );
        gridPlane.position = new Vector3(0, -0.01, 0); // Fixed at origin, slightly below Y=0
        gridPlane.rotation.x = Math.PI; // Flip 180 degrees so grid is visible from below, hidden from above

        // Create GridMaterial with realistic settings
        const gridMaterial = new GridMaterial('gridMaterial', scene);

        // Grid appearance - transparent background with visible lines
        gridMaterial.mainColor = new Color3(1, 1, 1); // Background color (mostly transparent)
        gridMaterial.lineColor = new Color3(0.8, 0.8, 0.8); // Gray lines
        gridMaterial.backFaceCulling = true; // Only render front face (now facing down after flip)

        // Grid spacing - 1 unit = 1 meter
        gridMaterial.gridRatio = 1.0; // 1m grid cells
        gridMaterial.majorUnitFrequency = 10; // Major line every 10 cells (10m)
        gridMaterial.minorUnitVisibility = 0.3; // Minor lines at 50% opacity

        // Transparent background - only grid lines visible
        gridMaterial.opacity = 0.1;
        gridMaterial.gridOffset = new Vector3(0, 0, 0);

        // Apply material
        gridPlane.material = gridMaterial;

        // Disable shadow receiving for cleaner white appearance
        gridPlane.receiveShadows = false;

        // Disable collisions (don't interfere with character movement)
        gridPlane.checkCollisions = false;

        // Disable picking (don't interfere with hover detection)
        gridPlane.isPickable = false;

        // Lower render priority so it renders below everything else
        gridPlane.renderingGroupId = 0;
        return gridPlane;
      };

      infiniteGridRef.current = createInfiniteGrid();

      // Create ground plane visible from above - color based on sun altitude
      const createGroundPlane = () => {
        const groundPlane = MeshBuilder.CreateGround(
          'whiteGround',
          { width: 1000, height: 1000 },
          scene
        );
        groundPlane.position = new Vector3(0, -0.02, 0); // Slightly below grid

        // Calculate brightness based on sun altitude (0-90 = day, negative = night)
        const altitude = sunSettings?.altitude ?? 45;
        // Normalize: -90 to 90 -> 0 to 1, with some minimum brightness
        const brightness = Math.max(0.05, Math.min(0.5, (altitude + 10) / 100));

        const groundMaterial = new StandardMaterial('groundMaterial', scene);
        groundMaterial.diffuseColor = new Color3(brightness, brightness, brightness);
        groundMaterial.specularColor = new Color3(0, 0, 0); // No specular
        groundMaterial.emissiveColor = new Color3(brightness * 0.8, brightness * 0.8, brightness * 0.8);
        groundMaterial.backFaceCulling = true; // Only visible from above

        groundPlane.material = groundMaterial;
        groundPlane.receiveShadows = false;
        groundPlane.isPickable = false;
        groundPlane.checkCollisions = false;
        groundPlane.renderingGroupId = 0;

        return groundPlane;
      };

      createGroundPlane();

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

        // Nice clear blue sky
        skyMaterial.turbidity = 2; // Clear atmosphere
        skyMaterial.luminance = 1; // Normal brightness
        skyMaterial.rayleigh = 1; // Nice blue color
        skyMaterial.mieCoefficient = 0.005; // Minimal haze
        skyMaterial.mieDirectionalG = 0.8; // Sun glow
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
        return skybox;
      };

      createSkybox();

      // Create visible sun disk
      const createSunDisk = () => {
        const azimuth = sunSettings?.azimuth ?? 45;
        const altitude = sunSettings?.altitude ?? 45;
        const azimuthRad = (azimuth * Math.PI) / 180;
        const altitudeRad = (altitude * Math.PI) / 180;

        // Sun position far away in the sky
        const distance = 400;
        const sunX = distance * Math.cos(altitudeRad) * Math.sin(azimuthRad);
        const sunY = distance * Math.sin(altitudeRad);
        const sunZ = distance * Math.cos(altitudeRad) * Math.cos(azimuthRad);

        const sunMesh = MeshBuilder.CreateSphere('sunDisk', { diameter: 30 }, scene);
        sunMesh.position = new Vector3(sunX, sunY, sunZ);

        // Glowing sun material
        const sunMaterial = new StandardMaterial('sunMaterial', scene);
        sunMaterial.emissiveColor = new Color3(1, 0.95, 0.8); // Warm yellow-white
        sunMaterial.diffuseColor = new Color3(0, 0, 0);
        sunMaterial.specularColor = new Color3(0, 0, 0);
        sunMaterial.disableLighting = true;

        sunMesh.material = sunMaterial;
        sunMesh.isPickable = false;
        sunMesh.renderingGroupId = 0;

        return sunMesh;
      };

      createSunDisk();

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

      // Track previous camera angles for gizmo update optimization
      let prevAlpha = 0;
      let prevBeta = 0;
      let gizmoUpdateCounter = 0;

      engine.runRenderLoop(() => {
        // Update wall visibility based on camera angle (raycasting cutaway)
        const activeCamera = scene.activeCamera;
        if (activeCamera instanceof ArcRotateCamera && autoWallHiderRef.current) {
          autoWallHiderRef.current.update(activeCamera);
        }

        // Update camera gizmo (throttled to every 3 frames for performance)
        gizmoUpdateCounter++;
        if (gizmoUpdateCounter >= 3 && arcCamera) {
          gizmoUpdateCounter = 0;
          const alpha = arcCamera.alpha;
          const beta = arcCamera.beta;
          // Only update if camera moved significantly (0.01 radians = ~0.5 degrees)
          if (Math.abs(alpha - prevAlpha) > 0.01 || Math.abs(beta - prevBeta) > 0.01) {
            prevAlpha = alpha;
            prevBeta = beta;
            if (typeof window !== 'undefined' && (window as any).__updateCameraGizmo) {
              (window as any).__updateCameraGizmo(alpha, beta);
            }
          }
        }

        scene.render();
      });

      // Handle resize
      const handleResize = () => {
        engine.resize();
      };
      window.addEventListener('resize', handleResize);

      // Handle fullscreen changes (aspect ratio fix)
      const handleFullscreenChange = () => {
        setTimeout(() => {
          engine.resize();
        }, 100);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        if (autoWallHiderRef.current) {
          autoWallHiderRef.current.dispose();
          autoWallHiderRef.current = null;
        }
        if (hoverOutlineRef.current) {
          hoverOutlineRef.current.dispose();
          hoverOutlineRef.current = null;
        }
        if (highlightLayerRef.current) {
          highlightLayerRef.current.dispose();
          highlightLayerRef.current = null;
        }
        lastHoveredMeshRef.current = null;
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
    skipBottomFace: boolean = false,
    startPoint?: { x: number, y: number },
    endPoint?: { x: number, y: number }
  ): Mesh => {
    const MM_TO_METERS = 0.001;
    const wallHeight = height * MM_TO_METERS;
    const wallStartHeight = startHeight * MM_TO_METERS;

    // 코너를 meters로 변환하고 중심점 offset 적용
    const toMeters = (x: number, z: number) => ({
      x: x * MM_TO_METERS - centerX,
      z: -(z * MM_TO_METERS) - centerZ, // Z축 반전
    });

    const c1 = toMeters(corners.startLeft.x, corners.startLeft.z); // StartLeft
    const c2 = toMeters(corners.endLeft.x, corners.endLeft.z);     // EndLeft
    const c3 = toMeters(corners.endRight.x, corners.endRight.z);   // EndRight
    const c4 = toMeters(corners.startRight.x, corners.startRight.z); // StartRight

    // Center points (optional, fallback to midpoint of left/right if not provided)
    // But for gap filling, we really need the actual junction center.
    // If startPoint/endPoint are provided, use them.
    const cStart = startPoint ? toMeters(startPoint.x, startPoint.y) : {
      x: (c1.x + c4.x) / 2,
      z: (c1.z + c4.z) / 2
    };
    const cEnd = endPoint ? toMeters(endPoint.x, endPoint.y) : {
      x: (c2.x + c3.x) / 2,
      z: (c2.z + c3.z) / 2
    };

    // VertexData로 직접 mesh 생성
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    // Vertices layout:
    // Bottom (y=start): 0:StartLeft, 1:EndLeft, 2:EndRight, 3:StartRight, 4:StartCenter, 5:EndCenter
    // Top (y=end):      6:StartLeft, 7:EndLeft, 8:EndRight, 9:StartRight, 10:StartCenter, 11:EndCenter
    // TopFace (y=end):  12:StartLeft, 13:EndLeft, 14:EndRight, 15:StartRight, 16:StartCenter, 17:EndCenter (Black)

    // --- Bottom Vertices (0-5) ---
    const pushVertex = (v: { x: number, z: number }, y: number, r: number, g: number, b: number) => {
      positions.push(v.x, y, v.z);
      colors.push(r, g, b, 1);
    };

    // 0: StartLeft
    pushVertex(c1, wallStartHeight, 1, 1, 1);
    // 1: EndLeft
    pushVertex(c2, wallStartHeight, 1, 1, 1);
    // 2: EndRight
    pushVertex(c3, wallStartHeight, 1, 1, 1);
    // 3: StartRight
    pushVertex(c4, wallStartHeight, 1, 1, 1);
    // 4: StartCenter
    pushVertex(cStart, wallStartHeight, 1, 1, 1);
    // 5: EndCenter
    pushVertex(cEnd, wallStartHeight, 1, 1, 1);

    // --- Top Vertices (Side usage) (6-11) ---
    const topY = wallStartHeight + wallHeight;
    // 6: StartLeft
    pushVertex(c1, topY, 1, 1, 1);
    // 7: EndLeft
    pushVertex(c2, topY, 1, 1, 1);
    // 8: EndRight
    pushVertex(c3, topY, 1, 1, 1);
    // 9: StartRight
    pushVertex(c4, topY, 1, 1, 1);
    // 10: StartCenter
    pushVertex(cStart, topY, 1, 1, 1);
    // 11: EndCenter
    pushVertex(cEnd, topY, 1, 1, 1);

    // --- Top Vertices (Top Face usage - Black) (12-17) ---
    const topFaceColor = 0;
    // 12: StartLeft
    pushVertex(c1, topY, topFaceColor, topFaceColor, topFaceColor);
    // 13: EndLeft
    pushVertex(c2, topY, topFaceColor, topFaceColor, topFaceColor);
    // 14: EndRight
    pushVertex(c3, topY, topFaceColor, topFaceColor, topFaceColor);
    // 15: StartRight
    pushVertex(c4, topY, topFaceColor, topFaceColor, topFaceColor);
    // 16: StartCenter
    pushVertex(cStart, topY, topFaceColor, topFaceColor, topFaceColor);
    // 17: EndCenter
    pushVertex(cEnd, topY, topFaceColor, topFaceColor, topFaceColor);

    // --- Indices ---

    // Helper for 6-point polygon triangulation (StartLeft, EndLeft, EndCenter, EndRight, StartRight, StartCenter)
    // Triangles:
    // T1: StartLeft(0), EndLeft(1), EndCenter(5)
    // T2: StartLeft(0), EndCenter(5), StartCenter(4)
    // T3: StartCenter(4), EndCenter(5), EndRight(2)
    // T4: StartCenter(4), EndRight(2), StartRight(3)

    // Bottom Face (Clockwise)
    if (!skipBottomFace) {
      indices.push(0, 5, 1);
      indices.push(0, 4, 5);
      indices.push(4, 2, 5);
      indices.push(4, 3, 2);
    }

    // Top Face (Counter-Clockwise) - using vertices 12-17
    if (!skipTopFace) {
      indices.push(12, 13, 17);
      indices.push(12, 17, 16);
      indices.push(16, 17, 14);
      indices.push(16, 14, 15);
    }

    // Side Faces (using vertices 0-11)
    // Left Side: StartLeft(0)->EndLeft(1) -> TopEndLeft(7)->TopStartLeft(6)
    indices.push(0, 1, 7);
    indices.push(0, 7, 6);

    // Right Side: EndRight(2)->StartRight(3) -> TopStartRight(9)->TopEndRight(8)
    indices.push(2, 3, 9);
    indices.push(2, 9, 8);

    // Start Cap (세로 단면 - 벽 시작 부분) - 양면 렌더링
    indices.push(0, 3, 9);
    indices.push(0, 9, 6);
    indices.push(3, 0, 6);
    indices.push(3, 6, 9);

    // End Cap (세로 단면 - 벽 끝 부분) - 양면 렌더링
    indices.push(2, 1, 7);
    indices.push(2, 7, 8);
    indices.push(1, 2, 8);
    indices.push(1, 8, 7);

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
    return { windowGroup, slidingPane, hotspot };
  };

  // Update 3D scene when floorplan data changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !floorplanData) return;
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
      mesh.dispose();
    });

    const { points, walls, rooms = [], doors = [], windows = [], floorplan: _floorplan } = floorplanData;
    if (!walls || walls.length === 0) return;

    // Build a map of pointId -> number of rooms it belongs to
    // Points that belong to 2+ rooms are shared between rooms
    const pointRoomCount = new Map<string, number>();
    rooms.forEach((room: any) => {
      if (room.points) {
        room.points.forEach((pointId: string) => {
          pointRoomCount.set(pointId, (pointRoomCount.get(pointId) || 0) + 1);
        });
      }
    });

    // Helper function: Check if a wall is internal (both endpoints shared by 2+ rooms)
    const isWallInternal = (startPointId: string, endPointId: string): boolean => {
      const startCount = pointRoomCount.get(startPointId) || 0;
      const endCount = pointRoomCount.get(endPointId) || 0;
      // Internal wall: both endpoints belong to 2+ rooms
      return startCount >= 2 && endCount >= 2;
    };

    const planMetrics = computePlanMetrics(points);
    planMetricsRef.current = planMetrics; // Store for cutaway logic
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
      const optimalRadius = roomSize * 2.5; // Increased from 1.5 to 2.5 to ensure whole room is visible

      const minRadius = 0.5; // Allow close zoom regardless of room size
      const maxRadius = Math.max(10, roomSize * 5); // Increased from 3 to 5
      arcCamera.lowerRadiusLimit = minRadius;
      arcCamera.upperRadiusLimit = maxRadius;
      arcCamera.radius = optimalRadius;
    }

    // Create point lookup map
    const pointMap = new Map<string, Point>();
    points.forEach((p: Point) => pointMap.set(p.id, p));

    // Split walls at T-junctions and X-junctions (same as 2D)
    const wallSplitService = new WallSplitService();
    const splitResult = wallSplitService.splitWallsAtTJunctions(walls as Wall[], points as Point[]);
    const splitWalls = splitResult.walls;
    const allPoints = [...points, ...splitResult.newPoints];

    // Update pointMap with new points
    splitResult.newPoints.forEach((p: Point) => pointMap.set(p.id, p));
    // Get shadow generator
    const sunLight = scene.getLightByName('sunLight') as DirectionalLight;
    const shadowGenerator = sunLight?.getShadowGenerator() as ShadowGenerator;

    // Create high-quality wall material (PBR)
    const wallMaterial = new PBRMaterial('wallMat_2d', scene);
    wallMaterial.albedoColor = new Color3(0.96, 0.96, 0.94);
    wallMaterial.metallic = 0.0;
    wallMaterial.roughness = 0.5; // Slightly smoother for premium feel
    wallMaterial.environmentIntensity = 0.8; // More reflection from environment

    // Create floor material with real wood texture
    const floorMaterial = new PBRMaterial('floorMat_2d', scene);
    floorMaterial.metallic = 0.0;
    floorMaterial.environmentIntensity = 0.6;

    // Load real wood textures
    const diffuseTexture = new Texture('/texture/floor/f2%20diffuse.JPG', scene);
    diffuseTexture.uScale = 1.0; // Will be set per-room based on size
    diffuseTexture.vScale = 1.0;
    diffuseTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    diffuseTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.albedoTexture = diffuseTexture;

    const glossTexture = new Texture('/texture/floor/f2%20gloss.png', scene);
    glossTexture.uScale = 1.0;
    glossTexture.vScale = 1.0;
    glossTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    glossTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.metallicTexture = glossTexture;
    floorMaterial.useMetallnessFromMetallicTextureBlue = false;
    floorMaterial.useRoughnessFromMetallicTextureGreen = false;
    floorMaterial.useRoughnessFromMetallicTextureAlpha = true;

    const normalTexture = new Texture('/texture/floor/f2%20normal.png', scene);
    normalTexture.uScale = 1.0;
    normalTexture.vScale = 1.0;
    normalTexture.wrapU = Texture.WRAP_ADDRESSMODE;
    normalTexture.wrapV = Texture.WRAP_ADDRESSMODE;
    floorMaterial.bumpTexture = normalTexture;

    // Clear and prepare wall meshes array for snap detection
    wallMeshesRef.current = [];

    // Toggle between CSG and Miter wall generation
    // Miter mode is default (CSG has issues)
    const USE_CSG_WALLS = false; // Default: false (Miter)

    if (USE_CSG_WALLS) {
      // Create all walls with CSG trimming (using split walls)
      const csgWalls = createCSGWalls(
        splitWalls as Wall[],
        allPoints, // Use all points including new intersection points
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
    } else {
      // Create walls with proper miter joints using WallMiterUtils (using split walls)
      splitWalls.forEach((wall, wallIndex) => {
        const startPoint = pointMap.get(wall.startPointId);
        const endPoint = pointMap.get(wall.endPointId);
        if (!startPoint || !endPoint) return;

        const wallHeightMM = wall.height || 2400;

        // Find doors and windows on this wall (check original wall IDs too)
        const wallDoors = doors.filter((door: any) => door.wallId === wall.id);
        const wallWindows = windows.filter((window: any) => window.wallId === wall.id);

        // Calculate miter joint corners (same algorithm as 2D)
        const corners = calculateWallCorners(wall as Wall, splitWalls as Wall[], pointMap);

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
          scene,
          0,
          false,
          false,
          startPoint,
          endPoint
        );

        // Assign material immediately (crucial for display styles)
        wallMesh.material = wallMaterial;

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
        // Determine if this wall is internal (shared between rooms) or external (perimeter)
        const wallIsInternal = isWallInternal(wall.startPointId, wall.endPointId);
        wallMesh.metadata = { type: 'wall', wallId: wall.id, isInternal: wallIsInternal };

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
    // Initialize auto wall hider for isometric cutaway feature (raycasting based)
    autoWallHiderRef.current = new AutoWallHider(scene);

    // Create floors for each room - ONLY inside walls (polygon shape)
    if (rooms && rooms.length > 0) {
      rooms.forEach((room, roomIndex) => {
        // Get raw 2D points in mm coordinates
        const raw2DPoints = room.points.map((pid: string) => {
          const p = pointMap.get(pid);
          if (!p) return null;
          return { x: p.x, y: p.y };
        }).filter((p: any): p is { x: number; y: number } => p !== null);

        if (raw2DPoints.length < 3) return;

        // Room points are at wall centerline - inset by half wall thickness to get inner edge
        // This matches the 2D floor rendering in RoomLayer.ts
        const insetDistance = DEFAULT_WALL_THICKNESS / 2; // 100mm inset
        const inset2DPoints = insetPolygon2D(raw2DPoints, insetDistance);

        if (inset2DPoints.length < 3) return;

        // Convert inset 2D points to 3D space (flip Z axis)
        const roomPoints = inset2DPoints.map((p) => {
          return new Vector3(
            p.x * MM_TO_METERS - centerX,
            0.01, // Slightly above Y=0 to prevent z-fighting
            -(p.y * MM_TO_METERS) - centerZ
          );
        });

        if (roomPoints.length < 3) return;

        // Create polygon floor directly on XZ plane (horizontal ground)
        // Using custom mesh with earcut triangulation
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

        // Store polygon points in metadata for hover outline
        floor.metadata = {
          ...floor.metadata,
          polygonPoints: roomPoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
          roomName: room.name || `Room ${roomIndex + 1}`
        };
      });
      // Create ceilings for each room - always create, visibility controlled by camera angle
      {
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
          // Get raw 2D points in mm coordinates
          const raw2DPoints = room.points.map((pid: string) => {
            const p = pointMap.get(pid);
            if (!p) return null;
            return { x: p.x, y: p.y };
          }).filter((p: any): p is { x: number; y: number } => p !== null);

          if (raw2DPoints.length < 3) return;

          // Room points are at wall centerline - inset by half wall thickness to get inner edge
          const insetDistance = DEFAULT_WALL_THICKNESS / 2; // 100mm inset
          const inset2DPoints = insetPolygon2D(raw2DPoints, insetDistance);

          if (inset2DPoints.length < 3) return;

          // Convert inset 2D points to 3D space (flip Z axis)
          const roomPoints = inset2DPoints.map((p) => {
            return new Vector3(
              p.x * MM_TO_METERS - centerX,
              ceilingY,
              -(p.y * MM_TO_METERS) - centerZ
            );
          });

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
          ceiling.metadata = { type: 'ceiling', roomIndex };
          ceiling.visibility = 0; // Initially hidden, controlled by AutoWallHider
        });
        // Invalidate AutoWallHider cache so it picks up new ceilings
        if (autoWallHiderRef.current) {
          autoWallHiderRef.current.invalidateCache();
        }
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

      // === WALL/FLOOR FACE OUTLINE ON HOVER ===
      // Draw cyan outline only on the picked face (not entire mesh)
      if (!playMode && scene) {
        if (pickResult && pickResult.hit && pickResult.pickedMesh && pickResult.faceId !== undefined) {
          const picked = pickResult.pickedMesh as Mesh;
          const meshName = picked.name.toLowerCase();

          const isWall = meshName.includes('wall') && !meshName.includes('hotspot') && !meshName.includes('grid');
          const isFloor = (meshName.includes('floor') || meshName.startsWith('room_')) && !meshName.includes('hotspot');
          const isCeiling = meshName.includes('ceiling') || picked.metadata?.type === 'ceiling';

          // Skip hidden/invisible meshes
          const isHidden = !picked.isVisible || picked.visibility < 0.5;

          if ((isWall || isFloor || isCeiling) && !isHidden && picked.getVerticesData && picked.getIndices) {

            const positions = picked.getVerticesData('position');
            const indices = picked.getIndices();

            if (positions && indices) {
              const faceId = pickResult.faceId;
              const triangleIndex = faceId * 3;

              // Get picked triangle vertices
              const idx0 = indices[triangleIndex];
              const idx1 = indices[triangleIndex + 1];
              const idx2 = indices[triangleIndex + 2];

              const worldMatrix = picked.getWorldMatrix();

              const v0 = Vector3.TransformCoordinates(
                new Vector3(positions[idx0 * 3], positions[idx0 * 3 + 1], positions[idx0 * 3 + 2]),
                worldMatrix
              );
              const v1 = Vector3.TransformCoordinates(
                new Vector3(positions[idx1 * 3], positions[idx1 * 3 + 1], positions[idx1 * 3 + 2]),
                worldMatrix
              );
              const v2 = Vector3.TransformCoordinates(
                new Vector3(positions[idx2 * 3], positions[idx2 * 3 + 1], positions[idx2 * 3 + 2]),
                worldMatrix
              );

              // Calculate face normal and plane
              const edge1 = v1.subtract(v0);
              const edge2 = v2.subtract(v0);
              const faceNormal = Vector3.Cross(edge1, edge2).normalize();
              const planeD = Vector3.Dot(faceNormal, v0);

              // For walls: skip non-inner-wall faces
              if (isWall) {
                // Skip horizontal faces (top/bottom)
                if (Math.abs(faceNormal.y) > 0.1) {
                  if (hoverOutlineRef.current) {
                    if (highlightLayerRef.current) {
                      highlightLayerRef.current.removeMesh(hoverOutlineRef.current);
                    }
                    hoverOutlineRef.current.dispose();
                    hoverOutlineRef.current = null;
                  }
                  lastHoverKeyRef.current = '';
                  return;
                }

                // Skip thin edge faces
                const minX = Math.min(v0.x, v1.x, v2.x);
                const maxX = Math.max(v0.x, v1.x, v2.x);
                const minZ = Math.min(v0.z, v1.z, v2.z);
                const maxZ = Math.max(v0.z, v1.z, v2.z);
                const wallThicknessThreshold = 0.35;
                if ((maxX - minX) < wallThicknessThreshold && (maxZ - minZ) < wallThicknessThreshold) {
                  if (hoverOutlineRef.current) {
                    if (highlightLayerRef.current) {
                      highlightLayerRef.current.removeMesh(hoverOutlineRef.current);
                    }
                    hoverOutlineRef.current.dispose();
                    hoverOutlineRef.current = null;
                  }
                  lastHoverKeyRef.current = '';
                  return;
                }
              }

              const hoverKey = `${picked.uniqueId}_${faceNormal.x.toFixed(2)}_${faceNormal.y.toFixed(2)}_${faceNormal.z.toFixed(2)}_${planeD.toFixed(2)}`;

              // Skip if same face
              if (hoverKey === lastHoverKeyRef.current) return;
              lastHoverKeyRef.current = hoverKey;

              // Clear previous outline
              if (hoverOutlineRef.current) {
                hoverOutlineRef.current.dispose();
              }

              // Build outline vertices
              const offset = 0.01;
              let outlineVerts: Vector3[];

              if (isFloor || isCeiling) {
                // For ceiling, offset below; for floor, offset above
                const yOffset = isCeiling ? -offset : offset;
                if (picked.metadata?.polygonPoints) {
                  const polyPoints = picked.metadata.polygonPoints as { x: number; y: number; z: number }[];
                  outlineVerts = polyPoints.map(p => new Vector3(p.x, v0.y + yOffset, p.z));
                } else {
                  const bb = picked.getBoundingInfo().boundingBox;
                  const bmin = bb.minimumWorld, bmax = bb.maximumWorld;
                  outlineVerts = [
                    new Vector3(bmin.x, v0.y + yOffset, bmin.z),
                    new Vector3(bmax.x, v0.y + yOffset, bmin.z),
                    new Vector3(bmax.x, v0.y + yOffset, bmax.z),
                    new Vector3(bmin.x, v0.y + yOffset, bmax.z)
                  ];
                }
              } else {
                // Wall: find inner face bounds (optimized scan)
                const isXWall = Math.abs(faceNormal.x) > Math.abs(faceNormal.z);
                const planePos = isXWall ? (v0.x + v1.x + v2.x) / 3 : (v0.z + v1.z + v2.z) / 3;
                const localPlanePos = isXWall ? positions[idx0 * 3] : positions[idx0 * 3 + 2];

                let minY = Math.min(v0.y, v1.y, v2.y);
                let maxY = Math.max(v0.y, v1.y, v2.y);
                let minH = isXWall ? Math.min(v0.z, v1.z, v2.z) : Math.min(v0.x, v1.x, v2.x);
                let maxH = isXWall ? Math.max(v0.z, v1.z, v2.z) : Math.max(v0.x, v1.x, v2.x);

                // Fast scan coplanar triangles (every 3rd for speed)
                const step = Math.max(3, Math.floor(indices.length / 300)) * 3;
                for (let i = 0; i < indices.length; i += step) {
                  const ti0 = indices[i], ti1 = indices[i + 1], ti2 = indices[i + 2];
                  const tp = isXWall
                    ? (positions[ti0 * 3] + positions[ti1 * 3] + positions[ti2 * 3]) / 3
                    : (positions[ti0 * 3 + 2] + positions[ti1 * 3 + 2] + positions[ti2 * 3 + 2]) / 3;

                  if (Math.abs(tp - localPlanePos) > 0.03) continue;

                  const ty0 = positions[ti0 * 3 + 1], ty1 = positions[ti1 * 3 + 1], ty2 = positions[ti2 * 3 + 1];
                  minY = Math.min(minY, ty0, ty1, ty2);
                  maxY = Math.max(maxY, ty0, ty1, ty2);

                  if (isXWall) {
                    const tz0 = positions[ti0 * 3 + 2], tz1 = positions[ti1 * 3 + 2], tz2 = positions[ti2 * 3 + 2];
                    minH = Math.min(minH, tz0, tz1, tz2);
                    maxH = Math.max(maxH, tz0, tz1, tz2);
                  } else {
                    const tx0 = positions[ti0 * 3], tx1 = positions[ti1 * 3], tx2 = positions[ti2 * 3];
                    minH = Math.min(minH, tx0, tx1, tx2);
                    maxH = Math.max(maxH, tx0, tx1, tx2);
                  }
                }

                if (isXWall) {
                  const px = planePos + (faceNormal.x > 0 ? offset : -offset);
                  outlineVerts = [
                    new Vector3(px, minY, minH),
                    new Vector3(px, minY, maxH),
                    new Vector3(px, maxY, maxH),
                    new Vector3(px, maxY, minH)
                  ];
                } else {
                  const pz = planePos + (faceNormal.z > 0 ? offset : -offset);
                  outlineVerts = [
                    new Vector3(minH, minY, pz),
                    new Vector3(maxH, minY, pz),
                    new Vector3(maxH, maxY, pz),
                    new Vector3(minH, maxY, pz)
                  ];
                }
              }

              // Create tube outline
              const path = [...outlineVerts, outlineVerts[0]];
              const outline = MeshBuilder.CreateTube('hoverOutline', {
                path: path,
                radius: 0.015,
                tessellation: 4,
                cap: Mesh.NO_CAP,
                updatable: false
              }, scene);

              const themeColor = getThemeColor();
              const mat = new StandardMaterial('hoverMat', scene);
              mat.emissiveColor = themeColor;
              mat.disableLighting = true;
              outline.material = mat;
              outline.renderingGroupId = 3;
              outline.isPickable = false;

              if (highlightLayerRef.current) {
                highlightLayerRef.current.addMesh(outline, themeColor);
              }

              hoverOutlineRef.current = outline;
            }
          }
        } else {
          // Clear overlay when hovering on non-wall/floor mesh
          if (hoverOutlineRef.current) {
            if (highlightLayerRef.current) {
              highlightLayerRef.current.removeMesh(hoverOutlineRef.current);
            }
            hoverOutlineRef.current.dispose();
            hoverOutlineRef.current = null;
          }
          lastHoverKeyRef.current = '';
        }
      } else {
        // Clear overlay when hovering on empty space (no mesh hit)
        if (hoverOutlineRef.current) {
          if (highlightLayerRef.current) {
            highlightLayerRef.current.removeMesh(hoverOutlineRef.current);
          }
          hoverOutlineRef.current.dispose();
          hoverOutlineRef.current = null;
        }
        lastHoverKeyRef.current = '';
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
              }
            };

            animate();
          }
        }

        // Add face glow on click for walls, floors, and ceilings
        const clickedMeshName = picked.name.toLowerCase();
        const isClickedWall = clickedMeshName.includes('wall') && !clickedMeshName.includes('hotspot');
        const isClickedFloor = (clickedMeshName.includes('floor') || clickedMeshName.startsWith('room_')) && !clickedMeshName.includes('hotspot');
        const isClickedCeiling = clickedMeshName.includes('ceiling') || picked.metadata?.type === 'ceiling';

        if ((isClickedWall || isClickedFloor || isClickedCeiling) && !playMode && pickResult.faceId !== undefined) {
          // Clear previous face overlay
          if (clickFaceOverlayRef.current) {
            if (highlightLayerRef.current) {
              highlightLayerRef.current.removeMesh(clickFaceOverlayRef.current);
            }
            clickFaceOverlayRef.current.dispose();
            clickFaceOverlayRef.current = null;
          }

          const clickedMesh = picked as Mesh;
          const positions = clickedMesh.getVerticesData(VertexBuffer.PositionKind);
          const indices = clickedMesh.getIndices();

          if (positions && indices && pickResult.faceId * 3 + 2 < indices.length) {
            const faceId = pickResult.faceId;
            const idx0 = indices[faceId * 3];
            const idx1 = indices[faceId * 3 + 1];
            const idx2 = indices[faceId * 3 + 2];
            const worldMatrix = clickedMesh.getWorldMatrix();

            const v0 = Vector3.TransformCoordinates(
              new Vector3(positions[idx0 * 3], positions[idx0 * 3 + 1], positions[idx0 * 3 + 2]),
              worldMatrix
            );
            const v1 = Vector3.TransformCoordinates(
              new Vector3(positions[idx1 * 3], positions[idx1 * 3 + 1], positions[idx1 * 3 + 2]),
              worldMatrix
            );
            const v2 = Vector3.TransformCoordinates(
              new Vector3(positions[idx2 * 3], positions[idx2 * 3 + 1], positions[idx2 * 3 + 2]),
              worldMatrix
            );

            const edge1 = v1.subtract(v0);
            const edge2 = v2.subtract(v0);
            const faceNormal = Vector3.Cross(edge1, edge2).normalize();

            // For walls: skip non-inner-wall faces
            let skipFace = false;
            if (isClickedWall) {
              if (Math.abs(faceNormal.y) > 0.1) skipFace = true;
              const minX = Math.min(v0.x, v1.x, v2.x);
              const maxX = Math.max(v0.x, v1.x, v2.x);
              const minZ = Math.min(v0.z, v1.z, v2.z);
              const maxZ = Math.max(v0.z, v1.z, v2.z);
              if ((maxX - minX) < 0.35 && (maxZ - minZ) < 0.35) skipFace = true;
            }

            if (!skipFace) {
              // Build face vertices for overlay
              let faceOverlayVerts: Vector3[] = [];

              if (isClickedFloor && clickedMesh.metadata?.polygonPoints) {
                const polyPoints = clickedMesh.metadata.polygonPoints as { x: number; y: number; z: number }[];
                polyPoints.forEach(p => faceOverlayVerts.push(new Vector3(p.x, v0.y + 0.02, p.z)));
              } else if (isClickedFloor) {
                const bb = clickedMesh.getBoundingInfo().boundingBox;
                const min = bb.minimumWorld, max = bb.maximumWorld;
                faceOverlayVerts = [
                  new Vector3(min.x, v0.y + 0.02, min.z),
                  new Vector3(max.x, v0.y + 0.02, min.z),
                  new Vector3(max.x, v0.y + 0.02, max.z),
                  new Vector3(min.x, v0.y + 0.02, max.z)
                ];
              } else {
                // Wall: find actual inner wall face bounds via triangle iteration
                const isXWall = Math.abs(faceNormal.x) > Math.abs(faceNormal.z);
                const planePos = isXWall ? (v0.x + v1.x + v2.x) / 3 : (v0.z + v1.z + v2.z) / 3;

                let minY = Infinity, maxY = -Infinity;
                let minH = Infinity, maxH = -Infinity;

                for (let i = 0; i < indices.length; i += 3) {
                  const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
                  const tv0 = Vector3.TransformCoordinates(new Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]), worldMatrix);
                  const tv1 = Vector3.TransformCoordinates(new Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]), worldMatrix);
                  const tv2 = Vector3.TransformCoordinates(new Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]), worldMatrix);

                  const avgP = isXWall ? (tv0.x + tv1.x + tv2.x) / 3 : (tv0.z + tv1.z + tv2.z) / 3;
                  if (Math.abs(avgP - planePos) > 0.02) continue;

                  const e1 = tv1.subtract(tv0), e2 = tv2.subtract(tv0);
                  if (Vector3.Dot(Vector3.Cross(e1, e2).normalize(), faceNormal) < 0.9) continue;

                  minY = Math.min(minY, tv0.y, tv1.y, tv2.y);
                  maxY = Math.max(maxY, tv0.y, tv1.y, tv2.y);
                  if (isXWall) {
                    minH = Math.min(minH, tv0.z, tv1.z, tv2.z);
                    maxH = Math.max(maxH, tv0.z, tv1.z, tv2.z);
                  } else {
                    minH = Math.min(minH, tv0.x, tv1.x, tv2.x);
                    maxH = Math.max(maxH, tv0.x, tv1.x, tv2.x);
                  }
                }

                if (minY !== Infinity) {
                  const offset = 0.02;
                  if (isXWall) {
                    const px = planePos + (faceNormal.x > 0 ? offset : -offset);
                    faceOverlayVerts = [
                      new Vector3(px, minY, minH),
                      new Vector3(px, minY, maxH),
                      new Vector3(px, maxY, maxH),
                      new Vector3(px, maxY, minH)
                    ];
                  } else {
                    const pz = planePos + (faceNormal.z > 0 ? offset : -offset);
                    faceOverlayVerts = [
                      new Vector3(minH, minY, pz),
                      new Vector3(maxH, minY, pz),
                      new Vector3(maxH, maxY, pz),
                      new Vector3(minH, maxY, pz)
                    ];
                  }
                }
              }

              // Create face overlay with glow
              if (faceOverlayVerts.length >= 3) {
                let faceOverlay: Mesh;

                if (isClickedFloor) {
                  // Floor: create polygon
                  const shape3D = faceOverlayVerts.map(v => new Vector3(v.x, 0, v.z));
                  faceOverlay = MeshBuilder.CreatePolygon('clickFaceOverlay', {
                    shape: shape3D,
                    depth: 0.001,
                    sideOrientation: Mesh.DOUBLESIDE
                  }, scene, earcut);
                  faceOverlay.position.y = faceOverlayVerts[0].y;
                } else {
                  // Wall: create plane from 4 vertices
                  const width = Vector3.Distance(faceOverlayVerts[0], faceOverlayVerts[1]);
                  const height = Vector3.Distance(faceOverlayVerts[1], faceOverlayVerts[2]);
                  faceOverlay = MeshBuilder.CreatePlane('clickFaceOverlay', {
                    width: width,
                    height: height,
                    sideOrientation: Mesh.DOUBLESIDE
                  }, scene);

                  // Position at center of face
                  const center = faceOverlayVerts[0].add(faceOverlayVerts[2]).scale(0.5);
                  faceOverlay.position = center;

                  // Rotate to face normal direction
                  const isXWall = Math.abs(faceNormal.x) > Math.abs(faceNormal.z);
                  if (isXWall) {
                    faceOverlay.rotation.y = Math.PI / 2;
                  }
                }

                const themeColor = getThemeColor();
                const faceMat = new StandardMaterial('clickFaceMat', scene);
                faceMat.emissiveColor = themeColor;
                faceMat.alpha = 0.15;
                faceMat.disableLighting = true;
                faceOverlay.material = faceMat;
                faceOverlay.renderingGroupId = 3;
                faceOverlay.isPickable = false;

                // Add glow to face overlay
                if (highlightLayerRef.current) {
                  highlightLayerRef.current.addMesh(faceOverlay, themeColor);
                }

                clickFaceOverlayRef.current = faceOverlay;

                // Set wall toolbar position if wall clicked
                if (isClickedWall) {
                  const center = faceOverlay.getBoundingInfo().boundingBox.centerWorld;
                  const camera = arcCameraRef.current;
                  const engine = engineRef.current;
                  if (camera && engine) {
                    const screenPos = Vector3.Project(
                      center,
                      Matrix.Identity(),
                      scene.getTransformMatrix(),
                      camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
                    );

                    const wallId = clickedMesh.name;
                    setSelectedWall({
                      mesh: clickedMesh,
                      wallId,
                      screenPosition: { x: screenPos.x, y: screenPos.y - 80 }
                    });
                    setSelectedFloor(null);
                  }
                }
              }
            }
          }
        } else if (!playMode) {
          // Clear face overlay and hover glow when clicking on other objects
          if (clickFaceOverlayRef.current) {
            if (highlightLayerRef.current) {
              highlightLayerRef.current.removeMesh(clickFaceOverlayRef.current);
            }
            clickFaceOverlayRef.current.dispose();
            clickFaceOverlayRef.current = null;
          }
          if (hoverOutlineRef.current) {
            if (highlightLayerRef.current) {
              highlightLayerRef.current.removeMesh(hoverOutlineRef.current);
            }
            hoverOutlineRef.current.dispose();
            hoverOutlineRef.current = null;
          }
          lastHoverKeyRef.current = '';
          setSelectedWall(null);
          setSelectedFloor(null);
          setSelectedCeiling(null);
        }

        // Check if clicked on floor (for toolbar selection state only - no blue outline)
        const meshName = picked.name.toLowerCase();
        const isFloor = (meshName.includes('floor') || meshName.startsWith('room_')) && !meshName.includes('hotspot');
        const isCeiling = meshName.includes('ceiling') || picked.metadata?.type === 'ceiling';

        if (isFloor && !playMode) {
          const floorMesh = picked as Mesh;
          selectedFloorMeshRef.current = floorMesh;
          setSelectedWall(null);
          setSelectedCeiling(null);

          // Get screen position for toolbar
          const boundingInfo = floorMesh.getBoundingInfo();
          const min = boundingInfo.boundingBox.minimumWorld;
          const max = boundingInfo.boundingBox.maximumWorld;
          const floorY = (min.y + max.y) / 2 + 0.02;
          const floorCenter = new Vector3((min.x + max.x) / 2, floorY, (min.z + max.z) / 2);
          const camera = arcCameraRef.current;
          const engine = engineRef.current;
          if (camera && engine) {
            const screenPos = Vector3.Project(
              floorCenter,
              Matrix.Identity(),
              scene.getTransformMatrix(),
              camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );

            const roomId = floorMesh.name.replace('room_', '').replace('_floor', '');
            const roomName = floorMesh.metadata?.roomName || roomId;

            setSelectedFloor({
              mesh: floorMesh,
              roomId,
              roomName,
              screenPosition: { x: screenPos.x, y: screenPos.y + 50 }
            });
          }
        } else if (isCeiling && !playMode) {
          // Ceiling clicked - show ceiling editor toolbar
          const ceilingMesh = picked as Mesh;
          selectedCeilingMeshRef.current = ceilingMesh;
          setSelectedWall(null);
          setSelectedFloor(null);

          // Get screen position for toolbar
          const boundingInfo = ceilingMesh.getBoundingInfo();
          const min = boundingInfo.boundingBox.minimumWorld;
          const max = boundingInfo.boundingBox.maximumWorld;
          const ceilingY = (min.y + max.y) / 2 - 0.02;
          const ceilingCenter = new Vector3((min.x + max.x) / 2, ceilingY, (min.z + max.z) / 2);
          const camera = arcCameraRef.current;
          const engine = engineRef.current;
          if (camera && engine) {
            const screenPos = Vector3.Project(
              ceilingCenter,
              Matrix.Identity(),
              scene.getTransformMatrix(),
              camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
            );

            const roomIndex = ceilingMesh.metadata?.roomIndex ?? 0;

            setSelectedCeiling({
              mesh: ceilingMesh,
              roomIndex,
              screenPosition: { x: screenPos.x, y: screenPos.y + 50 }
            });
          }
        } else if (!isFloor && !isCeiling && !playMode && !isClickedWall) {
          // Clicked elsewhere (not wall, not floor, not ceiling) - clear selection
          selectedFloorMeshRef.current = null;
          selectedCeilingMeshRef.current = null;
          setSelectedFloor(null);
          setSelectedCeiling(null);
        }
      } else if (!playMode) {
        // Clicked on background (no mesh hit) - clear all selections and glow
        if (clickFaceOverlayRef.current) {
          if (highlightLayerRef.current) {
            highlightLayerRef.current.removeMesh(clickFaceOverlayRef.current);
          }
          clickFaceOverlayRef.current.dispose();
          clickFaceOverlayRef.current = null;
        }
        if (hoverOutlineRef.current) {
          if (highlightLayerRef.current) {
            highlightLayerRef.current.removeMesh(hoverOutlineRef.current);
          }
          hoverOutlineRef.current.dispose();
          hoverOutlineRef.current = null;
        }
        lastHoverKeyRef.current = '';
        selectedFloorMeshRef.current = null;
        selectedCeilingMeshRef.current = null;
        setSelectedFloor(null);
        setSelectedWall(null);
        setSelectedCeiling(null);
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
          return;
        }

        const targetPosition = pickResult.pickedPoint.clone();
        // Keep camera at eye height
        targetPosition.y = DEFAULT_CAMERA_HEIGHT;
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
      } else {
        // Restore sunlight if windows exist
        const intensity = sunSettings?.intensity ?? 1.5;
        sunLight.intensity = intensity;
      }
    }
  }, [playMode, floorplanData?.windows, sunSettings?.intensity, lights.length]);

  // Update sun light and skybox when settings change
  useEffect(() => {
    const sunLight = sunLightRef.current;
    const scene = sceneRef.current;
    if (!sunLight || !sunSettings || !scene) return;

    const { azimuth, altitude, intensity } = sunSettings;
    const azimuthRad = (azimuth * Math.PI) / 180;
    const altitudeRad = (altitude * Math.PI) / 180;

    // Update light DIRECTION (not position) - pointing DOWN toward scene
    const dirX = -Math.cos(altitudeRad) * Math.sin(azimuthRad);
    const dirY = -Math.sin(altitudeRad);
    const dirZ = -Math.cos(altitudeRad) * Math.cos(azimuthRad);

    sunLight.direction = new Vector3(dirX, dirY, dirZ);
    sunLight.intensity = intensity;

    // Update skybox sun position
    const skybox = scene.getMeshByName('skybox');
    if (skybox && skybox.material instanceof SkyMaterial) {
      const skyMaterial = skybox.material as SkyMaterial;
      // Skybox uses sun POSITION (opposite of direction)
      const sunX = Math.cos(altitudeRad) * Math.sin(azimuthRad);
      const sunY = Math.sin(altitudeRad);
      const sunZ = Math.cos(altitudeRad) * Math.cos(azimuthRad);
      skyMaterial.sunPosition = new Vector3(sunX, sunY, sunZ);
    }

    // Update sun disk position
    const sunDisk = scene.getMeshByName('sunDisk');
    if (sunDisk) {
      const distance = 400;
      const sunX = distance * Math.cos(altitudeRad) * Math.sin(azimuthRad);
      const sunY = distance * Math.sin(altitudeRad);
      const sunZ = distance * Math.cos(altitudeRad) * Math.cos(azimuthRad);
      sunDisk.position = new Vector3(sunX, sunY, sunZ);
      // Hide sun when below horizon
      sunDisk.isVisible = altitude > 0;
    }

    // Update ground plane brightness based on altitude
    const groundMesh = scene.getMeshByName('whiteGround');
    if (groundMesh && groundMesh.material instanceof StandardMaterial) {
      const groundMat = groundMesh.material as StandardMaterial;
      const brightness = Math.max(0.05, Math.min(0.5, (altitude + 10) / 100));
      groundMat.diffuseColor = new Color3(brightness, brightness, brightness);
      groundMat.emissiveColor = new Color3(brightness * 0.8, brightness * 0.8, brightness * 0.8);
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
      return;
    }

    if (!visible) {
      // Detach all controls when not visible
      arcCamera.detachControl();
      fpsCamera.detachControl();
      return;
    }

    // Wall Cutaway Logic (Auto-hide walls blocking view)
    // Performance: Throttle to 10 FPS and cache child meshes
    let lastWallUpdate = 0;
    const WALL_UPDATE_INTERVAL = 100; // 100ms = 10 FPS
    const childMeshCache = new Map<string, any[]>();

    const getChildMeshesCached = (mesh: any) => {
      const key = mesh.uniqueId;
      if (!childMeshCache.has(key)) {
        childMeshCache.set(key, mesh.getChildMeshes());
      }
      return childMeshCache.get(key)!;
    };

    const updateWallVisibility = () => {
      // Throttle updates for performance
      const now = performance.now();
      if (now - lastWallUpdate < WALL_UPDATE_INTERVAL) return;
      lastWallUpdate = now;

      if (!planMetricsRef.current || !wallMeshesRef.current.length) return;
      if (scene.activeCamera !== arcCamera) {
        // Reset visibility if not in ArcRotate mode
        wallMeshesRef.current.forEach(mesh => {
          mesh.isVisible = true;
          getChildMeshesCached(mesh).forEach((child: any) => child.isVisible = true);
        });
        return;
      }

      // 1. Top-down view check: If camera is looking from above (beta < 0.6), show all walls
      if (arcCamera.beta < 0.6) {
        wallMeshesRef.current.forEach(mesh => {
          mesh.isVisible = true;
          getChildMeshesCached(mesh).forEach((child: any) => child.isVisible = true);
        });
        return;
      }

      wallMeshesRef.current.forEach(wallMesh => {
        const wallPos = wallMesh.position;
        const cameraPos = arcCamera.position;

        const wallLen = Math.sqrt(wallPos.x * wallPos.x + wallPos.z * wallPos.z);
        const camLen = Math.sqrt(cameraPos.x * cameraPos.x + cameraPos.z * cameraPos.z);

        if (wallLen < 0.1 || camLen < 0.1) return;

        const dot = (wallPos.x * cameraPos.x + wallPos.z * cameraPos.z) / (wallLen * camLen);
        const shouldHide = dot > 0.3;

        if (shouldHide) {
          wallMesh.isVisible = false;
          getChildMeshesCached(wallMesh).forEach((child: any) => child.isVisible = false);
        } else {
          wallMesh.isVisible = true;
          getChildMeshesCached(wallMesh).forEach((child: any) => child.isVisible = true);
        }
      });
    };

    // Bind to camera update
    const observer = scene.onBeforeRenderObservable.add(updateWallVisibility);

    // Cleanup observer on effect re-run
    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [visible, playMode, showCharacter, controlMode]); // Re-bind if mode changes

  // Separate effect for camera control switching (to avoid conflict with the above return cleanup)
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const arcCamera = arcCameraRef.current;
    const fpsCamera = fpsCameraRef.current;
    const thirdPersonCamera = thirdPersonCameraRef.current;
    const character = characterRef.current;

    if (!scene || !canvas || !arcCamera || !fpsCamera || !thirdPersonCamera || !character) return;

    if (!visible) {
      arcCamera.detachControl();
      fpsCamera.detachControl();
      thirdPersonCamera.detachControl();
      return;
    }
    if (playMode) {
      // ====== PLAY MODE: 1st Person FPS (game mode) ======
      // Calculate best starting position (inside largest room)
      let startX = 0;
      let startZ = 0;
      let foundValidStart = false;

      if (floorplanData?.rooms && floorplanData.rooms.length > 0 && floorplanData.points) {
        const pointMap = new Map();
        floorplanData.points.forEach((p) => pointMap.set(p.id, p));

        let maxRoomArea = -1;

        floorplanData.rooms.forEach((room) => {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          let validPoints = 0;

          room.points.forEach((pid: string) => {
            const p = pointMap.get(pid);
            if (p) {
              minX = Math.min(minX, p.x);
              maxX = Math.max(maxX, p.x);
              minY = Math.min(minY, p.y);
              maxY = Math.max(maxY, p.y);
              validPoints++;
            }
          });

          if (validPoints >= 3) {
            const width = maxX - minX;
            const height = maxY - minY;
            const area = width * height;

            if (area > maxRoomArea) {
              maxRoomArea = area;
              startX = (minX + maxX) / 2 * MM_TO_METERS;
              startZ = -((minY + maxY) / 2 * MM_TO_METERS); // Flip Z
              foundValidStart = true;
            }
          }
        });
      }

      if (!foundValidStart) {
        // Fallback to geometric center
        const planMetrics = computePlanMetrics(floorplanData?.points);
        if (planMetrics) {
          startX = planMetrics.centerX;
          startZ = planMetrics.centerZ;
        }
      }

      fpsCamera.position = new Vector3(
        startX,
        DEFAULT_CAMERA_HEIGHT,
        startZ
      );
      fpsCamera.rotation = new Vector3(0, 0, 0);

      character.position = new Vector3(
        startX,
        0,
        startZ
      );

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
        window.removeEventListener('keydown', onFpsKeyDown);
        window.removeEventListener('keyup', onFpsKeyUp);
        scene.onBeforeRenderObservable.remove(fpsObserver);
        fpsCamera.detachControl();
        character.isVisible = true;
      };
    } else {
      // ====== 3D VIEW MODE: Restore Orbit control ======
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

        // Reset any orthographic settings
        arcCamera.orthoLeft = null;
        arcCamera.orthoRight = null;
        arcCamera.orthoTop = null;
        arcCamera.orthoBottom = null;

        // Don't force reset camera position - let it stay where user left it
        // arcCamera.setTarget(new Vector3(planMetrics.centerX, 0, planMetrics.centerZ));
        // arcCamera.alpha = Math.PI / 4; 
        // arcCamera.beta = Math.PI / 3; 
        // arcCamera.radius = 10;
      }

      // Show character
      character.isVisible = true;

      // Configure orbit controls
      arcCamera.lowerRadiusLimit = 0.5; // Allow close zoom
      arcCamera.upperRadiusLimit = 50;
      arcCamera.lowerBetaLimit = 0.1; // Prevent going under floor
      arcCamera.upperBetaLimit = Math.PI * 0.85; // Allow looking up at ceiling

      arcCamera.panningSensibility = 800; // Slower panning for trackpad
      arcCamera.wheelPrecision = 1; // Maximum zoom speed
      arcCamera.wheelDeltaPercentage = 0.05; // 5% zoom per scroll tick
      arcCamera.inertia = 0; // No inertia
      arcCamera.panningInertia = 0; // No panning inertia

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
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        // Force canvas to take full parent size
        const parent = canvas.parentElement;
        if (parent) {
          const width = parent.clientWidth;
          const height = parent.clientHeight;
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
  }, [showCharacter]);

  // Camera reset event
  // Camera reset event
  useEffect(() => {
    const handleCameraReset = () => {
      const arcCamera = arcCameraRef.current;
      const planMetrics = computePlanMetrics(floorplanData?.points);

      if (arcCamera && planMetrics) {
        const centerX = planMetrics.centerX;
        const centerZ = planMetrics.centerZ;
        const roomSize = Math.max(planMetrics.extentX, planMetrics.extentZ);
        const optimalRadius = roomSize * 2.5; // Updated to 2.5 to match initial view

        // Calculate target Y (center of wall height) to match initial view
        const walls = floorplanData?.walls || [];
        const maxWallHeight = walls.reduce((max: number, wall: any) => Math.max(max, wall.height || 2400), 2400);
        const targetY = (maxWallHeight * MM_TO_METERS) / 2;

        // Reset camera position and target
        arcCamera.setTarget(new Vector3(centerX, targetY, centerZ));
        arcCamera.radius = optimalRadius;
        arcCamera.alpha = -Math.PI / 4; // Default horizontal angle
        arcCamera.beta = Math.PI / 3.5; // Default vertical angle
      } else if (arcCamera) {
        // No floorplan data - reset to default
        arcCamera.setTarget(new Vector3(0, DEFAULT_CAMERA_HEIGHT, 0));
        arcCamera.radius = DEFAULT_CAMERA_RADIUS;
        arcCamera.alpha = -Math.PI / 4;
        arcCamera.beta = Math.PI / 3.5;
      }
    };

    eventBus.on(EditorEvents.CAMERA_RESET, handleCameraReset);

    return () => {
      eventBus.off(EditorEvents.CAMERA_RESET, handleCameraReset);
    };
  }, [floorplanData]);

  // Camera FOV and Projection change handlers
  useEffect(() => {
    const handleFovChange = (data: { fov: number }) => {
      const arcCamera = arcCameraRef.current;
      if (arcCamera) {
        // Convert horizontal FOV to vertical FOV (Babylon uses vertical FOV)
        // Assuming 16:9 aspect ratio
        const aspectRatio = 16 / 9;
        const horizontalFovRad = (data.fov * Math.PI) / 180;
        const verticalFovRad = 2 * Math.atan(Math.tan(horizontalFovRad / 2) / aspectRatio);
        arcCamera.fov = verticalFovRad;
      }
    };

    const handleProjectionChange = (data: { type: 'perspective' | 'orthographic' }) => {
      const arcCamera = arcCameraRef.current;
      if (arcCamera) {
        if (data.type === 'orthographic') {
          arcCamera.mode = 1; // ORTHOGRAPHIC
          // Set orthographic properties based on current radius
          const orthoSize = arcCamera.radius / 2;
          arcCamera.orthoLeft = -orthoSize;
          arcCamera.orthoRight = orthoSize;
          arcCamera.orthoTop = orthoSize / (16/9);
          arcCamera.orthoBottom = -orthoSize / (16/9);
        } else {
          arcCamera.mode = 0; // PERSPECTIVE
        }
      }
    };

    eventBus.on(EditorEvents.CAMERA_FOV_CHANGED, handleFovChange);
    eventBus.on(EditorEvents.CAMERA_PROJECTION_CHANGED, handleProjectionChange);

    return () => {
      eventBus.off(EditorEvents.CAMERA_FOV_CHANGED, handleFovChange);
      eventBus.off(EditorEvents.CAMERA_PROJECTION_CHANGED, handleProjectionChange);
    };
  }, []);

  // GLB model loading and placement with click-to-place
  useEffect(() => {
    if (!glbModelFile || !sceneRef.current || !canvasRef.current) {
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
    // Load GLB model - use objectUrl as sceneFilename with empty rootUrl
    SceneLoader.ImportMesh(
      '', // Load all meshes (empty = all)
      '', // Empty root URL
      objectUrl, // Full object URL as filename
      scene,
      (meshes) => {
        if (meshes.length > 0) {
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

        // Make meshes pickable and add shadow casters
        const shadowGen = sunLightRef.current?.getShadowGenerator() as ShadowGenerator | null;
        meshes.forEach((mesh) => {
          mesh.isPickable = true;
          mesh.receiveShadows = true;
          // Add as shadow caster
          if (shadowGen) {
            shadowGen.addShadowCaster(mesh);
          }
        });
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
              }
            } else {
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
    // Cleanup object URL
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [glbModelFile]); // Remove floorplanData dependency - GLB can load independently

  // Photo-realistic rendering pipeline
  useEffect(() => {
    const scene = sceneRef.current;
    const sunLight = sunLightRef.current;

    if (!scene) return;
    if (photoRealisticMode) {
      // Set hardware scaling to 1.0 for maximum quality (no downscaling)
      const engine = engineRef.current;
      if (engine) {
        engine.setHardwareScalingLevel(1.0);
      }

      // Create high-quality rendering pipeline
      if (!pipelineRef.current) {
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
          pipelineAny.ssao2.radius = 1.5; // Larger radius for soft shadows
          pipelineAny.ssao2.totalStrength = 1.8; // Strong but natural
          pipelineAny.ssao2.base = 0.1; // Deep crevices
          pipelineAny.ssao2.samples = 64; // Maximum samples for smoothness
          pipelineAny.ssao2.textureSamples = 8; // High multi-sampling
          pipelineAny.ssao2.expensiveBlur = true;
          pipelineAny.ssao2.bilateralBlur = true;
          pipelineAny.ssao2.bilateralSoften = 0.02; // Very subtle softening
          pipelineAny.ssao2.bilateralTolerance = 0.00001; // Minimal tolerance for sharp edges
        }

        // Enable SSR for realistic reflections (carefully tuned)
        if (pipelineAny.screenSpaceReflectionsEnabled !== undefined) {
          pipelineAny.screenSpaceReflectionsEnabled = true;
          if (pipelineAny.screenSpaceReflections) {
            pipelineAny.screenSpaceReflections.step = 1; // High precision
            pipelineAny.screenSpaceReflections.strength = 1.2; // Visible reflections
            pipelineAny.screenSpaceReflections.roughnessFactor = 0.2; // Glossy reflections
          }
        }

        // Bloom disabled
        pipeline.bloomEnabled = false;

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
      }

      // Create environment texture for PBR materials
      if (!scene.environmentTexture) {
        // Use skybox as environment reflection source
        const skybox = scene.getMeshByName('skybox');
        if (skybox && skybox.material instanceof SkyMaterial) {
          // Create procedural environment from skybox for reflections
          const hdrTexture = CubeTexture.CreateFromPrefilteredData(
            'https://assets.babylonjs.com/environments/studio.env',
            scene
          );
          scene.environmentTexture = hdrTexture;
          scene.environmentTexture.level = 1.2; // Boost brightness
        }
      }

      // Enhance environment reflections for PBR materials
      if (scene.environmentIntensity !== 1.5) {
        scene.environmentIntensity = 1.5; // Boost environment reflections
      }

      // Ultra shadow quality for photo-realistic mode
      if (sunLight) {
        const shadowGen = sunLight.getShadowGenerator() as ShadowGenerator | null;
        if (shadowGen) {
          shadowGen.mapSize = 8192; // Ultra quality 8K shadows
          shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
          shadowGen.contactHardeningLightSizeUVRatio = 0.05; // Realistic penumbra
          shadowGen.darkness = 0.5; // Balanced shadow darkness
          shadowGen.blurKernel = 64; // Moderate blur for sharpness
        }
      }

    } else {
      // Disable photo-realistic pipeline
      if (pipelineRef.current) {
        pipelineRef.current.dispose();
        pipelineRef.current = null;
      }

      // Reset scene image processing to defaults
      if (scene.imageProcessingConfiguration) {
        scene.imageProcessingConfiguration.toneMappingEnabled = false;
        scene.imageProcessingConfiguration.contrast = 1.0;
        scene.imageProcessingConfiguration.exposure = 1.0;
        scene.imageProcessingConfiguration.vignetteEnabled = false;
      }

      // Remove environment texture
      if (scene.environmentTexture) {
        scene.environmentTexture.dispose();
        scene.environmentTexture = null;
      }

      // Reset environment intensity to standard
      if (scene.environmentIntensity !== 1.0) {
        scene.environmentIntensity = 1.0;
      }

      // Restore standard shadow quality
      if (sunLight) {
        const shadowGen = sunLight.getShadowGenerator() as ShadowGenerator | null;
        if (shadowGen) {
          shadowGen.mapSize = 4096; // Keep high quality even in standard mode
          shadowGen.filteringQuality = ShadowGenerator.QUALITY_HIGH;
          shadowGen.darkness = 0.3;
          shadowGen.blurKernel = 64; // Keep smooth shadows
        }
      }
    }
  }, [photoRealisticMode]);

  // Update rendering settings in real-time without recreating pipeline
  useEffect(() => {
    if (!photoRealisticMode || !pipelineRef.current || !renderSettings) return;

    const pipeline = pipelineRef.current;
    const pipelineAny = pipeline as any;
    // Update SSAO
    if (pipelineAny.ssao2) {
      pipelineAny.ssao2.radius = renderSettings.ssaoRadius;
      pipelineAny.ssao2.totalStrength = renderSettings.ssaoStrength;
    }

    // Update SSR
    if (pipelineAny.screenSpaceReflections) {
      pipelineAny.screenSpaceReflections.strength = renderSettings.ssrStrength;
    }

    // Update Bloom
    if (pipelineAny.bloom) {
      pipelineAny.bloom.threshold = renderSettings.bloomThreshold;
      pipelineAny.bloom.weight = renderSettings.bloomWeight;
    }

    // Update DOF
    if (pipeline.depthOfField) {
      pipeline.depthOfField.focusDistance = renderSettings.dofFocusDistance;
      pipeline.depthOfField.fStop = renderSettings.dofFStop;
    }

    // Update Image Processing
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.vignetteWeight = renderSettings.vignetteWeight;
    }

    // Update Chromatic Aberration
    if (pipeline.chromaticAberration) {
      pipeline.chromaticAberration.aberrationAmount = renderSettings.chromaticAberration;
    }

    // Update Grain
    if (pipeline.grain) {
      pipeline.grain.intensity = renderSettings.grainIntensity;
    }

    // Update Sharpen
    if (pipeline.sharpen) {
      pipeline.sharpen.edgeAmount = renderSettings.sharpenAmount;
      pipeline.sharpen.colorAmount = renderSettings.sharpenAmount;
    }
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
  }, [lights]);

  // Light placement mode - click to place lights
  useEffect(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;

    if (!scene || !canvas || !lightPlacementMode || !onLightPlaced || playMode) {
      if (lightPlacementMode && playMode) {
      }
      return;
    }
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
      const clickPosition = getPlacementPosition(event);

      if (!clickPosition) return;

      // Convert Babylon position (meters) to mm coordinates for Light object
      const lightPosition = {
        x: clickPosition.x * 1000, // meters to mm
        y: clickPosition.y * 1000, // meters to mm (always 2400mm = ceiling)
        z: -clickPosition.z * 1000 // meters to mm (flip Z back)
      };

      // Create light with default settings for selected type
      const newLight = createDefaultLight(selectedLightType, lightPosition);

      // Call callback to add light to state
      onLightPlaced(newLight);
    };
    canvas.addEventListener('click', handleLightPlacement);
    canvas.addEventListener('pointermove', handlePointerMove);

    return () => {
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

    // Control SSAO based on display style
    const ssao = ssaoRef.current;
    if (ssao) {
      if (displayStyle === 'white') {
        // Disable SSAO for clean white model
        ssao.totalStrength = 0;
      } else {
        // Re-enable SSAO for other styles
        ssao.totalStrength = 2.5;
      }
    }

    // Skip certain meshes (grid, skybox, ground, etc.)
    const excludedNames = ['gridPlane', 'skyBox', 'groundPlane', 'infiniteGrid', 'sunDisk', 'hdrSkybox'];

    scene.meshes.forEach((mesh) => {
      // Skip excluded meshes
      if (excludedNames.some(name => mesh.name.includes(name))) return;
      if (!mesh.material) return;

      const meshId = mesh.uniqueId.toString();

      // Store original material if not already stored
      if (!originalMaterialsRef.current.has(meshId)) {
        originalMaterialsRef.current.set(meshId, mesh.material);
      }

      const originalMaterial = originalMaterialsRef.current.get(meshId);

      switch (displayStyle) {
        case 'material':
          // Restore original material
          if (originalMaterial) {
            mesh.material = originalMaterial;
            mesh.receiveShadows = true; // Restore shadows
          }
          break;

        case 'white':
          // White clay model - flat white with edge lines for contour visibility
          const whiteMat = new StandardMaterial(`whiteMat_${meshId}`, scene);
          whiteMat.diffuseColor = new Color3(1, 1, 1);
          whiteMat.specularColor = new Color3(0, 0, 0); // No specular
          whiteMat.emissiveColor = new Color3(0.95, 0.95, 0.95); // Self-illuminated for flat look
          whiteMat.disableLighting = true; // Disable all lighting effects
          mesh.material = whiteMat;
          mesh.receiveShadows = false; // No shadows
          // Enable edge rendering for contour visibility
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 1.0;
          mesh.edgesColor = new Color4(0.3, 0.3, 0.3, 1); // Dark gray edges
          break;

        case 'sketch':
          // Cartoon/sketch style - light gray with edge highlight
          const sketchMat = new StandardMaterial(`sketchMat_${meshId}`, scene);
          sketchMat.diffuseColor = new Color3(0.9, 0.88, 0.85);
          sketchMat.specularColor = new Color3(0, 0, 0);
          sketchMat.emissiveColor = new Color3(0.1, 0.08, 0.06);
          mesh.material = sketchMat;
          // Enable edge rendering for sketch effect
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 2.0;
          mesh.edgesColor = new Color4(0.2, 0.2, 0.2, 1);
          break;

        case 'transparent':
          // Transparent/X-ray style
          const transparentMat = new StandardMaterial(`transparentMat_${meshId}`, scene);
          transparentMat.diffuseColor = new Color3(0.7, 0.85, 1.0);
          transparentMat.specularColor = new Color3(0.3, 0.3, 0.3);
          transparentMat.alpha = 0.3;
          transparentMat.backFaceCulling = false;
          mesh.material = transparentMat;
          // Enable edge rendering for wireframe effect
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 1.5;
          mesh.edgesColor = new Color4(0.3, 0.5, 0.8, 1);
          break;
      }

      // Handle edge rendering for material style
      if (displayStyle === 'material') {
        if (showEdges) {
          // Enable edge rendering when Line toggle is on in material mode
          mesh.enableEdgesRendering();
          mesh.edgesWidth = 0.5;
          mesh.edgesColor = new Color4(0.2, 0.2, 0.2, 1); // Dark gray edges
        } else {
          mesh.disableEdgesRendering();
        }
      }
    });
  }, [displayStyle, floorplanData, showEdges]);

  // Update grid visibility when showGrid changes
  useEffect(() => {
    const gridMesh = infiniteGridRef.current;
    if (gridMesh) {
      gridMesh.setEnabled(showGrid);
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
      {/* Wall Editor Toolbar */}
      {selectedWall && !playMode && (
        <div
          style={{
            position: 'absolute',
            left: selectedWall.screenPosition.x,
            top: selectedWall.screenPosition.y,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            zIndex: 100,
          }}
        >
          {/* Wall Editor Button */}
          <button
            style={{
              background: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            onClick={() => {
              // Navigate to wall editor
              window.location.href = `/wall-editor?wallId=${encodeURIComponent(selectedWall.wallId)}`;
            }}
          >
            Wall Editor
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </button>
          {/* Toolbar Icons */}
          <div
            style={{
              background: '#333',
              borderRadius: '6px',
              padding: '6px 8px',
              display: 'flex',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {/* Drag handle */}
            <div style={{ padding: '6px', color: '#888', cursor: 'grab' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
            </div>
            {/* Edit */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* Floor Editor Toolbar - only show if no ceiling selected */}
      {selectedFloor && !selectedCeiling && !playMode && (
        <div
          style={{
            position: 'absolute',
            left: selectedFloor.screenPosition.x,
            top: selectedFloor.screenPosition.y,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            zIndex: 100,
          }}
        >
          {/* Floor Editor Button */}
          <button
            style={{
              background: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            onClick={() => {
              // TODO: Open floor editor
              console.log('Open floor editor for:', selectedFloor.roomId);
            }}
          >
            Floor Editor
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </button>
          {/* Toolbar Icons */}
          <div
            style={{
              background: '#333',
              borderRadius: '6px',
              padding: '6px 8px',
              display: 'flex',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {/* Drag handle */}
            <div style={{ padding: '6px', color: '#888', cursor: 'grab' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
            </div>
            {/* Edit */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            {/* Rotate */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Rotate">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
            {/* Copy */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Copy">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            </button>
            {/* Favorite */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Favorite">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            </button>
            {/* Delete */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            {/* Mirror */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Mirror">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9.01 14H2v2h7.01v3L13 15l-3.99-4v3zm5.98-1v-3H22V8h-7.01V5L11 9l3.99 4z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* Ceiling Editor Toolbar - only show if no floor selected */}
      {selectedCeiling && !selectedFloor && !playMode && (
        <div
          style={{
            position: 'absolute',
            left: selectedCeiling.screenPosition.x,
            top: selectedCeiling.screenPosition.y,
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
            zIndex: 100,
          }}
        >
          {/* Ceiling Editor Button */}
          <button
            style={{
              background: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            onClick={() => {
              // TODO: Open ceiling editor
              console.log('Open ceiling editor for room:', selectedCeiling.roomIndex);
            }}
          >
            Ceiling Editor
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </button>
          {/* Toolbar Icons */}
          <div
            style={{
              background: '#333',
              borderRadius: '6px',
              padding: '6px 8px',
              display: 'flex',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {/* Drag handle */}
            <div style={{ padding: '6px', color: '#888', cursor: 'grab' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
              </svg>
            </div>
            {/* Edit */}
            <button style={{ background: 'transparent', border: 'none', padding: '6px', color: 'white', cursor: 'pointer', borderRadius: '4px' }} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default Babylon3DCanvas;
