import { BaseTool } from './Tool';
import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import type { Door } from '../../core/types/Door';
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
  private selectedDoor: Door | null = null;
  private selectedDoorHandle: 'start' | 'end' | 'body' | null = null;
  private isDragging = false;
  private dragStartPos: Vector2 | null = null;

  // Hover state
  private hoveredPoint: Point | null = null;
  private hoveredWall: Wall | null = null;

  // Config
  private pointSelectRadius = 200; // 200mm selection radius (easier to click)
  private wallSelectDistance = 500; // 500mm distance from wall to select
  private doorHandleRadius = 300; // 300mm radius for door handle selection
  private doorBodyRadius = 500; // 500mm radius for door body selection

  constructor(sceneManager: SceneManager, snapService: SnapService) {
    super('select');
    this.sceneManager = sceneManager;
    this.snapService = snapService;
  }

  protected onActivate(): void {
    this.resetState();
  }

  protected onDeactivate(): void {
    this.resetState();
  }

  handleMouseDown(position: Vector2, event: MouseEvent): void {
    if (event.button !== 0) return; // Only handle left-click

    const allPoints = this.sceneManager.objectManager.getAllPoints();
    const allDoors = this.sceneManager.objectManager.getAllDoors();
    const allWalls = this.sceneManager.objectManager.getAllWalls();

    // Check for door first (before points)
    const clickedDoor = this.findDoorNear(position, allDoors, allWalls, allPoints);
    console.log('[SelectTool] Door check:', clickedDoor ? `Found door ${clickedDoor.door.id} (${clickedDoor.handle})` : 'No door found');

    if (clickedDoor) {
      // Select door and start dragging
      this.selectedDoor = clickedDoor.door;
      this.selectedDoorHandle = clickedDoor.handle;
      this.selectedPoint = null;
      this.selectedWall = null;
      this.isDragging = true;
      this.dragStartPos = position.clone();

      // Emit door selection via SelectionManager
      this.sceneManager.selectionManager.select(clickedDoor.door.id);
      console.log('[SelectTool] Door selected:', clickedDoor.door.id);
      return;
    }

    // Try to find point near cursor (after doors)
    const clickedPoint = this.findPointNear(position, allPoints);

    if (clickedPoint) {
      // Select point and start dragging
      this.selectedPoint = clickedPoint;
      this.selectedWall = null;
      this.selectedDoor = null;
      this.selectedDoorHandle = null;
      this.isDragging = true;
      this.dragStartPos = position.clone();

      // Emit selection event
      eventBus.emit(FloorEvents.POINT_SELECTED, {
        point: clickedPoint,
      });
      return;
    }



    // No point or door found - try to find wall near cursor
    const clickedWall = this.findWallNear(position, allWalls, allPoints);
    console.log('[SelectTool] Wall check:', clickedWall ? `Found wall ${clickedWall.id}` : 'No wall found');

    if (clickedWall) {
      // Select wall and start dragging
      this.selectedWall = clickedWall;
      this.selectedPoint = null;
      this.selectedDoor = null;
      this.selectedDoorHandle = null;
      this.isDragging = true;
      this.dragStartPos = position.clone();

      // Emit wall selection event
      eventBus.emit(FloorEvents.WALL_SELECTED, {
        wall: clickedWall,
      });
      console.log('[SelectTool] Wall selected:', clickedWall.id);
      return;
    }

    // Clicked empty space - deselect everything (including doors)
    this.resetState();
    // Clear any door selection to hide FloatingOptionBar
    this.sceneManager.selectionManager.clearSelection();
    console.log('[SelectTool] Clicked empty space, deselected all');
  }

  handleMouseMove(position: Vector2, _event: MouseEvent): void {
    if (!this.isDragging) {
      // Hover feedback - highlight point or wall under cursor
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const hoveredPoint = this.findPointNear(position, allPoints);

      if (hoveredPoint) {
        this.hoveredPoint = hoveredPoint;
        this.hoveredWall = null;
        eventBus.emit(FloorEvents.POINT_HOVERED, {
          point: hoveredPoint,
        });
        eventBus.emit(FloorEvents.WALL_HOVER_CLEARED, {});
        return;
      } else {
        this.hoveredPoint = null;
        eventBus.emit(FloorEvents.POINT_HOVER_CLEARED, {});
      }

      // If no point found, check for wall hover
      const allWalls = this.sceneManager.objectManager.getAllWalls();
      const hoveredWall = this.findWallNear(position, allWalls, allPoints);

      if (hoveredWall) {
        this.hoveredWall = hoveredWall;
        eventBus.emit(FloorEvents.WALL_HOVERED, {
          wall: hoveredWall,
        });
      } else {
        this.hoveredWall = null;
        eventBus.emit(FloorEvents.WALL_HOVER_CLEARED, {});
      }
      return;
    }

    // Handle door dragging
    if (this.selectedDoor && this.dragStartPos) {
      const allWalls = this.sceneManager.objectManager.getAllWalls();
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const wall = allWalls.find(w => w.id === this.selectedDoor!.wallId);

      if (wall) {
        const startPoint = allPoints.find(p => p.id === wall.startPointId);
        const endPoint = allPoints.find(p => p.id === wall.endPointId);

        if (startPoint && endPoint) {
          if (this.selectedDoorHandle === 'body') {
            // Drag door body - move along wall
            const wallStart = new Vector2(startPoint.x, startPoint.y);
            const wallEnd = new Vector2(endPoint.x, endPoint.y);
            const wallVec = wallEnd.subtract(wallStart);
            const wallLength = wallVec.length();

            if (wallLength > 0) {
              // Project mouse position onto wall line
              const toMouse = position.subtract(wallStart);
              const t = Math.max(0, Math.min(1, toMouse.dot(wallVec) / (wallLength * wallLength)));

              // Update door position
              this.sceneManager.objectManager.updateDoor(this.selectedDoor.id, {
                position: t
              });
            }
          } else if (this.selectedDoorHandle === 'start' || this.selectedDoorHandle === 'end') {
            // Drag handle - resize door width
            const wallAngle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
            const doorCenterX = startPoint.x + (endPoint.x - startPoint.x) * this.selectedDoor.position;
            const doorCenterY = startPoint.y + (endPoint.y - startPoint.y) * this.selectedDoor.position;

            // Calculate distance from mouse to door center along wall direction
            const toDoorCenter = new Vector2(doorCenterX - position.x, doorCenterY - position.y);
            const wallDir = new Vector2(Math.cos(wallAngle), Math.sin(wallAngle));
            const distAlongWall = Math.abs(toDoorCenter.dot(wallDir));

            // New width is 2 * distance from center
            let newWidth = distAlongWall * 2;

            // Constrain width
            const minWidth = 400; // 400mm minimum
            const wallLength = Math.sqrt(Math.pow(endPoint.x - startPoint.x, 2) + Math.pow(endPoint.y - startPoint.y, 2));
            const maxWidth = wallLength * 0.9; // 90% of wall length

            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

            // Update door width
            this.sceneManager.objectManager.updateDoor(this.selectedDoor.id, {
              width: newWidth
            });
          }
        }
      }
    }
    // Handle point dragging
    else if (this.selectedPoint) {
      // Update snap service with all points except the one being dragged
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const otherPoints = allPoints.filter((p) => p.id !== this.selectedPoint!.id);
      this.snapService.setPoints(otherPoints);

      // Snap position
      const snapResult = this.snapService.snap(position);
      const snappedPos = snapResult.position;

      // Update point using SceneManager's updatePoint method
      this.sceneManager.objectManager.updatePoint(this.selectedPoint.id, {
        x: snappedPos.x,
        y: snappedPos.y,
      });
    }
    // Handle wall dragging
    else if (this.selectedWall && this.dragStartPos) {
      const allPoints = this.sceneManager.objectManager.getAllPoints();

      // Get wall's start and end points
      const startPoint = allPoints.find((p) => p.id === this.selectedWall!.startPointId);
      const endPoint = allPoints.find((p) => p.id === this.selectedWall!.endPointId);

      if (!startPoint || !endPoint) return;

      // Calculate wall direction vector
      const wallVec = new Vector2(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
      const wallLength = wallVec.length();
      if (wallLength < 0.001) return; // Zero-length wall

      const wallDir = wallVec.normalize();

      // Calculate drag delta
      const dragDelta = new Vector2(position.x - this.dragStartPos.x, position.y - this.dragStartPos.y);

      // Project drag delta onto wall perpendicular direction (normal)
      // This allows moving the wall sideways but not along its length
      const wallNormal = new Vector2(-wallDir.y, wallDir.x);
      const perpDist = dragDelta.dot(wallNormal);

      // Calculate the perpendicular offset
      const offsetX = wallNormal.x * perpDist;
      const offsetY = wallNormal.y * perpDist;

      // Always move both endpoints to drag the wall
      // This will move connected walls as well
      this.sceneManager.objectManager.updatePoint(startPoint.id, {
        x: startPoint.x + offsetX,
        y: startPoint.y + offsetY,
      });

      this.sceneManager.objectManager.updatePoint(endPoint.id, {
        x: endPoint.x + offsetX,
        y: endPoint.y + offsetY,
      });

      // Update drag start position for next frame
      this.dragStartPos = position.clone();
    }
  }

  handleMouseUp(_position: Vector2, event: MouseEvent): void {
    if (!this.isDragging || event.button !== 0) return;

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
    this.resetState();
  }

  handleKeyDown(event: KeyboardEvent): void {
    // Call parent to handle Escape
    super.handleKeyDown(event);

    // Handle Delete and Backspace keys
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedWall) {
        // Delete the selected wall
        this.sceneManager.objectManager.removeWall(this.selectedWall.id);
        this.resetState();
        event.preventDefault();
      } else if (this.selectedPoint) {
        // Delete the selected point
        this.sceneManager.objectManager.removePoint(this.selectedPoint.id);
        this.resetState();
        event.preventDefault();
      }
    }
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

    for (const wall of walls) {
      // Get wall endpoints
      const startPoint = points.find((p) => p.id === wall.startPointId);
      const endPoint = points.find((p) => p.id === wall.endPointId);

      if (!startPoint || !endPoint) {
        continue;
      }

      // Calculate distance from point to line segment
      const distance = this.pointToLineSegmentDistance(
        position,
        new Vector2(startPoint.x, startPoint.y),
        new Vector2(endPoint.x, endPoint.y)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestWall = wall;
      }
    }

    return nearestWall;
  }

  /**
   * Find door near cursor position
   * Checks handles first, then door body
   */
  private findDoorNear(
    position: Vector2,
    doors: Door[],
    walls: Wall[],
    points: Point[]
  ): { door: Door; handle: 'start' | 'end' | 'body'; distance: number } | null {
    console.log(`[SelectTool] Looking for door near ${position.x}, ${position.y}. Total doors: ${doors.length}`);

    let nearestDoor: Door | null = null;
    let nearestHandle: 'start' | 'end' | 'body' = 'body';
    let minDistance = this.doorHandleRadius;

    // First pass: check for handle clicks
    for (const door of doors) {
      const wall = walls.find(w => w.id === door.wallId);
      if (!wall) {
        console.log(`[SelectTool] Door ${door.id}: wall not found`);
        continue;
      }

      const startPoint = points.find(p => p.id === wall.startPointId);
      const endPoint = points.find(p => p.id === wall.endPointId);
      if (!startPoint || !endPoint) {
        console.log(`[SelectTool] Door ${door.id}: points not found`);
        continue;
      }

      // Calculate door center and endpoints
      const wallX = startPoint.x + (endPoint.x - startPoint.x) * door.position;
      const wallY = startPoint.y + (endPoint.y - startPoint.y) * door.position;
      const wallAngle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
      const halfWidth = door.width / 2;

      const openingStart = new Vector2(
        wallX - Math.cos(wallAngle) * halfWidth,
        wallY - Math.sin(wallAngle) * halfWidth
      );
      const openingEnd = new Vector2(
        wallX + Math.cos(wallAngle) * halfWidth,
        wallY + Math.sin(wallAngle) * halfWidth
      );

      // Check start handle
      const distToStart = position.distanceTo(openingStart);
      console.log(`[SelectTool] Door ${door.id} start handle distance: ${distToStart.toFixed(0)}mm (threshold: ${this.doorHandleRadius}mm)`);
      if (distToStart < minDistance) {
        minDistance = distToStart;
        nearestDoor = door;
        nearestHandle = 'start';
      }

      // Check end handle
      const distToEnd = position.distanceTo(openingEnd);
      console.log(`[SelectTool] Door ${door.id} end handle distance: ${distToEnd.toFixed(0)}mm`);
      if (distToEnd < minDistance) {
        minDistance = distToEnd;
        nearestDoor = door;
        nearestHandle = 'end';
      }
    }

    // If handle found, return it
    if (nearestDoor) {
      console.log(`[SelectTool] Found door handle: ${nearestDoor.id} (${nearestHandle}), distance: ${minDistance.toFixed(0)}mm`);
      return { door: nearestDoor, handle: nearestHandle, distance: minDistance };
    }

    // Second pass: check for door body clicks
    minDistance = this.doorBodyRadius;
    console.log(`[SelectTool] No handle found, checking body (threshold: ${this.doorBodyRadius}mm)`);

    for (const door of doors) {
      const wall = walls.find(w => w.id === door.wallId);
      if (!wall) continue;

      const startPoint = points.find(p => p.id === wall.startPointId);
      const endPoint = points.find(p => p.id === wall.endPointId);
      if (!startPoint || !endPoint) continue;

      // Calculate door center
      const wallX = startPoint.x + (endPoint.x - startPoint.x) * door.position;
      const wallY = startPoint.y + (endPoint.y - startPoint.y) * door.position;
      const doorCenter = new Vector2(wallX, wallY);

      // Check distance to door center
      const dist = position.distanceTo(doorCenter);
      console.log(`[SelectTool] Door ${door.id} body distance: ${dist.toFixed(0)}mm`);
      if (dist < minDistance) {
        minDistance = dist;
        nearestDoor = door;
        nearestHandle = 'body';
      }
    }

    if (nearestDoor) {
      console.log(`[SelectTool] Found door body: ${nearestDoor.id}, distance: ${minDistance.toFixed(0)}mm`);
      return { door: nearestDoor, handle: nearestHandle, distance: minDistance };
    }

    console.log('[SelectTool] No door found');
    return null;
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
    this.selectedDoor = null;
    this.selectedDoorHandle = null;
    this.isDragging = false;
    this.dragStartPos = null;
    this.hoveredPoint = null;
    this.hoveredWall = null;

    // Clear selection and hover events
    eventBus.emit(FloorEvents.POINT_SELECTION_CLEARED, {});
    eventBus.emit(FloorEvents.POINT_HOVER_CLEARED, {});
    eventBus.emit(FloorEvents.WALL_HOVER_CLEARED, {});
  }

  getCursor(): string {
    if (this.isDragging) {
      return 'grabbing';
    } else if (this.selectedPoint || this.selectedWall || this.hoveredPoint || this.hoveredWall) {
      return 'grab';
    }
    return 'default';
  }
}
