# 📘 ARCHIPLE-1.0 ENGINE SPECIFICATION

> Professional 3D Interior Walkthrough Engine with Coohom-level Quality

---

## 1. 프로젝트 개요

### 🎯 목표

Archiple-1.0은 **쿠홈(Coohom) 수준의 고품질 3D 인테리어 워크스루 엔진**을 Babylon.js 기반으로 웹에서 구현하는 프로젝트입니다.

### 📌 주요 기능

#### Core Features
- ✏️ **실시간 3D 공간 생성 & 편집**
- 🏠 **벽/방 그리기** (Drag-to-draw Room)
- 🧲 **공간 자동 스냅** + 치수 표시
- 🚶 **3D 워크스루** (FPS / WASD Controls)
- 🎨 **고급 PBR 매터리얼**
- 💡 **GI / SSAO / HDRI 라이팅**
- 🪑 **가구 배치/회전/스냅**
- ⚡ **렌더링 퀄리티 커스텀** (Performance / High)
- 💾 **프로젝트 저장/불러오기** (JSON Model)

### 🎮 사용자 경험 목표

- **직관적인 2D 플로어플랜 드로잉** → 즉시 3D 변환
- **부드러운 WASD 워크스루** (60fps 보장)
- **프로페셔널급 렌더링 품질** (PBR + HDRI + SSAO)
- **빠른 반응성** (< 100ms 인터랙션 지연)

---

## 2. 기술 스택

### Core Framework
```json
{
  "react": "^19.2.0",
  "typescript": "~5.9.3",
  "vite": "^7.2.2"
}
```

### 3D Rendering Engine
```json
{
  "@babylonjs/core": "^8.37.0",
  "@babylonjs/loaders": "^8.37.0",
  "@babylonjs/gui": "^8.37.0",
  "@babylonjs/inspector": "^8.37.0"
}
```

### State Management
```json
{
  "zustand": "latest",
  "immer": "latest"
}
```

### Routing & Tools
```json
{
  "react-router-dom": "latest"
}
```

### Development Tools
```json
{
  "eslint": "^9.39.1",
  "prettier": "latest",
  "@types/node": "^24.10.0"
}
```

---

## 3. 아키텍처 설계

### 3.1 전체 구조

