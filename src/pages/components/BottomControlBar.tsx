import React from 'react';
import styles from './BottomControlBar.module.css';
import {
    MdOutlineVisibility,
    MdOutlineZoomIn,
    MdOutlineZoomOut,
    MdOutlineLock,
    MdOutlineCenterFocusWeak,
    MdOutlineFullscreen
} from 'react-icons/md';
import { TbCube, TbVideo } from 'react-icons/tb';
import { FaCaretDown } from 'react-icons/fa';

interface BottomControlBarProps {
    viewMode: '2D' | '3D';
    onViewModeChange: (mode: '2D' | '3D') => void;
    zoom?: number;
    onZoomChange?: (zoom: number) => void;
    onFitToScreen?: () => void;
    themeColor?: string;
    themeMode?: 'light' | 'dark';
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
    viewMode,
    onViewModeChange,
    zoom = 0.5,
    onZoomChange,
    onFitToScreen,
    themeColor = '#1890ff',
    themeMode = 'light'
}) => {
    const cssVariables = {
        '--theme-color': themeColor,
        '--theme-color-bg': `${themeColor}15` // 15 is approx 8% opacity hex
    } as React.CSSProperties;

    return (
        <div className={styles.bottomBarContainer} style={cssVariables} data-theme={themeMode}>
            {/* LEFT SECTION */}
            <div className={styles.section}>
                {/* View Mode Switcher */}
                <div className={styles.group}>
                    <button
                        className={`${styles.btn} ${styles.viewModeBtn} ${viewMode === '2D' ? styles.active : ''}`}
                        onClick={() => onViewModeChange('2D')}
                        title="2D View"
                    >
                        2D <FaCaretDown className={styles.dropdownArrow} />
                    </button>
                    <button
                        className={`${styles.btn} ${styles.viewModeBtn} ${viewMode === '3D' ? styles.active : ''}`}
                        onClick={() => onViewModeChange('3D')}
                        title="3D View"
                    >
                        3D <FaCaretDown className={styles.dropdownArrow} />
                    </button>
                </div>

                {/* View Settings */}
                <div className={styles.group}>
                    <button className={styles.btn} title="Visibility Settings">
                        <MdOutlineVisibility className={styles.iconBtn} />
                    </button>
                    <button className={styles.btn} title="Display Mode">
                        <TbCube className={styles.iconBtn} />
                    </button>
                </div>
            </div>

            {/* RIGHT SECTION */}
            <div className={styles.section}>
                {/* Lock Control */}
                <div className={styles.group}>
                    <button className={styles.btn} title="Lock View">
                        <MdOutlineLock className={styles.iconBtn} />
                    </button>
                </div>

                {/* Camera & Screen Controls */}
                <div className={styles.group}>
                    <button className={styles.btn} title="Camera Settings">
                        <TbVideo className={styles.iconBtn} />
                    </button>
                    <button className={styles.btn} onClick={onFitToScreen} title="Fit to Screen">
                        <MdOutlineCenterFocusWeak className={styles.iconBtn} />
                    </button>
                    <div className={styles.divider} />
                    <button className={styles.btn} title="Fullscreen">
                        <MdOutlineFullscreen className={styles.iconBtn} />
                    </button>
                </div>

                {/* Zoom Controls - Moved to right section */}
                <div className={styles.group}>
                    <button
                        className={styles.btn}
                        onClick={() => onZoomChange && onZoomChange(Math.max(0, zoom - 0.1))}
                        title="Zoom Out"
                    >
                        <MdOutlineZoomOut className={styles.iconBtn} />
                    </button>
                    <div className={styles.sliderContainer}>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={zoom}
                            onChange={(e) => onZoomChange && onZoomChange(parseFloat(e.target.value))}
                            className={styles.slider}
                        />
                    </div>
                    <button
                        className={styles.btn}
                        onClick={() => onZoomChange && onZoomChange(Math.min(1, zoom + 0.1))}
                        title="Zoom In"
                    >
                        <MdOutlineZoomIn className={styles.iconBtn} />
                    </button>
                </div>
            </div>
        </div>
    );
};
