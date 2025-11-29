/**
 * Geometry Store - Edge/Vertex Graph Management
 * SketchUp-style geometry storage with face detection
 */

import { create } from 'zustand';
import { Vector3 } from '@babylonjs/core';
import type {
  Vertex,
  Edge,
  Face,
  GeometryId,
  GeometryOperation,
} from '../types';
import { generateId } from '../types';

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================

interface GeometryState {
  // Core data
  vertices: Map<GeometryId, Vertex>;
  edges: Map<GeometryId, Edge>;
  faces: Map<GeometryId, Face>;

  // History for undo/redo
  history: GeometryOperation[];
  historyIndex: number;

  // Selection state
  selectedVertices: Set<GeometryId>;
  selectedEdges: Set<GeometryId>;
  selectedFaces: Set<GeometryId>;
  hoveredGeometry: { type: 'vertex' | 'edge' | 'face'; id: GeometryId } | null;

  // Actions
  addVertex: (position: Vector3, isConstruction?: boolean) => Vertex;
  addEdge: (startVertexId: GeometryId, endVertexId: GeometryId, isConstruction?: boolean) => Edge | null;
  addFace: (edgeIds: GeometryId[]) => Face | null;

  deleteVertex: (id: GeometryId) => boolean;
  deleteEdge: (id: GeometryId, deleteFaces?: boolean) => boolean;
  deleteFace: (id: GeometryId) => boolean;

  moveVertex: (id: GeometryId, newPosition: Vector3) => boolean;

  // Query methods
  getVertex: (id: GeometryId) => Vertex | undefined;
  getEdge: (id: GeometryId) => Edge | undefined;
  getFace: (id: GeometryId) => Face | undefined;

  getEdgeVertices: (edgeId: GeometryId) => { start: Vertex; end: Vertex } | null;
  getVertexPosition: (id: GeometryId) => Vector3 | null;
  getEdgeMidpoint: (edgeId: GeometryId) => Vector3 | null;
  getEdgeLength: (edgeId: GeometryId) => number;

  // Find by position
  findVertexAt: (position: Vector3, tolerance?: number) => Vertex | null;
  findVertexOrCreate: (position: Vector3, tolerance?: number, isConstruction?: boolean) => Vertex;
  findEdgesAt: (position: Vector3, tolerance?: number) => Edge[];

  // Graph traversal
  getConnectedEdges: (vertexId: GeometryId) => Edge[];
  getAdjacentVertices: (vertexId: GeometryId) => Vertex[];
  findClosedLoops: (startEdgeId: GeometryId) => GeometryId[][] | null;

  // Face detection
  detectNewFaces: (edgeId: GeometryId) => Face[];
  healFaces: () => Face[];

  // Selection
  selectVertex: (id: GeometryId, addToSelection?: boolean) => void;
  selectEdge: (id: GeometryId, addToSelection?: boolean) => void;
  selectFace: (id: GeometryId, addToSelection?: boolean) => void;
  clearSelection: () => void;
  setHoveredGeometry: (geo: { type: 'vertex' | 'edge' | 'face'; id: GeometryId } | null) => void;

