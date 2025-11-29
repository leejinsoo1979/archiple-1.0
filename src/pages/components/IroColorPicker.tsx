import React, { useEffect, useRef } from 'react';
import iro from '@jaames/iro';

interface IroColorPickerProps {
    color: string;
    onChange: (color: string) => void;
}

export const IroColorPicker: React.FC<IroColorPickerProps> = ({ color, onChange }) => {
    const elRef = useRef<HTMLDivElement>(null);
    const colorPickerRef = useRef<iro.ColorPicker | null>(null);

    useEffect(() => {
        if (!elRef.current) return;

        // Clear container to prevent duplicates (React Strict Mode fix)
        elRef.current.innerHTML = '';

        // Initialize iro.js color picker
        colorPickerRef.current = iro.ColorPicker(elRef.current, {
            width: 220,
            color: color,
            layout: [
                {
                    component: iro.ui.Wheel,
                    options: {}
                },
                {
                    component: iro.ui.Slider,
                    options: {
                        sliderType: 'value' // Value slider below wheel
                    }
                }
            ]
        });

        // Handle color change
        colorPickerRef.current.on('color:change', (color: iro.Color) => {
            onChange(color.hexString);
        });

        return () => {
            // Cleanup not strictly necessary for iro.js but good practice if we could destroy it
            // iro.js doesn't have a destroy method on the instance, but we can clear the element
            if (elRef.current) elRef.current.innerHTML = '';
        };
    }, []);

    // Update color if prop changes externally
    useEffect(() => {
        if (colorPickerRef.current && colorPickerRef.current.color.hexString !== color) {
            // Avoid infinite loop if color format differs slightly
            try {
                colorPickerRef.current.color.set(color);
            } catch (e) {
                // Ignore invalid color updates
            }
        }
    }, [color]);

    return <div ref={elRef} style={{ display: 'flex', justifyContent: 'center', padding: '10px' }} />;
};
