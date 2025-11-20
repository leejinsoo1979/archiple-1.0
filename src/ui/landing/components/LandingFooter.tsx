import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const LandingFooter: React.FC = () => {
    return (
        <footer className={styles.footer}>
            <div className={styles.footerContent}>
                <div className={styles.footerCol}>
                    <div className={styles.footerLogo} />
                    <p className={styles.footerDesc}>
                        Empowering designers and manufacturers with next-generation 3D tools.
                    </p>
                    <div className={styles.socialLinks}>
                        {/* Social Icons Placeholder */}
                        <span>Insta</span>
                        <span>Fb</span>
                        <span>Yt</span>
                        <span>In</span>
                    </div>
                </div>

                <div className={styles.footerCol}>
                    <h4 className={styles.footerTitle}>Products</h4>
                    <div className={styles.footerLinks}>
                        <a href="#" className={styles.footerLink}>Floor Planner</a>
                        <a href="#" className={styles.footerLink}>3D Viewer</a>
                        <a href="#" className={styles.footerLink}>Photo Studio</a>
                        <a href="#" className={styles.footerLink}>Enterprise</a>
                    </div>
                </div>

                <div className={styles.footerCol}>
                    <h4 className={styles.footerTitle}>Resources</h4>
                    <div className={styles.footerLinks}>
                        <a href="#" className={styles.footerLink}>Tutorials</a>
                        <a href="#" className={styles.footerLink}>Help Center</a>
                        <a href="#" className={styles.footerLink}>Blog</a>
                        <a href="#" className={styles.footerLink}>Community</a>
                    </div>
                </div>

                <div className={styles.footerCol}>
                    <h4 className={styles.footerTitle}>Company</h4>
                    <div className={styles.footerLinks}>
                        <a href="#" className={styles.footerLink}>About Us</a>
                        <a href="#" className={styles.footerLink}>Careers</a>
                        <a href="#" className={styles.footerLink}>Contact</a>
                        <a href="#" className={styles.footerLink}>Partners</a>
                    </div>
                </div>

                <div className={styles.footerCol}>
                    <h4 className={styles.footerTitle}>Legal</h4>
                    <div className={styles.footerLinks}>
                        <a href="#" className={styles.footerLink}>Privacy Policy</a>
                        <a href="#" className={styles.footerLink}>Terms of Service</a>
                        <a href="#" className={styles.footerLink}>Cookie Policy</a>
                    </div>
                </div>
            </div>
            <div className={styles.copyright}>
                © 2025 UABLE corp. All rights reserved.
            </div>
        </footer>
    );
};

export default LandingFooter;
