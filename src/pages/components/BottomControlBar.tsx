import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
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
export type View2DType = 'floor' | 'ceiling' | 'elevation';

// 3D Visibility settings interface
export interface View3DVisibility {
    showHidden: boolean;
    ceiling: boolean;
    furniture: boolean;
    customProduct: boolean;
    dimensionLine: boolean;
    wall: boolean;
    modeling: boolean;
}

// 2D Visibility settings interface
export interface View2DVisibility {
    showHidden: boolean;
    roomName: boolean;
    area: boolean;
    modeling: boolean;
    protrudingValue: boolean;
    wallStyle: boolean;
}

// Ref interface for external control
export interface BottomControlBarRef {
    closeAllModals: () => void;
}

interface BottomControlBarProps {
    viewMode: '2D' | '3D';
    onViewModeChange: (mode: '2D' | '3D') => void;
    view2DType?: View2DType;
    onView2DTypeChange?: (type: View2DType) => void;
    floorLevel?: number;
    ceilingLevel?: number;
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
    // 3D Visibility props
    view3DVisibility?: View3DVisibility;
    onView3DVisibilityChange?: (visibility: View3DVisibility) => void;
    // 2D Visibility props
    view2DVisibility?: View2DVisibility;
    onView2DVisibilityChange?: (visibility: View2DVisibility) => void;
}

