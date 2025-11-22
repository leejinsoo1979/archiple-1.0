# ARCHIPLE EXTENSION: Asset & Material Library Architecture
> **Base Architecture:** Archiple 1.0 Enterprise (React + Babylon.js)
> **Context:** Core Engine and Space Drawing are complete.
> **Goal:** Implement a high-performance 3D Asset Management & Placement System.

## 1. Architectural Alignment (Read First)
본 확장은 기존 `Archiple 1.0`의 철학을 엄격히 준수한다.
* **Command Pattern:** 가구 배치는 반드시 `AddObjectCommand`를 통해 실행되어 Undo/Redo가 가능해야 한다.
* **EventBus:** UI와 3D Viewer 간의 통신은 `src/core/events/EventBus.ts`를 통한다.
* **Core/Viewer Separation:** 비즈니스 로직(가격, 브랜드, 메타데이터)은 `core`에, 렌더링 로직(Mesh 로딩, Instancing)은 `viewer3d`에 위치한다.

---

## 2. Directory Structure Extension
기존 구조에 에셋 시스템을 위한 모듈을 추가한다.

```text
src/
├── core/
│   ├── assets/                 # [NEW] Asset Business Logic
│   │   ├── AssetCatalog.ts     # Metadata provider
│   │   └── AssetTypes.ts       # Interface definitions
│   └── commands/
│       └── AddFurnitureCommand.ts # [NEW] Command implementation
│
├── viewer3d/
│   ├── assets/                 # [NEW] 3D Asset Handling
│   │   ├── AssetLoader.ts      # glTF/Draco Loader & Caching
│   │   └── AssetGhost.ts       # Dragging placeholder logic
│   ├── interaction/            # [NEW] Interaction Logic
│   │   └── DragDropController.ts # Raycasting & Snapping
```

---

## 3. Data Models (Interfaces)

**Location:** `src/core/assets/AssetTypes.ts`

```typescript
export type PlacementType = 'floor' | 'wall' | 'ceiling' | 'hosted'; // hosted: 테이블 위

export interface IAssetMetadata {
  id: string;
  name: string;
  category: string;
  modelUrl: string;     // .glb (Draco compressed)
  thumbnailUrl: string;

  // Ghost Mesh 생성을 위한 물리적 치수
  dimensions: {
    width: number;  // x
    height: number; // y
    depth: number;  // z
  };

  placementType: PlacementType;
  snapDistance: number; // 벽 자석 효과 거리
}

// 씬에 배치된 인스턴스 데이터
export interface IFurnitureInstance {
  uid: string;       // Scene 내 고유 ID
  assetId: string;   // 원본 에셋 ID
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Quaternion 권장
  scale: { x: number; y: number; z: number };
}
```

---

## 4. Key Systems Implementation

### 4.1 Asset Loader Service (Singleton)

**Location:** `src/viewer3d/assets/AssetLoader.ts`

**Responsibility:**
* Babylon.SceneLoader.LoadAssetContainerAsync 사용.
* Caching: 한 번 로드된 .glb는 AssetContainer 형태로 메모리에 캐싱. (동일 의자 100개 배치 시 네트워크 요청 1회).
* Optimization: DracoCompression 설정 필수.
* Texture: .ktx2 지원 확인.

### 4.2 Interaction Flow: The "Ghost" Strategy

성능 최적화를 위해 드래그 중에는 무거운 .glb를 로드하지 않는다.

1. **UI Event:** 사용자가 아이템 드래그 시작 → `EventBus.emit('DRAG_START', assetId)`
2. **Ghost Creation:** DragDropController가 `asset.dimensions` 정보를 이용해 단순한 Box Mesh (Wireframe/Semi-transparent) 생성.
3. **Raycasting (Smart Snap):**
   * 마우스 포인터가 Floor 레이어 위 → Ghost가 바닥에 붙음.
   * 마우스 포인터가 Wall 레이어 위 + (`asset.placementType === 'wall'`) → Ghost가 벽 Normal Vector에 맞춰 회전.
4. **Drop Event:** 마우스 업 → `EventBus.emit('DRAG_END', position, rotation)`

### 4.3 Command Pattern Integration

**Location:** `src/core/commands/AddFurnitureCommand.ts`

```typescript
import { Command } from './Command';

export class AddFurnitureCommand implements Command {
  constructor(
    private sceneManager: SceneManager,
    private furnitureData: IFurnitureInstance
  ) {}

  execute(): void {
    // 1. 논리적 데이터 추가 (ObjectManager)
    this.sceneManager.objectManager.addFurniture(this.furnitureData);
    // 2. 시각적 모델 생성 (Viewer3D 요청)
    this.sceneManager.eventBus.emit('SPAWN_FURNITURE', this.furnitureData);
  }

  undo(): void {
    this.sceneManager.objectManager.removeFurniture(this.furnitureData.uid);
    this.sceneManager.eventBus.emit('DESPAWN_FURNITURE', this.furnitureData.uid);
  }
}
```

---

## 5. Integration Checklist for Claude Code

이 가이드를 바탕으로 다음 순서대로 코드를 작성하라.

