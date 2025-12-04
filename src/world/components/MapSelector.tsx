import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import styles from './MapSelector.module.css';

interface MapSelectorProps {
    onAreaSelected: (bbox: [number, number, number, number]) => void;
}

export const MapSelector: React.FC<MapSelectorProps> = ({ onAreaSelected }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [lng] = useState(126.9780); // Seoul City Hall
    const [lat] = useState(37.5665);
    const [zoom] = useState(14);

    useEffect(() => {
        if (map.current) return; // initialize map only once
        if (!mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: 'https://demotiles.maplibre.org/style.json', // Free demo style
            center: [lng, lat],
            zoom: zoom
        });

        map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        // Add a simple box selection interaction (mockup for now)
        // In a real implementation, we would use Mapbox Draw or custom interaction
        map.current.on('load', () => {
            console.log('Map loaded');
        });

    }, [lng, lat, zoom]);

    return (
        <div className={styles.wrap}>
            <div ref={mapContainer} className={styles.map} />
            <div className={styles.overlay}>
                <div className={styles.instruction}>
                    Drag to select area (Coming Soon)
                </div>
            </div>
        </div>
    );
};
