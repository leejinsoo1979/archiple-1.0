/**
 * Snap System - SketchUp-style snapping and inference engine
 */

import {
  Scene,
  Vector3,
  Mesh,
  Ray,
  ArcRotateCamera,
} from '@babylonjs/core';
import { ISnapSystem, SnapResult, SnapOptions, SnapType } from '../types';

interface InferencePoint {
  point: Vector3;
  type: string;
  timestamp: number;
}

interface InferenceLine {
  start: Vector3;
  end: Vector3;
  type: string;
}

export class SnapSystem implements ISnapSystem {
  private scene: Scene;
  private camera: ArcRotateCamera | null = null;
  private enabled: boolean = true;
  private threshold: number = 0.15; // 150mm in world units

  // Inference engine state
  private inferencePoints: InferencePoint[] = [];
  private maxInferencePoints: number = 10;
  private inferenceTimeout: number = 5000; // 5 seconds

  // Cached data for performance
  private cachedEdges: Mesh[] = [];
  private cachedFaces: Mesh[] = [];
  private cacheTimestamp: number = 0;
  private cacheDuration: number = 100; // ms

  constructor(scene: Scene) {
    this.scene = scene;
  }

  setCamera(camera: ArcRotateCamera): void {
    this.camera = camera;
  }

  // ============================================
  // Main Snap Method
  // ============================================

  snap(point: Vector3, options?: SnapOptions): SnapResult {
    if (!this.enabled) {
      return { snapped: false, point, type: null };
    }

    const opts: Required<SnapOptions> = {
      enableEndpoint: options?.enableEndpoint ?? true,
      enableMidpoint: options?.enableMidpoint ?? true,
      enableIntersection: options?.enableIntersection ?? true,
      enablePerpendicular: options?.enablePerpendicular ?? true,
      enableParallel: options?.enableParallel ?? true,
      enableOnEdge: options?.enableOnEdge ?? true,
      enableOnFace: options?.enableOnFace ?? true,
      enableOrigin: options?.enableOrigin ?? true,
      enableAxis: options?.enableAxis ?? true,
      enableGrid: options?.enableGrid ?? false,
      threshold: options?.threshold ?? this.threshold,
      excludeMeshes: options?.excludeMeshes ?? [],
    };

    // Priority order for snap types
    const snapChecks: Array<() => SnapResult | null> = [
      () => opts.enableOrigin ? this.checkOriginSnap(point, opts.threshold) : null,
      () => opts.enableEndpoint ? this.checkEndpointSnap(point, opts.threshold, opts.excludeMeshes) : null,
      () => opts.enableMidpoint ? this.checkMidpointSnap(point, opts.threshold, opts.excludeMeshes) : null,
      () => opts.enableIntersection ? this.checkIntersectionSnap(point, opts.threshold) : null,
      () => opts.enableAxis ? this.checkAxisSnap(point, opts.threshold) : null,
      () => opts.enableOnEdge ? this.checkOnEdgeSnap(point, opts.threshold, opts.excludeMeshes) : null,
      () => opts.enableOnFace ? this.checkOnFaceSnap(point, opts.threshold, opts.excludeMeshes) : null,
      () => opts.enableGrid ? this.checkGridSnap(point, opts.threshold) : null,
    ];

    for (const check of snapChecks) {
      const result = check();
      if (result?.snapped) {
        return result;
      }
    }

    return { snapped: false, point, type: null };
  }

  // ============================================
  // Individual Snap Checks
  // ============================================

  private checkOriginSnap(point: Vector3, threshold: number): SnapResult | null {
    const origin = Vector3.Zero();
    const distance = Vector3.Distance(point, origin);

    if (distance < threshold) {
      return { snapped: true, point: origin.clone(), type: 'origin' };
    }
    return null;
  }

