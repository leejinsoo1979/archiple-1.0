import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MdClose, MdZoomIn, MdZoomOut, MdCenterFocusWeak } from 'react-icons/md';
import styles from './ElevationViewer.module.css';
import type { WallInfo, ViewDirection } from './ElevationModal';

interface Opening {
  id: string;
  type: 'door' | 'window';
  position: number; // Distance from wall start (0-1)
  width: number; // mm
  height: number; // mm
  sillHeight?: number; // mm (for windows)
}

interface ElevationViewerProps {
  wall: WallInfo;
  direction: ViewDirection;
  wallHeight: number; // mm
  floorplanData: any;
  onClose: () => void;
  themeColor?: string;
  themeMode?: 'light' | 'dark';
}

export const ElevationViewer: React.FC<ElevationViewerProps> = ({
  wall,
  direction,
  wallHeight,
  floorplanData,
  onClose,
  themeColor = '#3FAEA7',
  themeMode = 'light',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [openings, setOpenings] = useState<Opening[]>([]);

  const isDark = themeMode === 'dark';

  // Theme colors
  const colors = {
    bg: isDark ? '#1a1a1a' : '#fafafa',
    bgSecondary: isDark ? '#252525' : '#f5f5f5',
    border: isDark ? '#333333' : '#e0e0e0',
    text: isDark ? '#ffffff' : '#1a1a1a',
    textSecondary: isDark ? '#888888' : '#666666',
    grid: isDark ? '#2a2a2a' : '#e8e8e8',
    wall: isDark ? '#3a3a3a' : '#e0e0e0',
    wallOutline: isDark ? '#555555' : '#999999',
  };

  // Calculate wall length
  const wallLength = Math.sqrt(
    (wall.endPoint.x - wall.startPoint.x) ** 2 +
    (wall.endPoint.y - wall.startPoint.y) ** 2
  );

  // Extract openings (doors/windows) on this wall
  useEffect(() => {
    if (!floorplanData) return;

    const foundOpenings: Opening[] = [];

    // Find doors on this wall
    if (floorplanData.doors) {
      floorplanData.doors.forEach((door: any) => {
        if (door.wallId === wall.id) {
          foundOpenings.push({
            id: door.id,
            type: 'door',
            position: door.position || 0.5,
            width: door.width || 900,
            height: door.height || 2100,
          });
        }
      });
    }

    // Find windows on this wall
    if (floorplanData.windows) {
      floorplanData.windows.forEach((window: any) => {
        if (window.wallId === wall.id) {
          foundOpenings.push({
            id: window.id,
            type: 'window',
            position: window.position || 0.5,
            width: window.width || 1200,
            height: window.height || 1200,
            sillHeight: window.sillHeight || 900,
          });
        }
      });
    }

    setOpenings(foundOpenings);
  }, [floorplanData, wall.id]);

  // Auto-fit view
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 100;
    const containerHeight = container.clientHeight - 100;

    const scaleX = containerWidth / wallLength;
    const scaleY = containerHeight / wallHeight;
    const scale = Math.min(scaleX, scaleY) * 0.8;

    setTransform({
      x: (container.clientWidth - wallLength * scale) / 2,
      y: (container.clientHeight - wallHeight * scale) / 2,
      scale,
    });
  }, [wallLength, wallHeight]);

  // Handle zoom
  const handleZoom = useCallback((delta: number) => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale * (1 + delta * 0.1))),
    }));
  }, []);

  // Fit to screen
  const handleFit = useCallback(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth - 100;
    const containerHeight = container.clientHeight - 100;

    const scaleX = containerWidth / wallLength;
    const scaleY = containerHeight / wallHeight;
    const scale = Math.min(scaleX, scaleY) * 0.8;

    setTransform({
      x: (container.clientWidth - wallLength * scale) / 2,
      y: (container.clientHeight - wallHeight * scale) / 2,
      scale,
    });
  }, [wallLength, wallHeight]);

  // Render canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = container.clientWidth * dpr;
    canvas.height = container.clientHeight * dpr;
    canvas.style.width = `${container.clientWidth}px`;
    canvas.style.height = `${container.clientHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, container.clientWidth, container.clientHeight);

    // Draw grid
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Grid
    const gridSize = 500; // 500mm grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1 / transform.scale;

    for (let x = 0; x <= wallLength; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, wallHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= wallHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, wallHeight - y);
      ctx.lineTo(wallLength, wallHeight - y);
      ctx.stroke();
    }

    // Draw wall background
    ctx.fillStyle = colors.wall;
    ctx.fillRect(0, 0, wallLength, wallHeight);

    // Draw wall outline
    ctx.strokeStyle = colors.wallOutline;
    ctx.lineWidth = 3 / transform.scale;
    ctx.strokeRect(0, 0, wallLength, wallHeight);

    // Draw openings (doors, windows)
    openings.forEach(opening => {
      const openingX = opening.position * wallLength - opening.width / 2;
      const openingY = opening.type === 'door' ? 0 : (opening.sillHeight || 0);

      // Clear opening area
      ctx.fillStyle = colors.bg;
      ctx.fillRect(openingX, wallHeight - openingY - opening.height, opening.width, opening.height);

      // Draw opening frame
      ctx.strokeStyle = opening.type === 'door' ? '#8B4513' : '#4169E1';
      ctx.lineWidth = 4 / transform.scale;
      ctx.strokeRect(openingX, wallHeight - openingY - opening.height, opening.width, opening.height);

      // Draw window mullions if window
      if (opening.type === 'window') {
        ctx.strokeStyle = '#4169E1';
        ctx.lineWidth = 2 / transform.scale;
        // Vertical mullion
        ctx.beginPath();
        ctx.moveTo(openingX + opening.width / 2, wallHeight - openingY - opening.height);
        ctx.lineTo(openingX + opening.width / 2, wallHeight - openingY);
        ctx.stroke();
        // Horizontal mullion
        ctx.beginPath();
        ctx.moveTo(openingX, wallHeight - openingY - opening.height / 2);
        ctx.lineTo(openingX + opening.width, wallHeight - openingY - opening.height / 2);
        ctx.stroke();
      }

      // Draw door handle if door
      if (opening.type === 'door') {
        const handleX = direction === 'inside'
          ? openingX + opening.width * 0.85
          : openingX + opening.width * 0.15;
        const handleY = wallHeight - opening.height * 0.5;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(handleX, handleY, 30, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label
      ctx.fillStyle = colors.text;
      ctx.font = `${Math.max(12, 60 / transform.scale)}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(
        opening.type === 'door' ? 'Door' : 'Window',
        openingX + opening.width / 2,
        wallHeight - openingY - opening.height - 30 / transform.scale
      );
    });

    // Draw dimensions
    ctx.fillStyle = colors.textSecondary;
    ctx.font = `${Math.max(12, 80 / transform.scale)}px Arial`;
    ctx.textAlign = 'center';

    // Wall length dimension (bottom)
    ctx.fillText(
      `${(wallLength / 1000).toFixed(2)} m`,
      wallLength / 2,
      wallHeight + 60 / transform.scale
    );

    // Wall height dimension (left)
    ctx.save();
    ctx.translate(-50 / transform.scale, wallHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${(wallHeight / 1000).toFixed(2)} m`, 0, 0);
    ctx.restore();

    // Direction indicator
    ctx.fillStyle = themeColor;
    ctx.font = `bold ${Math.max(14, 100 / transform.scale)}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(
      direction === 'inside' ? 'Interior View' : 'Exterior View',
      10 / transform.scale,
      -30 / transform.scale
    );

    ctx.restore();

    // Draw floor line
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(transform.x - 30, transform.y + wallHeight * transform.scale);
    ctx.lineTo(transform.x + wallLength * transform.scale + 30, transform.y + wallHeight * transform.scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Floor label
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '12px Arial';
    ctx.fillText('Floor Level', transform.x - 30, transform.y + wallHeight * transform.scale + 18);

  }, [transform, wallLength, wallHeight, openings, direction, themeColor, colors]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    handleZoom(e.deltaY > 0 ? -1 : 1);
  }, [handleZoom]);

  return (
    <div className={styles.container} style={{ background: colors.bg }}>
      <div className={styles.header} style={{ background: colors.bgSecondary, borderColor: colors.border }}>
        <div className={styles.titleSection}>
          <h2 style={{ color: colors.text }}>Elevation View</h2>
          <span className={styles.subtitle} style={{ color: colors.textSecondary }}>
            {wall.roomName ? `${wall.roomName} - ` : ''}
            Wall {wall.id.slice(0, 8)}...
          </span>
        </div>
        <div className={styles.controls}>
          <button
            onClick={() => handleZoom(-1)}
            title="Zoom Out"
            style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
          >
            <MdZoomOut size={20} />
          </button>
          <button
            onClick={handleFit}
            title="Fit to Screen"
            style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
          >
            <MdCenterFocusWeak size={20} />
          </button>
          <button
            onClick={() => handleZoom(1)}
            title="Zoom In"
            style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
          >
            <MdZoomIn size={20} />
          </button>
          <button
            onClick={onClose}
            className={styles.closeBtn}
            title="Close"
            style={{ background: themeColor, color: '#fff' }}
          >
            <MdClose size={20} />
          </button>
        </div>
      </div>

      <div className={styles.canvasContainer} ref={containerRef}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          onWheel={handleWheel}
        />
      </div>

      <div className={styles.info} style={{ background: colors.bgSecondary, borderColor: colors.border }}>
        <div className={styles.infoItem}>
          <span className={styles.label} style={{ color: colors.textSecondary }}>Wall Length:</span>
          <span className={styles.value} style={{ color: colors.text }}>{(wallLength / 1000).toFixed(2)} m</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label} style={{ color: colors.textSecondary }}>Wall Height:</span>
          <span className={styles.value} style={{ color: colors.text }}>{(wallHeight / 1000).toFixed(2)} m</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label} style={{ color: colors.textSecondary }}>View Direction:</span>
          <span className={styles.value} style={{ color: themeColor }}>
            {direction === 'inside' ? 'Interior' : 'Exterior'}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label} style={{ color: colors.textSecondary }}>Openings:</span>
          <span className={styles.value} style={{ color: colors.text }}>
            {openings.filter(o => o.type === 'door').length} Doors, {openings.filter(o => o.type === 'window').length} Windows
          </span>
        </div>
      </div>
    </div>
  );
};

export default ElevationViewer;
