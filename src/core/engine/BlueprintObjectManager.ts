import type { Point } from '../types/Point';
import type { Wall } from '../types/Wall';
import type { Room } from '../types/Room';
import type { Door } from '../types/Door';
import type { Window } from '../types/Window';
import { Floorplan } from '../../floorplan/blueprint/floorplan';
import { eventBus } from '../events/EventBus';
import { FloorEvents } from '../events/FloorEvents';

/**
 * BlueprintObjectManager - Adapter that wraps blueprint Floorplan
 * Provides same interface as ObjectManager for backward compatibility
 */
export class BlueprintObjectManager {
  private floorplan: Floorplan;
  private doors: Map<string, Door> = new Map();
  private windows: Map<string, Window> = new Map();

  constructor() {
    this.floorplan = new Floorplan();

    // Listen to blueprint events and forward to existing event system
    this.floorplan.fireOnNewCorner((corner) => {
      const point: Point = {
        id: corner.id,
        x: corner.x,
        y: corner.y,
      };
      console.log('[BlueprintObjectManager] Blueprint corner created, emitting POINT_ADDED:', point);
      eventBus.emit(FloorEvents.POINT_ADDED, { point });
    });

    this.floorplan.fireOnNewWall((wall) => {
      const wallData: Wall = {
        id: wall.id,
        startPointId: wall.getStart().id,
        endPointId: wall.getEnd().id,
        thickness: wall.thickness,
        height: wall.height,
      };
      console.log('[BlueprintObjectManager] Blueprint wall created, emitting WALL_ADDED:', wallData);
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
  addPoint(point: Point): Point {
    console.log('[BlueprintObjectManager] addPoint called:', point);
    // Use larger tolerance (150mm) to match snap threshold
    // Prevents duplicate corners at same location, especially when zoomed in
    const existing = this.floorplan.overlappedCorner(point.x, point.y, 150);
    if (!existing) {
      const corner = this.floorplan.newCorner(point.x, point.y, point.id);
      console.log('[BlueprintObjectManager] Created corner:', corner.id, 'at', corner.x, corner.y);
      return { id: corner.id, x: corner.x, y: corner.y };
    } else {
      console.log('[BlueprintObjectManager] Using existing corner:', existing.id);
      return { id: existing.id, x: existing.x, y: existing.y };
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
    console.log('[BlueprintObjectManager] addWall called:', wall);
    console.log('[BlueprintObjectManager] Available corners:', this.floorplan.getCorners().map(c => c.id));

    const start = this.floorplan.getCorners().find(c => c.id === wall.startPointId);
    const end = this.floorplan.getCorners().find(c => c.id === wall.endPointId);

    console.log('[BlueprintObjectManager] Found corners:', { start: start?.id, end: end?.id });

    if (!start) {
      console.error('[BlueprintObjectManager] Wall start corner not found:', wall.startPointId);
      return;
    }
    if (!end) {
      console.error('[BlueprintObjectManager] Wall end corner not found:', wall.endPointId);
      return;
    }

    const blueprintWall = this.floorplan.newWall(start, end, wall.thickness, wall.height);
    console.log('[BlueprintObjectManager] Created wall:', blueprintWall.id, 'from', start.id, 'to', end.id, 'height:', wall.height);
  }

  getWall(id: string): Wall | undefined {
    const wall = this.floorplan.getWalls().find(w => w.id === id);
    if (!wall) return undefined;
    return {
      id: wall.id,
      startPointId: wall.getStart().id,
      endPointId: wall.getEnd().id,
      thickness: wall.thickness,
      height: wall.height,
    };
  }

  getAllWalls(): Wall[] {
    return this.floorplan.getWalls().map(wall => ({
      id: wall.id,
      startPointId: wall.getStart().id,
      endPointId: wall.getEnd().id,
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
  addRoom(_room: Room): void {
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

      // Find walls that connect consecutive corners
      const walls: string[] = [];
      const allWalls = this.floorplan.getWalls();

      for (let i = 0; i < room.corners.length; i++) {
        const curr = room.corners[i];
        const next = room.corners[(i + 1) % room.corners.length];

        // Find wall connecting curr and next
        const wall = allWalls.find(w =>
          (w.getStart().id === curr.id && w.getEnd().id === next.id) ||
          (w.getStart().id === next.id && w.getEnd().id === curr.id)
        );

        if (wall) {
          walls.push(wall.id);
        }
      }

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
        walls,
        area,
      };
    });
  }

  updateRoom(_id: string, _updates: Partial<Room>): void {
    // Rooms are managed by blueprint, can't update directly
    console.log('[BlueprintObjectManager] Rooms are auto-managed by blueprint');
  }

  removeRoom(_id: string): void {
    // Rooms are auto-managed by blueprint
    console.log('[BlueprintObjectManager] Rooms are auto-managed by blueprint');
  }

  // Door management
  addDoor(door: Door): void {
    console.log('[BlueprintObjectManager] addDoor called:', door);
    this.doors.set(door.id, door);
    eventBus.emit(FloorEvents.DOOR_ADDED, { door });
  }

  getDoor(id: string): Door | undefined {
    return this.doors.get(id);
  }

  getAllDoors(): Door[] {
    return Array.from(this.doors.values());
  }

  updateDoor(id: string, updates: Partial<Door>): void {
    const door = this.doors.get(id);
    if (door) {
      Object.assign(door, updates);
      eventBus.emit(FloorEvents.DOOR_MODIFIED, { door });
    }
  }

  removeDoor(id: string): void {
    const door = this.doors.get(id);
    if (door) {
      this.doors.delete(id);
      eventBus.emit(FloorEvents.DOOR_REMOVED, { door });
    }
  }

  // Window management
  addWindow(window: Window): void {
    console.log('[BlueprintObjectManager] addWindow called:', window);
    this.windows.set(window.id, window);
    eventBus.emit(FloorEvents.WINDOW_ADDED, { window });
  }

  getWindow(id: string): Window | undefined {
    return this.windows.get(id);
  }

  getAllWindows(): Window[] {
    return Array.from(this.windows.values());
  }

  updateWindow(id: string, updates: Partial<Window>): void {
    const window = this.windows.get(id);
    if (window) {
      Object.assign(window, updates);
      eventBus.emit(FloorEvents.WINDOW_MODIFIED, { window });
    }
  }

  removeWindow(id: string): void {
    const window = this.windows.get(id);
    if (window) {
      this.windows.delete(id);
      eventBus.emit(FloorEvents.WINDOW_REMOVED, { window });
    }
  }

  clear(): void {
    const corners = [...this.floorplan.getCorners()];
    const walls = [...this.floorplan.getWalls()];
    corners.forEach(c => c.remove());
    walls.forEach(w => w.remove());
    this.doors.clear();
    this.windows.clear();
  }

  getCounts(): { points: number; walls: number; rooms: number; doors: number; windows: number } {
    return {
      points: this.floorplan.getCorners().length,
      walls: this.floorplan.getWalls().length,
      rooms: this.floorplan.getRooms().length,
      doors: this.doors.size,
      windows: this.windows.size,
    };
  }
}
