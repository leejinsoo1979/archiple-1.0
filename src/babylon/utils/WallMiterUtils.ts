/**
 * WallMiterUtils - 벽 연귀맞춤(Miter Joint) 계산 유틸리티
 *
 * 두 벽이 만나는 지점에서 완벽한 연결을 위한 코너 조정
 */

import type { Wall } from '../../core/types/Wall';
import type { Point } from '../../core/types/Point';

export interface WallConnection {
  wall: Wall;
  atStart: boolean; // true면 wall의 시작점, false면 끝점에서 연결
}

export interface WallConnections {
  startConnected: WallConnection | null;
  endConnected: WallConnection | null;
}

export interface WallCorners {
  startLeft: { x: number; z: number };
  startRight: { x: number; z: number };
  endLeft: { x: number; z: number };
  endRight: { x: number; z: number };
}

export interface WallDirection {
  x: number;
  z: number;
}

const EPSILON = 0.01; // mm 단위 오차 허용 (0.01mm)

/**
 * 두 점이 같은지 확인
 */
function pointsEqual(p1: Point, p2: Point, epsilon: number = EPSILON): boolean {
  return Math.abs(p1.x - p2.x) < epsilon && Math.abs(p1.y - p2.y) < epsilon;
}

/**
 * 연결된 벽 찾기
 */
export function findConnectedWalls(
  walls: Wall[],
  targetWall: Wall,
  pointMap: Map<string, Point>
): WallConnections {
  const connections: WallConnections = {
    startConnected: null,
    endConnected: null,
  };

  const targetStartPoint = pointMap.get(targetWall.startPointId);
  const targetEndPoint = pointMap.get(targetWall.endPointId);

  if (!targetStartPoint || !targetEndPoint) {
    return connections;
  }

  for (const wall of walls) {
    if (wall.id === targetWall.id) continue;

    const wallStartPoint = pointMap.get(wall.startPointId);
    const wallEndPoint = pointMap.get(wall.endPointId);

    if (!wallStartPoint || !wallEndPoint) continue;

    // targetWall의 시작점과 연결된 벽 찾기
    if (pointsEqual(targetStartPoint, wallStartPoint)) {
      connections.startConnected = { wall, atStart: true };
    } else if (pointsEqual(targetStartPoint, wallEndPoint)) {
      connections.startConnected = { wall, atStart: false };
    }

    // targetWall의 끝점과 연결된 벽 찾기
    if (pointsEqual(targetEndPoint, wallStartPoint)) {
      connections.endConnected = { wall, atStart: true };
    } else if (pointsEqual(targetEndPoint, wallEndPoint)) {
      connections.endConnected = { wall, atStart: false };
    }
  }

  return connections;
}

/**
 * 벽의 방향 벡터 계산 (정규화)
 */
export function getWallDirection(
  wall: Wall,
  pointMap: Map<string, Point>
): WallDirection | null {
  const startPoint = pointMap.get(wall.startPointId);
  const endPoint = pointMap.get(wall.endPointId);

  if (!startPoint || !endPoint) return null;

  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return null;

  return {
    x: dx / length,
    z: dy / length, // 2D y는 3D z로 매핑
  };
}

/**
 * Miter 각도 계산
 *
 * @param wall1Dir 첫 번째 벽의 방향 벡터
 * @param wall2Dir 두 번째 벽의 방향 벡터
 * @param connectingAtWall1End wall1의 끝점에서 연결되는지 여부
 */
// Commented out - currently unused but may be needed in future
/*
function calculateMiterAngle(
  wall1Dir: WallDirection,
  wall2Dir: WallDirection,
  connectingAtWall1End: boolean
): number {
  // wall1에서 wall2로 향하는 각도 계산
  const dir1 = connectingAtWall1End
    ? { x: wall1Dir.x, z: wall1Dir.z }
    : { x: -wall1Dir.x, z: -wall1Dir.z };

  const dir2 = { x: wall2Dir.x, z: wall2Dir.z };

  // 두 벡터 사이의 각도
  const angle1 = Math.atan2(dir1.z, dir1.x);
  const angle2 = Math.atan2(dir2.z, dir2.x);

  let angleDiff = angle2 - angle1;

  // 각도를 -PI ~ PI 범위로 정규화
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  // Miter 각도 = 두 벽이 이루는 각도의 절반
  return angleDiff / 2;
}
*/

