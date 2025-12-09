import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './Mini3DPreview.module.css';
import type { Babylon3DCanvasRef } from '../../babylon/Babylon3DCanvas';

interface Mini3DPreviewProps {
  floorplanData?: {
    points: any[];
    walls: any[];
    rooms: any[];
    doors?: any[];
    windows?: any[];
  } | null;
  rooms?: { id: string; name: string; area: number }[];
  selectedRoomId?: string | null;
  onRoomSelect?: (roomId: string | null) => void;
  themeColor?: string;
  height?: number;
  onHeightChange?: (height: number) => void;
  viewMode?: '2D' | '3D'; // Current main view mode
  babylon3DCanvasRef?: React.RefObject<Babylon3DCanvasRef | null>;
  floorplanCanvas?: HTMLCanvasElement | null; // Reference to the main FloorplanCanvas
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 400;
const DEFAULT_HEIGHT = 200;

const Mini3DPreview: React.FC<Mini3DPreviewProps> = ({
  rooms = [],
  selectedRoomId,
  onRoomSelect,
  themeColor = '#3FAEA7',
  height = DEFAULT_HEIGHT,
  onHeightChange,
  viewMode = '2D',
  babylon3DCanvasRef,
  floorplanCanvas,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvas3DRef = useRef<HTMLCanvasElement>(null);
  const canvas2DRef = useRef<HTMLCanvasElement>(null);

  // Preview mode is opposite of main view mode
  const previewMode = viewMode === '2D' ? '3d' : '2d';

  const [activeTab, setActiveTab] = useState<'preview' | 'rooms'>('preview');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [is3DInitialized, setIs3DInitialized] = useState(false);
  const [is2DInitialized, setIs2DInitialized] = useState(false);

  // 2D preview state
  const transform2DRef = useRef({ offsetX: 0, offsetY: 0, scale: 1 });
  const dragging2DRef = useRef(false);
  const lastMouse2DRef = useRef({ x: 0, y: 0 });

  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(height);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  }, [height]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startHeightRef.current + deltaY));
      onHeightChange?.(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onHeightChange]);

  // Initialize 3D preview by copying from main Babylon canvas
  // Note: Using canvas copy instead of registerView because registerView doesn't work
  // when the main canvas container has visibility:hidden or opacity:0
  useEffect(() => {
    if (isCollapsed || activeTab !== 'preview' || previewMode !== '3d') return;
    if (!canvas3DRef.current || !babylon3DCanvasRef || !containerRef.current) return;

    const canvas = canvas3DRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isCleanedUp = false;

    const setupAndDraw = () => {
      if (isCleanedUp) return;

      const refCurrent = babylon3DCanvasRef?.current;
      if (!refCurrent) {
        animationFrameId = requestAnimationFrame(setupAndDraw);
        return;
      }

      const mainCanvas = refCurrent.getCanvas();
      if (!mainCanvas || mainCanvas.width === 0 || mainCanvas.height === 0) {
        animationFrameId = requestAnimationFrame(setupAndDraw);
        return;
      }

      // Set preview canvas size
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || height <= 0) {
        animationFrameId = requestAnimationFrame(setupAndDraw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;

      // Mark as initialized
      if (!is3DInitialized) {
        setIs3DInitialized(true);
      }

      // Draw main Babylon canvas content to preview
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate aspect-fit scaling
      const srcAspect = mainCanvas.width / mainCanvas.height;
      const dstAspect = canvas.width / canvas.height;

      let drawWidth, drawHeight, drawX, drawY;
      if (srcAspect > dstAspect) {
        // Source is wider - fit to width
        drawWidth = canvas.width;
        drawHeight = canvas.width / srcAspect;
        drawX = 0;
        drawY = (canvas.height - drawHeight) / 2;
      } else {
        // Source is taller - fit to height
        drawHeight = canvas.height;
        drawWidth = canvas.height * srcAspect;
        drawX = (canvas.width - drawWidth) / 2;
        drawY = 0;
      }

      try {
        ctx.drawImage(mainCanvas, drawX, drawY, drawWidth, drawHeight);
      } catch {
        // Canvas might be tainted or not ready, ignore
      }

      // Continue animation loop
      animationFrameId = requestAnimationFrame(setupAndDraw);
    };

    setupAndDraw();

    return () => {
      isCleanedUp = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      setIs3DInitialized(false);
    };
  }, [isCollapsed, activeTab, previewMode, babylon3DCanvasRef, height, is3DInitialized]);

  // Initialize 2D preview canvas
  useEffect(() => {
    if (isCollapsed || activeTab !== 'preview' || previewMode !== '2d') return;
    if (!canvas2DRef.current || !containerRef.current) return;

    const canvas = canvas2DRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const setupCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;

      // Auto-fit source canvas to preview
      const previewWidth = rect.width;
      const previewHeight = height;

      if (floorplanCanvas && floorplanCanvas.width > 0 && floorplanCanvas.height > 0) {
        // Source canvas logical dimensions
        const srcWidth = floorplanCanvas.width / dpr;
        const srcHeight = floorplanCanvas.height / dpr;

        // Calculate scale to fit source into preview with padding
        const padding = 10;
        const scaleX = (previewWidth - padding * 2) / srcWidth;
        const scaleY = (previewHeight - padding * 2) / srcHeight;
        const scale = Math.min(scaleX, scaleY);

        // Center the source canvas
        transform2DRef.current = {
          offsetX: (previewWidth - srcWidth * scale) / 2,
          offsetY: (previewHeight - srcHeight * scale) / 2,
          scale: scale,
        };
      } else {
        // Default transform (1:1 scale, centered)
        transform2DRef.current = {
          offsetX: 0,
          offsetY: 0,
          scale: 1,
        };
      }
    };

    setupCanvas();
    setIs2DInitialized(true);

    const resizeObserver = new ResizeObserver(setupCanvas);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      setIs2DInitialized(false);
    };
  }, [isCollapsed, activeTab, previewMode, floorplanCanvas, height]);

  // Draw 2D preview - mirror the main FloorplanCanvas with pan/zoom
  useEffect(() => {
    if (!is2DInitialized || previewMode !== '2d' || !canvas2DRef.current) return;

    const canvas = canvas2DRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;

      // Clear with background
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fill background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // If we have the main FloorplanCanvas, draw it with transform
      if (floorplanCanvas && floorplanCanvas.width > 0 && floorplanCanvas.height > 0) {
        const { offsetX, offsetY, scale } = transform2DRef.current;

        ctx.save();
        // Apply DPR scaling first
        ctx.scale(dpr, dpr);
        // Then apply user transform (pan/zoom)
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // Draw the source canvas at origin (transform will position it)
        // Source canvas is in physical pixels, we draw it at its logical size
        const srcLogicalWidth = floorplanCanvas.width / dpr;
        const srcLogicalHeight = floorplanCanvas.height / dpr;
        ctx.drawImage(floorplanCanvas, 0, 0, srcLogicalWidth, srcLogicalHeight);

        ctx.restore();
      } else {
        // Fallback: show loading state
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#999';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('2D 캔버스 로딩 중...', canvas.width / dpr / 2, canvas.height / dpr / 2);
      }
    };

    draw();
    // Update preview at 30fps to mirror main canvas changes
    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);

  }, [is2DInitialized, previewMode, floorplanCanvas]);

  // 2D preview mouse interactions
  useEffect(() => {
    if (previewMode !== '2d' || !canvas2DRef.current) return;

    const canvas = canvas2DRef.current;

    const handleMouseDown = (e: MouseEvent) => {
      dragging2DRef.current = true;
      lastMouse2DRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging2DRef.current) return;

      const dx = e.clientX - lastMouse2DRef.current.x;
      const dy = e.clientY - lastMouse2DRef.current.y;
      lastMouse2DRef.current = { x: e.clientX, y: e.clientY };

      transform2DRef.current.offsetX += dx;
      transform2DRef.current.offsetY += dy;
    };

    const handleMouseUp = () => {
      dragging2DRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const { offsetX, offsetY, scale } = transform2DRef.current;

      const worldX = (mouseX - offsetX) / scale;
      const worldY = (mouseY - offsetY) / scale;

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.0001, Math.min(1, scale * zoomFactor));

      transform2DRef.current = {
        offsetX: mouseX - worldX * newScale,
        offsetY: mouseY - worldY * newScale,
        scale: newScale,
      };
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [previewMode]);

  // Note: 3D preview interactions removed - now using canvas copy from main Babylon canvas
  // The preview is read-only, showing what the main 3D view displays

  return (
    <div className={styles.container}>
      {/* Header with collapse toggle */}
      <div className={styles.header}>
        <span className={styles.title}>미리보기</span>
        <button
          className={styles.collapseBtn}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? '펼치기' : '접기'}
        >
          {isCollapsed ? '▼' : '▲'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* Tabs */}
          <div className={styles.tabHeader}>
            <button
              className={`${styles.tab} ${activeTab === 'preview' ? styles.active : ''}`}
              onClick={() => setActiveTab('preview')}
              style={activeTab === 'preview' ? { color: themeColor, borderBottomColor: themeColor } : {}}
            >
              {previewMode === '3d' ? '3D view' : '2D view'}
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'rooms' ? styles.active : ''}`}
              onClick={() => setActiveTab('rooms')}
              style={activeTab === 'rooms' ? { color: themeColor, borderBottomColor: themeColor } : {}}
            >
              Select room
            </button>
          </div>

          {/* Content */}
          {activeTab === 'preview' ? (
            <div ref={containerRef} className={styles.canvasContainer} style={{ height: `${height}px` }}>
              {/* 3D Canvas (shared scene via registerView) */}
              <canvas
                ref={canvas3DRef}
                className={styles.previewCanvas}
                tabIndex={0}
                onPointerDown={(e) => {
                  // Focus canvas and ensure camera receives input
                  e.currentTarget.focus();
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  display: previewMode === '3d' ? 'block' : 'none',
                  cursor: 'grab',
                  outline: 'none',
                }}
              />
              {/* 2D Canvas */}
              <canvas
                ref={canvas2DRef}
                className={styles.previewCanvas}
                style={{
                  width: '100%',
                  height: '100%',
                  display: previewMode === '2d' ? 'block' : 'none',
                  cursor: 'grab',
                }}
              />
              {previewMode === '3d' && !is3DInitialized && (
                <div className={styles.emptyState}>3D 뷰를 불러오는 중...</div>
              )}
              {previewMode === '2d' && !is2DInitialized && (
                <div className={styles.emptyState}>2D 뷰를 불러오는 중...</div>
              )}
            </div>
          ) : (
            <div className={styles.roomList} style={{ height: `${height}px` }}>
              {rooms.length === 0 ? (
                <div className={styles.emptyState}>No rooms available</div>
              ) : (
                rooms.map((room) => (
                  <button
                    key={room.id}
                    className={`${styles.roomItem} ${selectedRoomId === room.id ? styles.selected : ''}`}
                    onClick={() => onRoomSelect?.(selectedRoomId === room.id ? null : room.id)}
                    style={selectedRoomId === room.id ? { borderColor: themeColor, backgroundColor: `${themeColor}15` } : {}}
                  >
                    <span className={styles.roomName}>{room.name || 'Unnamed'}</span>
                    <span className={styles.roomArea}>{room.area.toFixed(1)} m²</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Resize Handle */}
          <div
            className={`${styles.resizeHandle} ${isResizing ? styles.resizing : ''}`}
            onMouseDown={handleResizeStart}
            title="드래그하여 크기 조절"
          >
            <div className={styles.resizeGrip} />
          </div>
        </>
      )}
    </div>
  );
};

export default Mini3DPreview;
