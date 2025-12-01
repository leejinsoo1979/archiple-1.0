/**
 * 3D Half-Edge Geometry Kernel - Main Graph Manager
 *
 * This class manages the topological structure of a 3D model using
 * the Half-Edge (DCEL) data structure.
 *
 * Features:
 * - Add/remove vertices, edges, faces
 * - Topology queries (adjacent vertices, edges, faces)
 * - Geometric queries (closest vertex, edge intersection)
 * - Euler operations (split edge, merge faces, etc.)
 * - Event system for change notifications
 */

import { Vector3 } from '@babylonjs/core';
import {
  VertexID,
  EdgeID,
  FaceID,
  HVertex,
  HEdge,
  HFace,
  AddVertexOptions,
  AddEdgeOptions,
  AddFaceOptions,
  VertexQueryResult,
  EdgeQueryResult,
  ValidationResult,
  KernelEvent,
  KernelEventType,
  KernelEventHandler,
} from './types';

/**
 * Generate a UUID for new entities
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * HalfEdgeMesh - The main 3D topology kernel
 */
export class HalfEdgeMesh {
  // ============================================
  // Data Storage
  // ============================================

  private vertices: Map<VertexID, HVertex> = new Map();
  private edges: Map<EdgeID, HEdge> = new Map();
  private faces: Map<FaceID, HFace> = new Map();

  // Event handlers
  private eventHandlers: Map<KernelEventType, Set<KernelEventHandler>> = new Map();

  // Spatial index threshold for snap queries
  private snapThreshold: number = 0.01; // 10mm default

  constructor() {
    // Initialize event handler sets
    const eventTypes: KernelEventType[] = [
      'vertex:added', 'vertex:removed', 'vertex:moved',
      'edge:added', 'edge:removed', 'edge:split',
      'face:added', 'face:removed', 'topology:changed'
    ];
    eventTypes.forEach(type => this.eventHandlers.set(type, new Set()));
  }

  // ============================================
  // Vertex Operations
  // ============================================

  /**
   * Add a new vertex at the given position
   */
  addVertex(position: Vector3, options?: AddVertexOptions): HVertex {
    const opts = {
      snapThreshold: options?.snapThreshold ?? this.snapThreshold,
      mergeCoincident: options?.mergeCoincident ?? true,
      metadata: options?.metadata,
    };

    // Check for existing vertex at same position (snap/merge)
    if (opts.mergeCoincident) {
      const existing = this.findVertexNear(position, opts.snapThreshold);
      if (existing) {
        return existing.vertex;
      }
    }

    // Create new vertex
    const vertex: HVertex = {
      id: generateId(),
      position: position.clone(),
      outgoing: null,
      metadata: opts.metadata,
    };

    this.vertices.set(vertex.id, vertex);
    this.emit('vertex:added', { vertexIds: [vertex.id] });

    return vertex;
  }

  /**
   * Remove a vertex and all connected edges
   */
  removeVertex(id: VertexID): boolean {
    const vertex = this.vertices.get(id);
    if (!vertex) return false;

    // Remove all edges connected to this vertex
    const connectedEdges = this.getEdgesFromVertex(id);
    for (const edge of connectedEdges) {
      this.removeEdge(edge.id);
    }

    this.vertices.delete(id);
    this.emit('vertex:removed', { vertexIds: [id] });

    return true;
  }

  /**
   * Move a vertex to a new position
   */
  moveVertex(id: VertexID, newPosition: Vector3): boolean {
    const vertex = this.vertices.get(id);
    if (!vertex) return false;

    vertex.position = newPosition.clone();

    // Recompute normals for affected faces
    const affectedFaces = this.getFacesFromVertex(id);
    for (const face of affectedFaces) {
      this.recomputeFaceNormal(face.id);
    }

    this.emit('vertex:moved', { vertexIds: [id] });
    return true;
  }

  /**
   * Get a vertex by ID
   */
  getVertex(id: VertexID): HVertex | undefined {
    return this.vertices.get(id);
  }

