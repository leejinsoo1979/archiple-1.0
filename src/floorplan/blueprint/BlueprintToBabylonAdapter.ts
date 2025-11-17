import type { Floorplan } from './floorplan';
import type { Corner } from './corner';
import type { Wall } from './wall';
import type { Room } from './room';

/**
 * Adapter to convert blueprint Floorplan data to Babylon3DCanvas format
 * 2D coordinates are already in mm (new system)
 * No conversion needed - pass through directly
 * Babylon3DCanvas will convert mm to meters with * 0.001
 */

export interface BabylonPoint {
  id: string;
  x: number; // mm (already in mm)
  y: number; // mm (already in mm)
}

export interface BabylonWall {
  id: string;
  startPointId: string; // point id
  endPointId: string; // point id
  thickness: number; // mm
  height: number; // mm
}

export interface BabylonRoom {
  id: string;
  name: string;
  points: string[]; // point ids (CCW order)
  area: number; // mm�
}

export interface BabylonFloorplanData {
  points: BabylonPoint[];
  walls: BabylonWall[];
  rooms: BabylonRoom[];
  floorplan: Floorplan; // Blueprint floorplan object for HalfEdge geometry
}

/**
 * Convert blueprint Floorplan to Babylon3DCanvas data format
 * All coordinates are already in mm - pass through directly
 */
export function convertFloorplanToBabylon(floorplan: Floorplan): BabylonFloorplanData {
  const corners = floorplan.getCorners();
  const walls = floorplan.getWalls();
  const rooms = floorplan.getRooms();

  // Pass through corners (already in mm)
  const points: BabylonPoint[] = corners.map(corner => ({
    id: corner.id,
    x: corner.x, // Already in mm
    y: corner.y, // Already in mm
  }));

  // Pass through walls (already in mm)
  const babylonWalls: BabylonWall[] = walls.map(wall => ({
    id: wall.id,
    startPointId: wall.getStart().id,
    endPointId: wall.getEnd().id,
    thickness: wall.thickness, // Already in mm (100mm = 10cm)
    height: wall.height, // Already in mm (2400mm = 2.4m)
  }));

  // Convert rooms
  const babylonRooms: BabylonRoom[] = rooms.map((room, index) => {
    const roomPoints = room.corners.map(c => c.id);

    // Calculate area (mm�)
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
    floorplan, // Pass blueprint floorplan for HalfEdge geometry
  };
}

/**
 * Calculate room area using Shoelace formula
 * @param corners Room corners in CCW order
 * @returns Area in mm�
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
 * Creates a 2800mm x 2800mm room with 100mm thick walls and 2400mm height
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
      { id: 'w1', startPointId: 'p1', endPointId: 'p2', thickness: 100, height: 2400 },
      { id: 'w2', startPointId: 'p2', endPointId: 'p3', thickness: 100, height: 2400 },
      { id: 'w3', startPointId: 'p3', endPointId: 'p4', thickness: 100, height: 2400 },
      { id: 'w4', startPointId: 'p4', endPointId: 'p1', thickness: 100, height: 2400 },
    ],
    rooms: [
      {
        id: 'room-1',
        name: 'Test Room',
        points: ['p1', 'p2', 'p3', 'p4'],
        area: 2800 * 2800, // mm�
      },
    ],
  };
}
