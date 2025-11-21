import { useRef, useEffect } from 'react';
import styles from './FloorplanPreview.module.css';

interface FloorplanPreviewProps {
  floorplanData?: any;
  viewMode?: '2D' | '3D';
}

const FloorplanPreview = ({ floorplanData, viewMode = '2D' }: FloorplanPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw placeholder content based on viewMode
    if (viewMode === '3D') {
      // 3D perspective view placeholder
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(20, 40, 180, 100);

      ctx.fillStyle = '#c0c0c0';
      ctx.beginPath();
      ctx.moveTo(20, 40);
      ctx.lineTo(110, 10);
      ctx.lineTo(290, 10);
      ctx.lineTo(200, 40);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#d0d0d0';
      ctx.beginPath();
      ctx.moveTo(200, 40);
      ctx.lineTo(290, 10);
      ctx.lineTo(290, 110);
      ctx.lineTo(200, 140);
      ctx.closePath();
      ctx.fill();

      // Add text
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3D View', 110, 90);
    } else {
      // 2D top-down view placeholder
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, 160, 100);

      ctx.strokeRect(70, 30, 40, 10);
      ctx.strokeRect(140, 65, 10, 30);

      // Add text
      ctx.fillStyle = '#666';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('2D Floor Plan', 110, 90);
    }

    // If floorplanData exists, draw actual floor plan
    if (floorplanData && floorplanData.rooms) {
      // TODO: Draw actual floor plan data
      // This will be implemented based on your floorplan data structure
    }
  }, [floorplanData, viewMode]);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>Preview</span>
        <div className={styles.viewModeIndicator}>
          <span className={viewMode === '3D' ? styles.active : ''}>{viewMode}</span>
        </div>
      </div>
      <div className={styles.previewCanvas}>
        <canvas
          ref={canvasRef}
          width={220}
          height={150}
          className={styles.canvas}
        />
      </div>
    </div>
  );
};

export default FloorplanPreview;
