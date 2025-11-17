import { BaseTool } from './Tool';
import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import { SceneManager } from '../../core/engine/SceneManager';
import { SnapService } from '../services/SnapService';
import { eventBus } from '../../core/events/EventBus';
import { FloorEvents } from '../../core/events/FloorEvents';

/**
 * SelectTool - Select and drag points or walls to adjust positions
 *
 * Features:
 * - Click on point to select and drag
 * - Click on wall to select and drag (moves both endpoints)
 * - Snap to vertical/horizontal alignment with other points
 * - Connected walls update automatically
 */
export class SelectTool extends BaseTool {
  private sceneManager: SceneManager;
  private snapService: SnapService;

  // Selection and drag state
  private selectedPoint: Point | null = null;
  private selectedWall: Wall | null = null;
  private isDragging = false;
  private dragStartPos: Vector2 | null = null;

  // Config
  private pointSelectRadius = 200; // 200mm selection radius (easier to click)
  private wallSelectDistance = 300; // 300mm distance from wall to select (increased for easier selection)

  constructor(sceneManager: SceneManager, snapService: SnapService) {
    super('select');
    this.sceneManager = sceneManager;
    this.snapService = snapService;
  }

  protected onActivate(): void {
    console.log('[SelectTool] Activated');
    this.resetState();
  }

  protected onDeactivate(): void {
    console.log('[SelectTool] Deactivated');
    this.resetState();
  }

  handleMouseDown(position: Vector2, event: MouseEvent): void {
    if (event.button !== 0) return; // Only handle left-click

    console.log('[SelectTool] Mouse down at', position.x.toFixed(0), position.y.toFixed(0));

    // Try to find point near cursor first (points have priority)
    const allPoints = this.sceneManager.objectManager.getAllPoints();
    console.log('[SelectTool] Checking', allPoints.length, 'points');
    const clickedPoint = this.findPointNear(position, allPoints);

    if (clickedPoint) {
      // Select point and start dragging
      this.selectedPoint = clickedPoint;
      this.selectedWall = null;
      this.isDragging = true;
      this.dragStartPos = position.clone();

      console.log('[SelectTool] Selected point:', clickedPoint.id, 'at', clickedPoint.x, clickedPoint.y);

      // Emit selection event
      eventBus.emit(FloorEvents.POINT_SELECTED, {
        point: clickedPoint,
      });
      return;
    }

    // No point found - try to find wall near cursor
    const allWalls = this.sceneManager.objectManager.getAllWalls();
    console.log('[SelectTool] No point found, checking', allWalls.length, 'walls');
    const clickedWall = this.findWallNear(position, allWalls, allPoints);

    if (clickedWall) {
      // Select wall and start dragging
      this.selectedWall = clickedWall;
      this.selectedPoint = null;
      this.isDragging = true;
      this.dragStartPos = position.clone();

      console.log('[SelectTool] Selected wall:', clickedWall.id);

      // Emit wall selection event
      eventBus.emit(FloorEvents.WALL_SELECTED, {
        wall: clickedWall,
      });
      return;
    }

    console.log('[SelectTool] No point or wall found near click at', position.x.toFixed(0), position.y.toFixed(0));
    // Clicked empty space - deselect
    this.resetState();
  }

  handleMouseMove(position: Vector2, _event: MouseEvent): void {
    if (!this.isDragging) {
      // Hover feedback - highlight point or wall under cursor
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const hoveredPoint = this.findPointNear(position, allPoints);

      if (hoveredPoint) {
        eventBus.emit(FloorEvents.POINT_HOVERED, {
          point: hoveredPoint,
        });
      } else {
        eventBus.emit(FloorEvents.POINT_HOVER_CLEARED, {});
      }
      return;
    }

    // Handle point dragging
    if (this.selectedPoint) {
      // Update snap service with all points except the one being dragged
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const otherPoints = allPoints.filter((p) => p.id !== this.selectedPoint!.id);
      this.snapService.setPoints(otherPoints);

      // Snap position
      const snapResult = this.snapService.snap(position);
      const snappedPos = snapResult.position;

      console.log('[SelectTool] Moving point from', this.selectedPoint.x, this.selectedPoint.y, 'to', snappedPos.x, snappedPos.y);

      // Move point to snapped position
      this.selectedPoint.x = snappedPos.x;
      this.selectedPoint.y = snappedPos.y;

      // Emit point moved event for live preview
      eventBus.emit(FloorEvents.POINT_MOVED, {
        point: this.selectedPoint,
      });
    }
    // Handle wall dragging with axis constraints
    else if (this.selectedWall && this.dragStartPos) {
      const allPoints = this.sceneManager.objectManager.getAllPoints();

      // Get wall's start and end points
      const startPoint = allPoints.find((p) => p.id === this.selectedWall!.startPointId);
      const endPoint = allPoints.find((p) => p.id === this.selectedWall!.endPointId);

      if (!startPoint || !endPoint) return;

      // Determine if wall is horizontal or vertical
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const isHorizontal = Math.abs(dx) > Math.abs(dy);

      // Calculate drag delta
      const dragDx = position.x - this.dragStartPos.x;
      const dragDy = position.y - this.dragStartPos.y;

      console.log('[SelectTool] Dragging wall:', this.selectedWall.id,
        isHorizontal ? '(horizontal)' : '(vertical)',
        'delta:', dragDx.toFixed(1), dragDy.toFixed(1));

      if (isHorizontal) {
        // Horizontal wall - only move Y axis (상하)
        startPoint.y += dragDy;
        endPoint.y += dragDy;
        console.log('[SelectTool] Moving horizontal wall on Y axis by', dragDy.toFixed(1));
      } else {
        // Vertical wall - only move X axis (좌우)
        startPoint.x += dragDx;
        endPoint.x += dragDx;
        console.log('[SelectTool] Moving vertical wall on X axis by', dragDx.toFixed(1));
      }

      // Update drag start position for next frame
      this.dragStartPos = position.clone();

      // Emit point moved events for both points
      eventBus.emit(FloorEvents.POINT_MOVED, {
        point: startPoint,
      });
      eventBus.emit(FloorEvents.POINT_MOVED, {
        point: endPoint,
      });
    }
  }

