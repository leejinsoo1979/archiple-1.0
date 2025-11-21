import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import { Vector2 } from '../../core/math/Vector2';
import { v4 as uuidv4 } from 'uuid';

/**
 * WallSplitService - Split walls at T-junctions
 *
 * When a point lies on a wall (not at endpoints), split the wall into two segments.
 * This allows proper room detection and individual wall selection.
 */
export class WallSplitService {
  /**
   * Split walls at T-junctions where points lie on wall midpoints
   * Returns new walls array with split segments and new points that were created
   */
  splitWallsAtTJunctions(
    walls: Wall[],
    points: Point[]
  ): { walls: Wall[]; newPoints: Point[]; removedWallIds: string[] } {
    const pointMap = new Map(points.map(p => [p.id, p]));
    const newWalls: Wall[] = [];
    const newPoints: Point[] = [];
    const removedWallIds: string[] = [];
    const processedWalls = new Set<string>();

    console.log('[WallSplit] Starting wall split analysis for', walls.length, 'walls and', points.length, 'points');

    for (const wall of walls) {
      if (processedWalls.has(wall.id)) continue;

      const start = pointMap.get(wall.startPointId);
      const end = pointMap.get(wall.endPointId);
      if (!start || !end) {
        newWalls.push(wall);
        continue;
      }

      // Find all points that lie on this wall (excluding endpoints)
      const pointsOnWall: { point: Point; t: number }[] = [];
      const startVec = Vector2.from(start);
      const endVec = Vector2.from(end);
      const wallVec = endVec.subtract(startVec);
      const lenSq = wallVec.lengthSquared();

      if (lenSq < 0.0001) {
        // Zero-length wall, skip
        newWalls.push(wall);
        continue;
      }

      // Check all points to see if they lie on this wall
      for (const p of points) {
        if (p.id === start.id || p.id === end.id) continue;

        // Optimization: Check bounding box first
        const minX = Math.min(start.x, end.x) - 10;
        const maxX = Math.max(start.x, end.x) + 10;
        const minY = Math.min(start.y, end.y) - 10;
        const maxY = Math.max(start.y, end.y) + 10;

        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;

        const pVec = Vector2.from(p);
        const t = pVec.subtract(startVec).dot(wallVec) / lenSq;

        if (t > 0.001 && t < 0.999) {
          const projected = startVec.add(wallVec.multiply(t));
          const dist = pVec.distanceTo(projected);
          if (dist < 10) {
            // 10mm tolerance
            pointsOnWall.push({ point: p, t });
          }
        }
      }

      if (pointsOnWall.length === 0) {
        // No T-junctions on this wall, keep as-is
        newWalls.push(wall);
      } else {
        // Sort points by position along wall
        pointsOnWall.sort((a, b) => a.t - b.t);

        console.log(
          `[WallSplit] Splitting wall ${wall.id.slice(0, 8)} at ${pointsOnWall.length} T-junction(s)`
        );

        // Split wall into segments
        const allPointsOnWall = [
          { point: start, t: 0 },
          ...pointsOnWall,
          { point: end, t: 1 },
        ];

        for (let i = 0; i < allPointsOnWall.length - 1; i++) {
          const segmentStart = allPointsOnWall[i].point;
          const segmentEnd = allPointsOnWall[i + 1].point;

          // Create new wall segment
          const newWall: Wall = {
            id: uuidv4(),
            startPointId: segmentStart.id,
            endPointId: segmentEnd.id,
            thickness: wall.thickness,
            height: wall.height,
          };

          newWalls.push(newWall);

          console.log(
            `[WallSplit] Created segment ${newWall.id.slice(0, 8)}: ${segmentStart.id.slice(0, 8)} -> ${segmentEnd.id.slice(0, 8)}`
          );
        }

        // Mark original wall for removal
        removedWallIds.push(wall.id);
        processedWalls.add(wall.id);
      }
    }

    console.log(
      `[WallSplit] Split complete: ${walls.length} walls -> ${newWalls.length} walls (${removedWallIds.length} removed, ${newWalls.length - walls.length + removedWallIds.length} added)`
    );

    return { walls: newWalls, newPoints, removedWallIds };
  }
}
