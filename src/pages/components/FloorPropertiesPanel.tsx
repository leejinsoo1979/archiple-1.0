import React, { useState } from 'react';
import styles from './FloorPropertiesPanel.module.css';
import { MdDragIndicator, MdEdit, MdKeyboardArrowUp, MdKeyboardArrowDown } from 'react-icons/md';

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

export interface FloorProperties {
  id: string;
  name: string;
  roomType: string;
  // Control
  controlPoint: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right' | 'center';
  horizontalOffset: number;
  verticalOffset: number;
  angle: number;
  // Gap
  gap: number;
  gapType: 'custom' | 'material';
  gapColor: string;
  // Pattern
  patternWidth: number;
  patternHeight: number;
  materialImage: string;
}

interface FloorPropertiesPanelProps {
  room: {
    id: string;
    name: string;
    area: number;
  };
  properties: FloorProperties;
  onPropertiesChange: (properties: FloorProperties) => void;
  onClose: () => void;
  // Level settings
  floors?: string[];
  currentFloor?: string;
  onCurrentFloorChange?: (floor: string) => void;
  wallHeight: number;
  onWallHeightChange: (height: number) => void;
  wallThickness: number;
  onWallThicknessChange: (thickness: number) => void;
  floorThickness: number;
  onFloorThicknessChange: (thickness: number) => void;
}

const roomTypes = [
  'Customized',
  'Living Room',
  'Bedroom',
  'Kitchen',
  'Bathroom',
  'Office',
  'Dining Room',
  'Hallway',
  'Storage',
];

const controlPoints = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'center', label: 'Center' },
];

