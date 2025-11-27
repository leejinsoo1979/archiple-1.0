import { useState, useCallback } from 'react';
import AxisGizmo3D from './AxisGizmo3D';

interface CameraGizmoWrapperProps {
  visible: boolean;
  size?: number;
}

/**
 * Wrapper component that isolates camera state updates from parent components
 * This prevents EditorPage from re-rendering when camera angles change
 */
const CameraGizmoWrapper = ({ visible, size = 100 }: CameraGizmoWrapperProps) => {
  const [cameraAlpha, setCameraAlpha] = useState(-Math.PI / 4);
  const [cameraBeta, setCameraBeta] = useState(Math.PI / 3.5);

  // This will be called by Babylon3DCanvas through a global event
  const handleCameraChange = useCallback((alpha: number, beta: number) => {
    setCameraAlpha(alpha);
    setCameraBeta(beta);
  }, []);

  // Expose the handler globally for Babylon3DCanvas to call
  // This avoids prop drilling through EditorPage
  if (typeof window !== 'undefined') {
    (window as any).__updateCameraGizmo = handleCameraChange;
  }

  const handleAxisClick = (axis: 'x' | 'y' | 'z') => {
    if (typeof window !== 'undefined' && (window as any).__setCameraRotation) {
      let targetAlpha = 0;
      let targetBeta = 0;

      switch (axis) {
        case 'y': // Top View
          targetAlpha = -Math.PI / 2;
          targetBeta = 0.01;
          break;
        case 'z': // Front View
          targetAlpha = -Math.PI / 2;
          targetBeta = Math.PI / 2;
          break;
        case 'x': // Right View
          targetAlpha = 0;
          targetBeta = Math.PI / 2;
          break;
      }

      (window as any).__setCameraRotation(targetAlpha, targetBeta);
    }
  };

  if (!visible) return null;

  return (
    <AxisGizmo3D
      cameraAlpha={cameraAlpha}
      cameraBeta={cameraBeta}
      size={size}
      onAxisClick={handleAxisClick}
    />
  );
};

export default CameraGizmoWrapper;
