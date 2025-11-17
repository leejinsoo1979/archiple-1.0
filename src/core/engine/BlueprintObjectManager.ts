import type { Point } from '../types/Point';
import type { Wall } from '../types/Wall';
import type { Room } from '../types/Room';
import { Floorplan } from '../../floorplan/blueprint/floorplan';
import { eventBus } from '../events/EventBus';
import { FloorEvents } from '../events/FloorEvents';

/**
 * BlueprintObjectManager - Adapter that wraps blueprint Floorplan
 * Provides same interface as ObjectManager for backward compatibility
 */
export class BlueprintObjectManager {
  private floorplan: Floorplan;

  constructor() {
    this.floorplan = new Floorplan();

    // Listen to blueprint events and forward to existing event system
    this.floorplan.fireOnNewCorner((corner) => {
      const point: Point = {
        id: corner.id,
        x: corner.x,
        y: corner.y,
      };
      eventBus.emit(FloorEvents.POINT_ADDED, { point });
    });

    this.floorplan.fireOnNewWall((wall) => {
      const wallData: Wall = {
        id: wall.id,
        start: wall.getStart().id,
        end: wall.getEnd().id,
        thickness: wall.thickness,
        height: wall.height,
      };
      eventBus.emit(FloorEvents.WALL_ADDED, { wall: wallData });
    });

    this.floorplan.fireOnUpdatedRooms(() => {
      const rooms = this.getAllRooms();
      rooms.forEach(room => {
        eventBus.emit(FloorEvents.ROOM_DETECTED, { room });
      });
    });
  }

  getFloorplan(): Floorplan {
    return this.floorplan;
  }

  // Point management (maps to blueprint Corner)
  addPoint(point: Point): void {
    const existing = this.floorplan.overlappedCorner(point.x, point.y, 1);
    if (!existing) {
      this.floorplan.newCorner(point.x, point.y, point.id);
    }
  }

  getPoint(id: string): Point | undefined {
    const corner = this.floorplan.getCorners().find(c => c.id === id);
    if (!corner) return undefined;
    return {
      id: corner.id,
      x: corner.x,
      y: corner.y,
    };
  }

  getAllPoints(): Point[] {
    return this.floorplan.getCorners().map(corner => ({
      id: corner.id,
      x: corner.x,
      y: corner.y,
    }));
  }

  updatePoint(id: string, updates: Partial<Point>): void {
    const corner = this.floorplan.getCorners().find(c => c.id === id);
    if (corner && updates.x !== undefined && updates.y !== undefined) {
      corner.moveAbs(updates.x, updates.y);
      eventBus.emit(FloorEvents.POINT_MOVED, {
        point: { id: corner.id, x: corner.x, y: corner.y }
      });
    }
  }

  removePoint(id: string): void {
    const corner = this.floorplan.getCorners().find(c => c.id === id);
    if (corner) {
      corner.removeAll();
      eventBus.emit(FloorEvents.POINT_REMOVED, {
        point: { id, x: corner.x, y: corner.y }
      });
    }
  }

  // Wall management
  addWall(wall: Wall): void {
    const start = this.floorplan.getCorners().find(c => c.id === wall.start);
    const end = this.floorplan.getCorners().find(c => c.id === wall.end);

    if (!start) {
      console.error('[BlueprintObjectManager] Wall start corner not found:', wall.start);
      return;
    }
    if (!end) {
      console.error('[BlueprintObjectManager] Wall end corner not found:', wall.end);
      return;
    }

    const blueprintWall = this.floorplan.newWall(start, end);
    blueprintWall.thickness = wall.thickness;
    blueprintWall.height = wall.height;
  }

  getWall(id: string): Wall | undefined {
    const wall = this.floorplan.getWalls().find(w => w.id === id);
    if (!wall) return undefined;
    return {
      id: wall.id,
      start: wall.getStart().id,
      end: wall.getEnd().id,
      thickness: wall.thickness,
      height: wall.height,
    };
  }

  getAllWalls(): Wall[] {
    return this.floorplan.getWalls().map(wall => ({
      id: wall.id,
      start: wall.getStart().id,
      end: wall.getEnd().id,
      thickness: wall.thickness,
      height: wall.height,
    }));
  }

  updateWall(id: string, updates: Partial<Wall>): void {
    const wall = this.floorplan.getWalls().find(w => w.id === id);
    if (wall) {
      if (updates.thickness !== undefined) wall.thickness = updates.thickness;
      if (updates.height !== undefined) wall.height = updates.height;
      wall.fireMoved();
    }
  }

  removeWall(id: string): void {
    const wall = this.floorplan.getWalls().find(w => w.id === id);
    if (wall) {
      wall.remove();
    }
  }

  // Room management
  addRoom(room: Room): void {
    // Rooms are auto-detected by blueprint, no manual add needed
    console.log('[BlueprintObjectManager] Rooms are auto-detected, skipping manual add');
  }

  getRoom(id: string): Room | undefined {
    const rooms = this.getAllRooms();
    return rooms.find(r => r.id === id);
  }

  getAllRooms(): Room[] {
    return this.floorplan.getRooms().map((room, idx) => {
      const points = room.corners.map(c => c.id);

      // Calculate area (mm² -> m²)
      let area = 0;
      if (room.corners.length >= 3) {
        for (let i = 0; i < room.corners.length; i++) {
          const curr = room.corners[i];
          const next = room.corners[(i + 1) % room.corners.length];
          area += curr.x * next.y - next.x * curr.y;
        }
        area = Math.abs(area / 2);
      }
      area = area / 1000000; // mm² to m²

      return {
        id: `room-${idx}`,
        name: `Room ${idx + 1}`,
        points,
        area,
        perimeter: 0, // TODO: calculate
      };
    });
  }

  updateRoom(id: string, updates: Partial<Room>): void {
    // Rooms are managed by blueprint, can't update directly
    console.log('[BlueprintObjectManager] Rooms are auto-managed by blueprint');
  }

  removeRoom(id: string): void {
    // Rooms are auto-managed by blueprint
    console.log('[BlueprintObjectManager] Rooms are auto-managed by blueprint');
  }

  clear(): void {
    const corners = [...this.floorplan.getCorners()];
    const walls = [...this.floorplan.getWalls()];
    corners.forEach(c => c.remove());
    walls.forEach(w => w.remove());
  }
}