```
Archiple-1.0 Architecture
┌─────────────────────────────────────────────────────────────┐
│                     React Application                        │
├─────────────────────────────────────────────────────────────┤
│  UI Layer          │  State Layer       │  Engine Layer     │
│  ─────────────────  ─────────────────  ───────────────────  │
│  • Toolbar         │  • Zustand Store  │  • Scene Manager  │
│  • Sidebar         │  • Immer.js       │  • Object Manager │
│  • Canvas          │  • EditorContext  │  • Tool Manager   │
│  • Panels          │  • ToolContext    │  • History Stack  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Babylon.js Engine                         │
├─────────────────────────────────────────────────────────────┤
│  • Scene Graph Management                                    │
│  • PBR Material System                                       │
│  • Camera Controllers (FPS + Orbit)                          │
│  • Lighting (HDRI + GI + SSAO)                              │
│  • Mesh Builders (Walls, Floors, Furniture)                 │
│  • Physics & Collision                                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 디렉토리 구조

```
archiple-1.0/
├── src/
│   ├── core/                     # Core Business Logic
│   │   ├── engine/              # Engine Managers
│   │   │   ├── SceneManager.ts
│   │   │   ├── ObjectManager.ts
│   │   │   ├── SelectionManager.ts
│   │   │   └── HistoryManager.ts
│   │   ├── commands/            # Command Pattern
│   │   │   ├── Command.ts
│   │   │   ├── AddWallCommand.ts
│   │   │   └── AddRoomCommand.ts
│   │   ├── events/              # Event Bus
│   │   │   ├── EventBus.ts
│   │   │   ├── EditorEvents.ts
│   │   │   └── FloorEvents.ts
│   │   ├── math/                # Math Utilities
│   │   │   ├── Vector2.ts
│   │   │   ├── Geometry.ts
│   │   │   └── Snap.ts
│   │   └── types/               # TypeScript Interfaces
│   │       ├── Point.ts
│   │       ├── Wall.ts
│   │       ├── Room.ts
│   │       └── EditorState.ts
│   │
│   ├── floorplan/               # 2D Floorplan Editor
│   │   ├── renderer/            # Rendering System
│   │   │   ├── layers/          # Layer-based Rendering
│   │   │   │   ├── GridLayer.ts
│   │   │   │   ├── WallLayer.ts
│   │   │   │   ├── PointLayer.ts
│   │   │   │   ├── RoomLayer.ts
│   │   │   │   └── SelectionLayer.ts
│   │   │   └── canvas2d/
│   │   │       └── Canvas2DRenderer.ts
│   │   ├── tools/               # Drawing Tools
│   │   │   ├── Tool.ts
│   │   │   ├── WallTool.ts
│   │   │   ├── RoomTool.ts
│   │   │   ├── SelectTool.ts
│   │   │   ├── MoveTool.ts
│   │   │   └── ToolManager.ts
│   │   ├── controllers/         # Input Controllers
│   │   │   ├── MouseController.ts
│   │   │   └── KeyboardController.ts
│   │   └── services/            # Business Logic
│   │       ├── RoomDetectionService.ts
│   │       ├── SnapService.ts
│   │       └── MeasurementService.ts
│   │
│   ├── viewer3d/                # 3D Babylon.js Viewer
│   │   ├── scene/               # Scene Setup
│   │   │   ├── SceneSetup.ts
│   │   │   ├── LightingSetup.ts  # HDRI + GI + SSAO
│   │   │   └── PostProcessing.ts
│   │   ├── converters/          # 2D → 3D Conversion
│   │   │   ├── FloorplanTo3DConverter.ts
│   │   │   ├── WallMeshBuilder.ts
│   │   │   └── FloorMeshBuilder.ts
│   │   ├── materials/           # PBR Materials
│   │   │   ├── MaterialLibrary.ts
│   │   │   ├── WallMaterial.ts
│   │   │   ├── FloorMaterial.ts
│   │   │   └── FurnitureMaterial.ts
│   │   ├── controllers/         # Camera Controllers
│   │   │   ├── FPSCameraController.ts  # WASD Walkthrough
│   │   │   └── OrbitCameraController.ts
│   │   └── loaders/             # Asset Loading
│   │       └── FurnitureLoader.ts
│   │
│   ├── ui/                      # React UI Components
│   │   ├── toolbar/             # Top Toolbar
│   │   │   ├── Toolbar.tsx
│   │   │   ├── ToolButton.tsx
│   │   │   └── UndoRedoButtons.tsx
│   │   ├── sidebar/             # Tool Sidebar
│   │   │   ├── Sidebar.tsx
│   │   │   └── ToolPanel.tsx
│   │   ├── panels/              # Property Panels
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── MaterialPanel.tsx
│   │   │   └── LayersPanel.tsx
│   │   └── modals/              # Dialogs
│   │       ├── SaveProjectModal.tsx
│   │       └── LoadProjectModal.tsx
│   │
│   ├── state/                   # State Management
│   │   ├── store.ts             # Zustand Store
│   │   ├── slices/              # Store Slices
│   │   │   ├── editorSlice.ts
│   │   │   ├── toolSlice.ts
│   │   │   └── sceneSlice.ts
│   │   ├── EditorContext.tsx    # React Context
│   │   └── ToolContext.tsx
│   │
│   ├── hooks/                   # Custom React Hooks
│   │   ├── useSceneManager.ts
│   │   ├── useFloorplan.ts
│   │   ├── useTools.ts
│   │   └── useBabylonScene.ts
│   │
│   └── lib/                     # Utilities
│       ├── utils.ts
│       ├── constants.ts
│       └── serialization.ts      # JSON Save/Load
│
├── public/
│   └── assets/                  # Static Assets
│       ├── hdri/                # HDRI Environment Maps
│       ├── textures/            # PBR Textures
│       └── models/              # Furniture Models (GLB)
│
└── docs/                        # Documentation
    ├── ARCHITECTURE.md
    ├── API.md
    └── DEVELOPMENT.md
