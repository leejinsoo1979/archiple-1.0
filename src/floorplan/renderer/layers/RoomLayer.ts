import { BaseLayer } from './Layer';
import type { Room } from '../../../core/types/Room';
import type { Point } from '../../../core/types/Point';

export interface RoomLayerConfig {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  selectedFillColor?: string;
  hoveredFillColor?: string;
  showLabels?: boolean;
  labelFont?: string;
  labelColor?: string;
  wallThickness?: number; // Wall thickness for floor inset calculation
}

/**
 * RoomLayer - Renders room fills
 *
 * Features:
 * - Polygon fill for closed rooms
 * - Room labels (name, area)
 * - Selection highlight
 * - Hover highlight
 */
export class RoomLayer extends BaseLayer {
  private rooms: Room[] = [];
  private points: Map<string, Point> = new Map();
  private selectedRoomIds: Set<string> = new Set();
  private hoveredRoomId: string | null = null;
  private renderStyle: 'wireframe' | 'hidden-line' | 'solid' | 'realistic' = 'solid';

  private config: Required<RoomLayerConfig>;
  private woodPattern: CanvasPattern | null = null;

  constructor(config?: RoomLayerConfig) {
    super(1); // z-index: 1 (below walls)

    this.config = {
      fillColor: config?.fillColor || '#d4a574',
      fillOpacity: config?.fillOpacity || 0.6,
      strokeColor: config?.strokeColor || '#95a5a6',
      strokeWidth: config?.strokeWidth || 1,
      selectedFillColor: config?.selectedFillColor || '#3498db',
      hoveredFillColor: config?.hoveredFillColor || '#e67e22',
      showLabels: config?.showLabels ?? true,
      labelFont: config?.labelFont || '14px Arial',
      labelColor: config?.labelColor || '#2c3e50',
      wallThickness: config?.wallThickness || 100, // 100mm default wall thickness
    };

    // Load wood texture pattern
    this.loadWoodPattern();
  }

