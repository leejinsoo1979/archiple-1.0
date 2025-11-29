/**
 * Winged-Edge Data Structure
 *
 * SketchUp-style topology representation for face detection.
 * Each edge maintains references to:
 * - Start and end vertices
 * - Left and right faces (front/back)
 * - Previous and next edges in each face loop
 *
 * This structure enables efficient:
 * - Edge loop traversal
 * - Face boundary detection
 * - Topological queries
 */

import { Vector3 } from '@babylonjs/core';
import type { GeometryId } from '../types';

// ============================================================================
// WINGED-EDGE TYPES
// ============================================================================

/**
 * Extended Edge with Winged-Edge references
 */
export interface WingedEdge {
  id: GeometryId;

  // Vertex references (ordered: start → end defines direction)
  startVertexId: GeometryId;
  endVertexId: GeometryId;

  // Face references (null if no face on that side)
  // leftFace: face to the left when traversing start → end
  // rightFace: face to the right when traversing start → end
  leftFaceId: GeometryId | null;
  rightFaceId: GeometryId | null;

  // Edge loop links for left face (CCW when looking at face from outside)
  leftPrevEdgeId: GeometryId | null;
  leftNextEdgeId: GeometryId | null;

  // Edge loop links for right face (CCW when looking at face from outside)
  rightPrevEdgeId: GeometryId | null;
  rightNextEdgeId: GeometryId | null;

  // Properties
  isConstruction: boolean;
  isSoft: boolean;       // Soft edge (smooth shading across)
  isSmooth: boolean;     // Smooth for rendering
  isHidden: boolean;
  createdAt: number;
}

/**
 * Oriented half-edge for traversal
 * Represents one direction of an edge within a face loop
 */
export interface HalfEdge {
  edgeId: GeometryId;
  isForward: boolean;  // true if traversing start→end, false if end→start
  startVertexId: GeometryId;
  endVertexId: GeometryId;
}

/**
 * Edge loop - ordered sequence of half-edges forming a closed boundary
 */
export interface EdgeLoop {
  halfEdges: HalfEdge[];
  vertexIds: GeometryId[];
  isClosed: boolean;
  isClockwise: boolean;  // Orientation when viewed from normal direction
}

/**
 * Plane equation: Ax + By + Cz + D = 0
 */
export interface PlaneEquation {
  normal: Vector3;  // (A, B, C) normalized
  d: number;        // D coefficient
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Plane tolerance: 0.001mm = 0.000001 units (1 unit = 1m)
export const PLANE_TOLERANCE = 0.000001;

// Minimum edges for a valid face
export const MIN_FACE_EDGES = 3;

// Colinearity tolerance for normal calculation
export const COLINEARITY_TOLERANCE = 0.0001;

// ============================================================================
// PLANE UTILITIES
// ============================================================================

/**
 * Calculate plane equation from 3 points
 * Returns null if points are colinear
 */
export function calculatePlaneFromPoints(p1: Vector3, p2: Vector3, p3: Vector3): PlaneEquation | null {
  const v1 = p2.subtract(p1);
  const v2 = p3.subtract(p1);

  const normal = Vector3.Cross(v1, v2);
  const length = normal.length();

  // Check for colinearity
  if (length < COLINEARITY_TOLERANCE) {
    return null;
  }

  normal.scaleInPlace(1 / length);  // Normalize
  const d = -Vector3.Dot(normal, p1);

  return { normal, d };
}

/**
 * Calculate signed distance from point to plane
 */
export function signedDistanceToPlane(point: Vector3, plane: PlaneEquation): number {
  return Vector3.Dot(plane.normal, point) + plane.d;
}

/**
 * Check if point lies on plane within tolerance
 */
export function pointOnPlane(point: Vector3, plane: PlaneEquation, tolerance: number = PLANE_TOLERANCE): boolean {
  return Math.abs(signedDistanceToPlane(point, plane)) < tolerance;
}

/**
 * Check if all points lie on the same plane
 */
export function allPointsCoplanar(points: Vector3[], tolerance: number = PLANE_TOLERANCE): PlaneEquation | null {
  if (points.length < 3) return null;

  // Find 3 non-colinear points to define the plane
  let plane: PlaneEquation | null = null;

  for (let i = 2; i < points.length && !plane; i++) {
    plane = calculatePlaneFromPoints(points[0], points[1], points[i]);
  }

  if (!plane) return null;  // All points colinear

  // Verify all other points lie on this plane
  for (let i = 0; i < points.length; i++) {
    if (!pointOnPlane(points[i], plane, tolerance)) {
      return null;
    }
  }

  return plane;
}

// ============================================================================
// LOOP ORIENTATION UTILITIES
// ============================================================================

/**
 * Calculate the signed area of a polygon projected onto a plane
 * Positive = CCW when looking against normal, Negative = CW
 */
export function calculateSignedArea(vertices: Vector3[], normal: Vector3): number {
  if (vertices.length < 3) return 0;

  // Project to 2D by choosing the dominant axis of the normal
  const absNormal = new Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));

  let projAxis1: 'x' | 'y' | 'z';
  let projAxis2: 'x' | 'y' | 'z';

  if (absNormal.x >= absNormal.y && absNormal.x >= absNormal.z) {
    // Project onto YZ plane
    projAxis1 = 'y';
    projAxis2 = 'z';
  } else if (absNormal.y >= absNormal.x && absNormal.y >= absNormal.z) {
    // Project onto XZ plane
    projAxis1 = 'x';
    projAxis2 = 'z';
  } else {
    // Project onto XY plane
    projAxis1 = 'x';
    projAxis2 = 'y';
  }

  // Calculate signed area using shoelace formula
  let area = 0;
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i][projAxis1] * vertices[j][projAxis2];
    area -= vertices[j][projAxis1] * vertices[i][projAxis2];
  }

  // Adjust sign based on normal direction relative to projection axis
  const dominantComponent = normal.x >= 0 ? absNormal.x : -absNormal.x;
  if (absNormal.x >= absNormal.y && absNormal.x >= absNormal.z) {
    if (normal.x < 0) area = -area;
  } else if (absNormal.y >= absNormal.x && absNormal.y >= absNormal.z) {
    if (normal.y < 0) area = -area;
  } else {
    if (normal.z < 0) area = -area;
  }

  return area / 2;
}