```

---

## 4. 핵심 시스템 설계

### 4.1 Scene Manager (Singleton)

**책임:**
- 전체 에디터 상태 조율
- Manager 간 통신 중재
- Tool 전환 관리

```typescript
class SceneManager {
  private static instance: SceneManager;

  public objectManager: ObjectManager;
  public selectionManager: SelectionManager;
  public historyManager: HistoryManager;
  public toolManager: ToolManager;

  private currentTool: ToolType;
  private config: EditorConfig;

  static getInstance(): SceneManager;
  setTool(tool: ToolType): void;
  exportState(): string;
  importState(json: string): void;
}
```

### 4.2 Object Manager

**책임:**
- 모든 객체(Point, Wall, Room) 생명주기 관리
- CRUD 작업 + 이벤트 발행

```typescript
class ObjectManager {
  private points: Map<string, Point>;
  private walls: Map<string, Wall>;
  private rooms: Map<string, Room>;

  addPoint(point: Point): void;
  addWall(wall: Wall): void;
  addRoom(room: Room): void;

  removePoint(id: string): void;
  removeWall(id: string): void;
  removeRoom(id: string): void;

  getPoint(id: string): Point | undefined;
  getWall(id: string): Wall | undefined;
  getRoom(id: string): Room | undefined;

  getAllPoints(): Point[];
  getAllWalls(): Wall[];
  getAllRooms(): Room[];
}
```

### 4.3 Tool Manager

**책임:**
- 도구 등록 및 활성화
- 마우스/키보드 이벤트 라우팅

```typescript
class ToolManager {
  private tools: Map<ToolType, Tool>;
  private activeTool: Tool | null;

  registerTool(type: ToolType, tool: Tool): void;
  setActiveTool(type: ToolType): void;

  handleMouseDown(event: MouseEvent): void;
  handleMouseMove(event: MouseEvent): void;
  handleMouseUp(event: MouseEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
}
```

### 4.4 Rendering System (Layer-based)

**렌더링 순서:**
1. **GridLayer** (z-index: 0) - 배경 그리드
2. **RoomLayer** (z-index: 1) - 룸 영역 채우기
3. **WallLayer** (z-index: 2) - 벽 렌더링
4. **PointLayer** (z-index: 3) - 포인트 표시
5. **SelectionLayer** (z-index: 4) - 선택 오버레이
6. **UILayer** (z-index: 5) - 측정값, 라벨

```typescript
interface Layer {
  readonly zIndex: number;
  render(ctx: CanvasRenderingContext2D): void;
  clear(): void;
  update(): void;
}

class Canvas2DRenderer {
  private layers: Layer[];

  addLayer(layer: Layer): void;
  removeLayer(layer: Layer): void;
  render(): void;
  clear(): void;
}
```

### 4.5 Event Bus (Pub/Sub)

**이벤트 타입:**
- **EditorEvents**: `TOOL_CHANGED`, `SELECTION_CHANGED`, `STATE_CHANGED`
- **FloorEvents**: `POINT_ADDED`, `WALL_ADDED`, `ROOM_DETECTED`
- **ViewerEvents**: `CAMERA_MOVED`, `MESH_CREATED`, `MATERIAL_CHANGED`

```typescript
class EventBus {
  private listeners: Map<string, Set<Function>>;

  on(event: string, callback: Function): void;
  off(event: string, callback: Function): void;
  emit(event: string, data?: any): void;
}
```

### 4.6 Command System (Undo/Redo)

```typescript
interface Command {
  execute(): void;
  undo(): void;
  redo(): void;
}

class HistoryManager {
  private undoStack: Command[];
  private redoStack: Command[];

