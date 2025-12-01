/**
 * 2D Vector - Pure math, no Babylon dependency
 * TODO: Add full implementation later
 */

export class Vector2 {
  constructor(
    public x: number = 0,
    public y: number = 0
  ) {}

  // Placeholder methods - implement later
  static Zero(): Vector2 {
    return new Vector2(0, 0);
  }

  static Distance(a: Vector2, b: Vector2): number {
    // TODO: Implement
    return 0;
  }

  add(other: Vector2): Vector2 {
    // TODO: Implement
    return new Vector2();
  }

  subtract(other: Vector2): Vector2 {
    // TODO: Implement
    return new Vector2();
  }

  scale(factor: number): Vector2 {
    // TODO: Implement
    return new Vector2();
  }

  normalize(): Vector2 {
    // TODO: Implement
    return new Vector2();
  }

  length(): number {
    // TODO: Implement
    return 0;
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }
}
