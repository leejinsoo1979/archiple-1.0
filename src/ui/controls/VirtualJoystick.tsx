import { useEffect, useRef, useState } from 'react';
import styles from './VirtualJoystick.module.css';

interface VirtualJoystickProps {
  onMove: (x: number, y: number) => void; // -1 to 1 range
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      touchIdRef.current = touch.identifier;
      setActive(true);
      updatePosition(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (touchIdRef.current === null) return;

      const touch = Array.from(e.touches).find(t => t.identifier === touchIdRef.current);
      if (touch) {
        updatePosition(touch.clientX, touch.clientY);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const touches = Array.from(e.changedTouches);
      if (touches.some(t => t.identifier === touchIdRef.current)) {
        touchIdRef.current = null;
        setActive(false);
        setPosition({ x: 0, y: 0 });
        onMove(0, 0);
      }
    };

    const updatePosition = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;

      const maxDistance = rect.width / 2 - 20; // Leave some padding
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > maxDistance) {
        const angle = Math.atan2(deltaY, deltaX);
        const x = Math.cos(angle) * maxDistance;
        const y = Math.sin(angle) * maxDistance;
        setPosition({ x, y });
        onMove(x / maxDistance, y / maxDistance);
      } else {
        setPosition({ x: deltaX, y: deltaY });
        onMove(deltaX / maxDistance, deltaY / maxDistance);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onMove]);

  return (
    <div className={styles.container}>
      <div
        ref={containerRef}
        className={`${styles.joystick} ${active ? styles.active : ''}`}
      >
        <div
          className={styles.stick}
          style={{
            transform: `translate(${position.x}px, ${position.y}px)`,
          }}
        />
      </div>
      <div className={styles.label}>Move</div>
    </div>
  );
};