  private checkEndpointSnap(point: Vector3, threshold: number, excludeMeshes: Mesh[]): SnapResult | null {
    const edges = this.getEdges();

    for (const edge of edges) {
      if (excludeMeshes.includes(edge)) continue;
      if (!this.isVisibleFromCamera(edge.position)) continue;

      const vertices = this.getEdgeVertices(edge);
      if (!vertices) continue;

      for (const vertex of vertices) {
        const distance = Vector3.Distance(point, vertex);
        if (distance < threshold) {
          return { snapped: true, point: vertex.clone(), type: 'endpoint', reference: edge };
        }
      }
    }
    return null;
  }

  private checkMidpointSnap(point: Vector3, threshold: number, excludeMeshes: Mesh[]): SnapResult | null {
    const edges = this.getEdges();

    for (const edge of edges) {
      if (excludeMeshes.includes(edge)) continue;
      if (!this.isVisibleFromCamera(edge.position)) continue;

      const vertices = this.getEdgeVertices(edge);
      if (!vertices || vertices.length < 2) continue;

      const midpoint = vertices[0].add(vertices[1]).scale(0.5);
      const distance = Vector3.Distance(point, midpoint);

      if (distance < threshold) {
        return { snapped: true, point: midpoint, type: 'midpoint', reference: edge };
      }
    }
    return null;
  }

