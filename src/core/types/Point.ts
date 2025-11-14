/**
 * Point represents a 2D coordinate in the floorplan
 */
export interface Point {
  id: string;
  x: number;
  y: number;
  isSnapped?: boolean;
  connectedWalls?: string[]; // Wall IDs
}

export type PointId = string;
