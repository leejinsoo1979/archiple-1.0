import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const EducationSection: React.FC = () => {
    return (
        <section className={styles.sectionAlt}>
            <div className={styles.containerInner}>
                <div className={styles.educationContainer}>
                    <div className={styles.educationContent}>
                        <h2 className={styles.educationTitle}>Master 3D home designs in just 7 lessons</h2>
                        <p className={styles.educationDesc}>
                            Join our free masterclass and learn how to create professional-grade interior designs using Archiple.
                            From basic floor planning to advanced rendering techniques.
                        </p>
                        <button className={styles.btnPrimaryLarge}>Watch Beginner's Guide</button>
                    </div>
                    <div className={styles.educationVisual}>
                        <div className={styles.videoPlaceholder}>
                            <span>Video Thumbnail</span>
                            <div className={styles.playButton}>▶</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default EducationSection;
