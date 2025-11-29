/**
 * PolygonTool - SketchUp-style Polygon Drawing Tool
 *
 * Features:
 * - Click to set center, move to set radius, click to finish
 * - Default 6 sides (hexagon)
 * - Sides input via Measurements Box: "6s" or just "6" during drawing
 * - Inscribed in circle mode
 * - Automatic face creation
 *
 * Hotkey: G (like SketchUp)
 */

import {
  Vector3,
  Color3,
  MeshBuilder,
  Mesh,
  StandardMaterial,
  LinesMesh,
} from '@babylonjs/core';
import {
  BaseTool,
  type ToolType,
  type BaseToolConfig,
} from './BaseTool';
import type { InferenceResult } from '../inference/InferenceEngine';
import type { MeasurementResult } from '../ui/MeasurementsBox';
import { INFERENCE_COLORS } from '../types';
import { useInferenceStore } from '../stores/inferenceStore';

// ============================================================================
// POLYGON TOOL STATE
// ============================================================================

export interface PolygonToolState {
  radius: number;          // Circumradius (inscribed circle)
  sides: number;           // Number of sides (default 6)
  rotationAngle: number;   // Rotation angle from first click direction
}

// ============================================================================
// POLYGON TOOL CLASS
// ============================================================================

export class PolygonTool extends BaseTool {
  public readonly toolType: ToolType = 'polygon';
  public readonly hotkey: string = 'G';
  public readonly displayName: string = 'Polygon';

  // Polygon-specific state
  private polygonState: PolygonToolState = {
    radius: 0,
    sides: 6, // Default hexagon
    rotationAngle: 0,
  };

  // Preview meshes
  private previewLines: LinesMesh | null = null;
  private previewFace: Mesh | null = null;
  private centerMarker: Mesh | null = null;
  private radiusLine: LinesMesh | null = null;

  constructor(config: BaseToolConfig) {
    super(config);
  }

  // ========== ABSTRACT IMPLEMENTATIONS ==========

  protected onPointerMove(position: Vector3, inferenceResult: InferenceResult): void {
    if (this.state.phase === 'idle' || !this.state.startPoint) {
      return;
    }

    // Calculate radius from center to cursor
    const center = this.state.startPoint;
    const current = position;

    // Work on the XZ plane (ground plane)
    const dx = current.x - center.x;
    const dz = current.z - center.z;
    this.polygonState.radius = Math.sqrt(dx * dx + dz * dz);

    // Calculate rotation angle (first vertex direction)
    this.polygonState.rotationAngle = Math.atan2(dz, dx);

    // Update preview
    this.updatePreview(center, this.polygonState.radius);
  }

  protected onClick(position: Vector3): void {
    if (this.state.phase === 'idle') {
      // First click: Set center point
      this.setCenterPoint(position);
    } else if (this.state.phase === 'first_point') {
      // Second click: Finalize polygon
      if (this.polygonState.radius > 0.01) {
        this.state.endPoint = position;
        this.finalizeShape();
      }
    }
  }

  public applyMeasurement(result: MeasurementResult): void {
    if (this.state.phase !== 'first_point' || !this.state.startPoint) return;

    if (result.type === 'length' && result.length) {
      // Apply radius
      this.polygonState.radius = result.length / 1000; // mm to units
    } else if (result.type === 'sides' && result.sides) {
      // Apply sides
      this.polygonState.sides = Math.max(3, Math.min(999, result.sides));
    } else if (result.raw) {
      // Try to parse sides from raw input (e.g., "6s" or just number for sides)
      const sidesMatch = result.raw.match(/^(\d+)s?$/i);
      if (sidesMatch) {
        const sides = parseInt(sidesMatch[1], 10);
        if (!isNaN(sides) && sides >= 3) {
          this.polygonState.sides = Math.min(999, sides);
        }
      }
    }

    // Update preview and finalize
    const center = this.state.startPoint;
    this.updatePreview(center, this.polygonState.radius);

    if (this.polygonState.radius > 0.01) {
      this.finalizeShape();
    }
  }

  public getCurrentMeasurements(): { primary: string; secondary?: string; inputType: string } {
    const radiusMm = this.polygonState.radius * 1000;

    return {
      primary: `${Math.round(radiusMm)}mm`,
      secondary: `${this.polygonState.sides} sides`,
      inputType: 'radius',
    };
  }

  protected resetTool(): void {
    this.state.phase = 'idle';
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.endPoint = null;

    this.polygonState.radius = 0;
    this.polygonState.sides = 6;
    this.polygonState.rotationAngle = 0;

    this.disposePreviewMeshes();
    this.disposeMarkerMeshes();
    this.disposePolygonMeshes();

    // Reset inference store
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setStartPoint(null);
    inferenceStore.setActiveInferences([]);
    inferenceStore.setPrimaryInference(null);

    this.inferenceEngine.reset();
    this.lockController.reset();
  }

