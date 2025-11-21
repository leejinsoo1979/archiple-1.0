import { useEffect, useRef } from 'react';
import styles from './FloorplanPreview.module.css';

interface FloorplanPreviewProps {
  viewMode?: '2D' | '3D';
  previewContainerId: string; // ID of the container to show in preview
}

const FloorplanPreview = ({ viewMode = '2D', previewContainerId }: FloorplanPreviewProps) => {
  const previewCanvasRef = useRef<HTMLDivElement>(null);

  // Show the opposite view mode in the preview
  const previewMode = viewMode === '2D' ? '3D' : '2D';

  useEffect(() => {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) return;

    // Find the container to move
    const sourceContainer = document.getElementById(previewContainerId);
    if (!sourceContainer) return;

    // Move the container into the preview
    previewCanvas.appendChild(sourceContainer);
    sourceContainer.style.position = 'relative';
    sourceContainer.style.visibility = 'visible';
    sourceContainer.style.width = '100%';
    sourceContainer.style.height = '100%';
    sourceContainer.style.pointerEvents = 'auto'; // Enable interactions

    // Cleanup function to move it back when component unmounts or ID changes
    return () => {
      if (sourceContainer.parentElement === previewCanvas) {
        sourceContainer.style.position = 'absolute';
        sourceContainer.style.visibility = 'hidden';
        sourceContainer.style.width = '100%';
        sourceContainer.style.height = '100%';
        sourceContainer.style.pointerEvents = 'none'; // Disable interactions
        // Move back to body or original parent
        document.body.appendChild(sourceContainer);
      }
    };
  }, [previewContainerId]);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>Preview</span>
        <div className={styles.viewModeIndicator}>
          <span className={styles.active}>{previewMode}</span>
        </div>
      </div>
      <div className={styles.previewCanvas} ref={previewCanvasRef}>
        {/* The actual canvas will be moved here via DOM manipulation */}
      </div>
    </div>
  );
};

export default FloorplanPreview;
