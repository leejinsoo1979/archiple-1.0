import React, { useState } from 'react';
import styles from '../../../pages/LandingPage.module.css';

const GallerySection: React.FC = () => {
    const [activeTab, setActiveTab] = useState('all');

    const categories = [
        { id: 'all', label: 'Home design ideas' },
        { id: 'living', label: 'Living Room' },
        { id: 'bedroom', label: 'Bedroom' },
        { id: 'dining', label: 'Dining Room' },
        { id: 'kitchen', label: 'Kitchen' },
        { id: 'others', label: 'Others' }
    ];

    // Order: [Col1_Top, Col1_Bottom, Col2_Top, Col2_Bottom, Col3_Top, Col3_Bottom, Col4_Top, Col4_Bottom]
    // To achieve Zigzag Top (Short, Tall, Short, Tall) and Aligned Bottom
    // Col 1: Short (4/3) + Tall (3/4)
    // Col 2: Tall (3/4) + Short (4/3)
    // Col 3: Short (4/3) + Tall (3/4)
    // Col 4: Tall (3/4) + Short (4/3)
    const galleryItems = [
        // Column 1
        { video: '/movie/home design idea/grok-video-d212ece1-07fb-4d66-a4b5-f3561146a473.mp4', category: 'Kitchen', count: 3, aspectRatio: '4/3' },
        { video: '/movie/home design idea/grok-video-75d17e72-2b87-4017-be4f-b584b1999f20.mp4', category: 'Kitchen', count: 4, aspectRatio: '3/4' },

        // Column 2
        { video: '/movie/home design idea/grok-video-7daf9bfd-c0fa-4f65-8e42-c389c8dcd374.mp4', category: 'Living Room', count: 4, aspectRatio: '3/4' },
        { video: '/movie/home design idea/grok-video-fc359090-b8ab-4b5e-9b4e-1e2928c54bfe.mp4', category: 'Dining Room', count: 5, aspectRatio: '4/3' },

        // Column 3
        { video: '/movie/home design idea/grok-video-199aabee-e828-46b6-aada-ef076d6ea6ef.mp4', category: 'Kitchen', count: 4, aspectRatio: '4/3' },
        { video: '/movie/home design idea/grok-video-514eee92-3ffd-4dd0-9c12-bafa06514d21.mp4', category: 'Living Room', count: 4, aspectRatio: '3/4' },

        // Column 4
        { video: '/movie/home design idea/grok-video-bc77a3b4-ebcd-410f-bc9c-849e3a9d18b8.mp4', category: 'Bedroom', count: 4, aspectRatio: '3/4' },
        { video: '/movie/home design idea/grok-video-1a9ba27c-8fd6-4a36-8525-d4bbe8dd23cd.mp4', category: 'Bedroom', count: 4, aspectRatio: '4/3' }
    ];

    return (
        <section className={styles.section}>
            <div className={styles.containerInner}>
                <div className={styles.galleryHeader}>
                    <h2 className={styles.galleryMainTitle}>Inspiring home design ideas for every room!</h2>
                    <p className={styles.gallerySubtitle}>
                        Use the home designer to explore free design templates for bedrooms, living rooms, kitchens, and more—customize layouts effortlessly.
                    </p>
                    <button className={styles.btnViewAll}>View all home design ideas</button>
                </div>

                <div className={styles.categoryTabs}>
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            className={`${styles.categoryTab} ${activeTab === cat.id ? styles.categoryTabActive : ''}`}
                            onClick={() => setActiveTab(cat.id)}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                <div className={styles.masonryGrid}>
                    {galleryItems.map((item, index) => (
                        <div key={index} className={styles.masonryItem}>
                            <video
                                src={item.video}
                                className={styles.masonryImage}
                                style={{ aspectRatio: item.aspectRatio }}
                                autoPlay
                                loop
                                muted
                                playsInline
                            />
                            <div className={styles.masonryOverlay}>
                                <div className={styles.masonryBadge}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                        <circle cx="12" cy="13" r="4" />
                                    </svg>
                                    <span>View more ({item.count})</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default GallerySection;
