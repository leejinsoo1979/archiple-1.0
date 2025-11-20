import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const TrustSection: React.FC = () => {
    return (
        <section className={styles.section}>
            <div className={styles.containerInner}>
                <div className={styles.trustContent}>
                    <h2 className={styles.sectionTitle}>Trusted by the best in home design software rankings</h2>

                    <div className={styles.ratingContainer}>
                        <div className={styles.ratingScore}>4.8</div>
                        <div className={styles.ratingStars}>★★★★★</div>
                        <div className={styles.ratingLabel}>Average User Rating</div>
                    </div>

                    <div className={styles.logosGrid}>
                        <div className={styles.logoItem}>G2 High Performer</div>
                        <div className={styles.logoItem}>Capterra Best Ease of Use</div>
                        <div className={styles.logoItem}>GetApp Category Leader</div>
                        <div className={styles.logoItem}>SourceForge Top Rated</div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default TrustSection;
