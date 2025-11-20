import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../../../pages/LandingPage.module.css';

interface LandingHeaderProps {
    onLoginClick: () => void;
    onStartClick: () => void;
}

const LandingHeader: React.FC<LandingHeaderProps> = ({ onLoginClick, onStartClick }) => {
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

    const handleMouseEnter = (menu: string) => setActiveDropdown(menu);
    const handleMouseLeave = () => setActiveDropdown(null);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Theme settings state
    const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
    const [themeColor, setThemeColor] = useState<string>('#3dbc58'); // Default Archiple Green

    // Load theme from localStorage on mount
    React.useEffect(() => {
        const savedThemeMode = localStorage.getItem('themeMode') as 'light' | 'dark' | null;
        const savedThemeColor = localStorage.getItem('themeColor');

        if (savedThemeMode) {
            setThemeMode(savedThemeMode);
        }
        if (savedThemeColor) {
            setThemeColor(savedThemeColor);
        }
    }, []);

    // Apply theme to document root
    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', themeMode);
        document.documentElement.style.setProperty('--primary', themeColor);
        document.documentElement.style.setProperty('--theme-color', themeColor); // For compatibility

        // Save to localStorage
        localStorage.setItem('themeMode', themeMode);
        localStorage.setItem('themeColor', themeColor);
    }, [themeMode, themeColor]);

    // Close theme settings panel when clicking outside
    React.useEffect(() => {
        if (!themeSettingsOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest(`.${styles.themeSettingsWrapper}`)) {
                setThemeSettingsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [themeSettingsOpen]);

    const navigate = useNavigate();

    const handleNavClick = (page: string) => {
        navigate(`/page/${page}`);
        setIsMobileMenuOpen(false);
    };

    return (
        <header className={styles.header}>
            <nav className={styles.mainNav}>
                <div className={styles.navContent}>
                    <div className={styles.logoArea} onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                        <div className={styles.logo} />
                    </div>

                    {/* Desktop Nav */}
                    <div className={styles.navLinks}>
                        {/* Products */}
                        <div
                            className={styles.navItem}
                            onMouseEnter={() => handleMouseEnter('products')}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className={styles.navLabel} onClick={() => handleNavClick('products')}>Products</span>
                            {activeDropdown === 'products' && (
                                <div className={styles.dropdown}>
                                    <span onClick={() => handleNavClick('floor-planner')}>Floor Planner</span>
                                    <span onClick={() => handleNavClick('interior-design')}>Interior Design</span>
                                    <span onClick={() => handleNavClick('kitchen-closet')}>Kitchen & Closet Design</span>
                                    <span onClick={() => handleNavClick('ai-design')}>AI Home Design</span>
                                    <span onClick={() => handleNavClick('photo-studio')}>Photo Studio</span>
                                    <span onClick={() => handleNavClick('3d-viewer')}>3D Viewer</span>
                                </div>
                            )}
                        </div>

                        {/* 3D Models */}
                        <div
                            className={styles.navItem}
                            onMouseEnter={() => handleMouseEnter('models')}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className={styles.navLabel} onClick={() => handleNavClick('models')}>3D Models</span>
                            {activeDropdown === 'models' && (
                                <div className={styles.dropdown}>
                                    <span onClick={() => handleNavClick('model-library')}>Model Library</span>
                                    <span onClick={() => handleNavClick('upload-models')}>Upload Brand Models</span>
                                    <span onClick={() => handleNavClick('modeling-service')}>3D Modeling</span>
                                </div>
                            )}
                        </div>

                        {/* Resources */}
                        <div
                            className={styles.navItem}
                            onMouseEnter={() => handleMouseEnter('resources')}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className={styles.navLabel} onClick={() => handleNavClick('resources')}>Resources</span>
                            {activeDropdown === 'resources' && (
                                <div className={styles.dropdown}>
                                    <span onClick={() => handleNavClick('design-ideas')}>Home design ideas</span>
                                    <span onClick={() => handleNavClick('tutorial')}>Tutorial</span>
                                    <span onClick={() => handleNavClick('help-center')}>Help Center</span>
                                    <span onClick={() => handleNavClick('articles')}>Article</span>
                                    <span onClick={() => handleNavClick('app')}>Coohom App</span>
                                </div>
                            )}
                        </div>

                        <span className={styles.navLabel} onClick={() => handleNavClick('pricing')}>Pricing</span>

                        {/* Business */}
                        <div
                            className={styles.navItem}
                            onMouseEnter={() => handleMouseEnter('business')}
                            onMouseLeave={handleMouseLeave}
                        >
                            <span className={styles.navLabel} onClick={() => handleNavClick('business')}>Business</span>
                            {activeDropdown === 'business' && (
                                <div className={styles.dropdown}>
                                    <span onClick={() => handleNavClick('enterprise-trial')}>Enterprise Free Trial</span>
                                    <span onClick={() => handleNavClick('affiliate')}>Affiliate Program</span>
                                    <span onClick={() => handleNavClick('partner')}>Partner Program</span>
                                    <span onClick={() => handleNavClick('open-platform')}>Open Platform</span>
                                </div>
                            )}
                        </div>

                        <span className={styles.navLabel} onClick={() => handleNavClick('enterprise')}>Enterprise</span>
                        <span className={styles.navLabel} onClick={() => handleNavClick('education')}>Education</span>
                    </div>

                    <div className={styles.navActions}>
                        {/* Theme Settings Button */}
                        <div className={styles.themeSettingsWrapper} style={{ position: 'relative', marginRight: '10px' }}>
                            <button
                                className={styles.themeSettingsBtn}
                                onClick={() => setThemeSettingsOpen(!themeSettingsOpen)}
                                title="Theme Settings"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                                </svg>
                            </button>

                            {themeSettingsOpen && (
                                <div
                                    className={styles.themeSettingsPanel}
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className={styles.themeSection}>
                                        <h4 className={styles.themeTitle}>Appearance</h4>
                                        <div className={styles.themeToggle}>
                                            <button
                                                className={`${styles.themeOption} ${themeMode === 'light' ? styles.active : ''}`}
                                                onClick={() => setThemeMode('light')}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                                    <circle cx="12" cy="12" r="5" />
                                                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                                                </svg>
                                                Light
                                            </button>
                                            <button
                                                className={`${styles.themeOption} ${themeMode === 'dark' ? styles.active : ''}`}
                                                onClick={() => setThemeMode('dark')}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                                                </svg>
                                                Dark
                                            </button>
                                        </div>
                                    </div>

                                    <div className={styles.themeSection}>
                                        <h4 className={styles.themeTitle}>Accent Color</h4>
                                        <div className={styles.colorGrid}>
                                            {['#3dbc58', '#3fae7a', '#3498db', '#9b59b6', '#e74c3c', '#f1c40f'].map((color) => (
                                                <button
                                                    key={color}
                                                    className={`${styles.colorOption} ${themeColor === color ? styles.active : ''}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => setThemeColor(color)}
                                                    aria-label={`Select color ${color}`}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.themeSection}>
                                        <h4 className={styles.themeTitle}>Custom Color</h4>
                                        <div className={styles.customColorPicker}>
                                            <input
                                                type="color"
                                                value={themeColor}
                                                onChange={(e) => setThemeColor(e.target.value)}
                                                className={styles.colorPickerInput}
                                            />
                                            <span className={styles.colorValue}>{themeColor.toUpperCase()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button className={styles.btnLogin} onClick={onLoginClick}>Login</button>
                        <button className={styles.btnStart} onClick={onStartClick}>Start for Free</button>
                        <button className={styles.btnDemo}>Book a Demo</button>

                        {/* Mobile Menu Toggle */}
                        <button
                            className={styles.mobileMenuToggle}
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {isMobileMenuOpen ? (
                                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                ) : (
                                    <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" strokeLinejoin="round" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Overlay */}
                {isMobileMenuOpen && (
                    <div className={styles.mobileMenu}>
                        <a href="#" className={styles.mobileNavLink}>Products</a>
                        <a href="#" className={styles.mobileNavLink}>3D Models</a>
                        <a href="#" className={styles.mobileNavLink}>Resources</a>
                        <a href="#" className={styles.mobileNavLink}>Pricing</a>
                        <a href="#" className={styles.mobileNavLink}>Business</a>
                        <a href="#" className={styles.mobileNavLink}>Enterprise</a>
                        <a href="#" className={styles.mobileNavLink}>Education</a>
                        <div className={styles.mobileMenuDivider} />
                        <button className={styles.mobileBtn} onClick={onLoginClick}>Login</button>
                        <button className={styles.mobileBtnPrimary} onClick={onStartClick}>Start for Free</button>
                    </div>
                )}
            </nav>
        </header>
    );
};

export default LandingHeader;
