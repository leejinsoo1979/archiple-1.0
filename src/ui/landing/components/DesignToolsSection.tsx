import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../../../pages/LandingPage.module.css';

const DesignToolsSection: React.FC = () => {
    const navigate = useNavigate();

    const tools = [
        { title: 'Floor planner', image: '/images/floorplan.webp' },
        { title: 'Room planner', image: '/images/designyourroom.webp' },
        { title: '3D render home', image: '/images/3dhomerender.webp' },
        { title: 'DIY home decor', image: '/images/diyhome.webp' },
        { title: 'AI home design', image: '/images/aihomedesign.webp' }
    ];

    return (
        <section className={styles.designToolsSection}>
            <div className={styles.heroContainerNew}>
                <h2 className={styles.heroTitleNew}>Design your dream home</h2>
                <p className={styles.heroSubtitleNew}>
                    Create a 3D home design in 10 minutes, render a stunning visual in just 10 seconds.
                </p>

                <button className={styles.btnDesignFree} onClick={() => navigate('/editor')}>
                    Design your home free
                </button>

                <div className={styles.toolsGrid}>
                    {tools.map((tool, index) => (
                        <div key={index} className={styles.toolCard}>
                            <div className={styles.toolImage}>
                                <img src={tool.image} alt={tool.title} />
                            </div>
                            <h3 className={styles.toolTitle}>{tool.title}</h3>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default DesignToolsSection;
