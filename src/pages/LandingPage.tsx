import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LandingPage.module.css';

import LandingHeader from '../ui/landing/components/LandingHeader';
import HeroSection from '../ui/landing/components/HeroSection';
import FeatureCards from '../ui/landing/components/FeatureCards';
import HowToSection from '../ui/landing/components/HowToSection';
import GallerySection from '../ui/landing/components/GallerySection';
import EducationSection from '../ui/landing/components/EducationSection';
import TrustSection from '../ui/landing/components/TrustSection';
import LandingFooter from '../ui/landing/components/LandingFooter';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();

    const handleStart = () => {
        navigate('/editor');
    };

    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={() => navigate('/login')}
                onStartClick={handleStart}
            />

            <main>
                <div id="hero"><HeroSection /></div>
                <div id="features"><FeatureCards /></div>
                <div id="how-to"><HowToSection /></div>
                <div id="gallery"><GallerySection /></div>
                <div id="education"><EducationSection /></div>
                <div id="trust"><TrustSection /></div>
            </main>

            <LandingFooter />
        </div>
    );
};

export default LandingPage;
