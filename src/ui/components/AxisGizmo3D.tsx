import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

interface AxisGizmo3DProps {
  cameraAlpha?: number;
  cameraBeta?: number;
  size?: number;
  style?: CSSProperties;
  onAxisClick?: (axis: 'x' | 'y' | 'z') => void;
}

/**
 * Clean 3D Axis Gizmo - matches reference image style
 */
const AxisGizmo3D = ({ cameraAlpha = 0, cameraBeta = Math.PI / 4, size = 90, style, onAxisClick }: AxisGizmo3DProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Projection logic based on Camera View Matrix
  const getProjection = (alpha: number, beta: number, size: number) => {
    const center = size / 2;
    const axisLength = size / 2 - 24; // Adjusted to fit floating labels within canvas

    // Basis vectors for the camera view
    // Right Vector (Screen X)
    const rx = -Math.sin(alpha);
    const rz = Math.cos(alpha);

    // Up Vector (Screen Y) - approximating camera up
    // Note: This matches Babylon's default behavior where Beta=0 is Top
    const ux = -Math.cos(beta) * Math.cos(alpha);
    const uy = Math.sin(beta);
    const uz = -Math.cos(beta) * Math.sin(alpha);

    const project = (x: number, y: number, z: number) => {
      // Dot product with Right vector for Screen X
      // Flip Z to match visual expectation (Left-Handed vs Right-Handed visual mismatch)
      const screenX = x * rx - z * rz;
      // Dot product with Up vector for Screen Y
      const screenY = x * ux + y * uy - z * uz;

      return {
        x: center + screenX * axisLength,
        y: center - screenY * axisLength, // Canvas Y is down
        depth: 0 // Simplified depth for sorting
      };
    };

    return project;
  };

  // Handle click events on the canvas
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onAxisClick || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const project = getProjection(cameraAlpha, cameraBeta, size);

    const targets = [
      { id: 'x', ...project(1, 0, 0) },
      { id: 'y', ...project(0, 1, 0) },
      { id: 'z', ...project(0, 0, 1) }
    ];

    // Check distance to each endpoint
    const hitRadius = 15; // Clickable area radius

    for (const target of targets) {
      const dx = x - target.x;
      const dy = y - target.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        onAxisClick(target.id as 'x' | 'y' | 'z');
        return;
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    const project = getProjection(cameraAlpha, cameraBeta, size);

    // Calculate axis endpoints
    const xEnd = project(1, 0, 0);
    const yEnd = project(0, 1, 0);
    const zEnd = project(0, 0, 1);
    const origin = project(0, 0, 0);

    // Calculate depth for sorting (simple approximation based on rotation)
    // We want to draw the axis furthest from camera first
    // View direction is roughly opposite to camera position
    // CamPos ~ (cosA*sinB, cosB, sinA*sinB)
    const cx = Math.cos(cameraAlpha) * Math.sin(cameraBeta);
    const cy = Math.cos(cameraBeta);
    const cz = Math.sin(cameraAlpha) * Math.sin(cameraBeta);

    const getDepth = (x: number, y: number, z: number) => {
      return x * cx + y * cy + z * cz;
    };

    const axes = [
      { end: xEnd, color: '#ff4757', label: 'X', depth: getDepth(1, 0, 0) },
      { end: yEnd, color: '#2ed573', label: 'Y', depth: getDepth(0, 1, 0) },
      { end: zEnd, color: '#1e90ff', label: 'Z', depth: getDepth(0, 0, 1) },
    ].sort((a, b) => a.depth - b.depth);

    // Draw axes
    axes.forEach(({ end, color, label }) => {
      // Draw axis line
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'butt';
      ctx.stroke();

      // Draw arrowhead (Sharp Cone Style)
      const headLength = 7; // Reduced size (was 10)
      const headWidth = 4;   // Reduced width (was 6)
      const angle = Math.atan2(end.y - origin.y, end.x - origin.x);

      ctx.beginPath();
      // Tip of the arrow
      ctx.moveTo(end.x, end.y);
      // Left corner
      ctx.lineTo(
        end.x - headLength * Math.cos(angle) + headWidth * Math.cos(angle - Math.PI / 2),
        end.y - headLength * Math.sin(angle) + headWidth * Math.sin(angle - Math.PI / 2)
      );
      // Right corner
      ctx.lineTo(
        end.x - headLength * Math.cos(angle) + headWidth * Math.cos(angle + Math.PI / 2),
        end.y - headLength * Math.sin(angle) + headWidth * Math.sin(angle + Math.PI / 2)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Draw axis label (Floating)
      const labelOffset = 15; // Distance from arrow tip
      const labelX = end.x + labelOffset * Math.cos(angle);
      const labelY = end.y + labelOffset * Math.sin(angle);

      ctx.font = '700 11px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color; // Match axis color
      ctx.fillText(label, labelX, labelY);
    });

    // Draw center point
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 2.5, 0, Math.PI * 2); // Smaller center dot
    ctx.fillStyle = '#ffffff'; // Keep center dot white for visibility
    ctx.fill();

  }, [cameraAlpha, cameraBeta, size]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px', // Adjusted position
        right: '16px', // Adjusted position
        width: size,
        height: size,
        zIndex: 100,
        pointerEvents: 'auto',
        cursor: 'pointer',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          width: size,
          height: size,
        }}
      />
    </div>
  );
};

AxisGizmo3D.displayName = 'AxisGizmo3D';

export default AxisGizmo3D;
