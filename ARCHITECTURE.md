# Archiple 1.0 - Enterprise Architecture

## Overview

Archiple is a professional-grade 2D/3D floor plan editor built with enterprise-level architecture patterns, inspired by industry leaders like Coohom and CraftPixel.

## Architecture Principles

### 1. Separation of Concerns
- **Core Engine**: Completely independent business logic
- **Floorplan 2D**: Separate rendering and interaction layer
- **Viewer 3D**: Isolated Babylon.js integration
- **UI Components**: Reusable, modular interface elements

### 2. Design Patterns
- **Command Pattern**: Undo/Redo functionality
- **Observer Pattern**: EventBus for decoupled communication
- **Singleton Pattern**: SceneManager coordination
- **Factory Pattern**: Object and mesh creation
- **Layer Pattern**: Rendering with z-index management

### 3. Data Flow
```
User Input → Controller → Command → Manager → Model → Event → Renderer → View
```

## Directory Structure

```
src/
├── core/                      # Core business logic (framework-agnostic)
│   ├── engine/               # Central management systems
│   │   ├── SceneManager.ts   # Main coordinator
│   │   ├── ObjectManager.ts  # Object lifecycle
│   │   ├── SelectionManager.ts # Selection state
│   │   └── HistoryManager.ts # Undo/Redo
│   │
│   ├── commands/             # Command pattern for undo/redo
│   │   ├── Command.ts       # Base interface
│   │   └── AddWallCommand.ts # Example implementation
│   │
│   ├── events/              # Event-driven architecture
│   │   ├── EventBus.ts     # Pub/sub system
│   │   ├── EditorEvents.ts # Editor event types
│   │   └── FloorEvents.ts  # Floorplan event types
│   │
│   ├── math/               # Mathematical utilities
│   │   ├── Vector2.ts      # 2D vector operations
│   │   ├── Geometry.ts     # Intersection, distance, area
│   │   └── Snap.ts         # Grid and point snapping
│   │
│   └── types/              # TypeScript interfaces
│       ├── Point.ts
│       ├── Wall.ts
│       ├── Room.ts
│       ├── EditorState.ts
│       └── MeshTypes.ts
│
├── floorplan/              # 2D floorplan engine
│   ├── canvas/            # Canvas rendering
│   ├── tools/             # Drawing tools (wall, select, move, erase)
│   ├── models/            # Data models
│   ├── controllers/       # Input handling
│   ├── services/          # Business logic services
│   └── renderer/          # Layer-based rendering
│       ├── layers/        # Grid, walls, points, rooms
│       ├── pixi/          # PixiJS implementation (future)
│       └── canvas2d/      # Canvas 2D implementation
│
├── viewer3d/              # 3D Babylon.js viewer
│   ├── scene/            # Scene setup
│   ├── converters/       # 2D → 3D conversion
│   ├── loaders/          # Asset loading
│   ├── materials/        # Material definitions
│   └── controllers/      # Camera and interaction
│
├── ui/                   # User interface components
│   ├── panels/          # Side panels
│   ├── sidebar/         # Tool sidebar
│   ├── toolbar/         # Top toolbar
│   └── modals/          # Dialogs
│
├── state/               # State management
├── hooks/               # React custom hooks
└── lib/                 # Utilities
    ├── utils.ts
    └── constants.ts
```

## Key Systems

### 1. Scene Manager
Central coordinator managing:
- Object lifecycle (ObjectManager)
- Selection state (SelectionManager)
- History stack (HistoryManager)
- Tool state
- Configuration

### 2. Event Bus
Decoupled communication system:
- Editor events (tool changes, selection)
- Floorplan events (points, walls, rooms)
- 3D viewer events (camera, rendering)

### 3. Command System
Undo/Redo implementation:
- Every action is a Command
- Commands are reversible
- History stack management
- Batch operations support

### 4. Layer Rendering
Z-indexed rendering system:
- Grid (background)
- Rooms (fill)
- Walls
- Points
- Selection overlay
- UI elements

## Data Models

### Point
```typescript
interface Point {
  id: string;
  x: number;
  y: number;
  isSnapped?: boolean;
  connectedWalls?: string[];
}
```

### Wall
```typescript
interface Wall {
  id: string;
  startPointId: string;
  endPointId: string;
  thickness: number;
  height: number;
  material?: string;
}
```

### Room
```typescript
interface Room {
  id: string;
  name: string;
  points: string[];
  walls: string[];
  area: number;
  materials?: RoomMaterials;
}
```

## Integration Points

### 2D → 3D Conversion
1. Floorplan emits `ROOM_CREATED` event
2. Converter listens and transforms:
   - Points → 3D vertices
   - Walls → Extruded meshes
   - Rooms → Floor/ceiling polygons
3. Babylon scene updates automatically

### State Synchronization
- EventBus ensures loose coupling
- Managers maintain single source of truth
- React hooks provide reactive UI updates

## Performance Optimizations

1. **Throttled Rendering**: 60fps cap with requestAnimationFrame
2. **Spatial Indexing**: Grid-based collision detection
3. **Lazy Loading**: 3D assets loaded on demand
4. **Memoization**: React.memo for expensive renders
5. **Web Workers**: Complex calculations offloaded (future)

## Extensibility

### Adding New Tools
1. Extend `Tool` base class
2. Implement `handleMouseDown/Move/Up`
3. Register in ToolManager
4. Add UI button

### Adding New Commands
1. Extend `Command` base class
2. Implement `execute()` and `undo()`
3. Use via HistoryManager

### Adding New Renderers
1. Implement renderer interface
2. Add to renderer layer system
3. Subscribe to relevant events

## Testing Strategy

1. **Unit Tests**: Core math and utilities
2. **Integration Tests**: Manager interactions
3. **E2E Tests**: Full user workflows
4. **Visual Tests**: Rendering consistency

## Future Enhancements

- [ ] PixiJS renderer for better performance
- [ ] ARKit integration for mobile
- [ ] VR mode for immersive viewing
- [ ] Multiplayer collaboration
- [ ] Cloud save/sync
- [ ] AI-powered room suggestions
- [ ] Real-time lighting simulation
- [ ] Material physics

## Dependencies

### Core
- TypeScript 5.x
- React 19.x
- Vite 7.x

### 3D Rendering
- @babylonjs/core
- @babylonjs/loaders
- @babylonjs/gui
- @babylonjs/inspector

### Future
- PixiJS (2D rendering)
- Socket.io (multiplayer)
- Three.js (alternative 3D)

## Contributing

See CONTRIBUTING.md for development guidelines.

## License

MIT License - See LICENSE file for details.
