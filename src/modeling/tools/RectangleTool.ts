/**
 * Rectangle Tool - SketchUp-style rectangle drawing
 */

import {
  Vector3,
  Mesh,
  MeshBuilder,
  Color3,
  StandardMaterial,
  PointerInfo,
} from '@babylonjs/core';
import { BaseTool } from './BaseTool';
import { RectangleToolState, PickResultInfo } from '../types';
import earcut from 'earcut';

export class RectangleTool extends BaseTool {
  name = 'rectangle' as const;
  cursor = 'crosshair';

  private state: RectangleToolState = {
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
    previewMesh: null,
    drawingPlane: 'xz',
  };

  // Modifiers
  private drawFromCenter: boolean = false;  // Option key
  private lockSquare: boolean = false;       // Shift key

  // ============================================
  // Lifecycle
  // ============================================

  protected onActivate(): void {
    this.setStatus('Rectangle Tool: Click to set first corner');
  }

  protected onDeactivate(): void {
    this.cleanupPreview();
  }

  protected onReset(): void {
    this.cleanupPreview();
    this.state = {
      isDrawing: false,
      startPoint: null,
      currentPoint: null,
      previewMesh: null,
      drawingPlane: 'xz',
    };
    this.drawFromCenter = false;
    this.lockSquare = false;
  }

  // ============================================
  // Input Handling
  // ============================================

  onPointerDown(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene) return;

    const point = pickResult.snapped && pickResult.snapPoint
      ? pickResult.snapPoint
      : pickResult.pickedPoint;

    if (!point) return;

