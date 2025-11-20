import React, { useState } from 'react';
import styles from '../../../pages/LandingPage.module.css';

const HowToSection: React.FC = () => {
    const [activeStep, setActiveStep] = useState(0);

    const steps = [
        {
            title: "Step 1: Create Floor Plan",
            desc: "Draw your floor plan in 2D or upload an existing CAD file to get started instantly.",
            image: "Floor Plan Image Placeholder"
        },
        {
            title: "Step 2: Structure & Walls",
            desc: "Customize wall heights, add doors, windows, and structural elements with precision.",
            image: "Structure Image Placeholder"
        },
        {
            title: "Step 3: Furnish & Decorate",
            desc: "Drag and drop thousands of real brand furniture and materials into your design.",
            image: "Furnish Image Placeholder"
        },
        {
            title: "Step 4: 3D & VR Experience",
            desc: "Walk through your design in immersive 3D or VR mode and export high-quality renders.",
            image: "3D VR Image Placeholder"
        }
    ];

    return (
        <section className={styles.sectionAlt}>
            <div className={styles.containerInner}>
                <h2 className={styles.sectionTitle}>How to design a home online for free</h2>

                <div className={styles.howToContainer}>
                    <div className={styles.howToSteps}>
                        {steps.map((step, index) => (
                            <div
                                key={index}
                                className={`${styles.stepItem} ${activeStep === index ? styles.stepActive : ''}`}
                                onMouseEnter={() => setActiveStep(index)}
                            >
                                <h3 className={styles.stepTitle}>
                                    <span className={styles.stepNumber}>{index + 1}</span>
                                    {step.title}
                                </h3>
                                <p className={styles.stepDesc}>{step.desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className={styles.howToVisual}>
                        <div className={styles.stepVisualPlaceholder}>
                            {steps[activeStep].image}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowToSection;