  execute(command: Command): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}
```

---

## 5. 주요 기능 상세 설계

### 5.1 벽 그리기 (Wall Drawing)

**UX Flow:**
1. User clicks WallTool
2. Click on canvas → Place start point
3. Move mouse → Preview wall (dashed line)
4. Click again → Place end point + Create wall
5. Continue clicking → Chain walls
6. ESC or right-click → End drawing

**구현:**
```typescript
class WallTool extends Tool {
  private startPoint: Point | null = null;
  private previewWall: Wall | null = null;

  handleMouseDown(event: MouseEvent): void {
    const pos = this.getCanvasPosition(event);
    const snappedPos = snapService.snap(pos);

    if (!this.startPoint) {
      // First click - place start point
      this.startPoint = createPoint(snappedPos);
      objectManager.addPoint(this.startPoint);
    } else {
      // Second click - create wall
      const endPoint = createPoint(snappedPos);
      objectManager.addPoint(endPoint);

      const wall = createWall(this.startPoint.id, endPoint.id);
      objectManager.addWall(wall);

      // Continue chain
      this.startPoint = endPoint;
      this.previewWall = null;
    }
  }

  handleMouseMove(event: MouseEvent): void {
    if (!this.startPoint) return;

    const pos = this.getCanvasPosition(event);
    const snappedPos = snapService.snap(pos);

    // Update preview
    this.previewWall = createPreviewWall(this.startPoint, snappedPos);
  }
}
```

### 5.2 Room Detection (방 자동 감지)

**알고리즘:**
1. Wall Graph 구성 (점 → 벽 → 점)
2. Cycle Detection (DFS/BFS)
3. Closed Polygon 검증
4. Area 계산 (Shoelace Formula)
5. Room 생성 + 이벤트 발행

```typescript
class RoomDetectionService {
  detectRooms(walls: Wall[]): Room[] {
    const graph = this.buildGraph(walls);
    const cycles = this.findCycles(graph);
    const rooms: Room[] = [];

    for (const cycle of cycles) {
      if (this.isValidRoom(cycle)) {
        const area = this.calculateArea(cycle);
        const room = createRoom(cycle, area);
        rooms.push(room);
      }
    }

    return rooms;
  }

  private buildGraph(walls: Wall[]): Graph {
    // Build adjacency list
  }

  private findCycles(graph: Graph): Cycle[] {
    // DFS-based cycle detection
  }

  private calculateArea(points: Point[]): number {
    // Shoelace formula
  }
}
```

### 5.3 Point Snapping (스냅 시스템)

**스냅 우선순위:**
1. **Point Snap** (가장 가까운 포인트, threshold: 10px)
2. **Grid Snap** (그리드 격자, 간격: 20px)
3. **Midpoint Snap** (벽 중간점)
4. **Perpendicular Snap** (수직선)
5. **Angle Snap** (45° 각도)

```typescript
class SnapService {
  private snapThreshold = 10; // pixels
  private gridSize = 20;

  snap(pos: Vector2, context: SnapContext): Vector2 {
    // 1. Point snap
    const nearestPoint = this.findNearestPoint(pos);
    if (nearestPoint && this.distance(pos, nearestPoint) < this.snapThreshold) {
      return nearestPoint.position;
    }

    // 2. Grid snap
    if (context.gridSnapEnabled) {
      return this.snapToGrid(pos);
    }

    // 3. Midpoint snap
    const midpoint = this.findNearestMidpoint(pos);
    if (midpoint && this.distance(pos, midpoint) < this.snapThreshold) {
      return midpoint;
    }

    // 4. Perpendicular snap
    const perpPoint = this.findPerpendicularSnap(pos, context);
    if (perpPoint) return perpPoint;

    // 5. No snap
    return pos;
  }

