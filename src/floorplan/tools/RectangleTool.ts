import { BaseTool } from './Tool';
import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import { SceneManager } from '../../core/engine/SceneManager';
import { SnapService } from '../services/SnapService';
import { eventBus } from '../../core/events/EventBus';
import { FloorEvents } from '../../core/events/FloorEvents';
import { v4 as uuidv4 } from 'uuid';

/**
 * RectangleTool - Draw rectangular rooms with 4 walls
 *
 * Features:
 * - Click to set first corner
 * - Drag to preview rectangle
 * - Release to create 4 walls
 */
export class RectangleTool extends BaseTool {
  private sceneManager: SceneManager;
  private snapService: SnapService;

  // Drawing state
  private isDrawing = false;
  private startPoint: Point | null = null;
  private currentPreviewEnd: Vector2 | null = null;

  // Config (units: pixels for 2D, mm for 3D)
  private defaultWallThickness = 20; // 20 pixels = 20cm visually
  private defaultWallHeight = 2800; // 2800mm = 2.8m for 3D

  constructor(sceneManager: SceneManager, snapService: SnapService) {
    super('rectangle');
    this.sceneManager = sceneManager;
    this.snapService = snapService;
  }

  protected onActivate(): void {
    console.log('[RectangleTool] Activated');
    this.resetState();
  }

  protected onDeactivate(): void {
    console.log('[RectangleTool] Deactivated');
    this.resetState();
  }

  handleMouseDown(position: Vector2, event: MouseEvent): void {
    if (event.button !== 0) return; // Only handle left-click

    // Snap position
    const snapResult = this.snapService.snap(position);
    const snappedPos = snapResult.position;

    // Start rectangle drawing immediately on mouse down
    this.startDrawing(snappedPos);
  }

