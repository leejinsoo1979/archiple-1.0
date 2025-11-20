import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './LandingPage.module.css'; // Reuse basic styles
import LandingHeader from '../ui/landing/components/LandingHeader';
import LandingFooter from '../ui/landing/components/LandingFooter';

const PlaceholderPage: React.FC = () => {
    const { pageName } = useParams();
    const navigate = useNavigate();

    // Capitalize first letter
    const title = pageName ? pageName.charAt(0).toUpperCase() + pageName.slice(1) : 'Page';

    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={() => { }}
                onStartClick={() => navigate('/editor')}
            />

            <main style={{
                paddingTop: '120px',
                minHeight: '60vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                <h1 style={{ fontSize: '48px', marginBottom: '24px', color: 'var(--dark)' }}>{title}</h1>
                <p style={{ fontSize: '18px', color: 'var(--gray-600)', maxWidth: '600px' }}>
                    This page is currently under construction.
                    <br />
                    We are working hard to bring you the best experience.
                </p>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        marginTop: '40px',
                        padding: '12px 24px',
                        background: 'var(--primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: '600'
                    }}
                >
                    Back to Home
                </button>
            </main>

            <LandingFooter />
        </div>
    );
};

export default PlaceholderPage;