  private snapToGrid(pos: Vector2): Vector2 {
    return new Vector2(
      Math.round(pos.x / this.gridSize) * this.gridSize,
      Math.round(pos.y / this.gridSize) * this.gridSize
    );
  }
}
```

### 5.4 2D → 3D Conversion

**변환 프로세스:**
1. **Wall → Mesh**: Extrude 2D wall to 3D (height: 2.8m)
2. **Room → Floor/Ceiling**: Polygon → CSG → Mesh
3. **Point → Vertex**: 2D coords → 3D coords (y=0)
4. **Material Application**: PBR materials
5. **Lighting Setup**: HDRI + Point Lights

```typescript
class FloorplanTo3DConverter {
  convert(floorplan: FloorplanModel): Scene {
    const scene = new Scene(this.engine);

    // 1. Create walls
    for (const wall of floorplan.walls) {
      const wallMesh = WallMeshBuilder.build(wall);
      scene.addMesh(wallMesh);
    }

    // 2. Create floors
    for (const room of floorplan.rooms) {
      const floorMesh = FloorMeshBuilder.buildFloor(room);
      const ceilingMesh = FloorMeshBuilder.buildCeiling(room);
      scene.addMesh(floorMesh);
      scene.addMesh(ceilingMesh);
    }

    // 3. Setup lighting
    LightingSetup.setupHDRI(scene);
    LightingSetup.setupSSAO(scene);

    return scene;
  }
}

class WallMeshBuilder {
  static build(wall: Wall): Mesh {
    const points = wall.getPoints();
    const path = [
      new Vector3(points.start.x, 0, points.start.y),
      new Vector3(points.end.x, 0, points.end.y),
    ];

    const mesh = MeshBuilder.ExtrudeShape('wall', {
      shape: this.getWallProfile(wall.thickness),
      path: path,
      cap: Mesh.CAP_ALL,
    });

    mesh.material = MaterialLibrary.getWallMaterial();
    return mesh;
  }
}
```

### 5.5 FPS Camera Controller (WASD Walkthrough)

**기능:**
- WASD 이동 (forward/back/left/right)
- Mouse Look (1인칭 시점)
- Collision Detection (벽 통과 방지)
- Gravity + Floor Height (y = 1.7m 눈높이)

```typescript
class FPSCameraController {
  private camera: UniversalCamera;
  private moveSpeed = 0.5;
  private lookSpeed = 0.002;

  setup(scene: Scene): void {
    this.camera = new UniversalCamera('fpsCamera', new Vector3(0, 1.7, -5), scene);
    this.camera.speed = this.moveSpeed;
    this.camera.angularSensibility = 1000 / this.lookSpeed;

    // WASD keys
    this.camera.keysUp.push(87);    // W
    this.camera.keysDown.push(83);  // S
    this.camera.keysLeft.push(65);  // A
    this.camera.keysRight.push(68); // D

    // Collision
    this.camera.checkCollisions = true;
    this.camera.ellipsoid = new Vector3(0.5, 0.85, 0.5);

    // Gravity
    this.camera.applyGravity = true;
    scene.gravity = new Vector3(0, -0.15, 0);

    this.camera.attachControl(scene.getEngine().getRenderingCanvas(), true);
  }
}
```

### 5.6 PBR Material System

**재질 종류:**
- Wall Material (White/Concrete/Brick)
- Floor Material (Wood/Tile/Marble)
- Ceiling Material (White/Gypsum)
- Furniture Material (Wood/Metal/Fabric)

```typescript
class MaterialLibrary {
  private static materials: Map<string, PBRMaterial> = new Map();

  static getWallMaterial(type: 'white' | 'concrete' | 'brick' = 'white'): PBRMaterial {
    const key = `wall_${type}`;
    if (!this.materials.has(key)) {
      const material = new PBRMaterial(key, scene);
      material.albedoColor = new Color3(0.95, 0.95, 0.95);
      material.metallic = 0.0;
      material.roughness = 0.8;
      material.bumpTexture = new Texture('/assets/textures/wall_normal.png', scene);
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }

  static getFloorMaterial(type: 'wood' | 'tile' | 'marble' = 'wood'): PBRMaterial {
    // Similar implementation
  }
}
```

### 5.7 HDRI Lighting + SSAO

**구현:**
```typescript
class LightingSetup {
  static setupHDRI(scene: Scene): void {
    const hdrTexture = new HDRCubeTexture('/assets/hdri/studio.hdr', scene, 512);
    scene.environmentTexture = hdrTexture;
    scene.environmentIntensity = 1.0;

    // IBL (Image-Based Lighting)
    scene.createDefaultSkybox(hdrTexture, true, 1000);
  }

