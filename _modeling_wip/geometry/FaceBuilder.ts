/**
 * FaceBuilder - Creates Babylon.js meshes from edge loops
 *
 * Handles:
 * - Triangulation of polygons (ear clipping for non-convex polygons)
 * - UV coordinate calculation via vertex projection
 * - Double-sided mesh creation
 * - Face healing when edges are redrawn
 */

import {
  Vector3,
  Vector2,
  Mesh,
  VertexData,
  Scene,
  StandardMaterial,
  Color3,
} from '@babylonjs/core';
import type { GeometryId } from '../types';
import type { EdgeLoop, PlaneEquation } from './WingedEdge';
import {
  calculatePolygonNormal,
  allPointsCoplanar,
  isLoopCCW,
  hasSelfIntersection,
  PLANE_TOLERANCE,
  MIN_FACE_EDGES,
} from './WingedEdge';

// ============================================================================
// FACE CREATION RESULT
// ============================================================================

export interface FaceCreationResult {
  success: boolean;
  faceId?: GeometryId;
  mesh?: Mesh;
  error?: FaceCreationError;
}

export type FaceCreationError =
  | 'too_few_edges'
  | 'not_planar'
  | 'self_intersect'
  | 'triangulation_failed'
  | 'degenerate';

// ============================================================================
// UV PROJECTION
// ============================================================================

/**
 * Calculate UV coordinates by projecting vertices onto the face plane
 */
function calculateUVs(vertices: Vector3[], normal: Vector3): Vector2[] {
  if (vertices.length === 0) return [];

  // Create a local 2D coordinate system on the plane
  const absNormal = new Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));

  // Choose an up vector that's not parallel to normal
  let up = Vector3.Up();
  if (Math.abs(Vector3.Dot(normal, up)) > 0.9) {
    up = Vector3.Forward();
  }

  // Create orthonormal basis
  const uAxis = Vector3.Cross(up, normal).normalize();
  const vAxis = Vector3.Cross(normal, uAxis).normalize();

  // Project vertices onto UV space
  const uvs = vertices.map(v => {
    return new Vector2(
      Vector3.Dot(v, uAxis),
      Vector3.Dot(v, vAxis)
    );
  });

  // Normalize UVs to 0-1 range based on bounding box
  let minU = Infinity, maxU = -Infinity;
  let minV = Infinity, maxV = -Infinity;

  for (const uv of uvs) {
    minU = Math.min(minU, uv.x);
    maxU = Math.max(maxU, uv.x);
    minV = Math.min(minV, uv.y);
    maxV = Math.max(maxV, uv.y);
  }

  const rangeU = maxU - minU || 1;
  const rangeV = maxV - minV || 1;

  return uvs.map(uv => new Vector2(
    (uv.x - minU) / rangeU,
    (uv.y - minV) / rangeV
  ));
}

// ============================================================================
// TRIANGULATION (EAR CLIPPING)
// ============================================================================

/**
 * Check if a vertex is an "ear" (can be clipped)
 * An ear is a convex vertex whose triangle doesn't contain other vertices
 */
