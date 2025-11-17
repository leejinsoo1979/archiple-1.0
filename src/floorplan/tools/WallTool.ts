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
  private defaultWallThickness = 200; // 200mm = 20cm
  private defaultWallHeight = 2800; // 2800mm = 2.8m

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
    // Enable orthogonal mode when Shift is pressed
    const isShiftPressed = event.shiftKey;

    this.snapService.updateConfig({
      orthogonalSnapEnabled: isShiftPressed,
    });

    // Always update snap indicator
    const snapResult = this.snapService.snap(position);

    // Emit snap indicator
    if (snapResult.snapPoint) {
      eventBus.emit(FloorEvents.SNAP_POINT_UPDATED, {
        point: snapResult.snapPoint,
      });
    }

    if (!this.isDrawing || !this.startPoint) return;

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
      this.startPoint = this.createPoint(position);
      this.sceneManager.objectManager.addPoint(this.startPoint);
    }

    this.wallChain.push(this.startPoint);
    this.isDrawing = true;

    // Update snap service
    this.snapService.setLastPoint(position);
    this.snapService.setPoints(this.sceneManager.objectManager.getAllPoints());

    eventBus.emit(FloorEvents.POINT_ADDED, { point: this.startPoint });
  }

  /**
   * Confirm wall and continue chain
   */
  private confirmWall(position: Vector2, existingPoint?: Point): void {
    if (!this.startPoint) return;

    console.log('[WallTool] Confirm wall to', position);

    // Check if clicking on a wall (not at a point)
    if (!existingPoint && this.wallChain.length > 0) {
      const wallIntersection = this.findWallIntersection(position);
      if (wallIntersection) {
        console.log('[WallTool] Clicked on wall, auto-completing room');
        this.completeRoomFromWall(wallIntersection.wall, position);
        return;
      }
    }

    // Create or reuse end point
    let endPoint: Point;
    if (existingPoint) {
      endPoint = existingPoint;
    } else {
      endPoint = this.createPoint(position);
      this.sceneManager.objectManager.addPoint(endPoint);
      eventBus.emit(FloorEvents.POINT_ADDED, { point: endPoint });
    }

    // Check if closing loop (end point === first point in chain)
    const isClosingLoop =
      this.wallChain.length > 2 && endPoint.id === this.wallChain[0].id;

    // Create wall
    const wall = this.createWall(this.startPoint, endPoint);
    this.sceneManager.objectManager.addWall(wall);
    eventBus.emit(FloorEvents.WALL_ADDED, { wall });

    if (isClosingLoop) {
      console.log('[WallTool] Loop closed!');
      this.finishChain();
      this.resetState();
      return;
    }

    // Continue chain from end point
    this.startPoint = endPoint;
    this.wallChain.push(endPoint);

    // Update snap service
    this.snapService.setLastPoint(position);
    this.snapService.setPoints(this.sceneManager.objectManager.getAllPoints());
  }

  /**
   * Finish wall chain
   */
  private finishChain(): void {
    if (this.wallChain.length === 0) return;

    console.log('[WallTool] Finished chain with', this.wallChain.length, 'points');

    // Check if we formed a closed loop
    if (this.wallChain.length >= 3) {
      const firstPoint = this.wallChain[0];
      const lastPoint = this.wallChain[this.wallChain.length - 1];

      if (firstPoint.id === lastPoint.id) {
        // Closed loop detected - trigger room detection
        eventBus.emit(FloorEvents.POTENTIAL_ROOM_DETECTED, {
          points: this.wallChain,
        });
      }
    }

    this.wallChain = [];
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

  /**
   * Find wall intersection near click position
   */
  private findWallIntersection(position: Vector2): { wall: Wall; point: Point } | null {
    const walls = this.sceneManager.objectManager.getAllWalls();
    const points = this.sceneManager.objectManager.getAllPoints();
    const pointMap = new Map(points.map(p => [p.id, p]));
    const threshold = 20; // 20px detection threshold

    for (const wall of walls) {
      const startPoint = pointMap.get(wall.startPointId);
      const endPoint = pointMap.get(wall.endPointId);
      if (!startPoint || !endPoint) continue;

      const dist = this.distanceToLineSegment(
        position,
        new Vector2(startPoint.x, startPoint.y),
        new Vector2(endPoint.x, endPoint.y)
      );

      if (dist < threshold) {
        const closestPoint = this.getClosestPointOnWall(wall, position, pointMap);
        if (closestPoint) {
          return { wall, point: closestPoint };
        }
      }
    }
    return null;
  }

  /**
   * Get closest endpoint of a wall
   */
  private getClosestPointOnWall(
    wall: Wall,
    clickPosition: Vector2,
    pointMap: Map<string, Point>
  ): Point | null {
    const startPoint = pointMap.get(wall.startPointId);
    const endPoint = pointMap.get(wall.endPointId);
    if (!startPoint || !endPoint) return null;

    const distToStart = clickPosition.distanceTo(new Vector2(startPoint.x, startPoint.y));
    const distToEnd = clickPosition.distanceTo(new Vector2(endPoint.x, endPoint.y));

    return distToStart < distToEnd ? startPoint : endPoint;
  }

  /**
   * Complete room by connecting to an existing wall
   */
  private completeRoomFromWall(wall: Wall, clickPosition: Vector2): void {
    if (!this.startPoint) return;

    const points = this.sceneManager.objectManager.getAllPoints();
    const pointMap = new Map(points.map(p => [p.id, p]));

    const startPoint = pointMap.get(wall.startPointId);
    const endPoint = pointMap.get(wall.endPointId);
    if (!startPoint || !endPoint) return;

    const distToStart = clickPosition.distanceTo(new Vector2(startPoint.x, startPoint.y));
    const distToEnd = clickPosition.distanceTo(new Vector2(endPoint.x, endPoint.y));
    const closerPoint = distToStart < distToEnd ? startPoint : endPoint;

    const newWall = this.createWall(this.startPoint, closerPoint);
    this.sceneManager.objectManager.addWall(newWall);
    eventBus.emit(FloorEvents.WALL_ADDED, { wall: newWall });

    console.log('[WallTool] Room completed by connecting to existing wall');

    this.finishChain();
    this.resetState();
  }

  /**
   * Calculate distance from point to line segment
   */
  private distanceToLineSegment(p: Vector2, a: Vector2, b: Vector2): number {
    const ab = new Vector2(b.x - a.x, b.y - a.y);
    const ap = new Vector2(p.x - a.x, p.y - a.y);

    const abLengthSq = ab.x * ab.x + ab.y * ab.y;
    if (abLengthSq === 0) return ap.length();

    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLengthSq));
    const projection = new Vector2(a.x + t * ab.x, a.y + t * ab.y);

    return p.distanceTo(projection);
  }

  getCursor(): string {
    return 'crosshair';
  }
}