  protected finalizeShape(): void {
    if (!this.state.startPoint) return;

    const center = this.state.startPoint;
    const radius = this.polygonState.radius;
    const sides = this.polygonState.sides;
    const rotation = this.polygonState.rotationAngle;

    // Generate polygon vertices
    const vertices = this.generatePolygonVertices(center, radius, sides, rotation);

    // Create permanent edges
    const edgeIds = this.createEdgesFromVertices(vertices);

    // Create permanent polygon visualization
    this.createPermanentPolygon(vertices);

    // Detect and create faces
    this.detectAndCreateFaces(edgeIds);

    // Notify
    this.config.onShapeCreated?.({
      type: 'polygon',
      vertices,
      edgeIds,
    });

    console.log(`Polygon created: radius ${Math.round(radius * 1000)}mm, ${sides} sides`);

    // Reset for next polygon
    this.resetTool();
  }

  // ========== PRIVATE METHODS ==========

  private setCenterPoint(position: Vector3): void {
    this.state.startPoint = position.clone();
    this.state.phase = 'first_point';

    // Create center point marker
    this.centerMarker = MeshBuilder.CreateSphere(
      'polygonCenterMarker',
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    this.centerMarker.position = position.clone();
    this.centerMarker.isPickable = false;

    const mat = new StandardMaterial('centerMarkerMat', this.scene);
    mat.diffuseColor = INFERENCE_COLORS.ENDPOINT;
    mat.emissiveColor = INFERENCE_COLORS.ENDPOINT.scale(0.5);
    this.centerMarker.material = mat;

    // Update inference store
    useInferenceStore.getState().setStartPoint(position);

    this.notifyStateChange();
  }

  private generatePolygonVertices(
    center: Vector3,
    radius: number,
    sides: number,
    rotationOffset: number = 0
  ): Vector3[] {
    const vertices: Vector3[] = [];
    const angleStep = (Math.PI * 2) / sides;

    for (let i = 0; i < sides; i++) {
      const angle = rotationOffset + i * angleStep;
      const x = center.x + radius * Math.cos(angle);
      const z = center.z + radius * Math.sin(angle);
      vertices.push(new Vector3(x, center.y, z));
    }

    return vertices;
  }

  private updatePreview(center: Vector3, radius: number): void {
    this.disposePolygonPreview();

    if (radius < 0.001) return;

    const sides = this.polygonState.sides;
    const rotation = this.polygonState.rotationAngle;
    const vertices = this.generatePolygonVertices(center, radius, sides, rotation);

    // Close the loop
    const points = [...vertices, vertices[0].clone()];

    // Create preview polygon lines
    this.previewLines = MeshBuilder.CreateLines(
      'polygonPreviewLines',
      { points, updatable: false },
      this.scene
    );
    this.previewLines.color = INFERENCE_COLORS.DEFAULT;
    this.previewLines.isPickable = false;

    // Create radius line from center to first vertex
    this.radiusLine = MeshBuilder.CreateLines(
      'radiusLine',
      { points: [center.clone(), vertices[0].clone()], updatable: false },
      this.scene
    );
    this.radiusLine.color = new Color3(0.5, 0.5, 0.5);
    this.radiusLine.isPickable = false;

    // Create semi-transparent preview face
    this.previewFace = MeshBuilder.CreatePolygon(
      'polygonPreviewFace',
      { shape: vertices.map(v => new Vector3(v.x - center.x, 0, v.z - center.z)) },
      this.scene
    );
    this.previewFace.position = center.clone();
    this.previewFace.position.y += 0.001; // Slightly above ground
    this.previewFace.material = this.previewMaterial;
    this.previewFace.isPickable = false;
  }

  private disposePolygonPreview(): void {
    if (this.previewLines) {
      this.previewLines.dispose();
      this.previewLines = null;
    }
    if (this.previewFace) {
      this.previewFace.dispose();
      this.previewFace = null;
    }
    if (this.radiusLine) {
      this.radiusLine.dispose();
      this.radiusLine = null;
    }
  }

  private disposePolygonMeshes(): void {
    this.disposePolygonPreview();
    if (this.centerMarker) {
      this.centerMarker.material?.dispose();
      this.centerMarker.dispose();
      this.centerMarker = null;
    }
  }

  private createPermanentPolygon(vertices: Vector3[]): void {
    // Create permanent edge lines
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];

      const line = MeshBuilder.CreateLines(
        `polygonEdge_${Date.now()}_${i}`,
        { points: [start, end], updatable: false },
        this.scene
      );
      line.color = new Color3(0.1, 0.1, 0.1);
      line.isPickable = true;
    }
  }

  protected disposePreviewMeshes(): void {
    super.disposePreviewMeshes();
    this.disposePolygonMeshes();
  }

  public dispose(): void {
    this.disposePolygonMeshes();
    super.dispose();
  }
}

export default PolygonTool;
