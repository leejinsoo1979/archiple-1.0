import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import type { Room } from '../../core/types/Room';
import { v4 as uuidv4 } from 'uuid';

/**
 * RoomDetectionService - Simple cycle-based room detection
 *
 * Algorithm:
 * 1. Build undirected graph from walls
 * 2. Find all simple cycles using DFS
 * 3. Filter by minimum area
 * 4. Remove duplicate/nested cycles
 */
export class RoomDetectionService {
  /**
   * Detect all rooms from walls and points
   */
  detectRooms(walls: Wall[], points: Point[]): Room[] {
    if (walls.length < 3) {
      console.log('[RoomDetection] Not enough walls');
      return [];
    }

    // Build point lookup map
    const pointMap = new Map<string, Point>();
    points.forEach((p) => pointMap.set(p.id, p));

    // Build adjacency list
    const graph = this.buildGraph(walls);

    console.log('[RoomDetection] Graph built with', graph.size, 'vertices');

    // Find all cycles
    const cycles = this.findAllCycles(graph, pointMap);

    console.log('[RoomDetection] Found', cycles.length, 'raw cycles');

    // Convert to rooms
    const rooms: Room[] = [];
    for (const cycle of cycles) {
      const cyclePoints = cycle.map(id => pointMap.get(id)!);
      const area = Math.abs(this.calculateSignedArea(cyclePoints));

      const MIN_AREA = 0.5; // 0.5 m²

      if (area >= MIN_AREA) {
        const room = this.createRoom(cycle, walls, area);
        rooms.push(room);
      }
    }

    console.log('[RoomDetection] Created', rooms.length, 'rooms');
    return rooms;
  }

  /**
   * Build adjacency list
   */
  private buildGraph(walls: Wall[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const wall of walls) {
      if (!graph.has(wall.startPointId)) {
        graph.set(wall.startPointId, new Set());
      }
      if (!graph.has(wall.endPointId)) {
        graph.set(wall.endPointId, new Set());
      }

      graph.get(wall.startPointId)!.add(wall.endPointId);
      graph.get(wall.endPointId)!.add(wall.startPointId);
    }

    return graph;
  }

  /**
   * Find all simple cycles using DFS
   */
  private findAllCycles(graph: Map<string, Set<string>>, pointMap: Map<string, Point>): string[][] {
    const allCycles: string[][] = [];
    const visited = new Set<string>();

    for (const startNode of graph.keys()) {
      if (visited.has(startNode)) continue;

      // DFS from this node
      this.dfs(startNode, startNode, [startNode], new Set([startNode]), graph, allCycles, visited);
      visited.add(startNode);
    }

    // Deduplicate cycles (same set of points)
    const unique = this.deduplicateCycles(allCycles);

    // Sort by area (smallest first - these are the "minimal" rooms)
    unique.sort((a, b) => {
      const areaA = Math.abs(this.calculateSignedArea(a.map(id => pointMap.get(id)!)));
      const areaB = Math.abs(this.calculateSignedArea(b.map(id => pointMap.get(id)!)));
      return areaA - areaB;
    });

    return unique;
  }

  /**
   * DFS to find cycles
   */
  private dfs(
    current: string,
    start: string,
    path: string[],
    pathSet: Set<string>,
    graph: Map<string, Set<string>>,
    allCycles: string[][],
    globalVisited: Set<string>
  ): void {
    const neighbors = graph.get(current) || new Set();

    for (const neighbor of neighbors) {
      // Found a cycle back to start
      if (neighbor === start && path.length >= 3) {
        // Only add if we haven't seen this cycle yet
        allCycles.push([...path]);
        continue;
      }

      // Skip if already in path (avoid revisiting)
      if (pathSet.has(neighbor)) continue;

      // Skip if globally visited (optimization)
      if (globalVisited.has(neighbor)) continue;

      // Continue DFS
      path.push(neighbor);
      pathSet.add(neighbor);
      this.dfs(neighbor, start, path, pathSet, graph, allCycles, globalVisited);
      path.pop();
      pathSet.delete(neighbor);
    }
  }

  /**
   * Remove duplicate cycles
   */
  private deduplicateCycles(cycles: string[][]): string[][] {
    const unique: string[][] = [];
    const seen = new Set<string>();

    for (const cycle of cycles) {
      // Create a canonical representation (sorted)
      const sorted = [...cycle].sort().join(',');

      if (!seen.has(sorted)) {
        seen.add(sorted);
        unique.push(cycle);
      }
    }

    return unique;
  }

  /**
   * Calculate signed area
   */
  private calculateSignedArea(points: Point[]): number {
    if (points.length < 3) return 0;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }

    area = area / 2;

    // Convert from mm² to m²
    const PIXELS_PER_METER = 1000;
    area = area / (PIXELS_PER_METER * PIXELS_PER_METER);

    return area;
  }

  /**
   * Create room from cycle
   */
  private createRoom(pointIds: string[], walls: Wall[], area: number): Room {
    const pointIdSet = new Set(pointIds);

    // Find walls connecting consecutive points in the cycle
    const wallIds: string[] = [];
    for (let i = 0; i < pointIds.length; i++) {
      const curr = pointIds[i];
      const next = pointIds[(i + 1) % pointIds.length];

      const wall = walls.find(
        (w) =>
          (w.startPointId === curr && w.endPointId === next) ||
          (w.startPointId === next && w.endPointId === curr)
      );

      if (wall) {
        wallIds.push(wall.id);
      }
    }

    return {
      id: uuidv4(),
      name: `Room ${Math.floor(Math.random() * 1000)}`,
      points: pointIds,
      walls: wallIds,
      area: Math.abs(area),
    };
  }
}
