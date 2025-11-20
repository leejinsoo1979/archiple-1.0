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
                            <iframe
                                width="100%"
                                height="100%"
                                src="https://www.youtube.com/embed/-K4djTGmdNk?autoplay=1&mute=1&loop=1&playlist=-K4djTGmdNk"
                                title="YouTube video player"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '16px' }}
                            ></iframe>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default EducationSection;
