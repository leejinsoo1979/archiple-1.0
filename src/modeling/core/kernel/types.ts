/**
 * 3D Half-Edge Geometry Kernel - Type Definitions
 *
 * This is a DCEL (Doubly Connected Edge List) implementation for 3D modeling.
 * It provides topological connectivity for vertices, edges, and faces.
 *
 * Key concepts:
 * - Each edge is split into two "half-edges" pointing in opposite directions
 * - Half-edges form loops around faces
 * - Topology is separate from rendering (Babylon.js meshes are generated from this)
 */

import { Vector3 } from '@babylonjs/core';

// ============================================
// ID Types (UUIDs for stable references)
// ============================================

export type VertexID = string;
export type EdgeID = string;
export type FaceID = string;

// ============================================
// Core Data Structures
// ============================================

/**
 * HVertex - A point in 3D space with topological connections
 */
export interface HVertex {
  /** Unique identifier */
  id: VertexID;

  /** 3D position */
  position: Vector3;

  /** Reference to ONE outgoing half-edge (for traversal) */
  outgoing: EdgeID | null;

  /** Optional metadata (snap type, constraints, etc.) */
  metadata?: {
    snapType?: 'endpoint' | 'midpoint' | 'intersection' | 'grid';
    constraints?: string[];
    [key: string]: unknown;
  };
}

/**
 * HEdge - A half-edge (directed edge segment)
 *
 * Half-edges always come in pairs (twins) pointing opposite directions.
 * They form loops around faces via next/prev pointers.
 */
export interface HEdge {
  /** Unique identifier */
  id: EdgeID;

  /** Origin vertex (where this half-edge starts) */
  origin: VertexID;

  /** Twin half-edge (same edge, opposite direction) */
  twin: EdgeID | null;

  /** Face this half-edge belongs to (null if boundary) */
  face: FaceID | null;

  /** Next half-edge in the face loop (counter-clockwise) */
  next: EdgeID | null;

  /** Previous half-edge in the face loop */
  prev: EdgeID | null;

  /** Optional metadata */
  metadata?: {
    isConstruction?: boolean;  // Construction line (not solid)
    color?: string;
    [key: string]: unknown;
  };
}

/**
 * HFace - A polygonal face bounded by half-edges
 */
export interface HFace {
  /** Unique identifier */
  id: FaceID;

  /** One half-edge on the outer boundary (for traversal) */
  outer: EdgeID | null;

  /** Cached face normal (recomputed when geometry changes) */
  normal: Vector3;

  /** Inner loops (holes) - each is a reference to one half-edge per hole */
  inner?: EdgeID[];

  /** Optional metadata */
  metadata?: {
    material?: string;
    color?: string;
    faceDir?: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
    [key: string]: unknown;
  };
}

// ============================================
// Query Result Types
// ============================================

/**
 * Result of a vertex proximity query
 */
export interface VertexQueryResult {
  vertex: HVertex;
  distance: number;
}

/**
 * Result of an edge proximity query
 */
export interface EdgeQueryResult {
  edge: HEdge;
  closestPoint: Vector3;
  distance: number;
  parameter: number;  // 0-1 along edge
}

/**
 * Result of topology validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================
// Operation Types
// ============================================

/**
 * Options for adding a vertex
 */
export interface AddVertexOptions {
  snapThreshold?: number;      // Auto-snap to existing vertex if within threshold
  mergeCoincident?: boolean;   // Merge with existing vertex at same position
  metadata?: HVertex['metadata'];
}

/**
 * Options for adding an edge
 */
export interface AddEdgeOptions {
  createTwin?: boolean;        // Automatically create twin half-edge
  splitIntersecting?: boolean; // Split edges that intersect
  metadata?: HEdge['metadata'];
}

/**
 * Options for adding a face
 */
export interface AddFaceOptions {
  computeNormal?: boolean;     // Auto-compute face normal
  metadata?: HFace['metadata'];
}

// ============================================
// Event Types (for observer pattern)
// ============================================

export type KernelEventType =
  | 'vertex:added'
  | 'vertex:removed'
  | 'vertex:moved'
  | 'edge:added'
  | 'edge:removed'
  | 'edge:split'
  | 'face:added'
  | 'face:removed'
  | 'topology:changed';

export interface KernelEvent {
  type: KernelEventType;
  data: {
    vertexIds?: VertexID[];
    edgeIds?: EdgeID[];
    faceIds?: FaceID[];
  };
}

export type KernelEventHandler = (event: KernelEvent) => void;
