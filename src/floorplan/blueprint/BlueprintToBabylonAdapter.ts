import type { Floorplan } from './floorplan';
import type { Corner } from './corner';
import type { Wall } from './wall';
import type { Room } from './room';

/**
 * Adapter to convert blueprint Floorplan data to Babylon3DCanvas format
 * All units in mm, Babylon3DCanvas will convert to meters with * 0.001
 */

export interface BabylonPoint {
  id: string;
  x: number; // mm
  y: number; // mm
}

export interface BabylonWall {
  id: string;
  start: string; // point id
  end: string; // point id
  thickness: number; // mm
  height: number; // mm
}

export interface BabylonRoom {
  id: string;
  name: string;
  points: string[]; // point ids (CCW order)
  area: number; // mm²
}

export interface BabylonFloorplanData {
  points: BabylonPoint[];
  walls: BabylonWall[];
  rooms: BabylonRoom[];
}

/**
 * Convert blueprint Floorplan to Babylon3DCanvas data format
 */
export function convertFloorplanToBabylon(floorplan: Floorplan): BabylonFloorplanData {
  const corners = floorplan.getCorners();
  const walls = floorplan.getWalls();
  const rooms = floorplan.getRooms();

  // Convert corners to points
  const points: BabylonPoint[] = corners.map(corner => ({
    id: corner.id,
    x: corner.x, // Already in mm
    y: corner.y, // Already in mm
  }));

  // Convert walls
  const babylonWalls: BabylonWall[] = walls.map(wall => ({
    id: wall.id,
    start: wall.getStart().id,
    end: wall.getEnd().id,
    thickness: wall.thickness, // mm
    height: wall.height, // mm
  }));

  // Convert rooms
  const babylonRooms: BabylonRoom[] = rooms.map((room, index) => {
    const roomPoints = room.corners.map(c => c.id);

    // Calculate area (mm²)
    const area = calculateRoomArea(room.corners);

    return {
      id: `room-${index}`,
      name: `Room ${index + 1}`,
      points: roomPoints,
      area,
    };
  });

  return {
    points,
    walls: babylonWalls,
    rooms: babylonRooms,
  };
}

/**
 * Calculate room area using Shoelace formula
 * @param corners Room corners in CCW order
 * @returns Area in mm²
 */
function calculateRoomArea(corners: Corner[]): number {
  if (corners.length < 3) return 0;

  let sum = 0;
  for (let i = 0; i < corners.length; i++) {
    const current = corners[i];
    const next = corners[(i + 1) % corners.length];
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum / 2);
}

/**
 * Create a simple test floorplan for verification
 * Creates a 2800mm x 2800mm room with 200mm thick walls
 */
export function createTestRoom(): BabylonFloorplanData {
  return {
    points: [
      { id: 'p1', x: 0, y: 0 },
      { id: 'p2', x: 2800, y: 0 },
      { id: 'p3', x: 2800, y: 2800 },
      { id: 'p4', x: 0, y: 2800 },
    ],
    walls: [
      { id: 'w1', start: 'p1', end: 'p2', thickness: 200, height: 2800 },
      { id: 'w2', start: 'p2', end: 'p3', thickness: 200, height: 2800 },
      { id: 'w3', start: 'p3', end: 'p4', thickness: 200, height: 2800 },
      { id: 'w4', start: 'p4', end: 'p1', thickness: 200, height: 2800 },
    ],
    rooms: [
      {
        id: 'room-1',
        name: 'Test Room',
        points: ['p1', 'p2', 'p3', 'p4'],
        area: 2800 * 2800, // mm²
      },
    ],
  };
}