1. **[Type Definition]** IAssetMetadata, IFurnitureInstance 인터페이스 작성.
2. **[Mock Data]** 테스트용 의자(Floor), 액자(Wall) JSON 데이터 생성.
3. **[Loader]** AssetLoader.ts 구현 (Draco 설정 포함).
4. **[Interaction]** DragDropController.ts 구현.
   * 핵심: `scene.pick` 사용 시 기존 벽/바닥 Mesh(Archiple 1.0에서 생성된 것)만 필터링하여 Raycasting 할 것.
5. **[Connection]** EventBus를 통해 React UI의 드래그 이벤트와 Babylon Controller 연결.

---

## 6. Technical Constraints

* **Dependency:** `@babylonjs/loaders` 패키지가 설치되어 있어야 한다.
* **Performance:** 동일한 에셋 복제 시 `mesh.createInstance` 또는 `ThinInstance`를 사용하여 Draw Call을 최소화한다.
* **State:** 현재 드래그 중인 상태는 `src/state` (React Side)가 아닌 `DragDropController` (Babylon Side) 내부에서 Observer Pattern으로 처리하여 리렌더링을 방지한다.

---

## 3. Data Models (Interfaces)

**Location:** `src/core/assets/AssetTypes.ts`

```typescript
export type PlacementType = 'floor' | 'wall' | 'ceiling' | 'hosted'; // hosted: 테이블 위

export interface IAssetMetadata {
  id: string;
  name: string;
  category: string;
  modelUrl: string;     // .glb (Draco compressed)
  thumbnailUrl: string;

  // Ghost Mesh 생성을 위한 물리적 치수
  dimensions: {
    width: number;  // x
    height: number; // y
    depth: number;  // z
  };

  placementType: PlacementType;
  snapDistance: number; // 벽 자석 효과 거리
}

// 씬에 배치된 인스턴스 데이터
export interface IFurnitureInstance {
  uid: string;       // Scene 내 고유 ID
  assetId: string;   // 원본 에셋 ID
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Quaternion 권장
  scale: { x: number; y: number; z: number };
}
```

---

## 4. Key Systems Implementation

### 4.1 Asset Loader Service (Singleton)

**Location:** `src/viewer3d/assets/AssetLoader.ts`

**Responsibility:**
* Babylon.SceneLoader.LoadAssetContainerAsync 사용.
* Caching: 한 번 로드된 .glb는 AssetContainer 형태로 메모리에 캐싱. (동일 의자 100개 배치 시 네트워크 요청 1회).
* Optimization: DracoCompression 설정 필수.
* Texture: .ktx2 지원 확인.

### 4.2 Interaction Flow: The "Ghost" Strategy

성능 최적화를 위해 드래그 중에는 무거운 .glb를 로드하지 않는다.

1. **UI Event:** 사용자가 아이템 드래그 시작 → `EventBus.emit('DRAG_START', assetId)`
2. **Ghost Creation:** DragDropController가 `asset.dimensions` 정보를 이용해 단순한 Box Mesh (Wireframe/Semi-transparent) 생성.
3. **Raycasting (Smart Snap):**
   * 마우스 포인터가 Floor 레이어 위 → Ghost가 바닥에 붙음.
   * 마우스 포인터가 Wall 레이어 위 + (`asset.placementType === 'wall'`) → Ghost가 벽 Normal Vector에 맞춰 회전.
4. **Drop Event:** 마우스 업 → `EventBus.emit('DRAG_END', position, rotation)`

### 4.3 Command Pattern Integration

**Location:** `src/core/commands/AddFurnitureCommand.ts`

```typescript
import { Command } from './Command';

export class AddFurnitureCommand implements Command {
  constructor(
    private sceneManager: SceneManager,
    private furnitureData: IFurnitureInstance
  ) {}

  execute(): void {
    // 1. 논리적 데이터 추가 (ObjectManager)
    this.sceneManager.objectManager.addFurniture(this.furnitureData);
    // 2. 시각적 모델 생성 (Viewer3D 요청)
    this.sceneManager.eventBus.emit('SPAWN_FURNITURE', this.furnitureData);
  }

  undo(): void {
    this.sceneManager.objectManager.removeFurniture(this.furnitureData.uid);
    this.sceneManager.eventBus.emit('DESPAWN_FURNITURE', this.furnitureData.uid);
  }
}
```

---

## 5. Integration Checklist for Claude Code

이 가이드를 바탕으로 다음 순서대로 코드를 작성하라.

1. **[Type Definition]** IAssetMetadata, IFurnitureInstance 인터페이스 작성.
2. **[Mock Data]** 테스트용 의자(Floor), 액자(Wall) JSON 데이터 생성.
3. **[Loader]** AssetLoader.ts 구현 (Draco 설정 포함).
4. **[Interaction]** DragDropController.ts 구현.
   * 핵심: `scene.pick` 사용 시 기존 벽/바닥 Mesh(Archiple 1.0에서 생성된 것)만 필터링하여 Raycasting 할 것.
5. **[Connection]** EventBus를 통해 React UI의 드래그 이벤트와 Babylon Controller 연결.

---

## 6. Technical Constraints

* **Dependency:** `@babylonjs/loaders` 패키지가 설치되어 있어야 한다.
* **Performance:** 동일한 에셋 복제 시 `mesh.createInstance` 또는 `ThinInstance`를 사용하여 Draw Call을 최소화한다.
* **State:** 현재 드래그 중인 상태는 `src/state` (React Side)가 아닌 `DragDropController` (Babylon Side) 내부에서 Observer Pattern으로 처리하여 리렌더링을 방지한다.
