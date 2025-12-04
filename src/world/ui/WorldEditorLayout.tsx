import React, { ReactNode } from 'react';
import styles from './WorldEditorLayout.module.css';

interface WorldEditorLayoutProps {
    sidebar: ReactNode;
    mainContent: ReactNode;
    overlay?: ReactNode;
}

export const WorldEditorLayout: React.FC<WorldEditorLayoutProps> = ({
    sidebar,
    mainContent,
    overlay
}) => {
    return (
        <div className={styles.container}>
            <aside className={styles.sidebar}>
                {sidebar}
            </aside>
            <main className={styles.mainContent}>
                {mainContent}
                {overlay && <div className={styles.overlay}>{overlay}</div>}
            </main>
        </div>
    );
};