/**
 * Check if loop is oriented CCW when viewed from the normal direction
 */
export function isLoopCCW(vertices: Vector3[], normal: Vector3): boolean {
  return calculateSignedArea(vertices, normal) > 0;
}

/**
 * Calculate the normal of a polygon from its vertices (using Newell's method)
 * This is more robust than using just 3 points for non-convex polygons
 */
export function calculatePolygonNormal(vertices: Vector3[]): Vector3 {
  const normal = Vector3.Zero();
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];

    // Newell's method
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }

  const length = normal.length();
  if (length > COLINEARITY_TOLERANCE) {
    normal.scaleInPlace(1 / length);
  }

  return normal;
}

// ============================================================================
// SELF-INTERSECTION CHECK
// ============================================================================

/**
 * Check if a 2D line segment (p1-p2) intersects with (p3-p4)
 * Excludes endpoints to avoid false positives at vertices
 */
function segmentsIntersect2D(
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  p4x: number, p4y: number
): boolean {
  const d1x = p2x - p1x;
  const d1y = p2y - p1y;
  const d2x = p4x - p3x;
  const d2y = p4y - p3y;

  const cross = d1x * d2y - d1y * d2x;

  if (Math.abs(cross) < 1e-10) return false;  // Parallel

  const dx = p3x - p1x;
  const dy = p3y - p1y;

  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;

  // Strictly between 0 and 1 (excluding endpoints)
  const epsilon = 0.0001;
  return t > epsilon && t < 1 - epsilon && u > epsilon && u < 1 - epsilon;
}

/**
 * Check if a polygon has self-intersecting edges
 */
export function hasSelfIntersection(vertices: Vector3[], normal: Vector3): boolean {
  if (vertices.length < 4) return false;  // Triangle can't self-intersect

  // Project to 2D
  const absNormal = new Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));

  let axis1: 'x' | 'y' | 'z';
  let axis2: 'x' | 'y' | 'z';

  if (absNormal.x >= absNormal.y && absNormal.x >= absNormal.z) {
    axis1 = 'y'; axis2 = 'z';
  } else if (absNormal.y >= absNormal.x && absNormal.y >= absNormal.z) {
    axis1 = 'x'; axis2 = 'z';
  } else {
    axis1 = 'x'; axis2 = 'y';
  }

  const n = vertices.length;

  // Check each pair of non-adjacent edges
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // Skip adjacent edges (they share a vertex)
      if (i === 0 && j === n - 1) continue;

      if (segmentsIntersect2D(
        vertices[i][axis1], vertices[i][axis2],
        vertices[(i + 1) % n][axis1], vertices[(i + 1) % n][axis2],
        vertices[j][axis1], vertices[j][axis2],
        vertices[(j + 1) % n][axis1], vertices[(j + 1) % n][axis2]
      )) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// EDGE LOOP DETECTION
// ============================================================================

export interface LoopSearchResult {
  loop: EdgeLoop | null;
  reason: 'found' | 'no_path' | 'self_intersect' | 'not_planar' | 'too_few_edges';
}

/**
 * Depth-first search for closed edge loops starting from a vertex
 */
