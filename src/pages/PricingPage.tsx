import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../pages/LandingPage.module.css';
import LandingHeader from '../ui/landing/components/LandingHeader';
import LandingFooter from '../ui/landing/components/LandingFooter';
import TrustSection from '../ui/landing/components/TrustSection';

const PricingPage: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className={styles.container}>
            <LandingHeader
                onLoginClick={() => { }}
                onStartClick={() => navigate('/editor')}
            />
            <main style={{ paddingTop: '80px' }}>
                <div className={styles.sectionHeader} style={{ textAlign: 'center', padding: '60px 20px 20px' }}>
                    <h1 className={styles.sectionTitle}>Simple, Transparent Pricing</h1>
                    <p className={styles.sectionSubtitle}>Choose the plan that fits your needs.</p>
                </div>

                {/* Pricing Table Placeholder */}
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                    {/* Free Plan */}
                    <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--dark)' }}>Free</h3>
                        <div style={{ fontSize: '48px', fontWeight: '700', marginBottom: '20px', color: 'var(--dark)' }}>$0<span style={{ fontSize: '16px', fontWeight: '400', color: 'var(--gray-600)' }}>/mo</span></div>
                        <p style={{ color: 'var(--gray-600)', marginBottom: '30px' }}>Perfect for hobbyists and trying out Archiple.</p>
                        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '40px', color: 'var(--dark)' }}>
                            <li style={{ marginBottom: '10px' }}>✓ Basic Floor Planner</li>
                            <li style={{ marginBottom: '10px' }}>✓ 3 Projects</li>
                            <li style={{ marginBottom: '10px' }}>✓ Standard Rendering</li>
                        </ul>
                        <button style={{ marginTop: 'auto', padding: '12px', background: 'var(--bg-surface-hover)', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Get Started</button>
                    </div>

                    {/* Pro Plan */}
                    <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: '16px', border: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>MOST POPULAR</div>
                        <h3 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--dark)' }}>Pro</h3>
                        <div style={{ fontSize: '48px', fontWeight: '700', marginBottom: '20px', color: 'var(--dark)' }}>$29<span style={{ fontSize: '16px', fontWeight: '400', color: 'var(--gray-600)' }}>/mo</span></div>
                        <p style={{ color: 'var(--gray-600)', marginBottom: '30px' }}>For professional designers and architects.</p>
                        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '40px', color: 'var(--dark)' }}>
                            <li style={{ marginBottom: '10px' }}>✓ Advanced Floor Planner</li>
                            <li style={{ marginBottom: '10px' }}>✓ Unlimited Projects</li>
                            <li style={{ marginBottom: '10px' }}>✓ 4K Rendering</li>
                            <li style={{ marginBottom: '10px' }}>✓ Export to CAD/BIM</li>
                        </ul>
                        <button style={{ marginTop: 'auto', padding: '12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Start Free Trial</button>
                    </div>

                    {/* Enterprise Plan */}
                    <div style={{ background: 'var(--bg-surface)', padding: '40px', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                        <h3 style={{ fontSize: '24px', marginBottom: '10px', color: 'var(--dark)' }}>Enterprise</h3>
                        <div style={{ fontSize: '48px', fontWeight: '700', marginBottom: '20px', color: 'var(--dark)' }}>Custom</div>
                        <p style={{ color: 'var(--gray-600)', marginBottom: '30px' }}>For large teams and organizations.</p>
                        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '40px', color: 'var(--dark)' }}>
                            <li style={{ marginBottom: '10px' }}>✓ All Pro Features</li>
                            <li style={{ marginBottom: '10px' }}>✓ Team Collaboration</li>
                            <li style={{ marginBottom: '10px' }}>✓ API Access</li>
                            <li style={{ marginBottom: '10px' }}>✓ Dedicated Support</li>
                        </ul>
                        <button style={{ marginTop: 'auto', padding: '12px', background: 'var(--bg-surface-hover)', color: 'var(--dark)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Contact Sales</button>
                    </div>
                </div>

                <TrustSection />
            </main>
            <LandingFooter />
        </div>
    );
};

export default PricingPage;
