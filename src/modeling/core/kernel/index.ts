/**
 * 3D Half-Edge Geometry Kernel
 *
 * This module provides the topological foundation for 3D modeling.
 * It uses a Half-Edge (DCEL) data structure for efficient topology queries.
 *
 * Usage:
 * ```typescript
 * import { HalfEdgeMesh } from '@/modeling/core/kernel';
 *
 * const kernel = new HalfEdgeMesh();
 *
 * // Add vertices
 * const v1 = kernel.addVertex(new Vector3(0, 0, 0));
 * const v2 = kernel.addVertex(new Vector3(1, 0, 0));
 * const v3 = kernel.addVertex(new Vector3(1, 0, 1));
 *
 * // Add edges (with auto-snap to existing vertices)
 * kernel.addEdge(v1.id, v2.id);
 *
 * // Create a face
 * kernel.addFace([v1.id, v2.id, v3.id]);
 *
 * // Query topology
 * const neighbors = kernel.getAdjacentFaces(face.id);
 *
 * // Listen to changes
 * kernel.on('topology:changed', () => {
 *   // Rebuild 3D meshes
 * });
 * ```
 */

// Core types
export * from './types';

// Main kernel class
export { HalfEdgeMesh } from './HalfEdgeMesh';
