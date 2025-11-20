import React from 'react';
import styles from '../../../pages/LandingPage.module.css';

const HowToSection: React.FC = () => {
    const features = [
        {
            title: "Floor plan design made easy – create, edit, or upload",
            desc: (
                <>
                    Design your layout your way — start fresh or upload a plan. Sketch ideas in the{' '}
                    <a href="#" className={styles.featureLink}>2D floor planner</a> and explore{' '}
                    <a href="#" className={styles.featureLink}>AI-powered layouts</a> for smarter, faster planning.
                </>
            ),
            video: "/movie/workflow-floor-plan.mp4"
        },
        {
            title: "Plan layouts and decorate with our 3D home design tool",
            desc: (
                <>
                    Bring your vision to life with 60,000+{' '}
                    <a href="#" className={styles.featureLink}>3D models</a> and decor options. Mix and match styles, textures, and furniture to personalize every detail and design a home that truly reflects your taste.
                </>
            ),
            video: "/movie/workflow-3d-home-design.mp4"
        },
        {
            title: "Online 3D render to preview interior designs instantly",
            desc: (
                <>
                    Visualize your home instantly with the{' '}
                    <a href="#" className={styles.featureLink}>3D render home</a> tool and experience{' '}
                    <a href="#" className={styles.featureLink}>real-time rendering</a> for lifelike design previews.
                </>
            ),
            video: "/movie/workflow-3d-render.mp4"
        },
        {
            title: "AI interior design to create smart layouts",
            desc: (
                <>
                    Explore smarter workflows with the{' '}
                    <a href="#" className={styles.featureLink}>AI home designer</a>. Instantly generate layouts, try different styles, and take a virtual walkthrough to unlock new ideas and avoid costly mistakes.
                </>
            ),
            video: "/movie/workflow-ai-interior-design.mp4"
        }
    ];

    return (
        <section className={styles.sectionAlt}>
            <div className={styles.containerInner}>
                <h2 className={styles.sectionTitle}>How to design a home online for free</h2>
                <p className={styles.sectionSubtitle}>
                    Explore free design templates for bedrooms, living rooms, kitchens, and more—easy to use and ready to customize.
                </p>

                <div className={styles.featureGrid}>
                    {features.map((feature, index) => (
                        <div key={index} className={styles.featureCard}>
                            <div className={styles.featureContent}>
                                <h3 className={styles.featureTitle}>{feature.title}</h3>
                                <p className={styles.featureDesc}>{feature.desc}</p>
                            </div>
                            <div className={styles.featureImage}>
                                <video autoPlay loop muted playsInline>
                                    <source src={feature.video} type="video/mp4" />
                                </video>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default HowToSection;
