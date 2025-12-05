/**
 * WorldEditorPage - Archiple World Level Editor
 *
 * Unity/Unreal style level editor with real-world map-based city generation
 * Features:
 * - STEP 1: Area Selection (MapLibre GL 2D map)
 * - STEP 2: 3D Explore & Customize (Babylon.js terrain/buildings)
 * - STEP 3: Share & Download (glTF/OBJ export)
 *
 * Based on Maps3D Editor benchmark with enterprise-level features
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiaCodeBranchSolid, LiaPencilRulerSolid } from "react-icons/lia";
import { GrMap } from "react-icons/gr";
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
  VertexData,
  StandardMaterial,
  CubeTexture,
  Texture,
  AbstractMesh,
  AnimationGroup,
  SceneLoader,
  ShadowGenerator,
  Ray,
  GizmoManager,
  PointerEventTypes,
  HighlightLayer,
  Matrix,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0';
import { OBJFileLoader } from '@babylonjs/loaders/OBJ';

// Configure OBJ loader to skip MTL files (they can't be loaded from blob URLs)
OBJFileLoader.SKIP_MATERIALS = true;
import { GridMaterial } from '@babylonjs/materials/grid';
import { SkyMaterial } from '@babylonjs/materials/sky';
import styles from './WorldEditorPage.module.css';
import { MapSelector } from '../world/components';
import type { SelectedArea } from '../world/components/MapSelector';
import {
  fetchCityData,
  fetchVWorldCityData,
  generateCityMeshes,
  disposeCityMeshes,
  generateArchitecturalCity,
  disposeArchitecturalCity,
  type CityMeshes,
  type ArchitecturalMeshes,
} from '../world/utils';

// ARCHIPLE WORLD Logo component with theme color support
interface ArchipleWorldLogoProps {
  color?: string;
  height?: number;
}

const ArchipleWorldLogo: React.FC<ArchipleWorldLogoProps> = ({ color = '#10b981', height = 32 }) => {
  // Use mask-image to apply theme color directly to SVG
  return (
    <div
      style={{
        height: `${height}px`,
        width: `${height * 7}px`,
        backgroundColor: color,
        WebkitMaskImage: 'url(/images/world-logo.svg)',
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        maskImage: 'url(/images/world-logo.svg)',
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'left center',
        display: 'block',
      }}
      role="img"
      aria-label="ARCHIPLE WORLD"
    />
  );
};

// Types for World Editor
interface WorldArea {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  name?: string;
}

interface TerrainOptions {
  enabled: boolean;
  verticalExaggeration: number;
  resolution: 'low' | 'medium' | 'high';
  dataSource: 'mapbox' | 'mapzen' | 'custom';
}

interface BuildingOptions {
  enabled: boolean;
  lod: 'low' | 'medium' | 'high';
  showRoofs: boolean;
  colorMode: 'uniform' | 'height' | 'satellite';
  dataSource: 'osm' | 'vworld';  // OSM (OpenStreetMap) or V-World (Korean National Spatial Data)
}

interface MeshOptions {
  hollow: boolean;
  thickness: number;
  baseHeight: number;
  maxSideLength: number;
}

interface ExportOptions {
  format: 'glb' | 'obj' | 'stl' | 'fbx';
  includeTextures: boolean;
  scale: number;
}

interface RenderingOptions {
  style: 'satellite' | 'architectural';  // satellite = current, architectural = maps3d.io style
  enableSSAO: boolean;
  enableShadows: boolean;
  shadowQuality: 'low' | 'medium' | 'high';
}

interface WorldConfig {
  id: string;
  name: string;
  area: WorldArea | null;
  terrain: TerrainOptions;
  buildings: BuildingOptions;
  mesh: MeshOptions;
  export: ExportOptions;
  rendering: RenderingOptions;
}

interface WorldObject {
  id: string;
  name: string;
  type: 'terrain' | 'building' | 'road' | 'vegetation' | 'water' | 'custom' | 'group' | 'mesh';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  locked: boolean;
  expanded?: boolean;  // For collapsible groups
  parentId?: string;   // For hierarchy
  children?: string[]; // Child object IDs
}

// Tool types for terrain editing (Unity/Unreal style)
type TerrainTool = 'select' | 'raise' | 'lower' | 'smooth' | 'flatten' | 'paint' | 'foliage' | 'erode';
type EditorTool = 'select' | 'move' | 'rotate' | 'scale' | 'place' | 'terrain' | 'road';

// Road drawing mode (Cities: Skylines style)
type RoadMode = 'straight' | 'curved' | 'freeform';

// Road drawing state (Cities: Skylines style)
interface RoadDrawingState {
  isDrawing: boolean;
  mode: RoadMode;
  // For straight: start -> end
  // For curved: start -> control -> end (quadratic bezier)
  startPoint: { x: number; y: number; z: number } | null;
  controlPoint: { x: number; y: number; z: number } | null;
  endPoint: { x: number; y: number; z: number } | null;
  // Legacy waypoints for freeform mode
  waypoints: { x: number; y: number; z: number }[];
  previewMesh: Mesh | null;
  waypointMarkers: Mesh[];
  guideLines: Mesh[];
  directionArrows: Mesh[];
  width: number;
}

const WorldEditorPage: React.FC = () => {
  const navigate = useNavigate();

  // Current step in the workflow (1: Area Select, 2: 3D Edit, 3: Export)
  // Start at step 2 (3D Edit) - step 1 is for map import mode
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(2);

  // Map import modal state
  const [mapImportOpen, setMapImportOpen] = useState(false);

  // World configuration
  const [worldConfig, setWorldConfig] = useState<WorldConfig>({
    id: `world_${Date.now()}`,
    name: 'New World',
    area: null,
    terrain: {
      enabled: true,
      verticalExaggeration: 1.0,
      resolution: 'medium',
      dataSource: 'mapzen',
    },
    buildings: {
      enabled: true,
      lod: 'medium',
      showRoofs: true,
      colorMode: 'height',
      dataSource: 'vworld',  // Use V-World by default for Korean buildings
    },
    mesh: {
      hollow: false,
      thickness: 2.0,
      baseHeight: 5.0,
      maxSideLength: 200,
    },
    export: {
      format: 'glb',
      includeTextures: true,
      scale: 1.0,
    },
    rendering: {
      style: 'architectural',  // Default to maps3d.io style
      enableSSAO: true,
      enableShadows: true,
      shadowQuality: 'high',
    },
  });

  // Editor state
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [terrainTool, setTerrainTool] = useState<TerrainTool>('raise');
  const [worldObjects, setWorldObjects] = useState<WorldObject[]>([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null); // For shift+click range select

  // UI state
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'hierarchy' | 'properties' | 'layers'>('hierarchy');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);

  // Road drawing state (Cities: Skylines style)
  const [roadMode, setRoadMode] = useState<RoadMode>('straight');
  const [roadDrawing, setRoadDrawing] = useState<RoadDrawingState>({
    isDrawing: false,
    mode: 'straight',
    startPoint: null,
    controlPoint: null,
    endPoint: null,
    waypoints: [],
    previewMesh: null,
    waypointMarkers: [],
    guideLines: [],
    directionArrows: [],
    width: 6,
  });
  const [roadWidth, setRoadWidth] = useState(6);
  const roadMeshesRef = useRef<Mesh[]>([]);
  const roadDraggingRef = useRef<{
    isDragging: boolean;
    startPoint: { x: number; y: number; z: number } | null;
    endPoint: { x: number; y: number; z: number } | null;
    startMarker: Mesh | null;
    previewMesh: Mesh | null;
    guideLines: Mesh[];
    directionArrows: Mesh[];
  }>({ isDragging: false, startPoint: null, endPoint: null, startMarker: null, previewMesh: null, guideLines: [], directionArrows: [] });

  // Sun settings state (for lighting)
  const [sunPanelOpen, setSunPanelOpen] = useState(false);
  const [sunSettings, setSunSettings] = useState({
    month: 6, // 1-12월
    hour: 14, // 0-24시
    intensity: 1.5, // 강도
    azimuth: 180, // 방위각 0-360도
  });

  // 월/시간 기반으로 태양 고도(altitude) 계산 (서울 위도 37.5° 기준)
  const calculateSunAltitude = useCallback((month: number, hour: number): number => {
    // 태양 적위 (declination) - 월에 따라 변화
    const dayOfYear = (month - 1) * 30 + 15; // 월 중순 기준
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));

    // 서울 위도
    const latitude = 37.5;

    // 시간각 (hour angle) - 정오(12시)가 0도
    const hourAngle = (hour - 12) * 15; // 1시간 = 15도

    // 태양 고도 계산
    const latRad = latitude * (Math.PI / 180);
    const decRad = declination * (Math.PI / 180);
    const haRad = hourAngle * (Math.PI / 180);

    const sinAltitude = Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

    const altitude = Math.asin(sinAltitude) * (180 / Math.PI);

    // 0-90도 범위로 제한 (음수는 해가 진 상태)
    return Math.max(0, Math.min(90, altitude));
  }, []);

  // Theme state (from localStorage)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('themeMode') as 'light' | 'dark' | null;
    return saved || 'light';
  });
  const [themeColor, setThemeColor] = useState<string>(() => {
    const saved = localStorage.getItem('themeColor');
    return saved || '#10b981';
  });

  // Apply theme on mount and when changed
  useEffect(() => {
    if (!sceneReady) return;
    document.documentElement.setAttribute('data-theme', themeMode);
    document.documentElement.style.setProperty('--theme-color', themeColor);
    document.documentElement.style.setProperty('--theme-color-light', `${themeColor}0d`);
    // Save to localStorage
    localStorage.setItem('themeMode', themeMode);
    localStorage.setItem('themeColor', themeColor);
  }, [themeMode, themeColor]);

  // Close theme settings panel when clicking outside
  useEffect(() => {
    if (!sceneReady) return;
    if (!themeSettingsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.themeSettingsPanel}`)) {
        setThemeSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeSettingsOpen]);

  // Update DirectionalLight, SkyMaterial, and SunDisk when sun settings change
  useEffect(() => {
    const dirLight = dirLightRef.current;
    const skyMat = skyMaterialRef.current;
    const sunDisk = sunDiskRef.current;

    // Skip if refs not ready
    if (!dirLight && !skyMat && !sunDisk) return;

    // Calculate sun altitude from month and hour
    const altitude = calculateSunAltitude(sunSettings.month, sunSettings.hour);
    const altitudeRad = altitude * (Math.PI / 180);
    const azimuthRad = sunSettings.azimuth * (Math.PI / 180);

    // Calculate light direction vector (pointing FROM the sun TO the scene)
    const x = -Math.sin(azimuthRad) * Math.cos(altitudeRad);
    const y = -Math.sin(altitudeRad);
    const z = -Math.cos(azimuthRad) * Math.cos(altitudeRad);

    // Update DirectionalLight
    if (dirLight) {
      dirLight.direction = new Vector3(x, y, z);
      dirLight.intensity = sunSettings.intensity;

      // Update light position for shadow casting
      const distance = 100;
      dirLight.position = new Vector3(
        -x * distance,
        -y * distance,
        -z * distance
      );
    }

    // Update SkyMaterial sun position
    if (skyMat) {
      skyMat.sunPosition = new Vector3(
        Math.cos(altitudeRad) * Math.sin(azimuthRad) * 1000,
        Math.sin(altitudeRad) * 1000,
        Math.cos(altitudeRad) * Math.cos(azimuthRad) * 1000
      );
    }

    // Update visible sun disk position
    if (sunDisk) {
      const sunDistance = 400;
      sunDisk.position = new Vector3(
        sunDistance * Math.cos(altitudeRad) * Math.sin(azimuthRad),
        sunDistance * Math.sin(altitudeRad),
        sunDistance * Math.cos(altitudeRad) * Math.cos(azimuthRad)
      );
    }

    console.log(`[Sun] Updated - Month: ${sunSettings.month}, Hour: ${sunSettings.hour}, Altitude: ${altitude.toFixed(1)}°, Azimuth: ${sunSettings.azimuth}°, Intensity: ${sunSettings.intensity}`);
  }, [sunSettings, calculateSunAltitude]);

  // Canvas refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const canvas3DRef = useRef<HTMLCanvasElement>(null);

  // Babylon.js refs
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const arcCameraRef = useRef<ArcRotateCamera | null>(null);
  const thirdPersonCameraRef = useRef<ArcRotateCamera | null>(null);
  const shadowGeneratorRef = useRef<ShadowGenerator | null>(null);
  const dirLightRef = useRef<DirectionalLight | null>(null);
  const skyMaterialRef = useRef<SkyMaterial | null>(null);
  const sunDiskRef = useRef<Mesh | null>(null);
  const gizmoManagerRef = useRef<GizmoManager | null>(null);
  const selectedMeshRef = useRef<AbstractMesh | null>(null);
  const selectedMeshesRef = useRef<Set<AbstractMesh>>(new Set()); // Multi-selection
  const highlightLayerRef = useRef<HighlightLayer | null>(null);

  // Marquee selection state
  const marqueeRef = useRef<{ startX: number; startY: number; active: boolean; ctrlKey: boolean }>({
    startX: 0, startY: 0, active: false, ctrlKey: false
  });
  const marqueeElementRef = useRef<HTMLDivElement | null>(null);
  const loadedAssetsRef = useRef<Map<string, AbstractMesh>>(new Map());
  const [sceneReady, setSceneReady] = useState(false);

  // Play mode state
  const [playMode, setPlayMode] = useState(false);
  const playModeRef = useRef(false);
  const [viewMode, setViewMode] = useState<'third-person' | 'first-person' | 'iso'>('third-person');
  const viewModeRef = useRef<'third-person' | 'first-person' | 'iso'>('third-person');

  // Spawn point state (character start position)
  const [spawnPoint, setSpawnPoint] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [isSettingSpawnPoint, setIsSettingSpawnPoint] = useState(false);
  const isSettingSpawnPointRef = useRef(false);
  const spawnMarkerRef = useRef<Mesh | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Character refs
  const characterRef = useRef<AbstractMesh | null>(null);
  const characterRootRef = useRef<AbstractMesh | null>(null);
  const idleAnimationRef = useRef<AnimationGroup | null>(null);
  const walkAnimationRef = useRef<AnimationGroup | null>(null);
  const runAnimationRef = useRef<AnimationGroup | null>(null);
  const characterGroundOffsetRef = useRef<number>(0);
  const fpsCameraRef = useRef<UniversalCamera | null>(null);
  const isoCameraRef = useRef<ArcRotateCamera | null>(null);

  // Emote animation refs (1,2,3,4 keys)
  const emote1Ref = useRef<AnimationGroup | null>(null); // greeting
  const emote2Ref = useRef<AnimationGroup | null>(null); // dance1
  const emote3Ref = useRef<AnimationGroup | null>(null); // dance2
  const emote4Ref = useRef<AnimationGroup | null>(null); // greeting
  const runningJumpAnimRef = useRef<AnimationGroup | null>(null); // running jump
  const jumpAnimRef = useRef<AnimationGroup | null>(null); // standing jump
  const isEmotingRef = useRef<boolean>(false);

  // Movement state - Game-style physics like Studio
  const keysPressed = useRef<Set<string>>(new Set());
  const currentAnimRef = useRef<string>('idle');
  const characterVelocityRef = useRef<Vector3>(Vector3.Zero());
  const verticalVelocityRef = useRef<number>(0);
  const isGroundedRef = useRef<boolean>(true);
  const isRunningRef = useRef<boolean>(false);

  // Character physics config - frame-based like Babylon3DCanvas
  const CHARACTER_CONFIG = {
    walkSpeed: 0.08,    // Per frame speed (like Babylon3DCanvas)
    runSpeed: 0.16,     // Per frame speed
    rotationSpeed: 0.15, // Rotation lerp factor
    jumpForce: 0.12,    // Initial jump velocity
    gravity: 0.008,     // Gravity per frame
  };

  // Helper function to convert hex to Color3
  const hexToColor3 = (hex: string): Color3 => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return new Color3(
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      );
    }
    return new Color3(0.063, 0.725, 0.506); // Default #10b981
  };

  // Initialize Babylon.js 3D scene with infinite grid
  useEffect(() => {
    if (!canvas3DRef.current || currentStep !== 2) return;

    // Create engine
    const engine = new Engine(canvas3DRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    // Create scene
    const scene = new Scene(engine);
    sceneRef.current = scene;
    // Expose scene and BABYLON globally for debugging
    (window as unknown as { __scene: Scene }).__scene = scene;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).BABYLON = { MeshBuilder, Vector3, StandardMaterial, Color3, Mesh };

    // Set clear color (sky gradient) - warm sunset colors
    scene.clearColor = new Color4(0.85, 0.75, 0.65, 1.0);

    // Create HDR environment texture for realistic lighting and reflections
    const hdrTexture = CubeTexture.CreateFromPrefilteredData(
      'https://assets.babylonjs.com/environments/studio.env',
      scene
    );
    scene.environmentTexture = hdrTexture;
    scene.environmentTexture.level = 1.2; // Boost brightness
    scene.environmentIntensity = 1.5; // Boost environment reflections

    // Create skybox with realistic sky material (same as Babylon3DCanvas)
    const skybox = MeshBuilder.CreateBox('skybox', { size: 5000 }, scene);
    const skyMat = new SkyMaterial('skyMaterial', scene);
    skyMat.backFaceCulling = false;

    // Nice clear blue sky settings
    skyMat.turbidity = 2; // Clear atmosphere
    skyMat.luminance = 1; // Normal brightness
    skyMat.rayleigh = 1; // Nice blue color
    skyMat.mieCoefficient = 0.005; // Minimal haze
    skyMat.mieDirectionalG = 0.8; // Sun glow
    skyMat.useSunPosition = true;

    // Initial sun position from sunSettings state
    const initAltitude = calculateSunAltitude(sunSettings.month, sunSettings.hour);
    const initAltitudeRad = initAltitude * (Math.PI / 180);
    const initAzimuthRad = sunSettings.azimuth * (Math.PI / 180);
    skyMat.sunPosition = new Vector3(
      Math.cos(initAltitudeRad) * Math.sin(initAzimuthRad) * 1000,
      Math.sin(initAltitudeRad) * 1000,
      Math.cos(initAltitudeRad) * Math.cos(initAzimuthRad) * 1000
    );

    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    skybox.renderingGroupId = 0;
    skybox.isPickable = false;

    // Store ref for sun settings updates
    skyMaterialRef.current = skyMat;

    // Create visible sun disk (same as Babylon3DCanvas)
    const sunDistance = 400;
    const sunX = sunDistance * Math.cos(initAltitudeRad) * Math.sin(initAzimuthRad);
    const sunY = sunDistance * Math.sin(initAltitudeRad);
    const sunZ = sunDistance * Math.cos(initAltitudeRad) * Math.cos(initAzimuthRad);

    const sunDisk = MeshBuilder.CreateSphere('sunDisk', { diameter: 30 }, scene);
    sunDisk.position = new Vector3(sunX, sunY, sunZ);

    const sunMaterial = new StandardMaterial('sunMaterial', scene);
    sunMaterial.emissiveColor = new Color3(1, 0.95, 0.8); // Warm yellow-white
    sunMaterial.diffuseColor = new Color3(0, 0, 0);
    sunMaterial.specularColor = new Color3(0, 0, 0);
    sunMaterial.disableLighting = true;

    sunDisk.material = sunMaterial;
    sunDisk.isPickable = false;
    sunDisk.renderingGroupId = 0;
    sunDiskRef.current = sunDisk;

    // Create camera (ArcRotateCamera for orbit control)
    const arcCamera = new ArcRotateCamera(
      'worldCamera',
      -Math.PI / 2,  // alpha (horizontal rotation)
      Math.PI / 4,   // beta (vertical angle) - 45 degrees for horizon visibility
      80,            // radius (distance)
      new Vector3(0, 0, 0), // target
      scene
    );
    arcCamera.attachControl(canvas3DRef.current, true);
    arcCamera.lowerRadiusLimit = 10;
    arcCamera.upperRadiusLimit = 5000; // 10x zoom out for large world view
    arcCamera.lowerBetaLimit = 0.1; // Prevent looking from below
    arcCamera.upperBetaLimit = Math.PI / 2 - 0.1; // Prevent looking straight down
    arcCamera.wheelDeltaPercentage = 0.01;
    arcCamera.panningSensibility = 50;
    arcCamera.minZ = 1; // Near clipping plane
    arcCamera.maxZ = 10000; // Far clipping plane for large world view
    arcCameraRef.current = arcCamera;

    // Create 3rd person ArcRotateCamera (for play mode - FPS-style mouse rotation)
    const thirdPersonCamera = new ArcRotateCamera(
      'thirdPersonCamera',
      -Math.PI / 2, // Start behind character (-90 degrees)
      1.0,          // ~57 degrees from vertical (higher angle to see feet)
      8,            // Distance from character
      new Vector3(0, 0.8, 0), // Target at character hip height
      scene
    );
    thirdPersonCamera.lowerRadiusLimit = 3;
    thirdPersonCamera.upperRadiusLimit = 15;
    thirdPersonCamera.lowerBetaLimit = 0.1;  // Almost ground level
    thirdPersonCamera.upperBetaLimit = Math.PI - 0.1; // Allow looking from below (180 degrees)
    thirdPersonCamera.wheelDeltaPercentage = 0.02;
    thirdPersonCamera.angularSensibilityX = 500;  // Mouse sensitivity
    thirdPersonCamera.angularSensibilityY = 500;
    thirdPersonCamera.panningSensibility = 0;  // Disable panning
    thirdPersonCameraRef.current = thirdPersonCamera;

    // Create 1st person (FPS) camera (for play mode)
    const fpsCamera = new UniversalCamera(
      'fpsCamera',
      new Vector3(0, 1.7, 0), // Eye height ~1.7m
      scene
    );
    fpsCamera.speed = 0.5;
    fpsCamera.angularSensibility = 1000;
    fpsCamera.inertia = 0.5;
    fpsCamera.minZ = 0.1;
    fpsCameraRef.current = fpsCamera;

    // Create ISO camera (for play mode)
    const isoCamera = new ArcRotateCamera(
      'isoCamera',
      -Math.PI / 4,     // 45 degree horizontal angle
      Math.PI / 4,      // 45 degree vertical angle (isometric)
      30,               // Distance
      new Vector3(0, 0, 0),
      scene
    );
    isoCamera.lowerRadiusLimit = 15;
    isoCamera.upperRadiusLimit = 2000; // 20x zoom out for large world view in ISO mode
    isoCamera.lowerBetaLimit = Math.PI / 6;  // Prevent looking from below
    isoCamera.upperBetaLimit = Math.PI / 2.5; // Prevent looking straight down
    isoCamera.minZ = 1; // Near clipping plane
    isoCamera.maxZ = 5000; // Far clipping plane for large world view
    isoCameraRef.current = isoCamera;

    // Create lights
    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene);
    hemiLight.intensity = 0.6;

    // Calculate initial sun direction from settings
    const initialAltitude = calculateSunAltitude(sunSettings.month, sunSettings.hour);
    const initialAltitudeRad = initialAltitude * (Math.PI / 180);
    const initialAzimuthRad = sunSettings.azimuth * (Math.PI / 180);
    const initialX = -Math.sin(initialAzimuthRad) * Math.cos(initialAltitudeRad);
    const initialY = -Math.sin(initialAltitudeRad);
    const initialZ = -Math.cos(initialAzimuthRad) * Math.cos(initialAltitudeRad);

    const dirLight = new DirectionalLight('dirLight', new Vector3(initialX, initialY, initialZ), scene);
    dirLight.intensity = sunSettings.intensity;
    const lightDistance = 100;
    dirLight.position = new Vector3(-initialX * lightDistance, -initialY * lightDistance, -initialZ * lightDistance);
    dirLightRef.current = dirLight;

    // Create shadow generator
    const shadowGenerator = new ShadowGenerator(2048, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
    shadowGeneratorRef.current = shadowGenerator;

    // Create infinite grid ground
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
    gridMaterial.mainColor = new Color3(1, 1, 1); // White base (will be transparent)
    gridMaterial.lineColor = themeColorObj;
    gridMaterial.opacity = 0.98; // Grid lines visible but background transparent

    ground.material = gridMaterial;
    ground.position.y = 0;
    ground.receiveShadows = true;

    // Create axis indicator (XYZ lines)
    const axisLength = 5;

    // X axis (red line)
    const xAxisPoints = [Vector3.Zero(), new Vector3(axisLength, 0, 0)];
    const xAxis = MeshBuilder.CreateLines('xAxis', { points: xAxisPoints }, scene);
    xAxis.color = new Color3(1, 0.3, 0.3);

    // Y axis (blue line)
    const yAxisPoints = [Vector3.Zero(), new Vector3(0, axisLength, 0)];
    const yAxis = MeshBuilder.CreateLines('yAxis', { points: yAxisPoints }, scene);
    yAxis.color = new Color3(0.3, 0.3, 1);

    // Z axis (green line)
    const zAxisPoints = [Vector3.Zero(), new Vector3(0, 0, axisLength)];
    const zAxis = MeshBuilder.CreateLines('zAxis', { points: zAxisPoints }, scene);
    zAxis.color = new Color3(0.3, 1, 0.3);

    // Setup HighlightLayer for selection outline
    const highlightLayer = new HighlightLayer('selectionHighlight', scene);
    highlightLayer.outerGlow = true;
    highlightLayer.innerGlow = false;
    highlightLayerRef.current = highlightLayer;

    // Setup GizmoManager for object manipulation (Unity/Blender style)
    const gizmoManager = new GizmoManager(scene);
    gizmoManager.usePointerToAttachGizmos = false; // Manual attachment

    // Make gizmos MUCH larger and more visible (Unity/Blender style)
    const GIZMO_SCALE = 3.0; // Big visible gizmos

    // Enable Position Gizmo (arrows) - X:Red, Y:Green, Z:Blue
    gizmoManager.positionGizmoEnabled = true;
    if (gizmoManager.gizmos.positionGizmo) {
      gizmoManager.gizmos.positionGizmo.scaleRatio = GIZMO_SCALE;
      gizmoManager.gizmos.positionGizmo.xGizmo.dragBehavior.moveAttached = true;
      gizmoManager.gizmos.positionGizmo.yGizmo.dragBehavior.moveAttached = true;
      gizmoManager.gizmos.positionGizmo.zGizmo.dragBehavior.moveAttached = true;
    }

    // Enable Rotation Gizmo (rings)
    gizmoManager.rotationGizmoEnabled = true;
    if (gizmoManager.gizmos.rotationGizmo) {
      gizmoManager.gizmos.rotationGizmo.scaleRatio = GIZMO_SCALE;
    }

    // Enable Scale Gizmo (cubes) with uniform scaling (center drag)
    gizmoManager.scaleGizmoEnabled = true;
    if (gizmoManager.gizmos.scaleGizmo) {
      gizmoManager.gizmos.scaleGizmo.scaleRatio = GIZMO_SCALE;
      gizmoManager.gizmos.scaleGizmo.uniformScaleGizmo.scaleRatio = GIZMO_SCALE;
      gizmoManager.gizmos.scaleGizmo.sensitivity = 3; // More responsive scaling
    }

    // DISABLE BoundingBox Gizmo - no ugly corner dots!
    gizmoManager.boundingBoxGizmoEnabled = false;

    // Now disable all - will be enabled based on active tool
    gizmoManager.positionGizmoEnabled = false;
    gizmoManager.rotationGizmoEnabled = false;
    gizmoManager.scaleGizmoEnabled = false;

    // Default to position gizmo (move tool)
    gizmoManager.positionGizmoEnabled = true;

    gizmoManagerRef.current = gizmoManager;

    // ===== 다중 선택 시 모든 객체 동시 이동/회전/스케일 =====
    // 드래그 시작 시 주 메시의 위치/회전/스케일 저장
    let lastPosition = Vector3.Zero();
    let lastRotation = Vector3.Zero();
    let lastScaling = Vector3.One();

    // Position Gizmo
    if (gizmoManager.gizmos.positionGizmo) {
      const posGizmo = gizmoManager.gizmos.positionGizmo;

      const setupPositionDrag = (gizmo: any) => {
        gizmo.dragBehavior.onDragStartObservable.add(() => {
          const mesh = gizmoManager.attachedMesh;
          if (mesh) lastPosition = mesh.position.clone();
        });

        gizmo.dragBehavior.onDragObservable.add(() => {
          const attachedMesh = gizmoManager.attachedMesh;
          if (!attachedMesh || selectedMeshesRef.current.size <= 1) return;

          const delta = attachedMesh.position.subtract(lastPosition);
          selectedMeshesRef.current.forEach(mesh => {
            if (mesh !== attachedMesh) {
              // Skip if parent is also selected (parent movement already moves this mesh)
              let parentInSelection = false;
              let parent = mesh.parent;
              while (parent) {
                if (selectedMeshesRef.current.has(parent as AbstractMesh)) {
                  parentInSelection = true;
                  break;
                }
                parent = parent.parent;
              }
              if (!parentInSelection) {
                mesh.position.addInPlace(delta);
              }
            }
          });
          lastPosition = attachedMesh.position.clone();
        });
      };

      setupPositionDrag(posGizmo.xGizmo);
      setupPositionDrag(posGizmo.yGizmo);
      setupPositionDrag(posGizmo.zGizmo);
    }

    // Rotation Gizmo
    if (gizmoManager.gizmos.rotationGizmo) {
      const rotGizmo = gizmoManager.gizmos.rotationGizmo;

      const setupRotationDrag = (gizmo: any) => {
        gizmo.dragBehavior.onDragStartObservable.add(() => {
          const mesh = gizmoManager.attachedMesh;
          if (mesh) lastRotation = mesh.rotation.clone();
        });

        gizmo.dragBehavior.onDragObservable.add(() => {
          const attachedMesh = gizmoManager.attachedMesh;
          if (!attachedMesh || selectedMeshesRef.current.size <= 1) return;

          const delta = attachedMesh.rotation.subtract(lastRotation);
          selectedMeshesRef.current.forEach(mesh => {
            if (mesh !== attachedMesh) {
              // Skip if parent is also selected
              let parentInSelection = false;
              let parent = mesh.parent;
              while (parent) {
                if (selectedMeshesRef.current.has(parent as AbstractMesh)) {
                  parentInSelection = true;
                  break;
                }
                parent = parent.parent;
              }
              if (!parentInSelection) {
                mesh.rotation.addInPlace(delta);
              }
            }
          });
          lastRotation = attachedMesh.rotation.clone();
        });
      };

      setupRotationDrag(rotGizmo.xGizmo);
      setupRotationDrag(rotGizmo.yGizmo);
      setupRotationDrag(rotGizmo.zGizmo);
    }

    // Scale Gizmo
    if (gizmoManager.gizmos.scaleGizmo) {
      const scaleGizmo = gizmoManager.gizmos.scaleGizmo;

      const setupScaleDrag = (gizmo: any) => {
        gizmo.dragBehavior.onDragStartObservable.add(() => {
          const mesh = gizmoManager.attachedMesh;
          if (mesh) lastScaling = mesh.scaling.clone();
        });

        gizmo.dragBehavior.onDragObservable.add(() => {
          const attachedMesh = gizmoManager.attachedMesh;
          if (!attachedMesh || selectedMeshesRef.current.size <= 1) return;

          // 스케일 비율 계산
          const ratio = new Vector3(
            lastScaling.x !== 0 ? attachedMesh.scaling.x / lastScaling.x : 1,
            lastScaling.y !== 0 ? attachedMesh.scaling.y / lastScaling.y : 1,
            lastScaling.z !== 0 ? attachedMesh.scaling.z / lastScaling.z : 1
          );
          selectedMeshesRef.current.forEach(mesh => {
            if (mesh !== attachedMesh) {
              // Skip if parent is also selected
              let parentInSelection = false;
              let parent = mesh.parent;
              while (parent) {
                if (selectedMeshesRef.current.has(parent as AbstractMesh)) {
                  parentInSelection = true;
                  break;
                }
                parent = parent.parent;
              }
              if (!parentInSelection) {
                mesh.scaling.x *= ratio.x;
                mesh.scaling.y *= ratio.y;
                mesh.scaling.z *= ratio.z;
              }
            }
          });
          lastScaling = attachedMesh.scaling.clone();
        });
      };

      setupScaleDrag(scaleGizmo.xGizmo);
      setupScaleDrag(scaleGizmo.yGizmo);
      setupScaleDrag(scaleGizmo.zGizmo);
      setupScaleDrag(scaleGizmo.uniformScaleGizmo);
    }

    // List of non-selectable mesh names
    const nonSelectableMeshes = ['ground', 'skybox', 'xAxis', 'yAxis', 'zAxis', 'infiniteGrid', 'sunDisk'];

    // Get highlight color
    const getHighlightColor = () => {
      const themeColorHex = themeColor || '#10b981';
      const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
      const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
      const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;
      return new Color3(r, g, b);
    };

    // Helper function to clear all selections
    const clearAllSelections = () => {
      // Clear single selection
      if (selectedMeshRef.current) {
        highlightLayer.removeMesh(selectedMeshRef.current as Mesh);
      }
      selectedMeshRef.current = null;

      // Clear multi-selection
      selectedMeshesRef.current.forEach(mesh => {
        highlightLayer.removeMesh(mesh as Mesh);
      });
      selectedMeshesRef.current.clear();

      gizmoManager.attachToMesh(null);
    };

    // Helper function to select a single mesh
    const selectMesh = (mesh: AbstractMesh | null) => {
      // Clear all previous selections
      clearAllSelections();

      if (mesh) {
        selectedMeshRef.current = mesh;
        selectedMeshesRef.current.add(mesh);
        gizmoManager.attachToMesh(mesh);
        highlightLayer.addMesh(mesh as Mesh, getHighlightColor());
        console.log('[WorldEditor] Selected:', mesh.name);
      } else {
        console.log('[WorldEditor] Deselected');
      }
    };

    // Helper function to add mesh to multi-selection
    const addToSelection = (mesh: AbstractMesh) => {
      if (!selectedMeshesRef.current.has(mesh)) {
        selectedMeshesRef.current.add(mesh);
        highlightLayer.addMesh(mesh as Mesh, getHighlightColor());

        // Update primary selection for gizmo
        if (!selectedMeshRef.current) {
          selectedMeshRef.current = mesh;
          gizmoManager.attachToMesh(mesh);
        }
      }
    };

    // Helper function to select multiple meshes at once
    const selectMultipleMeshes = (meshes: AbstractMesh[]) => {
      clearAllSelections();

      meshes.forEach((mesh, index) => {
        selectedMeshesRef.current.add(mesh);
        highlightLayer.addMesh(mesh as Mesh, getHighlightColor());

        // First mesh gets the gizmo
        if (index === 0) {
          selectedMeshRef.current = mesh;
          gizmoManager.attachToMesh(mesh);
        }
      });

      console.log('[WorldEditor] Multi-selected:', meshes.length, 'objects');
    };

    // Click to select mesh (disabled in play mode)
    scene.onPointerObservable.add((pointerInfo) => {
      // Skip selection in play mode (use ref for current value)
      if (playModeRef.current) return;

      if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
        // Spawn point setting mode (use ref to get current value)
        if (isSettingSpawnPointRef.current && pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedPoint) {
          const point = pointerInfo.pickInfo.pickedPoint;
          setSpawnPoint({ x: point.x, y: 0, z: point.z });
          if (spawnMarkerRef.current) {
            spawnMarkerRef.current.position.x = point.x;
            spawnMarkerRef.current.position.z = point.z;
          }
          setIsSettingSpawnPoint(false);
          console.log('[WorldEditor] Spawn point set to:', point.x, point.z);
          return;
        }

        // 허공 클릭 시 선택 해제
        if (!pointerInfo.pickInfo?.hit) {
          // Deselect all
          if (highlightLayerRef.current && selectedMeshRef.current) {
            highlightLayerRef.current.removeMesh(selectedMeshRef.current as Mesh);
          }
          selectedMeshRef.current = null;
          gizmoManagerRef.current?.attachToMesh(null);
          setSelectedObjectIds(new Set());
          return;
        }

        const pickedMesh = pointerInfo.pickInfo.pickedMesh;

        if (pickedMesh) {
          // Check if mesh is selectable (not in excluded list)
          const meshName = pickedMesh.name.toLowerCase();
          const isExcluded = nonSelectableMeshes.some(name => meshName.includes(name.toLowerCase()));

          if (!isExcluded && pickedMesh.isPickable) {
            // Find root mesh (for multi-part models)
            let rootMesh: AbstractMesh = pickedMesh;
            while (rootMesh.parent && rootMesh.parent instanceof AbstractMesh && rootMesh.parent.name !== '__root__') {
              const parentName = rootMesh.parent.name.toLowerCase();
              if (!nonSelectableMeshes.some(name => parentName.includes(name.toLowerCase()))) {
                rootMesh = rootMesh.parent;
              } else {
                break;
              }
            }

            // 이미 선택된 객체를 클릭하면 기즈모만 이동 (전체선택 유지)
            if (selectedMeshesRef.current.has(rootMesh)) {
              selectedMeshRef.current = rootMesh;
              gizmoManager.attachToMesh(rootMesh);
            } else {
              // 새 객체 클릭 시 단일 선택
              selectMesh(rootMesh);
            }
          }
          // 그리드/ground 클릭 시에는 선택 유지 (해제하지 않음)
        }
      }
    });

    // ===== Command(Mac)/Alt + Drag Marquee Selection =====
    const canvasElement = canvas3DRef.current;

    // Helper to check if mesh center is within 2D screen rectangle
    const isMeshInScreenRect = (mesh: AbstractMesh, x1: number, y1: number, x2: number, y2: number): boolean => {
      const boundingInfo = mesh.getBoundingInfo();
      if (!boundingInfo) return false;

      const center = boundingInfo.boundingBox.centerWorld;
      const viewport = arcCamera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
      const screenPos = Vector3.Project(center, Matrix.Identity(), scene.getTransformMatrix(), viewport);

      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);


      return screenPos.x >= minX && screenPos.x <= maxX && screenPos.y >= minY && screenPos.y <= maxY;
    };

    // Get all selectable meshes
    const getSelectableMeshes = (): AbstractMesh[] => {
      return scene.meshes.filter(mesh => {
        const name = mesh.name.toLowerCase();
        const isExcluded = nonSelectableMeshes.some(n => name.includes(n.toLowerCase()));
        if (isExcluded) return false;
        if (!mesh.isPickable) return false;
        if (name.includes('ch02') || name.includes('armature') || name.includes('character')) return false;
        if (name === '__root__') return false;
        return true;
      });
    };

    const handleMarqueeStart = (e: PointerEvent) => {
      // Skip marquee selection in play mode
      if (playModeRef.current) return;

      // Check if click is on canvas
      const rect = canvasElement.getBoundingClientRect();
      const isOnCanvas = e.clientX >= rect.left && e.clientX <= rect.right &&
                         e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (!isOnCanvas) return;

      // Command (Mac) or Alt key + drag for marquee selection
      if (e.metaKey || e.altKey) {
        marqueeRef.current = {
          startX: e.clientX - rect.left,
          startY: e.clientY - rect.top,
          active: true,
          ctrlKey: true
        };

        // Create marquee element
        if (!marqueeElementRef.current) {
          const div = document.createElement('div');
          div.style.cssText = `
            position: fixed;
            border: 2px dashed ${themeColor || '#10b981'};
            background: ${themeColor || '#10b981'}20;
            pointer-events: none;
            z-index: 9999;
          `;
          document.body.appendChild(div);
          marqueeElementRef.current = div;
        }

        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMarqueeMove = (e: PointerEvent) => {
      if (!marqueeRef.current.active || !marqueeElementRef.current) return;

      const rect = canvasElement.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      const x1 = Math.min(marqueeRef.current.startX, currentX) + rect.left;
      const y1 = Math.min(marqueeRef.current.startY, currentY) + rect.top;
      const width = Math.abs(currentX - marqueeRef.current.startX);
      const height = Math.abs(currentY - marqueeRef.current.startY);

      marqueeElementRef.current.style.left = `${x1}px`;
      marqueeElementRef.current.style.top = `${y1}px`;
      marqueeElementRef.current.style.width = `${width}px`;
      marqueeElementRef.current.style.height = `${height}px`;
    };

    const handleMarqueeEnd = (e: PointerEvent) => {
      if (!marqueeRef.current.active) return;

      const rect = canvasElement.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      // Find meshes within marquee bounds
      const selectableMeshes = getSelectableMeshes();
      const selectedInMarquee: AbstractMesh[] = [];

      for (const mesh of selectableMeshes) {
        try {
          const inRect = isMeshInScreenRect(mesh, marqueeRef.current.startX, marqueeRef.current.startY, endX, endY);
          if (inRect) {
            // Find root mesh
            let rootMesh: AbstractMesh = mesh;
            while (rootMesh.parent && rootMesh.parent instanceof AbstractMesh && rootMesh.parent.name !== '__root__') {
              const parentName = rootMesh.parent.name.toLowerCase();
              if (!nonSelectableMeshes.some(n => parentName.includes(n.toLowerCase()))) {
                rootMesh = rootMesh.parent;
              } else break;
            }
            if (!selectedInMarquee.includes(rootMesh)) {
              selectedInMarquee.push(rootMesh);
            }
          }
        } catch (err) {
          console.error('[Marquee] Error checking mesh:', mesh.name, err);
        }
      }

      if (selectedInMarquee.length > 0) {
        selectMultipleMeshes(selectedInMarquee);
      }

      // Cleanup marquee
      marqueeRef.current.active = false;
      if (marqueeElementRef.current) {
        marqueeElementRef.current.remove();
        marqueeElementRef.current = null;
      }
    };

    // Use window-level listener with capture to intercept before Babylon.js
    window.addEventListener('pointerdown', handleMarqueeStart, true);
    window.addEventListener('pointermove', handleMarqueeMove, true);
    window.addEventListener('pointerup', handleMarqueeEnd, true);

    // Delete key to remove selected mesh(es)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Skip in play mode
      if (playModeRef.current) return;

      const key = e.key.toLowerCase();

      // Tool switching shortcuts (Q, W, E, R, S)
      if (key === 'q') setActiveTool('select');
      if (key === 'w') setActiveTool('move');
      if (key === 'e') setActiveTool('rotate');
      if (key === 'r' || key === 's') setActiveTool('scale');

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeshesRef.current.size > 0) {
        // Delete all selected meshes
        const meshesToDelete = Array.from(selectedMeshesRef.current);
        console.log('[WorldEditor] Deleting', meshesToDelete.length, 'meshes');
        clearAllSelections();
        meshesToDelete.forEach(mesh => mesh.dispose());
      }

      // Escape to deselect all
      if (e.key === 'Escape' && selectedMeshesRef.current.size > 0) {
        clearAllSelections();
        console.log('[WorldEditor] Deselected all');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Create spawn point marker (character start position indicator)
    const spawnMarker = MeshBuilder.CreateCylinder('spawnMarker', {
      height: 0.1,
      diameterTop: 1.5,
      diameterBottom: 1.5,
      tessellation: 32
    }, scene);
    spawnMarker.position = new Vector3(0, 0.05, 0);
    const spawnMarkerMat = new StandardMaterial('spawnMarkerMat', scene);
    spawnMarkerMat.diffuseColor = new Color3(0, 0.8, 1); // Cyan color
    spawnMarkerMat.emissiveColor = new Color3(0, 0.4, 0.5);
    spawnMarkerMat.alpha = 0.7;
    spawnMarker.material = spawnMarkerMat;
    spawnMarker.isPickable = false;
    spawnMarkerRef.current = spawnMarker;

    // Add arrow on spawn marker
    const spawnArrow = MeshBuilder.CreateCylinder('spawnArrow', {
      height: 1.5,
      diameterTop: 0,
      diameterBottom: 0.5,
      tessellation: 8
    }, scene);
    spawnArrow.position = new Vector3(0, 0.85, 0);
    spawnArrow.material = spawnMarkerMat;
    spawnArrow.parent = spawnMarker;
    spawnArrow.isPickable = false;

    // Render loop
    engine.runRenderLoop(() => {
      scene.render();
    });

    // Mark scene as ready for sun settings updates
    setSceneReady(true);

    // Handle resize
    const handleResize = () => {
      engine.resize();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      setSceneReady(false);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handleMarqueeStart, true);
      window.removeEventListener('pointermove', handleMarqueeMove, true);
      window.removeEventListener('pointerup', handleMarqueeEnd, true);
      if (marqueeElementRef.current) {
        marqueeElementRef.current.remove();
        marqueeElementRef.current = null;
      }
      engine.dispose();
      scene.dispose();
      engineRef.current = null;
      sceneRef.current = null;
    };
  }, [currentStep, themeMode, themeColor]);

  // Update GizmoManager mode based on activeTool
  useEffect(() => {
    const gizmoManager = gizmoManagerRef.current;
    if (!gizmoManager) return;

    const GIZMO_SCALE = 3.0; // Must match setup scale

    // Disable all gizmos first
    gizmoManager.positionGizmoEnabled = false;
    gizmoManager.rotationGizmoEnabled = false;
    gizmoManager.scaleGizmoEnabled = false;
    gizmoManager.boundingBoxGizmoEnabled = false;

    // Enable based on active tool and ensure scale is set
    switch (activeTool) {
      case 'move':
        gizmoManager.positionGizmoEnabled = true;
        if (gizmoManager.gizmos.positionGizmo) {
          gizmoManager.gizmos.positionGizmo.scaleRatio = GIZMO_SCALE;
        }
        break;
      case 'rotate':
        gizmoManager.rotationGizmoEnabled = true;
        if (gizmoManager.gizmos.rotationGizmo) {
          gizmoManager.gizmos.rotationGizmo.scaleRatio = GIZMO_SCALE;
        }
        break;
      case 'scale':
        gizmoManager.scaleGizmoEnabled = true;
        if (gizmoManager.gizmos.scaleGizmo) {
          gizmoManager.gizmos.scaleGizmo.scaleRatio = GIZMO_SCALE;
          gizmoManager.gizmos.scaleGizmo.uniformScaleGizmo.scaleRatio = GIZMO_SCALE;
          gizmoManager.gizmos.scaleGizmo.sensitivity = 3;
        }
        break;
      case 'select':
        // Show position gizmo (arrows) for select tool too - NOT bounding box
        gizmoManager.positionGizmoEnabled = true;
        if (gizmoManager.gizmos.positionGizmo) {
          gizmoManager.gizmos.positionGizmo.scaleRatio = GIZMO_SCALE;
        }
        break;
      default:
        // For other tools (terrain, road, place), disable gizmos
        gizmoManager.attachToMesh(null);
        selectedMeshRef.current = null;
        break;
    }

    console.log('[WorldEditor] Gizmo mode:', activeTool);

    // 선택된 메시가 있으면 기즈모 attach
    if (activeTool === 'move' || activeTool === 'rotate' || activeTool === 'scale' || activeTool === 'select') {
      // selectedMeshRef 또는 selectedObjectIds에서 메시 찾기
      let meshToAttach = selectedMeshRef.current;
      if (!meshToAttach && selectedObjectIds.size > 0) {
        const firstId = Array.from(selectedObjectIds)[0];
        meshToAttach = loadedAssetsRef.current.get(firstId) || null;
        if (meshToAttach) {
          selectedMeshRef.current = meshToAttach;
        }
      }
      if (meshToAttach) {
        gizmoManager.attachToMesh(meshToAttach);
      }
    }
  }, [activeTool, selectedObjectIds]);

  // Reference to current city meshes for cleanup
  const cityMeshesRef = useRef<CityMeshes | null>(null);
  const architecturalMeshesRef = useRef<ArchitecturalMeshes | null>(null);

  // Handle area selection (STEP 1) and generate 3D city from OSM data
  const handleAreaSelect = useCallback(async (area: WorldArea) => {
    setWorldConfig(prev => ({ ...prev, area }));
    setMapImportOpen(false);

    // Generate 3D city from OSM data
    if (sceneRef.current) {
      setIsLoading(true);
      setLoadingMessage('Fetching OpenStreetMap data...');
      setLoadingProgress(10);

      try {
        // Dispose existing city meshes if any
        if (cityMeshesRef.current) {
          disposeCityMeshes(cityMeshesRef.current);
          cityMeshesRef.current = null;
        }
        if (architecturalMeshesRef.current) {
          disposeArchitecturalCity(architecturalMeshesRef.current);
          architecturalMeshesRef.current = null;
        }

        // Also remove legacy terrain
        const existingTerrain = sceneRef.current.getMeshByName('terrain');
        if (existingTerrain) {
          existingTerrain.dispose();
        }

        setLoadingProgress(20);

        // Fetch data based on selected data source
        const bounds = {
          minLat: area.minLat,
          minLng: area.minLng,
          maxLat: area.maxLat,
          maxLng: area.maxLng,
        };

        let cityData;
        if (worldConfig.buildings.dataSource === 'vworld') {
          setLoadingMessage('Downloading V-World building data (Korean National Spatial Data)...');
          // Fetch V-World buildings + OSM roads/water
          const vworldBuildings = await fetchVWorldCityData(bounds);
          const osmData = await fetchCityData(bounds);

          // Combine: V-World buildings + OSM roads/water/green
          cityData = {
            ...vworldBuildings,
            roads: osmData.roads,
            water: osmData.water,
            green: osmData.green,
          };
          console.log(`[VWorld+OSM] Combined: ${cityData.buildings.length} buildings, ${cityData.roads.length} roads`);
        } else {
          setLoadingMessage('Downloading OSM building & road data...');
          cityData = await fetchCityData(bounds);
        }

        setLoadingProgress(50);
        setLoadingMessage(`Creating ${cityData.buildings.length} buildings...`);

        // Generate 3D meshes based on rendering style
        let buildingCount = 0;
        let roadCount = 0;
        let waterCount = 0;

        if (worldConfig.rendering.style === 'architectural') {
          // Use maps3d.io style architectural renderer
          setLoadingMessage('Generating architectural model (maps3d.io style)...');

          const archMeshes = await generateArchitecturalCity(
            cityData,
            sceneRef.current,
            sceneRef.current.activeCamera,
            {
              buildingColor: '#f5f5f5', // Clean white buildings
              buildingRoughness: 0.95,
              buildingMetallic: 0,
              roadColor: '#4a4a4a', // Dark gray roads
              roadWidth: 8,
              terrainColor: '#e8e8e8', // Light gray terrain
              waterColor: '#a8d4e6', // Light blue water
              enableSSAO: worldConfig.rendering.enableSSAO,
              enableShadows: worldConfig.rendering.enableShadows,
              shadowQuality: worldConfig.rendering.shadowQuality,
              heightScale: worldConfig.terrain.verticalExaggeration,
              mergeBuildings: true, // Enable mesh merging for performance
            },
            null // No elevation data for now
          );

          architecturalMeshesRef.current = archMeshes;
          buildingCount = archMeshes.buildings.length;
          roadCount = archMeshes.roads.length;
          waterCount = archMeshes.water.length;

          console.log(`[Architectural] Generated:`);
          console.log(`  - Buildings: ${buildingCount} (merged: ${archMeshes.buildingsMerged ? 'yes' : 'no'})`);
          console.log(`  - Roads: ${roadCount}`);
          console.log(`  - Water: ${waterCount}`);
          console.log(`  - SSAO: ${archMeshes.ssao ? 'enabled' : 'disabled'}`);
          console.log(`  - Shadows: ${archMeshes.shadowGenerator ? 'enabled' : 'disabled'}`);
        } else {
          // Use satellite texture mode (original renderer)
          const meshes = await generateCityMeshes(
            cityData,
            sceneRef.current,
            {
              buildingsEnabled: worldConfig.buildings.enabled,
              roadsEnabled: true,
              waterEnabled: true, // Re-enabled - only closed water bodies
              greenEnabled: false, // Disabled - polygon issues causing cyan artifacts
              groundEnabled: true,
              terrainEnabled: true, // Enable real elevation terrain
              buildingColor: '#e5e7eb', // Light gray buildings
              roadColor: '#6b7280', // Medium gray roads
              waterColor: '#60a5fa', // Blue water
              greenColor: '#4ade80', // Green areas
              groundColor: '#a3a87a', // Olive/tan terrain color
              heightScale: worldConfig.terrain.verticalExaggeration,
              terrainScale: worldConfig.terrain.verticalExaggeration, // 1:1 real terrain elevation
              terrainResolution: 100, // Higher resolution for smoother terrain
              useSatelliteTexture: true, // Enable satellite texture on terrain
            }
          );

          cityMeshesRef.current = meshes;
          buildingCount = meshes.buildings.length;
          roadCount = meshes.roads.length;
          waterCount = meshes.water.length;

          console.log(`[Satellite] Generated:`);
          console.log(`  - Buildings: ${buildingCount}`);
          console.log(`  - Roads: ${roadCount}`);
          console.log(`  - Water: ${waterCount}`);
          console.log(`  - Green: ${meshes.green.length}`);
        }

        setLoadingProgress(90);
        setLoadingMessage('Finalizing city...');

        // Add to world objects for hierarchy panel
        const newObjects: WorldObject[] = [];

        // Add city root
        newObjects.push({
          id: `city_${Date.now()}`,
          name: area.name || 'Imported City',
          type: 'group',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          locked: false,
        });

        // Add summary info
        console.log(`[City] Total: ${buildingCount} buildings, ${roadCount} roads, ${waterCount} water bodies`);

        setWorldObjects(prev => [...prev, ...newObjects]);
        setLoadingProgress(100);

        // Move camera to view the city with terrain
        const camera = sceneRef.current.activeCamera;
        if (camera && camera instanceof ArcRotateCamera) {
          // Set target higher to account for terrain elevation
          camera.setTarget(new Vector3(0, 100, 0));
          camera.radius = 1500; // Increased for terrain visibility
          camera.alpha = Math.PI / 4;
          camera.beta = Math.PI / 3.5; // Slightly lower angle to see terrain slope
        }

        setTimeout(() => {
          setIsLoading(false);
        }, 500);

      } catch (error) {
        console.error('Failed to generate city:', error);
        setIsLoading(false);
        setLoadingMessage('Failed to generate city. Please try a smaller area.');
      }
    }
  }, [worldConfig.terrain.verticalExaggeration, worldConfig.buildings.enabled, worldConfig.buildings.dataSource]);

  // Proceed to next step
  const handleNextStep = useCallback(() => {
    if (currentStep === 1 && worldConfig.area) {
      setIsLoading(true);
      setLoadingMessage('Loading terrain data...');
      setLoadingProgress(0);

      // Simulate loading (will be replaced with actual data fetching)
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsLoading(false);
            setCurrentStep(2);
            return 100;
          }
          return prev + 10;
        });
      }, 200);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    }
  }, [currentStep, worldConfig.area]);

  // Go back to previous step
  const handlePrevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as 1 | 2 | 3);
    }
  }, [currentStep]);

  // Helper: Get ground height at position using Ray
  const getGroundHeight = useCallback((position: Vector3, scene: Scene): number => {
    // 캐릭터 위 5미터에서 아래로 Ray 발사
    const rayOrigin = new Vector3(position.x, position.y + 5.0, position.z);
    const rayDirection = new Vector3(0, -1, 0);
    const ray = new Ray(rayOrigin, rayDirection, 15.0);

    const pickInfo = scene.pickWithRay(ray, (mesh) => {
      // 캐릭터 관련 메쉬 제외
      const name = mesh.name.toLowerCase();
      if (name.includes('character')) return false;
      if (name.includes('ch02')) return false;  // 캐릭터 바디 파츠
      if (name.includes('armature')) return false;
      if (name.includes('__root__')) return false;

      // 스카이박스, 그리드, 축 등 비충돌 오브젝트 제외
      if (name.includes('skybox')) return false;
      if (name.includes('sundisk')) return false;
      if (name.includes('infinitegrid')) return false;
      if (name.includes('axis')) return false;

      // 모든 다른 메쉬는 충돌 대상으로 허용
      // imported, 계단, 바닥 등 모든 메쉬
      return true;
    });

    if (pickInfo?.hit && pickInfo.pickedPoint) {
      return pickInfo.pickedPoint.y;
    }
    return 0;
  }, []);

  // Play mode - load character and setup controls
  useEffect(() => {
    if (!sceneReady) return;
    // Sync playModeRef with playMode state
    playModeRef.current = playMode;

    const scene = sceneRef.current;
    const shadowGenerator = shadowGeneratorRef.current;
    const arcCamera = arcCameraRef.current;
    const thirdPersonCamera = thirdPersonCameraRef.current;

    // Only run in step 2 (3D mode)
    if (currentStep !== 2) return;

    // Hide/show axis and gizmo based on play mode
    if (scene) {
      const xAxis = scene.getMeshByName('xAxis');
      const yAxis = scene.getMeshByName('yAxis');
      const zAxis = scene.getMeshByName('zAxis');
      if (xAxis) xAxis.isVisible = !playMode;
      if (yAxis) yAxis.isVisible = !playMode;
      if (zAxis) zAxis.isVisible = !playMode;

      // Hide spawn marker in play mode (setEnabled hides children too)
      if (spawnMarkerRef.current) {
        spawnMarkerRef.current.setEnabled(!playMode);
      }

      // Detach gizmo in play mode
      const gizmoManager = gizmoManagerRef.current;
      if (gizmoManager) {
        if (playMode) {
          gizmoManager.attachToMesh(null);
        }
      }
    }

    if (!scene || !playMode) {
      // Clean up character when exiting play mode
      if (characterRootRef.current) {
        characterRootRef.current.dispose();
        characterRootRef.current = null;
        characterRef.current = null;
      }
      // Reset physics state
      characterVelocityRef.current = Vector3.Zero();
      verticalVelocityRef.current = 0;
      isGroundedRef.current = true;
      isRunningRef.current = false;
      currentAnimRef.current = 'idle';

      // Switch back to arc camera
      if (arcCamera && scene) {
        scene.activeCamera = arcCamera;
        arcCamera.attachControl(canvas3DRef.current!, true);
      }
      return;
    }

    console.log('[WorldEditor] Play mode activated, loading character...');

    // Load character - Same as Babylon3DCanvas (female_walking.glb with proper animations)
    const loadCharacter = async () => {
      try {
        // Use same model as Babylon3DCanvas: female_walking.glb
        const result = await SceneLoader.ImportMeshAsync(
          '',
          '/animation/moving/',
          'female_walking.glb',
          scene
        );

        const characterRoot = new Mesh('characterRoot', scene);
        // Use spawn point for character start position
        characterRoot.position = new Vector3(spawnPoint.x, 0, spawnPoint.z);
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
          // Matte material (no metallic shine)
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
          // Calculate bounding box for height
          const boundingInfo = mesh.getBoundingInfo();
          if (boundingInfo) {
            minY = Math.min(minY, boundingInfo.boundingBox.minimumWorld.y);
            maxY = Math.max(maxY, boundingInfo.boundingBox.maximumWorld.y);
          }
        }

        // Calculate character height and scale to 1.8m
        const originalHeight = maxY - minY;
        const targetHeight = 1.8;
        const scale = originalHeight > 0 ? targetHeight / originalHeight : 1;
        characterRoot.scaling = new Vector3(scale, scale, scale);

        // Ground offset (feet on ground)
        const groundOffset = -minY * scale;
        characterGroundOffsetRef.current = groundOffset;
        characterRoot.position.y = groundOffset;

        characterRootRef.current = characterRoot;
        characterRef.current = characterRoot;

        console.log(`[WorldEditor] Character loaded, height: ${originalHeight.toFixed(2)}, scale: ${scale.toFixed(2)}, groundOffset: ${groundOffset.toFixed(2)}`);

        // Get skeleton for animation retargeting
        const characterSkeleton = result.skeletons && result.skeletons.length > 0 ? result.skeletons[0] : null;
        console.log('[WorldEditor] Character skeleton:', characterSkeleton ? `${characterSkeleton.bones.length} bones` : 'not found');

        // Store walk animation from loaded model as the base
        if (result.animationGroups && result.animationGroups.length > 0) {
          walkAnimationRef.current = result.animationGroups[0];
          walkAnimationRef.current.loopAnimation = true;
          walkAnimationRef.current.stop();
          console.log('[WorldEditor] Walk animation stored from model');
        }

        // Helper function to load and retarget animation
        const loadRetargetedAnimation = async (filename: string, folder: string, animName: string, loop: boolean = true): Promise<AnimationGroup | null> => {
          try {
            const animResult = await SceneLoader.ImportMeshAsync('', folder, filename, scene);

            if (animResult.animationGroups && animResult.animationGroups.length > 0 && characterSkeleton) {
              const anim = animResult.animationGroups[0];
              const clonedAnim = anim.clone(`${animName}_cloned`, (oldTarget) => {
                if (oldTarget && oldTarget.name) {
                  const bone = characterSkeleton.bones.find(b => b.name === oldTarget.name);
                  if (bone) return bone.getTransformNode();
                }
                return null;
              });

              if (clonedAnim) {
                clonedAnim.loopAnimation = loop;
                clonedAnim.stop();
                console.log(`[WorldEditor] ${animName} animation loaded successfully`);

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
            console.warn(`[WorldEditor] Failed to load animation ${animName}:`, error);
          }
          return null;
        };

        // Load additional animations in parallel (movement + emotes)
        // Emotes same as Studio: 1=Tut Hip Hop, 2=Booty Hip Hop, 3=Snake Hip Hop, 4=Greeting
        const [idleAnim, runAnim, emote1, emote2, emote3, emote4, runningJumpAnim, jumpAnim] = await Promise.all([
          loadRetargetedAnimation('idle.glb', '/animation/moving/', 'idle', true),
          loadRetargetedAnimation('running2.glb', '/animation/moving/', 'run', true),
          loadRetargetedAnimation('Tut_Hip_Hop_Dance.glb', '/animation/', 'dance1', false),
          loadRetargetedAnimation('booty_hip_hop_dance.glb', '/animation/moving/', 'dance2', false),
          loadRetargetedAnimation('snake_hip_hop_dance.glb', '/animation/moving/', 'dance3', false),
          loadRetargetedAnimation('standing_greeting.glb', '/animation/moving/', 'greeting', false),
          loadRetargetedAnimation('Jumping3.glb', '/animation/moving/', 'runningJump', false),
          loadRetargetedAnimation('StandJump.glb', '/animation/moving/', 'jump', false),
        ]);

        if (idleAnim) {
          idleAnimationRef.current = idleAnim;
          idleAnim.start(true); // Start idle by default
          currentAnimRef.current = 'idle';
        }
        if (runAnim) {
          runAnimationRef.current = runAnim;
        }

        // Store emote animations
        if (emote1) emote1Ref.current = emote1;
        if (emote2) emote2Ref.current = emote2;
        if (emote3) emote3Ref.current = emote3;
        if (emote4) emote4Ref.current = emote4;
        if (runningJumpAnim) runningJumpAnimRef.current = runningJumpAnim;
        if (jumpAnim) jumpAnimRef.current = jumpAnim;

        console.log('[WorldEditor] All animations loaded - idle:', !!idleAnim, ', walk:', !!walkAnimationRef.current, ', run:', !!runAnim, ', runningJump:', !!runningJumpAnim, ', jump:', !!jumpAnim);
        console.log('[WorldEditor] Emotes loaded - 1:', !!emote1, ', 2:', !!emote2, ', 3:', !!emote3, ', 4:', !!emote4);

        // Setup camera based on viewMode (default: third-person)
        if (arcCamera) {
          arcCamera.detachControl();
        }

        // Set initial camera based on viewMode
        if (viewMode === 'first-person') {
          if (fpsCameraRef.current) {
            fpsCameraRef.current.position = characterRoot.position.add(new Vector3(0, 1.7, 0));
            fpsCameraRef.current.rotation = new Vector3(0, characterRoot.rotation.y, 0);
            scene.activeCamera = fpsCameraRef.current;
            fpsCameraRef.current.attachControl(canvas3DRef.current!, true);
          }
        } else if (viewMode === 'iso') {
          if (isoCameraRef.current) {
            isoCameraRef.current.target = characterRoot.position.clone();
            scene.activeCamera = isoCameraRef.current;
            isoCameraRef.current.attachControl(canvas3DRef.current!, true);
          }
        } else {
          // Default: third-person (ArcRotateCamera for mouse rotation)
          if (thirdPersonCamera) {
            thirdPersonCamera.target = characterRoot.position.add(new Vector3(0, 1, 0));
            scene.activeCamera = thirdPersonCamera;
            thirdPersonCamera.attachControl(canvas3DRef.current!, true);
          }
        }

        console.log('[WorldEditor] Character loaded at (0,0,0), viewMode:', viewMode);
      } catch (error) {
        console.error('[WorldEditor] Failed to load character:', error);
      }
    };

    loadCharacter();

    // Korean key mapping (ㅈㅁㄴㅇ -> wasd)
    const koreanToWasd: Record<string, string> = {
      'ㅈ': 'w', 'ㅁ': 'a', 'ㄴ': 's', 'ㅇ': 'd'
    };

    // Input map for smooth movement
    const inputMap: { [key: string]: boolean } = {};
    let isJumping = false;
    let localVerticalVelocity = 0;
    const groundY = characterGroundOffsetRef.current;

    // Helper function to play emote animation
    const playEmote = (emoteAnim: AnimationGroup | null) => {
      console.log('[WorldEditor] playEmote called, anim:', emoteAnim?.name, 'isEmoting:', isEmotingRef.current);
      if (!emoteAnim) {
        console.log('[WorldEditor] No emote animation available');
        return;
      }
      if (isEmotingRef.current) {
        console.log('[WorldEditor] Already emoting, skip');
        return;
      }

      // Stop all current animations
      idleAnimationRef.current?.stop();
      walkAnimationRef.current?.stop();
      runAnimationRef.current?.stop();

      isEmotingRef.current = true;
      console.log('[WorldEditor] Starting emote:', emoteAnim.name);
      emoteAnim.start(false); // Play once

      // When emote ends, return to idle
      emoteAnim.onAnimationGroupEndObservable.addOnce(() => {
        isEmotingRef.current = false;
        idleAnimationRef.current?.start(true);
        currentAnimRef.current = 'idle';
        console.log('[WorldEditor] Emote ended, back to idle');
      });
    };

    // Keyboard controls - Game-style like Babylon3DCanvas
    const handleKeyDown = (e: KeyboardEvent) => {
      let key = e.key.toLowerCase();
      // Map Korean keys to WASD
      if (koreanToWasd[key]) {
        key = koreanToWasd[key];
      }

      if (['w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
        inputMap[key] = true;
        // Cancel emote if moving
        if (isEmotingRef.current) {
          isEmotingRef.current = false;
          emote1Ref.current?.stop();
          emote2Ref.current?.stop();
          emote3Ref.current?.stop();
          emote4Ref.current?.stop();
        }
      }

      // Shift = Running
      if (key === 'shift') {
        isRunningRef.current = true;
      }

      // Space = Jump
      if (key === ' ' && !isJumping && characterRootRef.current) {
        isJumping = true;
        localVerticalVelocity = CHARACTER_CONFIG.jumpForce;

        // Stop all movement animations
        idleAnimationRef.current?.stop();
        walkAnimationRef.current?.stop();
        runAnimationRef.current?.stop();
        jumpAnimRef.current?.stop();
        runningJumpAnimRef.current?.stop();

        // 걷거나 달리는 중이면 Jumping3 (movingJump), 아니면 StandJump
        const isMovingNow = keysPressed.current.has('w') || keysPressed.current.has('a') ||
                           keysPressed.current.has('s') || keysPressed.current.has('d') ||
                           keysPressed.current.has('arrowup') || keysPressed.current.has('arrowdown') ||
                           keysPressed.current.has('arrowleft') || keysPressed.current.has('arrowright');

        if (isMovingNow && runningJumpAnimRef.current) {
          runningJumpAnimRef.current.start(false); // no loop
          currentAnimRef.current = 'runningJump';
          console.log('[WorldEditor] Moving Jump!');
        } else if (jumpAnimRef.current) {
          jumpAnimRef.current.start(false); // no loop
          currentAnimRef.current = 'jump';
          console.log('[WorldEditor] Standing Jump!');
        }
      }

      // Number keys 1-4 = Emotes (same as Studio)
      if (e.key === '1') {
        playEmote(emote1Ref.current); // Tut Hip Hop Dance
      } else if (e.key === '2') {
        playEmote(emote2Ref.current); // Booty Hip Hop Dance
      } else if (e.key === '3') {
        playEmote(emote3Ref.current); // Snake Hip Hop Dance
      } else if (e.key === '4') {
        playEmote(emote4Ref.current); // Standing Greeting
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      let key = e.key.toLowerCase();
      // Map Korean keys to WASD
      if (koreanToWasd[key]) {
        key = koreanToWasd[key];
      }

      if (['w', 'a', 's', 'd'].includes(key)) {
        e.preventDefault();
        inputMap[key] = false;
      }

      if (key === 'shift') {
        isRunningRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);

    // Smooth rotation interpolation
    let targetRotationY = 0;

    // Movement update in render loop - Frame-based like Babylon3DCanvas
    const updateMovement = () => {
      if (!characterRootRef.current || !playModeRef.current) return;

      const character = characterRootRef.current;
      const currentViewMode = viewModeRef.current;
      const isRunning = isRunningRef.current;
      const currentMoveSpeed = isRunning ? CHARACTER_CONFIG.runSpeed : CHARACTER_CONFIG.walkSpeed;

      // Get the active camera based on view mode
      let playCamera: ArcRotateCamera | UniversalCamera | null = null;
      if (currentViewMode === 'first-person') {
        playCamera = fpsCameraRef.current;
      } else if (currentViewMode === 'iso') {
        playCamera = isoCameraRef.current;
      } else {
        playCamera = thirdPersonCameraRef.current;
      }

      // ===== CAMERA DIRECTION CALCULATION =====
      // Get camera forward direction on XZ plane
      if (!playCamera) return;

      let forward: Vector3;

      if (currentViewMode === 'first-person' && fpsCameraRef.current) {
        // For UniversalCamera, calculate forward from rotation
        const fpsCamera = fpsCameraRef.current;
        const yRotation = fpsCamera.rotation.y;
        forward = new Vector3(Math.sin(yRotation), 0, Math.cos(yRotation));
      } else {
        // For ArcRotateCamera (third-person and iso), use position to target
        const camPos = playCamera.position;
        const arcCamera = playCamera as ArcRotateCamera;
        const camTarget = arcCamera.target;
        forward = new Vector3(
          camTarget.x - camPos.x,
          0,
          camTarget.z - camPos.z
        );
        forward.normalize();
      }

      // Right vector (perpendicular to forward)
      const right = new Vector3(forward.z, 0, -forward.x);

      // ===== INPUT HANDLING =====
      const movingForward = inputMap['w'];
      const movingBackward = inputMap['s'];
      const movingLeft = inputMap['a'];
      const movingRight = inputMap['d'];

      // Calculate movement direction based on WASD (camera-relative)
      let moveDirection = Vector3.Zero();
      if (movingForward) moveDirection.addInPlace(forward);
      if (movingBackward) moveDirection.subtractInPlace(forward);
      if (movingLeft) moveDirection.subtractInPlace(right);
      if (movingRight) moveDirection.addInPlace(right);

      const isMoving = moveDirection.lengthSquared() > 0.0001;

      // ===== CHARACTER MOVEMENT =====
      if (isMoving) {
        moveDirection.normalize();

        // Calculate new position with appropriate speed
        const newPosition = character.position.add(moveDirection.scale(currentMoveSpeed));

        // Move character
        character.position.x = newPosition.x;
        character.position.z = newPosition.z;

        // Rotate character to face movement direction
        targetRotationY = Math.atan2(moveDirection.x, moveDirection.z);
      }

      // ===== GROUND COLLISION (계단/언덕 오르기) =====
      const currentScene = sceneRef.current;
      if (currentScene) {
        const groundHeight = getGroundHeight(character.position, currentScene);
        if (groundHeight > character.position.y) {
          // 위로 올라가기 (계단/언덕)
          character.position.y = groundHeight;
        } else if (groundHeight < character.position.y - 0.1) {
          // 아래로 떨어지기 (중력)
          character.position.y = Math.max(groundHeight, character.position.y - 0.3);
        }
      }

      // Smooth rotation interpolation (lerp)
      let angleDiff = targetRotationY - character.rotation.y;
      // Normalize angle difference to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      character.rotation.y += angleDiff * CHARACTER_CONFIG.rotationSpeed;

      // ===== CAMERA FOLLOW =====
      if (currentViewMode === 'first-person' && fpsCameraRef.current) {
        // First-person: camera follows character position at eye height
        fpsCameraRef.current.position.x = character.position.x;
        fpsCameraRef.current.position.y = character.position.y + 1.7;
        fpsCameraRef.current.position.z = character.position.z;
      } else {
        // Third-person and ISO: camera target follows character
        const arcCamera = playCamera as ArcRotateCamera;
        arcCamera.target.x = character.position.x;
        arcCamera.target.y = character.position.y + 0.5; // Lower target to see full body
        arcCamera.target.z = character.position.z;
      }

      // ===== JUMP PHYSICS =====
      if (isJumping) {
        character.position.y += localVerticalVelocity;
        localVerticalVelocity -= CHARACTER_CONFIG.gravity;

        if (character.position.y <= groundY) {
          character.position.y = groundY;
          isJumping = false;
          localVerticalVelocity = 0;
        }
      }

      // ===== ANIMATION STATE =====
      // Skip animation updates if currently emoting (1,2,3,4 key actions)
      if (isEmotingRef.current) return;

      // 점프 중에는 애니메이션 변경하지 않음 (jump or runningJump)
      if (isJumping && (currentAnimRef.current === 'runningJump' || currentAnimRef.current === 'jump')) {
        return;
      }

      if (currentViewMode !== 'first-person') {
        let targetAnim = 'idle';
        if (isMoving) {
          targetAnim = isRunning ? 'run' : 'walk';
        }

        if (targetAnim !== currentAnimRef.current) {
          // Stop all animations
          idleAnimationRef.current?.stop();
          walkAnimationRef.current?.stop();
          runAnimationRef.current?.stop();
          jumpAnimRef.current?.stop();
          runningJumpAnimRef.current?.stop();

          // Start target animation
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

    // Register before render
    scene.registerBeforeRender(updateMovement);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      scene.unregisterBeforeRender(updateMovement);
    };
    // NOTE: viewMode is handled in a separate useEffect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playMode, currentStep]);

  // Handle camera switching when viewMode changes during play mode
  // Sync isSettingSpawnPointRef with state
  useEffect(() => {
    isSettingSpawnPointRef.current = isSettingSpawnPoint;
  }, [isSettingSpawnPoint]);

  useEffect(() => {
    if (!sceneReady) return;
    // Sync viewModeRef with viewMode state
    viewModeRef.current = viewMode;

    const scene = sceneRef.current;
    if (!scene || !playMode || !characterRootRef.current) return;

    const thirdPersonCamera = thirdPersonCameraRef.current;
    const fpsCamera = fpsCameraRef.current;
    const isoCamera = isoCameraRef.current;

    // Detach all cameras first
    thirdPersonCamera?.detachControl();
    fpsCamera?.detachControl();
    isoCamera?.detachControl();

    if (viewMode === 'first-person' && fpsCamera) {
      // Position FPS camera at character's eye level
      fpsCamera.position = characterRootRef.current.position.add(new Vector3(0, 1.7, 0));
      fpsCamera.rotation = new Vector3(0, characterRootRef.current.rotation.y, 0);
      scene.activeCamera = fpsCamera;
      fpsCamera.attachControl(canvas3DRef.current!, true);
      // Hide character in first-person
      characterRootRef.current.setEnabled(false);
    } else if (viewMode === 'iso' && isoCamera) {
      isoCamera.target = characterRootRef.current.position.clone();
      scene.activeCamera = isoCamera;
      isoCamera.attachControl(canvas3DRef.current!, true);
      // Show character in ISO view
      characterRootRef.current.setEnabled(true);
    } else if (thirdPersonCamera) {
      // Default: third-person (ArcRotateCamera for mouse rotation)
      thirdPersonCamera.target = characterRootRef.current.position.add(new Vector3(0, 1, 0));
      scene.activeCamera = thirdPersonCamera;
      thirdPersonCamera.attachControl(canvas3DRef.current!, true);
      // Show character in third-person view
      characterRootRef.current.setEnabled(true);
    }

    console.log('[WorldEditor] Camera switched to:', viewMode);
  }, [viewMode, playMode]);

  // Handle export
  const handleExport = useCallback(() => {
    setIsLoading(true);
    setLoadingMessage(`Generating ${worldConfig.export.format.toUpperCase()} model...`);
    setLoadingProgress(0);

    // Simulate export (will be replaced with actual export logic)
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsLoading(false);
          alert('Export complete! (Demo)');
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  }, [worldConfig.export.format]);

  // ============================================
  // Road Drawing Functions (Cities: Skylines Style)
  // ============================================

  // Generate bezier curve points for curved roads
  const generateBezierPoints = useCallback((
    start: { x: number; y: number; z: number },
    control: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    segments: number = 20
  ): { x: number; y: number; z: number }[] => {
    const points: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const oneMinusT = 1 - t;
      const x = oneMinusT * oneMinusT * start.x + 2 * oneMinusT * t * control.x + t * t * end.x;
      const y = 0.02;
      const z = oneMinusT * oneMinusT * start.z + 2 * oneMinusT * t * control.z + t * t * end.z;
      points.push({ x, y, z });
    }
    return points;
  }, []);

  // Generate road geometry from waypoints
  const generateRoadGeometry = useCallback((
    waypoints: { x: number; y: number; z: number }[],
    width: number
  ): { positions: number[]; indices: number[]; uvs: number[] } | null => {
    if (waypoints.length < 2) return null;

    const halfWidth = width / 2;
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    let accumulatedLength = 0;

    for (let i = 0; i < waypoints.length; i++) {
      const current = new Vector3(waypoints[i].x, waypoints[i].y, waypoints[i].z);
      let perpendicular: Vector3;

      if (i === 0) {
        const next = new Vector3(waypoints[i + 1].x, waypoints[i + 1].y, waypoints[i + 1].z);
        const direction = next.subtract(current).normalize();
        perpendicular = new Vector3(-direction.z, 0, direction.x);
      } else if (i === waypoints.length - 1) {
        const prev = new Vector3(waypoints[i - 1].x, waypoints[i - 1].y, waypoints[i - 1].z);
        const direction = current.subtract(prev).normalize();
        perpendicular = new Vector3(-direction.z, 0, direction.x);
      } else {
        const prev = new Vector3(waypoints[i - 1].x, waypoints[i - 1].y, waypoints[i - 1].z);
        const next = new Vector3(waypoints[i + 1].x, waypoints[i + 1].y, waypoints[i + 1].z);
        const dirIn = current.subtract(prev).normalize();
        const dirOut = next.subtract(current).normalize();
        const avgDir = dirIn.add(dirOut).normalize();
        perpendicular = new Vector3(-avgDir.z, 0, avgDir.x);
        const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(dirIn, dirOut))));
        const scale = 1 / Math.max(0.5, Math.cos(angle / 2));
        perpendicular.scaleInPlace(Math.min(scale, 2));
      }

      if (i > 0) {
        const prev = waypoints[i - 1];
        accumulatedLength += Math.sqrt(
          Math.pow(waypoints[i].x - prev.x, 2) + Math.pow(waypoints[i].z - prev.z, 2)
        );
      }

      const left = current.add(perpendicular.scale(halfWidth));
      const right = current.subtract(perpendicular.scale(halfWidth));
      positions.push(left.x, left.y, left.z);
      positions.push(right.x, right.y, right.z);

      const u = accumulatedLength / 2;
      uvs.push(u, 0);
      uvs.push(u, 1);
    }

    for (let i = 0; i < waypoints.length - 1; i++) {
      const baseIndex = i * 2;
      // Counter-clockwise winding for both triangles (Babylon.js default front face)
      // Vertices: left0(0), right0(1), left1(2), right1(3)
      indices.push(baseIndex, baseIndex + 2, baseIndex + 1);      // left0, left1, right0
      indices.push(baseIndex + 1, baseIndex + 2, baseIndex + 3);  // right0, left1, right1
    }

    return { positions, indices, uvs };
  }, []);

  // Create road edge guide lines (Cities: Skylines style)
  const createRoadGuideLines = useCallback((
    scene: Scene,
    waypoints: { x: number; y: number; z: number }[],
    width: number
  ): Mesh[] => {
    if (waypoints.length < 2) return [];
    const guideLines: Mesh[] = [];
    const halfWidth = width / 2;
    const leftPoints: Vector3[] = [];
    const rightPoints: Vector3[] = [];

    for (let i = 0; i < waypoints.length; i++) {
      const current = new Vector3(waypoints[i].x, 0.05, waypoints[i].z);
      let perpendicular: Vector3;

      if (i === 0) {
        const next = new Vector3(waypoints[i + 1].x, 0, waypoints[i + 1].z);
        const direction = next.subtract(current).normalize();
        perpendicular = new Vector3(-direction.z, 0, direction.x);
      } else if (i === waypoints.length - 1) {
        const prev = new Vector3(waypoints[i - 1].x, 0, waypoints[i - 1].z);
        const direction = current.subtract(prev).normalize();
        perpendicular = new Vector3(-direction.z, 0, direction.x);
      } else {
        const prev = new Vector3(waypoints[i - 1].x, 0, waypoints[i - 1].z);
        const next = new Vector3(waypoints[i + 1].x, 0, waypoints[i + 1].z);
        const dirIn = current.subtract(prev).normalize();
        const dirOut = next.subtract(current).normalize();
        perpendicular = new Vector3(-(dirIn.z + dirOut.z) / 2, 0, (dirIn.x + dirOut.x) / 2).normalize();
      }

      leftPoints.push(current.add(perpendicular.scale(halfWidth)));
      rightPoints.push(current.subtract(perpendicular.scale(halfWidth)));
    }

    const leftLine = MeshBuilder.CreateLines('leftGuide', { points: leftPoints }, scene);
    leftLine.color = new Color3(0, 0.9, 0.9);
    leftLine.isPickable = false;
    guideLines.push(leftLine);

    const rightLine = MeshBuilder.CreateLines('rightGuide', { points: rightPoints }, scene);
    rightLine.color = new Color3(0, 0.9, 0.9);
    rightLine.isPickable = false;
    guideLines.push(rightLine);

    return guideLines;
  }, []);

  // Create direction arrows (Cities: Skylines style)
  const createDirectionArrows = useCallback((scene: Scene, waypoints: { x: number; y: number; z: number }[]): Mesh[] => {
    if (waypoints.length < 2) return [];
    const arrows: Mesh[] = [];
    let accumulatedDist = 0;

    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const segmentLength = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.z - prev.z, 2));
      const direction = new Vector3(curr.x - prev.x, 0, curr.z - prev.z).normalize();

      // Place arrow at segment midpoint
      if (segmentLength > 1) {
        const pos = new Vector3(
          (prev.x + curr.x) / 2,
          0.08,
          (prev.z + curr.z) / 2
        );

        const arrow = MeshBuilder.CreateCylinder('arrow', {
          height: 0.6, diameterTop: 0, diameterBottom: 0.3, tessellation: 4
        }, scene);
        arrow.position = pos;
        arrow.rotation.x = Math.PI / 2;
        arrow.rotation.y = Math.atan2(direction.x, direction.z);

        const arrowMat = new StandardMaterial('arrowMat', scene);
        arrowMat.emissiveColor = new Color3(0.3, 0.7, 1);
        arrowMat.alpha = 0.8;
        arrow.material = arrowMat;
        arrow.isPickable = false;
        arrows.push(arrow);
      }
      accumulatedDist += segmentLength;
    }
    return arrows;
  }, []);

  // Update road preview with Cities: Skylines style visuals
  const updateRoadPreviewSkylines = useCallback((
    scene: Scene,
    waypoints: { x: number; y: number; z: number }[],
    currentPoint: { x: number; y: number; z: number } | null,
    existingState: { previewMesh: Mesh | null; guideLines: Mesh[]; directionArrows: Mesh[] },
    width: number
  ): { previewMesh: Mesh | null; guideLines: Mesh[]; directionArrows: Mesh[] } => {
    // Dispose existing visuals
    if (existingState.previewMesh) existingState.previewMesh.dispose();
    existingState.guideLines.forEach(l => l.dispose());
    existingState.directionArrows.forEach(a => { if (a.material) a.material.dispose(); a.dispose(); });

    const previewPoints = [...waypoints];
    if (currentPoint) previewPoints.push(currentPoint);

    if (previewPoints.length < 2) {
      return { previewMesh: null, guideLines: [], directionArrows: [] };
    }

    const geometry = generateRoadGeometry(previewPoints, width);
    if (!geometry) return { previewMesh: null, guideLines: [], directionArrows: [] };

    // Create road surface mesh
    const mesh = new Mesh('roadPreview', scene);
    const vertexData = new VertexData();
    vertexData.positions = geometry.positions;
    vertexData.indices = geometry.indices;
    vertexData.uvs = geometry.uvs;

    const normals: number[] = [];
    for (let i = 0; i < geometry.positions.length / 3; i++) normals.push(0, 1, 0);
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);

    // Asphalt material with texture
    const material = new StandardMaterial('roadPreviewMat', scene);
    material.diffuseColor = new Color3(0.25, 0.25, 0.25);
    const previewTexture = new Texture(
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/asphalt_02/asphalt_02_diff_4k.jpg',
      scene
    );
    previewTexture.uScale = 1;
    previewTexture.vScale = 1;
    material.diffuseTexture = previewTexture;
    material.alpha = 0.85;
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.position.y = 0.02;

    // Create guide lines (cyan edge indicators)
    const guideLines = createRoadGuideLines(scene, previewPoints, width);

    // Create direction arrows
    const directionArrows = createDirectionArrows(scene, previewPoints);

    return { previewMesh: mesh, guideLines, directionArrows };
  }, [generateRoadGeometry, createRoadGuideLines, createDirectionArrows]);

  // Create waypoint marker (Cities: Skylines style - green for start, white for end)
  const createWaypointMarker = useCallback((
    scene: Scene,
    point: { x: number; y: number; z: number },
    isStart: boolean = false
  ): Mesh => {
    // Start point: green circle, End point: white circle
    const marker = MeshBuilder.CreateTorus('waypointMarker', {
      diameter: isStart ? 1.2 : 0.8,
      thickness: 0.15,
      tessellation: 32
    }, scene);
    marker.position = new Vector3(point.x, 0.1, point.z);
    marker.rotation.x = Math.PI / 2;
    marker.isPickable = false;

    const material = new StandardMaterial('waypointMat', scene);
    if (isStart) {
      material.emissiveColor = new Color3(0.2, 1, 0.4); // Green for start
    } else {
      material.emissiveColor = new Color3(1, 1, 1); // White for waypoints
    }
    material.disableLighting = true;
    marker.material = material;

    return marker;
  }, []);

  // Finalize road and create permanent mesh
  const finalizeRoad = useCallback((scene: Scene, waypoints?: { x: number; y: number; z: number }[]) => {
    const pts = waypoints || roadDrawing.waypoints;
    if (pts.length < 2) return;

    const geometry = generateRoadGeometry(pts, roadWidth);
    if (!geometry) return;

    const mesh = new Mesh(`road_${Date.now()}`, scene);
    const vertexData = new VertexData();
    vertexData.positions = geometry.positions;
    vertexData.indices = geometry.indices;
    vertexData.uvs = geometry.uvs;

    // Generate normals (all pointing up)
    const normals: number[] = [];
    for (let i = 0; i < geometry.positions.length / 3; i++) {
      normals.push(0, 1, 0);
    }
    vertexData.normals = normals;
    vertexData.applyToMesh(mesh);

    // Create asphalt material with texture
    const material = new StandardMaterial(`roadMat_${Date.now()}`, scene);
    material.diffuseColor = new Color3(0.3, 0.3, 0.32); // Dark asphalt gray base

    // Load asphalt texture from Poly Haven CDN
    const roadTexture = new Texture(
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_04/asphalt_04_diff_1k.jpg',
      scene
    );
    roadTexture.uScale = 2; // Repeat texture along road length
    roadTexture.vScale = 1; // Once across road width
    material.diffuseTexture = roadTexture;

    // Add normal map for realistic bumps
    const roadNormal = new Texture(
      'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_04/asphalt_04_nor_gl_1k.jpg',
      scene
    );
    roadNormal.uScale = 2;
    roadNormal.vScale = 1;
    material.bumpTexture = roadNormal;
    material.bumpTexture.level = 0.5;

    material.specularColor = new Color3(0.1, 0.1, 0.1);
    material.specularPower = 32;
    material.backFaceCulling = false;
    mesh.material = material;
    mesh.position.y = 0.02; // Slightly above ground

    mesh.metadata = {
      type: 'road',
      waypoints: pts,
      width: roadWidth,
    };

    roadMeshesRef.current.push(mesh);

    // Calculate road length
    let totalLength = 0;
    for (let i = 1; i < pts.length; i++) {
      const p1 = pts[i - 1];
      const p2 = pts[i];
      totalLength += Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2)
      );
    }
    console.log(`[Road] Created: ${pts.length} waypoints, ${totalLength.toFixed(1)}m length, ${roadWidth}m width`);

    // Cleanup all visuals
    if (roadDrawing.previewMesh) roadDrawing.previewMesh.dispose();
    roadDrawing.waypointMarkers.forEach(m => { if (m.material) m.material.dispose(); m.dispose(); });
    roadDrawing.guideLines.forEach(l => l.dispose());
    roadDrawing.directionArrows.forEach(a => { if (a.material) a.material.dispose(); a.dispose(); });

    setRoadDrawing({
      isDrawing: false,
      mode: roadMode,
      startPoint: null,
      controlPoint: null,
      endPoint: null,
      waypoints: [],
      previewMesh: null,
      waypointMarkers: [],
      guideLines: [],
      directionArrows: [],
      width: roadWidth,
    });
  }, [roadDrawing, roadWidth, roadMode, generateRoadGeometry]);

  // Cancel road drawing
  const cancelRoadDrawing = useCallback(() => {
    if (roadDrawing.previewMesh) roadDrawing.previewMesh.dispose();
    roadDrawing.waypointMarkers.forEach(m => { if (m.material) m.material.dispose(); m.dispose(); });
    roadDrawing.guideLines.forEach(l => l.dispose());
    roadDrawing.directionArrows.forEach(a => { if (a.material) a.material.dispose(); a.dispose(); });

    setRoadDrawing({
      isDrawing: false,
      mode: roadMode,
      startPoint: null,
      controlPoint: null,
      endPoint: null,
      waypoints: [],
      previewMesh: null,
      waypointMarkers: [],
      guideLines: [],
      directionArrows: [],
      width: roadWidth,
    });

    // Deselect road tool
    setActiveTool('select');
  }, [roadDrawing, roadWidth, roadMode]);

  // Road tool pointer handling (Cities: Skylines style - DRAG based)
  // POINTERDOWN = set start point
  // POINTERMOVE = show preview while dragging
  // POINTERUP = finalize road segment
  useEffect(() => {
    if (!sceneReady) return;
    const scene = sceneRef.current;
    if (!scene || activeTool !== 'road') return;

    const canvas = canvas3DRef.current;
    const camera = arcCameraRef.current;

    // Disable camera controls while drawing roads
    if (camera && canvas) {
      camera.detachControl();
    }

    const pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
      const pickResult = scene.pick(scene.pointerX, scene.pointerY);
      const dragState = roadDraggingRef.current;

      if (pointerInfo.type === 1) { // POINTERDOWN - Start drag
        if (!pickResult.hit || !pickResult.pickedPoint) return;

        const point = {
          x: pickResult.pickedPoint.x,
          y: 0.02,
          z: pickResult.pickedPoint.z,
        };

        // Create start marker (green torus)
        const marker = createWaypointMarker(scene, point, true);

        // Update ref (persists across state changes) - include all properties
        roadDraggingRef.current = {
          isDragging: true,
          startPoint: point,
          endPoint: null,
          startMarker: marker,
          previewMesh: null,
          guideLines: [],
          directionArrows: [],
        };

        setRoadDrawing(prev => ({
          ...prev,
          isDrawing: true,
          startPoint: point,
          waypoints: [point],
          waypointMarkers: marker ? [marker] : [],
        }));

      } else if (pointerInfo.type === 4) { // POINTERMOVE - Update preview while dragging
        if (!dragState.isDragging || !dragState.startPoint) return;
        if (!pickResult.hit || !pickResult.pickedPoint) return;

        const currentPoint = {
          x: pickResult.pickedPoint.x,
          y: 0.02,
          z: pickResult.pickedPoint.z,
        };

        // Store end point in ref for fallback
        roadDraggingRef.current.endPoint = currentPoint;

        // Update preview with Cities: Skylines style visuals (use ref for existing visuals)
        const newVisuals = updateRoadPreviewSkylines(
          scene,
          [dragState.startPoint],
          currentPoint,
          {
            previewMesh: dragState.previewMesh,
            guideLines: dragState.guideLines,
            directionArrows: dragState.directionArrows
          },
          roadWidth
        );

        // Store new visuals in ref
        roadDraggingRef.current.previewMesh = newVisuals.previewMesh;
        roadDraggingRef.current.guideLines = newVisuals.guideLines;
        roadDraggingRef.current.directionArrows = newVisuals.directionArrows;

      } else if (pointerInfo.type === 2) { // POINTERUP - Finalize road segment
        if (!dragState.isDragging || !dragState.startPoint) return;

        // Use the last known current point if pick fails (common with fast mouse release)
        let endPoint: { x: number; y: number; z: number };
        if (pickResult.hit && pickResult.pickedPoint) {
          endPoint = {
            x: pickResult.pickedPoint.x,
            y: 0.02,
            z: pickResult.pickedPoint.z,
          };
        } else {
          // Fallback: use the last preview point from POINTERMOVE (stored in ref)
          if (!dragState.endPoint) {
            // Cleanup visuals
            if (dragState.previewMesh) dragState.previewMesh.dispose();
            dragState.guideLines.forEach(l => l.dispose());
            dragState.directionArrows.forEach(a => { if (a.material) a.material.dispose(); a.dispose(); });
            if (dragState.startMarker) { if (dragState.startMarker.material) dragState.startMarker.material.dispose(); dragState.startMarker.dispose(); }
            roadDraggingRef.current = { isDragging: false, startPoint: null, endPoint: null, startMarker: null, previewMesh: null, guideLines: [], directionArrows: [] };
            return;
          }
          endPoint = dragState.endPoint;
        }

        // Calculate distance - minimum 1 meter for valid road
        const dx = endPoint.x - dragState.startPoint.x;
        const dz = endPoint.z - dragState.startPoint.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 1) {
          // Too short - cleanup and reset
          if (dragState.previewMesh) dragState.previewMesh.dispose();
          dragState.guideLines.forEach(l => l.dispose());
          dragState.directionArrows.forEach(a => { if (a.material) a.material.dispose(); a.dispose(); });
          if (dragState.startMarker) { if (dragState.startMarker.material) dragState.startMarker.material.dispose(); dragState.startMarker.dispose(); }
          roadDraggingRef.current = { isDragging: false, startPoint: null, endPoint: null, startMarker: null, previewMesh: null, guideLines: [], directionArrows: [] };
          return;
        }

        // Create end marker (white torus)
        const endMarker = createWaypointMarker(scene, endPoint, false);

        // Create final waypoints array
        const finalWaypoints = [dragState.startPoint, endPoint];

        // Cleanup preview visuals before creating final road
        if (dragState.previewMesh) dragState.previewMesh.dispose();
        dragState.guideLines.forEach(l => l.dispose());
        dragState.directionArrows.forEach(a => { if (a.material) a.material.dispose(); a.dispose(); });
        if (dragState.startMarker) { if (dragState.startMarker.material) dragState.startMarker.material.dispose(); dragState.startMarker.dispose(); }
        if (endMarker) { if (endMarker.material) endMarker.material.dispose(); endMarker.dispose(); }

        // Finalize the road
        finalizeRoad(scene, finalWaypoints);

        // Reset drag state
        roadDraggingRef.current = { isDragging: false, startPoint: null, endPoint: null, startMarker: null, previewMesh: null, guideLines: [], directionArrows: [] };
      }
    });

    return () => {
      scene.onPointerObservable.remove(pointerObserver);
      // Re-enable camera controls when road tool is deactivated
      if (camera && canvas) {
        camera.attachControl(canvas, true);
      }
    };
  }, [activeTool, roadWidth, createWaypointMarker, updateRoadPreviewSkylines, finalizeRoad, cancelRoadDrawing, sceneReady]);

  // Handle keyboard for road tool (drag-based mode)
  useEffect(() => {
    if (!sceneReady) return;
    if (activeTool !== 'road') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ESC always cancels and deselects road tool
        cancelRoadDrawing();
      } else if (e.key === '+' || e.key === '=') {
        setRoadWidth(prev => Math.min(50, prev + 1));
      } else if (e.key === '-' || e.key === '_') {
        setRoadWidth(prev => Math.max(1, prev - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, cancelRoadDrawing]);

  // Handle model file import
  const handleModelFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sceneRef.current) return;

    const scene = sceneRef.current;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    // FBX는 Babylon.js에서 직접 지원하지 않음
    if (ext === 'fbx') {
      alert('FBX 파일은 직접 지원되지 않습니다.\nGLB/GLTF로 변환 후 사용하세요.\n\n변환 도구: https://products.aspose.app/3d/conversion/fbx-to-glb');
      e.target.value = '';
      return;
    }

    // 확장자에 따른 플러그인 힌트
    let pluginExtension = '.glb';
    if (ext === 'obj') pluginExtension = '.obj';
    else if (ext === 'gltf') pluginExtension = '.gltf';
    else if (ext === 'glb') pluginExtension = '.glb';

    const fileUrl = URL.createObjectURL(file);
    console.log('[WorldEditor] Loading model:', file.name, 'extension:', pluginExtension);

    SceneLoader.ImportMesh(
      '',
      '',
      fileUrl,
      scene,
      (meshes) => {
        console.log(`[WorldEditor] ${ext.toUpperCase()} loaded:`, meshes.length, 'meshes');

        // Create a root container for the imported model
        const rootMesh = new Mesh(`imported_${file.name}_${Date.now()}`, scene);
        rootMesh.position = new Vector3(0, 0, 0);
        rootMesh.checkCollisions = true;

        // Calculate bounding box for all meshes
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        meshes.forEach((mesh) => {
          if (mesh.parent === null) {
            mesh.parent = rootMesh;
          }
          mesh.checkCollisions = true;

          const boundingInfo = mesh.getBoundingInfo();
          if (boundingInfo) {
            const min = boundingInfo.boundingBox.minimumWorld;
            const max = boundingInfo.boundingBox.maximumWorld;
            minX = Math.min(minX, min.x);
            minY = Math.min(minY, min.y);
            minZ = Math.min(minZ, min.z);
            maxX = Math.max(maxX, max.x);
            maxY = Math.max(maxY, max.y);
            maxZ = Math.max(maxZ, max.z);
          }
        });

        // Position model so its bottom is on the ground (Y=0)
        if (minY !== Infinity) {
          rootMesh.position.y = -minY;
        }

        // Generate unique ID for layer management
        const uid = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        rootMesh.name = uid;

        rootMesh.metadata = {
          type: 'imported_model',
          fileName: file.name,
          fileType: ext,
          boundingBox: { minX, minY, minZ, maxX, maxY, maxZ },
          isMapElement: true,
          hasCollision: true,
          uid: uid
        };

        loadedAssetsRef.current.set(uid, rootMesh);

        // ADD TO LAYERS
        const newObjects: WorldObject[] = [];
        const baseName = file.name.replace(/\.[^/.]+$/, '');

        newObjects.push({
          id: uid,
          name: baseName,
          type: 'group',
          position: { x: rootMesh.position.x, y: rootMesh.position.y, z: rootMesh.position.z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          locked: false,
          parentId: undefined,
          children: [],
        });

        meshes.forEach((mesh, index) => {
          if (mesh.name && mesh.name !== '__root__') {
            const meshUid = `${uid}_mesh_${index}`;
            mesh.metadata = { ...mesh.metadata, uid: meshUid, selectable: true };
            loadedAssetsRef.current.set(meshUid, mesh);

            newObjects.push({
              id: meshUid,
              name: mesh.name || `Mesh_${index}`,
              type: 'mesh',
              position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              visible: mesh.isVisible,
              locked: false,
              parentId: uid,
            });
          }
        });

        setWorldObjects(prev => [...prev, ...newObjects]);

        console.log(`[WorldEditor] "${file.name}" loaded. Bounds:`, {
          width: maxX - minX,
          height: maxY - minY,
          depth: maxZ - minZ
        });

        URL.revokeObjectURL(fileUrl);
      },
      undefined,
      (_scene, message, exception) => {
        console.error('[WorldEditor] Model load error:', message, exception);
        URL.revokeObjectURL(fileUrl);
        alert(`Failed to load ${ext.toUpperCase()} file: ${message}`);
      },
      pluginExtension
    );

    e.target.value = '';
  };

  // Render step indicator
  const renderStepIndicator = () => (
    <div className={styles.stepIndicator}>
      <div
        className={`${styles.step} ${currentStep >= 1 ? styles.active : ''} ${currentStep > 1 ? styles.completed : ''}`}
        onClick={() => currentStep > 1 && setCurrentStep(1)}
      >
        <span className={styles.stepNumber}>1</span>
        <span className={styles.stepLabel}>Area Selection</span>
      </div>
      <div className={styles.stepConnector} />
      <div
        className={`${styles.step} ${currentStep >= 2 ? styles.active : ''} ${currentStep > 2 ? styles.completed : ''}`}
        onClick={() => currentStep > 2 && setCurrentStep(2)}
      >
        <span className={styles.stepNumber}>2</span>
        <span className={styles.stepLabel}>Explore in 3D</span>
      </div>
      <div className={styles.stepConnector} />
      <div
        className={`${styles.step} ${currentStep >= 3 ? styles.active : ''}`}
      >
        <span className={styles.stepNumber}>3</span>
        <span className={styles.stepLabel}>Share & Download</span>
      </div>
    </div>
  );

  // Render STEP 1: Area Selection
  const renderStep1 = () => (
    <div className={styles.step1Container}>
      {/* Map container for MapLibre GL */}
      <div ref={mapContainerRef} className={styles.mapContainer}>
        {/* MapLibre GL will be initialized here */}
        <div className={styles.mapPlaceholder}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <ellipse cx="12" cy="12" rx="10" ry="4" />
          </svg>
          <h3>Select Area on Map</h3>
          <p>Draw a rectangle to select the area you want to convert to 3D</p>
          <button
            className={styles.demoBtn}
            onClick={() => handleAreaSelect({
              minLat: 37.566,
              minLng: 126.978,
              maxLat: 37.570,
              maxLng: 126.984,
              name: 'Seoul City Hall Area'
            })}
          >
            Use Demo Area (Seoul)
          </button>
        </div>
      </div>

      {/* Area info panel */}
      {worldConfig.area && (
        <div className={styles.areaInfoPanel}>
          <h4>Selected Area</h4>
          <div className={styles.areaInfo}>
            <p><strong>Name:</strong> {worldConfig.area.name || 'Custom Area'}</p>
            <p><strong>Bounds:</strong></p>
            <p className={styles.coords}>
              SW: {worldConfig.area.minLat.toFixed(4)}, {worldConfig.area.minLng.toFixed(4)}<br />
              NE: {worldConfig.area.maxLat.toFixed(4)}, {worldConfig.area.maxLng.toFixed(4)}
            </p>
          </div>
          <button className={styles.primaryBtn} onClick={handleNextStep}>
            <span>View in 3D</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );

  // Render STEP 2: 3D Explore & Customize
  const renderStep2 = () => (
    <div className={styles.step2Container}>
      {/* Left Panel - Tools (hidden in play mode) */}
      {leftPanelOpen && !playMode && (
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h3>World Tools</h3>
            <button
              className={styles.panelCloseBtn}
              onClick={() => setLeftPanelOpen(false)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>

          <div className={styles.panelContent}>
            {/* Terrain Section */}
            <div className={styles.toolSection}>
              <h4>Terrain</h4>
              <div className={styles.toggleRow}>
                <span>Enable Terrain</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={worldConfig.terrain.enabled}
                    onChange={(e) => setWorldConfig(prev => ({
                      ...prev,
                      terrain: { ...prev.terrain, enabled: e.target.checked }
                    }))}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              <div className={styles.sliderRow}>
                <label>Vertical Scale: {worldConfig.terrain.verticalExaggeration.toFixed(1)}x</label>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.1"
                  value={worldConfig.terrain.verticalExaggeration}
                  onChange={(e) => setWorldConfig(prev => ({
                    ...prev,
                    terrain: { ...prev.terrain, verticalExaggeration: parseFloat(e.target.value) }
                  }))}
                />
              </div>

              <div className={styles.toolGrid}>
                {(['raise', 'lower', 'smooth', 'flatten', 'paint', 'erode'] as TerrainTool[]).map(tool => (
                  <button
                    key={tool}
                    className={`${styles.toolBtn} ${terrainTool === tool && activeTool === 'terrain' ? styles.active : ''}`}
                    onClick={() => {
                      setActiveTool('terrain');
                      setTerrainTool(tool);
                    }}
                    title={tool.charAt(0).toUpperCase() + tool.slice(1)}
                  >
                    {tool === 'raise' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    )}
                    {tool === 'lower' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12l7 7 7-7" />
                      </svg>
                    )}
                    {tool === 'smooth' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 12c0-3 2-6 5-6s4 3 5 6 2 6 5 6 5-3 5-6" />
                      </svg>
                    )}
                    {tool === 'flatten' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="10" width="18" height="4" />
                      </svg>
                    )}
                    {tool === 'paint' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
                        <path d="M3 9h18M9 21V9" />
                      </svg>
                    )}
                    {tool === 'erode' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14,2 14,8 20,8" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                    )}
                    <span>{tool}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Buildings Section */}
            <div className={styles.toolSection}>
              <h4>Buildings</h4>
              <div className={styles.toggleRow}>
                <span>Show Buildings</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={worldConfig.buildings.enabled}
                    onChange={(e) => setWorldConfig(prev => ({
                      ...prev,
                      buildings: { ...prev.buildings, enabled: e.target.checked }
                    }))}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              <div className={styles.selectRow}>
                <label>Detail Level</label>
                <select
                  value={worldConfig.buildings.lod}
                  onChange={(e) => setWorldConfig(prev => ({
                    ...prev,
                    buildings: { ...prev.buildings, lod: e.target.value as 'low' | 'medium' | 'high' }
                  }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className={styles.selectRow}>
                <label>Color Mode</label>
                <select
                  value={worldConfig.buildings.colorMode}
                  onChange={(e) => setWorldConfig(prev => ({
                    ...prev,
                    buildings: { ...prev.buildings, colorMode: e.target.value as 'uniform' | 'height' | 'satellite' }
                  }))}
                >
                  <option value="uniform">Uniform</option>
                  <option value="height">By Height</option>
                  <option value="satellite">Satellite</option>
                </select>
              </div>
            </div>

            {/* Roads Section */}
            <div className={styles.toolSection}>
              <h4>Roads</h4>
              <button
                className={`${styles.toolBtnFull} ${activeTool === 'road' ? styles.active : ''}`}
                onClick={() => setActiveTool('road')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19l4-14h8l4 14" />
                  <path d="M9 19h6" />
                  <path d="M8 12h8" />
                  <path d="M10 5h4" />
                </svg>
                <span>Draw Road</span>
              </button>

              {activeTool === 'road' && (
                <>
                  <div className={styles.sliderRow}>
                    <label>Road Width: {roadWidth}m</label>
                    <input
                      type="range"
                      min="2"
                      max="30"
                      step="1"
                      value={roadWidth}
                      onChange={(e) => setRoadWidth(parseInt(e.target.value))}
                    />
                  </div>
                  <div className={styles.helperText}>
                    Click to add points. Double-click or ESC to finish.<br />
                    Backspace removes last point. +/- adjusts width.
                  </div>
                  {roadDrawing.waypoints.length > 0 && (
                    <div className={styles.roadStatus}>
                      {roadDrawing.waypoints.length} point{roadDrawing.waypoints.length > 1 ? 's' : ''} placed
                      <button
                        className={styles.smallBtn}
                        onClick={cancelRoadDrawing}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Mesh Options Section */}
            <div className={styles.toolSection}>
              <h4>Mesh Options</h4>
              <div className={styles.toggleRow}>
                <span>Hollow Out</span>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={worldConfig.mesh.hollow}
                    onChange={(e) => setWorldConfig(prev => ({
                      ...prev,
                      mesh: { ...prev.mesh, hollow: e.target.checked }
                    }))}
                  />
                  <span className={styles.toggleSlider} />
                </label>
              </div>

              {worldConfig.mesh.hollow && (
                <div className={styles.sliderRow}>
                  <label>Wall Thickness: {worldConfig.mesh.thickness}mm</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={worldConfig.mesh.thickness}
                    onChange={(e) => setWorldConfig(prev => ({
                      ...prev,
                      mesh: { ...prev.mesh, thickness: parseFloat(e.target.value) }
                    }))}
                  />
                </div>
              )}

              <div className={styles.sliderRow}>
                <label>Base Height: {worldConfig.mesh.baseHeight}mm</label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={worldConfig.mesh.baseHeight}
                  onChange={(e) => setWorldConfig(prev => ({
                    ...prev,
                    mesh: { ...prev.mesh, baseHeight: parseFloat(e.target.value) }
                  }))}
                />
              </div>
            </div>

            {/* Import Model Section */}
            <div className={styles.toolSection}>
              <h4>Import Model</h4>
              <label className={styles.toolBtnFull} style={{ cursor: 'pointer' }}>
                <input
                  type="file"
                  accept=".glb,.gltf,.obj,.fbx"
                  style={{ display: 'none' }}
                  onChange={handleModelFileImport}
                />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17,8 12,3 7,8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Import 3D Model</span>
              </label>
              <div className={styles.helperText}>
                GLB, GLTF, OBJ 지원<br />
                FBX는 GLB로 변환 필요
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 3D Canvas Area */}
      <div className={styles.canvasArea}>
        <canvas ref={canvas3DRef} className={styles.canvas3D} />

        {/* Area name overlay - hidden until map loading is implemented */}
        {/* {worldConfig.area && (
          <div className={styles.areaNameOverlay}>
            {worldConfig.area.name || 'Selected Area'}
          </div>
        )} */}

        {/* Toolbar (hidden in play mode) */}
        {!playMode && <div className={styles.editorToolbar}>
          <button
            className={`${styles.toolbarBtn} ${activeTool === 'select' ? styles.active : ''}`}
            onClick={() => setActiveTool('select')}
            title="Select (Q)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
          </button>
          <button
            className={`${styles.toolbarBtn} ${activeTool === 'move' ? styles.active : ''}`}
            onClick={() => setActiveTool('move')}
            title="Move (W)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
          </button>
          <button
            className={`${styles.toolbarBtn} ${activeTool === 'rotate' ? styles.active : ''}`}
            onClick={() => setActiveTool('rotate')}
            title="Rotate (E)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38" />
            </svg>
          </button>
          <button
            className={`${styles.toolbarBtn} ${activeTool === 'scale' ? styles.active : ''}`}
            onClick={() => setActiveTool('scale')}
            title="Scale (R)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 21l-6-6m6 6v-4.8m0 4.8h-4.8" />
              <path d="M3 16.2V21m0 0h4.8M3 21l6-6" />
              <path d="M21 7.8V3m0 0h-4.8M21 3l-6 6" />
              <path d="M3 7.8V3m0 0h4.8M3 3l6 6" />
            </svg>
          </button>
          <div className={styles.toolbarDivider} />
          <button
            className={`${styles.toolbarBtn} ${activeTool === 'terrain' ? styles.active : ''}`}
            onClick={() => setActiveTool('terrain')}
            title="Terrain Tools (T)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 17l4-4 4 4 4-6 6 6" />
              <path d="M3 21h18" />
            </svg>
          </button>
          <button
            className={`${styles.toolbarBtn} ${activeTool === 'place' ? styles.active : ''}`}
            onClick={() => setActiveTool('place')}
            title="Place Object (P)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        </div>}

        {/* Sun Settings Button (edit mode only - bottom right) */}
        {!playMode && (
          <div className={styles.bottomRightControls}>
            <button
              className={`${styles.sunSettingsBtn} ${sunPanelOpen ? styles.active : ''}`}
              onClick={() => setSunPanelOpen(!sunPanelOpen)}
              title="태양 설정"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            </button>
          </div>
        )}

        {/* View Mode Toggle (play mode only - top center) */}
        {playMode && (
          <div className={styles.playModeControls}>
            <div className={styles.viewModeToggle}>
              <button
                className={`${styles.viewModeBtn} ${viewMode === 'first-person' ? styles.active : ''}`}
                onClick={() => setViewMode('first-person')}
                title="1인칭 뷰"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                </svg>
                <span>1인칭</span>
              </button>
              <button
                className={`${styles.viewModeBtn} ${viewMode === 'third-person' ? styles.active : ''}`}
                onClick={() => setViewMode('third-person')}
                title="3인칭 뷰"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                </svg>
                <span>3인칭</span>
              </button>
              <button
                className={`${styles.viewModeBtn} ${viewMode === 'iso' ? styles.active : ''}`}
                onClick={() => setViewMode('iso')}
                title="ISO 뷰"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <span>ISO</span>
              </button>
            </div>
          </div>
        )}

        {/* Sun Settings Panel */}
        {sunPanelOpen && !playMode && (
          <div
            className={styles.sunPanelBottom}
            data-theme={themeMode}
            style={{ '--theme-color': themeColor } as React.CSSProperties}
          >
            <div className={styles.sunPanelHeader}>
              <span>Sun Settings</span>
              <button onClick={() => setSunPanelOpen(false)} className={styles.sunPanelCloseBtn}>×</button>
            </div>
            <div className={styles.sunPanelBody}>
              {/* Month */}
              <div className={styles.sunControlGroup}>
                <label>월 (Month)</label>
                <div className={styles.sunControlInput}>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={sunSettings.month}
                    onChange={(e) => setSunSettings({ ...sunSettings, month: parseInt(e.target.value) })}
                    className={styles.sunRangeSlider}
                  />
                  <span className={styles.sunValueDisplay}>{sunSettings.month}월</span>
                </div>
              </div>

              {/* Hour */}
              <div className={styles.sunControlGroup}>
                <label>시간 (Time)</label>
                <div className={styles.sunControlInput}>
                  <input
                    type="range"
                    min="5"
                    max="20"
                    step="0.5"
                    value={sunSettings.hour}
                    onChange={(e) => setSunSettings({ ...sunSettings, hour: parseFloat(e.target.value) })}
                    className={styles.sunRangeSlider}
                  />
                  <span className={styles.sunValueDisplay}>
                    {Math.floor(sunSettings.hour)}:{String(Math.round((sunSettings.hour % 1) * 60)).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* Intensity */}
              <div className={styles.sunControlGroup}>
                <label>강도 (Intensity)</label>
                <div className={styles.sunControlInput}>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.1"
                    value={sunSettings.intensity}
                    onChange={(e) => setSunSettings({ ...sunSettings, intensity: parseFloat(e.target.value) })}
                    className={styles.sunRangeSlider}
                  />
                  <span className={styles.sunValueDisplay}>{sunSettings.intensity.toFixed(1)}</span>
                </div>
              </div>

              {/* Azimuth */}
              <div className={styles.sunControlGroup}>
                <label>방위각 (Azimuth)</label>
                <div className={styles.sunControlInput}>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={sunSettings.azimuth}
                    onChange={(e) => setSunSettings({ ...sunSettings, azimuth: parseInt(e.target.value) })}
                    className={styles.sunRangeSlider}
                  />
                  <span className={styles.sunValueDisplay}>{sunSettings.azimuth}°</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Hierarchy & Properties (hidden in play mode) */}
      {rightPanelOpen && !playMode && (
        <div className={styles.rightPanel}>
          <div className={styles.rightPanelTabs}>
            <button
              className={`${styles.tabBtn} ${rightPanelTab === 'hierarchy' ? styles.active : ''}`}
              onClick={() => setRightPanelTab('hierarchy')}
            >
              Hierarchy
            </button>
            <button
              className={`${styles.tabBtn} ${rightPanelTab === 'properties' ? styles.active : ''}`}
              onClick={() => setRightPanelTab('properties')}
            >
              Properties
            </button>
            <button
              className={`${styles.tabBtn} ${rightPanelTab === 'layers' ? styles.active : ''}`}
              onClick={() => setRightPanelTab('layers')}
            >
              Layers
            </button>
          </div>

          <div className={styles.rightPanelContent}>
            {rightPanelTab === 'hierarchy' && (
              <div className={styles.objectList}>
                {/* Selection toolbar */}
                {worldObjects.length > 0 && (
                  <div className={styles.selectionToolbar}>
                    <button
                      className={styles.selectAllBtn}
                      onClick={() => {
                        // Select all
                        const allIds = new Set(worldObjects.map(o => o.id));
                        setSelectedObjectIds(allIds);

                        // Clear and rebuild selectedMeshesRef for multi-selection gizmo
                        selectedMeshesRef.current.clear();

                        // Highlight all meshes and add to selectedMeshesRef
                        const themeColorHex = themeColor || '#10b981';
                        const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                        const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                        const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;

                        let firstMesh: AbstractMesh | null = null;
                        allIds.forEach(id => {
                          const mesh = loadedAssetsRef.current.get(id);
                          if (mesh) {
                            // Add to selectedMeshesRef for gizmo multi-move
                            selectedMeshesRef.current.add(mesh);

                            // Highlight
                            if (highlightLayerRef.current) {
                              highlightLayerRef.current.addMesh(mesh as Mesh, new Color3(r, g, b));
                            }

                            // Track first mesh for gizmo attachment
                            if (!firstMesh) {
                              firstMesh = mesh;
                            }
                          }
                        });

                        // Attach gizmo to first mesh (others will follow via onDrag)
                        if (firstMesh && gizmoManagerRef.current) {
                          selectedMeshRef.current = firstMesh;
                          gizmoManagerRef.current.attachToMesh(firstMesh);
                        }
                      }}
                    >
                      전체 선택
                    </button>
                    <button
                      className={styles.selectNoneBtn}
                      onClick={() => {
                        // Deselect all
                        setSelectedObjectIds(new Set());
                        setLastSelectedId(null);

                        // Clear multi-selection ref
                        selectedMeshesRef.current.clear();

                        // Remove all highlights
                        if (highlightLayerRef.current) {
                          worldObjects.forEach(obj => {
                            const mesh = loadedAssetsRef.current.get(obj.id);
                            if (mesh) {
                              highlightLayerRef.current!.removeMesh(mesh as Mesh);
                            }
                          });
                        }
                        gizmoManagerRef.current?.attachToMesh(null);
                        selectedMeshRef.current = null;
                      }}
                    >
                      선택 해제
                    </button>
                    <span className={styles.selectionCount}>
                      {selectedObjectIds.size > 0 && `${selectedObjectIds.size}개 선택`}
                    </span>
                  </div>
                )}
                {worldObjects.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                    <p>No objects in scene</p>
                  </div>
                ) : (
                  worldObjects.map((obj, index) => (
                    <div
                      key={obj.id}
                      className={`${styles.objectItem} ${selectedObjectIds.has(obj.id) ? styles.selected : ''}`}
                      onClick={(e) => {
                        const themeColorHex = themeColor || '#10b981';
                        const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                        const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                        const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;
                        const highlightColor = new Color3(r, g, b);

                        if (e.shiftKey && lastSelectedId) {
                          // Shift+click: Range select
                          const lastIndex = worldObjects.findIndex(o => o.id === lastSelectedId);
                          const currentIndex = index;
                          const start = Math.min(lastIndex, currentIndex);
                          const end = Math.max(lastIndex, currentIndex);
                          const rangeIds = worldObjects.slice(start, end + 1).map(o => o.id);

                          setSelectedObjectIds(prev => {
                            const newSet = new Set(prev);
                            rangeIds.forEach(id => newSet.add(id));
                            return newSet;
                          });

                          // Highlight range
                          if (highlightLayerRef.current) {
                            rangeIds.forEach(id => {
                              const mesh = loadedAssetsRef.current.get(id);
                              if (mesh) {
                                highlightLayerRef.current!.addMesh(mesh as Mesh, highlightColor);
                              }
                            });
                          }
                        } else if (e.ctrlKey || e.metaKey) {
                          // Ctrl+click: Toggle individual selection
                          setSelectedObjectIds(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(obj.id)) {
                              newSet.delete(obj.id);
                              // Remove highlight
                              const mesh = loadedAssetsRef.current.get(obj.id);
                              if (mesh && highlightLayerRef.current) {
                                highlightLayerRef.current.removeMesh(mesh as Mesh);
                              }
                            } else {
                              newSet.add(obj.id);
                              // Add highlight
                              const mesh = loadedAssetsRef.current.get(obj.id);
                              if (mesh && highlightLayerRef.current) {
                                highlightLayerRef.current.addMesh(mesh as Mesh, highlightColor);
                              }
                            }
                            return newSet;
                          });
                          setLastSelectedId(obj.id);
                        } else {
                          // Normal click: Single select (clear others)
                          // Clear all highlights first
                          if (highlightLayerRef.current) {
                            selectedObjectIds.forEach(id => {
                              const mesh = loadedAssetsRef.current.get(id);
                              if (mesh) {
                                highlightLayerRef.current!.removeMesh(mesh as Mesh);
                              }
                            });
                          }

                          setSelectedObjectIds(new Set([obj.id]));
                          setLastSelectedId(obj.id);

                          // Select mesh in 3D scene
                          const mesh = loadedAssetsRef.current.get(obj.id);
                          if (mesh && gizmoManagerRef.current && highlightLayerRef.current) {
                            selectedMeshRef.current = mesh;
                            gizmoManagerRef.current.attachToMesh(mesh);
                            highlightLayerRef.current.addMesh(mesh as Mesh, highlightColor);
                          }
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedObjectIds.has(obj.id)}
                        onChange={() => {}}
                        onClick={(e) => e.stopPropagation()}
                        className={styles.objectCheckbox}
                      />
                      <div className={styles.objectIcon}>
                        {obj.type === 'terrain' && '🏔'}
                        {obj.type === 'building' && '🏢'}
                        {obj.type === 'road' && '🛣'}
                        {obj.type === 'vegetation' && '🌳'}
                        {obj.type === 'water' && '💧'}
                        {obj.type === 'custom' && '📦'}
                      </div>
                      <div className={styles.objectInfo}>
                        <p className={styles.objectName}>{obj.name}</p>
                        <p className={styles.objectType}>{obj.type}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {rightPanelTab === 'properties' && (
              <div className={styles.propertiesPanel}>
                {selectedObjectIds.size > 0 ? (
                  <div className={styles.propertyGroup}>
                    <h4>Transform</h4>
                    <div className={styles.propertyRow}>
                      <span className={styles.propertyLabel}>Position</span>
                      <input type="number" className={styles.propertyInput} placeholder="X" />
                      <input type="number" className={styles.propertyInput} placeholder="Y" />
                      <input type="number" className={styles.propertyInput} placeholder="Z" />
                    </div>
                    <div className={styles.propertyRow}>
                      <span className={styles.propertyLabel}>Rotation</span>
                      <input type="number" className={styles.propertyInput} placeholder="X" />
                      <input type="number" className={styles.propertyInput} placeholder="Y" />
                      <input type="number" className={styles.propertyInput} placeholder="Z" />
                    </div>
                    <div className={styles.propertyRow}>
                      <span className={styles.propertyLabel}>Scale</span>
                      <input type="number" className={styles.propertyInput} placeholder="X" />
                      <input type="number" className={styles.propertyInput} placeholder="Y" />
                      <input type="number" className={styles.propertyInput} placeholder="Z" />
                    </div>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <p>Select an object to view properties</p>
                  </div>
                )}
              </div>
            )}

            {rightPanelTab === 'layers' && (
              <div className={styles.layersPanel}>
                {/* Selection toolbar for layers */}
                {worldObjects.length > 0 && (
                  <div className={styles.selectionToolbar}>
                    <button
                      className={styles.selectAllBtn}
                      onClick={() => {
                        // 부모(그룹) 객체만 선택 - 자식은 제외
                        const rootObjects = worldObjects.filter(o => !o.parentId);
                        const rootIds = new Set(rootObjects.map(o => o.id));
                        setSelectedObjectIds(rootIds);

                        // Clear and rebuild selectedMeshesRef for multi-selection gizmo
                        selectedMeshesRef.current.clear();

                        // 기존 하이라이트 제거
                        if (highlightLayerRef.current) {
                          worldObjects.forEach(obj => {
                            const mesh = loadedAssetsRef.current.get(obj.id);
                            if (mesh) highlightLayerRef.current!.removeMesh(mesh as Mesh);
                          });
                        }

                        // 부모 객체들만 하이라이트 & selectedMeshesRef에 추가
                        const themeColorHex = themeColor || '#10b981';
                        const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                        const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                        const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;

                        let firstMesh: AbstractMesh | null = null;
                        rootIds.forEach(id => {
                          const mesh = loadedAssetsRef.current.get(id);
                          if (mesh) {
                            // Add to selectedMeshesRef for gizmo multi-move
                            selectedMeshesRef.current.add(mesh);

                            // Highlight
                            if (highlightLayerRef.current) {
                              highlightLayerRef.current.addMesh(mesh as Mesh, new Color3(r, g, b));
                            }

                            // Track first mesh for gizmo attachment
                            if (!firstMesh) {
                              firstMesh = mesh;
                            }
                          }
                        });

                        // Attach gizmo to first mesh (others will follow via onDrag)
                        if (firstMesh && gizmoManagerRef.current) {
                          selectedMeshRef.current = firstMesh;
                          gizmoManagerRef.current.attachToMesh(firstMesh);
                        }
                      }}
                    >
                      전체 선택
                    </button>
                    <button
                      className={styles.selectNoneBtn}
                      onClick={() => {
                        // Clear multi-selection ref
                        selectedMeshesRef.current.clear();

                        if (highlightLayerRef.current) {
                          worldObjects.forEach(obj => {
                            const mesh = loadedAssetsRef.current.get(obj.id);
                            if (mesh) highlightLayerRef.current!.removeMesh(mesh as Mesh);
                          });
                        }
                        setSelectedObjectIds(new Set());
                        selectedMeshRef.current = null;
                        gizmoManagerRef.current?.attachToMesh(null);
                      }}
                    >
                      선택 해제
                    </button>
                    {/* 그룹 버튼 - 2개 이상 선택 시 */}
                    {selectedObjectIds.size >= 2 && (
                      <button
                        className={styles.groupBtn}
                        onClick={() => {
                          // 선택된 객체들을 새 그룹으로 묶기
                          const groupId = `group_${Date.now()}`;
                          const selectedObjs = worldObjects.filter(o => selectedObjectIds.has(o.id));

                          // 새 그룹 생성
                          const newGroup: WorldObject = {
                            id: groupId,
                            name: `Group_${worldObjects.filter(o => o.type === 'group').length + 1}`,
                            type: 'group',
                            position: { x: 0, y: 0, z: 0 },
                            rotation: { x: 0, y: 0, z: 0 },
                            scale: { x: 1, y: 1, z: 1 },
                            visible: true,
                            locked: false,
                            expanded: true,
                            children: selectedObjs.map(o => o.id),
                          };

                          // 선택된 객체들의 parentId를 새 그룹으로 설정
                          setWorldObjects(prev => [
                            newGroup,
                            ...prev.map(o =>
                              selectedObjectIds.has(o.id) ? { ...o, parentId: groupId } : o
                            )
                          ]);

                          // 그룹 선택
                          setSelectedObjectIds(new Set([groupId]));
                        }}
                        title="그룹 만들기 (선택된 객체들)"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        그룹
                      </button>
                    )}
                    {/* 그룹 해제 버튼 - 그룹이 선택된 경우 */}
                    {selectedObjectIds.size === 1 && (() => {
                      const selectedId = Array.from(selectedObjectIds)[0];
                      const selectedObj = worldObjects.find(o => o.id === selectedId);
                      return selectedObj?.type === 'group';
                    })() && (
                      <button
                        className={styles.ungroupBtn}
                        onClick={() => {
                          const selectedId = Array.from(selectedObjectIds)[0];
                          const children = worldObjects.filter(o => o.parentId === selectedId);

                          // 자식들의 parentId 제거하고 그룹 삭제
                          setWorldObjects(prev => prev
                            .filter(o => o.id !== selectedId) // 그룹 삭제
                            .map(o => o.parentId === selectedId ? { ...o, parentId: undefined } : o) // 자식들 독립
                          );

                          // 자식들 선택
                          setSelectedObjectIds(new Set(children.map(c => c.id)));
                        }}
                        title="그룹 해제"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                          <line x1="9" y1="14" x2="15" y2="14"/>
                        </svg>
                        해제
                      </button>
                    )}
                    <span className={styles.selectionCount}>
                      {selectedObjectIds.size > 0 && `${selectedObjectIds.size}개 선택`}
                    </span>
                  </div>
                )}

                {/* Layer list - Figma style with hierarchy */}
                {worldObjects.length === 0 ? (
                  <div className={styles.emptyState}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <p>레이어 없음</p>
                    <p style={{ fontSize: '11px', opacity: 0.6 }}>Import Model로 GLB를 불러오세요</p>
                  </div>
                ) : (
                  <div className={styles.layerList}>
                    {/* Render parent objects first, then children indented */}
                    {worldObjects
                      .filter(obj => !obj.parentId) // Root level objects
                      .map((obj, index) => {
                        const children = worldObjects.filter(child => child.parentId === obj.id);
                        const isGroup = obj.type === 'group' && children.length > 0;

                        return (
                          <div key={obj.id}>
                            {/* Parent/Root item */}
                            <div
                              className={`${styles.layerItem} ${selectedObjectIds.has(obj.id) ? styles.selected : ''} ${obj.locked ? styles.locked : ''}`}
                              onClick={() => {
                                // 잠긴 객체는 선택 불가
                                if (obj.locked) return;

                                const themeColorHex = themeColor || '#10b981';
                                const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                                const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                                const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;
                                const highlightColor = new Color3(r, g, b);
                                const mesh = loadedAssetsRef.current.get(obj.id);

                                // Toggle: 이미 선택되어 있으면 해제, 아니면 선택
                                if (selectedObjectIds.has(obj.id)) {
                                  // 해제
                                  setSelectedObjectIds(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(obj.id);
                                    return newSet;
                                  });
                                  if (mesh && highlightLayerRef.current) {
                                    highlightLayerRef.current.removeMesh(mesh as Mesh);
                                  }
                                  if (selectedMeshRef.current === mesh) {
                                    selectedMeshRef.current = null;
                                    gizmoManagerRef.current?.attachToMesh(null);
                                  }
                                } else {
                                  // 선택
                                  setSelectedObjectIds(new Set([obj.id]));
                                  // 기존 하이라이트 제거
                                  if (highlightLayerRef.current) {
                                    selectedObjectIds.forEach(id => {
                                      const m = loadedAssetsRef.current.get(id);
                                      if (m) highlightLayerRef.current!.removeMesh(m as Mesh);
                                    });
                                  }
                                  if (mesh) {
                                    selectedMeshRef.current = mesh;
                                    gizmoManagerRef.current?.attachToMesh(mesh);
                                    if (highlightLayerRef.current) {
                                      highlightLayerRef.current.addMesh(mesh as Mesh, highlightColor);
                                    }
                                  }
                                }
                              }}
                            >
                              {/* Expand/Collapse 버튼 - 자식이 있는 경우만 */}
                              {children.length > 0 ? (
                                <button
                                  className={styles.expandBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWorldObjects(prev => prev.map(o =>
                                      o.id === obj.id ? { ...o, expanded: !o.expanded } : o
                                    ));
                                  }}
                                  title={obj.expanded !== false ? '접기' : '펼치기'}
                                >
                                  {obj.expanded !== false ? '▼' : '▶'}
                                </button>
                              ) : (
                                <span className={styles.expandPlaceholder} />
                              )}
                              <input
                                type="checkbox"
                                checked={selectedObjectIds.has(obj.id)}
                                onChange={(e) => {
                                  // 잠긴 객체는 선택 불가
                                  if (obj.locked) return;

                                  const themeColorHex = themeColor || '#10b981';
                                  const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                                  const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                                  const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;
                                  const highlightColor = new Color3(r, g, b);

                                  // 부모 + 자식들 ID 목록
                                  const allIds = [obj.id, ...children.filter(c => !c.locked).map(c => c.id)];

                                  if (e.target.checked) {
                                    // 부모 + 자식 전부 선택
                                    setSelectedObjectIds(prev => {
                                      const newSet = new Set(prev);
                                      allIds.forEach(id => newSet.add(id));
                                      return newSet;
                                    });
                                    // 하이라이트 추가 + selectedMeshesRef 설정
                                    selectedMeshesRef.current.clear();
                                    let firstMesh: AbstractMesh | null = null;
                                    allIds.forEach(id => {
                                      const mesh = loadedAssetsRef.current.get(id);
                                      if (mesh) {
                                        selectedMeshesRef.current.add(mesh);
                                        if (!firstMesh) firstMesh = mesh;
                                        if (highlightLayerRef.current) {
                                          highlightLayerRef.current.addMesh(mesh as Mesh, highlightColor);
                                        }
                                      }
                                    });
                                    // 첫 번째 메시에 기즈모 attach
                                    if (firstMesh) {
                                      selectedMeshRef.current = firstMesh;
                                      gizmoManagerRef.current?.attachToMesh(firstMesh);
                                    }
                                  } else {
                                    // 부모 + 자식 전부 해제
                                    setSelectedObjectIds(prev => {
                                      const newSet = new Set(prev);
                                      allIds.forEach(id => newSet.delete(id));
                                      return newSet;
                                    });
                                    // 하이라이트 제거 + selectedMeshesRef 정리
                                    allIds.forEach(id => {
                                      const mesh = loadedAssetsRef.current.get(id);
                                      if (mesh) {
                                        selectedMeshesRef.current.delete(mesh);
                                        if (highlightLayerRef.current) {
                                          highlightLayerRef.current.removeMesh(mesh as Mesh);
                                        }
                                      }
                                    });
                                    selectedMeshRef.current = null;
                                    gizmoManagerRef.current?.attachToMesh(null);
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={styles.layerCheckbox}
                                disabled={obj.locked}
                              />
                              <button
                                className={styles.visibilityBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const mesh = loadedAssetsRef.current.get(obj.id);
                                  if (mesh) {
                                    mesh.setEnabled(!mesh.isEnabled());
                                    setWorldObjects(prev => prev.map(o =>
                                      o.id === obj.id ? { ...o, visible: mesh.isEnabled() } : o
                                    ));
                                  }
                                }}
                                title={obj.visible ? '숨기기' : '보이기'}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  {obj.visible ? (
                                    <>
                                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                      <circle cx="12" cy="12" r="3"/>
                                    </>
                                  ) : (
                                    <>
                                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                      <line x1="1" y1="1" x2="23" y2="23"/>
                                    </>
                                  )}
                                </svg>
                              </button>
                              {/* Lock 버튼 */}
                              <button
                                className={styles.lockBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newLocked = !obj.locked;
                                  setWorldObjects(prev => prev.map(o =>
                                    o.id === obj.id ? { ...o, locked: newLocked } : o
                                  ));
                                  // 잠금 시 선택 해제
                                  if (newLocked && selectedObjectIds.has(obj.id)) {
                                    setSelectedObjectIds(prev => {
                                      const newSet = new Set(prev);
                                      newSet.delete(obj.id);
                                      return newSet;
                                    });
                                    const mesh = loadedAssetsRef.current.get(obj.id);
                                    if (mesh && highlightLayerRef.current) {
                                      highlightLayerRef.current.removeMesh(mesh as Mesh);
                                    }
                                    if (selectedMeshRef.current === loadedAssetsRef.current.get(obj.id)) {
                                      selectedMeshRef.current = null;
                                      gizmoManagerRef.current?.attachToMesh(null);
                                    }
                                  }
                                }}
                                title={obj.locked ? '잠금 해제' : '잠금'}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  {obj.locked ? (
                                    <>
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                    </>
                                  ) : (
                                    <>
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                      <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                                    </>
                                  )}
                                </svg>
                              </button>
                              <span className={styles.layerIcon}>
                                {isGroup && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                  </svg>
                                )}
                                {obj.type === 'terrain' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8 3l4 8 5-5 5 15H2L8 3z"/>
                                  </svg>
                                )}
                                {obj.type === 'building' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
                                    <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01"/>
                                  </svg>
                                )}
                                {obj.type === 'road' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 19L8 5h8l4 14"/>
                                    <path d="M12 5v14"/>
                                  </svg>
                                )}
                                {obj.type === 'vegetation' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 22V8"/>
                                    <path d="M5 12s2.5-5 7-5 7 5 7 5"/>
                                    <path d="M5 18s2.5-5 7-5 7 5 7 5"/>
                                  </svg>
                                )}
                                {obj.type === 'water' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2 12c2-2 4-4 6-4s4 2 6 4 4 4 6 4 4-2 6-4"/>
                                    <path d="M2 6c2-2 4-4 6-4s4 2 6 4 4 4 6 4 4-2 6-4"/>
                                    <path d="M2 18c2-2 4-4 6-4s4 2 6 4 4 4 6 4 4-2 6-4"/>
                                  </svg>
                                )}
                                {obj.type === 'custom' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                                  </svg>
                                )}
                                {obj.type === 'mesh' && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                                    <polyline points="2 17 12 22 22 17"/>
                                    <polyline points="2 12 12 17 22 12"/>
                                  </svg>
                                )}
                              </span>
                              <span className={styles.layerName}>
                                {obj.name}
                                {isGroup && <span style={{ opacity: 0.5, marginLeft: 4, fontSize: '10px' }}>({children.length})</span>}
                              </span>
                              <button
                                className={styles.deleteBtn}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // 잠긴 객체는 삭제 불가
                                  if (obj.locked) return;
                                  // Delete parent and all children
                                  const idsToDelete = [obj.id, ...children.map(c => c.id)];
                                  idsToDelete.forEach(id => {
                                    const mesh = loadedAssetsRef.current.get(id);
                                    if (mesh) {
                                      if (highlightLayerRef.current) highlightLayerRef.current.removeMesh(mesh as Mesh);
                                      mesh.dispose();
                                      loadedAssetsRef.current.delete(id);
                                    }
                                  });
                                  setWorldObjects(prev => prev.filter(o => !idsToDelete.includes(o.id)));
                                  setSelectedObjectIds(prev => {
                                    const newSet = new Set(prev);
                                    idsToDelete.forEach(id => newSet.delete(id));
                                    return newSet;
                                  });
                                  gizmoManagerRef.current?.attachToMesh(null);
                                }}
                                title="삭제"
                                disabled={obj.locked}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                              </button>
                            </div>

                            {/* Child items - indented (펼쳐진 경우만 표시) */}
                            {obj.expanded !== false && children.map(child => (
                              <div
                                key={child.id}
                                className={`${styles.layerItem} ${styles.childItem} ${selectedObjectIds.has(child.id) ? styles.selected : ''} ${child.locked ? styles.locked : ''}`}
                                style={{ paddingLeft: '32px' }}
                                onClick={() => {
                                  // 잠긴 객체는 선택 불가
                                  if (child.locked) return;

                                  const themeColorHex = themeColor || '#10b981';
                                  const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                                  const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                                  const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;
                                  const highlightColor = new Color3(r, g, b);
                                  const mesh = loadedAssetsRef.current.get(child.id);

                                  // Toggle: 이미 선택되어 있으면 해제, 아니면 선택
                                  if (selectedObjectIds.has(child.id)) {
                                    // 해제
                                    setSelectedObjectIds(prev => {
                                      const newSet = new Set(prev);
                                      newSet.delete(child.id);
                                      return newSet;
                                    });
                                    if (mesh && highlightLayerRef.current) {
                                      highlightLayerRef.current.removeMesh(mesh as Mesh);
                                    }
                                    if (selectedMeshRef.current === mesh) {
                                      selectedMeshRef.current = null;
                                      gizmoManagerRef.current?.attachToMesh(null);
                                    }
                                  } else {
                                    // 선택
                                    setSelectedObjectIds(new Set([child.id]));
                                    // 기존 하이라이트 제거
                                    if (highlightLayerRef.current) {
                                      selectedObjectIds.forEach(id => {
                                        const m = loadedAssetsRef.current.get(id);
                                        if (m) highlightLayerRef.current!.removeMesh(m as Mesh);
                                      });
                                    }
                                    if (mesh) {
                                      selectedMeshRef.current = mesh;
                                      gizmoManagerRef.current?.attachToMesh(mesh);
                                      if (highlightLayerRef.current) {
                                        highlightLayerRef.current.addMesh(mesh as Mesh, highlightColor);
                                      }
                                    }
                                  }
                                }}
                              >
                                <span className={styles.expandPlaceholder} />
                                <input
                                  type="checkbox"
                                  checked={selectedObjectIds.has(child.id)}
                                  onChange={(e) => {
                                    // 잠긴 객체는 선택 불가
                                    if (child.locked) return;

                                    const themeColorHex = themeColor || '#10b981';
                                    const r = parseInt(themeColorHex.slice(1, 3), 16) / 255;
                                    const g = parseInt(themeColorHex.slice(3, 5), 16) / 255;
                                    const b = parseInt(themeColorHex.slice(5, 7), 16) / 255;
                                    const highlightColor = new Color3(r, g, b);
                                    const mesh = loadedAssetsRef.current.get(child.id);

                                    if (e.target.checked) {
                                      // 선택 추가
                                      setSelectedObjectIds(prev => {
                                        const newSet = new Set(prev);
                                        newSet.add(child.id);
                                        return newSet;
                                      });
                                      if (mesh && highlightLayerRef.current) {
                                        highlightLayerRef.current.addMesh(mesh as Mesh, highlightColor);
                                      }
                                    } else {
                                      // 선택 해제
                                      setSelectedObjectIds(prev => {
                                        const newSet = new Set(prev);
                                        newSet.delete(child.id);
                                        return newSet;
                                      });
                                      if (mesh && highlightLayerRef.current) {
                                        highlightLayerRef.current.removeMesh(mesh as Mesh);
                                      }
                                      if (selectedMeshRef.current === mesh) {
                                        selectedMeshRef.current = null;
                                        gizmoManagerRef.current?.attachToMesh(null);
                                      }
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className={styles.layerCheckbox}
                                  disabled={child.locked}
                                />
                                <button
                                  className={styles.visibilityBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const mesh = loadedAssetsRef.current.get(child.id);
                                    if (mesh) {
                                      mesh.setEnabled(!mesh.isEnabled());
                                      setWorldObjects(prev => prev.map(o =>
                                        o.id === child.id ? { ...o, visible: mesh.isEnabled() } : o
                                      ));
                                    }
                                  }}
                                  title={child.visible ? '숨기기' : '보이기'}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    {child.visible ? (
                                      <>
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                        <circle cx="12" cy="12" r="3"/>
                                      </>
                                    ) : (
                                      <>
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                        <line x1="1" y1="1" x2="23" y2="23"/>
                                      </>
                                    )}
                                  </svg>
                                </button>
                                {/* Lock 버튼 */}
                                <button
                                  className={styles.lockBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newLocked = !child.locked;
                                    setWorldObjects(prev => prev.map(o =>
                                      o.id === child.id ? { ...o, locked: newLocked } : o
                                    ));
                                    // 잠금 시 선택 해제
                                    if (newLocked && selectedObjectIds.has(child.id)) {
                                      setSelectedObjectIds(prev => {
                                        const newSet = new Set(prev);
                                        newSet.delete(child.id);
                                        return newSet;
                                      });
                                      const mesh = loadedAssetsRef.current.get(child.id);
                                      if (mesh && highlightLayerRef.current) {
                                        highlightLayerRef.current.removeMesh(mesh as Mesh);
                                      }
                                      if (selectedMeshRef.current === loadedAssetsRef.current.get(child.id)) {
                                        selectedMeshRef.current = null;
                                        gizmoManagerRef.current?.attachToMesh(null);
                                      }
                                    }
                                  }}
                                  title={child.locked ? '잠금 해제' : '잠금'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    {child.locked ? (
                                      <>
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                      </>
                                    ) : (
                                      <>
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                        <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                                      </>
                                    )}
                                  </svg>
                                </button>
                                <span className={styles.layerIcon}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                                    <polyline points="2 17 12 22 22 17"/>
                                    <polyline points="2 12 12 17 22 12"/>
                                  </svg>
                                </span>
                                <span className={styles.layerName}>{child.name}</span>
                                <button
                                  className={styles.deleteBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // 잠긴 객체는 삭제 불가
                                    if (child.locked) return;
                                    const mesh = loadedAssetsRef.current.get(child.id);
                                    if (mesh) {
                                      if (highlightLayerRef.current) highlightLayerRef.current.removeMesh(mesh as Mesh);
                                      mesh.dispose();
                                      loadedAssetsRef.current.delete(child.id);
                                    }
                                    setWorldObjects(prev => prev.filter(o => o.id !== child.id));
                                    setSelectedObjectIds(prev => {
                                      const newSet = new Set(prev);
                                      newSet.delete(child.id);
                                      return newSet;
                                    });
                                  }}
                                  title="삭제"
                                  disabled={child.locked}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );

  // Render STEP 3: Export & Share
  const renderStep3 = () => (
    <div className={styles.step3Container}>
      <div className={styles.exportPreview}>
        <div className={styles.previewCanvas}>
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <p>3D Preview</p>
        </div>
      </div>

      <div className={styles.exportOptions}>
        <h3>Export Settings</h3>

        <div className={styles.exportSection}>
          <h4>Format</h4>
          <div className={styles.formatGrid}>
            {(['glb', 'obj', 'stl', 'fbx'] as const).map(format => (
              <button
                key={format}
                className={`${styles.formatBtn} ${worldConfig.export.format === format ? styles.active : ''}`}
                onClick={() => setWorldConfig(prev => ({
                  ...prev,
                  export: { ...prev.export, format }
                }))}
              >
                <span className={styles.formatName}>{format.toUpperCase()}</span>
                <span className={styles.formatDesc}>
                  {format === 'glb' && 'Recommended for web'}
                  {format === 'obj' && 'Universal format'}
                  {format === 'stl' && 'For 3D printing'}
                  {format === 'fbx' && 'For game engines'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.exportSection}>
          <h4>Options</h4>
          <div className={styles.toggleRow}>
            <span>Include Textures</span>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={worldConfig.export.includeTextures}
                onChange={(e) => setWorldConfig(prev => ({
                  ...prev,
                  export: { ...prev.export, includeTextures: e.target.checked }
                }))}
              />
              <span className={styles.toggleSlider} />
            </label>
          </div>

          <div className={styles.sliderRow}>
            <label>Scale: {worldConfig.export.scale.toFixed(2)}x</label>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={worldConfig.export.scale}
              onChange={(e) => setWorldConfig(prev => ({
                ...prev,
                export: { ...prev.export, scale: parseFloat(e.target.value) }
              }))}
            />
          </div>
        </div>

        <div className={styles.exportActions}>
          <button className={styles.secondaryBtn} onClick={handlePrevStep}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Editor
          </button>
          <button className={styles.primaryBtn} onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download {worldConfig.export.format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={styles.editorContainer}
      data-theme={themeMode}
      style={{ '--theme-color': themeColor } as React.CSSProperties}
    >
      {/* Hidden file input for model import - always in DOM */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.obj,.fbx"
        style={{ display: 'none' }}
        onChange={handleModelFileImport}
      />

      {/* Header */}
      <header className={styles.header} style={{ '--theme-color': themeColor } as React.CSSProperties}>
        <div className={styles.headerLeft}>
          <ArchipleWorldLogo color={themeColor} height={28} />
        </div>

        <div className={styles.headerCenter}>
          {renderStepIndicator()}
        </div>

        <div className={styles.headerRight}>
          {/* Spawn Point Setting Button */}
          {!playMode && (
            <button
              className={`${styles.spawnPointBtn} ${isSettingSpawnPoint ? styles.active : ''}`}
              onClick={() => setIsSettingSpawnPoint(!isSettingSpawnPoint)}
              title="클릭하여 캐릭터 시작 위치 설정"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              {isSettingSpawnPoint ? '위치 선택 중...' : '시작 위치'}
            </button>
          )}
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
        {/* Left Sidebar */}
        <div className={styles.leftSidebar}>
          <div className={styles.sidebarButtons}>
            <button
              className={`${styles.sidebarBtn} ${leftPanelOpen && currentStep === 2 ? styles.active : ''}`}
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              title="World Tools"
            >
              <div className={styles.icon}>
                <LiaPencilRulerSolid size={24} />
              </div>
            </button>

            <button className={styles.sidebarBtn} title="Assets Library">
              <div className={styles.icon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </button>

            <button className={styles.sidebarBtn} title="Terrain">
              <div className={styles.icon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 17l4-4 4 4 4-6 6 6" />
                  <path d="M3 21h18" />
                </svg>
              </div>
            </button>

            <button className={styles.sidebarBtn} title="Buildings">
              <div className={styles.icon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                  <path d="M9 22v-4h6v4" />
                  <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
                </svg>
              </div>
            </button>

            <button className={styles.sidebarBtn} title="Vegetation">
              <div className={styles.icon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22v-7" />
                  <path d="M9 17c-2.5 0-5-2.5-5-5 0-3 2.5-5 5-5 0-2 2-5 5-5s5 3 5 5c2.5 0 5 2 5 5s-2.5 5-5 5" />
                </svg>
              </div>
            </button>

            <button
              className={`${styles.sidebarBtn} ${mapImportOpen ? styles.active : ''}`}
              onClick={() => setMapImportOpen(!mapImportOpen)}
              title="Import from Map"
            >
              <div className={styles.icon}>
                <GrMap size={24} />
              </div>
            </button>

            <button
              className={styles.sidebarBtn}
              title="Add Hotspot"
            >
              <div className={styles.icon}>
                <LiaCodeBranchSolid size={24} />
              </div>
            </button>
          </div>

          <div className={styles.sidebarBottom}>
            <button className={styles.sidebarBtn} onClick={() => navigate('/editor')} title="Back to Studio">
              <div className={styles.icon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </div>
            </button>
            <button
              className={`${styles.sidebarBtn} ${themeSettingsOpen ? styles.active : ''}`}
              onClick={() => setThemeSettingsOpen(!themeSettingsOpen)}
              title="Settings"
            >
              <div className={styles.icon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                </svg>
              </div>
            </button>
            <button className={styles.sidebarBtn} onClick={() => navigate('/')} title="Exit">
              <div className={styles.icon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
                </svg>
              </div>
            </button>
          </div>
        </div>

        {/* Step Content - Always show step 2 (3D editor) */}
        {renderStep2()}
      </main>

      {/* Theme Settings Panel */}
      {themeSettingsOpen && (
        <div className={styles.themeSettingsPanel}>
          <div className={styles.panelHeader}>
            <h3>테마 설정</h3>
            <button onClick={() => setThemeSettingsOpen(false)} className={styles.closeBtn}>×</button>
          </div>

          <div className={styles.panelContent}>
            {/* Theme Mode Selection */}
            <div className={styles.settingsSection}>
              <h4>모드</h4>
              <div className={styles.themeModeGrid}>
                <button
                  className={`${styles.themeModeBtn} ${themeMode === 'light' ? styles.active : ''}`}
                  onClick={() => setThemeMode('light')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
                  </svg>
                  <span>라이트</span>
                </button>
                <button
                  className={`${styles.themeModeBtn} ${themeMode === 'dark' ? styles.active : ''}`}
                  onClick={() => setThemeMode('dark')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
                  </svg>
                  <span>다크</span>
                </button>
              </div>
            </div>

            {/* Theme Color Selection */}
            <div className={styles.settingsSection}>
              <h4>테마 색상</h4>
              <div className={styles.colorGrid}>
                {[
                  { name: '그린', color: '#3fae7a' },
                  { name: '블루', color: '#4a90e2' },
                  { name: '퍼플', color: '#9b59b6' },
                  { name: '오렌지', color: '#e67e22' },
                  { name: '레드', color: '#e74c3c' },
                  { name: '핑크', color: '#ec4899' },
                  { name: '틸', color: '#14b8a6' },
                  { name: '인디고', color: '#6366f1' },
                ].map(({ name, color }) => (
                  <button
                    key={color}
                    className={`${styles.colorBtn} ${themeColor === color ? styles.active : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setThemeColor(color)}
                    title={name}
                  >
                    {themeColor === color && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Color Picker */}
            <div className={styles.settingsSection}>
              <h4>커스텀 색상</h4>
              <div className={styles.customColorRow}>
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className={styles.colorPicker}
                />
                <span className={styles.colorValue}>{themeColor.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Import Modal - MapSelector Component */}
      {mapImportOpen && (
        <MapSelector
          onAreaSelect={(area: SelectedArea) => {
            handleAreaSelect({
              minLat: area.minLat,
              minLng: area.minLng,
              maxLat: area.maxLat,
              maxLng: area.maxLng,
              name: area.name,
            });
          }}
          onClose={() => setMapImportOpen(false)}
          initialCenter={[126.978, 37.566]}
          initialZoom={12}
        />
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingModal}>
            <div className={styles.loadingSpinner} />
            <p className={styles.loadingMessage}>{loadingMessage}</p>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <span className={styles.progressText}>{loadingProgress}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldEditorPage;
