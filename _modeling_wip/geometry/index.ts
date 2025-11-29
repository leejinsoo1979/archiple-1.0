/**
 * Geometry Module - Winged-Edge based topology and face creation
 *
 * Exports:
 * - WingedEdge data structures and algorithms
 * - FaceBuilder for Babylon.js mesh creation
 */

// Winged-Edge data structures and algorithms
export {
  // Types
  type WingedEdge,
  type HalfEdge,
  type EdgeLoop,
  type PlaneEquation,
  type LoopSearchResult,
  // Constants
  PLANE_TOLERANCE,
  MIN_FACE_EDGES,
  COLINEARITY_TOLERANCE,
  // Plane utilities
  calculatePlaneFromPoints,
  signedDistanceToPlane,
  pointOnPlane,
  allPointsCoplanar,
  // Loop orientation utilities
  calculateSignedArea,
  isLoopCCW,
  calculatePolygonNormal,
  // Self-intersection check
  hasSelfIntersection,
  // Edge loop detection
  findClosedLoopsFromVertex,
  findMinimalLoopForEdge,
} from './WingedEdge';

// Face creation with Babylon.js
export {
  type FaceCreationResult,
  type FaceCreationError,
  FaceBuilder,
} from './FaceBuilder';
