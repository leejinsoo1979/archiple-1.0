import Tesseract from 'tesseract.js';

export interface DetectedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number; // in degrees
  length: number;
}

export interface DetectedDimension {
  text: string;
  value: number; // parsed number
  x: number;
  y: number;
  confidence: number;
}

/**
 * Detect lines in image using Hough Transform
 * @param imageData Canvas ImageData
 * @returns Array of detected lines
 */
export async function detectLines(imageData: ImageData): Promise<DetectedLine[]> {
  return new Promise((resolve, _reject) => {
    try {
      // Load opencv.js
      const cv = (window as any).cv;

      if (!cv) {
        console.error('OpenCV.js not loaded');
        // For now, return mock data for testing
        resolve(getMockLines());
        return;
      }

      // Convert ImageData to OpenCV Mat
      const src = cv.matFromImageData(imageData);
      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const lines = new cv.Mat();

      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // Apply Gaussian blur to reduce noise
      const ksize = new cv.Size(5, 5);
      cv.GaussianBlur(gray, gray, ksize, 1.5, 1.5, cv.BORDER_DEFAULT);

      // Apply adaptive thresholding to extract dark lines (walls)
      const thresh = new cv.Mat();
      cv.adaptiveThreshold(
        gray,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV, // Invert so walls are white
        11, // Block size
        2   // C constant
      );

      // Morphological operations to clean up
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel); // Close gaps
      cv.morphologyEx(thresh, thresh, cv.MORPH_OPEN, kernel);  // Remove noise

      // Detect edges using Canny with higher thresholds
      cv.Canny(thresh, edges, 100, 200, 3, false);

      // Calculate minimum line length based on image size (5% of diagonal)
      const diagonal = Math.sqrt(imageData.width * imageData.width + imageData.height * imageData.height);
      const minLineLength = Math.max(100, diagonal * 0.05); // At least 100px or 5% of diagonal

      // Detect lines using HoughLinesP with stricter parameters
      cv.HoughLinesP(
        edges,
        lines,
        1, // rho
        Math.PI / 180, // theta
        150, // threshold (increased from 80)
        minLineLength, // minLineLength (dynamic based on image size)
        20 // maxLineGap (increased from 10 to merge dashed lines)
      );

      const detectedLines: DetectedLine[] = [];

      // Process detected lines
      for (let i = 0; i < lines.rows; i++) {
        const x1 = lines.data32S[i * 4];
        const y1 = lines.data32S[i * 4 + 1];
        const x2 = lines.data32S[i * 4 + 2];
        const y2 = lines.data32S[i * 4 + 3];

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

        // Filter out short lines (minimum 100px or based on image size)
        if (length >= minLineLength) {
          detectedLines.push({ x1, y1, x2, y2, angle, length });
        }
      }

      // Cleanup
      src.delete();
      gray.delete();
      thresh.delete();
      kernel.delete();
      edges.delete();
      lines.delete();

      console.log(`Detected ${detectedLines.length} lines`);
      resolve(detectedLines);
    } catch (error) {
      console.error('Line detection error:', error);
      // Return mock data on error for testing
      resolve(getMockLines());
    }
  });
}

/**
 * Filter lines to keep only horizontal and vertical (walls)
 * @param lines Detected lines
 * @param angleTolerance Tolerance in degrees (default: 2 - stricter)
 * @returns Filtered lines
 */
export function filterWallLines(lines: DetectedLine[], angleTolerance = 2): DetectedLine[] {
  const filtered = lines.filter(line => {
    const angle = Math.abs(line.angle);
    // Horizontal: 0° or 180°
    const isHorizontal = angle < angleTolerance || Math.abs(angle - 180) < angleTolerance;
    // Vertical: 90° or -90°
    const isVertical = Math.abs(angle - 90) < angleTolerance || Math.abs(angle + 90) < angleTolerance;

    return isHorizontal || isVertical;
  });

  // Sort by length (longest first) to prioritize main walls
  return filtered.sort((a, b) => b.length - a.length);
}

/**
 * Merge nearby parallel lines (to handle thick walls)
 * @param lines Wall lines
 * @param distanceThreshold Maximum distance to merge (pixels) - default 15
 * @returns Merged lines
 */