/**
 * 벽의 4개 코너 계산 (Miter 적용)
 * 2D WallLayer의 calculateJointCorners 로직과 동일하게 처리
 *
 * @param wall 대상 벽
 * @param allWalls 모든 벽 목록 (연결된 벽들을 찾기 위해)
 * @param pointMap Point ID → Point 매핑
 * @returns 4개 코너 좌표 (mm 단위)
 */
export function calculateWallCorners(
  wall: Wall,
  allWalls: Wall[],
  pointMap: Map<string, Point>
): WallCorners | null {
  const startPoint = pointMap.get(wall.startPointId);
  const endPoint = pointMap.get(wall.endPointId);

  if (!startPoint || !endPoint) return null;

  const wallDir = getWallDirection(wall, pointMap);
  if (!wallDir) return null;

  const t = wall.thickness / 2; // Half thickness (mm)

  // 벽의 수직 벡터 (오른쪽 방향)
  const perpendicular = {
    x: -wallDir.z,
    z: wallDir.x,
  };

  // 기본 4개 코너 (연귀 적용 전, mm 단위)
  const corners: WallCorners = {
    startLeft: {
      x: startPoint.x + perpendicular.x * t,
      z: startPoint.y + perpendicular.z * t,
    },
    startRight: {
      x: startPoint.x - perpendicular.x * t,
      z: startPoint.y - perpendicular.z * t,
    },
    endLeft: {
      x: endPoint.x + perpendicular.x * t,
      z: endPoint.y + perpendicular.z * t,
    },
    endRight: {
      x: endPoint.x - perpendicular.x * t,
      z: endPoint.y - perpendicular.z * t,
    },
  };

  // Calculate miter joints at start and end points
  // Using same algorithm as 2D WallLayer.calculateJointCorners

  // Start point miter
  const startCorners = calculateJointCornersAt(
    startPoint,
    wallDir,
    wall,
    allWalls,
    pointMap,
    t
  );
  if (startCorners) {
    corners.startLeft = startCorners.left;
    corners.startRight = startCorners.right;
  }

  // End point miter (direction reversed)
  const endDir = { x: -wallDir.x, z: -wallDir.z };
  const endCorners = calculateJointCornersAt(
    endPoint,
    endDir,
    wall,
    allWalls,
    pointMap,
    t
  );
  if (endCorners) {
    // endCorners are relative to reversed direction, so swap left/right
    corners.endLeft = endCorners.right;
    corners.endRight = endCorners.left;
  }

  return corners;
}

/**
 * Calculate miter corner at a junction point
 * Same algorithm as 2D WallLayer.calculateJointCorners
 */
