import { BaseTool } from './Tool';
import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import { SceneManager } from '../../core/engine/SceneManager';
import { SnapService } from '../services/SnapService';
import { eventBus } from '../../core/events/EventBus';
import { FloorEvents } from '../../core/events/FloorEvents';

/**
 * SelectTool - Select and drag points to adjust wall positions
 *
 * Features:
 * - Click on point to select
 * - Drag to move point
 * - Snap to vertical/horizontal alignment with other points
 * - Connected walls update automatically
 */
export class SelectTool extends BaseTool {
  private sceneManager: SceneManager;
  private snapService: SnapService;

  // Selection and drag state
  private selectedPoint: Point | null = null;
  private isDragging = false;
  private _dragStartPos: Vector2 | null = null;

  // Config
  private pointSelectRadius = 200; // 200mm selection radius (easier to click)

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

    // Find point near cursor
    const allPoints = this.sceneManager.objectManager.getAllPoints();
    console.log('[SelectTool] Looking for point near', position, 'from', allPoints.length, 'points');
    const clickedPoint = this.findPointNear(position, allPoints);

    if (clickedPoint) {
      // Select point and start dragging
      this.selectedPoint = clickedPoint;
      this.isDragging = true;
      this._dragStartPos = position;

      console.log('[SelectTool] Selected point:', clickedPoint.id, 'at', clickedPoint.x, clickedPoint.y);

      // Emit selection event
      eventBus.emit(FloorEvents.POINT_SELECTED, {
        point: clickedPoint,
      });
    } else {
      console.log('[SelectTool] No point found near click');
      // Clicked empty space - deselect
      this.resetState();
    }
  }

  handleMouseMove(position: Vector2, _event: MouseEvent): void {
    if (!this.isDragging || !this.selectedPoint) {
      // Hover feedback - highlight point under cursor
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

  handleMouseUp(position: Vector2, event: MouseEvent): void {
    if (!this.isDragging || !this.selectedPoint || event.button !== 0) return;

    console.log('[SelectTool] Point moved to', position);

    // Finalize move
    this.isDragging = false;
    this.dragStartPos = null;

    // Emit final update event
    eventBus.emit(FloorEvents.POINT_UPDATED, {
      point: this.selectedPoint,
    });

    // Keep point selected but stop dragging
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

  private resetState(): void {
    this.selectedPoint = null;
    this.isDragging = false;
    this._dragStartPos = null;

    // Clear selection events
    eventBus.emit(FloorEvents.POINT_SELECTION_CLEARED, {});
    eventBus.emit(FloorEvents.POINT_HOVER_CLEARED, {});
  }

  getCursor(): string {
    if (this.isDragging) {
      return 'grabbing';
    } else if (this.selectedPoint) {
      return 'grab';
    }
    return 'default';
  }
}
