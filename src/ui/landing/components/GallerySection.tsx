import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const GallerySection: React.FC = () => {
    const items = [
        { title: "Modern Minimal Living", category: "Living Room", image: "Living Room Image" },
        { title: "Scandi Kitchen", category: "Kitchen", image: "Kitchen Image" },
        { title: "Luxury Bedroom", category: "Bedroom", image: "Bedroom Image" },
        { title: "Home Office Setup", category: "Office", image: "Office Image" },
        { title: "Cozy Bathroom", category: "Bathroom", image: "Bathroom Image" },
        { title: "Outdoor Patio", category: "Outdoor", image: "Outdoor Image" }
    ];

    return (
        <section className={styles.section}>
            <div className={styles.containerInner}>
                <div className={styles.sectionHeaderRow}>
                    <h2 className={styles.sectionTitleLeft}>Inspiring home design ideas for every room</h2>
                    <a href="#" className={styles.viewAllLink}>View all ideas &rarr;</a>
                </div>

                <div className={styles.galleryGrid}>
                    {items.map((item, index) => (
                        <div key={index} className={styles.galleryItem}>
                            <div className={styles.galleryImagePlaceholder}>
                                {item.image}
                            </div>
                            <div className={styles.galleryInfo}>
                                <span className={styles.galleryCategory}>{item.category}</span>
                                <h3 className={styles.galleryTitle}>{item.title}</h3>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default GallerySection;
