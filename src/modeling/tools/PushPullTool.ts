/**
 * Push/Pull Tool - SketchUp-style face extrusion
 */

import {
  Vector3,
  Mesh,
  MeshBuilder,
  Color3,
  StandardMaterial,
  PointerInfo,
  Ray,
  VertexData,
} from '@babylonjs/core';
import { BaseTool } from './BaseTool';
import { PushPullToolState, PickResultInfo } from '../types';
import earcut from 'earcut';

interface SnapDistance {
  distance: number;
  type: 'face' | 'edge' | 'ground';
  reference?: Mesh;
}

export class PushPullTool extends BaseTool {
  name = 'pushpull' as const;
  cursor = 'ns-resize';

  private state: PushPullToolState = {
    isExtruding: false,
    baseFace: null,
    baseFaceCenter: null,
    baseFaceNormal: null,
    baseFaceVertices: [],
    startY: 0,
    currentDistance: 0,
    previewMesh: null,
    isSnapped: false,
    snapDistance: null,
    parentSolid: null,
  };

  // Hysteresis for stable snapping
  private readonly SNAP_THRESHOLD = 0.15; // 150mm
  private readonly SNAP_RELEASE_MULTIPLIER = 1.5;

  private lastClickTime: number = 0;
  private lastClickFace: Mesh | null = null;
  private lastExtrudeDistance: number = 0;

  // ============================================
  // Lifecycle
  // ============================================

  protected onActivate(): void {
    this.setStatus('Push/Pull Tool: Click on a face to extrude');
  }

  protected onDeactivate(): void {
    this.cleanupPreview();
  }

  protected onReset(): void {
    this.cleanupPreview();
    this.state = {
      isExtruding: false,
      baseFace: null,
      baseFaceCenter: null,
      baseFaceNormal: null,
      baseFaceVertices: [],
      startY: 0,
      currentDistance: 0,
      previewMesh: null,
      isSnapped: false,
      snapDistance: null,
      parentSolid: null,
    };
  }

  // ============================================
  // Input Handling
  // ============================================

  onPointerDown(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene) return;

    const pointerEvent = info.event as PointerEvent;

