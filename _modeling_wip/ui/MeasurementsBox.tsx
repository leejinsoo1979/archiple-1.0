/**
 * MeasurementsBox Component - SketchUp-style input field
 *
 * Handles precise input for drawing tools:
 * - Length input: "1000", "1m", "3ft", "24in"
 * - Absolute coordinates: [x, y, z] - absolute world position
 * - Relative coordinates: <x, y, z> - relative to start point
 *
 * Features:
 * - Auto-focus on key input (like SketchUp VCB)
 * - Unit conversion (mm, m, cm, in, ft)
 * - Real-time validation
 * - Enter to apply, Escape to cancel
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Vector3 } from '@babylonjs/core';
import { useInferenceStore } from '../stores/inferenceStore';
import { parseLength, parseCoordinates, formatLength } from '../types';

export interface MeasurementsBoxProps {
  onApply: (value: MeasurementResult) => void;
  onCancel?: () => void;
  visible?: boolean;
  placeholder?: string;
  currentLength?: number;
  startPoint?: Vector3 | null;
}

export interface MeasurementResult {
  type: 'length' | 'absolute' | 'relative';
  length?: number;              // For length input
  position?: Vector3;           // For coordinate input
  raw: string;                  // Original input string
}

export const MeasurementsBox: React.FC<MeasurementsBoxProps> = ({
  onApply,
  onCancel,
  visible = true,
  placeholder = 'Length',
  currentLength = 0,
  startPoint = null,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const measurementsBox = useInferenceStore((state) => state.measurementsBox);
  const setMeasurementsBox = useInferenceStore((state) => state.setMeasurementsBox);

  // Display current length when not editing
  const displayValue = isEditing
    ? inputValue
    : formatLength(currentLength);

  // Handle key input to auto-focus (SketchUp VCB behavior)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't capture if already focused on an input
      if (document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement) {
        return;
      }

      // Capture numeric and special character input
      if (
        !isEditing &&
        (e.key.match(/^[0-9.\-\[\]<>,]$/) || e.key === '[' || e.key === '<')
      ) {
        setIsEditing(true);
        setInputValue(e.key);
        setError(null);
        inputRef.current?.focus();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isEditing]);

  // Handle input changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setError(null);

    // Real-time validation hint
    if (value.startsWith('[') && !value.endsWith(']')) {
      setError('Absolute: [x, y, z]');
    } else if (value.startsWith('<') && !value.endsWith('>')) {
      setError('Relative: <x, y, z>');
    }
  }, []);

  // Handle Enter key to apply
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInput();
    }
  }, [inputValue, startPoint]);

  // Apply the input value
  const applyInput = useCallback(() => {
    const trimmed = inputValue.trim();

    if (!trimmed) {
      cancelInput();
      return;
    }

    // Try parsing as coordinates first
    const coords = parseCoordinates(trimmed);
    if (coords) {
      if (coords.isAbsolute) {
        // Absolute coordinates [x, y, z]
        onApply({
          type: 'absolute',
          position: new Vector3(coords.values.x, coords.values.y, coords.values.z),
          raw: trimmed,
        });
      } else if (coords.isRelative && startPoint) {
        // Relative coordinates <x, y, z> - add to start point
        const relativePos = new Vector3(
          startPoint.x + coords.values.x,
          startPoint.y + coords.values.y,
          startPoint.z + coords.values.z
        );
        onApply({
          type: 'relative',
          position: relativePos,
          raw: trimmed,
        });
      } else if (coords.isRelative && !startPoint) {
        setError('No start point for relative coordinates');
        return;
      }
    } else {
      // Try parsing as length
      const length = parseLength(trimmed);
      if (length !== null && length > 0) {
        onApply({
          type: 'length',
          length,
          raw: trimmed,
        });
      } else {
        setError('Invalid input format');
        return;
      }
    }

    // Reset state
    setInputValue('');
    setIsEditing(false);
    setError(null);
    inputRef.current?.blur();
  }, [inputValue, startPoint, onApply]);

  // Cancel input
  const cancelInput = useCallback(() => {
    setInputValue('');
    setIsEditing(false);
    setError(null);
    inputRef.current?.blur();
    onCancel?.();
  }, [onCancel]);

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsEditing(true);
    setInputValue('');
  }, []);

  // Handle blur
  const handleBlur = useCallback(() => {
    if (!inputValue.trim()) {
      setIsEditing(false);
    }
  }, [inputValue]);

  if (!visible) return null;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '30px',
    right: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
  };

  const boxStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'white',
    border: isEditing ? '2px solid #0066cc' : '1px solid #888',
    borderRadius: '3px',
    padding: '4px 8px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    minWidth: '140px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: '#666',
    marginRight: '8px',
    minWidth: '45px',
  };

  const inputStyle: React.CSSProperties = {
    border: 'none',
    outline: 'none',
    fontSize: '13px',
    fontFamily: 'Monaco, Consolas, monospace',
    width: '100px',
    textAlign: 'right',
    backgroundColor: 'transparent',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: '10px',
    color: error?.startsWith('Invalid') ? '#cc0000' : '#666',
    fontStyle: 'italic',
  };

  const hintStyle: React.CSSProperties = {
    fontSize: '10px',
    color: '#888',
    marginTop: '2px',
  };

  return (
    <div style={containerStyle}>
      <div style={boxStyle}>
        <span style={labelStyle}>{placeholder}:</span>
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={inputStyle}
          placeholder="Type to enter"
        />
      </div>

      {error && <span style={errorStyle}>{error}</span>}

      {isEditing && (
        <div style={hintStyle}>
          Length: 1000, 1m | Absolute: [x,y,z] | Relative: &lt;x,y,z&gt;
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Compact Status Display
// ============================================================================

export interface MeasurementDisplayProps {
  length: number;
  unit?: 'mm' | 'm' | 'cm';
  angle?: number;
  visible?: boolean;
}

export const MeasurementDisplay: React.FC<MeasurementDisplayProps> = ({
  length,
  unit = 'mm',
  angle,
  visible = true,
}) => {
  if (!visible) return null;

  const style: React.CSSProperties = {
    position: 'absolute',
    bottom: '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '3px',
    fontSize: '13px',
    fontFamily: 'Monaco, Consolas, monospace',
    display: 'flex',
    gap: '16px',
    pointerEvents: 'none',
  };

  return (
    <div style={style}>
      <span>{formatLength(length, unit)}</span>
      {angle !== undefined && (
        <span>{angle.toFixed(1)}°</span>
      )}
    </div>
  );
};

export default MeasurementsBox;