function calculateJointCornersAt(
  junctionPoint: Point,
  currentDir: WallDirection,
  currentWall: Wall,
  allWalls: Wall[],
  pointMap: Map<string, Point>,
  halfThickness: number
): { left: { x: number; z: number }; right: { x: number; z: number } } | null {
  // Find all walls connected at this junction
  interface ConnectedWall {
    wall: Wall;
    dir: { x: number; y: number };
    angle: number;
    isCurrent: boolean;
  }

  const connectedWalls: ConnectedWall[] = [];

  for (const w of allWalls) {
    const startPt = pointMap.get(w.startPointId);
    const endPt = pointMap.get(w.endPointId);
    if (!startPt || !endPt) continue;

    let dir: { x: number; y: number } | null = null;

    // Check if this wall connects at junction
    if (pointsEqual(startPt, junctionPoint)) {
      // Wall starts at junction, direction is start->end
      const dx = endPt.x - startPt.x;
      const dy = endPt.y - startPt.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dir = { x: dx / len, y: dy / len };
      }
    } else if (pointsEqual(endPt, junctionPoint)) {
      // Wall ends at junction, direction is end->start (reversed)
      const dx = startPt.x - endPt.x;
      const dy = startPt.y - endPt.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dir = { x: dx / len, y: dy / len };
      }
    }

    if (dir) {
      const isCurrent = w.id === currentWall.id;
      connectedWalls.push({
        wall: w,
        dir,
        angle: Math.atan2(dir.y, dir.x),
        isCurrent
      });
    }
  }

  // If no walls connected (shouldn't happen), return basic corners
  if (connectedWalls.length === 0) {
    const normal = { x: -currentDir.z, z: currentDir.x };
    return {
      left: {
        x: junctionPoint.x + normal.x * halfThickness,
        z: junctionPoint.y + normal.z * halfThickness
      },
      right: {
        x: junctionPoint.x - normal.x * halfThickness,
        z: junctionPoint.y - normal.z * halfThickness
      }
    };
  }

  // Sort by angle
  connectedWalls.sort((a, b) => a.angle - b.angle);

  // Find current wall index
  const currentIndex = connectedWalls.findIndex(w => w.isCurrent);
  if (currentIndex === -1) {
    const normal = { x: -currentDir.z, z: currentDir.x };
    return {
      left: {
        x: junctionPoint.x + normal.x * halfThickness,
        z: junctionPoint.y + normal.z * halfThickness
      },
      right: {
        x: junctionPoint.x - normal.x * halfThickness,
        z: junctionPoint.y - normal.z * halfThickness
      }
    };
  }

  // Only one wall (endpoint)
  if (connectedWalls.length === 1) {
    const normal = { x: -currentDir.z, z: currentDir.x };
    return {
      left: {
        x: junctionPoint.x + normal.x * halfThickness,
        z: junctionPoint.y + normal.z * halfThickness
      },
      right: {
        x: junctionPoint.x - normal.x * halfThickness,
        z: junctionPoint.y - normal.z * halfThickness
      }
    };
  }

  // Find neighbors (cyclic)
  const prevIndex = (currentIndex - 1 + connectedWalls.length) % connectedWalls.length;
  const nextIndex = (currentIndex + 1) % connectedWalls.length;

  const prevWall = connectedWalls[prevIndex];
  const nextWall = connectedWalls[nextIndex];

  // Calculate miter intersections
  const currentDir2D = { x: currentDir.x, y: currentDir.z };
  const prevDir2D = prevWall.dir;
  const nextDir2D = nextWall.dir;

  const leftMiter = calculateMiterVector(currentDir2D, nextDir2D, halfThickness);
  const rightMiter = calculateMiterVector(prevDir2D, currentDir2D, halfThickness);

  return {
    left: {
      x: junctionPoint.x + leftMiter.x,
      z: junctionPoint.y + leftMiter.y
    },
    right: {
      x: junctionPoint.x + rightMiter.x,
      z: junctionPoint.y + rightMiter.y
    }
  };
}

/**
 * Calculate miter vector for corner between two directions
 * Same as 2D WallLayer.calculateMiterVector
 */
function calculateMiterVector(
  dir1: { x: number; y: number },
  dir2: { x: number; y: number },
  offset: number
): { x: number; y: number } {
  const normal1 = { x: -dir1.y, y: dir1.x }; // Left of dir1
  const normal2 = { x: dir2.y, y: -dir2.x }; // Right of dir2

  // Check if nearly collinear (opposite directions)
  const dot = dir1.x * dir2.x + dir1.y * dir2.y;
  if (dot < -0.99) {
    return { x: normal1.x * offset, y: normal1.y * offset };
  }

  // Calculate intersection
  const det = dir1.x * dir2.y - dir1.y * dir2.x;
  if (Math.abs(det) < 0.001) {
    return { x: normal1.x * offset, y: normal1.y * offset };
  }

  const nDiff = {
    x: (normal2.x - normal1.x) * offset,
    y: (normal2.y - normal1.y) * offset
  };

  const num = nDiff.x * dir2.y - nDiff.y * dir2.x;
  const den = dir1.x * dir2.y - dir1.y * dir2.x;
  const t = num / den;

  return {
    x: normal1.x * offset + dir1.x * t,
    y: normal1.y * offset + dir1.y * t
  };
}

