import React, { useState } from 'react';
import styles from './CustomModelingPanel.module.css';

interface CustomModelingPanelProps {
  onClose: () => void;
  onSelectModel: (modelType: string, category: string) => void;
}

interface ModelItem {
  id: string;
  name: string;
  icon: React.ReactNode;
}

const CustomModelingPanel: React.FC<CustomModelingPanelProps> = ({ onClose, onSelectModel }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    baseModel: true,
    scenarioModels: true,
    lighting: false,
    furniture: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const baseModels: ModelItem[] = [
    {
      id: 'rectangle',
      name: 'Rectangle',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="6" y="10" width="28" height="20" rx="2" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'circle',
      name: 'Circle',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="14" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'polygon',
      name: 'Polygon',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <polygon points="20,4 36,15 32,34 8,34 4,15" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'star',
      name: 'Star',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <polygon points="20,4 24,16 36,16 26,24 30,36 20,28 10,36 14,24 4,16 16,16" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'cube',
      name: 'Cube',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M20 6L34 14V26L20 34L6 26V14L20 6Z" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <path d="M20 6L34 14L20 22L6 14L20 6Z" fill="var(--model-light)"/>
          <path d="M6 14L20 22V34L6 26V14Z" fill="var(--model-fill)"/>
          <path d="M34 14L20 22V34L34 26V14Z" fill="var(--model-dark)"/>
        </svg>
      ),
    },
    {
      id: 'sphere',
      name: 'Sphere',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <defs>
            <radialGradient id="sphereGrad" cx="30%" cy="30%">
              <stop offset="0%" stopColor="var(--model-light)"/>
              <stop offset="100%" stopColor="var(--model-dark)"/>
            </radialGradient>
          </defs>
          <circle cx="20" cy="20" r="14" fill="url(#sphereGrad)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="20" rx="14" ry="5" fill="none" stroke="var(--model-stroke)" strokeWidth="0.8" opacity="0.5"/>
          <ellipse cx="20" cy="20" rx="5" ry="14" fill="none" stroke="var(--model-stroke)" strokeWidth="0.8" opacity="0.5"/>
        </svg>
      ),
    },
    {
      id: 'cylinder',
      name: 'Cylinder',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <ellipse cx="20" cy="10" rx="12" ry="5" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <path d="M8 10V30C8 32.76 13.37 35 20 35C26.63 35 32 32.76 32 30V10" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="30" rx="12" ry="5" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'cone',
      name: 'Cone',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M20 5L8 32C8 34.76 13.37 37 20 37C26.63 37 32 34.76 32 32L20 5Z" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="32" rx="12" ry="5" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <path d="M20 5L8 32" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <path d="M20 5L32 32" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: 'torus',
      name: 'Torus',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <ellipse cx="20" cy="20" rx="16" ry="8" fill="none" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="20" rx="8" ry="4" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <path d="M4 20C4 16 11 12 20 12C29 12 36 16 36 20" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
        </svg>
      ),
    },
    {
      id: '3dtext',
      name: '3D Text',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <text x="8" y="28" fontSize="20" fontWeight="bold" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="0.8">A</text>
          <text x="10" y="26" fontSize="20" fontWeight="bold" fill="var(--model-light)">A</text>
        </svg>
      ),
    },
  ];

  const scenarioModels: ModelItem[] = [
    {
      id: 'lightStrip',
      name: 'Light Strip',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="8" y="16" width="24" height="8" rx="2" fill="var(--model-accent)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="10" y="18" width="4" height="4" rx="1" fill="white" opacity="0.8"/>
          <rect x="16" y="18" width="4" height="4" rx="1" fill="white" opacity="0.8"/>
          <rect x="22" y="18" width="4" height="4" rx="1" fill="white" opacity="0.8"/>
          <rect x="28" y="18" width="2" height="4" rx="1" fill="white" opacity="0.8"/>
        </svg>
      ),
    },
    {
      id: 'continuousLight',
      name: 'LED Strip',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M6 20H34" stroke="var(--model-accent)" strokeWidth="4" strokeLinecap="round"/>
          <path d="M6 20H34" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          <circle cx="8" cy="20" r="2" fill="white"/>
          <circle cx="20" cy="20" r="2" fill="white"/>
          <circle cx="32" cy="20" r="2" fill="white"/>
        </svg>
      ),
    },
    {
      id: 'doubleStairs',
      name: 'Double Stairs',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M6 32H14V26H20V20H26V14H34V8" fill="none" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="6" y="26" width="8" height="6" fill="var(--model-fill)"/>
          <rect x="14" y="20" width="6" height="6" fill="var(--model-light)"/>
          <rect x="20" y="14" width="6" height="6" fill="var(--model-fill)"/>
          <rect x="26" y="8" width="8" height="6" fill="var(--model-light)"/>
        </svg>
      ),
    },
    {
      id: 'spiralStairs',
      name: 'Spiral Stairs',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <ellipse cx="20" cy="20" rx="14" ry="6" fill="none" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <path d="M20 8V32" stroke="var(--model-stroke)" strokeWidth="2"/>
          <path d="M20 20L34 16" stroke="var(--model-fill)" strokeWidth="3"/>
          <path d="M20 20L6 24" stroke="var(--model-light)" strokeWidth="3"/>
          <path d="M20 14L30 12" stroke="var(--model-fill)" strokeWidth="2.5"/>
          <path d="M20 26L10 28" stroke="var(--model-light)" strokeWidth="2.5"/>
          <circle cx="20" cy="20" r="3" fill="var(--model-dark)"/>
        </svg>
      ),
    },
    {
      id: 'foldingStairs',
      name: 'Folding Stairs',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M8 34L8 28L16 28L16 22L24 22L24 16L32 16L32 6" stroke="var(--model-stroke)" strokeWidth="1.5" fill="none"/>
          <rect x="8" y="28" width="8" height="6" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="16" y="22" width="8" height="6" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="24" y="16" width="8" height="6" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="24" y="6" width="8" height="10" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1"/>
        </svg>
      ),
    },
    {
      id: 'singleStairs',
      name: 'Single Stairs',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="10" y="30" width="20" height="4" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="10" y="24" width="20" height="4" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="10" y="18" width="20" height="4" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="10" y="12" width="20" height="4" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="10" y="6" width="20" height="4" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1"/>
        </svg>
      ),
    },
  ];

  const lightingModels: ModelItem[] = [
    {
      id: 'spotLight',
      name: 'Spot Light',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M14 8H26L30 20H10L14 8Z" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="20" rx="10" ry="3" fill="var(--model-accent)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <path d="M14 23L10 36M26 23L30 36M20 23V36" stroke="var(--model-accent)" strokeWidth="1.5" opacity="0.5" strokeDasharray="2 2"/>
        </svg>
      ),
    },
    {
      id: 'pendantLight',
      name: 'Pendant',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <path d="M20 4V12" stroke="var(--model-stroke)" strokeWidth="2"/>
          <path d="M12 12H28L24 28H16L12 12Z" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="28" rx="4" ry="2" fill="var(--model-accent)"/>
        </svg>
      ),
    },
    {
      id: 'ceilingLight',
      name: 'Ceiling Light',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="8" y="8" width="24" height="6" rx="2" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="10" y="14" width="20" height="3" fill="var(--model-accent)" opacity="0.8"/>
          <path d="M12 17L8 32M28 17L32 32M20 17V32" stroke="var(--model-accent)" strokeWidth="1" opacity="0.4" strokeDasharray="2 2"/>
        </svg>
      ),
    },
    {
      id: 'wallSconce',
      name: 'Wall Sconce',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="6" y="10" width="6" height="20" rx="1" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <path d="M12 14H24C26 14 28 16 28 18V22C28 24 26 26 24 26H12" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <ellipse cx="20" cy="20" rx="4" ry="4" fill="var(--model-accent)"/>
        </svg>
      ),
    },
  ];

  const furnitureModels: ModelItem[] = [
    {
      id: 'table',
      name: 'Table',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="6" y="12" width="28" height="4" rx="1" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="8" y="16" width="3" height="18" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="29" y="16" width="3" height="18" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1"/>
        </svg>
      ),
    },
    {
      id: 'chair',
      name: 'Chair',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="10" y="4" width="20" height="16" rx="2" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="10" y="20" width="20" height="6" rx="1" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="12" y="26" width="3" height="10" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="25" y="26" width="3" height="10" fill="var(--model-dark)" stroke="var(--model-stroke)" strokeWidth="1"/>
        </svg>
      ),
    },
    {
      id: 'sofa',
      name: 'Sofa',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="4" y="14" width="32" height="14" rx="3" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="6" y="10" width="28" height="8" rx="2" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="4" y="28" width="6" height="6" rx="1" fill="var(--model-dark)"/>
          <rect x="30" y="28" width="6" height="6" rx="1" fill="var(--model-dark)"/>
        </svg>
      ),
    },
    {
      id: 'bed',
      name: 'Bed',
      icon: (
        <svg viewBox="0 0 40 40" fill="none">
          <rect x="4" y="16" width="32" height="16" rx="2" fill="var(--model-fill)" stroke="var(--model-stroke)" strokeWidth="1.5"/>
          <rect x="4" y="8" width="10" height="12" rx="2" fill="var(--model-light)" stroke="var(--model-stroke)" strokeWidth="1"/>
          <rect x="4" y="32" width="4" height="4" fill="var(--model-dark)"/>
          <rect x="32" y="32" width="4" height="4" fill="var(--model-dark)"/>
        </svg>
      ),
    },
  ];

  const renderModelGrid = (models: ModelItem[], category: string) => (
    <div className={styles.modelGrid}>
      {models.map((model) => (
        <button
          key={model.id}
          className={styles.modelCard}
          onClick={() => onSelectModel(model.id, category)}
          title={model.name}
        >
          <div className={styles.modelIcon}>{model.icon}</div>
          <span className={styles.modelName}>{model.name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Modeling Library</h3>
        <button className={styles.closeBtn} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div className={styles.content}>
        {/* Base Model Section */}
        <div className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('baseModel')}
          >
            <span>Base Model</span>
            <svg
              className={`${styles.chevron} ${expandedSections.baseModel ? styles.expanded : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {expandedSections.baseModel && renderModelGrid(baseModels, 'base')}
        </div>

        {/* Scenario-based Models Section */}
        <div className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('scenarioModels')}
          >
            <span>Scenario Models</span>
            <svg
              className={`${styles.chevron} ${expandedSections.scenarioModels ? styles.expanded : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {expandedSections.scenarioModels && renderModelGrid(scenarioModels, 'scenario')}
        </div>

        {/* Lighting Section */}
        <div className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('lighting')}
          >
            <span>Lighting</span>
            <svg
              className={`${styles.chevron} ${expandedSections.lighting ? styles.expanded : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {expandedSections.lighting && renderModelGrid(lightingModels, 'lighting')}
        </div>

        {/* Furniture Section */}
        <div className={styles.section}>
          <button
            className={styles.sectionHeader}
            onClick={() => toggleSection('furniture')}
          >
            <span>Furniture</span>
            <svg
              className={`${styles.chevron} ${expandedSections.furniture ? styles.expanded : ''}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {expandedSections.furniture && renderModelGrid(furnitureModels, 'furniture')}
        </div>
      </div>
    </div>
  );
};

export default CustomModelingPanel;
