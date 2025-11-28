import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../../../pages/LandingPage.module.css';
import { FloorplanSearchModal } from '../../modals/FloorplanSearchModal';

const HeroSection: React.FC = () => {
    const navigate = useNavigate();
    const [showSearchModal, setShowSearchModal] = useState(false);

    return (
        <>
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
                        <button className={styles.btnPrimaryLarge} onClick={() => navigate('/editor')}>
                            Home Design for Free
                        </button>
                        <button className={styles.btnSecondaryLarge} onClick={() => setShowSearchModal(true)}>
                            Search Floorplan
                        </button>
                    </div>

                    <div className={styles.trustBadges}>
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

        <FloorplanSearchModal
            isOpen={showSearchModal}
            onClose={() => setShowSearchModal(false)}
        />
        </>
    );
};

export default HeroSection;
