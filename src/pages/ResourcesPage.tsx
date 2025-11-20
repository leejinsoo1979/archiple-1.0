import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../pages/LandingPage.module.css';
import LandingHeader from '../ui/landing/components/LandingHeader';
import LandingFooter from '../ui/landing/components/LandingFooter';
import EducationSection from '../ui/landing/components/EducationSection';
import HowToSection from '../ui/landing/components/HowToSection';

const ResourcesPage: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={() => { }}
                onStartClick={() => navigate('/editor')}
            />
            <main style={{ paddingTop: '80px' }}>
                <div className={styles.sectionHeader} style={{ textAlign: 'center', padding: '60px 20px 20px' }}>
                    <h1 className={styles.sectionTitle}>Resources & Learning</h1>
                    <p className={styles.sectionSubtitle}>Master Archiple with our tutorials and guides.</p>
                </div>
                <HowToSection />
                <EducationSection />
            </main>
            <LandingFooter />
        </div>
    );
};

export default ResourcesPage;