  // History
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Utilities
  clear: () => void;
  getAllVertices: () => Vertex[];
  getAllEdges: () => Edge[];
  getAllFaces: () => Face[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const POSITION_TOLERANCE = 0.001; // 1mm tolerance for vertex matching

function vectorsEqual(a: Vector3, b: Vector3, tolerance: number = POSITION_TOLERANCE): boolean {
  return Vector3.Distance(a, b) < tolerance;
}

function calculateNormal(vertices: Vector3[]): Vector3 {
  if (vertices.length < 3) return Vector3.Up();

  const v1 = vertices[1].subtract(vertices[0]);
  const v2 = vertices[2].subtract(vertices[0]);
  return Vector3.Cross(v1, v2).normalize();
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useGeometryStore = create<GeometryState>((set, get) => ({
  // Initial state
  vertices: new Map(),
  edges: new Map(),
  faces: new Map(),
  history: [],
  historyIndex: -1,
  selectedVertices: new Set(),
  selectedEdges: new Set(),
  selectedFaces: new Set(),
  hoveredGeometry: null,

  // ============================================================================
  // ADD OPERATIONS
  // ============================================================================

  addVertex: (position: Vector3, isConstruction = false): Vertex => {
    const state = get();

    // Check for existing vertex at position
    const existing = state.findVertexAt(position);
    if (existing) return existing;

    const vertex: Vertex = {
      id: generateId(),
      position: position.clone(),
      connectedEdges: [],
      createdAt: Date.now(),
      isConstruction,
    };

    set((s) => {
      const newVertices = new Map(s.vertices);
      newVertices.set(vertex.id, vertex);

      // Record operation
      const operation: GeometryOperation = {
        type: 'add_vertex',
        timestamp: Date.now(),
        data: { vertices: [vertex] },
      };

      return {
        vertices: newVertices,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
      };
    });

    return vertex;
  },

  addEdge: (startVertexId: GeometryId, endVertexId: GeometryId, isConstruction = false): Edge | null => {
    const state = get();

    // Validate vertices exist
    const startVertex = state.vertices.get(startVertexId);
    const endVertex = state.vertices.get(endVertexId);
    if (!startVertex || !endVertex) return null;

    // Don't allow edge to same vertex
    if (startVertexId === endVertexId) return null;

    // Check for existing edge between these vertices
    for (const [, edge] of state.edges) {
      if (
        (edge.startVertexId === startVertexId && edge.endVertexId === endVertexId) ||
        (edge.startVertexId === endVertexId && edge.endVertexId === startVertexId)
      ) {
        return edge; // Return existing edge
      }
    }

    const edge: Edge = {
      id: generateId(),
      startVertexId,
      endVertexId,
      connectedFaces: [],
      isConstruction,
      isSoft: false,
      isSmooth: false,
      isHidden: false,
      createdAt: Date.now(),
    };

    set((s) => {
      const newEdges = new Map(s.edges);
      newEdges.set(edge.id, edge);

      // Update vertices' connected edges
      const newVertices = new Map(s.vertices);
      const sv = { ...newVertices.get(startVertexId)! };
      sv.connectedEdges = [...sv.connectedEdges, edge.id];
      newVertices.set(startVertexId, sv);

      const ev = { ...newVertices.get(endVertexId)! };
      ev.connectedEdges = [...ev.connectedEdges, edge.id];
      newVertices.set(endVertexId, ev);

      const operation: GeometryOperation = {
        type: 'add_edge',
        timestamp: Date.now(),
        data: { edges: [edge] },
      };

      return {
        vertices: newVertices,
        edges: newEdges,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
      };
    });

    // Auto-detect and create faces
    const newFaces = get().detectNewFaces(edge.id);
    if (newFaces.length > 0) {
      console.log(`Created ${newFaces.length} new face(s)`);
    }

    return edge;
  },

  addFace: (edgeIds: GeometryId[]): Face | null => {
    const state = get();

    // Validate all edges exist
    for (const eid of edgeIds) {
      if (!state.edges.has(eid)) return null;
    }

    // Calculate face normal from vertices
    const vertices: Vector3[] = [];
    for (const eid of edgeIds) {
      const edge = state.edges.get(eid)!;
      const v = state.vertices.get(edge.startVertexId);
      if (v) vertices.push(v.position);
    }

    const face: Face = {
      id: generateId(),
      edgeIds: [...edgeIds],
      normal: calculateNormal(vertices),
      isHidden: false,
      createdAt: Date.now(),
    };

    set((s) => {
      const newFaces = new Map(s.faces);
      newFaces.set(face.id, face);

      // Update edges' connected faces
      const newEdges = new Map(s.edges);
      for (const eid of edgeIds) {
        const edge = { ...newEdges.get(eid)! };
        edge.connectedFaces = [...edge.connectedFaces, face.id];
        newEdges.set(eid, edge);
      }

      const operation: GeometryOperation = {
        type: 'add_face',
        timestamp: Date.now(),
        data: { faces: [face] },
      };

      return {
        faces: newFaces,
        edges: newEdges,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
      };
    });

    return face;
  },

  // ============================================================================
  // DELETE OPERATIONS
  // ============================================================================

  deleteVertex: (id: GeometryId): boolean => {
    const state = get();
    const vertex = state.vertices.get(id);
    if (!vertex) return false;

    // Delete all connected edges first (this will also delete connected faces)
    for (const edgeId of [...vertex.connectedEdges]) {
      state.deleteEdge(edgeId, true);
    }

    set((s) => {
      const newVertices = new Map(s.vertices);
      newVertices.delete(id);

      const operation: GeometryOperation = {
        type: 'delete_vertex',
        timestamp: Date.now(),
        data: { vertices: [vertex] },
      };

      return {
        vertices: newVertices,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
        selectedVertices: new Set([...s.selectedVertices].filter(vid => vid !== id)),
      };
    });

    return true;
  },

  deleteEdge: (id: GeometryId, deleteFaces = true): boolean => {
    const state = get();
    const edge = state.edges.get(id);
    if (!edge) return false;

    // Delete connected faces if requested
    if (deleteFaces) {
      for (const faceId of [...edge.connectedFaces]) {
        state.deleteFace(faceId);
      }
    }

    set((s) => {
      const newEdges = new Map(s.edges);
      newEdges.delete(id);

      // Remove edge from connected vertices
      const newVertices = new Map(s.vertices);
      const sv = newVertices.get(edge.startVertexId);
      if (sv) {
        const updatedSv = { ...sv };
        updatedSv.connectedEdges = sv.connectedEdges.filter(eid => eid !== id);
        newVertices.set(edge.startVertexId, updatedSv);
      }
      const ev = newVertices.get(edge.endVertexId);
      if (ev) {
        const updatedEv = { ...ev };
        updatedEv.connectedEdges = ev.connectedEdges.filter(eid => eid !== id);
        newVertices.set(edge.endVertexId, updatedEv);
      }

      const operation: GeometryOperation = {
        type: 'delete_edge',
        timestamp: Date.now(),
        data: { edges: [edge] },
      };

      return {
        edges: newEdges,
        vertices: newVertices,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
        selectedEdges: new Set([...s.selectedEdges].filter(eid => eid !== id)),
      };
    });

    return true;
  },

  deleteFace: (id: GeometryId): boolean => {
    const state = get();
    const face = state.faces.get(id);
    if (!face) return false;

    set((s) => {
      const newFaces = new Map(s.faces);
      newFaces.delete(id);

      // Remove face from connected edges
      const newEdges = new Map(s.edges);
      for (const edgeId of face.edgeIds) {
        const edge = newEdges.get(edgeId);
        if (edge) {
          const updatedEdge = { ...edge };
          updatedEdge.connectedFaces = edge.connectedFaces.filter(fid => fid !== id);
          newEdges.set(edgeId, updatedEdge);
        }
      }

      const operation: GeometryOperation = {
        type: 'delete_face',
        timestamp: Date.now(),
        data: { faces: [face] },
      };

      return {
        faces: newFaces,
        edges: newEdges,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
        selectedFaces: new Set([...s.selectedFaces].filter(fid => fid !== id)),
      };
    });

    return true;
  },

  // ============================================================================
  // MODIFY OPERATIONS
  // ============================================================================

  moveVertex: (id: GeometryId, newPosition: Vector3): boolean => {
    const state = get();
    const vertex = state.vertices.get(id);
    if (!vertex) return false;

    const previousPosition = vertex.position.clone();

    set((s) => {
      const newVertices = new Map(s.vertices);
      const updatedVertex = { ...vertex, position: newPosition.clone() };
      newVertices.set(id, updatedVertex);

      const operation: GeometryOperation = {
        type: 'modify_vertex',
        timestamp: Date.now(),
        data: { previousState: { position: previousPosition } as Partial<Vertex> },
      };

      return {
        vertices: newVertices,
        history: [...s.history.slice(0, s.historyIndex + 1), operation],
        historyIndex: s.historyIndex + 1,
      };
    });

    return true;
  },

  // ============================================================================
  // QUERY METHODS
  // ============================================================================

  getVertex: (id: GeometryId) => get().vertices.get(id),
  getEdge: (id: GeometryId) => get().edges.get(id),
  getFace: (id: GeometryId) => get().faces.get(id),

  getEdgeVertices: (edgeId: GeometryId) => {
    const state = get();
    const edge = state.edges.get(edgeId);
    if (!edge) return null;

    const start = state.vertices.get(edge.startVertexId);
    const end = state.vertices.get(edge.endVertexId);
    if (!start || !end) return null;

    return { start, end };
  },

  getVertexPosition: (id: GeometryId): Vector3 | null => {
    const vertex = get().vertices.get(id);
    return vertex ? vertex.position.clone() : null;
  },

  getEdgeMidpoint: (edgeId: GeometryId): Vector3 | null => {
    const verts = get().getEdgeVertices(edgeId);
    if (!verts) return null;
    return verts.start.position.add(verts.end.position).scale(0.5);
  },

  getEdgeLength: (edgeId: GeometryId): number => {
    const verts = get().getEdgeVertices(edgeId);
    if (!verts) return 0;
    return Vector3.Distance(verts.start.position, verts.end.position);
  },

  // ============================================================================
  // FIND METHODS
  // ============================================================================

  findVertexAt: (position: Vector3, tolerance = POSITION_TOLERANCE): Vertex | null => {
    const state = get();
    for (const [, vertex] of state.vertices) {
      if (vectorsEqual(vertex.position, position, tolerance)) {
        return vertex;
      }
    }
    return null;
  },

  findVertexOrCreate: (position: Vector3, tolerance = POSITION_TOLERANCE, isConstruction = false): Vertex => {
    const existing = get().findVertexAt(position, tolerance);
    if (existing) return existing;
    return get().addVertex(position, isConstruction);
  },

  findEdgesAt: (position: Vector3, tolerance = POSITION_TOLERANCE): Edge[] => {
    const state = get();
    const result: Edge[] = [];

    for (const [, edge] of state.edges) {
      const verts = state.getEdgeVertices(edge.id);
      if (!verts) continue;

      // Check if point is on edge
      const start = verts.start.position;
      const end = verts.end.position;
      const edgeVec = end.subtract(start);
      const pointVec = position.subtract(start);

      const edgeLength = edgeVec.length();
      if (edgeLength < 0.0001) continue;

      const normalized = edgeVec.normalize();
      const projection = Vector3.Dot(pointVec, normalized);

      if (projection < -tolerance || projection > edgeLength + tolerance) continue;

      const closestPoint = start.add(normalized.scale(Math.max(0, Math.min(edgeLength, projection))));
      const distance = Vector3.Distance(position, closestPoint);

      if (distance < tolerance) {
        result.push(edge);
      }
    }

    return result;
  },

  // ============================================================================
  // GRAPH TRAVERSAL
  // ============================================================================

  getConnectedEdges: (vertexId: GeometryId): Edge[] => {
    const state = get();
    const vertex = state.vertices.get(vertexId);
    if (!vertex) return [];

    return vertex.connectedEdges
      .map(eid => state.edges.get(eid))
      .filter((e): e is Edge => e !== undefined);
  },

  getAdjacentVertices: (vertexId: GeometryId): Vertex[] => {
    const state = get();
    const edges = state.getConnectedEdges(vertexId);

    const adjacentIds = new Set<GeometryId>();
    for (const edge of edges) {
      if (edge.startVertexId !== vertexId) adjacentIds.add(edge.startVertexId);
      if (edge.endVertexId !== vertexId) adjacentIds.add(edge.endVertexId);
    }

    return Array.from(adjacentIds)
      .map(vid => state.vertices.get(vid))
      .filter((v): v is Vertex => v !== undefined);
  },

  findClosedLoops: (startEdgeId: GeometryId): GeometryId[][] | null => {
    const state = get();
    const startEdge = state.edges.get(startEdgeId);
    if (!startEdge) return null;

    const loops: GeometryId[][] = [];

    // BFS to find closed loops starting from this edge
    const findLoopFrom = (currentVertexId: GeometryId, targetVertexId: GeometryId, path: GeometryId[], visited: Set<GeometryId>): void => {
      if (path.length > 20) return; // Limit search depth

      const edges = state.getConnectedEdges(currentVertexId);

      for (const edge of edges) {
        if (visited.has(edge.id)) continue;
        if (path.length === 0 && edge.id !== startEdgeId) continue;

        const nextVertexId = edge.startVertexId === currentVertexId ? edge.endVertexId : edge.startVertexId;

        if (nextVertexId === targetVertexId && path.length >= 2) {
          // Found a closed loop
          loops.push([...path, edge.id]);
          continue;
        }

        visited.add(edge.id);
        findLoopFrom(nextVertexId, targetVertexId, [...path, edge.id], visited);
        visited.delete(edge.id);
      }
    };

    // Try to find loops from both endpoints
    findLoopFrom(startEdge.endVertexId, startEdge.startVertexId, [startEdgeId], new Set([startEdgeId]));

    return loops.length > 0 ? loops : null;
  },

  // ============================================================================
  // FACE DETECTION
  // ============================================================================

  detectNewFaces: (edgeId: GeometryId): Face[] => {
    const state = get();
    const loops = state.findClosedLoops(edgeId);
    if (!loops) return [];

    const createdFaces: Face[] = [];

    for (const loop of loops) {
      // Check if this loop already has a face
      let hasFace = false;
      for (const [, face] of state.faces) {
        const loopSet = new Set(loop);
        const faceSet = new Set(face.edgeIds);
        if (loopSet.size === faceSet.size && [...loopSet].every(id => faceSet.has(id))) {
          hasFace = true;
          break;
        }
      }

      if (!hasFace) {
        const face = state.addFace(loop);
        if (face) createdFaces.push(face);
      }
    }

    return createdFaces;
  },

  healFaces: (): Face[] => {
    const state = get();
    const createdFaces: Face[] = [];

    // Check all edges for potential faces
    for (const [edgeId] of state.edges) {
      const newFaces = state.detectNewFaces(edgeId);
      createdFaces.push(...newFaces);
    }

    return createdFaces;
  },

  // ============================================================================
  // SELECTION
  // ============================================================================

  selectVertex: (id: GeometryId, addToSelection = false) => {
    set((s) => ({
      selectedVertices: addToSelection
        ? new Set([...s.selectedVertices, id])
        : new Set([id]),
      selectedEdges: addToSelection ? s.selectedEdges : new Set(),
      selectedFaces: addToSelection ? s.selectedFaces : new Set(),
    }));
  },

  selectEdge: (id: GeometryId, addToSelection = false) => {
    set((s) => ({
      selectedEdges: addToSelection
        ? new Set([...s.selectedEdges, id])
        : new Set([id]),
      selectedVertices: addToSelection ? s.selectedVertices : new Set(),
      selectedFaces: addToSelection ? s.selectedFaces : new Set(),
    }));
  },

  selectFace: (id: GeometryId, addToSelection = false) => {
    set((s) => ({
      selectedFaces: addToSelection
        ? new Set([...s.selectedFaces, id])
        : new Set([id]),
      selectedVertices: addToSelection ? s.selectedVertices : new Set(),
      selectedEdges: addToSelection ? s.selectedEdges : new Set(),
    }));
  },

  clearSelection: () => {
    set({
      selectedVertices: new Set(),
      selectedEdges: new Set(),
      selectedFaces: new Set(),
    });
  },

  setHoveredGeometry: (geo) => {
    set({ hoveredGeometry: geo });
  },

  // ============================================================================
  // HISTORY
  // ============================================================================

  undo: (): boolean => {
    const state = get();
    if (state.historyIndex < 0) return false;

    const operation = state.history[state.historyIndex];
    // Implement undo logic based on operation type
    // For now, just decrement the index
    set((s) => ({ historyIndex: s.historyIndex - 1 }));

    console.log('Undo:', operation.type);
    return true;
  },

  redo: (): boolean => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return false;

    const operation = state.history[state.historyIndex + 1];
    set((s) => ({ historyIndex: s.historyIndex + 1 }));

    console.log('Redo:', operation.type);
    return true;
  },

  canUndo: () => get().historyIndex >= 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // ============================================================================
  // UTILITIES
  // ============================================================================

  clear: () => {
    set({
      vertices: new Map(),
      edges: new Map(),
      faces: new Map(),
      history: [],
      historyIndex: -1,
      selectedVertices: new Set(),
      selectedEdges: new Set(),
      selectedFaces: new Set(),
      hoveredGeometry: null,
    });
  },

  getAllVertices: () => Array.from(get().vertices.values()),
  getAllEdges: () => Array.from(get().edges.values()),
  getAllFaces: () => Array.from(get().faces.values()),
}));

export type { GeometryState };
