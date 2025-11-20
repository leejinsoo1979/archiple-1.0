import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const FeatureCards: React.FC = () => {
    const features = [
        {
            title: "2D Floor Planner",
            image: "/images/feature_floorplan.jpg", // Placeholder
            link: "#"
        },
        {
            title: "3D Room Viewer",
            image: "/images/feature_3d.jpg", // Placeholder
            link: "#"
        },
        {
            title: "Cabinet Configurator",
            image: "/images/feature_cabinet.jpg", // Placeholder
            link: "#"
        },
        {
            title: "AI Layout",
            image: "/images/feature_ai.jpg", // Placeholder
            link: "#"
        },
        {
            title: "BIM Export",
            image: "/images/feature_bim.jpg", // Placeholder
            link: "#"
        }
    ];

    return (
        <section className={styles.section}>
            <div className={styles.containerInner}>
                <h2 className={styles.sectionTitle}>Design your dream home</h2>
                <div className={styles.featureGrid}>
                    {features.map((feature, index) => (
                        <div key={index} className={styles.featureCard}>
                            <div className={styles.featureImagePlaceholder}>
                                {/* Ideally an <img> tag here, using div for placeholder */}
                                <span className={styles.placeholderText}>{feature.title} Image</span>
                            </div>
                            <div className={styles.featureContent}>
                                <h3 className={styles.featureCardTitle}>{feature.title}</h3>
                                <a href={feature.link} className={styles.featureLink}>Learn more &rarr;</a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FeatureCards;