  handleMouseUp(position: Vector2, event: MouseEvent): void {
    if (!this.isDragging || event.button !== 0) return;

    console.log('[SelectTool] Drag ended at', position);

    // Finalize move
    this.isDragging = false;

    if (this.selectedPoint) {
      // Emit final update event for point
      eventBus.emit(FloorEvents.POINT_UPDATED, {
        point: this.selectedPoint,
      });
    } else if (this.selectedWall) {
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const startPoint = allPoints.find((p) => p.id === this.selectedWall!.startPointId);
      const endPoint = allPoints.find((p) => p.id === this.selectedWall!.endPointId);

      // Emit final update events for both points
      if (startPoint) {
        eventBus.emit(FloorEvents.POINT_UPDATED, {
          point: startPoint,
        });
      }
      if (endPoint) {
        eventBus.emit(FloorEvents.POINT_UPDATED, {
          point: endPoint,
        });
      }
    }

    // Keep selection but stop dragging
  }

  cancel(): void {
    console.log('[SelectTool] Cancelled');
    this.resetState();
  }

  /**
   * Find point near cursor position
   */
  private findPointNear(position: Vector2, points: Point[]): Point | null {
    let nearestPoint: Point | null = null;
    let minDistance = this.pointSelectRadius;

    for (const point of points) {
      const pointVec = new Vector2(point.x, point.y);
      const distance = position.distanceTo(pointVec);

      if (distance < minDistance) {
        minDistance = distance;
        nearestPoint = point;
      }
    }

    return nearestPoint;
  }

  /**
   * Find wall near cursor position
   * Uses point-to-line-segment distance calculation
   */
  private findWallNear(position: Vector2, walls: Wall[], points: Point[]): Wall | null {
    let nearestWall: Wall | null = null;
    let minDistance = this.wallSelectDistance;

    console.log('[SelectTool] findWallNear: checking', walls.length, 'walls, max distance:', this.wallSelectDistance);

    for (const wall of walls) {
      // Get wall endpoints
      const startPoint = points.find((p) => p.id === wall.startPointId);
      const endPoint = points.find((p) => p.id === wall.endPointId);

      if (!startPoint || !endPoint) {
        console.log('[SelectTool] Wall', wall.id, 'missing endpoints');
        continue;
      }

      // Calculate distance from point to line segment
      const distance = this.pointToLineSegmentDistance(
        position,
        new Vector2(startPoint.x, startPoint.y),
        new Vector2(endPoint.x, endPoint.y)
      );

      console.log('[SelectTool] Wall', wall.id, 'distance:', distance.toFixed(1), 'mm');

      if (distance < minDistance) {
        minDistance = distance;
        nearestWall = wall;
        console.log('[SelectTool] New nearest wall:', wall.id, 'at distance:', distance.toFixed(1));
      }
    }

    if (nearestWall) {
      console.log('[SelectTool] Found wall:', nearestWall.id, 'at distance:', minDistance.toFixed(1));
    } else {
      console.log('[SelectTool] No wall found within', this.wallSelectDistance, 'mm');
    }

    return nearestWall;
  }

  /**
   * Calculate distance from point to line segment
   */
  private pointToLineSegmentDistance(point: Vector2, lineStart: Vector2, lineEnd: Vector2): number {
    // Vector from line start to point
    const px = point.x - lineStart.x;
    const py = point.y - lineStart.y;

    // Vector from line start to line end
    const lx = lineEnd.x - lineStart.x;
    const ly = lineEnd.y - lineStart.y;

    // Line segment length squared
    const lineLengthSq = lx * lx + ly * ly;

    if (lineLengthSq === 0) {
      // Line segment is a point
      return point.distanceTo(lineStart);
    }

    // Project point onto line, clamped to [0, 1] (line segment)
    const t = Math.max(0, Math.min(1, (px * lx + py * ly) / lineLengthSq));

    // Find closest point on line segment
    const closestX = lineStart.x + t * lx;
    const closestY = lineStart.y + t * ly;

    // Return distance from point to closest point
    const dx = point.x - closestX;
    const dy = point.y - closestY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private resetState(): void {
    this.selectedPoint = null;
    this.selectedWall = null;
    this.isDragging = false;
    this.dragStartPos = null;

    // Clear selection events
    eventBus.emit(FloorEvents.POINT_SELECTION_CLEARED, {});
    eventBus.emit(FloorEvents.POINT_HOVER_CLEARED, {});
  }

  getCursor(): string {
    if (this.isDragging) {
      return 'grabbing';
    } else if (this.selectedPoint || this.selectedWall) {
      return 'grab';
    }
    return 'default';
  }
}
