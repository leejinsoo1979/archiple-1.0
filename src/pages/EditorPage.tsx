import { useState } from 'react';
import FloorplanCanvas from '../floorplan/FloorplanCanvas';
import styles from './EditorPage.module.css';

type ToolCategory = 'walls' | 'door' | 'window' | 'structure';

const EditorPage = () => {
  const [activeCategory, setActiveCategory] = useState<ToolCategory>('walls');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  return (
    <div className={styles.editorContainer}>
      {/* Left Green Sidebar */}
      <div className={styles.leftSidebar}>
        <div className={styles.logo}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
          <span>ARCHIPLE STUDIO</span>
        </div>

        <div className={styles.sidebarButtons}>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z"/>
              </svg>
            </div>
            <span>Create Room</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
              </svg>
            </div>
            <span>Customize</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
              </svg>
            </div>
            <span>Model Library</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l-5.5 9h11z"/>
                <circle cx="17.5" cy="17.5" r="4.5"/>
                <path d="M3 13.5h8v8H3z"/>
              </svg>
            </div>
            <span>Mode</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10"/>
              </svg>
            </div>
            <span>My</span>
          </button>
        </div>

        <div className={styles.sidebarBottom}>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Left Tools Panel */}
      {leftPanelOpen && (
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h3>Create Room</h3>
            <button onClick={() => setLeftPanelOpen(false)}>×</button>
          </div>

          <div className={styles.createRoomOptions}>
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
              </div>
              <span>Explore</span>
            </button>
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
              </div>
              <span>Import</span>
            </button>
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
                </svg>
              </div>
              <span>RoomScaner</span>
            </button>
          </div>

          {/* Walls */}
          <div className={styles.toolSection}>
            <h4>Walls</h4>
            <div className={styles.toolGrid}>
              <button className={styles.toolBtn} title="Draw Staight Walls">
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="8" y="20" width="32" height="8" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Draw Staight Walls</span>
              </button>
              <button className={styles.toolBtn} title="Draw Arc Walls">
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 8 28 Q 24 8, 40 28" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Draw Arc Walls</span>
              </button>
              <button className={styles.toolBtn} title="Draw Rooms">
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="12" y="12" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Draw Rooms</span>
              </button>
            </div>
          </div>

          {/* Door */}
          <div className={styles.toolSection}>
            <h4>Door</h4>
            <div className={styles.toolGrid}>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="16" y="12" width="16" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <line x1="28" y1="24" x2="30" y2="24" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span>Single Door</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="12" y="12" width="12" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="24" y="12" width="12" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Double Door</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="10" y="12" width="10" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="20" y="12" width="10" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="30" y="12" width="8" height="24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Unequal Double Door</span>
              </button>
            </div>
          </div>

          {/* Window */}
          <div className={styles.toolSection}>
            <h4>Window</h4>
            <div className={styles.toolGrid}>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="14" y="18" width="20" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <line x1="24" y1="18" x2="24" y2="30" stroke="currentColor" strokeWidth="1"/>
                </svg>
                <span>Single Door</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="10" y="18" width="14" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="24" y="18" width="14" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Double Door</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="8" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="30" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Unequal Double Door</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 12 24 L 18 18 L 30 18 L 36 24 L 30 30 L 18 30 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Corner Bay Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 14 24 L 20 20 L 28 20 L 34 24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Corner Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="12" y="20" width="24" height="8" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Bay Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 16 24 Q 24 16, 32 24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Arc Window</span>
              </button>
            </div>
          </div>

          {/* Structure */}
          <div className={styles.toolSection}>
            <h4>Structure</h4>
            <div className={styles.toolGrid}>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 16 12 L 16 36 M 32 12 L 32 36" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span>Door Opening</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="16" y="20" width="16" height="8" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Flue</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="12" y="20" width="24" height="3" fill="currentColor"/>
                </svg>
                <span>Beam</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="16" y="16" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Square</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Circle</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="14" y="14" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Frame</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Toolbar */}
      <div className={styles.topToolbar}>
        <button className={styles.topBtn} title="Light">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Material">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Sun">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Ambient">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Dimensions">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Render">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Draw">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Photo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="3.2"/>
            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Target">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
            <circle cx="12" cy="12" r="5"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Layout">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="Grid">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/>
          </svg>
        </button>
        <button className={styles.topBtn} title="View">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
        </button>

        <div className={styles.playButtons}>
          <button className={styles.navBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
          </button>
          <button className={styles.navBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
          <button className={styles.playBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div className={styles.viewport}>
        <FloorplanCanvas />
      </div>

      {/* Right Settings Panel */}
      {rightPanelOpen && (
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h3>Layer Settings</h3>
            <button onClick={() => setRightPanelOpen(false)}>×</button>
          </div>

          {/* Basic Parameters */}
          <div className={styles.settingsSection}>
            <h4>Basic Parameters</h4>
            <div className={styles.settingRow}>
              <label>Total Building</label>
              <input type="text" defaultValue="0.00 ㎡" readOnly />
            </div>
          </div>

          {/* Wall Settings */}
          <div className={styles.settingsSection}>
            <h4>Wall Settings</h4>
            <div className={styles.settingRow}>
              <label>Lock Walls</label>
              <input type="checkbox" />
            </div>
            <div className={styles.settingRow}>
              <label>Wall Height</label>
              <input type="text" defaultValue="9' 3&quot;" />
            </div>
            <div className={styles.settingRow}>
              <label>Wall Thickness</label>
              <input type="text" defaultValue="9.45 in" />
            </div>
            <button className={styles.deleteBtn}>Delete All Walls</button>
          </div>

          {/* Floor Setting */}
          <div className={styles.settingsSection}>
            <h4>Floor Setting</h4>
            <div className={styles.settingRow}>
              <label>Floor Thickness</label>
              <input type="text" defaultValue="0' 4&quot;" />
            </div>
            <button className={styles.editBtn}>Edit Floor ›</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorPage;