function isEar(
  polygon: Vector2[],
  i: number,
  prevI: number,
  nextI: number,
  remainingIndices: number[]
): boolean {
  const p0 = polygon[prevI];
  const p1 = polygon[i];
  const p2 = polygon[nextI];

  // Check if triangle is counter-clockwise (convex vertex)
  const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
  if (cross <= 0) return false;  // Concave or degenerate

  // Check that no other vertex is inside this triangle
  for (const idx of remainingIndices) {
    if (idx === prevI || idx === i || idx === nextI) continue;

    const p = polygon[idx];
    if (pointInTriangle(p, p0, p1, p2)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if point is inside triangle (2D)
 */
function pointInTriangle(p: Vector2, a: Vector2, b: Vector2, c: Vector2): boolean {
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = p.x - a.x;
  const v2y = p.y - a.y;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= 0 && v >= 0 && u + v < 1;
}

/**
 * Triangulate a simple polygon using ear clipping algorithm
 * Returns array of triangle indices
 */
function earClipTriangulate(vertices: Vector3[], normal: Vector3): number[] | null {
  if (vertices.length < 3) return null;
  if (vertices.length === 3) return [0, 1, 2];

  // Project to 2D for triangulation
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

  const polygon2D = vertices.map(v => new Vector2(v[axis1], v[axis2]));

  // Ensure CCW winding
  let area = 0;
  for (let i = 0; i < polygon2D.length; i++) {
    const j = (i + 1) % polygon2D.length;
    area += polygon2D[i].x * polygon2D[j].y;
    area -= polygon2D[j].x * polygon2D[i].y;
  }

  if (area < 0) {
    // Reverse to make CCW
    polygon2D.reverse();
    // We'll need to reverse the indices later
  }

  const indices: number[] = [];
  const remaining = Array.from({ length: vertices.length }, (_, i) => i);

  let attempts = 0;
  const maxAttempts = vertices.length * vertices.length;

  while (remaining.length > 3 && attempts < maxAttempts) {
    let earFound = false;

    for (let i = 0; i < remaining.length; i++) {
      const prevIdx = (i - 1 + remaining.length) % remaining.length;
      const nextIdx = (i + 1) % remaining.length;

      const prevI = remaining[prevIdx];
      const currI = remaining[i];
      const nextI = remaining[nextIdx];

      if (isEar(polygon2D, currI, prevI, nextI, remaining)) {
        // Add triangle (ensure correct winding for Babylon.js)
        if (area >= 0) {
          indices.push(prevI, currI, nextI);
        } else {
          indices.push(nextI, currI, prevI);
        }

        // Remove the ear vertex
        remaining.splice(i, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      attempts++;
    }
  }

  // Add final triangle
  if (remaining.length === 3) {
    if (area >= 0) {
      indices.push(remaining[0], remaining[1], remaining[2]);
    } else {
      indices.push(remaining[2], remaining[1], remaining[0]);
    }
    return indices;
  }

  // Failed to triangulate
  return null;
}

// ============================================================================
// FACE BUILDER CLASS
// ============================================================================

export class FaceBuilder {
  private scene: Scene;
  private defaultMaterial: StandardMaterial;

  constructor(scene: Scene) {
    this.scene = scene;

    // Create default material for faces
    this.defaultMaterial = new StandardMaterial('faceMaterial', scene);
    this.defaultMaterial.diffuseColor = new Color3(0.9, 0.9, 0.9);
    this.defaultMaterial.backFaceCulling = false;  // Double-sided
    this.defaultMaterial.twoSidedLighting = true;
  }

  /**
   * Validate edge loop for face creation
   */
  public validateLoop(
    vertices: Vector3[],
    options: { tolerance?: number } = {}
  ): { valid: boolean; error?: FaceCreationError; plane?: PlaneEquation; normal?: Vector3 } {
    const tolerance = options.tolerance ?? PLANE_TOLERANCE;

    // Check minimum edges
    if (vertices.length < MIN_FACE_EDGES) {
      return { valid: false, error: 'too_few_edges' };
    }

    // Check coplanarity
    const plane = allPointsCoplanar(vertices, tolerance);
    if (!plane) {
      return { valid: false, error: 'not_planar' };
    }

    // Calculate normal using Newell's method (more robust)
    const normal = calculatePolygonNormal(vertices);

    // Check for self-intersection
    if (hasSelfIntersection(vertices, normal)) {
      return { valid: false, error: 'self_intersect' };
    }

    // Check for degenerate (zero area)
    const area = this.calculateArea(vertices, normal);
    if (Math.abs(area) < 1e-10) {
      return { valid: false, error: 'degenerate' };
    }

    return { valid: true, plane, normal };
  }

  /**
   * Calculate the area of a polygon
   */
  private calculateArea(vertices: Vector3[], normal: Vector3): number {
    let area = 0;
    const n = vertices.length;

    for (let i = 0; i < n; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % n];

      // Cross product contribution
      const cross = Vector3.Cross(current, next);
      area += Vector3.Dot(cross, normal);
    }

    return Math.abs(area) / 2;
  }

  /**
   * Create a mesh from an edge loop with optional inner loops (holes)
   */
  public createFaceMesh(
    faceId: GeometryId,
    vertices: Vector3[],
    options: {
      material?: StandardMaterial;
      flipNormal?: boolean;
      innerLoops?: Vector3[][];  // Array of inner loops (holes)
    } = {}
  ): FaceCreationResult {
    // Validate the outer loop
    const validation = this.validateLoop(vertices);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const normal = validation.normal!;

    // Ensure CCW winding (SketchUp standard)
    let orderedVertices = [...vertices];
    if (!isLoopCCW(orderedVertices, normal)) {
      orderedVertices = orderedVertices.reverse();
    }

    // Flip normal if requested
    const finalNormal = options.flipNormal ? normal.negate() : normal;

    // Handle inner loops (holes)
    if (options.innerLoops && options.innerLoops.length > 0) {
      return this.createFaceMeshWithHoles(
        faceId,
        orderedVertices,
        options.innerLoops,
        finalNormal,
        options.material
      );
    }

    // Triangulate (simple case, no holes)
    const triangleIndices = earClipTriangulate(orderedVertices, finalNormal);
    if (!triangleIndices) {
      return { success: false, error: 'triangulation_failed' };
    }

    // Create vertex data
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const uvCoords = calculateUVs(orderedVertices, finalNormal);

    for (let i = 0; i < orderedVertices.length; i++) {
      const v = orderedVertices[i];
      positions.push(v.x, v.y, v.z);
      normals.push(finalNormal.x, finalNormal.y, finalNormal.z);
      uvs.push(uvCoords[i].x, uvCoords[i].y);
    }

    // Create mesh
    const mesh = new Mesh(`face_${faceId}`, this.scene);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = triangleIndices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;

    vertexData.applyToMesh(mesh, true);

    mesh.material = options.material ?? this.defaultMaterial;
    mesh.isPickable = true;

    return {
      success: true,
      faceId,
      mesh,
    };
  }

  /**
   * Create a mesh with holes using bridge algorithm
   * Connects outer boundary to inner holes to create a single polygon
   */
  private createFaceMeshWithHoles(
    faceId: GeometryId,
    outerLoop: Vector3[],
    innerLoops: Vector3[][],
    normal: Vector3,
    material?: StandardMaterial
  ): FaceCreationResult {
    // Project to 2D for hole bridging
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

    // Ensure inner loops are CW (opposite of outer loop for holes)
    const processedInnerLoops: Vector3[][] = [];
    for (const innerLoop of innerLoops) {
      let processed = [...innerLoop];
      if (isLoopCCW(processed, normal)) {
        processed = processed.reverse();
      }
      processedInnerLoops.push(processed);
    }

    // Bridge algorithm: connect each hole to outer boundary
    let mergedVertices = [...outerLoop];

    for (const innerLoop of processedInnerLoops) {
      // Find rightmost point in inner loop
      let innerRightmostIdx = 0;
      let maxX = -Infinity;
      for (let i = 0; i < innerLoop.length; i++) {
        const x = innerLoop[i][axis1];
        if (x > maxX) {
          maxX = x;
          innerRightmostIdx = i;
        }
      }

      // Find closest visible point on outer boundary
      const innerPoint = innerLoop[innerRightmostIdx];
      let bestOuterIdx = 0;
      let minDist = Infinity;

      for (let i = 0; i < mergedVertices.length; i++) {
        const dist = Vector3.Distance(innerPoint, mergedVertices[i]);
        if (dist < minDist) {
          minDist = dist;
          bestOuterIdx = i;
        }
      }

      // Create bridge: insert hole vertices into merged polygon
      // Order: outer[0..bestOuterIdx] + inner[rightmost..end] + inner[0..rightmost] + outer[bestOuterIdx..]
      const reorderedInner: Vector3[] = [];
      for (let i = 0; i < innerLoop.length; i++) {
        const idx = (innerRightmostIdx + i) % innerLoop.length;
        reorderedInner.push(innerLoop[idx]);
      }

      // Insert with bridge edges
      const newMerged: Vector3[] = [];
      for (let i = 0; i <= bestOuterIdx; i++) {
        newMerged.push(mergedVertices[i]);
      }
      // Bridge to hole
      for (const v of reorderedInner) {
        newMerged.push(v);
      }
      // Bridge back
      newMerged.push(reorderedInner[0].clone());
      newMerged.push(mergedVertices[bestOuterIdx].clone());
      // Rest of outer
      for (let i = bestOuterIdx + 1; i < mergedVertices.length; i++) {
        newMerged.push(mergedVertices[i]);
      }

      mergedVertices = newMerged;
    }

    // Triangulate the merged polygon
    const triangleIndices = earClipTriangulate(mergedVertices, normal);
    if (!triangleIndices) {
      return { success: false, error: 'triangulation_failed' };
    }

    // Create vertex data
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const uvCoords = calculateUVs(mergedVertices, normal);

    for (let i = 0; i < mergedVertices.length; i++) {
      const v = mergedVertices[i];
      positions.push(v.x, v.y, v.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(uvCoords[i].x, uvCoords[i].y);
    }

    // Create mesh
    const mesh = new Mesh(`face_${faceId}`, this.scene);

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = triangleIndices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;

    vertexData.applyToMesh(mesh, true);

    mesh.material = material ?? this.defaultMaterial;
    mesh.isPickable = true;

    return {
      success: true,
      faceId,
      mesh,
    };
  }

  /**
   * Create a double-sided face (both front and back)
   * This creates two meshes with opposite normals
   */
  public createDoubleSidedFace(
    faceId: GeometryId,
    vertices: Vector3[],
    options: {
      frontMaterial?: StandardMaterial;
      backMaterial?: StandardMaterial;
    } = {}
  ): { front: FaceCreationResult; back: FaceCreationResult } {
    const frontResult = this.createFaceMesh(faceId, vertices, {
      material: options.frontMaterial,
      flipNormal: false,
    });

    const backResult = this.createFaceMesh(`${faceId}_back`, vertices, {
      material: options.backMaterial,
      flipNormal: true,
    });

    return { front: frontResult, back: backResult };
  }

  /**
   * Update an existing face mesh with new vertices
   */
  public updateFaceMesh(
    mesh: Mesh,
    vertices: Vector3[]
  ): { success: boolean; error?: FaceCreationError } {
    const validation = this.validateLoop(vertices);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const normal = validation.normal!;

    let orderedVertices = [...vertices];
    if (!isLoopCCW(orderedVertices, normal)) {
      orderedVertices = orderedVertices.reverse();
    }

    const triangleIndices = earClipTriangulate(orderedVertices, normal);
    if (!triangleIndices) {
      return { success: false, error: 'triangulation_failed' };
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const uvCoords = calculateUVs(orderedVertices, normal);

    for (let i = 0; i < orderedVertices.length; i++) {
      const v = orderedVertices[i];
      positions.push(v.x, v.y, v.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(uvCoords[i].x, uvCoords[i].y);
    }

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = triangleIndices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;

    vertexData.applyToMesh(mesh, true);

    return { success: true };
  }

  /**
   * Dispose of a face mesh
   */
  public disposeFaceMesh(mesh: Mesh): void {
    mesh.dispose();
  }

  /**
   * Get the default material
   */
  public getDefaultMaterial(): StandardMaterial {
    return this.defaultMaterial;
  }

  /**
   * Create a new material with specified color
   */
  public createMaterial(name: string, color: Color3): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = color;
    material.backFaceCulling = false;
    material.twoSidedLighting = true;
    return material;
  }
}

export default FaceBuilder;
