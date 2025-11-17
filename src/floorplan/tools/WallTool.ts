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
 * WallTool - Coohom-style wall drawing tool
 *
 * Features:
 * - Click to place start point
 * - Move to preview wall (dashed line)
 * - Click to confirm end point
 * - Continue chain from end point
 * - ESC to cancel
 * - Right-click to finish chain
 * - Advanced snapping (point, grid, angle)
 */
export class WallTool extends BaseTool {
  private sceneManager: SceneManager;
  private snapService: SnapService;

  // Drawing state
  private isDrawing = false;
  private startPoint: Point | null = null;
  private currentPreviewEnd: Vector2 | null = null;
  private wallChain: Point[] = [];

  // Config (units: mm)
  private defaultWallThickness = 150; // 150mm = 15cm
  private defaultWallHeight = 2400; // 2400mm = 2.4m (일반 주거용 천장 높이)

  constructor(sceneManager: SceneManager, snapService: SnapService) {
    super('wall');
    this.sceneManager = sceneManager;
    this.snapService = snapService;
  }

  protected onActivate(): void {
    console.log('[WallTool] Activated');
    this.resetState();
  }

  protected onDeactivate(): void {
    console.log('[WallTool] Deactivated');
    this.finishChain();
    this.resetState();
  }

  handleMouseDown(position: Vector2, event: MouseEvent): void {
    if (event.button === 2) {
      // Right-click: finish chain
      this.finishChain();
      return;
    }

    if (event.button !== 0) return; // Only handle left-click

    // Snap position
    const snapResult = this.snapService.snap(position);
    const snappedPos = snapResult.position;

    if (!this.isDrawing) {
      // First click - start new wall
      this.startDrawing(snappedPos, snapResult.snapPoint);
    } else {
      // Subsequent clicks - confirm wall and continue
      this.confirmWall(snappedPos, snapResult.snapPoint);
    }
  }

  handleMouseMove(position: Vector2, event: MouseEvent): void {
    const hasActiveStart = this.isDrawing && !!this.startPoint;

    // Update snap service with all existing points for axis alignment
    this.snapService.setPoints(this.sceneManager.objectManager.getAllPoints());

    // Enable orthogonal snap only when Shift key is pressed during active drawing
    this.snapService.updateConfig({
      orthogonalSnapEnabled: hasActiveStart && event.shiftKey,
    });

    if (hasActiveStart && this.startPoint) {
      this.snapService.setLastPoint(new Vector2(this.startPoint.x, this.startPoint.y));
    } else {
      this.snapService.setLastPoint(null);
    }

    // Always update snap indicator
    const snapResult = this.snapService.snap(position);

    // Emit snap indicator
    if (snapResult.snapPoint) {
      eventBus.emit(FloorEvents.SNAP_POINT_UPDATED, {
        point: snapResult.snapPoint,
      });
    }

    if (!hasActiveStart || !this.startPoint) return;

    // Update preview
    this.currentPreviewEnd = snapResult.position;

    // Emit preview event for rendering
    eventBus.emit(FloorEvents.WALL_PREVIEW_UPDATED, {
      start: this.startPoint,
      end: {
        x: this.currentPreviewEnd.x,
        y: this.currentPreviewEnd.y,
        id: 'preview',
      },
    });

    // Emit distance measurement event
    eventBus.emit(FloorEvents.DISTANCE_MEASUREMENT_UPDATED, {
      from: this.startPoint,
      to: {
        x: this.currentPreviewEnd.x,
        y: this.currentPreviewEnd.y,
        id: 'preview',
      },
    });
  }

  handleMouseUp(_position: Vector2, _event: MouseEvent): void {
    // Wall tool uses click mode, not drag mode
    // Do nothing on mouse up
  }

  cancel(): void {
    console.log('[WallTool] Cancelled');
    this.finishChain();
    this.resetState();

    // Clear preview
    eventBus.emit(FloorEvents.WALL_PREVIEW_CLEARED, {});
  }

  /**
   * Start drawing a new wall
   */
  private startDrawing(position: Vector2, existingPoint?: Point): void {
    console.log('[WallTool] Start drawing at', position);

    // Use existing point or create new one
    if (existingPoint) {
      this.startPoint = existingPoint;
    } else {
      const tempPoint = this.createPoint(position);
      this.startPoint = this.sceneManager.objectManager.addPoint(tempPoint);
    }

    this.wallChain.push(this.startPoint);
    this.isDrawing = true;

    // Update snap service
    this.snapService.setLastPoint(position);
    this.snapService.setPoints(this.sceneManager.objectManager.getAllPoints());

    // NOTE: POINT_ADDED event is emitted by BlueprintObjectManager, no need to emit here
  }

