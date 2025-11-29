/**
 * RectangleTool - SketchUp-style Rectangle Drawing Tool
 *
 * Features:
 * - Click to set first corner, move to preview, click to finish
 * - Square inference (blue dot when equal sides)
 * - Golden Section inference (blue dot at golden ratio)
 * - Measurements Box: "8',20'" for width/height
 * - Negative values draw in opposite direction
 * - Automatic face creation
 *
 * Hotkey: R
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
  GOLDEN_RATIO,
  type ToolType,
  type BaseToolConfig,
} from './BaseTool';
import type { InferenceResult } from '../inference/InferenceEngine';
import type { MeasurementResult } from '../ui/MeasurementsBox';
import { INFERENCE_COLORS } from '../types';
import { useInferenceStore } from '../stores/inferenceStore';

// ============================================================================
// RECTANGLE TOOL STATE
// ============================================================================

export interface RectangleToolState {
  width: number;
  height: number;
  isSquare: boolean;
  isGoldenSection: boolean;
  drawDirection: { x: number; z: number }; // 1 or -1 for each axis
}

// ============================================================================
// RECTANGLE TOOL CLASS
// ============================================================================

export class RectangleTool extends BaseTool {
  public readonly toolType: ToolType = 'rectangle';
  public readonly hotkey: string = 'R';
  public readonly displayName: string = 'Rectangle';

  // Rectangle-specific state
  private rectState: RectangleToolState = {
    width: 0,
    height: 0,
    isSquare: false,
    isGoldenSection: false,
    drawDirection: { x: 1, z: 1 },
  };

  // Preview meshes
  private previewLines: LinesMesh | null = null;
  private previewFace: Mesh | null = null;
  private squareMarker: Mesh | null = null;
  private goldenMarker: Mesh | null = null;

  constructor(config: BaseToolConfig) {
    super(config);
  }

  // ========== ABSTRACT IMPLEMENTATIONS ==========

  protected onPointerMove(position: Vector3, inferenceResult: InferenceResult): void {
    if (this.state.phase === 'idle' || !this.state.startPoint) {
      return;
    }

    // Calculate rectangle dimensions
    const start = this.state.startPoint;
    const current = position;

    // Work on the XZ plane (ground plane)
    const width = current.x - start.x;
    const height = current.z - start.z;

    this.rectState.width = Math.abs(width);
    this.rectState.height = Math.abs(height);
    this.rectState.drawDirection = {
      x: width >= 0 ? 1 : -1,
      z: height >= 0 ? 1 : -1,
    };

    // Check for Square
    this.rectState.isSquare = this.isSquare(this.rectState.width, this.rectState.height);

    // Check for Golden Section
    this.rectState.isGoldenSection = this.isGoldenRatio(this.rectState.width, this.rectState.height);

    // Update preview
    this.updatePreview(start, current);

    // Update screen tip with shape inference
    this.updateShapeInference();
  }

  protected onClick(position: Vector3): void {
    if (this.state.phase === 'idle') {
      // First click: Set start point
      this.setStartPoint(position);
    } else if (this.state.phase === 'first_point') {
      // Second click: Finalize rectangle
      if (this.rectState.width > 0.01 && this.rectState.height > 0.01) {
        this.state.endPoint = position;
        this.finalizeShape();
      }
    }
  }

  public applyMeasurement(result: MeasurementResult): void {
    if (this.state.phase !== 'first_point' || !this.state.startPoint) return;

    let newWidth = this.rectState.width;
    let newHeight = this.rectState.height;

    if (result.type === 'dimensions' && result.dimensions) {
      // Parse "8',20'" format
      if (result.dimensions.width !== undefined) {
        newWidth = Math.abs(result.dimensions.width) / 1000; // mm to units
        if (result.dimensions.width < 0) {
          this.rectState.drawDirection.x = -1;
        }
      }
      if (result.dimensions.height !== undefined) {
        newHeight = Math.abs(result.dimensions.height) / 1000;
        if (result.dimensions.height < 0) {
          this.rectState.drawDirection.z = -1;
        }
      }
    } else if (result.type === 'length' && result.length) {
      // Single value: apply to both (make square)
      newWidth = result.length / 1000;
      newHeight = result.length / 1000;
    }

    this.rectState.width = newWidth;
    this.rectState.height = newHeight;

    // Calculate end point based on new dimensions
    const start = this.state.startPoint;
    const endX = start.x + newWidth * this.rectState.drawDirection.x;
    const endZ = start.z + newHeight * this.rectState.drawDirection.z;

    this.state.endPoint = new Vector3(endX, start.y, endZ);

    // Check inferences
    this.rectState.isSquare = this.isSquare(newWidth, newHeight);
    this.rectState.isGoldenSection = this.isGoldenRatio(newWidth, newHeight);

    // Update preview and finalize
    this.updatePreview(start, this.state.endPoint);
    this.finalizeShape();
  }

  public getCurrentMeasurements(): { primary: string; secondary?: string; inputType: string } {
    const widthMm = this.rectState.width * 1000;
    const heightMm = this.rectState.height * 1000;

    let secondary: string | undefined;
    if (this.rectState.isSquare) {
      secondary = 'Square';
    } else if (this.rectState.isGoldenSection) {
      secondary = 'Golden Section';
    }

    return {
      primary: `${Math.round(widthMm)}mm, ${Math.round(heightMm)}mm`,
      secondary,
      inputType: 'dimensions',
    };
  }

  protected resetTool(): void {
    this.state.phase = 'idle';
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.endPoint = null;

    this.rectState.width = 0;
    this.rectState.height = 0;
    this.rectState.isSquare = false;
    this.rectState.isGoldenSection = false;
    this.rectState.drawDirection = { x: 1, z: 1 };

    this.disposePreviewMeshes();
    this.disposeMarkerMeshes();
    this.disposeShapeMarkers();

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

    const start = this.state.startPoint;
    const width = this.rectState.width * this.rectState.drawDirection.x;
    const height = this.rectState.height * this.rectState.drawDirection.z;

    // Calculate 4 corners
    const vertices = [
      start.clone(),
      new Vector3(start.x + width, start.y, start.z),
      new Vector3(start.x + width, start.y, start.z + height),
      new Vector3(start.x, start.y, start.z + height),
    ];

    // Create permanent edges
    const edgeIds = this.createEdgesFromVertices(vertices);

    // Create permanent lines (visual)
    this.createPermanentRectangle(vertices);

    // Detect and create faces
    this.detectAndCreateFaces(edgeIds);

    // Notify
    this.config.onShapeCreated?.({
      type: 'rectangle',
      vertices,
      edgeIds,
    });

    console.log(`Rectangle created: ${Math.round(this.rectState.width * 1000)}mm x ${Math.round(this.rectState.height * 1000)}mm`);

    // Reset for next rectangle
    this.resetTool();
  }

  // ========== PRIVATE METHODS ==========

  private setStartPoint(position: Vector3): void {
    this.state.startPoint = position.clone();
    this.state.phase = 'first_point';

    // Create start point marker
    this.createPointMarker(position, INFERENCE_COLORS.ENDPOINT);

    // Update inference store
    useInferenceStore.getState().setStartPoint(position);

    this.notifyStateChange();
  }

  private updatePreview(start: Vector3, end: Vector3): void {
    this.disposePreview();

    const width = end.x - start.x;
    const height = end.z - start.z;

    // Create preview lines
    const corners = [
      start.clone(),
      new Vector3(start.x + width, start.y, start.z),
      new Vector3(start.x + width, start.y, start.z + height),
      new Vector3(start.x, start.y, start.z + height),
      start.clone(), // Close the loop
    ];

    // Determine line color based on inference
    let lineColor = INFERENCE_COLORS.DEFAULT;
    if (this.rectState.isSquare || this.rectState.isGoldenSection) {
      lineColor = INFERENCE_COLORS.BLUE_AXIS;
    }

    this.previewLines = MeshBuilder.CreateLines(
      'rectPreviewLines',
      { points: corners, updatable: false },
      this.scene
    );
    this.previewLines.color = lineColor;
    this.previewLines.isPickable = false;

    // Create semi-transparent preview face
    this.previewFace = MeshBuilder.CreateGround(
      'rectPreviewFace',
      {
        width: Math.abs(width),
        height: Math.abs(height),
      },
      this.scene
    );
    this.previewFace.position = new Vector3(
      start.x + width / 2,
      start.y + 0.001, // Slightly above ground to avoid z-fighting
      start.z + height / 2
    );
    this.previewFace.material = this.previewMaterial;
    this.previewFace.isPickable = false;

    // Show square/golden markers
    this.updateShapeMarkers(start, end);
  }

  private updateShapeMarkers(start: Vector3, end: Vector3): void {
    this.disposeShapeMarkers();

    const width = end.x - start.x;
    const height = end.z - start.z;

    // Calculate the opposite corner position for the marker
    const markerPos = new Vector3(
      start.x + width,
      start.y,
      start.z + height
    );

    if (this.rectState.isSquare) {
      // Blue dot for square
      this.squareMarker = MeshBuilder.CreateSphere(
        'squareMarker',
        { diameter: 0.1, segments: 8 },
        this.scene
      );
      this.squareMarker.position = markerPos;
      this.squareMarker.isPickable = false;

      const mat = new StandardMaterial('squareMarkerMat', this.scene);
      mat.diffuseColor = INFERENCE_COLORS.BLUE_AXIS;
      mat.emissiveColor = INFERENCE_COLORS.BLUE_AXIS.scale(0.5);
      this.squareMarker.material = mat;
    }

    if (this.rectState.isGoldenSection && !this.rectState.isSquare) {
      // Blue dot for golden section
      this.goldenMarker = MeshBuilder.CreateSphere(
        'goldenMarker',
        { diameter: 0.1, segments: 8 },
        this.scene
      );
      this.goldenMarker.position = markerPos;
      this.goldenMarker.isPickable = false;

      const mat = new StandardMaterial('goldenMarkerMat', this.scene);
      mat.diffuseColor = INFERENCE_COLORS.BLUE_AXIS;
      mat.emissiveColor = INFERENCE_COLORS.BLUE_AXIS.scale(0.5);
      this.goldenMarker.material = mat;
    }
  }

  private updateShapeInference(): void {
    const inferenceStore = useInferenceStore.getState();

    if (this.rectState.isSquare) {
      inferenceStore.setScreenTip({
        text: 'Square',
        visible: true,
      });
    } else if (this.rectState.isGoldenSection) {
      inferenceStore.setScreenTip({
        text: 'Golden Section',
        visible: true,
      });
    }
  }

  private disposePreview(): void {
    if (this.previewLines) {
      this.previewLines.dispose();
      this.previewLines = null;
    }
    if (this.previewFace) {
      this.previewFace.dispose();
      this.previewFace = null;
    }
  }

  private disposeShapeMarkers(): void {
    if (this.squareMarker) {
      this.squareMarker.material?.dispose();
      this.squareMarker.dispose();
      this.squareMarker = null;
    }
    if (this.goldenMarker) {
      this.goldenMarker.material?.dispose();
      this.goldenMarker.dispose();
      this.goldenMarker = null;
    }
  }

  private createPermanentRectangle(vertices: Vector3[]): void {
    // Create permanent edge lines
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];

      const line = MeshBuilder.CreateLines(
        `rectEdge_${Date.now()}_${i}`,
        { points: [start, end], updatable: false },
        this.scene
      );
      line.color = new Color3(0.1, 0.1, 0.1);
      line.isPickable = true;
    }
  }

  protected disposePreviewMeshes(): void {
    super.disposePreviewMeshes();
    this.disposePreview();
    this.disposeShapeMarkers();
  }

  public dispose(): void {
    this.disposePreview();
    this.disposeShapeMarkers();
    super.dispose();
  }
}

export default RectangleTool;
