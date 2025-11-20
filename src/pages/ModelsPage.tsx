import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../pages/LandingPage.module.css';
import LandingHeader from '../ui/landing/components/LandingHeader';
import LandingFooter from '../ui/landing/components/LandingFooter';
import GallerySection from '../ui/landing/components/GallerySection';

const ModelsPage: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={() => { }}
                onStartClick={() => navigate('/editor')}
            />
            <main style={{ paddingTop: '80px' }}>
                <div className={styles.sectionHeader} style={{ textAlign: 'center', padding: '60px 20px 20px' }}>
                    <h1 className={styles.sectionTitle}>3D Model Library</h1>
                    <p className={styles.sectionSubtitle}>Explore thousands of high-quality 3D models for your projects.</p>
                </div>
                <GallerySection />
            </main>
            <LandingFooter />
        </div>
    );
};

export default ModelsPage;