/**
 * 기본 벽 코너 계산 (Miter 적용 없음, 도어 segment용)
 *
 * @param wall 대상 벽
 * @param pointMap Point ID → Point 매핑
 * @returns 4개 코너 좌표 (mm 단위, miter 적용 안 함)
 */
export function calculateBasicWallCorners(
  wall: Wall,
  pointMap: Map<string, Point>
): WallCorners | null {
  const startPoint = pointMap.get(wall.startPointId);
  const endPoint = pointMap.get(wall.endPointId);

  if (!startPoint || !endPoint) return null;

  const wallDir = getWallDirection(wall, pointMap);
  if (!wallDir) return null;

  const t = wall.thickness / 2; // Half thickness (mm)

  // 벽의 수직 벡터 (오른쪽 방향)
  const perpendicular = {
    x: -wallDir.z,
    z: wallDir.x,
  };

  // 기본 4개 코너 (miter 적용 없음, mm 단위)
  return {
    startLeft: {
      x: startPoint.x + perpendicular.x * t,
      z: startPoint.y + perpendicular.z * t,
    },
    startRight: {
      x: startPoint.x - perpendicular.x * t,
      z: startPoint.y - perpendicular.z * t,
    },
    endLeft: {
      x: endPoint.x + perpendicular.x * t,
      z: endPoint.y + perpendicular.z * t,
    },
    endRight: {
      x: endPoint.x - perpendicular.x * t,
      z: endPoint.y - perpendicular.z * t,
    },
  };
}

/**
 * 벽 segment를 생성하기 위한 코너 계산 (문이 있을 때)
 *
 * @param miterCorners Miter 적용된 전체 벽 코너 (벽 연결부 사선)
 * @param basicCorners Miter 적용 안 된 전체 벽 코너 (도어 구멍 일자)
 * @param segmentStart segment 시작 비율 (0-1)
 * @param segmentEnd segment 끝 비율 (0-1)
 */
export function calculateSegmentCorners(
  miterCorners: WallCorners,
  basicCorners: WallCorners,
  segmentStart: number,
  segmentEnd: number
): WallCorners {
  // Linear interpolation
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const threshold = 0.001; // 0.1% 이내면 벽 끝으로 간주

  // 시작 코너: 벽 시작 부분이면 miter, 아니면 basic
  const useStartMiter = segmentStart < threshold;
  const startLeft = useStartMiter
    ? miterCorners.startLeft
    : { x: lerp(basicCorners.startLeft.x, basicCorners.endLeft.x, segmentStart), z: lerp(basicCorners.startLeft.z, basicCorners.endLeft.z, segmentStart) };
  const startRight = useStartMiter
    ? miterCorners.startRight
    : { x: lerp(basicCorners.startRight.x, basicCorners.endRight.x, segmentStart), z: lerp(basicCorners.startRight.z, basicCorners.endRight.z, segmentStart) };

  // 끝 코너: 벽 끝 부분이면 miter, 아니면 basic
  const useEndMiter = segmentEnd > (1 - threshold);
  const endLeft = useEndMiter
    ? miterCorners.endLeft
    : { x: lerp(basicCorners.startLeft.x, basicCorners.endLeft.x, segmentEnd), z: lerp(basicCorners.startLeft.z, basicCorners.endLeft.z, segmentEnd) };
  const endRight = useEndMiter
    ? miterCorners.endRight
    : { x: lerp(basicCorners.startRight.x, basicCorners.endRight.x, segmentEnd), z: lerp(basicCorners.startRight.z, basicCorners.endRight.z, segmentEnd) };

  return {
    startLeft,
    startRight,
    endLeft,
    endRight,
  };
}
