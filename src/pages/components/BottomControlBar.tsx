import React, { useState, useRef, useEffect } from 'react';
import styles from './BottomControlBar.module.css';
import {
    MdOutlineVisibility,
    MdOutlineZoomIn,
    MdOutlineZoomOut,
    MdOutlineLock,
    MdOutlineCenterFocusWeak,
    MdOutlineFullscreen,
    MdOutlineWbSunny
} from 'react-icons/md';
import { TbCube, TbVideo } from 'react-icons/tb';
import { FaCaretDown } from 'react-icons/fa';

export type DisplayStyleType = 'material' | 'white' | 'sketch' | 'transparent';

interface BottomControlBarProps {
    viewMode: '2D' | '3D';
    onViewModeChange: (mode: '2D' | '3D') => void;
    zoom?: number;
    onZoomChange?: (zoom: number) => void;
    onFitToScreen?: () => void;
    onSunSettingsClick?: () => void;
    sunPanelOpen?: boolean;
    onCameraSettingsClick?: () => void;
    cameraPanelOpen?: boolean;
    // Display Style props
    displayStyle?: DisplayStyleType;
    onDisplayStyleChange?: (style: DisplayStyleType) => void;
    wireframeMode?: boolean;
    onWireframeModeChange?: (enabled: boolean) => void;
    qualityFirst?: boolean;
    onQualityFirstChange?: (qualityFirst: boolean) => void;
    themeColor?: string;
    themeMode?: 'light' | 'dark';
}

export const BottomControlBar: React.FC<BottomControlBarProps> = ({
    viewMode,
    onViewModeChange,
    zoom = 0.5,
    onZoomChange,
    onFitToScreen,
    onSunSettingsClick,
    sunPanelOpen = false,
    onCameraSettingsClick,
    cameraPanelOpen = false,
    displayStyle = 'material',
    onDisplayStyleChange,
    wireframeMode = false,
    onWireframeModeChange,
    qualityFirst = true,
    onQualityFirstChange,
    themeColor = '#1890ff',
    themeMode = 'light'
}) => {
    const [displayStyleModalOpen, setDisplayStyleModalOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    const cssVariables = {
        '--theme-color': themeColor,
        '--theme-color-bg': `${themeColor}15`
    } as React.CSSProperties;

    // Close modal when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                setDisplayStyleModalOpen(false);
            }
        };

        if (displayStyleModalOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [displayStyleModalOpen]);

    // Keyboard shortcuts for display styles
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && onDisplayStyleChange) {
                switch (event.key) {
                    case '1':
                        event.preventDefault();
                        onDisplayStyleChange('material');
                        break;
                    case '2':
                        event.preventDefault();
                        onDisplayStyleChange('white');
                        break;
                    case '3':
                        event.preventDefault();
                        onDisplayStyleChange('sketch');
                        break;
                    case '4':
                        event.preventDefault();
                        onDisplayStyleChange('transparent');
                        break;
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onDisplayStyleChange]);

    const displayStyles: { key: DisplayStyleType; label: string; shortcut: string; image: string }[] = [
        { key: 'material', label: 'Material', shortcut: '⌘1', image: '/images/display style/Materual.png' },
        { key: 'white', label: 'White model', shortcut: '⌘2', image: '/images/display style/white model.png' },
        { key: 'sketch', label: 'Cartoon', shortcut: '⌘3', image: '/images/display style/Cartoon.png' },
        { key: 'transparent', label: 'Transparent', shortcut: '⌘4', image: '/images/display style/Transparent.png' },
    ];

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
                <div className={styles.group} style={{ position: 'relative' }} ref={modalRef}>
                    <button className={styles.btn} title="Visibility Settings">
                        <MdOutlineVisibility className={styles.iconBtn} />
                    </button>
                    <button
                        className={`${styles.btn} ${displayStyleModalOpen ? styles.active : ''}`}
                        title="Display Mode"
                        onClick={() => setDisplayStyleModalOpen(!displayStyleModalOpen)}
                    >
                        <TbCube className={styles.iconBtn} />
                    </button>

                    {/* Display Style Modal */}
                    {displayStyleModalOpen && (
                        <div className={styles.displayStyleModal}>
                            <div className={styles.modalSection}>
                                <h4 className={styles.modalTitle}>Display style</h4>
                                <div className={styles.styleGrid}>
                                    {displayStyles.map((style) => (
                                        <button
                                            key={style.key}
                                            className={`${styles.styleOption} ${displayStyle === style.key ? styles.selected : ''}`}
                                            onClick={() => {
                                                onDisplayStyleChange?.(style.key);
                                            }}
                                        >
                                            <div className={styles.stylePreview}>
                                                <img src={style.image} alt={style.label} className={styles.stylePreviewImg} />
                                                <span className={styles.shortcutBadge}>{style.shortcut}</span>
                                            </div>
                                            <span className={styles.styleLabel}>{style.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.modalDivider} />

                            <div className={styles.modalSection}>
                                <div className={styles.toggleRow}>
                                    <span className={styles.toggleLabel}>Wireframe</span>
                                    <label className={styles.toggleSwitch}>
                                        <input
                                            type="checkbox"
                                            checked={wireframeMode}
                                            onChange={(e) => onWireframeModeChange?.(e.target.checked)}
                                        />
                                        <span className={styles.toggleSlider}></span>
                                    </label>
                                </div>
                            </div>

                            <div className={styles.modalDivider} />

                            <div className={styles.modalSection}>
                                <h4 className={styles.modalTitle}>Graphics performance</h4>
                                <div className={styles.performanceButtons}>
                                    <button
                                        className={`${styles.perfBtn} ${qualityFirst ? styles.active : ''}`}
                                        onClick={() => onQualityFirstChange?.(true)}
                                    >
                                        Quality first
                                    </button>
                                    <button
                                        className={`${styles.perfBtn} ${!qualityFirst ? styles.active : ''}`}
                                        onClick={() => onQualityFirstChange?.(false)}
                                    >
                                        Performance...
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT SECTION */}
            <div className={styles.section}>
                {/* Lock (2D) / Sun Settings (3D) */}
                <div className={styles.group} style={{ position: 'relative' }}>
                    {viewMode === '2D' ? (
                        <button className={styles.btn} title="Lock View">
                            <MdOutlineLock className={styles.iconBtn} />
                        </button>
                    ) : (
                        <button
                            className={`${styles.btn} ${sunPanelOpen ? styles.active : ''}`}
                            onClick={onSunSettingsClick}
                            title="Sun Settings"
                        >
                            <MdOutlineWbSunny className={styles.iconBtn} />
                        </button>
                    )}
                </div>

                {/* Camera & Screen Controls */}
                <div className={styles.group}>
                    {viewMode === '3D' && (
                        <button
                            className={`${styles.btn} ${cameraPanelOpen ? styles.active : ''}`}
                            onClick={onCameraSettingsClick}
                            title="Camera Settings"
                        >
                            <TbVideo className={styles.iconBtn} />
                        </button>
                    )}
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