  /**
   * Get all vertices
   */
  getAllVertices(): HVertex[] {
    return Array.from(this.vertices.values());
  }

  // ============================================
  // Edge Operations
  // ============================================

  /**
   * Add a half-edge between two vertices
   * Optionally creates twin half-edge automatically
   */
  addEdge(
    originId: VertexID,
    destinationId: VertexID,
    options?: AddEdgeOptions
  ): HEdge | null {
    const origin = this.vertices.get(originId);
    const destination = this.vertices.get(destinationId);

    if (!origin || !destination) {
      console.warn('[HalfEdgeMesh] Cannot add edge: vertex not found');
      return null;
    }

    if (originId === destinationId) {
      console.warn('[HalfEdgeMesh] Cannot add edge: same vertex');
      return null;
    }

    // Check if edge already exists
    const existing = this.findEdgeBetween(originId, destinationId);
    if (existing) {
      return existing;
    }

    const opts = {
      createTwin: options?.createTwin ?? true,
      splitIntersecting: options?.splitIntersecting ?? false,
      metadata: options?.metadata,
    };

    // Create the half-edge
    const edge: HEdge = {
      id: generateId(),
      origin: originId,
      twin: null,
      face: null,
      next: null,
      prev: null,
      metadata: opts.metadata,
    };

    this.edges.set(edge.id, edge);

    // Update origin vertex outgoing reference
    if (!origin.outgoing) {
      origin.outgoing = edge.id;
    }

    // Create twin half-edge if requested
    if (opts.createTwin) {
      const twin: HEdge = {
        id: generateId(),
        origin: destinationId,
        twin: edge.id,
        face: null,
        next: null,
        prev: null,
        metadata: opts.metadata,
      };

      this.edges.set(twin.id, twin);
      edge.twin = twin.id;

      // Update destination vertex outgoing reference
      if (!destination.outgoing) {
        destination.outgoing = twin.id;
      }
    }

    this.emit('edge:added', { edgeIds: [edge.id, edge.twin].filter(Boolean) as EdgeID[] });

    return edge;
  }

  /**
   * Remove a half-edge and its twin
   */
  removeEdge(id: EdgeID): boolean {
    const edge = this.edges.get(id);
    if (!edge) return false;

    // Get twin before removing
    const twinId = edge.twin;

    // Update adjacent edges' next/prev pointers
    if (edge.prev) {
      const prevEdge = this.edges.get(edge.prev);
      if (prevEdge) prevEdge.next = edge.next;
    }
    if (edge.next) {
      const nextEdge = this.edges.get(edge.next);
      if (nextEdge) nextEdge.prev = edge.prev;
    }

    // Update origin vertex outgoing if needed
    const origin = this.vertices.get(edge.origin);
    if (origin && origin.outgoing === id) {
      // Find another outgoing edge
      const otherEdge = this.getEdgesFromVertex(edge.origin).find(e => e.id !== id);
      origin.outgoing = otherEdge?.id ?? null;
    }

    // Remove the edge
    this.edges.delete(id);

    // Remove twin if exists
    if (twinId) {
      const twin = this.edges.get(twinId);
      if (twin) {
        // Update twin's origin vertex outgoing
        const twinOrigin = this.vertices.get(twin.origin);
        if (twinOrigin && twinOrigin.outgoing === twinId) {
          const otherEdge = this.getEdgesFromVertex(twin.origin).find(e => e.id !== twinId);
          twinOrigin.outgoing = otherEdge?.id ?? null;
        }
        this.edges.delete(twinId);
      }
    }

    this.emit('edge:removed', { edgeIds: [id, twinId].filter(Boolean) as EdgeID[] });

    return true;
  }