  private checkIntersectionSnap(point: Vector3, threshold: number): SnapResult | null {
    // Check intersections from inference points
    const lines = this.getInferenceLines();

    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const intersection = this.lineLineIntersection(
          lines[i].start, lines[i].end,
          lines[j].start, lines[j].end
        );
        if (intersection) {
          const distance = Vector3.Distance(point, intersection);
          if (distance < threshold) {
            return { snapped: true, point: intersection, type: 'intersection' };
          }
        }
      }
    }
    return null;
  }

  private checkAxisSnap(point: Vector3, threshold: number): SnapResult | null {
    // Snap to axis lines from inference points
    for (const infPoint of this.inferencePoints) {
      // X axis
      if (Math.abs(point.y - infPoint.point.y) < threshold &&
          Math.abs(point.z - infPoint.point.z) < threshold) {
        return {
          snapped: true,
          point: new Vector3(point.x, infPoint.point.y, infPoint.point.z),
          type: 'axis'
        };
      }
      // Y axis
      if (Math.abs(point.x - infPoint.point.x) < threshold &&
          Math.abs(point.z - infPoint.point.z) < threshold) {
        return {
          snapped: true,
          point: new Vector3(infPoint.point.x, point.y, infPoint.point.z),
          type: 'axis'
        };
      }
      // Z axis
      if (Math.abs(point.x - infPoint.point.x) < threshold &&
          Math.abs(point.y - infPoint.point.y) < threshold) {
        return {
          snapped: true,
          point: new Vector3(infPoint.point.x, infPoint.point.y, point.z),
          type: 'axis'
        };
      }
    }
    return null;
  }

  private checkOnEdgeSnap(point: Vector3, threshold: number, excludeMeshes: Mesh[]): SnapResult | null {
    const edges = this.getEdges();

    for (const edge of edges) {
      if (excludeMeshes.includes(edge)) continue;
      if (!this.isVisibleFromCamera(edge.position)) continue;

      const vertices = this.getEdgeVertices(edge);
      if (!vertices || vertices.length < 2) continue;

      const closestPoint = this.closestPointOnSegment(point, vertices[0], vertices[1]);
      const distance = Vector3.Distance(point, closestPoint);

      if (distance < threshold) {
        return { snapped: true, point: closestPoint, type: 'onEdge', reference: edge };
      }
    }
    return null;
  }

  private checkOnFaceSnap(point: Vector3, threshold: number, excludeMeshes: Mesh[]): SnapResult | null {
    const faces = this.getFaces();

    for (const face of faces) {
      if (excludeMeshes.includes(face)) continue;
      if (!this.isVisibleFromCamera(face.position)) continue;
      if (!this.isFrontFacing(face)) continue;

      // Project point onto face plane
      const faceNormal = this.getFaceNormal(face);
      if (!faceNormal) continue;

      const faceCenter = face.position;
      const toPoint = point.subtract(faceCenter);
      const distanceToPlane = Vector3.Dot(toPoint, faceNormal);

      if (Math.abs(distanceToPlane) < threshold) {
        const projectedPoint = point.subtract(faceNormal.scale(distanceToPlane));
        // TODO: Check if projected point is within face bounds
        return { snapped: true, point: projectedPoint, type: 'onFace', reference: face };
      }
    }
    return null;
  }

  private checkGridSnap(point: Vector3, threshold: number): SnapResult | null {
    const gridSize = 0.5; // 500mm grid
    const snappedX = Math.round(point.x / gridSize) * gridSize;
    const snappedZ = Math.round(point.z / gridSize) * gridSize;

    const snappedPoint = new Vector3(snappedX, point.y, snappedZ);
    const distance = Vector3.Distance(point, snappedPoint);

    if (distance < threshold) {
      return { snapped: true, point: snappedPoint, type: 'grid' };
    }
    return null;
  }

  // ============================================
  // Inference Engine
  // ============================================

  addInferencePoint(point: Vector3, type: string): void {
    // Remove expired points
    const now = Date.now();
    this.inferencePoints = this.inferencePoints.filter(
      p => now - p.timestamp < this.inferenceTimeout
    );

    // Add new point
    this.inferencePoints.push({ point: point.clone(), type, timestamp: now });

    // Limit number of points
    if (this.inferencePoints.length > this.maxInferencePoints) {
      this.inferencePoints.shift();
    }
  }

  clearInferencePoints(): void {
    this.inferencePoints = [];
  }

  getInferenceLines(): InferenceLine[] {
    const lines: InferenceLine[] = [];
    const now = Date.now();

    // Clean expired points
    this.inferencePoints = this.inferencePoints.filter(
      p => now - p.timestamp < this.inferenceTimeout
    );

    // Generate axis lines from each inference point
    for (const infPoint of this.inferencePoints) {
      const extent = 100; // 100m extent

      // X axis (red)
      lines.push({
        start: new Vector3(infPoint.point.x - extent, infPoint.point.y, infPoint.point.z),
        end: new Vector3(infPoint.point.x + extent, infPoint.point.y, infPoint.point.z),
        type: 'x-axis'
      });

      // Y axis (green/blue)
      lines.push({
        start: new Vector3(infPoint.point.x, infPoint.point.y - extent, infPoint.point.z),
        end: new Vector3(infPoint.point.x, infPoint.point.y + extent, infPoint.point.z),
        type: 'y-axis'
      });

      // Z axis (green)
      lines.push({
        start: new Vector3(infPoint.point.x, infPoint.point.y, infPoint.point.z - extent),
        end: new Vector3(infPoint.point.x, infPoint.point.y, infPoint.point.z + extent),
        type: 'z-axis'
      });
    }

    return lines;
  }

  // ============================================
  // Visibility Checks
  // ============================================

  private isVisibleFromCamera(point: Vector3): boolean {
    if (!this.camera) return true;

    const cameraPos = this.camera.position;

    // Check if point is in front of camera
    const cameraDir = this.camera.getDirection(Vector3.Forward());
    const toPoint = point.subtract(cameraPos);
    if (Vector3.Dot(toPoint, cameraDir) <= 0) return false;

    // Raycast to check occlusion
    const direction = toPoint.normalize();
    const distanceToPoint = toPoint.length();
    const ray = new Ray(cameraPos, direction, distanceToPoint + 0.1);

    const pickResult = this.scene.pickWithRay(ray, (mesh) => {
      if (!mesh.metadata?.type) return false;
      if (mesh.metadata.type !== 'face') return false;
      if (mesh.name.includes('preview')) return false;
      return true;
    });

    if (pickResult?.hit && pickResult.distance < distanceToPoint - 0.01) {
      return false;
    }

    return true;
  }

  private isFrontFacing(face: Mesh): boolean {
    if (!this.camera) return true;

    const faceNormal = this.getFaceNormal(face);
    if (!faceNormal) return true;

    const toCamera = this.camera.position.subtract(face.position).normalize();
    return Vector3.Dot(faceNormal, toCamera) > 0;
  }

  // ============================================
  // Utility Methods
  // ============================================

  private getEdges(): Mesh[] {
    const now = Date.now();
    if (now - this.cacheTimestamp < this.cacheDuration) {
      return this.cachedEdges;
    }

    this.cachedEdges = this.scene.meshes.filter(
      m => m.metadata?.type === 'edge' && m.isEnabled()
    ) as Mesh[];
    this.cacheTimestamp = now;

    return this.cachedEdges;
  }

  private getFaces(): Mesh[] {
    const now = Date.now();
    if (now - this.cacheTimestamp < this.cacheDuration) {
      return this.cachedFaces;
    }

    this.cachedFaces = this.scene.meshes.filter(
      m => m.metadata?.type === 'face' && m.isEnabled()
    ) as Mesh[];
    this.cacheTimestamp = now;

    return this.cachedFaces;
  }

  private getEdgeVertices(edge: Mesh): Vector3[] | null {
    if (edge.metadata?.vertices) {
      return edge.metadata.vertices.map((v: any) => new Vector3(v.x, v.y, v.z));
    }
    if (edge.metadata?.startPoint && edge.metadata?.endPoint) {
      const s = edge.metadata.startPoint;
      const e = edge.metadata.endPoint;
      return [new Vector3(s.x, s.y, s.z), new Vector3(e.x, e.y, e.z)];
    }
    return null;
  }

  private getFaceNormal(face: Mesh): Vector3 | null {
    if (face.metadata?.faceNormal) {
      const n = face.metadata.faceNormal;
      return new Vector3(n.x, n.y, n.z);
    }
    if (face.metadata?.faceDir) {
      const dir = face.metadata.faceDir;
      switch (dir) {
        case 'top': return new Vector3(0, 1, 0);
        case 'bottom': return new Vector3(0, -1, 0);
        case 'front': return new Vector3(0, 0, 1);
        case 'back': return new Vector3(0, 0, -1);
        case 'right': return new Vector3(1, 0, 0);
        case 'left': return new Vector3(-1, 0, 0);
      }
    }
    return null;
  }

  private closestPointOnSegment(point: Vector3, segStart: Vector3, segEnd: Vector3): Vector3 {
    const line = segEnd.subtract(segStart);
    const len = line.length();
    if (len < 0.0001) return segStart.clone();

    const lineDir = line.normalize();
    const toPoint = point.subtract(segStart);
    let t = Vector3.Dot(toPoint, lineDir);
    t = Math.max(0, Math.min(len, t));

    return segStart.add(lineDir.scale(t));
  }

  private lineLineIntersection(
    p1: Vector3, p2: Vector3,
    p3: Vector3, p4: Vector3
  ): Vector3 | null {
    // 2D intersection on XZ plane (simplified)
    const d1x = p2.x - p1.x;
    const d1z = p2.z - p1.z;
    const d2x = p4.x - p3.x;
    const d2z = p4.z - p3.z;

    const cross = d1x * d2z - d1z * d2x;
    if (Math.abs(cross) < 0.0001) return null;

    const dx = p3.x - p1.x;
    const dz = p3.z - p1.z;

    const t1 = (dx * d2z - dz * d2x) / cross;
    const t2 = (dx * d1z - dz * d1x) / cross;

    if (t1 < 0 || t1 > 1 || t2 < 0 || t2 > 1) return null;

    return new Vector3(
      p1.x + t1 * d1x,
      (p1.y + p3.y) / 2, // Average Y
      p1.z + t1 * d1z
    );
  }

  // ============================================
  // Public API
  // ============================================

  getSnapThreshold(): number {
    return this.threshold;
  }

  setSnapThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
