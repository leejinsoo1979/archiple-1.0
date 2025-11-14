# Archiple 1.0

> Professional 2D/3D Floor Plan Editor with Enterprise Architecture

Archiple is a powerful, extensible floor plan editor built with enterprise-level architecture patterns. Create, edit, and visualize floor plans in real-time with seamless 2D-to-3D conversion.

## ✨ Features

### 2D Floor Plan Editor
- ✏️ **Draw Tools**: Walls, rooms, openings with precision
- 🎯 **Smart Snapping**: Grid, point, and angle snapping
- 📐 **Geometry Tools**: Automatic room detection and measurement
- 🔄 **Undo/Redo**: Full command history with unlimited steps
- 🎨 **Layer System**: Organized rendering with z-index management

### 3D Visualization
- 🏗️ **Real-time 3D**: Instant 2D-to-3D conversion
- 🎥 **Camera Controls**: WASD navigation + orbit controls
- 💡 **Lighting**: Realistic lighting with shadows
- 🎨 **Materials**: PBR materials for walls, floors, ceilings

### Enterprise Architecture
- 🏛️ **SOLID Principles**: Maintainable, extensible codebase
- 🎯 **Design Patterns**: Command, Observer, Factory, Singleton
- 🔌 **Event-Driven**: Loosely coupled with EventBus
- 📦 **Modular**: Independent core, floorplan, and viewer3d modules

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173` to see the editor.

### Build for Production

```bash
npm run build
npm run preview
```

## 📖 Documentation

- [Architecture Guide](./ARCHITECTURE.md) - Detailed architecture overview

## 🏗️ Project Structure

```
archiple-1.0/
├── src/
│   ├── core/           # Business logic (framework-agnostic)
│   ├── floorplan/      # 2D editor engine
│   ├── viewer3d/       # Babylon.js 3D viewer
│   ├── ui/             # React components
│   ├── state/          # State management
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utilities and constants
│
├── public/             # Static assets
└── ARCHITECTURE.md     # Architecture documentation
```

## 📦 Tech Stack

### Core
- **TypeScript 5.x** - Type safety
- **React 19** - UI framework
- **Vite 7.x** - Build tool

### 3D Rendering
- **Babylon.js** - WebGL 3D engine
- **@babylonjs/core** - Core 3D functionality
- **@babylonjs/loaders** - Model loading
- **@babylonjs/gui** - 3D UI components

## 🗺️ Roadmap

### Phase 1: Foundation (✅ Complete)
- [x] Project setup with Vite + React + TypeScript
- [x] Basic 2D/3D split layout
- [x] Canvas rendering with coordinate tracking
- [x] Enterprise architecture implementation

### Phase 2: Core Features (🚧 In Progress)
- [ ] Wall drawing tool
- [ ] Point snapping
- [ ] Room detection
- [ ] Basic 2D-to-3D conversion

### Phase 3: Advanced Features
- [ ] Door and window placement
- [ ] Material editor
- [ ] Measurement tools
- [ ] Export (JSON, SVG, PNG, GLB)

## 📄 License

This project is licensed under the MIT License.

---

Made with ❤️ by the Archiple Team
