import BabylonScene from '../viewer/BabylonScene';
import styles from './EditorPage.module.css';

const EditorPage = () => {
  return (
    <div className={styles.editorContainer}>
      {/* Left Panel: 2D Floorplan Area */}
      <div className={styles.leftPanel}>
        <div className={styles.panelTitle}>2D Floorplan</div>
        <div className={styles.placeholder}>
          2D Floorplan Editor
          <br />
          <small style={{ fontSize: '14px', color: '#666' }}>
            (Placeholder - Coming Soon)
          </small>
        </div>
      </div>

      {/* Right Panel: 3D Viewer */}
      <div className={styles.rightPanel}>
        <div className={styles.panelTitle}>3D Viewer</div>
        <BabylonScene />
      </div>
    </div>
  );
};

export default EditorPage;
