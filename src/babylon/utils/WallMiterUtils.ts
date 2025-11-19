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
 *
 * @param wall 대상 벽
 * @param connections 연결된 벽 정보
 * @param pointMap Point ID → Point 매핑
 * @returns 4개 코너 좌표 (mm 단위)
 */
export function calculateWallCorners(
  wall: Wall,
  connections: WallConnections,
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

  // Helper: Get wall lines (Left and Right)
  // Note: Using 2D coordinates (x, y) internally for calculation, then mapping y -> z
  const getWallLines = (w: Wall) => {
    const s = pointMap.get(w.startPointId)!;
    const e = pointMap.get(w.endPointId)!;
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dir = { x: dx / len, y: dy / len };
    const normal = { x: -dir.y, y: dir.x }; // Left normal
    const halfT = w.thickness / 2;

    // Left line origin
    const leftOrigin = {
      x: s.x + normal.x * halfT,
      y: s.y + normal.y * halfT
    };
    // Right line origin
    const rightOrigin = {
      x: s.x - normal.x * halfT,
      y: s.y - normal.y * halfT
    };

    return {
      left: { p: leftOrigin, d: dir },
      right: { p: rightOrigin, d: dir }
    };
  };

  // Helper: Intersect two lines
  const intersect = (l1: { p: { x: number, y: number }, d: { x: number, y: number } }, l2: { p: { x: number, y: number }, d: { x: number, y: number } }) => {
    const det = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(det) < 0.0001) return null; // Parallel
    const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / det;
    return {
      x: l1.p.x + l1.d.x * t,
      y: l1.p.y + l1.d.y * t
    };
  };

  // ===== 시작점 Miter 적용 =====
  if (connections.startConnected) {
    const connectedWall = connections.startConnected.wall;
    const atStart = connections.startConnected.atStart;

    const w1Lines = getWallLines(wall);
    const w2Lines = getWallLines(connectedWall);

    // Logic from WallLayer.ts:
    // isW1Start is TRUE (we are at start of current wall)
    // isW2Start is `atStart`

    let newLeft = null;
    let newRight = null;

    if (true === atStart) {
      // Tail-Tail (Start-Start): Connect Left to Right, Right to Left
      newLeft = intersect(w1Lines.left, w2Lines.right);
      newRight = intersect(w1Lines.right, w2Lines.left);
    } else {
      // Head-Tail (Start-End): Connect Left to Left, Right to Right
      newLeft = intersect(w1Lines.left, w2Lines.left);
      newRight = intersect(w1Lines.right, w2Lines.right);
    }

    if (newLeft && newRight) {
      corners.startLeft = { x: newLeft.x, z: newLeft.y };
      corners.startRight = { x: newRight.x, z: newRight.y };
    }
  }

  // ===== 끝점 Miter 적용 =====
  if (connections.endConnected) {
    const connectedWall = connections.endConnected.wall;
    const atStart = connections.endConnected.atStart;

    const w1Lines = getWallLines(wall);
    const w2Lines = getWallLines(connectedWall);

    // Logic from WallLayer.ts:
    // isW1Start is FALSE (we are at end of current wall)
    // isW2Start is `atStart`

    let newLeft = null;
    let newRight = null;

    if (false === atStart) {
      // Head-Head (End-End): Connect Left to Right, Right to Left
      newLeft = intersect(w1Lines.left, w2Lines.right);
      newRight = intersect(w1Lines.right, w2Lines.left);
    } else {
      // Tail-Head (End-Start): Connect Left to Left, Right to Right
      newLeft = intersect(w1Lines.left, w2Lines.left);
      newRight = intersect(w1Lines.right, w2Lines.right);
    }

    if (newLeft && newRight) {
      corners.endLeft = { x: newLeft.x, z: newLeft.y };
      corners.endRight = { x: newRight.x, z: newRight.y };
    }
  }

  return corners;
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