  /**
   * Split an edge at a point, creating a new vertex
   */
  splitEdge(edgeId: EdgeID, point: Vector3): { vertex: HVertex; edges: HEdge[] } | null {
    const edge = this.edges.get(edgeId);
    if (!edge) return null;

    const origin = this.vertices.get(edge.origin);
    const twin = edge.twin ? this.edges.get(edge.twin) : null;
    const destination = twin ? this.vertices.get(twin.origin) : null;

    if (!origin || !destination) return null;

    // Create new vertex at split point
    const newVertex = this.addVertex(point, { mergeCoincident: false });

    // Store original connections
    const originalNext = edge.next;
    const originalTwinPrev = twin?.prev;

    // Create new edges
    const newEdge1 = this.addEdge(edge.origin, newVertex.id, { createTwin: true });
    const newEdge2 = this.addEdge(newVertex.id, destination.id, { createTwin: true });

    if (!newEdge1 || !newEdge2) return null;

    // Transfer face references
    if (edge.face) {
      newEdge1.face = edge.face;
      newEdge2.face = edge.face;
    }
    if (twin?.face) {
      const newEdge1Twin = this.edges.get(newEdge1.twin!);
      const newEdge2Twin = this.edges.get(newEdge2.twin!);
      if (newEdge1Twin) newEdge1Twin.face = twin.face;
      if (newEdge2Twin) newEdge2Twin.face = twin.face;
    }

    // Link edges in sequence
    newEdge1.next = newEdge2.id;
    newEdge2.prev = newEdge1.id;
    newEdge2.next = originalNext;

    if (originalNext) {
      const nextEdge = this.edges.get(originalNext);
      if (nextEdge) nextEdge.prev = newEdge2.id;
    }

    // Remove original edge
    this.edges.delete(edge.id);
    if (twin) this.edges.delete(twin.id);

    this.emit('edge:split', {
      edgeIds: [edgeId],
      vertexIds: [newVertex.id],
    });

    return {
      vertex: newVertex,
      edges: [newEdge1, newEdge2],
    };
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: EdgeID): HEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get all edges
   */
  getAllEdges(): HEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get unique edges (one per edge pair, excluding twins)
   */
  getUniqueEdges(): HEdge[] {
    const seen = new Set<EdgeID>();
    const result: HEdge[] = [];

    for (const edge of this.edges.values()) {
      if (!seen.has(edge.id)) {
        result.push(edge);
        seen.add(edge.id);
        if (edge.twin) seen.add(edge.twin);
      }
    }

    return result;
  }

  // ============================================
  // Face Operations
  // ============================================

  /**
   * Add a face from an ordered list of vertex IDs
   * Creates edges if they don't exist
   */
  addFace(vertexIds: VertexID[], options?: AddFaceOptions): HFace | null {
    if (vertexIds.length < 3) {
      console.warn('[HalfEdgeMesh] Face requires at least 3 vertices');
      return null;
    }

    // Verify all vertices exist
    for (const vid of vertexIds) {
      if (!this.vertices.has(vid)) {
        console.warn(`[HalfEdgeMesh] Vertex ${vid} not found`);
        return null;
      }
    }

    const opts = {
      computeNormal: options?.computeNormal ?? true,
      metadata: options?.metadata,
    };

    // Create or get edges for the face boundary
    const faceEdges: HEdge[] = [];
    for (let i = 0; i < vertexIds.length; i++) {
      const v1 = vertexIds[i];
      const v2 = vertexIds[(i + 1) % vertexIds.length];

      let edge = this.findEdgeBetween(v1, v2);
      if (!edge) {
        edge = this.addEdge(v1, v2, { createTwin: true });
      }
      if (!edge) return null;

      faceEdges.push(edge);
    }

    // Create the face
    const face: HFace = {
      id: generateId(),
      outer: faceEdges[0].id,
      normal: Vector3.Zero(),
      metadata: opts.metadata,
    };

    this.faces.set(face.id, face);

    // Link edges in face loop
    for (let i = 0; i < faceEdges.length; i++) {
      const edge = faceEdges[i];
      const nextEdge = faceEdges[(i + 1) % faceEdges.length];
      const prevEdge = faceEdges[(i - 1 + faceEdges.length) % faceEdges.length];

      edge.face = face.id;
      edge.next = nextEdge.id;
      edge.prev = prevEdge.id;
    }

    // Compute normal if requested
    if (opts.computeNormal) {
      this.recomputeFaceNormal(face.id);
    }

    this.emit('face:added', { faceIds: [face.id] });

    return face;
  }