  /**
   * Confirm wall and continue chain
   * Auto-completes room after 3 walls (ㄷ shape)
   */
  private confirmWall(position: Vector2, existingPoint?: Point): void {
    if (!this.startPoint) return;

    console.log('[WallTool] Confirm wall to', position);

    // Create or reuse end point
    let endPoint: Point;
    if (existingPoint) {
      endPoint = existingPoint;
    } else {
      const tempPoint = this.createPoint(position);
      endPoint = this.sceneManager.objectManager.addPoint(tempPoint);
      // NOTE: POINT_ADDED event is emitted by BlueprintObjectManager, no need to emit here
    }

    // Check if closing loop (end point === first point in chain)
    const isClosingLoop =
      this.wallChain.length > 2 && endPoint.id === this.wallChain[0].id;

    // Create wall
    const wall = this.createWall(this.startPoint, endPoint);
    this.sceneManager.objectManager.addWall(wall);
    // NOTE: WALL_ADDED event is emitted by BlueprintObjectManager, no need to emit here

    // Clear preview of confirmed wall
    eventBus.emit(FloorEvents.WALL_PREVIEW_CLEARED, {});
    this.currentPreviewEnd = null;

    if (isClosingLoop) {
      console.log('[WallTool] Loop closed!');
      this.finishChain();
      this.resetState();
      return;
    }

    // Continue chain from end point
    this.startPoint = endPoint;
    this.wallChain.push(endPoint);

    // Auto-complete room after 3 walls (ㄷ shape)
    // wallChain has: [point1, point2, point3, point4] = 3 walls completed
    if (this.wallChain.length === 4) {
      console.log('[WallTool] 3 walls completed, auto-closing room');

      // Create closing wall from current point back to first point
      const firstPoint = this.wallChain[0];
      const closingWall = this.createWall(endPoint, firstPoint);
      this.sceneManager.objectManager.addWall(closingWall);

      // Mark as closed
      this.wallChain.push(firstPoint);

      console.log('[WallTool] Room auto-completed!');
      this.finishChain();
      this.resetState();
      return;
    }

    // Update snap service
    this.snapService.setLastPoint(position);
    this.snapService.setPoints(this.sceneManager.objectManager.getAllPoints());
  }

  /**
   * Finish wall chain
   * Auto-completes the room by connecting last point to first point
   */
  private finishChain(): void {
    if (this.wallChain.length === 0) return;

    console.log('[WallTool] Finished chain with', this.wallChain.length, 'points');

    // Auto-complete room if we have at least 3 points
    if (this.wallChain.length >= 3) {
      const firstPoint = this.wallChain[0];
      const lastPoint = this.wallChain[this.wallChain.length - 1];

      // If not already closed, auto-complete by connecting last to first
      if (firstPoint.id !== lastPoint.id) {
        console.log('[WallTool] Auto-completing room by connecting last point to first');

        // Create closing wall
        const closingWall = this.createWall(lastPoint, firstPoint);
        this.sceneManager.objectManager.addWall(closingWall);

        // Add first point to chain to mark as closed
        this.wallChain.push(firstPoint);

        console.log('[WallTool] Auto-completed room with closing wall');
      }

      // Closed loop - trigger room detection
      eventBus.emit(FloorEvents.POTENTIAL_ROOM_DETECTED, {
        points: this.wallChain,
      });
    }

    this.wallChain = [];
    this.isDrawing = false;
    this.startPoint = null;

    this.snapService.setLastPoint(null);
    this.snapService.updateConfig({ orthogonalSnapEnabled: false });
  }

  /**
   * Reset tool state
   */
  private resetState(): void {
    this.isDrawing = false;
    this.startPoint = null;
    this.currentPreviewEnd = null;
    this.wallChain = [];

    eventBus.emit(FloorEvents.WALL_PREVIEW_CLEARED, {});
    eventBus.emit(FloorEvents.DISTANCE_MEASUREMENT_CLEARED, {});

    this.snapService.setLastPoint(null);
    this.snapService.updateConfig({ orthogonalSnapEnabled: false });
  }

  /**
   * Create a new point
   */
  private createPoint(position: Vector2): Point {
    return {
      id: uuidv4(),
      x: position.x,
      y: position.y,
      connectedWalls: [],
    };
  }

  /**
   * Create a new wall
   */
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
