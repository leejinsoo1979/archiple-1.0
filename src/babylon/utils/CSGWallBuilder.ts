/**
 * CSGWallBuilder - CSG Boolean 연산 기반 벽체 생성
 * 
 * 모든 코너(ㄱ, T, 십자)를 자동으로 정렬하는 polygon 기반 벽 시스템
 */

import { Vector2, Vector3, Mesh, Scene, VertexData, CSG } from '@babylonjs/core';
import type { Wall } from '../../core/types/Wall';
import type { Point } from '../../core/types/Point';

/**
 * 벽 중심선과 두께로 4-포인트 폴리곤 생성
 */
export function createWallPolygon(
    start: { x: number; z: number },
    end: { x: number; z: number },
    thickness: number
): Vector2[] {
    // 벽 방향 벡터
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.sqrt(dx * dx + dz * dz);

    if (length < 0.001) {
        // 너무 짧은 벽 - 기본 사각형 반환
        const halfT = thickness / 2;
        return [
            new Vector2(start.x - halfT, start.z - halfT),
            new Vector2(start.x + halfT, start.z - halfT),
            new Vector2(start.x + halfT, start.z + halfT),
            new Vector2(start.x - halfT, start.z + halfT),
        ];
    }

    // 정규화된 방향
    const dirX = dx / length;
    const dirZ = dz / length;

    // 수직 벡터 (왼쪽 방향)
    const perpX = -dirZ * (thickness / 2);
    const perpZ = dirX * (thickness / 2);

    // 4-포인트 폴리곤 (시계방향)
    return [
        new Vector2(start.x + perpX, start.z + perpZ), // Left start
        new Vector2(end.x + perpX, end.z + perpZ),     // Left end
        new Vector2(end.x - perpX, end.z - perpZ),     // Right end
        new Vector2(start.x - perpX, start.z - perpZ), // Right start
    ];
}

/**
 * 폴리곤을 3D 메시로 Extrude
 */
export function extrudeWallPolygon(
    polygon: Vector2[],
    height: number,
    name: string,
    scene: Scene,
    startHeight: number = 0
): Mesh {
    // VertexData로 직접 생성 (ExtrudePolygon은 earcut 의존성 필요)
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const numPoints = polygon.length;

    // 바닥 vertices (y = startHeight)
    for (let i = 0; i < numPoints; i++) {
        positions.push(polygon[i].x, startHeight, polygon[i].y);
    }

    // 천장 vertices (y = startHeight + height)
    const topY = startHeight + height;
    for (let i = 0; i < numPoints; i++) {
        positions.push(polygon[i].x, topY, polygon[i].y);
    }

    // 바닥 face (시계방향)
    for (let i = 2; i < numPoints; i++) {
        indices.push(0, i - 1, i);
    }

    // 천장 face (반시계방향)
    for (let i = 2; i < numPoints; i++) {
        indices.push(numPoints, numPoints + i, numPoints + i - 1);
    }

    // 측면 faces
    for (let i = 0; i < numPoints; i++) {
        const next = (i + 1) % numPoints;
        const base = i;
        const baseNext = next;
        const top = numPoints + i;
        const topNext = numPoints + next;

        // 두 개의 삼각형
        indices.push(base, baseNext, top);
        indices.push(top, baseNext, topNext);
    }

    // Mesh 생성
    const mesh = new Mesh(name, scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;

    // 노말 계산
    VertexData.ComputeNormals(positions, indices, normals);
    vertexData.normals = normals;

    vertexData.applyToMesh(mesh);

    return mesh;
}

/**
 * CSG subtract 연산으로 겹치는 벽 제거
 */
export function applyCSGTrimming(
    walls: { mesh: Mesh; wallId: string }[],
    scene: Scene
): Mesh[] {
    if (walls.length === 0) return [];

    console.log(`[CSGWallBuilder] Applying CSG trimming to ${walls.length} walls`);

    const trimmedMeshes: Mesh[] = [];

    for (let i = 0; i < walls.length; i++) {
        const wallMesh = walls[i].mesh;

        // CSG 생성
        let wallCSG: CSG;
        try {
            wallCSG = CSG.FromMesh(wallMesh);
        } catch (e) {
            console.warn(`[CSGWallBuilder] Failed to create CSG for wall ${walls[i].wallId}:`, e);
            trimmedMeshes.push(wallMesh);
            continue;
        }

        // 다른 벽들과의 교차 확인 및 subtract
        for (let j = 0; j < walls.length; j++) {
            if (i === j) continue;

            const otherMesh = walls[j].mesh;

            // Bounding box 교차 검사 (최적화)
            if (!wallMesh.intersectsMesh(otherMesh, false)) {
                continue;
            }

            try {
                const otherCSG = CSG.FromMesh(otherMesh);

                // Subtract 연산 (j > i 일 때만 - 한쪽 방향으로만 자르기)
                if (j > i) {
                    wallCSG = wallCSG.subtract(otherCSG);
                }
            } catch (e) {
                console.warn(`[CSGWallBuilder] CSG subtract failed between ${walls[i].wallId} and ${walls[j].wallId}:`, e);
            }
        }

        // CSG를 Mesh로 변환
        try {
            const trimmedMesh = wallCSG.toMesh(`wall_trimmed_${walls[i].wallId}`, null, scene);
            trimmedMeshes.push(trimmedMesh);
        } catch (e) {
            console.warn(`[CSGWallBuilder] Failed to convert CSG to mesh for ${walls[i].wallId}:`, e);
            trimmedMeshes.push(wallMesh);
        }

        // 원본 메시 dispose
        wallMesh.dispose();
    }

    console.log(`[CSGWallBuilder] CSG trimming complete. Generated ${trimmedMeshes.length} trimmed walls`);

    return trimmedMeshes;
}

/**
 * 벽 데이터로부터 CSG 기반 메시 생성 (통합 함수)
 */
export function createCSGWalls(
    walls: Wall[],
    points: Point[],
    wallHeight: number,
    scene: Scene,
    centerOffset: { x: number; z: number } = { x: 0, z: 0 }
): Mesh[] {
    const MM_TO_METERS = 0.001;

    // Point 맵 생성
    const pointMap = new Map<string, Point>();
    points.forEach((p) => pointMap.set(p.id, p));

    // 1단계: 각 벽을 폴리곤 메시로 생성
    const wallMeshes: { mesh: Mesh; wallId: string }[] = [];

    for (const wall of walls) {
        const startPoint = pointMap.get(wall.startPointId);
        const endPoint = pointMap.get(wall.endPointId);

        if (!startPoint || !endPoint) {
            console.warn(`[CSGWallBuilder] Missing points for wall ${wall.id}`);
            continue;
        }

        // mm to meters 변환 및 중심 offset 적용
        const start = {
            x: startPoint.x * MM_TO_METERS - centerOffset.x,
            z: -(startPoint.y * MM_TO_METERS) - centerOffset.z, // Y축 반전
        };
        const end = {
            x: endPoint.x * MM_TO_METERS - centerOffset.x,
            z: -(endPoint.y * MM_TO_METERS) - centerOffset.z,
        };

        // 폴리곤 생성
        const polygon = createWallPolygon(start, end, wall.thickness * MM_TO_METERS);

        // 3D 메시 생성
        const mesh = extrudeWallPolygon(
            polygon,
            (wall.height || wallHeight) * MM_TO_METERS,
            `wall_${wall.id}`,
            scene,
            0
        );

        wallMeshes.push({ mesh, wallId: wall.id });
    }

    // 2단계: CSG trimming 적용
    const trimmedWalls = applyCSGTrimming(wallMeshes, scene);

    return trimmedWalls;
}
