/**
 * Offset Tool - SketchUp-style face offset
 */

import {
  Vector3,
  Mesh,
  MeshBuilder,
  Color3,
  StandardMaterial,
  PointerInfo,
  LinesMesh,
} from '@babylonjs/core';
import { BaseTool } from './BaseTool';
import { OffsetToolState, PickResultInfo } from '../types';

export class OffsetTool extends BaseTool {
  name = 'offset' as const;
  cursor = 'crosshair';

  private state: OffsetToolState = {
    isOffsetting: false,
    baseFace: null,
    baseFaceCenter: null,
    baseFaceVertices: [],
    currentDistance: 0,
    previewLines: [],
  };

  private startY: number = 0;
  private lastOffsetDistance: number = 0;
  private lastClickTime: number = 0;

  // ============================================
  // Lifecycle
  // ============================================

  protected onActivate(): void {
    this.setStatus('Offset Tool: Click on a face to offset');
  }

  protected onDeactivate(): void {
    this.cleanupPreview();
  }

  protected onReset(): void {
    this.cleanupPreview();
    this.state = {
      isOffsetting: false,
      baseFace: null,
      baseFaceCenter: null,
      baseFaceVertices: [],
      currentDistance: 0,
      previewLines: [],
    };
  }

  // ============================================
  // Input Handling
  // ============================================

  onPointerDown(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene) return;

    const pointerEvent = info.event as PointerEvent;