export const BottomControlBar = forwardRef<BottomControlBarRef, BottomControlBarProps>(({
    viewMode,
    onViewModeChange,
    view2DType = 'floor',
    onView2DTypeChange,
    floorLevel = 1,
    ceilingLevel = 2,
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
    themeMode = 'light',
    view3DVisibility = {
        showHidden: false,
        ceiling: true,
        furniture: true,
        customProduct: true,
        dimensionLine: true,
        wall: false,
        modeling: true
    },
    onView3DVisibilityChange,
    view2DVisibility = {
        showHidden: false,
        roomName: true,
        area: true,
        modeling: false,
        protrudingValue: true,
        wallStyle: true
    },
    onView2DVisibilityChange
}, ref) => {
    const [displayStyleModalOpen, setDisplayStyleModalOpen] = useState(false);
    const [view2DModalOpen, setView2DModalOpen] = useState(false);
    const [view3DModalOpen, setView3DModalOpen] = useState(false);
    const [view2DVisibilityModalOpen, setView2DVisibilityModalOpen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    const view2DModalRef = useRef<HTMLDivElement>(null);
    const view3DModalRef = useRef<HTMLDivElement>(null);
    const view2DVisibilityModalRef = useRef<HTMLDivElement>(null);
    const sunBtnRef = useRef<HTMLButtonElement>(null);
    const cameraBtnRef = useRef<HTMLButtonElement>(null);

    // Expose closeAllModals method to parent via ref
    useImperativeHandle(ref, () => ({
        closeAllModals: () => {
            setDisplayStyleModalOpen(false);
            setView2DModalOpen(false);
            setView3DModalOpen(false);
            setView2DVisibilityModalOpen(false);
            if (sunPanelOpen) onSunSettingsClick?.();
            if (cameraPanelOpen) onCameraSettingsClick?.();
        }
    }), [sunPanelOpen, cameraPanelOpen, onSunSettingsClick, onCameraSettingsClick]);

    const cssVariables = {
        '--theme-color': themeColor,
        '--theme-color-bg': `${themeColor}15`
    } as React.CSSProperties;

    // Close all modals when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;

            // Check if click is outside display style modal
            if (displayStyleModalOpen && modalRef.current && !modalRef.current.contains(target)) {
                setDisplayStyleModalOpen(false);
            }

            // Check if click is outside 2D view modal
            if (view2DModalOpen && view2DModalRef.current && !view2DModalRef.current.contains(target)) {
                setView2DModalOpen(false);
            }

            // Check if click is outside 3D view modal
            if (view3DModalOpen && view3DModalRef.current && !view3DModalRef.current.contains(target)) {
                setView3DModalOpen(false);
            }

            // Check if click is outside 2D visibility modal
            if (view2DVisibilityModalOpen && view2DVisibilityModalRef.current && !view2DVisibilityModalRef.current.contains(target)) {
                setView2DVisibilityModalOpen(false);
            }

            // Check if click is outside sun button (for sun panel)
            if (sunPanelOpen && sunBtnRef.current && !sunBtnRef.current.contains(target)) {
                const sunPanel = document.querySelector('[class*="sunPanel"], [class*="SunPanel"]');
                if (!sunPanel || !sunPanel.contains(target)) {
                    onSunSettingsClick?.();
                }
            }

            // Check if click is outside camera button (for camera panel)
            if (cameraPanelOpen && cameraBtnRef.current && !cameraBtnRef.current.contains(target)) {
                const cameraPanel = document.querySelector('[class*="cameraPanel"], [class*="CameraPanel"], [class*="cameraSettings"], [class*="CameraSettings"]');
                if (!cameraPanel || !cameraPanel.contains(target)) {
                    onCameraSettingsClick?.();
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [displayStyleModalOpen, view2DModalOpen, view3DModalOpen, view2DVisibilityModalOpen, sunPanelOpen, cameraPanelOpen, onSunSettingsClick, onCameraSettingsClick]);

    // Close other modals when opening one (mutual exclusion)
    const handle2DClick = () => {
        setDisplayStyleModalOpen(false);
        setView3DModalOpen(false);
        if (sunPanelOpen) onSunSettingsClick?.();
        if (cameraPanelOpen) onCameraSettingsClick?.();
        if (viewMode === '2D') {
            setView2DModalOpen(!view2DModalOpen);
        } else {
            onViewModeChange('2D');
        }
    };

    const _handle3DClick = () => {
        setDisplayStyleModalOpen(false);
        setView2DModalOpen(false);
        if (sunPanelOpen) onSunSettingsClick?.();
        if (cameraPanelOpen) onCameraSettingsClick?.();
        if (viewMode === '3D') {
            setView3DModalOpen(!view3DModalOpen);
        } else {
            onViewModeChange('3D');
        }
    };

    const handleDisplayStyleClick = () => {
        setView2DModalOpen(false);
        setView3DModalOpen(false);
        if (sunPanelOpen) onSunSettingsClick?.();
        if (cameraPanelOpen) onCameraSettingsClick?.();
        setDisplayStyleModalOpen(!displayStyleModalOpen);
    };

    const handleSunClick = () => {
        setDisplayStyleModalOpen(false);
        setView2DModalOpen(false);
        setView3DModalOpen(false);
        if (cameraPanelOpen) onCameraSettingsClick?.();
        onSunSettingsClick?.();
    };

    const handleCameraClick = () => {
        setDisplayStyleModalOpen(false);
        setView2DModalOpen(false);
        setView3DModalOpen(false);
        if (sunPanelOpen) onSunSettingsClick?.();
        onCameraSettingsClick?.();
    };

    // Helper to update 3D visibility
    const updateVisibility = (key: keyof View3DVisibility, value: boolean) => {
        onView3DVisibilityChange?.({
            ...view3DVisibility,
            [key]: value
        });
    };

    const update2DVisibility = (key: keyof View2DVisibility, value: boolean) => {
        onView2DVisibilityChange?.({
            ...view2DVisibility,
            [key]: value
        });
    };

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

    // Check if any internal modal is open
    const anyModalOpen = displayStyleModalOpen || view2DModalOpen || view3DModalOpen || view2DVisibilityModalOpen;

    return (
        <>
            {/* Overlay to close all modals when clicking background */}
            {anyModalOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 98,
                        background: 'transparent',
                    }}
                    onClick={() => {
                        setDisplayStyleModalOpen(false);
                        setView2DModalOpen(false);
                        setView3DModalOpen(false);
                        setView2DVisibilityModalOpen(false);
                    }}
                />
            )}
            <div className={styles.bottomBarContainer} style={cssVariables} data-theme={themeMode}>
            {/* LEFT SECTION */}
            <div className={styles.section}>
                {/* View Mode Switcher */}
                <div className={styles.group} style={{ position: 'relative' }}>
                    {/* 2D Button with dropdown */}
                    <div style={{ position: 'relative' }} ref={view2DModalRef}>
                        <button
                            className={`${styles.btn} ${styles.viewModeBtn} ${viewMode === '2D' ? styles.active : ''}`}
                            onClick={handle2DClick}
                            title="2D View"
                        >
                            2D <FaCaretDown className={styles.dropdownArrow} />
                        </button>
                        {/* 2D View Type Modal */}
                        {view2DModalOpen && (
                            <div className={styles.view2DModal}>
                                <button
                                    className={`${styles.view2DOption} ${view2DType === 'floor' ? styles.selected : ''}`}
                                    onClick={() => {
                                        onView2DTypeChange?.('floor');
                                        setView2DModalOpen(false);
                                    }}
                                >
                                    <span>Floor</span>
                                    <span className={styles.levelNumber}>{floorLevel}</span>
                                </button>
                                <button
                                    className={`${styles.view2DOption} ${view2DType === 'ceiling' ? styles.selected : ''}`}
                                    onClick={() => {
                                        onView2DTypeChange?.('ceiling');
                                        setView2DModalOpen(false);
                                    }}
                                >
                                    <span>Ceiling</span>
                                    <span className={styles.levelNumber}>{ceilingLevel}</span>
                                </button>
                                <button
                                    className={`${styles.view2DOption} ${view2DType === 'elevation' ? styles.selected : ''}`}
                                    onClick={() => {
                                        onView2DTypeChange?.('elevation');
                                        setView2DModalOpen(false);
                                    }}
                                >
                                    <span className={styles.elevationText}>Elevation</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 3D Button - simple mode switch */}
                    <button
                        className={`${styles.btn} ${styles.viewModeBtn} ${viewMode === '3D' ? styles.active : ''}`}
                        onClick={() => {
                            setView2DModalOpen(false);
                            onViewModeChange('3D');
                        }}
                        title="3D View"
                    >
                        3D
                    </button>
                </div>

                {/* View Settings */}
                <div className={styles.group} style={{ position: 'relative' }}>
                    {/* 2D Visibility Settings Button with Modal */}
                    {viewMode === '2D' && (
                        <div style={{ position: 'relative' }} ref={view2DVisibilityModalRef}>
                            <button
                                className={`${styles.btn} ${view2DVisibilityModalOpen ? styles.active : ''}`}
                                onClick={() => {
                                    setDisplayStyleModalOpen(false);
                                    setView2DModalOpen(false);
                                    setView3DModalOpen(false);
                                    if (sunPanelOpen) onSunSettingsClick?.();
                                    if (cameraPanelOpen) onCameraSettingsClick?.();
                                    setView2DVisibilityModalOpen(!view2DVisibilityModalOpen);
                                }}
                                title="2D Visibility Settings"
                            >
                                <MdOutlineVisibility className={styles.iconBtn} />
                            </button>

                            {/* 2D Visibility Modal */}
                            {view2DVisibilityModalOpen && (
                                <div className={styles.view3DModal}>
                                    {/* Show hidden toggle with icon */}
                                    <div className={styles.view3DToggleRow}>
                                        <span>Show hidden</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>┬H</span>
                                            <label className={styles.toggleSwitch}>
                                                <input
                                                    type="checkbox"
                                                    checked={view2DVisibility.showHidden}
                                                    onChange={(e) => update2DVisibility('showHidden', e.target.checked)}
                                                />
                                                <span className={styles.toggleSlider}></span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className={styles.view3DDivider} />

                                    {/* Menu items with submenu arrows */}
                                    <button className={styles.view3DOption}>
                                        <span>Ceiling</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>Structural Components</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>Furniture</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>Custom product</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>2D distance</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>

                                    <div className={styles.view3DDivider} />

                                    {/* Checkbox items */}
                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view2DVisibility.roomName}
                                            onChange={(e) => update2DVisibility('roomName', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Room Name</span>
                                    </label>
                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view2DVisibility.area}
                                            onChange={(e) => update2DVisibility('area', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Area</span>
                                    </label>

                                    <div className={styles.view3DDivider} />

                                    <button className={styles.view3DOption}>
                                        <span>Wall Location Lines</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>

                                    <div className={styles.view3DDivider} />

                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view2DVisibility.modeling}
                                            onChange={(e) => update2DVisibility('modeling', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Modeling</span>
                                    </label>

                                    <div className={styles.view3DDivider} />

                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view2DVisibility.protrudingValue}
                                            onChange={(e) => update2DVisibility('protrudingValue', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Protruding value</span>
                                    </label>

                                    <div className={styles.view3DDivider} />

                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view2DVisibility.wallStyle}
                                            onChange={(e) => update2DVisibility('wallStyle', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Wall style</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3D Visibility Settings Button with Modal */}
                    {viewMode === '3D' && (
                        <div style={{ position: 'relative' }} ref={view3DModalRef}>
                            <button
                                className={`${styles.btn} ${view3DModalOpen ? styles.active : ''}`}
                                onClick={() => {
                                    setDisplayStyleModalOpen(false);
                                    setView2DModalOpen(false);
                                    setView2DVisibilityModalOpen(false);
                                    if (sunPanelOpen) onSunSettingsClick?.();
                                    if (cameraPanelOpen) onCameraSettingsClick?.();
                                    setView3DModalOpen(!view3DModalOpen);
                                }}
                                title="3D Visibility Settings"
                            >
                                <MdOutlineVisibility className={styles.iconBtn} />
                            </button>

                            {/* 3D Visibility Modal */}
                            {view3DModalOpen && (
                                <div className={styles.view3DModal}>
                                    {/* Show hidden toggle */}
                                    <div className={styles.view3DToggleRow}>
                                        <span>Show hidden</span>
                                        <label className={styles.toggleSwitch}>
                                            <input
                                                type="checkbox"
                                                checked={view3DVisibility.showHidden}
                                                onChange={(e) => updateVisibility('showHidden', e.target.checked)}
                                            />
                                            <span className={styles.toggleSlider}></span>
                                        </label>
                                    </div>

                                    <div className={styles.view3DDivider} />

                                    {/* Menu items with submenu arrows */}
                                    <button className={styles.view3DOption}>
                                        <span>Ceiling</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>Furniture</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>Custom product</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>
                                    <button className={styles.view3DOption}>
                                        <span>3D distance dimension line</span>
                                        <span className={styles.submenuArrow}>›</span>
                                    </button>

                                    <div className={styles.view3DDivider} />

                                    {/* Checkbox items */}
                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view3DVisibility.wall}
                                            onChange={(e) => updateVisibility('wall', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Wall</span>
                                    </label>
                                    <label className={styles.view3DCheckboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={view3DVisibility.modeling}
                                            onChange={(e) => updateVisibility('modeling', e.target.checked)}
                                        />
                                        <span className={styles.checkmark}></span>
                                        <span>Modeling</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Display Style Button */}
                    <div style={{ position: 'relative' }} ref={modalRef}>
                        <button
                            className={`${styles.btn} ${displayStyleModalOpen ? styles.active : ''}`}
                            title="Display Mode"
                            onClick={handleDisplayStyleClick}
                        >
                            <TbCube className={styles.iconBtn} />
                        </button>

                        {/* 2D Display Style Modal */}
                        {displayStyleModalOpen && viewMode === '2D' && (
                            <div className={styles.displayStyleModal}>
                                <div className={styles.modalSection}>
                                    <h4 className={styles.modalTitle}>Display style</h4>
                                    <div className={styles.singleStyleOption}>
                                        <button
                                            className={`${styles.styleOption} ${styles.selected}`}
                                        >
                                            <div className={styles.stylePreview}>
                                                <img src="/images/display-material.png" alt="Material" className={styles.stylePreviewImg} />
                                            </div>
                                            <span className={styles.styleLabel}>Material</span>
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.modalDivider} />

                                <div className={styles.modalSection}>
                                    <div className={styles.toggleRow}>
                                        <span className={styles.toggleLabel}>Line</span>
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

                        {/* 3D Display Style Modal */}
                        {displayStyleModalOpen && viewMode === '3D' && (
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

                                {displayStyle === 'material' && (
                                    <>
                                        <div className={styles.modalDivider} />

                                        <div className={styles.modalSection}>
                                            <div className={styles.toggleRow}>
                                                <span className={styles.toggleLabel}>Line</span>
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
                                    </>
                                )}

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
                            ref={sunBtnRef}
                            className={`${styles.btn} ${sunPanelOpen ? styles.active : ''}`}
                            onClick={handleSunClick}
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
                            ref={cameraBtnRef}
                            className={`${styles.btn} ${cameraPanelOpen ? styles.active : ''}`}
                            onClick={handleCameraClick}
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
        </>
    );
});
