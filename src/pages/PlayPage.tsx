import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import Babylon3DCanvas from '../babylon/Babylon3DCanvas';
import styles from './PlayPage.module.css';

const PlayPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [floorplanData, setFloorplanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Override App.css styles for full-screen experience
    const root = document.getElementById('root');
    const body = document.body;
    const html = document.documentElement;

    if (root) {
      root.style.maxWidth = 'none';
      root.style.padding = '0';
      root.style.margin = '0';
      root.style.width = '100%';
      root.style.height = '100%';
    }

    body.style.margin = '0';
    body.style.padding = '0';
    body.style.width = '100%';
    body.style.height = '100%';
    body.style.overflow = 'hidden';

    html.style.width = '100%';
    html.style.height = '100%';
    html.style.overflow = 'hidden';

    // Cleanup on unmount
    return () => {
      if (root) {
        root.style.maxWidth = '';
        root.style.padding = '';
        root.style.margin = '';
        root.style.width = '';
        root.style.height = '';
      }
      body.style.margin = '';
      body.style.padding = '';
      body.style.width = '';
      body.style.height = '';
      body.style.overflow = '';
      html.style.width = '';
      html.style.height = '';
      html.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isTouchDevice = 'ontouchstart' in window;
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(isMobileDevice || (isTouchDevice && isSmallScreen));
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Load the exported project data from Firestore
    const loadProject = async () => {
      if (!projectId) {
        setError('No project ID provided');
        setLoading(false);
        return;
      }

      try {
        const projectDoc = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectDoc);

        if (!projectSnap.exists()) {
          setError('Project not found. The link may be invalid or expired.');
          setLoading(false);
          return;
        }

        const data = projectSnap.data();
        setFloorplanData(data.floorplanData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load project:', err);
        setError('Failed to load project data');
        setLoading(false);
      }
    };

    loadProject();
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
      {/* 3D Canvas - Full Screen */}
      <div className={styles.canvasContainer}>
        <Babylon3DCanvas
          floorplanData={floorplanData}
          visible={true}
          playMode={isPlaying}
        />
      </div>

      {/* Play/Stop Control */}
      <div className={styles.playControl}>
        <button
          className={`${styles.playBtn} ${isPlaying ? styles.stopBtn : ''}`}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
              </svg>
              Stop Play Mode
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Start Play Mode
            </>
          )}
        </button>
      </div>

      {/* Floating Controls Info - Only show in Play Mode */}
      {isPlaying && !isMobile && (
        <div className={styles.controlsOverlay}>
          <div className={styles.controlsInfo}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>WASD to move • Mouse to look • Double-click floor to teleport • Click doors/windows to interact</span>
          </div>
        </div>
      )}

      {/* Mobile Controls Info */}
      {isPlaying && isMobile && (
        <div className={styles.controlsOverlay}>
          <div className={styles.controlsInfo}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Touch and drag to move • Swipe to look • Tap floor to teleport • Tap doors/windows to interact</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayPage;
