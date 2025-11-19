import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LandingPage.module.css';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const [showLogin, setShowLogin] = useState(false);

    const handleStart = () => {
        navigate('/editor');
    };

    return (
        <div className={styles.container}>
            <div className={styles.background} />
            <div className={styles.gridOverlay} />

            {/* Navigation */}
            <nav className={styles.nav}>
                <a href="/" className={styles.logo}>
                    <div className={styles.logoIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M3 21h18M5 21V7l8-4 8 4v14" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    Archiple
                </a>
                <div className={styles.navLinks}>
                    <a className={styles.navLink}>Features</a>
                    <a className={styles.navLink}>Showcase</a>
                    <a className={styles.navLink}>Pricing</a>
                    <button className={styles.loginBtn} onClick={() => setShowLogin(true)}>
                        Sign In
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <main className={styles.hero}>
                <div className={styles.heroContent}>
                    <div className={styles.badge}>
                        Next Gen Architecture Tool
                    </div>
                    <h1 className={styles.title}>
                        Design Your<br />
                        Dream Space
                    </h1>
                    <p className={styles.subtitle}>
                        Experience the future of architectural design.
                        Real-time 2D/3D synchronization, smart snapping, and professional-grade tools
                        right in your browser.
                    </p>
                    <div className={styles.ctaGroup}>
                        <button className={styles.primaryBtn} onClick={handleStart}>
                            Start Designing
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <button className={styles.secondaryBtn}>
                            Watch Demo
                        </button>
                    </div>
                </div>
            </main>

            {/* Login Modal */}
            {showLogin && (
                <div className={styles.modalOverlay} onClick={(e) => {
                    if (e.target === e.currentTarget) setShowLogin(false);
                }}>
                    <div className={styles.loginModal}>
                        <button className={styles.closeBtn} onClick={() => setShowLogin(false)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>

                        <h2 className={styles.modalTitle}>Welcome Back</h2>
                        <p className={styles.modalSubtitle}>Sign in to continue your journey</p>

                        <form onSubmit={(e) => e.preventDefault()}>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Email</label>
                                <input type="email" className={styles.input} placeholder="Enter your email" />
                            </div>
                            <div className={styles.inputGroup}>
                                <label className={styles.label}>Password</label>
                                <input type="password" className={styles.input} placeholder="Enter your password" />
                            </div>
                            <button type="submit" className={styles.submitBtn}>Sign In</button>
                        </form>

                        <div className={styles.divider}>OR CONTINUE WITH</div>

                        <button className={styles.socialBtn}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            Google
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LandingPage;
