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
            <div className={styles.icon}>📁</div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>💾</div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>🔍</div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>❓</div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>⚙️</div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>👤</div>
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
              <div className={styles.optionIcon}>🏠</div>
              <span>Explore</span>
            </button>
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>📥</div>
              <span>Import</span>
            </button>
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>📱</div>
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
        <button className={styles.topBtn} title="Light">💡</button>
        <button className={styles.topBtn} title="Material">🎨</button>
        <button className={styles.topBtn} title="Sun">☀️</button>
        <button className={styles.topBtn} title="Ambient">💫</button>
        <button className={styles.topBtn} title="Dimensions">📐</button>
        <button className={styles.topBtn} title="Render">🖼️</button>
        <button className={styles.topBtn} title="Draw">✏️</button>
        <button className={styles.topBtn} title="Photo">📷</button>
        <button className={styles.topBtn} title="Target">🎯</button>
        <button className={styles.topBtn} title="Layout">⚙️</button>
        <button className={styles.topBtn} title="Grid">📊</button>
        <button className={styles.topBtn} title="View">👁️</button>

        <div className={styles.playButtons}>
          <button className={styles.navBtn}>←</button>
          <button className={styles.navBtn}>→</button>
          <button className={styles.playBtn}>▶ Play</button>
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
