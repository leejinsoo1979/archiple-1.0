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
        // Scale down texture: 1 pixel = 10mm, so texture should be scaled accordingly
        // Original texture represents real-world size, scale it down for pixel display
        const scale = 0.1; // Scale factor for 2D view
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        this.woodPattern = ctx.createPattern(canvas, 'repeat');
      }
    };
    img.src = '/texture/floor/f2 diffuse.JPG';
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

    // Determine fill style
    let fillStyle: string | CanvasPattern = this.config.fillColor;
    let fillOpacity = this.config.fillOpacity;

    if (isHovered) {
      fillStyle = this.config.hoveredFillColor;
      fillOpacity = 0.5;
    } else if (isSelected) {
      fillStyle = this.config.selectedFillColor;
      fillOpacity = 0.4;
    } else if (this.woodPattern) {
      // Use wood pattern for normal rooms
      fillStyle = this.woodPattern;
      fillOpacity = 1.0;
    }

    // Draw polygon fill
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = fillOpacity;

    ctx.beginPath();
    ctx.moveTo(roomPoints[0].x, roomPoints[0].y);
    for (let i = 1; i < roomPoints.length; i++) {
      ctx.lineTo(roomPoints[i].x, roomPoints[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Draw polygon stroke
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = this.config.strokeColor;
    ctx.lineWidth = this.config.strokeWidth;
    ctx.stroke();

    ctx.restore();

    // Draw label
    if (this.config.showLabels) {
      this.renderLabel(ctx, room, roomPoints);
    }
  }

  private renderLabel(ctx: CanvasRenderingContext2D, room: Room, roomPoints: Point[]): void {
    // Calculate centroid
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
}
