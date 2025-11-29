import React, { useState, useRef, useEffect } from 'react';
import { LuSun, LuMoon, LuCompass } from 'react-icons/lu';
import { IoSunny, IoMoon } from 'react-icons/io5';
import styles from './ShadowControls.module.css';

interface ShadowControlsProps {
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    time: number;
    onTimeChange: (time: number) => void;
    azimuth: number;
    onAzimuthChange: (azimuth: number) => void;
}

export const ShadowControls: React.FC<ShadowControlsProps> = ({
    enabled,
    onToggle,
    time,
    onTimeChange,
    azimuth,
    onAzimuthChange,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Close panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleToggle = () => {
        if (!enabled) {
            onToggle(true);
            setIsOpen(true);
        } else {
            // If already enabled, just toggle the panel visibility
            setIsOpen(!isOpen);
        }
    };

    // Format time for display (e.g., 14.5 -> 14:30)
    const formatTime = (value: number) => {
        const hours = Math.floor(value);
        const minutes = Math.round((value - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    return (
        <div className={styles.container} ref={panelRef}>
            <button
                className={`${styles.toggleBtn} ${enabled ? styles.active : ''}`}
                onClick={handleToggle}
                title={enabled ? "Shadow Settings" : "Enable Shadows"}
            >
                {enabled ? <IoSunny size={18} /> : <IoMoon size={18} />}
            </button>

            {/* Quick toggle switch (only visible when panel is open or on hover) */}
            {isOpen && (
                <div className={styles.panel}>
                    <div className={styles.header}>
                        <span className={styles.title}>Lighting & Shadows</span>
                        <div className={styles.switchWrapper}>
                            <input
                                type="checkbox"
                                id="shadow-toggle"
                                className={styles.toggleInput}
                                checked={enabled}
                                onChange={(e) => onToggle(e.target.checked)}
                            />
                            <label htmlFor="shadow-toggle" className={styles.toggleLabel}></label>
                        </div>
                    </div>

                    <div className={`${styles.controls} ${!enabled ? styles.disabled : ''}`}>
                        {/* Time Slider */}
                        <div className={styles.controlGroup}>
                            <div className={styles.labelRow}>
                                <div className={styles.iconLabel}>
                                    <LuSun size={14} />
                                    <span>Time</span>
                                </div>
                                <span className={styles.value}>{formatTime(time)}</span>
                            </div>
                            <div className={styles.sliderWrapper}>
                                <div
                                    className={styles.sliderTrack}
                                    style={{ '--progress': `${((time - 5) / (19 - 5)) * 100}%` } as React.CSSProperties}
                                />
                                <input
                                    type="range"
                                    min="5"
                                    max="19"
                                    step="0.25"
                                    value={time}
                                    onChange={(e) => onTimeChange(parseFloat(e.target.value))}
                                    className={styles.slider}
                                />
                                <div className={styles.timeMarkers}>
                                    <span>6am</span>
                                    <span>12pm</span>
                                    <span>6pm</span>
                                </div>
                            </div>
                        </div>

                        {/* Azimuth Slider */}
                        <div className={styles.controlGroup}>
                            <div className={styles.labelRow}>
                                <div className={styles.iconLabel}>
                                    <LuCompass size={14} />
                                    <span>Direction</span>
                                </div>
                                <span className={styles.value}>{azimuth}°</span>
                            </div>
                            <div className={styles.sliderWrapper}>
                                <div
                                    className={styles.sliderTrack}
                                    style={{ '--progress': `${(azimuth / 360) * 100}%` } as React.CSSProperties}
                                />
                                <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    step="5"
                                    value={azimuth}
                                    onChange={(e) => onAzimuthChange(parseInt(e.target.value))}
                                    className={styles.slider}
                                />
                                <div className={styles.azimuthMarkers}>
                                    <span>N</span>
                                    <span>E</span>
                                    <span>S</span>
                                    <span>W</span>
                                    <span>N</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
