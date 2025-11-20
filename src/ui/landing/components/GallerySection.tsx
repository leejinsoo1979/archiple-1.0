import React, { useState } from 'react';
import Masonry from 'react-masonry-css';
import '../../../styles/masonry.css';
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

    const galleryItems = [
        { image: '/images/L3D721S14ENDOV44NQQUWLBPQLUFX6N77SI8.webp', category: 'Kitchen', count: 3, height: 320 },
        { image: '/images/L3D723S57ENDOVVC7KQUWLVRSLUFX7HJBWA8.webp', category: 'Kitchen', count: 4, height: 240 },
        { image: '/images/L3D733S57ENDOWN7LOAUWL6HILUFX7PLICA8.webp', category: 'Dining Room', count: 5, height: 380 },
        { image: '/images/L3D738S57ENDOQN5ZGIUWLBACLUFX73B2HI8.webp', category: 'Living Room', count: 4, height: 280 },
        { image: '/images/L3D914S57ENDOQJ4RNQUWIMHILUFX7VN4RI8.webp', category: 'Kitchen', count: 4, height: 360 },
        { image: '/images/L3D914S57ENDOXTDJIYUWJXMULUFX72FJHA8.webp', category: 'Living Room', count: 4, height: 300 },
        { image: '/images/NB4P6ZIKQQYXEAABAAAAADQ8.webp', category: 'Bedroom', count: 4, height: 340 },
        { image: '/images/NECBOAIKQQM32AABAAAAAAY8.webp', category: 'Bedroom', count: 4, height: 260 }
    ];

    const breakpointColumnsObj = {
        default: 4,
        1600: 3,
        1024: 2,
        640: 1
    };

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

                <Masonry
                    breakpointCols={breakpointColumnsObj}
                    className="my-masonry-grid"
                    columnClassName="my-masonry-grid_column"
                >
                    {galleryItems.map((item, index) => (
                        <div key={index} className="masonry-item" style={{ height: `${item.height}px` }}>
                            <img src={item.image} alt={item.category} />
                            <div className="masonry-overlay">
                                <div className="masonry-badge">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                        <circle cx="12" cy="13" r="4"/>
                                    </svg>
                                    <span>View more ({item.count})</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </Masonry>
            </div>
        </section>
    );
};

export default GallerySection;
