import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import type { Room } from '../../core/types/Room';
import { v4 as uuidv4 } from 'uuid';

interface Graph {
  adjacencyList: Map<string, Set<string>>;
}

/**
 * RoomDetectionService - Automatic room detection from walls
 *
 * Algorithm:
 * 1. Build graph from walls (point ID → connected point IDs)
 * 2. Find all cycles using DFS
 * 3. Validate cycles (closed, clockwise, minimum area)
 * 4. Calculate area using Shoelace formula
 * 5. Create Room objects
 */
export class RoomDetectionService {
  /**
   * Detect all rooms from walls and points
   */
  detectRooms(walls: Wall[], points: Point[]): Room[] {
    if (walls.length < 3) return [];

    // Build point lookup map
    const pointMap = new Map<string, Point>();
    points.forEach((p) => pointMap.set(p.id, p));

    // Build graph
    const graph = this.buildGraph(walls);

    // Find all cycles
    const cycles = this.findAllCycles(graph);

    // Convert cycles to rooms
    const rooms: Room[] = [];
    for (const cycle of cycles) {
      const cyclePoints = cycle
        .map((pointId) => pointMap.get(pointId))
        .filter((p): p is Point => p !== undefined);

      if (this.isValidRoom(cyclePoints)) {
        const room = this.createRoom(cyclePoints, walls);
        rooms.push(room);
      }
    }

    return rooms;
  }

  /**
   * Build adjacency list graph from walls
   */
  private buildGraph(walls: Wall[]): Graph {
    const adjacencyList = new Map<string, Set<string>>();

    walls.forEach((wall) => {
      // Add edge from start to end
      if (!adjacencyList.has(wall.startPointId)) {
        adjacencyList.set(wall.startPointId, new Set());
      }
      adjacencyList.get(wall.startPointId)!.add(wall.endPointId);

      // Add edge from end to start (undirected graph)
      if (!adjacencyList.has(wall.endPointId)) {
        adjacencyList.set(wall.endPointId, new Set());
      }
      adjacencyList.get(wall.endPointId)!.add(wall.startPointId);
    });

    return { adjacencyList };
  }

  /**
   * Find all cycles in graph using DFS
   */
  private findAllCycles(graph: Graph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (
      node: string,
      parent: string | null,
      path: string[]
    ): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.adjacencyList.get(node) || new Set();

      for (const neighbor of neighbors) {
        // Skip parent to avoid trivial back-edge
        if (neighbor === parent) continue;

        if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          if (cycleStart !== -1) {
            const cycle = path.slice(cycleStart);
            // Only keep cycles with at least 3 nodes
            if (cycle.length >= 3) {
              // Check if this cycle is new (not a duplicate)
              if (!this.isDuplicateCycle(cycle, cycles)) {
                cycles.push([...cycle]);
              }
            }
          }
        } else if (!visited.has(neighbor)) {
          dfs(neighbor, node, path);
        }
      }

      path.pop();
      recursionStack.delete(node);
    };

    // Start DFS from each unvisited node
    for (const node of graph.adjacencyList.keys()) {
      if (!visited.has(node)) {
        dfs(node, null, []);
      }
    }

    return cycles;
  }

  /**
   * Check if cycle is duplicate (same set of points, regardless of order)
   */
  private isDuplicateCycle(cycle: string[], existingCycles: string[][]): boolean {
    const cycleSet = new Set(cycle);

    for (const existing of existingCycles) {
      if (existing.length !== cycle.length) continue;

      const existingSet = new Set(existing);
      if (this.areSetsEqual(cycleSet, existingSet)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if two sets are equal
   */
  private areSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  /**
   * Validate if cycle forms a valid room
   */
  private isValidRoom(points: Point[]): boolean {
    if (points.length < 3) return false;

    // Check minimum area (e.g., > 1 square meter)
    const area = this.calculateArea(points);
    const MIN_AREA = 1.0; // 1 m²

    return area >= MIN_AREA;
  }

  /**
   * Calculate polygon area using Shoelace formula
   * Assumes points are in order (clockwise or counter-clockwise)
   */
  calculateArea(points: Point[]): number {
    if (points.length < 3) return 0;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    area = Math.abs(area) / 2;

    // Convert from pixels² to m² (1 pixel = 10mm ⇒ 20 pixels = 1 meter)
    const PIXELS_PER_METER = 20;
    area = area / (PIXELS_PER_METER * PIXELS_PER_METER);

    return area;
  }

  /**
   * Create Room object from cycle
   */
  private createRoom(points: Point[], walls: Wall[]): Room {
    const pointIds = points.map((p) => p.id);
    const pointIdSet = new Set(pointIds);

    // Find walls that connect these points
    const roomWalls = walls
      .filter(
        (wall) =>
          pointIdSet.has(wall.startPointId) && pointIdSet.has(wall.endPointId)
      )
      .map((wall) => wall.id);

    const area = this.calculateArea(points);

    const room: Room = {
      id: uuidv4(),
      name: `Room ${Math.floor(Math.random() * 1000)}`,
      points: pointIds,
      walls: roomWalls,
      area,
    };

    return room;
  }

  /**
   * Order points in clockwise direction
   */
  private orderPointsClockwise(points: Point[]): Point[] {
    // Calculate centroid
    const centroid = {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
    };

    // Sort by angle from centroid
    return points.sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });
  }
}
