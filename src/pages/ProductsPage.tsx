import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../pages/LandingPage.module.css';
import LandingHeader from '../ui/landing/components/LandingHeader';
import LandingFooter from '../ui/landing/components/LandingFooter';
import FeatureCards from '../ui/landing/components/FeatureCards';

const ProductsPage: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={() => { }}
                onStartClick={() => navigate('/editor')}
            />
            <main style={{ paddingTop: '80px' }}>
                <div className={styles.sectionHeader} style={{ textAlign: 'center', padding: '60px 20px 20px' }}>
                    <h1 className={styles.sectionTitle}>Our Products</h1>
                    <p className={styles.sectionSubtitle}>Professional tools for every stage of your design journey.</p>
                </div>
                <FeatureCards />
            </main>
            <LandingFooter />
        </div>
    );
};

export default ProductsPage;
