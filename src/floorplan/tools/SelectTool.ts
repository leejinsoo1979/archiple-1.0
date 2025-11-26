import { BaseTool } from './Tool';
import { Vector2 } from '../../core/math/Vector2';
import type { Point } from '../../core/types/Point';
import type { Wall } from '../../core/types/Wall';
import type { Door } from '../../core/types/Door';
import { SceneManager } from '../../core/engine/SceneManager';
import { SnapService } from '../services/SnapService';
import type { SnapGuide } from '../services/SnapService';
import { eventBus } from '../../core/events/EventBus';
import { FloorEvents } from '../../core/events/FloorEvents';
import { v4 as uuidv4 } from 'uuid';

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
  private wallPointsDetached = false; // Track if wall points were detached from shared corners

  // Hover state
  private hoveredPoint: Point | null = null;
  private hoveredWall: Wall | null = null;

  // Config
  private pointSelectRadius = 200; // 200mm selection radius (easier to click)

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
      this.wallPointsDetached = false; // Reset detach flag for new wall drag

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

      // Calculate guides from connected walls
      const guides: SnapGuide[] = [];
      const connectedWallIds = this.selectedPoint.connectedWalls || [];
      const allWalls = this.sceneManager.objectManager.getAllWalls();

      connectedWallIds.forEach(wallId => {
        const wall = allWalls.find(w => w.id === wallId);
        if (wall) {
          // Find the OTHER endpoint of this wall (the one NOT being dragged)
          const otherPointId = wall.startPointId === this.selectedPoint!.id ? wall.endPointId : wall.startPointId;
          const otherPoint = allPoints.find(p => p.id === otherPointId);

          if (otherPoint) {
            const otherVec = new Vector2(otherPoint.x, otherPoint.y);

            // Calculate wall angle
            // Direction from Other -> Selected (current wall direction)
            // But we want to extend from Other.
            const dx = this.selectedPoint!.x - otherPoint.x;
            const dy = this.selectedPoint!.y - otherPoint.y;
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = (angleRad * 180) / Math.PI;

            // 1. Extension Guide (keep wall straight)
            guides.push({
              origin: otherVec,
              angle: angleDeg,
              type: 'extension'
            });

            // 2. Perpendicular Guide (90 degrees)
            guides.push({
              origin: otherVec,
              angle: angleDeg + 90,
              type: 'perpendicular'
            });
            guides.push({
              origin: otherVec,
              angle: angleDeg - 90,
              type: 'perpendicular'
            });
          }
        }
      });

      // Try snapping to guides first
      let snappedPos = position;
      const guideSnap = this.snapService.snapToGuides(position, guides);

      if (guideSnap) {
        snappedPos = guideSnap.position;
      } else {
        // Fallback to normal snap
        const snapResult = this.snapService.snap(position);
        snappedPos = snapResult.position;
      }

      // Update point using SceneManager's updatePoint method
      this.sceneManager.objectManager.updatePoint(this.selectedPoint.id, {
        x: snappedPos.x,
        y: snappedPos.y,
      });

      // Check for orthogonal alignment of connected walls and show guides
      this.updateOrthogonalGuides(snappedPos, allPoints, allWalls);
    }
    // Handle wall dragging
    else if (this.selectedWall && this.dragStartPos) {
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const allWalls = this.sceneManager.objectManager.getAllWalls();

      // Get wall's start and end points
      let startPoint = allPoints.find((p) => p.id === this.selectedWall!.startPointId);
      let endPoint = allPoints.find((p) => p.id === this.selectedWall!.endPointId);

      if (!startPoint || !endPoint) return;

      // First drag - detach shared points so only this wall moves
      // Connected walls will stretch instead of moving together
      if (!this.wallPointsDetached) {
        // Check if start point is shared with other walls
        const startConnectedWalls = allWalls.filter(
          (w) =>
            w.id !== this.selectedWall!.id &&
            (w.startPointId === startPoint!.id || w.endPointId === startPoint!.id)
        );

        // Check if end point is shared with other walls
        const endConnectedWalls = allWalls.filter(
          (w) =>
            w.id !== this.selectedWall!.id &&
            (w.startPointId === endPoint!.id || w.endPointId === endPoint!.id)
        );

        // If start point is shared, create a new point for this wall
        if (startConnectedWalls.length > 0) {
          const newStartPoint: Point = {
            id: uuidv4(),
            x: startPoint.x,
            y: startPoint.y,
          };
          const addedStartPoint = this.sceneManager.objectManager.addPoint(newStartPoint);
          this.sceneManager.objectManager.updateWall(this.selectedWall.id, {
            startPointId: addedStartPoint.id,
          });
          this.selectedWall.startPointId = addedStartPoint.id;
          startPoint = addedStartPoint;
          console.log('[SelectTool] Detached start point, new point:', addedStartPoint.id);
        }

        // If end point is shared, create a new point for this wall
        if (endConnectedWalls.length > 0) {
          const newEndPoint: Point = {
            id: uuidv4(),
            x: endPoint.x,
            y: endPoint.y,
          };
          const addedEndPoint = this.sceneManager.objectManager.addPoint(newEndPoint);
          this.sceneManager.objectManager.updateWall(this.selectedWall.id, {
            endPointId: addedEndPoint.id,
          });
          this.selectedWall.endPointId = addedEndPoint.id;
          endPoint = addedEndPoint;
          console.log('[SelectTool] Detached end point, new point:', addedEndPoint.id);
        }

        this.wallPointsDetached = true;
      }

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

      // Move only this wall's endpoints (now detached from other walls)
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

  handleMouseUp(position: Vector2, event: MouseEvent): void {
    if (!this.isDragging || event.button !== 0) return;

    // Finalize move
    this.isDragging = false;

    // Clear orthogonal guides when dragging ends
    this.clearOrthogonalGuides();

    if (this.selectedPoint) {
      // Check for nearby point to merge with
      const allPoints = this.sceneManager.objectManager.getAllPoints();
      const otherPoints = allPoints.filter((p) => p.id !== this.selectedPoint!.id);
      const nearbyPoint = this.findPointNear(position, otherPoints);

      if (nearbyPoint) {
        // Merge the dragged point into the nearby point
        const merged = this.sceneManager.objectManager.mergePoints(
          this.selectedPoint.id,
          nearbyPoint.id
        );
        if (merged) {
          console.log('[SelectTool] Points merged:', this.selectedPoint.id, '->', nearbyPoint.id);
          // Additional cleanup to ensure no duplicate walls remain
          const cleanup = this.sceneManager.objectManager.cleanupDuplicates();
          if (cleanup.points > 0 || cleanup.walls > 0) {
            console.log('[SelectTool] Cleanup after merge:', cleanup.points, 'points,', cleanup.walls, 'walls');
          }
          this.selectedPoint = null;
          return;
        }
      }

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
    let minDistance = Infinity;

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

      // Check if inside wall thickness
      // Strictly inside: distance <= wall.thickness / 2
      const threshold = wall.thickness / 2;

      if (distance <= threshold) {
        // Find the wall closest to its centerline among those we are inside
        if (distance < minDistance) {
          minDistance = distance;
          nearestWall = wall;
        }
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
    this.wallPointsDetached = false;

    // Clear selection and hover events
    eventBus.emit(FloorEvents.POINT_SELECTION_CLEARED, {});
    eventBus.emit(FloorEvents.POINT_HOVER_CLEARED, {});
    eventBus.emit(FloorEvents.WALL_HOVER_CLEARED, {});
  }

  getCursor(): string {
    if (this.isDragging) {
      if (this.selectedWall) {
        return this.getWallCursor(this.selectedWall);
      }
      return 'grabbing';
    } else if (this.hoveredWall) {
      return this.getWallCursor(this.hoveredWall);
    } else if (this.selectedPoint || this.selectedWall || this.hoveredPoint) {
      return 'grab';
    }
    return 'default';
  }

  /**
   * Get cursor based on wall angle
   */
  private getWallCursor(wall: Wall): string {
    const allPoints = this.sceneManager.objectManager.getAllPoints();
    const startPoint = allPoints.find(p => p.id === wall.startPointId);
    const endPoint = allPoints.find(p => p.id === wall.endPointId);

    if (!startPoint || !endPoint) {
      return 'ew-resize';
    }

    // Calculate wall angle in degrees
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Normalize angle to 0-180 range
    angle = Math.abs(angle);
    if (angle > 90) {
      angle = 180 - angle;
    }

    // Choose cursor based on angle
    // 0-22.5°: horizontal (ew-resize)
    // 22.5-67.5°: diagonal (nwse-resize or nesw-resize)
    // 67.5-90°: vertical (ns-resize)

    if (angle <= 22.5) {
      return 'ns-resize'; // Horizontal wall -> vertical drag
    } else if (angle >= 67.5) {
      return 'ew-resize'; // Vertical wall -> horizontal drag
    } else {
      // Diagonal wall
      // Check if it's NW-SE or NE-SW direction
      const originalAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      if ((originalAngle >= -45 && originalAngle < 45) || (originalAngle >= 135 || originalAngle < -135)) {
        return 'nwse-resize';
      } else {
        return 'nesw-resize';
      }
    }
  }

  /**
   * Check if connected walls are orthogonal (vertical/horizontal) and emit guide events
   */
  private updateOrthogonalGuides(currentPos: Vector2, allPoints: Point[], allWalls: Wall[]): void {
    if (!this.selectedPoint) return;

    const ORTHOGONAL_THRESHOLD = 5; // 5mm tolerance for orthogonal detection
    let hasVerticalGuide = false;
    let hasHorizontalGuide = false;

    // Find walls connected to this point by checking wall endpoints directly
    const connectedWalls = allWalls.filter(
      w => w.startPointId === this.selectedPoint!.id || w.endPointId === this.selectedPoint!.id
    );

    for (const wall of connectedWalls) {
      // Find the OTHER endpoint of this wall
      const otherPointId = wall.startPointId === this.selectedPoint.id ? wall.endPointId : wall.startPointId;
      const otherPoint = allPoints.find(p => p.id === otherPointId);

      if (!otherPoint) continue;

      // Calculate difference
      const dx = Math.abs(currentPos.x - otherPoint.x);
      const dy = Math.abs(currentPos.y - otherPoint.y);

      // Check for vertical wall (x coordinates are nearly equal)
      if (dx <= ORTHOGONAL_THRESHOLD && !hasVerticalGuide) {
        hasVerticalGuide = true;
        // Use the other point's x for the guide (more stable)
        const guideX = otherPoint.x;

        // Extend guide across entire canvas (large range)
        eventBus.emit(FloorEvents.VERTICAL_GUIDE_UPDATED, {
          x: guideX,
          fromY: -1000000,
          toY: 1000000
        });
      }

      // Check for horizontal wall (y coordinates are nearly equal)
      if (dy <= ORTHOGONAL_THRESHOLD && !hasHorizontalGuide) {
        hasHorizontalGuide = true;
        // Use the other point's y for the guide (more stable)
        const guideY = otherPoint.y;

        // Extend guide across entire canvas (large range)
        eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_UPDATED, {
          y: guideY,
          fromX: -1000000,
          toX: 1000000
        });
      }
    }

    // Clear guides that are no longer valid
    if (!hasVerticalGuide) {
      eventBus.emit(FloorEvents.VERTICAL_GUIDE_CLEARED, {});
    }
    if (!hasHorizontalGuide) {
      eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_CLEARED, {});
    }
  }

  /**
   * Clear orthogonal guides when dragging ends
   */
  private clearOrthogonalGuides(): void {
    eventBus.emit(FloorEvents.VERTICAL_GUIDE_CLEARED, {});
    eventBus.emit(FloorEvents.HORIZONTAL_GUIDE_CLEARED, {});
  }
}
