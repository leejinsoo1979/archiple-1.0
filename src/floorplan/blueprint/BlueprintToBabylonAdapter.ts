import type { Floorplan } from './floorplan';
import type { Corner } from './corner';
import type { Wall } from './wall';
import type { Room } from './room';

/**
 * Adapter to convert blueprint Floorplan data to Babylon3DCanvas format
 * 2D coordinates are in pixels, need to convert to mm for 3D
 * Scale: 1 pixel = 10mm = 1cm
 * Babylon3DCanvas will convert mm to meters with * 0.001
 */

export interface BabylonPoint {
  id: string;
  x: number; // mm (converted from pixels)
  y: number; // mm (converted from pixels)
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
 * Converts pixels to mm: 1 pixel = 10mm
 */
export function convertFloorplanToBabylon(floorplan: Floorplan): BabylonFloorplanData {
  const corners = floorplan.getCorners();
  const walls = floorplan.getWalls();
  const rooms = floorplan.getRooms();

  const PIXELS_TO_MM = 10; // 1 pixel = 10mm = 1cm

  // Convert corners to points (pixels → mm)
  const points: BabylonPoint[] = corners.map(corner => ({
    id: corner.id,
    x: corner.x * PIXELS_TO_MM, // pixels → mm
    y: corner.y * PIXELS_TO_MM, // pixels → mm
  }));

  // Convert walls (thickness: pixels → mm, height: already mm)
  const babylonWalls: BabylonWall[] = walls.map(wall => ({
    id: wall.id,
    startPointId: wall.getStart().id,
    endPointId: wall.getEnd().id,
    thickness: wall.thickness * PIXELS_TO_MM, // pixels → mm (20px → 200mm)
    height: wall.height, // Already in mm (2800mm)
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
      { id: 'w1', startPointId: 'p1', endPointId: 'p2', thickness: 200, height: 2800 },
      { id: 'w2', startPointId: 'p2', endPointId: 'p3', thickness: 200, height: 2800 },
      { id: 'w3', startPointId: 'p3', endPointId: 'p4', thickness: 200, height: 2800 },
      { id: 'w4', startPointId: 'p4', endPointId: 'p1', thickness: 200, height: 2800 },
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