  handleMouseMove(position: Vector2, event: MouseEvent): void {
    if (!this.isDrawing || !this.startPoint) return;

    // Snap position
    let snapResult = this.snapService.snap(position);
    let snappedPos = snapResult.position;

    // Rectangle-specific snap: align X or Y with existing points
    const alignmentResult = this.snapToRectangleAlignment(snappedPos);
    if (alignmentResult) {
      snappedPos = alignmentResult.position;

      // Emit guide lines for visual feedback
      if (alignmentResult.verticalGuide) {
        eventBus.emit(FloorEvents.VERTICAL_GUIDE_UPDATED, {
          x: alignmentResult.verticalGuide.x,
          fromY: -10000,
          toY: 10000,
        });
      }

      if (alignmentResult.horizontalGuide) {
        eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_UPDATED, {
          y: alignmentResult.horizontalGuide.y,
          fromX: -10000,
          toX: 10000,
        });
      }
    } else {
      // Clear guides if no alignment
      eventBus.emit(FloorEvents.VERTICAL_GUIDE_CLEARED, {});
      eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_CLEARED, {});
    }

    this.currentPreviewEnd = snappedPos;

    // Emit preview event for rendering
    this.emitPreview();
  }

  handleMouseUp(position: Vector2, event: MouseEvent): void {
    if (!this.isDrawing || !this.startPoint || event.button !== 0) return;

    // Snap position
    const snapResult = this.snapService.snap(position);
    const snappedPos = snapResult.position;

    // Create rectangle
    this.createRectangle(this.startPoint, snappedPos);
    this.resetState();
  }

  cancel(): void {
    console.log('[RectangleTool] Cancelled');
    this.resetState();
  }

  private startDrawing(position: Vector2): void {
    this.startPoint = this.createPoint(position);
    this.isDrawing = true;
  }

  private createRectangle(start: Point, end: Vector2): void {
    // Create 4 corner points
    const topLeftTemp = start;
    const topRightTemp = this.createPoint(new Vector2(end.x, start.y));
    const bottomRightTemp = this.createPoint(end);
    const bottomLeftTemp = this.createPoint(new Vector2(start.x, end.y));

    // Add all points and get actual IDs from blueprint
    const topLeft = this.sceneManager.objectManager.addPoint(topLeftTemp);
    const topRight = this.sceneManager.objectManager.addPoint(topRightTemp);
    const bottomRight = this.sceneManager.objectManager.addPoint(bottomRightTemp);
    const bottomLeft = this.sceneManager.objectManager.addPoint(bottomLeftTemp);

    eventBus.emit(FloorEvents.POINT_ADDED, { point: topLeft });
    eventBus.emit(FloorEvents.POINT_ADDED, { point: topRight });
    eventBus.emit(FloorEvents.POINT_ADDED, { point: bottomRight });
    eventBus.emit(FloorEvents.POINT_ADDED, { point: bottomLeft });

    // Create 4 walls using actual blueprint IDs
    const walls: Wall[] = [
      this.createWall(topLeft, topRight), // Top
      this.createWall(topRight, bottomRight), // Right
      this.createWall(bottomRight, bottomLeft), // Bottom
      this.createWall(bottomLeft, topLeft), // Left
    ];

    walls.forEach((wall) => {
      this.sceneManager.objectManager.addWall(wall);
      eventBus.emit(FloorEvents.WALL_ADDED, { wall });
    });

    // Clear preview
    eventBus.emit(FloorEvents.WALL_PREVIEW_CLEARED, {});
  }

  private emitPreview(): void {
    if (!this.startPoint || !this.currentPreviewEnd) return;

    // Create 4 corner points for rectangle preview
    const start = new Vector2(this.startPoint.x, this.startPoint.y);
    const end = this.currentPreviewEnd;

    const topLeft = { x: start.x, y: start.y, id: 'preview-tl' };
    const topRight = { x: end.x, y: start.y, id: 'preview-tr' };
    const bottomRight = { x: end.x, y: end.y, id: 'preview-br' };
    const bottomLeft = { x: start.x, y: end.y, id: 'preview-bl' };

    // Emit preview event with rectangle data
    eventBus.emit(FloorEvents.RECTANGLE_PREVIEW_UPDATED, {
      corners: [topLeft, topRight, bottomRight, bottomLeft],
    });
  }

  /**
   * Snap rectangle corners to existing points' X or Y coordinates
   * Returns position and guide line info
   */
  private snapToRectangleAlignment(
    position: Vector2
  ): {
    position: Vector2;
    verticalGuide?: { x: number };
    horizontalGuide?: { y: number };
  } | null {
    if (!this.startPoint) return null;

    const threshold = 15; // Snap tolerance
    const allPoints = this.sceneManager.objectManager.getAllPoints();

    let snapX: number | null = null;
    let snapY: number | null = null;
    let minXDiff = threshold;
    let minYDiff = threshold;

    // Find closest point with matching X (vertical alignment)
    for (const point of allPoints) {
      const xDiff = Math.abs(position.x - point.x);
      const yDiff = Math.abs(position.y - point.y);

      if (xDiff < minXDiff) {
        minXDiff = xDiff;
        snapX = point.x;
      }

      if (yDiff < minYDiff) {
        minYDiff = yDiff;
        snapY = point.y;
      }
    }

    // Apply snap if found
    if (snapX !== null || snapY !== null) {
      const resultX = snapX ?? position.x;
      const resultY = snapY ?? position.y;

      return {
        position: new Vector2(resultX, resultY),
        verticalGuide: snapX !== null ? { x: snapX } : undefined,
        horizontalGuide: snapY !== null ? { y: snapY } : undefined,
      };
    }

    return null;
  }

  private resetState(): void {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentPreviewEnd = null;

    eventBus.emit(FloorEvents.RECTANGLE_PREVIEW_CLEARED, {});
    eventBus.emit(FloorEvents.VERTICAL_GUIDE_CLEARED, {});
    eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_CLEARED, {});
  }

  private createPoint(position: Vector2): Point {
    return {
      id: uuidv4(),
      x: position.x,
      y: position.y,
      connectedWalls: [],
    };
  }

  private createWall(startPoint: Point, endPoint: Point): Wall {
    const wall: Wall = {
      id: uuidv4(),
      startPointId: startPoint.id,
      endPointId: endPoint.id,
      thickness: this.defaultWallThickness,
      height: this.defaultWallHeight,
    };

    // Update point connections
    if (!startPoint.connectedWalls) startPoint.connectedWalls = [];
    if (!endPoint.connectedWalls) endPoint.connectedWalls = [];

    startPoint.connectedWalls.push(wall.id);
    endPoint.connectedWalls.push(wall.id);

    return wall;
  }

  getCursor(): string {
    return 'crosshair';
  }
}
