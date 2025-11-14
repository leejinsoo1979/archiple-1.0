import { PointId } from './Point';

/**
 * Wall connects two points and represents a physical wall in the floorplan
 */
export interface Wall {
  id: string;
  startPointId: PointId;
  endPointId: PointId;
  thickness: number;
  height: number;
  material?: string;
  isLoadBearing?: boolean;
}

export type WallId = string;

export interface WallProperties {
  thickness: number;
  height: number;
  material?: string;
  isLoadBearing?: boolean;
}
