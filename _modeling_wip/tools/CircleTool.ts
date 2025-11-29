/**
 * CircleTool - SketchUp-style Circle Drawing Tool
 *
 * Features:
 * - Click to set center, move to set radius, click to finish
 * - Default 24 segments (SketchUp standard)
 * - Segments input via Measurements Box: "24s" or just "24" during drawing
 * - Half/Quarter circle inference
 * - Automatic face creation
 *
 * Hotkey: C
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
// CIRCLE TOOL STATE
// ============================================================================

export interface CircleToolState {
  radius: number;
  segments: number;
  isHalfCircle: boolean;
  isQuarterCircle: boolean;
}

// ============================================================================
// CIRCLE TOOL CLASS
// ============================================================================

export class CircleTool extends BaseTool {
  public readonly toolType: ToolType = 'circle';
  public readonly hotkey: string = 'C';
  public readonly displayName: string = 'Circle';

  // Circle-specific state
  private circleState: CircleToolState = {
    radius: 0,
    segments: 24, // SketchUp default
    isHalfCircle: false,
    isQuarterCircle: false,
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
    this.circleState.radius = Math.sqrt(dx * dx + dz * dz);

    // Check for half/quarter circle inference (based on angle)
    const angle = Math.atan2(dz, dx);
    const normalizedAngle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Quarter circle detection (90 degree increments)
    const quarterAngles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    this.circleState.isQuarterCircle = quarterAngles.some(
      qa => Math.abs(normalizedAngle - qa) < 0.05
    );

    // Half circle detection (180 degree angle from start)
    this.circleState.isHalfCircle =
      Math.abs(normalizedAngle - Math.PI) < 0.05 ||
      Math.abs(normalizedAngle) < 0.05;

    // Update preview
    this.updatePreview(center, this.circleState.radius);

    // Update screen tip with segment info
    this.updateCircleInference();
  }

  protected onClick(position: Vector3): void {
    if (this.state.phase === 'idle') {
      // First click: Set center point
      this.setCenterPoint(position);
    } else if (this.state.phase === 'first_point') {
      // Second click: Finalize circle
      if (this.circleState.radius > 0.01) {
        this.state.endPoint = position;
        this.finalizeShape();
      }
    }
  }

  public applyMeasurement(result: MeasurementResult): void {
    if (this.state.phase !== 'first_point' || !this.state.startPoint) return;

    if (result.type === 'length' && result.length) {
      // Apply radius
      this.circleState.radius = result.length / 1000; // mm to units
    } else if (result.type === 'sides' && result.sides) {
      // Apply segments
      this.circleState.segments = Math.max(3, Math.min(999, result.sides));
    } else if (result.raw) {
      // Try to parse segments from raw input (e.g., "24s" or just number for segments)
      const segmentsMatch = result.raw.match(/^(\d+)s?$/i);
      if (segmentsMatch) {
        const segments = parseInt(segmentsMatch[1], 10);
        if (!isNaN(segments) && segments >= 3) {
          this.circleState.segments = Math.min(999, segments);
        }
      }
    }

    // Update preview and finalize
    const center = this.state.startPoint;
    this.updatePreview(center, this.circleState.radius);

    if (this.circleState.radius > 0.01) {
      this.finalizeShape();
    }
  }

  public getCurrentMeasurements(): { primary: string; secondary?: string; inputType: string } {
    const radiusMm = this.circleState.radius * 1000;

    return {
      primary: `${Math.round(radiusMm)}mm`,
      secondary: `${this.circleState.segments} sides`,
      inputType: 'radius',
    };
  }

  protected resetTool(): void {
    this.state.phase = 'idle';
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.endPoint = null;

    this.circleState.radius = 0;
    this.circleState.segments = 24;
    this.circleState.isHalfCircle = false;
    this.circleState.isQuarterCircle = false;

    this.disposePreviewMeshes();
    this.disposeMarkerMeshes();
    this.disposeCircleMeshes();

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
    const radius = this.circleState.radius;
    const segments = this.circleState.segments;

    // Generate circle vertices
    const vertices = this.generateCircleVertices(center, radius, segments);

    // Create permanent edges
    const edgeIds = this.createEdgesFromVertices(vertices);

    // Create permanent circle visualization
    this.createPermanentCircle(center, radius, segments);

    // Detect and create faces
    this.detectAndCreateFaces(edgeIds);

    // Notify
    this.config.onShapeCreated?.({
      type: 'circle',
      vertices,
      edgeIds,
    });

    console.log(`Circle created: radius ${Math.round(radius * 1000)}mm, ${segments} segments`);

    // Reset for next circle
    this.resetTool();
  }

  // ========== PRIVATE METHODS ==========

  private setCenterPoint(position: Vector3): void {
    this.state.startPoint = position.clone();
    this.state.phase = 'first_point';

    // Create center point marker
    this.centerMarker = MeshBuilder.CreateSphere(
      'circleCenterMarker',
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

  private generateCircleVertices(center: Vector3, radius: number, segments: number): Vector3[] {
    const vertices: Vector3[] = [];
    const angleStep = (Math.PI * 2) / segments;

    for (let i = 0; i < segments; i++) {
      const angle = i * angleStep;
      const x = center.x + radius * Math.cos(angle);
      const z = center.z + radius * Math.sin(angle);
      vertices.push(new Vector3(x, center.y, z));
    }

    return vertices;
  }

  private updatePreview(center: Vector3, radius: number): void {
    this.disposeCirclePreview();

    if (radius < 0.001) return;

    const segments = this.circleState.segments;
    const vertices = this.generateCircleVertices(center, radius, segments);

    // Close the loop
    const points = [...vertices, vertices[0].clone()];

    // Determine line color
    let lineColor = INFERENCE_COLORS.DEFAULT;
    if (this.circleState.isHalfCircle || this.circleState.isQuarterCircle) {
      lineColor = INFERENCE_COLORS.BLUE_AXIS;
    }

    // Create preview circle lines
    this.previewLines = MeshBuilder.CreateLines(
      'circlePreviewLines',
      { points, updatable: false },
      this.scene
    );
    this.previewLines.color = lineColor;
    this.previewLines.isPickable = false;

    // Create radius line from center to edge
    const radiusEndpoint = new Vector3(
      center.x + radius,
      center.y,
      center.z
    );
    this.radiusLine = MeshBuilder.CreateLines(
      'radiusLine',
      { points: [center.clone(), radiusEndpoint], updatable: false },
      this.scene
    );
    this.radiusLine.color = new Color3(0.5, 0.5, 0.5);
    this.radiusLine.isPickable = false;

    // Create semi-transparent preview face (disc)
    this.previewFace = MeshBuilder.CreateDisc(
      'circlePreviewFace',
      { radius, tessellation: segments },
      this.scene
    );
    this.previewFace.position = center.clone();
    this.previewFace.position.y += 0.001; // Slightly above ground
    this.previewFace.rotation.x = Math.PI / 2; // Rotate to horizontal
    this.previewFace.material = this.previewMaterial;
    this.previewFace.isPickable = false;
  }

  private updateCircleInference(): void {
    const inferenceStore = useInferenceStore.getState();

    if (this.circleState.isQuarterCircle) {
      inferenceStore.setScreenTip({
        text: 'Quarter',
        visible: true,
      });
    } else if (this.circleState.isHalfCircle) {
      inferenceStore.setScreenTip({
        text: 'Half',
        visible: true,
      });
    }
  }

  private disposeCirclePreview(): void {
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

  private disposeCircleMeshes(): void {
    this.disposeCirclePreview();
    if (this.centerMarker) {
      this.centerMarker.material?.dispose();
      this.centerMarker.dispose();
      this.centerMarker = null;
    }
  }

  private createPermanentCircle(center: Vector3, radius: number, segments: number): void {
    const vertices = this.generateCircleVertices(center, radius, segments);

    // Create permanent edge lines
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];

      const line = MeshBuilder.CreateLines(
        `circleEdge_${Date.now()}_${i}`,
        { points: [start, end], updatable: false },
        this.scene
      );
      line.color = new Color3(0.1, 0.1, 0.1);
      line.isPickable = true;
    }
  }

  protected disposePreviewMeshes(): void {
    super.disposePreviewMeshes();
    this.disposeCircleMeshes();
  }

  public dispose(): void {
    this.disposeCircleMeshes();
    super.dispose();
  }
}

export default CircleTool;
