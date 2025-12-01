/**
 * 2D Line segment - Pure math, no Babylon dependency
 * TODO: Add full implementation later
 */

import { Vector2 } from './Vector2';

export class Line {
  constructor(
    public start: Vector2 = new Vector2(),
    public end: Vector2 = new Vector2()
  ) {}

  // Placeholder methods - implement later
  length(): number {
    // TODO: Implement
    return 0;
  }

  midpoint(): Vector2 {
    // TODO: Implement
    return new Vector2();
  }

  direction(): Vector2 {
    // TODO: Implement
    return new Vector2();
  }

  normal(): Vector2 {
    // TODO: Implement perpendicular vector
    return new Vector2();
  }

  containsPoint(point: Vector2, tolerance?: number): boolean {
    // TODO: Implement
    return false;
  }

  intersects(other: Line): Vector2 | null {
    // TODO: Implement line-line intersection
    return null;
  }

  clone(): Line {
    return new Line(this.start.clone(), this.end.clone());
  }
}
