import BabylonScene from '../viewer/BabylonScene';
import FloorplanCanvas from '../floorplan/FloorplanCanvas';
import styles from './EditorPage.module.css';

const EditorPage = () => {
  return (
    <div className={styles.editorContainer}>
      {/* Left Panel: 2D Floorplan Area */}
      <div className={styles.leftPanel}>
        <div className={styles.panelTitle}>2D Floorplan</div>
        <FloorplanCanvas />
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