  static setupSSAO(scene: Scene): void {
    const ssao = new SSAO2RenderingPipeline('ssao', scene, {
      ssaoRatio: 0.5,
      blurRatio: 0.5,
    });
    ssao.radius = 1.0;
    ssao.totalStrength = 1.3;
    ssao.base = 0.1;

    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', scene.activeCamera);
  }

  static setupGI(scene: Scene): void {
    // Global Illumination (future implementation)
    // Using Babylon.js GI system or pre-baked lightmaps
  }
}
```

### 5.8 Project Save/Load (JSON Serialization)

**JSON Schema:**
```json
{
  "version": "1.0.0",
  "metadata": {
    "name": "My Project",
    "created": "2025-01-15T10:30:00Z",
    "modified": "2025-01-15T12:45:00Z"
  },
  "floorplan": {
    "points": [
      { "id": "p1", "x": 0, "y": 0 },
      { "id": "p2", "x": 500, "y": 0 }
    ],
    "walls": [
      {
        "id": "w1",
        "startPointId": "p1",
        "endPointId": "p2",
        "thickness": 20,
        "height": 280,
        "material": "white"
      }
    ],
    "rooms": [
      {
        "id": "r1",
        "name": "Living Room",
        "pointIds": ["p1", "p2", "p3", "p4"],
        "area": 25.0,
        "materials": {
          "floor": "wood",
          "ceiling": "white",
          "walls": "white"
        }
      }
    ]
  },
  "furniture": [
    {
      "id": "f1",
      "type": "sofa",
      "modelUrl": "/assets/models/sofa.glb",
      "position": { "x": 250, "y": 0, "z": 300 },
      "rotation": { "x": 0, "y": 90, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 }
    }
  ],
  "camera": {
    "position": { "x": 0, "y": 170, "z": -500 },
    "target": { "x": 0, "y": 0, "z": 0 }
  },
  "settings": {
    "renderQuality": "high",
    "ssaoEnabled": true,
    "shadowsEnabled": true
  }
}
```

**구현:**
```typescript
class ProjectSerializer {
  static serialize(sceneManager: SceneManager): string {
    const data = {
      version: '1.0.0',
      metadata: {
        name: 'Untitled Project',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
      },
      floorplan: {
        points: sceneManager.objectManager.getAllPoints(),
        walls: sceneManager.objectManager.getAllWalls(),
        rooms: sceneManager.objectManager.getAllRooms(),
      },
      furniture: [], // Future implementation
      camera: sceneManager.getCameraState(),
      settings: sceneManager.getConfig(),
    };

    return JSON.stringify(data, null, 2);
  }

