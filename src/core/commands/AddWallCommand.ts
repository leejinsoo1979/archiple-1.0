import { Command } from './Command';
import type { Wall } from '../types/Wall';
import type { Point } from '../types/Point';
import type { BlueprintObjectManager } from '../engine/BlueprintObjectManager';

/**
 * AddWallCommand - Command to add a wall to the floorplan
 */
export class AddWallCommand extends Command {
  private wall: Wall;
  private startPoint: Point;
  private endPoint: Point;
  private objectManager: BlueprintObjectManager;

  constructor(
    wall: Wall,
    startPoint: Point,
    endPoint: Point,
    objectManager: BlueprintObjectManager
  ) {
    super();
    this.wall = wall;
    this.startPoint = startPoint;
    this.endPoint = endPoint;
    this.objectManager = objectManager;
  }

  execute(): void {
    if (!this.canExecute()) return;

    // Add points and wall through objectManager
    this.objectManager.addPoint(this.startPoint);
    this.objectManager.addPoint(this.endPoint);
    this.objectManager.addWall(this.wall);

    this.markExecuted();
  }

  undo(): void {
    if (!this.canUndo()) return;

    // Remove wall
    this.objectManager.removeWall(this.wall.id);

    // Note: Points will be cleaned up by objectManager if they have no connections

    this.markUndone();
  }

  getDescription(): string {
    return `Add wall from (${this.startPoint.x}, ${this.startPoint.y}) to (${this.endPoint.x}, ${this.endPoint.y})`;
  }
}
