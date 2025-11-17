import { BaseLayer } from './Layer';
import type { Door } from '../../../core/types/Door';
import type { Wall } from '../../../core/types/Wall';
import type { Point } from '../../../core/types/Point';

/**
 * DoorLayer - Renders doors on walls
 */
export class DoorLayer extends BaseLayer {
  private doors: Door[] = [];
  private walls: Wall[] = [];
  private points: Point[] = [];
  private previewDoor: {
    wall: Wall;
    position: number;
    width: number;
    height: number;
  } | null = null;

  constructor() {
    super(30); // Above walls
  }

  setDoors(doors: Door[]): void {
    this.doors = doors;
  }

  setWalls(walls: Wall[]): void {
    this.walls = walls;
  }

  setPoints(points: Point[]): void {
    this.points = points;
  }

  setPreview(preview: {
    wall: Wall;
    position: number;
    width: number;
    height: number;
  } | null): void {
    this.previewDoor = preview;
  }

  clearPreview(): void {
    this.previewDoor = null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    const pointMap = new Map(this.points.map(p => [p.id, p]));

    // Render placed doors
    this.doors.forEach(door => {
      const wall = this.walls.find(w => w.id === door.wallId);
      if (!wall) return;

      this.renderDoor(ctx, door, wall, pointMap, false);
    });

    // Render preview door
    if (this.previewDoor) {
      const door: Door = {
        id: 'preview',
        wallId: this.previewDoor.wall.id,
        position: this.previewDoor.position,
        width: this.previewDoor.width,
        height: this.previewDoor.height,
        swing: 'right',
        thickness: 40,
      };
      this.renderDoor(ctx, door, this.previewDoor.wall, pointMap, true);
    }
  }

  private renderDoor(
    ctx: CanvasRenderingContext2D,
    door: Door,
    wall: Wall,
    pointMap: Map<string, Point>,
    isPreview: boolean
  ): void {
    const startPoint = pointMap.get(wall.startPointId);
    const endPoint = pointMap.get(wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Calculate door position along wall
    const wallX = startPoint.x + (endPoint.x - startPoint.x) * door.position;
    const wallY = startPoint.y + (endPoint.y - startPoint.y) * door.position;

    // Calculate wall direction
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const wallAngle = Math.atan2(dy, dx);

    // Door dimensions in mm
    const doorWidth = door.width; // 900mm
    const halfWidth = doorWidth / 2;

    ctx.save();

    // Door opening endpoints
    const openingStart = {
      x: wallX - Math.cos(wallAngle) * halfWidth,
      y: wallY - Math.sin(wallAngle) * halfWidth,
    };
    const openingEnd = {
      x: wallX + Math.cos(wallAngle) * halfWidth,
      y: wallY + Math.sin(wallAngle) * halfWidth,
    };

    // Determine swing direction
    const swingDirection = door.swing === 'left' ? -1 : 1;

    // Hinge point (where door rotates)
    const hingePoint = swingDirection === 1 ? openingStart : openingEnd;

    // Draw door swing arc (90도 호) - 더 굵고 명확하게
    ctx.strokeStyle = isPreview ? '#4CAF50' : '#1976D2';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    if (isPreview) {
      ctx.globalAlpha = 0.7;
    }

    ctx.beginPath();
    // Arc showing door swing path (90 degrees)
    const arcStartAngle = swingDirection === 1 ? wallAngle : wallAngle + Math.PI;
    const arcEndAngle = arcStartAngle + (Math.PI / 2) * swingDirection;

    ctx.arc(
      hingePoint.x,
      hingePoint.y,
      doorWidth,
      arcStartAngle,
      arcEndAngle,
      swingDirection < 0
    );
    ctx.stroke();

    // Draw door slab (closed position) - 더 굵게
    ctx.strokeStyle = isPreview ? '#388E3C' : '#0D47A1';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(openingStart.x, openingStart.y);
    ctx.lineTo(openingEnd.x, openingEnd.y);
    ctx.stroke();

    // Draw hinge marker (rotation point) - 더 크게
    ctx.fillStyle = isPreview ? '#4CAF50' : '#E53935';
    ctx.beginPath();
    ctx.arc(hingePoint.x, hingePoint.y, 20, 0, Math.PI * 2);
    ctx.fill();

    // Draw opening edges (문틀 표시)
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = isPreview ? '#66BB6A' : '#42A5F5';
    ctx.lineWidth = 10;

    // Perpendicular direction for edge markers
    const perpAngle = wallAngle + Math.PI / 2;
    const edgeLength = 120; // 120mm edge marker

    // Left edge
    ctx.beginPath();
    ctx.moveTo(openingStart.x, openingStart.y);
    ctx.lineTo(
      openingStart.x + Math.cos(perpAngle) * edgeLength,
      openingStart.y + Math.sin(perpAngle) * edgeLength
    );
    ctx.stroke();

    // Right edge
    ctx.beginPath();
    ctx.moveTo(openingEnd.x, openingEnd.y);
    ctx.lineTo(
      openingEnd.x + Math.cos(perpAngle) * edgeLength,
      openingEnd.y + Math.sin(perpAngle) * edgeLength
    );
    ctx.stroke();

    ctx.restore();
  }
}
