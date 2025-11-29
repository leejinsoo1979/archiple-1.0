/**
 * RotatedRectangleTool - SketchUp-style Rotated Rectangle Drawing Tool
 *
 * Features:
 * - Click 1: Set start point of base line
 * - Click 2: Set end point of base line (determines length + direction)
 * - Click 3: Set height (perpendicular to base line)
 * - Alt/Command: Reset base line at current position
 * - Square/Golden Section inference
 * - Automatic face creation
 *
 * Unlike standard Rectangle which is axis-aligned, this creates
 * rectangles at any angle based on the initial base line.
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
  GOLDEN_RATIO,
  GOLDEN_RATIO_TOLERANCE,
} from './BaseTool';
import type { InferenceResult } from '../inference/InferenceEngine';
import type { MeasurementResult } from '../ui/MeasurementsBox';
import { INFERENCE_COLORS } from '../types';
import { useInferenceStore } from '../stores/inferenceStore';

// ============================================================================
// ROTATED RECTANGLE TOOL STATE
// ============================================================================

export interface RotatedRectangleToolState {
  baseStart: Vector3 | null;    // First click - start of base line
  baseEnd: Vector3 | null;      // Second click - end of base line
  baseLength: number;           // Length of base line
  baseDirection: Vector3;       // Normalized direction of base line
  perpDirection: Vector3;       // Perpendicular direction for height
  height: number;               // Height (perpendicular distance)
  isSquare: boolean;            // Square inference active
  isGoldenRatio: boolean;       // Golden ratio inference active
}

// ============================================================================
// ROTATED RECTANGLE TOOL CLASS
// ============================================================================

export class RotatedRectangleTool extends BaseTool {
  public readonly toolType: ToolType = 'rotated_rectangle';
  public readonly hotkey: string = ''; // No default hotkey
  public readonly displayName: string = 'Rotated Rectangle';

  // Tool-specific state
  private rectState: RotatedRectangleToolState = {
    baseStart: null,
    baseEnd: null,
    baseLength: 0,
    baseDirection: Vector3.Right(),
    perpDirection: Vector3.Forward(),
    height: 0,
    isSquare: false,
    isGoldenRatio: false,
  };

  // Preview meshes
  private previewLines: LinesMesh | null = null;
  private previewFace: Mesh | null = null;
  private baseLinePreview: LinesMesh | null = null;
  private startMarker: Mesh | null = null;
  private endMarker: Mesh | null = null;

  constructor(config: BaseToolConfig) {
    super(config);
  }

  // ========== ABSTRACT IMPLEMENTATIONS ==========

  protected onPointerMove(position: Vector3, inferenceResult: InferenceResult): void {
    if (this.state.phase === 'idle') {
      return;
    }

    if (this.state.phase === 'first_point' && this.rectState.baseStart) {
      // Drawing base line - show preview of the base line
      this.updateBaseLinePreview(position);
    } else if (this.state.phase === 'second_point' && this.rectState.baseEnd) {
      // Drawing height - show preview of full rectangle
      this.updateRectanglePreview(position);
    }
  }

  protected onClick(position: Vector3): void {
    if (this.state.phase === 'idle') {
      // First click: Set base line start point
      this.setBaseStart(position);
    } else if (this.state.phase === 'first_point') {
      // Second click: Set base line end point
      if (this.rectState.baseStart) {
        const distance = Vector3.Distance(this.rectState.baseStart, position);
        if (distance > 0.01) {
          this.setBaseEnd(position);
        }
      }
    } else if (this.state.phase === 'second_point') {
      // Third click: Set height and finalize
      if (this.rectState.height > 0.01) {
        this.state.endPoint = position;
        this.finalizeShape();
      }
    }
  }

  public applyMeasurement(result: MeasurementResult): void {
    if (this.state.phase === 'first_point' && this.rectState.baseStart) {
      // Apply base line length
      if (result.type === 'length' && result.length) {
        this.rectState.baseLength = result.length / 1000; // mm to units
        // If we have a direction, create the base end point
        if (this.rectState.baseDirection) {
          const endPoint = this.rectState.baseStart.add(
            this.rectState.baseDirection.scale(this.rectState.baseLength)
          );
          this.setBaseEnd(endPoint);
        }
      }
    } else if (this.state.phase === 'second_point') {
      // Apply height or dimensions
      if (result.type === 'length' && result.length) {
        this.rectState.height = result.length / 1000;
        this.finalizeShape();
      } else if (result.type === 'dimensions' && result.dimensions) {
        if (result.dimensions.width) {
          this.rectState.baseLength = result.dimensions.width / 1000;
        }
        if (result.dimensions.height) {
          this.rectState.height = result.dimensions.height / 1000;
        }
        if (this.rectState.baseLength > 0 && this.rectState.height > 0) {
          this.finalizeShape();
        }
      }
    }
  }

  public getCurrentMeasurements(): { primary: string; secondary?: string; inputType: string } {
    const baseLengthMm = this.rectState.baseLength * 1000;
    const heightMm = this.rectState.height * 1000;

    if (this.state.phase === 'first_point') {
      return {
        primary: `${Math.round(baseLengthMm)}mm`,
        inputType: 'length',
      };
    }

    let secondary: string | undefined;
    if (this.rectState.isSquare) {
      secondary = 'Square';
    } else if (this.rectState.isGoldenRatio) {
      secondary = 'Golden Section';
    }

    return {
      primary: `${Math.round(baseLengthMm)} x ${Math.round(heightMm)}mm`,
      secondary,
      inputType: 'dimensions',
    };
  }

  protected resetTool(): void {
    this.state.phase = 'idle';
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.endPoint = null;

    this.rectState.baseStart = null;
    this.rectState.baseEnd = null;
    this.rectState.baseLength = 0;
    this.rectState.baseDirection = Vector3.Right();
    this.rectState.perpDirection = Vector3.Forward();
    this.rectState.height = 0;
    this.rectState.isSquare = false;
    this.rectState.isGoldenRatio = false;

    this.disposePreviewMeshes();
    this.disposeMarkerMeshes();
    this.disposeRectMeshes();

    // Reset inference store
    const inferenceStore = useInferenceStore.getState();
    inferenceStore.setStartPoint(null);
    inferenceStore.setActiveInferences([]);
    inferenceStore.setPrimaryInference(null);

    this.inferenceEngine.reset();
    this.lockController.reset();
  }

  protected finalizeShape(): void {
    if (!this.rectState.baseStart || !this.rectState.baseEnd) return;

    const baseStart = this.rectState.baseStart;
    const baseLength = this.rectState.baseLength;
    const height = this.rectState.height;
    const baseDir = this.rectState.baseDirection;
    const perpDir = this.rectState.perpDirection;

    // Calculate the 4 corners of the rectangle
    // Corner order: baseStart, baseEnd, baseEnd + height, baseStart + height
    const vertices = [
      baseStart.clone(),
      baseStart.add(baseDir.scale(baseLength)),
      baseStart.add(baseDir.scale(baseLength)).add(perpDir.scale(height)),
      baseStart.add(perpDir.scale(height)),
    ];

    // Create permanent edges
    const edgeIds = this.createEdgesFromVertices(vertices);

    // Create permanent rectangle visualization
    this.createPermanentRectangle(vertices);

    // Detect and create faces
    this.detectAndCreateFaces(edgeIds);

    // Notify
    this.config.onShapeCreated?.({
      type: 'rotated_rectangle',
      vertices,
      edgeIds,
    });

    console.log(`Rotated Rectangle created: ${Math.round(baseLength * 1000)} x ${Math.round(height * 1000)}mm`);

    // Reset for next rectangle
    this.resetTool();
  }

  // ========== PRIVATE METHODS ==========

  private setBaseStart(position: Vector3): void {
    this.rectState.baseStart = position.clone();
    this.state.startPoint = position.clone();
    this.state.phase = 'first_point';

    // Create start point marker
    this.startMarker = MeshBuilder.CreateSphere(
      'rotRectStartMarker',
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    this.startMarker.position = position.clone();
    this.startMarker.isPickable = false;

    const mat = new StandardMaterial('startMarkerMat', this.scene);
    mat.diffuseColor = INFERENCE_COLORS.ENDPOINT;
    mat.emissiveColor = INFERENCE_COLORS.ENDPOINT.scale(0.5);
    this.startMarker.material = mat;

    // Update inference store
    useInferenceStore.getState().setStartPoint(position);

    this.notifyStateChange();
  }

  private setBaseEnd(position: Vector3): void {
    if (!this.rectState.baseStart) return;

    this.rectState.baseEnd = position.clone();
    this.state.phase = 'second_point';

    // Calculate base line properties
    const startToEnd = position.subtract(this.rectState.baseStart);
    this.rectState.baseLength = startToEnd.length();
    this.rectState.baseDirection = startToEnd.normalize();

    // Calculate perpendicular direction (on the XZ plane)
    // Rotate 90 degrees around Y axis
    this.rectState.perpDirection = new Vector3(
      -this.rectState.baseDirection.z,
      0,
      this.rectState.baseDirection.x
    );

    // Create end point marker
    this.endMarker = MeshBuilder.CreateSphere(
      'rotRectEndMarker',
      { diameter: 0.08, segments: 8 },
      this.scene
    );
    this.endMarker.position = position.clone();
    this.endMarker.isPickable = false;

    const mat = new StandardMaterial('endMarkerMat', this.scene);
    mat.diffuseColor = INFERENCE_COLORS.MIDPOINT;
    mat.emissiveColor = INFERENCE_COLORS.MIDPOINT.scale(0.5);
    this.endMarker.material = mat;

    // Update base line preview to permanent style
    this.disposeBaseLinePreview();
    this.baseLinePreview = MeshBuilder.CreateLines(
      'baseLineFixed',
      { points: [this.rectState.baseStart, position], updatable: false },
      this.scene
    );
    this.baseLinePreview.color = INFERENCE_COLORS.DEFAULT;
    this.baseLinePreview.isPickable = false;

    this.notifyStateChange();
  }

  private updateBaseLinePreview(currentPos: Vector3): void {
    if (!this.rectState.baseStart) return;

    this.disposeBaseLinePreview();

    // Calculate direction and length for display
    const startToEnd = currentPos.subtract(this.rectState.baseStart);
    this.rectState.baseLength = startToEnd.length();

    if (this.rectState.baseLength > 0.001) {
      this.rectState.baseDirection = startToEnd.normalize();

      // Create preview line
      this.baseLinePreview = MeshBuilder.CreateLines(
        'baseLinePreview',
        { points: [this.rectState.baseStart, currentPos], updatable: false },
        this.scene
      );
      this.baseLinePreview.color = INFERENCE_COLORS.DEFAULT;
      this.baseLinePreview.isPickable = false;
    }
  }

  private updateRectanglePreview(currentPos: Vector3): void {
    if (!this.rectState.baseStart || !this.rectState.baseEnd) return;

    this.disposeRectPreview();

    // Calculate height as perpendicular distance from base line to current position
    const baseStart = this.rectState.baseStart;
    const perpDir = this.rectState.perpDirection;

    // Project current position onto perpendicular direction
    const startToCurrent = currentPos.subtract(baseStart);
    const height = Vector3.Dot(startToCurrent, perpDir);
    this.rectState.height = Math.abs(height);

    // Determine actual perpendicular direction (could be positive or negative)
    const actualPerpDir = height >= 0 ? perpDir : perpDir.scale(-1);
    this.rectState.perpDirection = actualPerpDir;

    // Check for square/golden ratio
    this.rectState.isSquare = this.isSquare(this.rectState.baseLength, this.rectState.height);
    this.rectState.isGoldenRatio = this.isGoldenRatio(this.rectState.baseLength, this.rectState.height);

    // Update screen tip
    this.updateShapeInference();

    if (this.rectState.height < 0.001) return;

    // Calculate 4 corners
    const baseDir = this.rectState.baseDirection;
    const baseLength = this.rectState.baseLength;
    const absHeight = this.rectState.height;

    const corners = [
      baseStart.clone(),
      baseStart.add(baseDir.scale(baseLength)),
      baseStart.add(baseDir.scale(baseLength)).add(actualPerpDir.scale(absHeight)),
      baseStart.add(actualPerpDir.scale(absHeight)),
      baseStart.clone(), // Close the loop
    ];

    // Determine line color
    let lineColor = INFERENCE_COLORS.DEFAULT;
    if (this.rectState.isSquare) {
      lineColor = INFERENCE_COLORS.BLUE_AXIS;
    } else if (this.rectState.isGoldenRatio) {
      lineColor = INFERENCE_COLORS.MAGENTA_AXIS;
    }

    // Create preview lines
    this.previewLines = MeshBuilder.CreateLines(
      'rotRectPreviewLines',
      { points: corners, updatable: false },
      this.scene
    );
    this.previewLines.color = lineColor;
    this.previewLines.isPickable = false;

    // Create preview face
    const faceCorners = corners.slice(0, 4);
    this.previewFace = MeshBuilder.CreatePolygon(
      'rotRectPreviewFace',
      {
        shape: faceCorners.map(c => new Vector3(c.x - baseStart.x, 0, c.z - baseStart.z)),
      },
      this.scene
    );
    this.previewFace.position = baseStart.clone();
    this.previewFace.position.y += 0.001; // Slightly above ground
    this.previewFace.material = this.previewMaterial;
    this.previewFace.isPickable = false;
  }

  private updateShapeInference(): void {
    const inferenceStore = useInferenceStore.getState();

    if (this.rectState.isSquare) {
      inferenceStore.setScreenTip({
        text: 'Square',
        visible: true,
      });
    } else if (this.rectState.isGoldenRatio) {
      inferenceStore.setScreenTip({
        text: 'Golden Section',
        visible: true,
      });
    }
  }

  private disposeBaseLinePreview(): void {
    if (this.baseLinePreview) {
      this.baseLinePreview.dispose();
      this.baseLinePreview = null;
    }
  }

  private disposeRectPreview(): void {
    if (this.previewLines) {
      this.previewLines.dispose();
      this.previewLines = null;
    }
    if (this.previewFace) {
      this.previewFace.dispose();
      this.previewFace = null;
    }
  }

  private disposeRectMeshes(): void {
    this.disposeBaseLinePreview();
    this.disposeRectPreview();

    if (this.startMarker) {
      this.startMarker.material?.dispose();
      this.startMarker.dispose();
      this.startMarker = null;
    }
    if (this.endMarker) {
      this.endMarker.material?.dispose();
      this.endMarker.dispose();
      this.endMarker = null;
    }
  }

  private createPermanentRectangle(vertices: Vector3[]): void {
    // Create permanent edge lines
    for (let i = 0; i < vertices.length; i++) {
      const start = vertices[i];
      const end = vertices[(i + 1) % vertices.length];

      const line = MeshBuilder.CreateLines(
        `rotRectEdge_${Date.now()}_${i}`,
        { points: [start, end], updatable: false },
        this.scene
      );
      line.color = new Color3(0.1, 0.1, 0.1);
      line.isPickable = true;
    }
  }

  protected disposePreviewMeshes(): void {
    super.disposePreviewMeshes();
    this.disposeRectMeshes();
  }

  public dispose(): void {
    this.disposeRectMeshes();
    super.dispose();
  }
}

export default RotatedRectangleTool;
