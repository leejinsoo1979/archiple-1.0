import { Vector3, Color3, Mesh, MeshBuilder, StandardMaterial, LinesMesh, PointerInfo, PointerEventTypes, Curve3 } from '@babylonjs/core';
import { BaseTool } from '../../modeling/tools/BaseTool';
import type { PickResultInfo, ToolType } from '../../modeling/types';

export interface RoadPoint {
    position: Vector3;
    controlPoint?: Vector3; // For Bézier curves
}

export class RoadTool extends BaseTool {
    name: ToolType = 'road'; // You might need to add 'road' to ToolType enum
    cursor: string = 'crosshair';

    private points: RoadPoint[] = [];
    private previewMesh: Mesh | null = null;
    private previewLine: LinesMesh | null = null;
    private isDrawing: boolean = false;

    // Configuration
    private roadWidth: number = 10;
    private snapDistance: number = 2;

    protected onActivate(): void {
        this.setStatus('Click to start drawing road');
    }

    protected onDeactivate(): void {
        this.cancel();
    }

    onPointerDown(info: PointerInfo, pickResult: PickResultInfo): void {
        if (info.event.button !== 0) return; // Left click only

        if (!pickResult.hit || !pickResult.pickedPoint) return;

        if (!this.isDrawing) {
            this.startDrawing(pickResult.pickedPoint);
        } else {
            this.addPoint(pickResult.pickedPoint);
        }
    }

    onPointerMove(info: PointerInfo, pickResult: PickResultInfo): void {
        if (!this.isDrawing || !pickResult.pickedPoint) return;

        this.updatePreview(pickResult.pickedPoint);
    }

    onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.cancel();
        } else if (event.key === 'Enter') {
            this.finishDrawing();
        }
    }

    public startDrawing(startPoint: Vector3) {
        this.isDrawing = true;
        this.points = [{ position: startPoint }];
        this.setStatus('Click to add point, Enter to finish, Esc to cancel');
    }

    public updatePreview(currentPoint: Vector3) {
        if (!this.isDrawing || this.points.length === 0) return;

        const lastPoint = this.points[this.points.length - 1];

        // Bézier curve preview
        // Calculate a control point for smooth curve (simplified)
        const controlPoint = lastPoint.position.add(currentPoint).scale(0.5);
        controlPoint.y += 5; // Lift up slightly for visualization

        const curve = Curve3.CreateQuadraticBezier(
            lastPoint.position,
            controlPoint,
            currentPoint,
            20
        );

        if (this.previewLine) {
            this.previewLine.dispose();
        }

        this.previewLine = MeshBuilder.CreateLines("roadPreviewLine", {
            points: curve.getPoints(),
            updatable: true
        }, this.scene!);

        this.previewLine.color = new Color3(0.2, 0.6, 1); // Light blue
    }

    public addPoint(point: Vector3) {
        this.points.push({ position: point });
        this.updateRoadMesh();
    }

    public finishDrawing() {
        this.isDrawing = false;
        if (this.previewLine) {
            this.previewLine.dispose();
            this.previewLine = null;
        }
        // Finalize mesh
        this.updateRoadMesh(true);
        this.points = [];
        this.setStatus('Road created');
    }

    public cancel() {
        this.isDrawing = false;
        this.points = [];
        if (this.previewMesh) {
            this.previewMesh.dispose();
            this.previewMesh = null;
        }
        if (this.previewLine) {
            this.previewLine.dispose();
            this.previewLine = null;
        }
        this.setStatus('Cancelled');
    }

    private updateRoadMesh(isFinal: boolean = false) {
        // Generate road geometry based on points
        // This is where the complex geometry generation will happen
        // For now, just creating tubes or ribbons

        const path = this.points.map(p => p.position);
        if (path.length < 2) return;

        const meshName = isFinal ? `road_${Date.now()}` : "roadPreview";

        if (!isFinal && this.previewMesh) {
            this.previewMesh.dispose();
        }

        // Create a simple ribbon or tube for the road
        const road = MeshBuilder.CreateTube(meshName, {
            path: path,
            radius: this.roadWidth / 2,
            sideOrientation: Mesh.DOUBLESIDE,
            updatable: !isFinal
        }, this.scene!);

        const material = new StandardMaterial(`${meshName}_mat`, this.scene!);
        material.diffuseColor = isFinal ? new Color3(0.2, 0.2, 0.2) : new Color3(0.2, 0.6, 1);
        material.alpha = isFinal ? 1.0 : 0.5;
        road.material = material;

        if (!isFinal) {
            this.previewMesh = road;
        }
    }

    getState(): unknown {
        return {
            isDrawing: this.isDrawing,
            pointsCount: this.points.length
        };
    }
}
