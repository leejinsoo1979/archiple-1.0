import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './LandingPage.module.css';

import LandingHeader from '../ui/landing/components/LandingHeader';
import HeroSection from '../ui/landing/components/HeroSection';
import DesignToolsSection from '../ui/landing/components/DesignToolsSection';
import HowToSection from '../ui/landing/components/HowToSection';
import GallerySection from '../ui/landing/components/GallerySection';
import EducationSection from '../ui/landing/components/EducationSection';
import TrustSection from '../ui/landing/components/TrustSection';
import LandingFooter from '../ui/landing/components/LandingFooter';
import LoginPage from './LoginPage';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const showLogin = searchParams.get('login') === 'true';

    const handleStart = () => {
        navigate('/editor');
    };

    const handleLoginClick = () => {
        setSearchParams({ login: 'true' });
    };

    const handleCloseLogin = () => {
        setSearchParams({});
    };

    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={handleLoginClick}
                onStartClick={handleStart}
            />

            <main>
                <div id="hero"><HeroSection /></div>
                <div id="design-tools"><DesignToolsSection /></div>
                <div id="how-to"><HowToSection /></div>
                <div id="gallery"><GallerySection /></div>
                <div id="education"><EducationSection /></div>
                <div id="trust"><TrustSection /></div>
            </main>

            <LandingFooter />

            {showLogin && <LoginPage onClose={handleCloseLogin} />}
        </div>
    );
};

export default LandingPage;
