import React from 'react';
import styles from '../CustomModelingPage.module.css';

interface ModelingContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
    onAction: (action: string) => void;
    selectionCount: number;
    hasFaces: boolean;
    hasEdges: boolean;
}

export const ModelingContextMenu: React.FC<ModelingContextMenuProps> = ({
    x,
    y,
    onClose,
    onAction,
    selectionCount,
    hasFaces,
    hasEdges,
}) => {
    if (selectionCount === 0) return null;

    return (
        <div
            className={styles.contextMenu}
            style={{ top: y, left: x }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className={styles.contextMenuItem} onClick={() => onAction('invert')}>
                Invert Selection
            </div>

            <div className={styles.contextMenuSeparator} />

            {hasEdges && (
                <>
                    <div className={styles.contextMenuItem} onClick={() => onAction('connected-faces')}>
                        Select Connected Faces
                    </div>
                    <div className={styles.contextMenuItem} onClick={() => onAction('all-connected')}>
                        Select All Connected
                    </div>
                </>
            )}

            {hasFaces && (
                <>
                    <div className={styles.contextMenuItem} onClick={() => onAction('bounding-edges')}>
                        Select Bounding Edges
                    </div>
                    <div className={styles.contextMenuItem} onClick={() => onAction('same-material')}>
                        Select Same Material
                    </div>
                </>
            )}

            <div className={styles.contextMenuSeparator} />

            <div className={styles.contextMenuItem} onClick={() => onAction('delete')}>
                Delete
            </div>
        </div>
    );
};
