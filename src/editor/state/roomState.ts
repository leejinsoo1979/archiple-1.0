/**
 * 룸 폴리라인 상태 관리 (mm 단위)
 *
 * 핵심 원칙:
 * 1. 모든 좌표는 mm 단위로 저장
 * 2. 스냅은 외부에서 적용 후 저장
 * 3. 세그먼트 길이는 mm로 계산
 * 4. px 변환은 렌더링 시에만 발생
 */

import type { PointMM } from '../core/units';
import { distanceMm, isValidRoomSize } from '../core/units';

// ============================================
// 타입 정의
// ============================================

/**
 * 룸 폴리라인 구조
 * 모든 좌표는 mm 단위
 */
export interface RoomPolyline {
  id: string;
  points: PointMM[]; // 모든 좌표는 mm 단위
  closed: boolean; // 폐곡선 여부
  name?: string; // 룸 이름 (예: "거실", "침실1")
}

/**
 * 벽 세그먼트
 * 두 점을 연결하는 벽
 */
export interface WallSegment {
  start: PointMM;
  end: PointMM;
  lengthMm: number; // mm 단위 길이
  index: number; // 폴리라인에서의 인덱스
}

/**
 * 룸 검증 결과
 */
export interface RoomValidation {
  valid: boolean;
  errors: string[];
}

// ============================================
// 룸 생성 및 기본 관리
// ============================================

/**
 * 새로운 룸 폴리라인 생성
 */
export function createRoomPolyline(id?: string, name?: string): RoomPolyline {
  return {
    id: id || generateRoomId(),
    points: [],
    closed: false,
    name,
  };
}

/**
 * 룸 ID 생성
 */