    if (!this.state.isExtruding) {
      // Check for double-click to repeat last extrusion
      const now = Date.now();
      const isDoubleClick = now - this.lastClickTime < 300;

      if (pickResult.pickedMesh?.metadata?.type === 'face') {
        const face = pickResult.pickedMesh as Mesh;

        if (isDoubleClick && face === this.lastClickFace && this.lastExtrudeDistance !== 0) {
          // Repeat last extrusion
          this.startExtrusion(face, pointerEvent.clientY);
          this.applyExtrusion(this.lastExtrudeDistance);
          return;
        }

        // Start new extrusion
        this.lastClickTime = now;
        this.lastClickFace = face;
        this.startExtrusion(face, pointerEvent.clientY);
      }
    } else {
      // Finalize extrusion
      this.finalizeExtrusion();
    }
  }

  onPointerMove(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene || !this.state.isExtruding) return;

    const pointerEvent = info.event as PointerEvent;
    const deltaY = this.state.startY - pointerEvent.clientY;

    // Convert screen delta to world distance
    // Approximate: 2 pixels = 10mm
    let distance = deltaY * 0.005;

    // Apply snapping
    distance = this.applySnapping(distance);
    this.state.currentDistance = distance;

    // Update preview
    this.updatePreview();

    // Update input display
    this.setInput((Math.abs(distance) * 1000).toFixed(0));
  }

  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.reset();
        this.setStatus('Push/Pull Tool: Click on a face to extrude');
        break;
    }
  }

  onValueInput(value: string): boolean {
    if (!this.state.isExtruding) return false;

    const distance = parseFloat(value);
    if (isNaN(distance)) return false;

    // Convert mm to meters and apply direction
    const sign = this.state.currentDistance >= 0 ? 1 : -1;
    this.applyExtrusion(sign * Math.abs(distance) / 1000);

    return true;
  }

  // ============================================
  // State
  // ============================================

  getState(): PushPullToolState {
    return { ...this.state };
  }

  // ============================================
  // Private Methods
  // ============================================

  private startExtrusion(face: Mesh, startY: number): void {
    // Get face info
    const faceNormal = this.getFaceNormal(face);
    const faceCenter = this.getFaceCenter(face);
    const faceVertices = this.getFaceVertices(face);

    if (!faceNormal || !faceCenter || faceVertices.length < 3) {
      console.warn('[PushPullTool] Invalid face for extrusion');
      return;
    }

    // Find parent solid if exists
    const parentSolid = face.parent as Mesh | null;

    this.state = {
      isExtruding: true,
      baseFace: face,
      baseFaceCenter: faceCenter,
      baseFaceNormal: faceNormal,
      baseFaceVertices: faceVertices,
      startY: startY,
      currentDistance: 0,
      previewMesh: null,
      isSnapped: false,
      snapDistance: null,
      parentSolid: parentSolid?.metadata?.type === 'solid' ? parentSolid : null,
    };

    this.setStatus('Push/Pull Tool: Drag to extrude, click to finish');
    console.log('[PushPullTool] Started extrusion');
  }

  private applySnapping(distance: number): number {
    if (!this.state.baseFace || !this.state.baseFaceCenter || !this.state.baseFaceNormal) {
      return distance;
    }

    const snapDistances = this.findSnapDistances();
    const threshold = this.SNAP_THRESHOLD;

    // Hysteresis logic
    if (this.state.isSnapped && this.state.snapDistance !== null) {
      const currentDiff = Math.abs(distance - this.state.snapDistance);
      const releaseThreshold = threshold * this.SNAP_RELEASE_MULTIPLIER;

      // Check for closer snap point
      for (const snap of snapDistances) {
        if (Math.abs(distance - snap.distance) < threshold && snap.distance !== this.state.snapDistance) {
          this.state.snapDistance = snap.distance;
          this.showSnap(snap.type === 'ground' ? 'origin' : 'endpoint');
          return snap.distance;
        }
      }

      // Stay snapped if within release threshold
      if (currentDiff < releaseThreshold) {
        return this.state.snapDistance;
      }

      // Release snap
      this.state.isSnapped = false;
      this.state.snapDistance = null;
      this.hideSnap();
    } else {
      // Check for new snap
      for (const snap of snapDistances) {
        if (Math.abs(distance - snap.distance) < threshold) {
          this.state.isSnapped = true;
          this.state.snapDistance = snap.distance;
          this.showSnap(snap.type === 'ground' ? 'origin' : 'endpoint');
          return snap.distance;
        }
      }
    }

    return distance;
  }

  private findSnapDistances(): SnapDistance[] {
    if (!this.scene || !this.state.baseFaceCenter || !this.state.baseFaceNormal) {
      return [];
    }

    const distances: SnapDistance[] = [];
    const normal = this.state.baseFaceNormal;
    const center = this.state.baseFaceCenter;

    // Ground snap (Y = 0)
    if (Math.abs(normal.y) > 0.9) {
      distances.push({ distance: -center.y, type: 'ground' });
    }

    // Find other faces to snap to
    const faces = this.scene.meshes.filter(m =>
      m.metadata?.type === 'face' &&
      m !== this.state.baseFace &&
      m.isEnabled() &&
      !m.name.includes('preview')
    );

    for (const face of faces) {
      if (!this.isVisibleFromCamera(face.position, face as Mesh)) continue;
      if (!this.isFrontFacing(face as Mesh)) continue;

      const faceCenter = this.getFaceCenter(face as Mesh);
      if (!faceCenter) continue;

      // Calculate distance along normal
      const toFace = faceCenter.subtract(center);
      const dist = Vector3.Dot(toFace, normal);

      if (Math.abs(dist) > 0.001) {
        distances.push({ distance: dist, type: 'face', reference: face as Mesh });
      }
    }

    // Sort by absolute distance
    distances.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));

    return distances;
  }

  private isVisibleFromCamera(point: Vector3, excludeMesh?: Mesh): boolean {
    if (!this.camera) return true;

    const cameraPos = this.camera.position;
    const cameraDir = this.camera.getDirection(Vector3.Forward());
    const toPoint = point.subtract(cameraPos);

    // Check if in front of camera
    if (Vector3.Dot(toPoint, cameraDir) <= 0) return false;

    // Raycast for occlusion
    const direction = toPoint.normalize();
    const distanceToPoint = toPoint.length();
    const ray = new Ray(cameraPos, direction, distanceToPoint + 0.1);

    const pickResult = this.scene?.pickWithRay(ray, (mesh) => {
      if (!mesh.metadata?.type) return false;
      if (mesh.metadata.type !== 'face') return false;
      if (mesh.name.includes('preview')) return false;
      if (mesh === this.state.baseFace) return false;
      if (excludeMesh && mesh === excludeMesh) return false;
      if (this.state.parentSolid && mesh.parent === this.state.parentSolid) return false;
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

    const faceCenter = this.getFaceCenter(face) ?? face.position;
    const toCamera = this.camera.position.subtract(faceCenter).normalize();

    return Vector3.Dot(faceNormal, toCamera) > 0;
  }

  private updatePreview(): void {
    if (!this.scene || !this.state.baseFaceVertices.length) return;

    // Remove existing preview
    if (this.state.previewMesh) {
      this.state.previewMesh.dispose();
      this.state.previewMesh = null;
    }

    const distance = this.state.currentDistance;
    if (Math.abs(distance) < 0.001) return;

    // Create extruded preview
    const previewMesh = this.createExtrusionMesh(
      this.state.baseFaceVertices,
      this.state.baseFaceNormal!,
      distance,
      true
    );

    if (previewMesh) {
      previewMesh.name = 'previewExtrusion';
      previewMesh.isPickable = false;
      this.state.previewMesh = previewMesh;
    }
  }

  private applyExtrusion(distance: number): void {
    this.state.currentDistance = distance;
    this.finalizeExtrusion();
  }

  private finalizeExtrusion(): void {
    if (!this.scene || !this.context || Math.abs(this.state.currentDistance) < 0.001) {
      this.reset();
      return;
    }

    const distance = this.state.currentDistance;

    // Create the actual solid
    this.context.createSolid(this.state.baseFaceVertices, distance, {
      metadata: {
        type: 'solid',
        extrudedFrom: this.state.baseFace?.id,
        height: distance,
      },
    });

    // Store for double-click repeat
    this.lastExtrudeDistance = distance;

    console.log(`[PushPullTool] Created extrusion: ${(distance * 1000).toFixed(0)}mm`);

    // Reset state
    this.cleanupPreview();
    this.state.isExtruding = false;
    this.state.baseFace = null;
    this.state.baseFaceCenter = null;
    this.state.baseFaceNormal = null;
    this.state.baseFaceVertices = [];
    this.state.currentDistance = 0;
    this.state.isSnapped = false;
    this.state.snapDistance = null;

    this.setStatus('Push/Pull Tool: Click on a face to extrude');
  }

  private createExtrusionMesh(
    baseVertices: Vector3[],
    normal: Vector3,
    distance: number,
    isPreview: boolean
  ): Mesh | null {
    if (!this.scene) return null;

    try {
      const n = baseVertices.length;
      const offset = normal.scale(distance);

      // Create top vertices
      const topVertices = baseVertices.map(v => v.add(offset));

      // Build mesh data
      const positions: number[] = [];
      const indices: number[] = [];

      // Bottom face
      for (const v of baseVertices) {
        positions.push(v.x, v.y, v.z);
      }

      // Top face
      for (const v of topVertices) {
        positions.push(v.x, v.y, v.z);
      }

      // Triangulate bottom (reversed winding)
      const flatBottom = this.flatten2D(baseVertices, normal);
      const bottomIndices = earcut(flatBottom);
      for (let i = bottomIndices.length - 1; i >= 0; i--) {
        indices.push(bottomIndices[i]);
      }

      // Triangulate top
      const topOffset = n;
      for (const idx of bottomIndices) {
        indices.push(idx + topOffset);
      }

      // Side faces
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const bi = i;
        const bNext = next;
        const ti = i + topOffset;
        const tNext = next + topOffset;

        // Two triangles per side
        indices.push(bi, bNext, ti);
        indices.push(bNext, tNext, ti);
      }

      // Create mesh
      const mesh = new Mesh(isPreview ? 'previewExtrusion' : 'extrusion', this.scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;

      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      vertexData.normals = normals;

      vertexData.applyToMesh(mesh);

      // Material
      const material = new StandardMaterial(isPreview ? 'previewMat' : 'solidMat', this.scene);
      if (isPreview) {
        material.diffuseColor = new Color3(0.7, 0.7, 0.9);
        material.alpha = 0.7;
      } else {
        material.diffuseColor = Color3.White();
        material.backFaceCulling = false;
      }
      mesh.material = material;

      return mesh;
    } catch (error) {
      console.error('[PushPullTool] Failed to create mesh:', error);
      return null;
    }
  }

  private flatten2D(vertices: Vector3[], normal: Vector3): number[] {
    // Project vertices to 2D for earcut
    const result: number[] = [];

    // Determine projection plane
    const absX = Math.abs(normal.x);
    const absY = Math.abs(normal.y);
    const absZ = Math.abs(normal.z);

    for (const v of vertices) {
      if (absY >= absX && absY >= absZ) {
        // Project to XZ
        result.push(v.x, v.z);
      } else if (absX >= absZ) {
        // Project to YZ
        result.push(v.y, v.z);
      } else {
        // Project to XY
        result.push(v.x, v.y);
      }
    }

    return result;
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

  private getFaceCenter(face: Mesh): Vector3 | null {
    if (face.metadata?.center) {
      const c = face.metadata.center;
      return new Vector3(c.x, c.y, c.z);
    }
    return face.position.clone();
  }

  private getFaceVertices(face: Mesh): Vector3[] {
    if (face.metadata?.vertices) {
      return face.metadata.vertices.map((v: any) => new Vector3(v.x, v.y, v.z));
    }
    return [];
  }

  private cleanupPreview(): void {
    if (this.state.previewMesh) {
      this.state.previewMesh.dispose();
      this.state.previewMesh = null;
    }
    this.hideSnap();
  }
}