    if (!this.state.isDrawing) {
      // Start drawing
      this.state.isDrawing = true;
      this.state.startPoint = point.clone();
      this.state.currentPoint = point.clone();

      // Detect drawing plane from picked face
      this.state.drawingPlane = this.detectDrawingPlane(pickResult);

      this.snapSystem?.addInferencePoint(point, 'rectStart');
      this.setStatus('Rectangle Tool: Click to set opposite corner');

      if (pickResult.snapped && pickResult.snapType) {
        this.showSnap(pickResult.snapType);
      }
    } else {
      // Finish drawing
      this.finalizeRectangle();
    }
  }

  onPointerMove(info: PointerInfo, pickResult: PickResultInfo): void {
    if (!this.scene || !this.state.isDrawing || !this.state.startPoint) return;

    let point = pickResult.snapped && pickResult.snapPoint
      ? pickResult.snapPoint.clone()
      : pickResult.pickedPoint?.clone();

    if (!point) return;

    // Constrain to drawing plane
    point = this.constrainToPlane(point);

    // Apply square lock
    if (this.lockSquare) {
      point = this.applySquareLock(this.state.startPoint, point);
    }

    this.state.currentPoint = point;

    // Update preview
    this.updatePreview();

    // Update input display (width, length)
    const dims = this.getDimensions();
    this.setInput(`${dims.width.toFixed(0)}, ${dims.length.toFixed(0)}`);

    // Show snap indicator
    if (pickResult.snapped && pickResult.snapType) {
      this.showSnap(pickResult.snapType);
    } else {
      this.hideSnap();
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.reset();
        this.setStatus('Rectangle Tool: Click to set first corner');
        break;

      case 'Shift':
        this.lockSquare = true;
        if (this.state.isDrawing) {
          this.updatePreview();
        }
        break;

      case 'Alt':
        this.drawFromCenter = true;
        if (this.state.isDrawing) {
          this.updatePreview();
        }
        break;
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Shift':
        this.lockSquare = false;
        if (this.state.isDrawing) {
          this.updatePreview();
        }
        break;

      case 'Alt':
        this.drawFromCenter = false;
        if (this.state.isDrawing) {
          this.updatePreview();
        }
        break;
    }
  }

  onValueInput(value: string): boolean {
    if (!this.state.isDrawing || !this.state.startPoint) return false;

    // Parse dimensions (width, length)
    const parts = value.split(',').map(s => parseFloat(s.trim()));
    if (parts.length < 2 || parts.some(isNaN)) return false;

    const [width, length] = parts.map(v => v / 1000); // Convert mm to m

    // Calculate end point based on dimensions
    const start = this.state.startPoint;
    let endPoint: Vector3;

    switch (this.state.drawingPlane) {
      case 'xz':
        endPoint = new Vector3(start.x + width, start.y, start.z + length);
        break;
      case 'xy':
        endPoint = new Vector3(start.x + width, start.y + length, start.z);
        break;
      case 'yz':
        endPoint = new Vector3(start.x, start.y + length, start.z + width);
        break;
      default:
        endPoint = new Vector3(start.x + width, start.y, start.z + length);
    }

    this.state.currentPoint = endPoint;
    this.finalizeRectangle();

    return true;
  }

  // ============================================
  // State
  // ============================================

  getState(): RectangleToolState {
    return { ...this.state };
  }

  // ============================================
  // Private Methods
  // ============================================

  private detectDrawingPlane(pickResult: PickResultInfo): 'xz' | 'xy' | 'yz' {
    if (!pickResult.pickedMesh) return 'xz';

    const mesh = pickResult.pickedMesh;
    const faceDir = mesh.metadata?.faceDir;

    if (faceDir === 'top' || faceDir === 'bottom') {
      return 'xz';
    } else if (faceDir === 'front' || faceDir === 'back') {
      return 'xy';
    } else if (faceDir === 'left' || faceDir === 'right') {
      return 'yz';
    }

    return 'xz';
  }

  private constrainToPlane(point: Vector3): Vector3 {
    if (!this.state.startPoint) return point;

    const start = this.state.startPoint;
    switch (this.state.drawingPlane) {
      case 'xz':
        return new Vector3(point.x, start.y, point.z);
      case 'xy':
        return new Vector3(point.x, point.y, start.z);
      case 'yz':
        return new Vector3(start.x, point.y, point.z);
      default:
        return point;
    }
  }

  private applySquareLock(start: Vector3, end: Vector3): Vector3 {
    let dx: number, dy: number, dz: number;

    switch (this.state.drawingPlane) {
      case 'xz':
        dx = end.x - start.x;
        dz = end.z - start.z;
        const sizeXZ = Math.max(Math.abs(dx), Math.abs(dz));
        return new Vector3(
          start.x + Math.sign(dx) * sizeXZ,
          start.y,
          start.z + Math.sign(dz) * sizeXZ
        );
      case 'xy':
        dx = end.x - start.x;
        dy = end.y - start.y;
        const sizeXY = Math.max(Math.abs(dx), Math.abs(dy));
        return new Vector3(
          start.x + Math.sign(dx) * sizeXY,
          start.y + Math.sign(dy) * sizeXY,
          start.z
        );
      case 'yz':
        dy = end.y - start.y;
        dz = end.z - start.z;
        const sizeYZ = Math.max(Math.abs(dy), Math.abs(dz));
        return new Vector3(
          start.x,
          start.y + Math.sign(dy) * sizeYZ,
          start.z + Math.sign(dz) * sizeYZ
        );
      default:
        return end;
    }
  }

  private getDimensions(): { width: number; length: number } {
    if (!this.state.startPoint || !this.state.currentPoint) {
      return { width: 0, length: 0 };
    }

    const start = this.state.startPoint;
    const end = this.state.currentPoint;

    switch (this.state.drawingPlane) {
      case 'xz':
        return {
          width: Math.abs(end.x - start.x) * 1000,
          length: Math.abs(end.z - start.z) * 1000,
        };
      case 'xy':
        return {
          width: Math.abs(end.x - start.x) * 1000,
          length: Math.abs(end.y - start.y) * 1000,
        };
      case 'yz':
        return {
          width: Math.abs(end.z - start.z) * 1000,
          length: Math.abs(end.y - start.y) * 1000,
        };
      default:
        return { width: 0, length: 0 };
    }
  }

  private getVertices(): Vector3[] {
    if (!this.state.startPoint || !this.state.currentPoint) return [];

    let start = this.state.startPoint;
    let end = this.state.currentPoint;

    // Apply draw from center
    if (this.drawFromCenter) {
      const center = start;
      const dx = end.x - center.x;
      const dy = end.y - center.y;
      const dz = end.z - center.z;
      start = new Vector3(center.x - dx, center.y - dy, center.z - dz);
    }

    // Generate 4 corners based on plane
    switch (this.state.drawingPlane) {
      case 'xz':
        return [
          new Vector3(start.x, start.y, start.z),
          new Vector3(end.x, start.y, start.z),
          new Vector3(end.x, start.y, end.z),
          new Vector3(start.x, start.y, end.z),
        ];
      case 'xy':
        return [
          new Vector3(start.x, start.y, start.z),
          new Vector3(end.x, start.y, start.z),
          new Vector3(end.x, end.y, start.z),
          new Vector3(start.x, end.y, start.z),
        ];
      case 'yz':
        return [
          new Vector3(start.x, start.y, start.z),
          new Vector3(start.x, start.y, end.z),
          new Vector3(start.x, end.y, end.z),
          new Vector3(start.x, end.y, start.z),
        ];
      default:
        return [];
    }
  }

  private updatePreview(): void {
    if (!this.scene) return;

    // Remove existing preview
    if (this.state.previewMesh) {
      this.state.previewMesh.dispose();
      this.state.previewMesh = null;
    }

    const vertices = this.getVertices();
    if (vertices.length < 4) return;

    // Create preview rectangle
    const previewMesh = this.createRectangleMesh(vertices, true);
    if (previewMesh) {
      previewMesh.name = 'previewRectangle';
      previewMesh.isPickable = false;
      this.state.previewMesh = previewMesh;
    }
  }

  private finalizeRectangle(): void {
    if (!this.scene || !this.context) return;

    const vertices = this.getVertices();
    if (vertices.length < 4) return;

    const dims = this.getDimensions();
    if (dims.width < 1 || dims.length < 1) return; // Minimum 1mm

    // Create the actual face
    this.context.createFace(vertices, {
      color: '#FFFFFF',
      metadata: {
        type: 'face',
        vertices: vertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
        plane: this.state.drawingPlane,
      },
    });

    // Cleanup and reset
    this.cleanupPreview();
    this.state.isDrawing = false;
    this.state.startPoint = null;
    this.state.currentPoint = null;

    this.setStatus('Rectangle Tool: Click to set first corner');
    console.log(`[RectangleTool] Created rectangle: ${dims.width.toFixed(0)}mm x ${dims.length.toFixed(0)}mm`);
  }

  private createRectangleMesh(vertices: Vector3[], isPreview: boolean): Mesh | null {
    if (!this.scene) return null;

    try {
      // Create custom mesh for rectangle
      const positions: number[] = [];
      const indices: number[] = [];

      // Add vertices
      for (const v of vertices) {
        positions.push(v.x, v.y, v.z);
      }

      // Triangulate using earcut
      const flatPositions2D: number[] = [];
      for (const v of vertices) {
        switch (this.state.drawingPlane) {
          case 'xz':
            flatPositions2D.push(v.x, v.z);
            break;
          case 'xy':
            flatPositions2D.push(v.x, v.y);
            break;
          case 'yz':
            flatPositions2D.push(v.z, v.y);
            break;
        }
      }

      const triangleIndices = earcut(flatPositions2D);
      indices.push(...triangleIndices);

      // Create mesh
      const mesh = new Mesh(isPreview ? 'previewRect' : 'rectangle', this.scene);
      const vertexData = new (window as any).BABYLON.VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;

      // Calculate normals
      const normals: number[] = [];
      (window as any).BABYLON.VertexData.ComputeNormals(positions, indices, normals);
      vertexData.normals = normals;

      vertexData.applyToMesh(mesh);

      // Apply material
      const material = new StandardMaterial(isPreview ? 'previewMat' : 'rectMat', this.scene);
      if (isPreview) {
        material.diffuseColor = new Color3(0.5, 0.5, 1);
        material.alpha = 0.5;
      } else {
        material.diffuseColor = Color3.White();
        material.backFaceCulling = false;
      }
      mesh.material = material;

      return mesh;
    } catch (error) {
      console.error('[RectangleTool] Failed to create mesh:', error);
      return null;
    }
  }

  private cleanupPreview(): void {
    if (this.state.previewMesh) {
      this.state.previewMesh.dispose();
      this.state.previewMesh = null;
    }
    this.hideSnap();
  }
}
