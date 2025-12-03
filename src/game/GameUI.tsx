/**
 * GameUI - 게임 내 HUD 컴포넌트
 *
 * Unity/Unreal 스타일의 게임 UI
 * - 크로스헤어
 * - 빌드 진행률
 * - 일시정지 메뉴
 * - 컨트롤 안내
 */

import React, { useState, useEffect } from 'react';
import { GameState, BuildProgress } from './types';
import styles from './GameUI.module.css';

interface GameUIProps {
  state: GameState;
  buildProgress?: BuildProgress;
  isPointerLocked: boolean;
  onResume: () => void;
  onStop: () => void;
  onRequestPointerLock: () => void;
}

export const GameUI: React.FC<GameUIProps> = ({
  state,
  buildProgress,
  isPointerLocked,
  onResume,
  onStop,
  onRequestPointerLock,
}) => {
  const [showControls, setShowControls] = useState(true);

  // 게임 시작 후 5초 뒤 컨트롤 안내 숨김
  useEffect(() => {
    if (state === 'playing' && isPointerLocked) {
      const timer = setTimeout(() => setShowControls(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowControls(true);
    }
  }, [state, isPointerLocked]);

  // 빌드 중 화면
  if (state === 'building') {
    return (
      <div className={styles.overlay}>
        <div className={styles.buildingScreen}>
          <div className={styles.spinner} />
          <h2 className={styles.buildTitle}>Building Game...</h2>
          {buildProgress && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${buildProgress.percent}%` }}
                />
              </div>
              <p className={styles.buildMessage}>{buildProgress.message}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // 게임 중 UI
  if (state === 'playing' || state === 'paused') {
    return (
      <>
        {/* 크로스헤어 (Pointer Lock 상태에서만) */}
        {state === 'playing' && isPointerLocked && (
          <div className={styles.crosshair}>
            <div className={styles.crosshairDot} />
          </div>
        )}

        {/* 클릭 안내 (Pointer Lock 해제 상태) */}
        {state === 'playing' && !isPointerLocked && (
          <div className={styles.clickPrompt} onClick={onRequestPointerLock}>
            <div className={styles.clickPromptContent}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
              <h3>Click to Play</h3>
              <p>Click anywhere to capture mouse</p>
            </div>
          </div>
        )}

        {/* 컨트롤 안내 */}
        {state === 'playing' && isPointerLocked && showControls && (
          <div className={styles.controlsHint}>
            <div className={styles.controlItem}>
              <span className={styles.key}>W A S D</span>
              <span>Move</span>
            </div>
            <div className={styles.controlItem}>
              <span className={styles.key}>Mouse</span>
              <span>Look</span>
            </div>
            <div className={styles.controlItem}>
              <span className={styles.key}>Shift</span>
              <span>Run</span>
            </div>
            <div className={styles.controlItem}>
              <span className={styles.key}>Space</span>
              <span>Jump</span>
            </div>
            <div className={styles.controlItem}>
              <span className={styles.key}>ESC</span>
              <span>Pause</span>
            </div>
          </div>
        )}

        {/* 일시정지 메뉴 */}
        {state === 'paused' && (
          <div className={styles.overlay}>
            <div className={styles.pauseMenu}>
              <h2 className={styles.pauseTitle}>PAUSED</h2>
              <div className={styles.pauseButtons}>
                <button className={styles.resumeBtn} onClick={onResume}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Resume
                </button>
                <button className={styles.stopBtn} onClick={onStop}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  Stop & Exit
                </button>
              </div>
              <p className={styles.pauseHint}>Press ESC or click Resume to continue</p>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default GameUI;