  /**
   * Remove a face (edges remain unless orphaned)
   */
  removeFace(id: FaceID): boolean {
    const face = this.faces.get(id);
    if (!face) return false;

    // Clear face reference from edges
    const faceEdges = this.getEdgesOfFace(id);
    for (const edge of faceEdges) {
      edge.face = null;
    }

    this.faces.delete(id);
    this.emit('face:removed', { faceIds: [id] });

    return true;
  }

  /**
   * Get a face by ID
   */
  getFace(id: FaceID): HFace | undefined {
    return this.faces.get(id);
  }

  /**
   * Get all faces
   */
  getAllFaces(): HFace[] {
    return Array.from(this.faces.values());
  }

  /**
   * Recompute a face's normal from its vertices
   */
  recomputeFaceNormal(faceId: FaceID): void {
    const face = this.faces.get(faceId);
    if (!face || !face.outer) return;

    const vertices = this.getVerticesOfFace(faceId);
    if (vertices.length < 3) return;

    // Use Newell's method for robust normal computation
    const normal = Vector3.Zero();

    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i].position;
      const next = vertices[(i + 1) % vertices.length].position;

      normal.x += (current.y - next.y) * (current.z + next.z);
      normal.y += (current.z - next.z) * (current.x + next.x);
      normal.z += (current.x - next.x) * (current.y + next.y);
    }

    normal.normalize();
    face.normal = normal;
  }

  // ============================================
  // Topology Queries
  // ============================================

  /**
   * Get all edges starting from a vertex
   */
  getEdgesFromVertex(vertexId: VertexID): HEdge[] {
    const result: HEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.origin === vertexId) {
        result.push(edge);
      }
    }
    return result;
  }

  /**
   * Get all edges connected to a vertex (both directions)
   */
  getEdgesConnectedToVertex(vertexId: VertexID): HEdge[] {
    const result: HEdge[] = [];
    const seen = new Set<EdgeID>();

    for (const edge of this.edges.values()) {
      if (edge.origin === vertexId || (edge.twin && this.edges.get(edge.twin)?.origin === vertexId)) {
        if (!seen.has(edge.id)) {
          result.push(edge);
          seen.add(edge.id);
          if (edge.twin) seen.add(edge.twin);
        }
      }
    }

    return result;
  }

  /**
   * Get all faces connected to a vertex
   */
  getFacesFromVertex(vertexId: VertexID): HFace[] {
    const edges = this.getEdgesFromVertex(vertexId);
    const faceIds = new Set<FaceID>();
    const result: HFace[] = [];

    for (const edge of edges) {
      if (edge.face && !faceIds.has(edge.face)) {
        const face = this.faces.get(edge.face);
        if (face) {
          result.push(face);
          faceIds.add(edge.face);
        }
      }
    }

    return result;
  }

  /**
   * Get all edges of a face (in order)
   */
  getEdgesOfFace(faceId: FaceID): HEdge[] {
    const face = this.faces.get(faceId);
    if (!face || !face.outer) return [];

    const result: HEdge[] = [];
    let currentId: EdgeID | null = face.outer;
    const startId = currentId;

    do {
      const edge = this.edges.get(currentId!);
      if (!edge) break;

      result.push(edge);
      currentId = edge.next;

      // Safety check for infinite loop
      if (result.length > 1000) {
        console.error('[HalfEdgeMesh] Infinite loop detected in face edges');
        break;
      }
    } while (currentId && currentId !== startId);

    return result;
  }

  /**
   * Get all vertices of a face (in order)
   */
  getVerticesOfFace(faceId: FaceID): HVertex[] {
    const edges = this.getEdgesOfFace(faceId);
    return edges
      .map(e => this.vertices.get(e.origin))
      .filter((v): v is HVertex => v !== undefined);
  }

  /**
   * Get adjacent faces to a face (sharing an edge)
   */
  getAdjacentFaces(faceId: FaceID): HFace[] {
    const edges = this.getEdgesOfFace(faceId);
    const result: HFace[] = [];
    const seen = new Set<FaceID>();
    seen.add(faceId);

    for (const edge of edges) {
      if (edge.twin) {
        const twin = this.edges.get(edge.twin);
        if (twin?.face && !seen.has(twin.face)) {
          const face = this.faces.get(twin.face);
          if (face) {
            result.push(face);
            seen.add(twin.face);
          }
        }
      }
    }

    return result;
  }

  // ============================================
  // Geometric Queries
  // ============================================

  /**
   * Find vertex nearest to a point within threshold
   */
  findVertexNear(point: Vector3, threshold?: number): VertexQueryResult | null {
    const th = threshold ?? this.snapThreshold;
    let closest: VertexQueryResult | null = null;

    for (const vertex of this.vertices.values()) {
      const distance = Vector3.Distance(point, vertex.position);
      if (distance <= th && (!closest || distance < closest.distance)) {
        closest = { vertex, distance };
      }
    }

    return closest;
  }

  /**
   * Find edge nearest to a point
   */
  findEdgeNear(point: Vector3, threshold?: number): EdgeQueryResult | null {
    const th = threshold ?? this.snapThreshold;
    let closest: EdgeQueryResult | null = null;

    for (const edge of this.getUniqueEdges()) {
      const origin = this.vertices.get(edge.origin);
      const twin = edge.twin ? this.edges.get(edge.twin) : null;
      const destination = twin ? this.vertices.get(twin.origin) : null;

      if (!origin || !destination) continue;

      // Find closest point on line segment
      const line = destination.position.subtract(origin.position);
      const lineLen = line.length();
      if (lineLen < 0.0001) continue;

      const lineDir = line.normalize();
      const toPoint = point.subtract(origin.position);
      let t = Vector3.Dot(toPoint, lineDir) / lineLen;
      t = Math.max(0, Math.min(1, t));

      const closestPoint = origin.position.add(line.scale(t));
      const distance = Vector3.Distance(point, closestPoint);

      if (distance <= th && (!closest || distance < closest.distance)) {
        closest = { edge, closestPoint, distance, parameter: t };
      }
    }

    return closest;
  }

  /**
   * Find half-edge going from v1 to v2
   */
  findEdgeBetween(v1: VertexID, v2: VertexID): HEdge | null {
    for (const edge of this.edges.values()) {
      if (edge.origin === v1) {
        const twin = edge.twin ? this.edges.get(edge.twin) : null;
        if (twin && twin.origin === v2) {
          return edge;
        }
      }
    }
    return null;
  }

  // ============================================
  // Validation
  // ============================================

  /**
   * Validate the mesh topology
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check vertex references
    for (const vertex of this.vertices.values()) {
      if (vertex.outgoing && !this.edges.has(vertex.outgoing)) {
        errors.push(`Vertex ${vertex.id} references non-existent edge ${vertex.outgoing}`);
      }
    }

    // Check edge references
    for (const edge of this.edges.values()) {
      if (!this.vertices.has(edge.origin)) {
        errors.push(`Edge ${edge.id} references non-existent origin vertex ${edge.origin}`);
      }
      if (edge.twin && !this.edges.has(edge.twin)) {
        errors.push(`Edge ${edge.id} references non-existent twin ${edge.twin}`);
      }
      if (edge.face && !this.faces.has(edge.face)) {
        errors.push(`Edge ${edge.id} references non-existent face ${edge.face}`);
      }
      if (edge.next && !this.edges.has(edge.next)) {
        errors.push(`Edge ${edge.id} references non-existent next edge ${edge.next}`);
      }
      if (edge.prev && !this.edges.has(edge.prev)) {
        errors.push(`Edge ${edge.id} references non-existent prev edge ${edge.prev}`);
      }

      // Check twin symmetry
      if (edge.twin) {
        const twin = this.edges.get(edge.twin);
        if (twin && twin.twin !== edge.id) {
          errors.push(`Edge ${edge.id} twin relationship is not symmetric`);
        }
      }
    }

    // Check face loops
    for (const face of this.faces.values()) {
      if (!face.outer) {
        warnings.push(`Face ${face.id} has no outer boundary`);
        continue;
      }

      const edges = this.getEdgesOfFace(face.id);
      if (edges.length < 3) {
        errors.push(`Face ${face.id} has fewer than 3 edges`);
      }

      // Check loop closure
      const firstEdge = this.edges.get(face.outer);
      const lastEdge = edges[edges.length - 1];
      if (firstEdge && lastEdge && lastEdge.next !== firstEdge.id) {
        errors.push(`Face ${face.id} boundary loop is not closed`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // Serialization
  // ============================================

  /**
   * Export mesh to JSON
   */
  toJSON(): object {
    return {
      vertices: Array.from(this.vertices.values()).map(v => ({
        id: v.id,
        position: { x: v.position.x, y: v.position.y, z: v.position.z },
        outgoing: v.outgoing,
        metadata: v.metadata,
      })),
      edges: Array.from(this.edges.values()).map(e => ({
        id: e.id,
        origin: e.origin,
        twin: e.twin,
        face: e.face,
        next: e.next,
        prev: e.prev,
        metadata: e.metadata,
      })),
      faces: Array.from(this.faces.values()).map(f => ({
        id: f.id,
        outer: f.outer,
        normal: { x: f.normal.x, y: f.normal.y, z: f.normal.z },
        inner: f.inner,
        metadata: f.metadata,
      })),
    };
  }

  /**
   * Import mesh from JSON
   */
  fromJSON(data: any): void {
    this.clear();

    // Restore vertices
    for (const v of data.vertices || []) {
      const vertex: HVertex = {
        id: v.id,
        position: new Vector3(v.position.x, v.position.y, v.position.z),
        outgoing: v.outgoing,
        metadata: v.metadata,
      };
      this.vertices.set(vertex.id, vertex);
    }

    // Restore edges
    for (const e of data.edges || []) {
      const edge: HEdge = {
        id: e.id,
        origin: e.origin,
        twin: e.twin,
        face: e.face,
        next: e.next,
        prev: e.prev,
        metadata: e.metadata,
      };
      this.edges.set(edge.id, edge);
    }

    // Restore faces
    for (const f of data.faces || []) {
      const face: HFace = {
        id: f.id,
        outer: f.outer,
        normal: new Vector3(f.normal.x, f.normal.y, f.normal.z),
        inner: f.inner,
        metadata: f.metadata,
      };
      this.faces.set(face.id, face);
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Clear all data
   */
  clear(): void {
    this.vertices.clear();
    this.edges.clear();
    this.faces.clear();
    this.emit('topology:changed', {});
  }

  /**
   * Get counts
   */
  get vertexCount(): number {
    return this.vertices.size;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  get faceCount(): number {
    return this.faces.size;
  }

  /**
   * Set snap threshold
   */
  setSnapThreshold(threshold: number): void {
    this.snapThreshold = threshold;
  }

  // ============================================
  // Event System
  // ============================================

  /**
   * Subscribe to kernel events
   */
  on(type: KernelEventType, handler: KernelEventHandler): () => void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.add(handler);
    }

    // Return unsubscribe function
    return () => {
      handlers?.delete(handler);
    };
  }

  /**
   * Emit an event
   */
  private emit(type: KernelEventType, data: KernelEvent['data']): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      const event: KernelEvent = { type, data };
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (e) {
          console.error(`[HalfEdgeMesh] Event handler error:`, e);
        }
      });
    }

    // Also emit generic topology:changed for any modification
    if (type !== 'topology:changed') {
      this.emit('topology:changed', data);
    }
  }
}