export const FloorPropertiesPanel: React.FC<FloorPropertiesPanelProps> = ({
  room,
  properties,
  onPropertiesChange,
  onClose,
  floors = ['Level 1'],
  currentFloor = 'Level 1',
  onCurrentFloorChange,
  wallHeight,
  onWallHeightChange,
  wallThickness,
  onWallThicknessChange,
  floorThickness,
  onFloorThicknessChange,
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'level'>('room');
  const [controlOpen, setControlOpen] = useState(true);
  const [gapOpen, setGapOpen] = useState(true);
  const [patternOpen, setPatternOpen] = useState(true);

  const updateProperty = <K extends keyof FloorProperties>(key: K, value: FloorProperties[K]) => {
    onPropertiesChange({
      ...properties,
      [key]: value,
    });
  };

  return (
    <div className={styles.panel}>
      {/* Header with tabs */}
      <div className={styles.header}>
        <div className={styles.dragHandle}>
          <MdDragIndicator />
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'room' ? styles.active : ''}`}
            onClick={() => setActiveTab('room')}
          >
            {properties.name || 'Untitled'}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'level' ? styles.active : ''}`}
            onClick={() => setActiveTab('level')}
          >
            Level
          </button>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'room' ? (
          <>
            {/* Room Type */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Room Type</label>
              <select
                className={styles.select}
                value={properties.roomType}
                onChange={(e) => updateProperty('roomType', e.target.value)}
              >
                {roomTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Room Name */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Room Name</label>
              <div className={styles.inputWithCount}>
                <input
                  type="text"
                  className={styles.input}
                  value={properties.name}
                  onChange={(e) => updateProperty('name', e.target.value.slice(0, 60))}
                  maxLength={60}
                />
                <span className={styles.charCount}>{properties.name.length}/60</span>
              </div>
            </div>

            {/* Area Settings */}
            <div className={styles.areaSection}>
              <h4 className={styles.sectionTitle}>Area Settings</h4>
              <p className={styles.areaDescription}>
                Support Border Tile, Chair Rail Molding, Tile Medallion, etc.
              </p>
              <button className={styles.editPavingBtn}>
                <MdEdit className={styles.editIcon} />
                Edit paving
              </button>
            </div>

            {/* Control Section */}
            <div className={styles.collapsibleSection}>
              <button
                className={styles.sectionHeader}
                onClick={() => setControlOpen(!controlOpen)}
              >
                <span>Control</span>
                {controlOpen ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
              </button>
              {controlOpen && (
                <div className={styles.sectionContent}>
                  <select
                    className={styles.select}
                    value={properties.controlPoint}
                    onChange={(e) => updateProperty('controlPoint', e.target.value as any)}
                  >
                    {controlPoints.map((point) => (
                      <option key={point.value} value={point.value}>{point.label}</option>
                    ))}
                  </select>

                  <div className={styles.sliderGroup}>
                    <label>Horizontal Offset</label>
                    <div className={styles.sliderRow}>
                      <input
                        type="range"
                        min="-500"
                        max="500"
                        value={properties.horizontalOffset}
                        onChange={(e) => updateProperty('horizontalOffset', parseInt(e.target.value))}
                        className={styles.slider}
                      />
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          value={properties.horizontalOffset}
                          onChange={(e) => updateProperty('horizontalOffset', parseInt(e.target.value) || 0)}
                          className={styles.numberInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.sliderGroup}>
                    <label>Vertical Offset</label>
                    <div className={styles.sliderRow}>
                      <input
                        type="range"
                        min="-500"
                        max="500"
                        value={properties.verticalOffset}
                        onChange={(e) => updateProperty('verticalOffset', parseInt(e.target.value))}
                        className={styles.slider}
                      />
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          value={properties.verticalOffset}
                          onChange={(e) => updateProperty('verticalOffset', parseInt(e.target.value) || 0)}
                          className={styles.numberInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.sliderGroup}>
                    <label>Angle</label>
                    <div className={styles.sliderRow}>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={properties.angle}
                        onChange={(e) => updateProperty('angle', parseInt(e.target.value))}
                        className={styles.slider}
                      />
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          value={properties.angle}
                          onChange={(e) => updateProperty('angle', parseInt(e.target.value) || 0)}
                          className={styles.numberInput}
                        />
                        <span className={styles.unit}>°</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gap Section */}
            <div className={styles.collapsibleSection}>
              <button
                className={styles.sectionHeader}
                onClick={() => setGapOpen(!gapOpen)}
              >
                <span>Gap</span>
                {gapOpen ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
              </button>
              {gapOpen && (
                <div className={styles.sectionContent}>
                  <div className={styles.sliderGroup}>
                    <label>Gap</label>
                    <div className={styles.sliderRow}>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        value={properties.gap}
                        onChange={(e) => updateProperty('gap', parseInt(e.target.value))}
                        className={styles.slider}
                      />
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          value={properties.gap}
                          onChange={(e) => updateProperty('gap', parseInt(e.target.value) || 0)}
                          className={styles.numberInput}
                        />
                        <span className={styles.unit}>mm</span>
                      </div>
                    </div>
                  </div>

                  <div className={styles.gapTypeRow}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="gapType"
                        checked={properties.gapType === 'custom'}
                        onChange={() => updateProperty('gapType', 'custom')}
                        className={styles.radio}
                      />
                      <span className={styles.radioCircle} />
                      Custom
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="gapType"
                        checked={properties.gapType === 'material'}
                        onChange={() => updateProperty('gapType', 'material')}
                        className={styles.radio}
                      />
                      <span className={styles.radioCircle} />
                      Material
                    </label>
                    <div
                      className={styles.colorPicker}
                      style={{ backgroundColor: properties.gapColor }}
                      onClick={() => {
                        // TODO: Open color picker
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Pattern Section */}
            <div className={styles.collapsibleSection}>
              <button
                className={styles.sectionHeader}
                onClick={() => setPatternOpen(!patternOpen)}
              >
                <span>Pattern</span>
                {patternOpen ? <MdKeyboardArrowUp /> : <MdKeyboardArrowDown />}
              </button>
              {patternOpen && (
                <div className={styles.sectionContent}>
                  <div className={styles.patternPreview}>
                    <div className={styles.patternDiagram}>
                      <div className={styles.patternDimensions}>
                        <span className={styles.widthLabel}>{properties.patternWidth}</span>
                        <span className={styles.heightLabel}>{properties.patternHeight}</span>
                      </div>
                      <div className={styles.patternTile} />
                    </div>
                  </div>
                  {properties.materialImage && (
                    <div className={styles.materialThumbnail}>
                      <img src={properties.materialImage} alt="Material" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.levelContent}>
            {/* Properties Section - Same as LevelPropertiesPanel */}
            <div className={styles.levelSection}>
              <div className={styles.levelSectionHeader}>
                <span className={styles.levelSectionTitle}>Properties</span>
                <MdKeyboardArrowUp className={styles.levelCollapseIcon} />
              </div>

              {/* Add Level */}
              <div className={styles.levelFormRow}>
                <label className={styles.levelLabel}>Add Level</label>
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
              <div className={styles.levelFormRow}>
                <label className={styles.levelLabel}>Current floor</label>
                <select
                  className={styles.levelSelect}
                  value={currentFloor}
                  onChange={(e) => onCurrentFloorChange?.(e.target.value)}
                >
                  {floors.map((floor) => (
                    <option key={floor} value={floor}>{floor}</option>
                  ))}
                </select>
              </div>

              {/* Area */}
              <div className={styles.levelFormRow}>
                <label className={styles.levelLabel}>Area</label>
                <div className={styles.levelAreaDisplay}>
                  <span className={styles.levelAreaValue}>{room.area.toFixed(2)}</span>
                  <span className={styles.levelUnit}>m²</span>
                </div>
              </div>

              {/* Height (Wall Height) */}
              <div className={styles.levelFormRow}>
                <label className={styles.levelLabel}>Height</label>
                <div className={styles.levelInputWithUnit}>
                  <input
                    type="number"
                    className={styles.levelInput}
                    value={wallHeight}
                    onChange={(e) => onWallHeightChange(parseInt(e.target.value) || 2400)}
                  />
                  <span className={styles.levelUnit}>mm</span>
                </div>
              </div>

              {/* Wall Thickness */}
              <div className={styles.levelFormRow}>
                <label className={styles.levelLabel}>Wall thickness</label>
                <div className={styles.levelInputWithUnit}>
                  <input
                    type="number"
                    className={styles.levelInput}
                    value={wallThickness}
                    onChange={(e) => onWallThicknessChange(parseInt(e.target.value) || 200)}
                  />
                  <span className={styles.levelUnit}>mm</span>
                </div>
              </div>

              {/* Floor Thickness */}
              <div className={styles.levelFormRowVertical}>
                <label className={styles.levelLabel}>Floor thickness</label>
                <div className={styles.levelSliderRow}>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    value={floorThickness}
                    onChange={(e) => onFloorThicknessChange(parseInt(e.target.value))}
                    className={styles.levelSlider}
                  />
                  <div className={styles.levelInputWithUnit}>
                    <input
                      type="number"
                      className={styles.levelInputSmall}
                      value={floorThickness}
                      onChange={(e) => onFloorThicknessChange(parseInt(e.target.value) || 120)}
                    />
                    <span className={styles.levelUnit}>mm</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FloorPropertiesPanel;
