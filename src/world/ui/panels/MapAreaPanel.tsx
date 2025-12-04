import React from 'react';
import styles from './MapAreaPanel.module.css';
import { MdSearch, MdLocationSearching } from 'react-icons/md';

interface MapAreaPanelProps {
    onSearch: (query: string) => void;
    onSelectCurrentLocation: () => void;
}

export const MapAreaPanel: React.FC<MapAreaPanelProps> = ({
    onSearch,
    onSelectCurrentLocation
}) => {
    return (
        <div className={styles.container}>
            <h3 className={styles.heading}>Select an Area</h3>
            <p className={styles.description}>
                Search for a location or drag the map to select the area you want to capture in 3D.
            </p>

            <div className={styles.searchBox}>
                <MdSearch className={styles.searchIcon} />
                <input
                    type="text"
                    placeholder="Search location..."
                    className={styles.searchInput}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            onSearch((e.target as HTMLInputElement).value);
                        }
                    }}
                />
            </div>

            <button className={styles.locationButton} onClick={onSelectCurrentLocation}>
                <MdLocationSearching />
                <span>Use Current Location</span>
            </button>

            <div className={styles.infoBox}>
                <h4>Selection Guide</h4>
                <ul>
                    <li>Max area size: 5km x 5km</li>
                    <li>Drag corners to resize</li>
                    <li>Click "Next" when ready</li>
                </ul>
            </div>
        </div>
    );
};
