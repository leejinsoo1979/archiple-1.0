import React from 'react';
import styles from './LevelPropertiesPanel.module.css';
import { MdDragIndicator, MdKeyboardArrowUp, MdKeyboardArrowDown } from 'react-icons/md';

// Custom Add Level Icons matching reference design
const AddLevelUpIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Bottom layer */}
    <path d="M3 17L12 21L21 17L12 13L3 17Z" fill="currentColor" opacity="0.3"/>
    {/* Middle layer */}
    <path d="M3 13L12 17L21 13L12 9L3 13Z" fill="currentColor" opacity="0.5"/>
    {/* Top layer */}
    <path d="M3 9L12 13L21 9L12 5L3 9Z" fill="currentColor" opacity="0.8"/>
    {/* Plus sign (top right) */}
    <circle cx="19" cy="5" r="4" fill="white"/>
    <path d="M19 3V7M17 5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const AddLevelDownIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Top layer */}
    <path d="M3 7L12 11L21 7L12 3L3 7Z" fill="currentColor" opacity="0.8"/>
    {/* Middle layer */}
    <path d="M3 11L12 15L21 11L12 7L3 11Z" fill="currentColor" opacity="0.5"/>
    {/* Bottom layer */}
    <path d="M3 15L12 19L21 15L12 11L3 15Z" fill="currentColor" opacity="0.3"/>
    {/* Plus sign (bottom right) */}
    <circle cx="19" cy="19" r="4" fill="white"/>
    <path d="M19 17V21M17 19H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export interface LevelProperties {
  currentFloor: string;
  area: number;
  height: number;
  floorThickness: number;
}

interface LevelPropertiesPanelProps {
  properties: LevelProperties;
  onPropertiesChange: (properties: LevelProperties) => void;
  floors?: string[];
  // Wall settings that sync with viewer
  wallHeight: number;
  onWallHeightChange: (height: number) => void;
  wallThickness: number;
  onWallThicknessChange: (thickness: number) => void;
  // Total area from all rooms
  totalArea?: number;
}

export const LevelPropertiesPanel: React.FC<LevelPropertiesPanelProps> = ({
  properties,
  onPropertiesChange,
  floors = ['Level 1'],
  wallHeight,
  onWallHeightChange,
  wallThickness,
  onWallThicknessChange,
  totalArea = 0,
}) => {
  const updateProperty = <K extends keyof LevelProperties>(key: K, value: LevelProperties[K]) => {
    onPropertiesChange({
      ...properties,
      [key]: value,
    });
  };

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.dragHandle}>
          <MdDragIndicator />
        </div>
        <h3 className={styles.title}>Level</h3>
      </div>

      <div className={styles.content}>
        {/* Properties Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Properties</span>
            <MdKeyboardArrowUp className={styles.collapseIcon} />
          </div>

          {/* Add Level */}
          <div className={styles.formRow}>
            <label className={styles.label}>Add Level</label>
            <div className={styles.levelButtons}>
              <button className={styles.levelBtn} title="Add level above">
                <AddLevelUpIcon />
              </button>
              <button className={styles.levelBtn} title="Add level below">
                <AddLevelDownIcon />
              </button>
            </div>
          </div>

          {/* Current Floor */}
          <div className={styles.formRow}>
            <label className={styles.label}>Current floor</label>
            <select
              className={styles.select}
              value={properties.currentFloor}
              onChange={(e) => updateProperty('currentFloor', e.target.value)}
            >
              {floors.map((floor) => (
                <option key={floor} value={floor}>{floor}</option>
              ))}
            </select>
          </div>

          {/* Area - Total area from all rooms */}
          <div className={styles.formRow}>
            <label className={styles.label}>Area</label>
            <div className={styles.areaDisplay}>
              <span className={styles.areaValue}>{totalArea.toFixed(2)}</span>
              <span className={styles.unit}>m²</span>
            </div>
          </div>

          {/* Height (Wall Height) */}
          <div className={styles.formRow}>
            <label className={styles.label}>Height</label>
            <div className={styles.inputWithUnit}>
              <input
                type="number"
                className={styles.input}
                value={wallHeight}
                onChange={(e) => onWallHeightChange(parseInt(e.target.value) || 2400)}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>

          {/* Wall Thickness */}
          <div className={styles.formRow}>
            <label className={styles.label}>Wall thickness</label>
            <div className={styles.inputWithUnit}>
              <input
                type="number"
                className={styles.input}
                value={wallThickness}
                onChange={(e) => onWallThicknessChange(parseInt(e.target.value) || 200)}
              />
              <span className={styles.unit}>mm</span>
            </div>
          </div>

          {/* Floor Thickness */}
          <div className={styles.formRowVertical}>
            <label className={styles.label}>Floor thickness</label>
            <div className={styles.sliderRow}>
              <input
                type="range"
                min="50"
                max="500"
                value={properties.floorThickness}
                onChange={(e) => updateProperty('floorThickness', parseInt(e.target.value))}
                className={styles.slider}
              />
              <div className={styles.inputWithUnit}>
                <input
                  type="number"
                  className={styles.inputSmall}
                  value={properties.floorThickness}
                  onChange={(e) => updateProperty('floorThickness', parseInt(e.target.value) || 120)}
                />
                <span className={styles.unit}>mm</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelPropertiesPanel;