  private loadWoodPattern(): void {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Scale texture to match real-world size
        // At initialScale 0.2 (1mm = 0.2px), texture should be scaled to match
        // Assuming texture represents ~1000mm x 1000mm real wood planks
        const scale = 1.0; // Use full texture size for realistic scale
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.woodPattern = ctx.createPattern(canvas, 'repeat');
      }
    };
    img.onerror = (e) => {
      console.error('[RoomLayer] Failed to load texture:', img.src, e);
    };
    img.src = '/texture/floor/f2%20diffuse.JPG';
  }

  setRooms(rooms: Room[]): void {
    this.rooms = rooms;
  }

  setPoints(points: Point[]): void {
    this.points.clear();
    points.forEach((p) => this.points.set(p.id, p));
  }

  setSelectedRooms(roomIds: string[]): void {
    this.selectedRoomIds = new Set(roomIds);
  }

  setHoveredRoom(roomId: string | null): void {
    this.hoveredRoomId = roomId;
  }

  setRenderStyle(style: 'wireframe' | 'hidden-line' | 'solid' | 'realistic'): void {
    this.renderStyle = style;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    this.applyOpacity(ctx);

    this.rooms.forEach((room) => {
      const isSelected = this.selectedRoomIds.has(room.id);
      const isHovered = room.id === this.hoveredRoomId;
      this.renderRoom(ctx, room, isSelected, isHovered);
    });

    this.resetOpacity(ctx);
  }

  private renderRoom(
    ctx: CanvasRenderingContext2D,
    room: Room,
    isSelected: boolean,
    isHovered: boolean
  ): void {
    const roomPoints = room.points
      .map((pointId) => this.points.get(pointId))
      .filter((p): p is Point => p !== undefined);

    if (roomPoints.length < 3) return;

    // Room points are at wall centerline - inset by half wall thickness to get inner edge
    const insetDistance = this.config.wallThickness / 2;
    const floorPoints = this.insetPolygon(roomPoints, insetDistance);

    if (floorPoints.length < 3) {
      // Fallback to original if inset fails
      return;
    }

    // Determine fill style based on render mode
    let fillStyle: string | CanvasPattern = this.config.fillColor;
    let fillOpacity = this.config.fillOpacity;

    if (isHovered) {
      fillStyle = this.config.hoveredFillColor;
      fillOpacity = 0.5;
    } else if (isSelected) {
      fillStyle = this.config.selectedFillColor;
      fillOpacity = 0.4;
    } else {
      // Apply render style for normal rooms
      switch (this.renderStyle) {
        case 'realistic':
          if (this.woodPattern) {
            fillStyle = this.woodPattern;
            fillOpacity = 1.0;
          }
          break;
        case 'solid':
          fillStyle = this.config.fillColor;
          fillOpacity = this.config.fillOpacity;
          break;
        case 'hidden-line':
          const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
          fillStyle = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';
          fillOpacity = 1.0;
          break;
        case 'wireframe':
          // No fill for wireframe mode
          fillOpacity = 0;
          break;
      }
    }

    // Draw floor polygon
    ctx.save();

    ctx.beginPath();
    ctx.moveTo(floorPoints[0].x, floorPoints[0].y);
    for (let i = 1; i < floorPoints.length; i++) {
      ctx.lineTo(floorPoints[i].x, floorPoints[i].y);
    }
    ctx.closePath();

    // Fill (if not wireframe)
    if (this.renderStyle !== 'wireframe' || isHovered || isSelected) {
      ctx.fillStyle = fillStyle;
      ctx.globalAlpha = fillOpacity;
      ctx.fill();
    }

    // Stroke
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = this.config.strokeColor;
    ctx.lineWidth = this.renderStyle === 'wireframe' ? 1.5 : this.config.strokeWidth;
    ctx.stroke();

    ctx.restore();

    // Draw label
    if (this.config.showLabels) {
      this.renderLabel(ctx, room, roomPoints);
    }
  }

  private renderLabel(ctx: CanvasRenderingContext2D, room: Room, roomPoints: Point[]): void {
    // Room points are already at the wall inner edge, use them directly
    const centroid = this.calculateCentroid(roomPoints);

    ctx.save();
    ctx.font = this.config.labelFont;
    ctx.fillStyle = this.config.labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Room name
    if (room.name) {
      ctx.fillText(room.name, centroid.x, centroid.y - 10);
    }

    // Room area
    const areaText = `${room.area.toFixed(2)} m²`;
    ctx.fillText(areaText, centroid.x, centroid.y + 10);

    ctx.restore();
  }

  private calculateCentroid(points: Point[]): { x: number; y: number } {
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );
    return {
      x: sum.x / points.length,
      y: sum.y / points.length,
    };
  }

  /**
   * Inset a polygon by moving each edge perpendicular inward by the specified distance
   */
  private insetPolygon(points: Point[], insetDistance: number): Point[] {
    if (points.length < 3) return [];

    // Calculate signed area to determine winding order
    let signedArea = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      signedArea += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    signedArea = signedArea / 2;

    // Determine inset direction based on winding order
    // Positive area = CCW, negative area = CW
    // We want to inset inward (shrink the polygon)
    const insetSign = signedArea > 0 ? 1 : -1;

    const insetPoints: Point[] = [];

    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];

      // Edge vectors
      const edge1X = curr.x - prev.x;
      const edge1Y = curr.y - prev.y;
      const edge2X = next.x - curr.x;
      const edge2Y = next.y - curr.y;

      // Edge lengths
      const len1 = Math.sqrt(edge1X * edge1X + edge1Y * edge1Y);
      const len2 = Math.sqrt(edge2X * edge2X + edge2Y * edge2Y);

      if (len1 === 0 || len2 === 0) {
        insetPoints.push({ ...curr });
        continue;
      }

      // Normalized edge vectors
      const norm1X = edge1X / len1;
      const norm1Y = edge1Y / len1;
      const norm2X = edge2X / len2;
      const norm2Y = edge2Y / len2;

      // Perpendicular vectors (90° rotation)
      // Use insetSign to ensure inward direction
      const perp1X = -norm1Y * insetSign;
      const perp1Y = norm1X * insetSign;
      const perp2X = -norm2Y * insetSign;
      const perp2Y = norm2X * insetSign;

      // Bisector
      const bisectorX = perp1X + perp2X;
      const bisectorY = perp1Y + perp2Y;
      const bisectorLen = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);

      if (bisectorLen < 0.001) {
        // Parallel edges
        insetPoints.push({
          id: curr.id,
          x: curr.x + perp1X * insetDistance,
          y: curr.y + perp1Y * insetDistance,
        });
        continue;
      }

      // Normalize and scale bisector
      const normBisectorX = bisectorX / bisectorLen;
      const normBisectorY = bisectorY / bisectorLen;

      // Calculate offset distance
      const sinHalfAngle = bisectorLen / 2;
      const offsetDist = sinHalfAngle > 0.001 ? insetDistance / sinHalfAngle : insetDistance;
      const clampedOffset = Math.min(offsetDist, insetDistance * 10);

      insetPoints.push({
        id: curr.id,
        x: curr.x + normBisectorX * clampedOffset,
        y: curr.y + normBisectorY * clampedOffset,
      });
    }

    return insetPoints;
  }
}