export function findClosedLoopsFromVertex(
  startVertexId: GeometryId,
  getAdjacentEdges: (vertexId: GeometryId) => Array<{ edgeId: GeometryId; otherVertexId: GeometryId }>,
  getVertexPosition: (vertexId: GeometryId) => Vector3,
  maxDepth: number = 20
): EdgeLoop[] {
  const loops: EdgeLoop[] = [];
  const visited = new Set<string>();  // Track unique loops

  interface SearchState {
    currentVertexId: GeometryId;
    path: HalfEdge[];
    visitedVertices: Set<GeometryId>;
    depth: number;
  }

  const stack: SearchState[] = [{
    currentVertexId: startVertexId,
    path: [],
    visitedVertices: new Set([startVertexId]),
    depth: 0,
  }];

  while (stack.length > 0) {
    const state = stack.pop()!;

    if (state.depth > maxDepth) continue;

    const adjacentEdges = getAdjacentEdges(state.currentVertexId);

    for (const { edgeId, otherVertexId } of adjacentEdges) {
      // Check if we've completed a loop back to start
      if (otherVertexId === startVertexId && state.path.length >= MIN_FACE_EDGES - 1) {
        const halfEdge: HalfEdge = {
          edgeId,
          isForward: true,  // Will be determined properly later
          startVertexId: state.currentVertexId,
          endVertexId: otherVertexId,
        };

        const completePath = [...state.path, halfEdge];
        const vertexIds = completePath.map(he => he.startVertexId);

        // Create unique key for this loop (sorted vertex IDs)
        const loopKey = [...vertexIds].sort().join(',');

        if (!visited.has(loopKey)) {
          visited.add(loopKey);

          // Verify coplanarity and no self-intersection
          const positions = vertexIds.map(getVertexPosition);
          const plane = allPointsCoplanar(positions);

          if (plane && !hasSelfIntersection(positions, plane.normal)) {
            const normal = calculatePolygonNormal(positions);
            const isCW = !isLoopCCW(positions, normal);

            loops.push({
              halfEdges: completePath,
              vertexIds,
              isClosed: true,
              isClockwise: isCW,
            });
          }
        }
        continue;
      }

      // Don't revisit vertices (except start for closing loop)
      if (state.visitedVertices.has(otherVertexId)) continue;

      // Continue search
      const halfEdge: HalfEdge = {
        edgeId,
        isForward: true,
        startVertexId: state.currentVertexId,
        endVertexId: otherVertexId,
      };

      const newVisited = new Set(state.visitedVertices);
      newVisited.add(otherVertexId);

      stack.push({
        currentVertexId: otherVertexId,
        path: [...state.path, halfEdge],
        visitedVertices: newVisited,
        depth: state.depth + 1,
      });
    }
  }

  // Sort by loop size (prefer smaller/minimal loops)
  loops.sort((a, b) => a.vertexIds.length - b.vertexIds.length);

  return loops;
}

/**
 * Find the minimal enclosing loop for a new edge
 * This is the key algorithm for SketchUp-style face detection
 */
export function findMinimalLoopForEdge(
  edgeStartVertexId: GeometryId,
  edgeEndVertexId: GeometryId,
  getAdjacentEdges: (vertexId: GeometryId) => Array<{ edgeId: GeometryId; otherVertexId: GeometryId }>,
  getVertexPosition: (vertexId: GeometryId) => Vector3,
  excludeEdgeId?: GeometryId
): EdgeLoop | null {
  // Search from both ends
  const loopsFromStart = findClosedLoopsFromVertex(
    edgeStartVertexId,
    (vId) => getAdjacentEdges(vId).filter(e => e.edgeId !== excludeEdgeId),
    getVertexPosition
  );

  const loopsFromEnd = findClosedLoopsFromVertex(
    edgeEndVertexId,
    (vId) => getAdjacentEdges(vId).filter(e => e.edgeId !== excludeEdgeId),
    getVertexPosition
  );

  // Combine and find minimal loops that contain this edge's vertices
  const allLoops = [...loopsFromStart, ...loopsFromEnd];

  // Filter loops that include both edge vertices
  const validLoops = allLoops.filter(loop => {
    return loop.vertexIds.includes(edgeStartVertexId) &&
           loop.vertexIds.includes(edgeEndVertexId);
  });

  // Return the smallest valid loop (minimal enclosing loop)
  if (validLoops.length > 0) {
    return validLoops[0];  // Already sorted by size
  }

  return null;
}

export default {
  calculatePlaneFromPoints,
  signedDistanceToPlane,
  pointOnPlane,
  allPointsCoplanar,
  calculateSignedArea,
  isLoopCCW,
  calculatePolygonNormal,
  hasSelfIntersection,
  findClosedLoopsFromVertex,
  findMinimalLoopForEdge,
  PLANE_TOLERANCE,
  MIN_FACE_EDGES,
};
