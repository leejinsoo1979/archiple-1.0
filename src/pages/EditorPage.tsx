import { useState } from 'react';
import FloorplanCanvas from '../floorplan/FloorplanCanvas';
import styles from './EditorPage.module.css';

type ViewMode = '2D' | '3D';

const EditorPage = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('2D');

  return (
    <div className={styles.editorContainer}>
      {/* Coohom-style unified viewport */}
      <div className={styles.viewport}>
        <FloorplanCanvas />
      </div>

      {/* Top-right view mode toggle */}
      <div className={styles.viewToggle}>
        <button
          className={viewMode === '2D' ? styles.active : ''}
          onClick={() => setViewMode('2D')}
        >
          2D
        </button>
        <button
          className={viewMode === '3D' ? styles.active : ''}
          onClick={() => setViewMode('3D')}
        >
          3D
        </button>
      </div>

      {/* Left toolbar (tools) */}
      <div className={styles.leftToolbar}>
        <div className={styles.tool} title="Wall Tool">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"/>
          </svg>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className={styles.statusBar}>
        <span>Ready to draw</span>
      </div>
    </div>
  );
};

export default EditorPage;