    if (!this.state.isOffsetting) {
      // Check for double-click to repeat last offset
      const now = Date.now();
      const isDoubleClick = now - this.lastClickTime < 300;

      if (pickResult.pickedMesh?.metadata?.type === 'face') {
        const face = pickResult.pickedMesh as Mesh;

        if (isDoubleClick && this.lastOffsetDistance !== 0) {
          // Repeat last offset
          this.startOffset(face, pointerEvent.clientY);
          this.applyOffset(this.lastOffsetDistance);
          return;
        }

        this.lastClickTime = now;
        this.startOffset(face, pointerEvent.clientY);
      }
    } else {
      // Finalize offset
      this.finalizeOffset();
    }
  }

  onPointerMove(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene || !this.state.isOffsetting) return;

    const pointerEvent = info.event as PointerEvent;
    const deltaY = this.startY - pointerEvent.clientY;

    // Convert screen delta to offset distance
    const distance = deltaY * 0.001; // 1 pixel = 1mm
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
        this.setStatus('Offset Tool: Click on a face to offset');
        break;
    }
  }

  onValueInput(value: string): boolean {
    if (!this.state.isOffsetting) return false;

    const distance = parseFloat(value);
    if (isNaN(distance)) return false;

    // Convert mm to meters
    const sign = this.state.currentDistance >= 0 ? 1 : -1;
    this.applyOffset(sign * Math.abs(distance) / 1000);

    return true;
  }

  // ============================================
  // State
  // ============================================

  getState(): OffsetToolState {
    return { ...this.state };
  }

  // ============================================
  // Private Methods
  // ============================================

  private startOffset(face: Mesh, startY: number): void {
    const vertices = this.getFaceVertices(face);
    if (vertices.length < 3) {
      console.warn('[OffsetTool] Invalid face for offset');
      return;
    }

    const center = this.calculateCenter(vertices);

    this.state = {
      isOffsetting: true,
      baseFace: face,
      baseFaceCenter: center,
      baseFaceVertices: vertices,
      currentDistance: 0,
      previewLines: [],
    };

    this.startY = startY;
    this.setStatus('Offset Tool: Drag to set offset distance, click to finish');
    console.log('[OffsetTool] Started offset');
  }

  private updatePreview(): void {
    if (!this.scene || !this.state.baseFaceVertices.length) return;

    // Clean up existing preview
    this.cleanupPreview();

    const distance = this.state.currentDistance;
    if (Math.abs(distance) < 0.0001) return;

    // Calculate offset vertices
    const offsetVertices = this.calculateOffsetVertices(distance);
    if (!offsetVertices || offsetVertices.length < 3) return;

    // Create preview lines for offset polygon
    const points = [...offsetVertices, offsetVertices[0]];
    const lines = MeshBuilder.CreateLines('offsetPreview', { points }, this.scene);
    lines.color = Color3.Magenta();
    lines.isPickable = false;
    this.state.previewLines.push(lines);
  }

  private calculateOffsetVertices(distance: number): Vector3[] | null {
    const vertices = this.state.baseFaceVertices;
    const center = this.state.baseFaceCenter;
    if (!center || vertices.length < 3) return null;

    const n = vertices.length;

    // Detect plane type
    const planeType = this.detectPlaneType(vertices);

    // Get 2D coordinates
    const get2D = (v: Vector3): { u: number; w: number } => {
      switch (planeType.type) {
        case 'XZ': return { u: v.x, w: v.z };
        case 'XY': return { u: v.x, w: v.y };
        case 'YZ': return { u: v.z, w: v.y };
      }
    };

    const make3D = (u: number, w: number): Vector3 => {
      switch (planeType.type) {
        case 'XZ': return new Vector3(u, planeType.fixedValue, w);
        case 'XY': return new Vector3(u, w, planeType.fixedValue);
        case 'YZ': return new Vector3(planeType.fixedValue, w, u);
      }
    };

    const center2D = get2D(center);

    // Sort vertices by angle
    const sortedVertices = [...vertices].sort((a, b) => {
      const a2D = get2D(a);
      const b2D = get2D(b);
      const angleA = Math.atan2(a2D.w - center2D.w, a2D.u - center2D.u);
      const angleB = Math.atan2(b2D.w - center2D.w, b2D.u - center2D.u);
      return angleA - angleB;
    });

    // Calculate inward normals for each edge
    const getInwardNormal = (p1: Vector3, p2: Vector3): { u: number; w: number } => {
      const p1_2D = get2D(p1);
      const p2_2D = get2D(p2);
      const edgeU = p2_2D.u - p1_2D.u;
      const edgeW = p2_2D.w - p1_2D.w;
      let perpU = -edgeW;
      let perpW = edgeU;
      const len = Math.sqrt(perpU * perpU + perpW * perpW);
      if (len > 0.0001) {
        perpU /= len;
        perpW /= len;
      }
      const midU = (p1_2D.u + p2_2D.u) / 2;
      const midW = (p1_2D.w + p2_2D.w) / 2;
      const toCenterU = center2D.u - midU;
      const toCenterW = center2D.w - midW;
      if (perpU * toCenterU + perpW * toCenterW < 0) {
        perpU = -perpU;
        perpW = -perpW;
      }
      return { u: perpU, w: perpW };
    };

    // Calculate offset vertices using line intersection
    const offsetVertices: Vector3[] = [];

    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n;
      const curr = i;
      const next = (i + 1) % n;

      // Get inward normals for adjacent edges
      const normal1 = getInwardNormal(sortedVertices[prev], sortedVertices[curr]);
      const normal2 = getInwardNormal(sortedVertices[curr], sortedVertices[next]);

      // Offset the two edges
      const p1_2D = get2D(sortedVertices[prev]);
      const p2_2D = get2D(sortedVertices[curr]);
      const p3_2D = get2D(sortedVertices[next]);

      // Line 1: offset of edge (prev -> curr)
      const l1_p1 = { u: p1_2D.u + normal1.u * distance, w: p1_2D.w + normal1.w * distance };
      const l1_p2 = { u: p2_2D.u + normal1.u * distance, w: p2_2D.w + normal1.w * distance };

      // Line 2: offset of edge (curr -> next)
      const l2_p1 = { u: p2_2D.u + normal2.u * distance, w: p2_2D.w + normal2.w * distance };
      const l2_p2 = { u: p3_2D.u + normal2.u * distance, w: p3_2D.w + normal2.w * distance };

      // Find intersection of the two offset lines
      const intersection = this.lineIntersection2D(
        l1_p1.u, l1_p1.w, l1_p2.u, l1_p2.w,
        l2_p1.u, l2_p1.w, l2_p2.u, l2_p2.w
      );

      if (intersection) {
        offsetVertices.push(make3D(intersection.u, intersection.w));
      } else {
        // Parallel lines - use midpoint
        offsetVertices.push(make3D(l1_p2.u, l1_p2.w));
      }
    }

    return offsetVertices;
  }

  private detectPlaneType(vertices: Vector3[]): { type: 'XZ' | 'XY' | 'YZ'; fixedValue: number } {
    const minX = Math.min(...vertices.map(v => v.x));
    const maxX = Math.max(...vertices.map(v => v.x));
    const minY = Math.min(...vertices.map(v => v.y));
    const maxY = Math.max(...vertices.map(v => v.y));
    const minZ = Math.min(...vertices.map(v => v.z));
    const maxZ = Math.max(...vertices.map(v => v.z));

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const spanZ = maxZ - minZ;

    const center = this.state.baseFaceCenter!;

    if (spanY <= spanX && spanY <= spanZ) {
      return { type: 'XZ', fixedValue: center.y };
    } else if (spanZ <= spanX && spanZ <= spanY) {
      return { type: 'XY', fixedValue: center.z };
    } else {
      return { type: 'YZ', fixedValue: center.x };
    }
  }

  private lineIntersection2D(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
  ): { u: number; w: number } | null {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    return {
      u: x1 + t * (x2 - x1),
      w: y1 + t * (y2 - y1)
    };
  }

  private applyOffset(distance: number): void {
    this.state.currentDistance = distance;
    this.finalizeOffset();
  }

  private finalizeOffset(): void {
    if (!this.scene || !this.context || Math.abs(this.state.currentDistance) < 0.0001) {
      this.reset();
      return;
    }

    const distance = this.state.currentDistance;
    const offsetVertices = this.calculateOffsetVertices(distance);

    if (!offsetVertices || offsetVertices.length < 3) {
      console.warn('[OffsetTool] Failed to calculate offset vertices');
      this.reset();
      return;
    }

    // Create new face with offset vertices
    this.context.createFace(offsetVertices, {
      color: '#FFFFFF',
      metadata: {
        type: 'face',
        offsetFrom: this.state.baseFace?.id,
        offsetDistance: distance,
      },
    });

    // Store for double-click repeat
    this.lastOffsetDistance = distance;

    console.log(`[OffsetTool] Created offset: ${(distance * 1000).toFixed(0)}mm`);

    // Reset state
    this.cleanupPreview();
    this.state.isOffsetting = false;
    this.state.baseFace = null;
    this.state.baseFaceCenter = null;
    this.state.baseFaceVertices = [];
    this.state.currentDistance = 0;

    this.setStatus('Offset Tool: Click on a face to offset');
  }

  private getFaceVertices(face: Mesh): Vector3[] {
    if (face.metadata?.vertices) {
      return face.metadata.vertices.map((v: any) => new Vector3(v.x, v.y, v.z));
    }
    return [];
  }

  private calculateCenter(vertices: Vector3[]): Vector3 {
    if (vertices.length === 0) return Vector3.Zero();

    const sum = vertices.reduce((acc, v) => acc.add(v), Vector3.Zero());
    return sum.scale(1 / vertices.length);
  }

  private cleanupPreview(): void {
    for (const line of this.state.previewLines) {
      line.dispose();
    }
    this.state.previewLines = [];
    this.hideSnap();
  }
}