  static deserialize(json: string): void {
    const data = JSON.parse(json);

    // Validate version
    if (data.version !== '1.0.0') {
      throw new Error('Unsupported project version');
    }

    // Import floorplan
    sceneManager.importState(JSON.stringify(data.floorplan));

    // Restore camera
    sceneManager.setCameraState(data.camera);

    // Apply settings
    sceneManager.updateConfig(data.settings);
  }
}
```

---

## 6. 성능 최적화 전략

### 6.1 렌더링 최적화

**2D Canvas:**
- Dirty Rectangle 기법 (변경된 영역만 재렌더링)
- RequestAnimationFrame 사용 (60fps cap)
- Off-screen Canvas (Worker Thread)

**3D Babylon.js:**
- Frustum Culling (화면 밖 메시 제외)
- LOD (Level of Detail) - 거리별 메시 디테일 조절
- Instancing (같은 가구 여러 개)
- Merge Meshes (정적 벽 병합)

### 6.2 메모리 관리

- **Object Pooling** (자주 생성/삭제되는 객체)
- **Lazy Loading** (가구 모델 on-demand 로딩)
- **Texture Compression** (KTX2 format)
- **Dispose Unused Assets** (메모리 누수 방지)

### 6.3 상태 관리 최적화

- **Zustand + Immer** (불변성 + 성능)
- **Selector Pattern** (필요한 상태만 구독)
- **Memoization** (React.memo, useMemo, useCallback)

---

## 7. 개발 로드맵

### Phase 1: Foundation (Week 1-2) ✅
- [x] Project setup (Vite + React + TypeScript)
- [x] Babylon.js integration
- [x] Core architecture (Managers, EventBus, Commands)
- [x] Basic 2D/3D split layout

### Phase 2: 2D Floorplan Engine (Week 3-4) 🚧
- [ ] Layer-based rendering system
- [ ] Wall drawing tool with snap
- [ ] Point management
- [ ] Room detection algorithm
- [ ] Selection & movement tools

### Phase 3: 3D Viewer Integration (Week 5-6)
- [ ] 2D → 3D converter
- [ ] Wall/Floor mesh builders
- [ ] PBR material system
- [ ] FPS camera controller (WASD)
- [ ] HDRI + SSAO lighting

### Phase 4: UI & Tools (Week 7-8)
- [ ] Toolbar (tool selection)
- [ ] Sidebar (tool options)
- [ ] Properties panel (material editor)
- [ ] Measurement display
- [ ] Undo/Redo UI

### Phase 5: Advanced Features (Week 9-10)
- [ ] Furniture placement system
- [ ] Drag-to-draw room tool
- [ ] Material library expansion
- [ ] Export (JSON, PNG, GLB)
- [ ] Project save/load

### Phase 6: Polish & Optimization (Week 11-12)
- [ ] Performance profiling & optimization
- [ ] Quality settings (Low/Medium/High)
- [ ] User testing & feedback
- [ ] Documentation completion
- [ ] Production build

---

## 8. 품질 기준

### Performance Targets
- **2D Canvas**: 60fps (16.6ms/frame)
- **3D Viewer**: 60fps (simple scenes), 30fps (complex scenes)
- **Interaction Latency**: < 100ms
- **Initial Load**: < 3s
- **Memory Usage**: < 500MB (complex projects)

### Code Quality
- **TypeScript Strict Mode**: Enabled
- **ESLint**: Zero warnings
- **Test Coverage**: > 80% (unit tests)
- **Bundle Size**: < 2MB (initial load)

### User Experience
- **Intuitive UI**: No tutorial needed for basic tasks
- **Responsive**: Works on 1920x1080+ displays
- **Accessible**: WCAG 2.1 AA compliance
- **Error Handling**: Graceful degradation, no crashes

---

## 9. 참고 자료

### Babylon.js Documentation
- [Babylon.js Official Docs](https://doc.babylonjs.com/)
- [PBR Materials Guide](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/introToPBR)
- [Camera System](https://doc.babylonjs.com/features/featuresDeepDive/cameras)
- [SSAO Tutorial](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/ssao2RenderingPipeline)

### Algorithms
- [Room Detection (Polygon Detection)](https://en.wikipedia.org/wiki/Cycle_detection)
- [Shoelace Formula (Area Calculation)](https://en.wikipedia.org/wiki/Shoelace_formula)
- [Snapping Algorithms](https://en.wikipedia.org/wiki/Snap_point)

### Inspiration
- [Coohom](https://www.coohom.com/) - Target quality benchmark
- [Floorplanner](https://floorplanner.com/) - 2D editor reference
- [Roomstyler](https://roomstyler.com/) - Furniture placement UX

---

## 10. 라이선스

MIT License - See LICENSE file for details.

---

**Last Updated:** 2025-01-15
**Version:** 1.0.0
**Status:** 🚧 In Development (Phase 2)
