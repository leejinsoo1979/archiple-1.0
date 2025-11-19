import React, { useState, useRef, useCallback } from 'react';
import { MdCloudUpload, MdImage } from 'react-icons/md';
import styles from './ImageImportPanel.module.css';
import {
  detectLines,
  detectDimensions,
  filterWallLines,
  mergeParallelLines,
  type DetectedLine,
  type DetectedDimension,
} from '../../lib/imageProcessing';

interface ImageImportPanelProps {
  onFloorplanGenerated?: (floorplanData: any) => void;
  onClose?: () => void;
}

interface ProcessingStatus {
  stage: 'idle' | 'uploading' | 'detecting_lines' | 'detecting_text' | 'calibrating' | 'generating' | 'complete';
  progress: number;
  message: string;
}

interface CalibrationPoint {
  x: number;
  y: number;
  label?: string;
}

export const ImageImportPanel: React.FC<ImageImportPanelProps> = ({ onFloorplanGenerated, onClose }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>({
    stage: 'idle',
    progress: 0,
    message: 'Upload a floor plan image to begin',
  });
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([]);
  const [realWorldDistance, setRealWorldDistance] = useState<string>('');
  const [detectedLines, setDetectedLines] = useState<DetectedLine[]>([]);
  const [_detectedDimensions, _setDetectedDimensions] = useState<DetectedDimension[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setStatus({
      stage: 'uploading',
      progress: 10,
      message: 'Loading image...',
    });

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setStatus({
          stage: 'idle',
          progress: 0,
          message: 'Image loaded. Click "Detect Lines" to start processing.',
        });

        // Draw image on canvas
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            canvasRef.current.width = img.width;
            canvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (status.stage !== 'calibrating' || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Scale to actual canvas coordinates
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const actualX = x * scaleX;
    const actualY = y * scaleY;

    setCalibrationPoints(prev => {
      if (prev.length >= 2) return prev;
      const newPoint = { x: actualX, y: actualY, label: prev.length === 0 ? 'Start' : 'End' };

      // Draw calibration point
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(actualX, actualY, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '14px Arial';
        ctx.fillText(newPoint.label, actualX + 12, actualY - 12);
      }

      return [...prev, newPoint];
    });
  }, [status.stage]);

  const handleDetectLines = async () => {
    if (!image || !canvasRef.current) return;

    try {
      // Step 1: Detect lines
      setStatus({
        stage: 'detecting_lines',
        progress: 20,
        message: 'Detecting wall lines with Hough Transform...',
      });

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      const allLines = await detectLines(imageData);

      // Filter to keep only horizontal and vertical lines (walls)
      const wallLines = filterWallLines(allLines);

      // Merge nearby parallel lines
      const mergedLines = mergeParallelLines(wallLines);

      setDetectedLines(mergedLines);

      // Draw detected lines on canvas
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      mergedLines.forEach((line) => {
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      });

      console.log(`Detected ${mergedLines.length} wall lines`);

      // Step 2: Detect dimensions with OCR
      setStatus({
        stage: 'detecting_text',
        progress: 50,
        message: 'Reading dimension text with OCR...',
      });

      const dimensions = await detectDimensions(canvasRef.current);
      _setDetectedDimensions(dimensions);

      // Draw detected dimensions on canvas
      ctx.fillStyle = '#00FF00';
      ctx.font = '14px Arial';
      dimensions.forEach((dim) => {
        ctx.fillRect(dim.x - 5, dim.y - 5, 10, 10);
        ctx.fillText(`${dim.value}mm`, dim.x + 10, dim.y);
      });

      console.log(`Detected ${dimensions.length} dimensions`);

      // Move to calibration stage
      setStatus({
        stage: 'calibrating',
        progress: 70,
        message: 'Click two points on a known distance to set scale',
      });
    } catch (error) {
      console.error('Detection error:', error);
      setStatus({
        stage: 'idle',
        progress: 0,
        message: 'Error during detection. Please try again.',
      });
    }
  };

  const handleSetScale = () => {
    if (calibrationPoints.length !== 2 || !realWorldDistance) {
      alert('Please click two points and enter the real-world distance');
      return;
    }

    const pixelDistance = Math.sqrt(
      Math.pow(calibrationPoints[1].x - calibrationPoints[0].x, 2) +
      Math.pow(calibrationPoints[1].y - calibrationPoints[0].y, 2)
    );

    const realDistance = parseFloat(realWorldDistance);
    const scale = realDistance / pixelDistance; // mm per pixel

    console.log('Scale calibration:', {
      pixelDistance,
      realDistance,
      scale,
    });

    setStatus({
      stage: 'generating',
      progress: 90,
      message: 'Generating 3D model...',
    });

    // Convert detected lines to Blueprint format
    const points: any[] = [];
    const walls: any[] = [];
    const pointMap = new Map<string, number>(); // key: "x,y" -> point index

    // Helper to get or create point
    const getPointId = (x: number, y: number): number => {
      const key = `${Math.round(x)},${Math.round(y)}`;
      if (pointMap.has(key)) {
        return pointMap.get(key)!;
      }
      const id = points.length;
      points.push({
        id: `p${id}`,
        x: Math.round(x * scale), // Convert to mm
        y: Math.round(y * scale), // Convert to mm
      });
      pointMap.set(key, id);
      return id;
    };

    // Convert each line to a wall
    detectedLines.forEach((line, index) => {
      const startId = getPointId(line.x1, line.y1);
      const endId = getPointId(line.x2, line.y2);

      if (startId !== endId) {
        walls.push({
          id: `w${index}`,
          startPointId: points[startId].id,
          endPointId: points[endId].id,
          thickness: 100, // Default 100mm
          height: 2400, // Default 2400mm
        });
      }
    });

    const floorplanData = {
      points,
      walls,
      rooms: [], // Empty for now
      doors: [],
      floorplan: null, // Will be null for imported images
    };

    console.log('Generated floorplan data:', floorplanData);

    // Call parent callback with generated data
    if (onFloorplanGenerated) {
      onFloorplanGenerated(floorplanData);
    }

    setStatus({
      stage: 'complete',
      progress: 100,
      message: '3D model generated successfully!',
    });
  };

  const handleReset = () => {
    setImage(null);
    setStatus({
      stage: 'idle',
      progress: 0,
      message: 'Upload a floor plan image to begin',
    });
    setCalibrationPoints([]);
    setRealWorldDistance('');
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <MdImage size={24} />
        <h2>Import Floor Plan Image</h2>
        {onClose && (
          <button onClick={onClose} className={styles.closeBtn}>
            ×
          </button>
        )}
      </div>

      {!image ? (
        <div
          className={styles.dropzone}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <MdCloudUpload size={64} />
          <p>Drag & drop a floor plan image here</p>
          <p className={styles.or}>or</p>
          <button className={styles.selectBtn}>Select File</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div className={styles.content}>
          <div className={styles.canvasContainer}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onClick={handleCanvasClick}
              style={{ cursor: status.stage === 'calibrating' ? 'crosshair' : 'default' }}
            />
          </div>

          <div className={styles.controls}>
            <div className={styles.statusBar}>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${status.progress}%` }}
                />
              </div>
              <p className={styles.statusMessage}>{status.message}</p>
            </div>

            {status.stage === 'idle' && (
              <button className={styles.actionBtn} onClick={handleDetectLines}>
                Detect Lines & Dimensions
              </button>
            )}

            {status.stage === 'calibrating' && (
              <div className={styles.calibration}>
                <p className={styles.calibrationInfo}>
                  Click two points on the image that have a known distance
                </p>
                <p className={styles.calibrationCount}>
                  Points selected: {calibrationPoints.length}/2
                </p>

                {calibrationPoints.length === 2 && (
                  <div className={styles.distanceInput}>
                    <label>
                      Real-world distance (mm):
                      <input
                        type="number"
                        value={realWorldDistance}
                        onChange={(e) => setRealWorldDistance(e.target.value)}
                        placeholder="e.g., 3550"
                      />
                    </label>
                    <button
                      className={styles.actionBtn}
                      onClick={handleSetScale}
                      disabled={!realWorldDistance}
                    >
                      Set Scale & Generate 3D
                    </button>
                  </div>
                )}

                {calibrationPoints.length > 0 && calibrationPoints.length < 2 && (
                  <button
                    className={styles.resetCalibrationBtn}
                    onClick={() => {
                      setCalibrationPoints([]);
                      // Redraw image
                      if (canvasRef.current && image) {
                        const ctx = canvasRef.current.getContext('2d');
                        if (ctx) {
                          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                          ctx.drawImage(image, 0, 0);
                        }
                      }
                    }}
                  >
                    Reset Points
                  </button>
                )}
              </div>
            )}

            {status.stage === 'complete' && (
              <div className={styles.complete}>
                <p className={styles.successMessage}>✅ {status.message}</p>
                <button className={styles.actionBtn} onClick={handleReset}>
                  Import Another Image
                </button>
              </div>
            )}

            <button className={styles.cancelBtn} onClick={handleReset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
