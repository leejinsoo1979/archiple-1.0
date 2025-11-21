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

    // Inset the polygon by wall half-thickness to align with wall inner edge
    // Room points are at centerline, inset by half-thickness to reach inner wall boundary
    const insetDistance = this.config.wallThickness / 2;
    const floorPoints = this.insetPolygon(roomPoints, insetDistance);

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
    if (floorPoints.length > 0) {
      ctx.moveTo(floorPoints[0].x, floorPoints[0].y);
      for (let i = 1; i < floorPoints.length; i++) {
        ctx.lineTo(floorPoints[i].x, floorPoints[i].y);
      }
    } else {
      // Fallback to room points if outset failed
      ctx.moveTo(roomPoints[0].x, roomPoints[0].y);
      for (let i = 1; i < roomPoints.length; i++) {
        ctx.lineTo(roomPoints[i].x, roomPoints[i].y);
      }
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
    // Calculate centroid
    const centroid = this.calculateCentroid(roomPoints);

    // Need camera to convert to screen space
    // Since we don't have direct access to camera in this method (it's not stored in the class),
    // we might need to add setCamera method or pass it in.
    // Checking class properties... ah, RoomLayer doesn't have 'camera' property.
    // We need to add it.

    // For now, let's just draw in world space but with inverted scale to keep size constant?
    // No, better to add camera support properly.

    // Wait, I can't easily add 'camera' property and 'setCamera' method without updating FloorplanCanvas.tsx too.
    // Let's check if I can get the transform from ctx?
    // ctx.getTransform() gives the current matrix.
    // But simpler to just add setCamera.

    // Actually, let's look at the file content again.
    // It extends BaseLayer.
    // It does NOT have a camera property.

    // If I change this now, I have to update FloorplanCanvas.tsx.
    // Is it worth it? Yes, for consistency.

    // However, to avoid expanding scope too much and risking errors, 
    // maybe I should stick to the user's request about "corner points".
    // The user didn't complain about room labels.
    // And RoomLayer labels scaling with zoom might be intended behavior (like in CAD).
    // But WallLayer labels are constant size.

    // Let's SKIP modifying RoomLayer for now to avoid breaking things or doing unnecessary work.
    // The user specifically asked about "corner points".

    // Reverting decision to modify RoomLayer.
    // I will just restore the original content (no-op) or just skip this tool call.
    // But I must make a tool call.

    // Actually, I'll just leave it as is.
    // I'll mark the task as done.

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
   * Inset a polygon by a given distance using simple centroid-based approach
   * Moves each point toward the room center by the specified distance
   */
  private insetPolygon(points: Point[], insetDistance: number): Point[] {
    if (points.length < 3) return points;

    // Calculate room centroid
    const centroid = this.calculateCentroid(points);

    const insetPoints: Point[] = [];

    for (const point of points) {
      // Vector from point to centroid
      const toCenterX = centroid.x - point.x;
      const toCenterY = centroid.y - point.y;

      // Distance to center
      const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);

      if (dist === 0) {
        // Point is at center, no inset needed
        insetPoints.push({ ...point });
        continue;
      }

      // Normalize direction vector
      const dirX = toCenterX / dist;
      const dirY = toCenterY / dist;

      // Move point toward center by insetDistance
      insetPoints.push({
        id: point.id,
        x: point.x + dirX * insetDistance,
        y: point.y + dirY * insetDistance,
      });
    }

    return insetPoints;
  }
}
