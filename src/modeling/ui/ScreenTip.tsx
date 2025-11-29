/**
 * ScreenTip Component - SketchUp-style inference tooltip
 *
 * Displays inference information near the cursor:
 * - Colored dot/square/X icons based on inference type
 * - Text label (e.g., "Endpoint", "On Red Axis")
 * - Follows cursor position with offset
 */

import React from 'react';
import { useInferenceStore } from '../stores/inferenceStore';

interface ScreenTipProps {
  offsetX?: number;
  offsetY?: number;
}

export const ScreenTip: React.FC<ScreenTipProps> = ({
  offsetX = 15,
  offsetY = 15,
}) => {
  const screenTip = useInferenceStore((state) => state.screenTip);

  if (!screenTip.visible || !screenTip.text) {
    return null;
  }

  const style: React.CSSProperties = {
    position: 'absolute',
    left: screenTip.position.x + offsetX,
    top: screenTip.position.y + offsetY,
    backgroundColor: 'rgba(255, 255, 240, 0.95)',
    border: '1px solid #888',
    borderRadius: '3px',
    padding: '3px 8px',
    fontSize: '12px',
    fontFamily: 'Arial, sans-serif',
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    pointerEvents: 'none',
    zIndex: 1000,
    boxShadow: '1px 1px 3px rgba(0,0,0,0.2)',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={style}>
      <InferenceIcon type={screenTip.icon} color={screenTip.color} />
      <span>{screenTip.text}</span>
    </div>
  );
};

// ============================================================================
// Inference Icon Component
// ============================================================================

interface InferenceIconProps {
  type?: 'dot' | 'square' | 'x' | 'line';
  color: string;
}

const InferenceIcon: React.FC<InferenceIconProps> = ({ type, color }) => {
  const size = 10;

  switch (type) {
    case 'dot':
      return (
        <svg width={size} height={size} viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="4" fill={color} />
        </svg>
      );

    case 'square':
      return (
        <svg width={size} height={size} viewBox="0 0 10 10">
          <rect x="1" y="1" width="8" height="8" fill={color} />
        </svg>
      );

    case 'x':
      return (
        <svg width={size} height={size} viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" stroke={color} strokeWidth="2" />
          <line x1="9" y1="1" x2="1" y2="9" stroke={color} strokeWidth="2" />
        </svg>
      );

    case 'line':
      return (
        <svg width={size} height={size} viewBox="0 0 10 10">
          <line x1="0" y1="5" x2="10" y2="5" stroke={color} strokeWidth="2" />
        </svg>
      );

    default:
      return null;
  }
};

// ============================================================================
// Status Bar Component
// ============================================================================

export const InferenceStatusBar: React.FC = () => {
  const lockedAxis = useInferenceStore((state) => state.lockedAxis);
  const linearMode = useInferenceStore((state) => state.linearMode);
  const shiftHeld = useInferenceStore((state) => state.shiftHeld);
  const primaryInference = useInferenceStore((state) => state.primaryInference);

  const style: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '24px',
    backgroundColor: '#f0f0f0',
    borderTop: '1px solid #ccc',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    fontSize: '12px',
    fontFamily: 'Arial, sans-serif',
    color: '#333',
    gap: '20px',
  };

  const getAxisColor = (axis: string): string => {
    switch (axis) {
      case 'red': return '#FF0000';
      case 'green': return '#00CC00';
      case 'blue': return '#0000FF';
      case 'magenta': return '#FF00FF';
      default: return '#888';
    }
  };

  const getAxisLabel = (axis: string): string => {
    switch (axis) {
      case 'red': return 'Red (X)';
      case 'green': return 'Green (Z)';
      case 'blue': return 'Blue (Y)';
      case 'magenta': return 'Parallel';
      default: return '';
    }
  };

  const getLinearModeLabel = (): string => {
    switch (linearMode) {
      case 'all_on': return '';
      case 'all_off': return 'Linear: OFF';
      case 'parallel_perpendicular_only': return 'Linear: Parallel/Perp';
    }
  };

  return (
    <div style={style}>
      {/* Axis Lock Status */}
      {lockedAxis !== 'none' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              backgroundColor: getAxisColor(lockedAxis),
            }}
          />
          <span style={{ fontWeight: 'bold' }}>
            Axis Lock: {getAxisLabel(lockedAxis)}
          </span>
        </div>
      )}

      {/* Shift Lock Status */}
      {shiftHeld && (
        <div style={{ color: '#666', fontWeight: 'bold' }}>
          [Shift Lock]
        </div>
      )}

      {/* Linear Mode Status */}
      {linearMode !== 'all_on' && (
        <div style={{ color: '#666' }}>
          {getLinearModeLabel()}
        </div>
      )}

      {/* Current Inference */}
      {primaryInference && !lockedAxis && (
        <div style={{ marginLeft: 'auto', color: '#555' }}>
          {primaryInference.screenTip}
        </div>
      )}

      {/* Keyboard Hints */}
      <div style={{ marginLeft: 'auto', color: '#999', fontSize: '11px' }}>
        Arrow Keys: Lock Axis | Shift: Lock Inference | Alt: Toggle Linear
      </div>
    </div>
  );
};

export default ScreenTip;
