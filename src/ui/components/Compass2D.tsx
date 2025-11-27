import { CSSProperties } from 'react';

interface Compass2DProps {
  rotation?: number; // Camera rotation in degrees (0 = North up)
  size?: number;
  style?: CSSProperties;
  themeColor?: string;
}

/**
 * 2D Compass Component
 * Shows cardinal directions (N, E, S, W) with optional rotation based on camera angle
 */
const Compass2D = ({ rotation = 0, size = 80, style, themeColor = '#ff4757' }: Compass2DProps) => {
  const center = size / 2;
  const radius = size / 2 - 4;

  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        width: size,
        height: size,
        zIndex: 100,
        pointerEvents: 'none',
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          transform: `rotate(${-rotation}deg)`,
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))',
        }}
      >
        <defs>
          {/* Needle Gradients for 3D effect */}
          <linearGradient id="needleNorthLeft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={themeColor} stopOpacity="0.8" />
            <stop offset="100%" stopColor={themeColor} />
          </linearGradient>
          <linearGradient id="needleNorthRight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={themeColor} />
            <stop offset="100%" stopColor={themeColor} stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="needleSouthLeft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dfe4ea" />
            <stop offset="100%" stopColor="#ced6e0" />
          </linearGradient>
          <linearGradient id="needleSouthRight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ced6e0" />
            <stop offset="100%" stopColor="#a4b0be" />
          </linearGradient>

          {/* Drop shadow for the needle to make it float */}
          <filter id="needleShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
            <feOffset dx="0" dy="1" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background removed for cleaner look */}

        {/* Precision Ticks - REMOVED per user request */}

        {/* Cardinal Directions - N and S only */}
        {['N', 'S'].map((dir, i) => {
          const angle = dir === 'N' ? 0 : 180;
          const rad = (angle * Math.PI) / 180;
          const textR = radius - 12;
          const x = center + textR * Math.sin(rad);
          const y = center - textR * Math.cos(rad);

          const isNorth = dir === 'N';

          return (
            <text
              key={dir}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isNorth ? themeColor : '#2f3542'}
              fontSize={isNorth ? "13" : "11"}
              fontWeight={isNorth ? "800" : "600"}
              fontFamily="'Inter', system-ui, sans-serif"
              transform={`rotate(${angle}, ${x}, ${y})`}
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              {dir}
            </text>
          );
        })}

        {/* 3D Faceted Needle */}
        <g filter="url(#needleShadow)">
          {/* North Half - Left Facet */}
          <path
            d={`M ${center} ${center - radius + 18} L ${center - 5} ${center} L ${center} ${center} Z`}
            fill="url(#needleNorthLeft)"
          />
          {/* North Half - Right Facet */}
          <path
            d={`M ${center} ${center - radius + 18} L ${center + 5} ${center} L ${center} ${center} Z`}
            fill="url(#needleNorthRight)"
          />

          {/* South Half - Left Facet */}
          <path
            d={`M ${center} ${center + radius - 18} L ${center - 5} ${center} L ${center} ${center} Z`}
            fill="url(#needleSouthLeft)"
          />
          {/* South Half - Right Facet */}
          <path
            d={`M ${center} ${center + radius - 18} L ${center + 5} ${center} L ${center} ${center} Z`}
            fill="url(#needleSouthRight)"
          />
        </g>

        {/* Center Cap */}
        <circle
          cx={center}
          cy={center}
          r={2.5}
          fill="#2f3542"
          stroke="#ffffff"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
};

export default Compass2D;
