import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Babylon3DCanvas from '../babylon/Babylon3DCanvas';
import styles from './PlayPage.module.css';

const PlayPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [floorplanData, setFloorplanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load the exported project data
    if (!projectId) {
      setError('No project ID provided');
      setLoading(false);
      return;
    }

    const storageKey = `archiple_export_${projectId}`;
    const exportedData = localStorage.getItem(storageKey);

    if (!exportedData) {
      setError('Project not found. The link may be invalid or expired.');
      setLoading(false);
      return;
    }

    try {
      const data = JSON.parse(exportedData);
      setFloorplanData(data.floorplanData);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load project:', err);
      setError('Failed to load project data');
      setLoading(false);
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Loading your 3D space...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h1 className={styles.errorTitle}>Oops!</h1>
          <p className={styles.errorMessage}>{error}</p>
          <button className={styles.homeBtn} onClick={() => window.location.href = '/'}>
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>
          </svg>
          <span className={styles.logoText}>Archiple</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.controlsInfo}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>WASD to move • Mouse to look • Click doors/windows to interact</span>
          </div>
        </div>
      </header>

      {/* 3D Canvas */}
      <div className={styles.canvasContainer}>
        <Babylon3DCanvas
          floorplanData={floorplanData}
          visible={true}
          playMode={true}
        />
      </div>
    </div>
  );
};

export default PlayPage;
