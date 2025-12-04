import React from 'react';
import styles from './StepPanel.module.css';
import { MdMap, Md3dRotation, MdDownload } from 'react-icons/md';

export type WorldEditorStep = 'area' | 'explore' | 'export';

interface StepPanelProps {
    currentStep: WorldEditorStep;
    onStepChange: (step: WorldEditorStep) => void;
    children?: React.ReactNode;
}

export const StepPanel: React.FC<StepPanelProps> = ({
    currentStep,
    onStepChange,
    children
}) => {
    const steps: { id: WorldEditorStep; label: string; icon: React.ReactNode }[] = [
        { id: 'area', label: '1. Area Selection', icon: <MdMap /> },
        { id: 'explore', label: '2. Explore in 3D', icon: <Md3dRotation /> },
        { id: 'export', label: '3. Share & Download', icon: <MdDownload /> },
    ];

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Archiple World</h2>
            </div>

            <div className={styles.stepper}>
                {steps.map((step) => (
                    <button
                        key={step.id}
                        className={`${styles.stepButton} ${currentStep === step.id ? styles.active : ''}`}
                        onClick={() => onStepChange(step.id)}
                    >
                        <span className={styles.stepIcon}>{step.icon}</span>
                        <span className={styles.stepLabel}>{step.label}</span>
                    </button>
                ))}
            </div>

            <div className={styles.content}>
                {children}
            </div>
        </div>
    );
};
