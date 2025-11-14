import { Command } from './Command';
import { Wall } from '../types/Wall';
import { Point } from '../types/Point';

/**
 * AddWallCommand - Command to add a wall to the floorplan
 */
export class AddWallCommand extends Command {
  private wall: Wall;
  private startPoint: Point;
  private endPoint: Point;
  private wallsMap: Map<string, Wall>;
  private pointsMap: Map<string, Point>;

  constructor(
    wall: Wall,
    startPoint: Point,
    endPoint: Point,
    wallsMap: Map<string, Wall>,
    pointsMap: Map<string, Point>
  ) {
    super();
    this.wall = wall;
    this.startPoint = startPoint;
    this.endPoint = endPoint;
    this.wallsMap = wallsMap;
    this.pointsMap = pointsMap;
  }

  execute(): void {
    if (!this.canExecute()) return;

    // Add points if they don't exist
    if (!this.pointsMap.has(this.startPoint.id)) {
      this.pointsMap.set(this.startPoint.id, this.startPoint);
    }
    if (!this.pointsMap.has(this.endPoint.id)) {
      this.pointsMap.set(this.endPoint.id, this.endPoint);
    }

    // Add wall
    this.wallsMap.set(this.wall.id, this.wall);

    // Update point connections
    this.addWallToPoint(this.startPoint.id, this.wall.id);
    this.addWallToPoint(this.endPoint.id, this.wall.id);

    this.markExecuted();
  }

  undo(): void {
    if (!this.canUndo()) return;

    // Remove wall
    this.wallsMap.delete(this.wall.id);

    // Update point connections
    this.removeWallFromPoint(this.startPoint.id, this.wall.id);
    this.removeWallFromPoint(this.endPoint.id, this.wall.id);

    // Remove points if they have no connections
    this.cleanupPoint(this.startPoint.id);
    this.cleanupPoint(this.endPoint.id);

    this.markUndone();
  }

  getDescription(): string {
    return `Add wall from (${this.startPoint.x}, ${this.startPoint.y}) to (${this.endPoint.x}, ${this.endPoint.y})`;
  }

  private addWallToPoint(pointId: string, wallId: string): void {
    const point = this.pointsMap.get(pointId);
    if (point) {
      if (!point.connectedWalls) {
        point.connectedWalls = [];
      }
      if (!point.connectedWalls.includes(wallId)) {
        point.connectedWalls.push(wallId);
      }
    }
  }

  private removeWallFromPoint(pointId: string, wallId: string): void {
    const point = this.pointsMap.get(pointId);
    if (point && point.connectedWalls) {
      point.connectedWalls = point.connectedWalls.filter(id => id !== wallId);
    }
  }

  private cleanupPoint(pointId: string): void {
    const point = this.pointsMap.get(pointId);
    if (point && (!point.connectedWalls || point.connectedWalls.length === 0)) {
      this.pointsMap.delete(pointId);
    }
  }
}
