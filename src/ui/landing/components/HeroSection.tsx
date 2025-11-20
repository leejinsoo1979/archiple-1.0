import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const HeroSection: React.FC = () => {
    // Placeholder for onStartClick function, as it's introduced in the change
    const onStartClick = () => {
        console.log('Start button clicked!');
        // Implement navigation or other logic here
    };

    return (
        <section className={styles.heroSection}>
            <div className={styles.heroContainer}>
                <div className={styles.heroContent}>
                    <div className={styles.heroBadge}>Home design made easy</div>
                    <h1 className={styles.heroTitle}>
                        Design your dream home <br />
                        <span className={styles.highlight}>in minutes</span>
                    </h1>
                    <p className={styles.heroSubtitle}>
                        Fast, easy, and professional 3D home design tool. Visualize your ideas in real-time with photorealistic rendering.
                    </p>

                    <div className={styles.heroButtons}>
                        <button className={styles.btnPrimaryLarge} onClick={onStartClick}>
                            Home Design for Free
                        </button>
                        <button className={styles.btnSecondaryLarge}>
                            Enterprise Free Trial
                        </button>
                    </div>

                    <div className={styles.trustBadges}>
                        {/* Placeholder for trust badges like G2, Capterra */}
                        <div className={styles.trustBadgeItem}>
                            <span>Rated 4.5/5 on G2</span>
                            <span style={{ color: '#FFB900' }}>★★★★★</span>
                        </div>
                    </div>
                </div>

                <div className={styles.heroVisual}>
                    <div className={styles.videoWrapper}>
                        <video
                            src="https://uable.co.kr/videos/archipleNRP.mp4"
                            autoPlay
                            muted
                            loop
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HeroSection;