export function mergeParallelLines(lines: DetectedLine[], distanceThreshold = 15): DetectedLine[] {
  if (lines.length === 0) return [];

  const merged: DetectedLine[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;

    const line1 = lines[i];
    const group: DetectedLine[] = [line1];
    used.add(i);

    // Find parallel lines within distance threshold
    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;

      const line2 = lines[j];
      const angleDiff = Math.abs(line1.angle - line2.angle);

      // Check if parallel (same angle) - stricter tolerance
      if (angleDiff < 3 || Math.abs(angleDiff - 180) < 3) {
        // Check if close enough (perpendicular distance)
        const dist = pointToLineDistance(
          (line2.x1 + line2.x2) / 2,
          (line2.y1 + line2.y2) / 2,
          line1
        );

        if (dist < distanceThreshold) {
          group.push(line2);
          used.add(j);
        }
      }
    }

    // For merged line, use the longest line in the group as base
    // and extend it to cover all lines in the group
    if (group.length > 0) {
      // Find the longest line as reference
      const longest = group.reduce((max, line) => line.length > max.length ? line : max, group[0]);

      // Determine if horizontal or vertical
      const isHorizontal = Math.abs(longest.angle) < 45 || Math.abs(longest.angle) > 135;

      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      // Find bounding box of all lines in group
      group.forEach(line => {
        minX = Math.min(minX, line.x1, line.x2);
        maxX = Math.max(maxX, line.x1, line.x2);
        minY = Math.min(minY, line.y1, line.y2);
        maxY = Math.max(maxY, line.y1, line.y2);
      });

      let x1, y1, x2, y2;

      if (isHorizontal) {
        // Horizontal line: extend x, average y
        const avgY = group.reduce((sum, l) => sum + (l.y1 + l.y2) / 2, 0) / group.length;
        x1 = minX;
        y1 = avgY;
        x2 = maxX;
        y2 = avgY;
      } else {
        // Vertical line: average x, extend y
        const avgX = group.reduce((sum, l) => sum + (l.x1 + l.x2) / 2, 0) / group.length;
        x1 = avgX;
        y1 = minY;
        x2 = avgX;
        y2 = maxY;
      }

      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      merged.push({ x1, y1, x2, y2, angle, length });
    }
  }

  // Remove very short merged lines (likely noise)
  return merged.filter(line => line.length > 50);
}

/**
 * Calculate distance from point to line
 */
function pointToLineDistance(px: number, py: number, line: DetectedLine): number {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lineLengthSq = dx * dx + dy * dy;

  if (lineLengthSq === 0) {
    // Line is actually a point
    return Math.sqrt((px - line.x1) ** 2 + (py - line.y1) ** 2);
  }

  // Project point onto line
  const t = Math.max(0, Math.min(1, ((px - line.x1) * dx + (py - line.y1) * dy) / lineLengthSq));
  const projX = line.x1 + t * dx;
  const projY = line.y1 + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Detect dimension text using OCR
 * @param canvas Canvas element with image
 * @returns Array of detected dimensions
 */
export async function detectDimensions(canvas: HTMLCanvasElement): Promise<DetectedDimension[]> {
  try {
    console.log('Starting OCR...');

    const result = await Tesseract.recognize(canvas, 'eng+kor', {
      logger: (m) => console.log('OCR Progress:', m),
    });

    console.log('OCR Complete:', result.data);

    const dimensions: DetectedDimension[] = [];

    // Process OCR results
    const resultData = result.data as any;
    if (resultData.words) {
      resultData.words.forEach((word: any) => {
      // Look for numbers (dimensions)
      const text = word.text.trim();
      const numberMatch = text.match(/(\d+)/);

      if (numberMatch) {
        const value = parseInt(numberMatch[1], 10);

        // Filter out unrealistic dimensions
        if (value >= 100 && value <= 50000) {
          dimensions.push({
            text: text,
            value: value,
            x: word.bbox.x0,
            y: word.bbox.y0,
            confidence: word.confidence,
          });
        }
      }
      });
    }

    console.log(`Detected ${dimensions.length} dimensions:`, dimensions);
    return dimensions;
  } catch (error) {
    console.error('OCR error:', error);
    return [];
  }
}

/**
 * Mock data for testing when OpenCV is not available
 */
function getMockLines(): DetectedLine[] {
  return [
    { x1: 100, y1: 100, x2: 500, y2: 100, angle: 0, length: 400 },
    { x1: 500, y1: 100, x2: 500, y2: 400, angle: 90, length: 300 },
    { x1: 500, y1: 400, x2: 100, y2: 400, angle: 180, length: 400 },
    { x1: 100, y1: 400, x2: 100, y2: 100, angle: -90, length: 300 },
  ];
}

/**
 * Convert detected lines to closed polygons (rooms)
 * @param lines Wall lines
 * @returns Array of room polygons
 */
export function linesToRooms(lines: DetectedLine[]): Array<{x: number, y: number}[]> {
  // Find intersections and build graph
  // This is simplified - real implementation would need more complex logic
  const rooms: Array<{x: number, y: number}[]> = [];

  // For now, return mock room
  if (lines.length >= 4) {
    const points = [
      { x: Math.min(lines[0].x1, lines[0].x2), y: Math.min(lines[0].y1, lines[0].y2) },
      { x: Math.max(lines[0].x1, lines[0].x2), y: Math.min(lines[0].y1, lines[0].y2) },
      { x: Math.max(lines[0].x1, lines[0].x2), y: Math.max(lines[0].y1, lines[0].y2) },
      { x: Math.min(lines[0].x1, lines[0].x2), y: Math.max(lines[0].y1, lines[0].y2) },
    ];
    rooms.push(points);
  }

  return rooms;
}