function generateRoomId(): string {
  return `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 룸 복사
 */
export function cloneRoomPolyline(room: RoomPolyline): RoomPolyline {
  return {
    ...room,
    points: [...room.points.map((p) => ({ ...p }))],
  };
}

// ============================================
// 포인트 관리 (mm 단위)
// ============================================

/**
 * 포인트 추가
 * @param room - 룸 폴리라인
 * @param point - 추가할 포인트 (mm 단위)
 * @returns 새로운 룸 폴리라인
 */
export function addPoint(room: RoomPolyline, point: PointMM): RoomPolyline {
  return {
    ...room,
    points: [...room.points, { ...point }],
  };
}

/**
 * 포인트 삽입
 * @param room - 룸 폴리라인
 * @param index - 삽입 위치
 * @param point - 삽입할 포인트 (mm 단위)
 * @returns 새로운 룸 폴리라인
 */
export function insertPoint(
  room: RoomPolyline,
  index: number,
  point: PointMM
): RoomPolyline {
  const newPoints = [...room.points];
  newPoints.splice(index, 0, { ...point });
  return {
    ...room,
    points: newPoints,
  };
}

/**
 * 포인트 수정
 * @param room - 룸 폴리라인
 * @param index - 수정할 포인트 인덱스
 * @param newPoint - 새로운 포인트 (mm 단위)
 * @returns 새로운 룸 폴리라인
 */
export function modifyPoint(
  room: RoomPolyline,
  index: number,
  newPoint: PointMM
): RoomPolyline {
  if (index < 0 || index >= room.points.length) {
    console.warn(`[RoomState] Invalid index: ${index}`);
    return room;
  }

  const newPoints = [...room.points];
  newPoints[index] = { ...newPoint };

  return {
    ...room,
    points: newPoints,
  };
}

/**
 * 포인트 삭제
 * @param room - 룸 폴리라인
 * @param index - 삭제할 포인트 인덱스
 * @returns 새로운 룸 폴리라인
 */
export function removePoint(room: RoomPolyline, index: number): RoomPolyline {
  if (index < 0 || index >= room.points.length) {
    console.warn(`[RoomState] Invalid index: ${index}`);
    return room;
  }

  const newPoints = [...room.points];
  newPoints.splice(index, 1);

  return {
    ...room,
    points: newPoints,
  };
}

/**
 * 마지막 포인트 삭제
 */
export function removeLastPoint(room: RoomPolyline): RoomPolyline {
  if (room.points.length === 0) return room;
  return removePoint(room, room.points.length - 1);
}

/**
 * 모든 포인트 삭제
 */
export function clearPoints(room: RoomPolyline): RoomPolyline {
  return {
    ...room,
    points: [],
    closed: false,
  };
}

// ============================================
// 폴리라인 상태 관리
// ============================================

/**
 * 폴리라인 닫기
 */
export function closePolyline(room: RoomPolyline): RoomPolyline {
  if (room.points.length < 3) {
    console.warn('[RoomState] Cannot close polyline with less than 3 points');
    return room;
  }

  return {
    ...room,
    closed: true,
  };
}

/**
 * 폴리라인 열기
 */
export function openPolyline(room: RoomPolyline): RoomPolyline {
  return {
    ...room,
    closed: false,
  };
}

// ============================================
// 세그먼트 관리 (mm 단위)
// ============================================

/**
 * 모든 벽 세그먼트 가져오기
 * @param room - 룸 폴리라인
 * @returns 벽 세그먼트 배열
 */
export function getSegments(room: RoomPolyline): WallSegment[] {
  const segments: WallSegment[] = [];
  const { points, closed } = room;

  if (points.length < 2) return segments;

  // 연속된 포인트 사이의 세그먼트
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const lengthMm = distanceMm(start, end);

    segments.push({
      start,
      end,
      lengthMm,
      index: i,
    });
  }

  // 닫힌 폴리라인인 경우 마지막 → 첫 번째 세그먼트 추가
  if (closed && points.length >= 3) {
    const start = points[points.length - 1];
    const end = points[0];
    const lengthMm = distanceMm(start, end);

    segments.push({
      start,
      end,
      lengthMm,
      index: points.length - 1,
    });
  }

  return segments;
}

/**
 * 특정 세그먼트 가져오기
 */
export function getSegment(room: RoomPolyline, index: number): WallSegment | null {
  const segments = getSegments(room);
  return segments[index] || null;
}

/**
 * 세그먼트 길이 계산 (mm)
 */
export function getSegmentLength(start: PointMM, end: PointMM): number {
  return distanceMm(start, end);
}

/**
 * 총 둘레 계산 (mm)
 */
export function getTotalLength(room: RoomPolyline): number {
  const segments = getSegments(room);
  return segments.reduce((sum, seg) => sum + seg.lengthMm, 0);
}

/**
 * 세그먼트 개수
 */
export function getSegmentCount(room: RoomPolyline): number {
  if (room.points.length < 2) return 0;
  return room.closed ? room.points.length : room.points.length - 1;
}

// ============================================
// 검증 함수
// ============================================

/**
 * 룸 검증
 */
export function validateRoom(room: RoomPolyline): RoomValidation {
  const errors: string[] = [];

  // 최소 포인트 개수 확인
  if (room.closed && room.points.length < 3) {
    errors.push('닫힌 룸은 최소 3개의 포인트가 필요합니다.');
  }

  if (!room.closed && room.points.length < 2) {
    errors.push('열린 룸은 최소 2개의 포인트가 필요합니다.');
  }

  // 세그먼트 길이 검증
  const segments = getSegments(room);
  segments.forEach((seg, index) => {
    if (!isValidRoomSize(seg.lengthMm)) {
      errors.push(
        `세그먼트 ${index + 1}의 길이가 유효하지 않습니다: ${seg.lengthMm.toFixed(0)}mm`
      );
    }
  });

  // 중복 포인트 확인
  for (let i = 0; i < room.points.length; i++) {
    for (let j = i + 1; j < room.points.length; j++) {
      const p1 = room.points[i];
      const p2 = room.points[j];
      if (p1.x === p2.x && p1.y === p2.y) {
        errors.push(`중복된 포인트가 있습니다: (${p1.x}, ${p1.y})`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 룸이 닫힐 수 있는지 확인
 */
export function canClose(room: RoomPolyline): boolean {
  if (room.points.length < 3) return false;

  // 모든 세그먼트가 유효한지 확인
  const segments = getSegments(room);
  const allValid = segments.every((seg) => isValidRoomSize(seg.lengthMm));

  // 닫는 세그먼트도 유효한지 확인
  if (allValid && room.points.length >= 3) {
    const closingLength = distanceMm(
      room.points[room.points.length - 1],
      room.points[0]
    );
    return isValidRoomSize(closingLength);
  }

  return false;
}

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 포인트가 폴리라인의 첫 번째 포인트와 일치하는지 확인
 * (폴리라인 닫기 판단용)
 */
export function isClosingPoint(room: RoomPolyline, point: PointMM): boolean {
  if (room.points.length === 0) return false;

  const firstPoint = room.points[0];
  const threshold = 1; // 1mm 오차 허용

  const dx = Math.abs(point.x - firstPoint.x);
  const dy = Math.abs(point.y - firstPoint.y);

  return dx < threshold && dy < threshold;
}

/**
 * 룸 정보 요약
 */
export function getRoomSummary(room: RoomPolyline): {
  pointCount: number;
  segmentCount: number;
  totalLengthMm: number;
  closed: boolean;
  valid: boolean;
} {
  const validation = validateRoom(room);

  return {
    pointCount: room.points.length,
    segmentCount: getSegmentCount(room),
    totalLengthMm: getTotalLength(room),
    closed: room.closed,
    valid: validation.valid,
  };
}

/**
 * 룸 폴리라인 리셋
 */
export function resetRoom(room: RoomPolyline): RoomPolyline {
  return {
    ...room,
    points: [],
    closed: false,
  };
}
