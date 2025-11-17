import { useEffect, useRef, useState } from 'react';
import styles from './FloorplanCanvas.module.css';
import { Floorplan } from './blueprint/floorplan';
import { Corner } from './blueprint/corner';
import { convertFloorplanToBabylon } from './blueprint/BlueprintToBabylonAdapter';
import { ToolType } from '../core/types/EditorState';

interface BlueprintFloorplanCanvasProps {
  activeTool: ToolType;
  onDataChange?: (data: any) => void;
}

const BlueprintFloorplanCanvas = ({ activeTool, onDataChange }: BlueprintFloorplanCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const floorplanRef = useRef<Floorplan>(new Floorplan());
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentCorner, setCurrentCorner] = useState<Corner | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Render floorplan to canvas
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const floorplan = floorplanRef.current;

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid (100mm = 100px)
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw walls
    const walls = floorplan.getWalls();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    walls.forEach(wall => {
      const start = wall.getStart();
      const end = wall.getEnd();

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Draw wall thickness
      const thickness = wall.thickness;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;

      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 1;

      // Offset lines
      ctx.beginPath();
      ctx.moveTo(start.x + nx * thickness / 2, start.y + ny * thickness / 2);
      ctx.lineTo(end.x + nx * thickness / 2, end.y + ny * thickness / 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(start.x - nx * thickness / 2, start.y - ny * thickness / 2);
      ctx.lineTo(end.x - nx * thickness / 2, end.y - ny * thickness / 2);
      ctx.stroke();
    });

    // Draw corners
    const corners = floorplan.getCorners();
    corners.forEach(corner => {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw preview line if drawing
    if (isDrawing && currentCorner && mousePos) {
      ctx.strokeStyle = '#0000ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(currentCorner.x, currentCorner.y);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw rooms
    const rooms = floorplan.getRooms();
    rooms.forEach((room, idx) => {
      if (room.interiorCorners.length < 3) return;

      ctx.fillStyle = `rgba(${100 + idx * 50}, ${150 + idx * 30}, 255, 0.1)`;
      ctx.beginPath();
      ctx.moveTo(room.interiorCorners[0].x, room.interiorCorners[0].y);
      for (let i = 1; i < room.interiorCorners.length; i++) {
        ctx.lineTo(room.interiorCorners[i].x, room.interiorCorners[i].y);
      }
      ctx.closePath();
      ctx.fill();
    });
  };

  // Handle canvas click
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || activeTool !== ToolType.WALL) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const floorplan = floorplanRef.current;

    // Snap to existing corner
    let corner = floorplan.overlappedCorner(x, y, 20);

    if (!corner) {
      // Create new corner at click position
      corner = floorplan.newCorner(x, y);
      console.log('[BlueprintCanvas] Created corner:', corner.id, `(${x}, ${y})`);
    }

    if (!isDrawing) {
      // Start drawing
      setIsDrawing(true);
      setCurrentCorner(corner);
      console.log('[BlueprintCanvas] Started wall from corner:', corner.id);
    } else {
      // Finish wall
      if (currentCorner && currentCorner !== corner) {
        const wall = floorplan.newWall(currentCorner, corner);
        console.log('[BlueprintCanvas] Created wall:', wall.id,
          `${wall.thickness}mm thick, ${wall.height}mm high`);

        // Update Babylon3D
        const babylonData = convertFloorplanToBabylon(floorplan);
        console.log('[BlueprintCanvas] Floorplan data:', babylonData);
        onDataChange?.(babylonData);
      }

      setIsDrawing(false);
      setCurrentCorner(null);
    }

    render();
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setMousePos({ x, y });

    if (isDrawing) {
      render();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    render();

    const handleResize = () => {
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      render();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    render();
  }, [isDrawing, currentCorner, mousePos]);

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        fontFamily: 'monospace'
      }}>
        <div>Corners: {floorplanRef.current.getCorners().length}</div>
        <div>Walls: {floorplanRef.current.getWalls().length}</div>
        <div>Rooms: {floorplanRef.current.getRooms().length}</div>
        <div>Tool: {activeTool}</div>
        <div>Drawing: {isDrawing ? 'YES' : 'NO'}</div>
        {mousePos && <div>Mouse: ({Math.round(mousePos.x)}mm, {Math.round(mousePos.y)}mm)</div>}
      </div>
    </div>
  );
};

export default BlueprintFloorplanCanvas;
