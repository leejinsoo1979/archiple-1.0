import { useState, useRef, useEffect } from 'react';
import FloorplanCanvas from '../floorplan/FloorplanCanvas';
import Babylon3DCanvas from '../babylon/Babylon3DCanvas';
import styles from './EditorPage.module.css';
import { ToolType } from '../core/types/EditorState';
import { createTestRoom } from '../floorplan/blueprint/BlueprintToBabylonAdapter';
import { RxCursorArrow } from 'react-icons/rx';
import { PiCubeTransparentLight } from 'react-icons/pi';
import { eventBus } from '../core/events/EventBus';
import { EditorEvents } from '../core/events/EditorEvents';
import type { Light, LightType } from '../core/types/Light';
import { createDefaultLight } from '../core/types/Light';

type ToolCategory = 'walls' | 'door' | 'window' | 'structure';

const EditorPage = () => {
  const [_activeCategory, _setActiveCategory] = useState<ToolCategory>('walls');
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeTool, setActiveTool] = useState<ToolType>(ToolType.SELECT);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [floorplanData, setFloorplanData] = useState<any>(null);
  const [sunPanelOpen, setSunPanelOpen] = useState(false);
  const [sunSettings, setSunSettings] = useState({
    intensity: 1.5,
    azimuth: 45, // 방위각 0-360도
    altitude: 45, // 고도 0-90도
  });
  const [playMode, setPlayMode] = useState(false); // FPS mode toggle
  const [showCharacter, setShowCharacter] = useState(false); // Character toggle
  const [photoRealisticMode, setPhotoRealisticMode] = useState(false); // Photo-realistic rendering

  // Rendering modal and settings
  const [renderModalOpen, setRenderModalOpen] = useState(false);
  const [renderInProgress, setRenderInProgress] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderedImage, setRenderedImage] = useState<string | null>(null);
  const [renderSettings, setRenderSettings] = useState({
    resolution: '1920x1080' as '1920x1080' | '2560x1440' | '3840x2160',
    ssaoRadius: 1.0,
    ssaoStrength: 1.3,
    ssrStrength: 0.5,
    bloomThreshold: 0.8,
    bloomWeight: 0.3,
    dofFocusDistance: 5000,
    dofFStop: 2.8,
    chromaticAberration: 3,
    grainIntensity: 5,
    vignetteWeight: 1.5,
    sharpenAmount: 0.3,
  });

  // 3D View display options
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const [displayStyle, setDisplayStyle] = useState<'material' | 'white' | 'sketch' | 'transparent'>('material');
  const [hiddenLineMode, setHiddenLineMode] = useState(false);

  // Background image state
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  const [imageScale, setImageScale] = useState(100); // 100mm per pixel default
  const [imageOpacity, setImageOpacity] = useState(0.5);
  const [showBackgroundImage, setShowBackgroundImage] = useState(true);

  // Scanned walls state (overlay on 2D)
  const [scannedWalls, setScannedWalls] = useState<{ points: any[]; walls: any[] } | null>(null);

  // Ruler calibration state
  const [rulerVisible, setRulerVisible] = useState(false);
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);
  const [rulerDistance, setRulerDistance] = useState<string>('');
  const [draggingRulerPoint, setDraggingRulerPoint] = useState<'start' | 'end' | null>(null);
  const [editingRulerLabel, setEditingRulerLabel] = useState<{ x: number; y: number; currentDistance: number } | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const glbFileInputRef = useRef<HTMLInputElement>(null);

  // Dimension editing state
  const [editingWallId, setEditingWallId] = useState<string | null>(null);
  const [dimensionInput, setDimensionInput] = useState<string>('');

  // GLB model state
  const [glbModelFile, setGlbModelFile] = useState<File | null>(null);

  // Lighting system state
  const [lightPanelOpen, setLightPanelOpen] = useState(false);
  const [lights, setLights] = useState<Light[]>([]);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [lightPlacementMode, setLightPlacementMode] = useState(false);
  const [selectedLightType, setSelectedLightType] = useState<LightType>('point');

  // Handle light placement from 3D view
  const handleLightPlaced = (light: Light) => {
    console.log('[EditorPage] ✅ Light placed successfully:', light.type, light.id, 'at position:', light.position);
    const newLights = [...lights, light];
    setLights(newLights);
    setSelectedLightId(light.id);
    console.log('[EditorPage] Total lights:', newLights.length);
    // Keep placement mode active for placing multiple lights
    // User can manually exit by clicking the button again or switching views
  };

  // Babylon3DCanvas ref for triggering render
  const babylon3DCanvasRef = useRef<{ captureRender: (width: number, height: number) => Promise<string> } | null>(null);

  // Start rendering process
  const handleStartRender = async () => {
    if (!babylon3DCanvasRef.current) {
      alert('3D 뷰를 먼저 로드해주세요.');
      return;
    }

    setRenderInProgress(true);
    setRenderProgress(0);
    setRenderedImage(null);

    try {
      // Parse resolution
      const [width, height] = renderSettings.resolution.split('x').map(Number);

      // Enable photo-realistic mode
      setPhotoRealisticMode(true);
      setRenderProgress(10);

      // Wait for pipeline to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      setRenderProgress(30);

      // Capture render
      const imageData = await babylon3DCanvasRef.current.captureRender(width, height);
      setRenderProgress(90);

      setRenderedImage(imageData);
      setRenderProgress(100);
    } catch (error) {
      console.error('[EditorPage] Render failed:', error);
      alert('렌더링 실패: ' + (error as Error).message);
    } finally {
      setRenderInProgress(false);
    }
  };

  // Download rendered image
  const handleDownloadRender = () => {
    if (!renderedImage) return;

    const link = document.createElement('a');
    link.href = renderedImage;
    link.download = `render_${renderSettings.resolution}_${Date.now()}.png`;
    link.click();
  };

  // Close view options dropdown when clicking outside
  useEffect(() => {
    if (!viewOptionsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.viewOptionsWrapper}`)) {
        setViewOptionsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [viewOptionsOpen]);

  // Load test room data (2800mm x 2800mm room with 100mm walls)
  const handleLoadTestRoom = () => {
    const testData = createTestRoom();
    console.log('[EditorPage] Loading test room:', testData);
    setFloorplanData(testData);
    setViewMode('3D'); // Switch to 3D view to see the result
  };

  // Handle GLB file upload
  const handleGlbUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('[EditorPage] File input changed, file:', file);

    if (!file) {
      console.warn('[EditorPage] No file selected');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.glb')) {
      alert('GLB 파일을 선택하세요 (현재 파일: ' + file.name + ')');
      return;
    }

    console.log('[EditorPage] GLB file selected:', file.name, 'size:', file.size, 'bytes');
    setGlbModelFile(file);
    setViewMode('3D'); // Switch to 3D view
  };

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate initial scale to fit image in viewport
        // Assume typical floor plan: 10m (10000mm) should be ~1000px
        // So initial scale: 10mm per pixel
        const initialScale = 10;

        setBackgroundImage(img);
        setImageScale(initialScale);
        setViewMode('2D'); // Switch to 2D to see image

        // Initialize ruler in center of image (in world coordinates)
        const widthInMm = img.width * initialScale;
        const heightInMm = img.height * initialScale;
        const centerX = 0;
        const centerY = 0;
        const rulerLength = Math.min(widthInMm, heightInMm) * 0.3; // 30% of smaller dimension

        setRulerStart({ x: centerX - rulerLength / 2, y: centerY });
        setRulerEnd({ x: centerX + rulerLength / 2, y: centerY });
        setRulerVisible(true);

        // Reset camera to show full image after a short delay
        setTimeout(() => {
          eventBus.emit(EditorEvents.CAMERA_RESET);
        }, 100);
      };
      img.onerror = () => {
        alert('이미지를 로드할 수 없습니다.');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Handle ruler drag start
  const handleRulerDragStart = (isStartPoint: boolean) => {
    setDraggingRulerPoint(isStartPoint ? 'start' : 'end');
  };

  // Handle ruler drag
  const handleRulerDrag = (worldX: number, worldY: number) => {
    if (!draggingRulerPoint) return;

    if (draggingRulerPoint === 'start') {
      setRulerStart({ x: worldX, y: worldY });
    } else {
      setRulerEnd({ x: worldX, y: worldY });
    }
  };

  // Handle ruler drag end
  const handleRulerDragEnd = () => {
    setDraggingRulerPoint(null);
  };

  // Handle ruler label click
  const handleRulerLabelClick = (screenX: number, screenY: number, currentDistanceMm: number) => {
    setEditingRulerLabel({ x: screenX, y: screenY, currentDistance: currentDistanceMm });
    setRulerDistance(currentDistanceMm.toFixed(0));
  };

  // Handle ruler label submit
  const handleRulerLabelSubmit = () => {
    if (!editingRulerLabel || !rulerStart || !rulerEnd || !backgroundImage) {
      setEditingRulerLabel(null);
      return;
    }

    const realDistanceMm = parseFloat(rulerDistance);
    if (isNaN(realDistanceMm) || realDistanceMm <= 0) {
      alert('유효한 거리를 입력하세요');
      return;
    }

    // Convert world coordinates (mm) to image pixel coordinates
    const widthInMm = backgroundImage.width * imageScale;
    const heightInMm = backgroundImage.height * imageScale;

    const pixel1X = (rulerStart.x + widthInMm / 2) / imageScale;
    const pixel1Y = (rulerStart.y + heightInMm / 2) / imageScale;
    const pixel2X = (rulerEnd.x + widthInMm / 2) / imageScale;
    const pixel2Y = (rulerEnd.y + heightInMm / 2) / imageScale;

    // Calculate pixel distance in image
    const dx = pixel2X - pixel1X;
    const dy = pixel2Y - pixel1Y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate mm per pixel
    const mmPerPixel = realDistanceMm / pixelDistance;

    setImageScale(mmPerPixel);
    setEditingRulerLabel(null);
  };

  // Handle ruler distance submit
  const handleRulerSubmit = () => {
    if (!rulerStart || !rulerEnd || !rulerDistance || !backgroundImage) {
      alert('줄자를 조절하고 실제 거리를 입력하세요');
      return;
    }

    const realDistanceMm = parseFloat(rulerDistance);
    if (isNaN(realDistanceMm) || realDistanceMm <= 0) {
      alert('유효한 거리를 입력하세요');
      return;
    }

    // Convert world coordinates (mm) to image pixel coordinates
    // Background image is centered at origin with current scale
    const widthInMm = backgroundImage.width * imageScale;
    const heightInMm = backgroundImage.height * imageScale;

    const pixel1X = (rulerStart.x + widthInMm / 2) / imageScale;
    const pixel1Y = (rulerStart.y + heightInMm / 2) / imageScale;
    const pixel2X = (rulerEnd.x + widthInMm / 2) / imageScale;
    const pixel2Y = (rulerEnd.y + heightInMm / 2) / imageScale;

    // Calculate pixel distance in image
    const dx = pixel2X - pixel1X;
    const dy = pixel2Y - pixel1Y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    // Calculate mm per pixel
    const mmPerPixel = realDistanceMm / pixelDistance;

    setImageScale(mmPerPixel);
    setRulerVisible(false);
  };

  // Handle dimension click
  const handleDimensionClick = (wallId: string) => {
    // Find the wall in floorplanData
    if (!floorplanData) return;

    const wall = floorplanData.walls.find((w: any) => w.id === wallId);
    if (!wall) return;

    // Find start and end points
    const startPoint = floorplanData.points.find((p: any) => p.id === wall.startPointId);
    const endPoint = floorplanData.points.find((p: any) => p.id === wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Calculate current distance
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);

    setEditingWallId(wallId);
    setDimensionInput(currentDistance.toFixed(0));
  };

  // Handle dimension input submit
  const handleDimensionSubmit = () => {
    if (!editingWallId || !floorplanData) return;

    const newDistance = parseFloat(dimensionInput);
    if (isNaN(newDistance) || newDistance <= 0) {
      alert('유효한 치수를 입력하세요');
      return;
    }

    // Find the wall
    const wall = floorplanData.walls.find((w: any) => w.id === editingWallId);
    if (!wall) return;

    // Find start and end points
    const startPoint = floorplanData.points.find((p: any) => p.id === wall.startPointId);
    const endPoint = floorplanData.points.find((p: any) => p.id === wall.endPointId);

    if (!startPoint || !endPoint) return;

    // Calculate current vector
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);

    if (currentDistance === 0) return;

    // Calculate unit vector
    const ux = dx / currentDistance;
    const uy = dy / currentDistance;

    // Update end point to new distance
    const newEndPoint = {
      ...endPoint,
      x: startPoint.x + ux * newDistance,
      y: startPoint.y + uy * newDistance,
    };

    // Update floorplan data
    const updatedData = {
      ...floorplanData,
      points: floorplanData.points.map((p: any) =>
        p.id === endPoint.id ? newEndPoint : p
      ),
    };

    setFloorplanData(updatedData);
    setEditingWallId(null);
    setDimensionInput('');
  };

  // Handle scan button - extract walls and generate 3D
  const handleScan = async () => {
    if (!backgroundImage) {
      alert('이미지를 먼저 업로드하세요');
      return;
    }

    try {
      // Create canvas for image processing
      const canvas = document.createElement('canvas');
      canvas.width = backgroundImage.width;
      canvas.height = backgroundImage.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(backgroundImage, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Import image processing functions
      const { detectLines, filterWallLines, mergeParallelLines } = await import('../lib/imageProcessing');

      // Detect lines
      console.log('[EditorPage] Detecting lines...');
      const allLines = await detectLines(imageData);
      const wallLines = filterWallLines(allLines);
      const mergedLines = mergeParallelLines(wallLines);

      console.log('[EditorPage] Detected', mergedLines.length, 'wall lines');

      if (mergedLines.length === 0) {
        alert('벽을 감지할 수 없습니다. 이미지 스케일을 조정해보세요.');
        return;
      }

      // Convert lines to Blueprint format
      const points: any[] = [];
      const walls: any[] = [];
      const pointMap = new Map<string, number>();

      // Scale factor: image pixels to mm (assume 1 pixel = imageScale mm for now)
      const pixelToMm = imageScale;

      const getPointId = (x: number, y: number): number => {
        const key = `${Math.round(x)},${Math.round(y)}`;
        if (pointMap.has(key)) {
          return pointMap.get(key)!;
        }
        const id = points.length;
        points.push({
          id: `p${id}`,
          x: Math.round(x * pixelToMm),
          y: Math.round(y * pixelToMm),
        });
        pointMap.set(key, id);
        return id;
      };

      // Convert each line to a wall
      mergedLines.forEach((line, index) => {
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

      // Store scanned walls for 2D overlay
      setScannedWalls({ points, walls });

      console.log('[EditorPage] Scanned walls:', walls.length);

      alert(`${walls.length}개의 벽이 감지되었습니다! 2D 뷰에서 확인하세요.`);
    } catch (error) {
      console.error('Scan error:', error);
      alert('스캐닝 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={styles.editorContainer}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src="/images/archiple_logo.png" alt="Archiple Studio" className={styles.headerLogo} />
        </div>
        <div className={styles.headerCenter}>
          {/* Top Toolbar */}
          <div className={styles.topToolbar}>
            <div className={styles.viewOptionsWrapper}>
              <button
                className={`${styles.topBtn} ${viewOptionsOpen ? styles.active : ''}`}
                title="3D View"
                onClick={() => setViewOptionsOpen(!viewOptionsOpen)}
              >
                <PiCubeTransparentLight size={20} />
              </button>

              {/* 3D View Options Dropdown */}
              {viewOptionsOpen && (
                <div className={styles.viewOptionsDropdown}>
                  <div className={styles.dropdownSection}>
                    <h4 className={styles.dropdownTitle}>디스플레이 스타일</h4>
                    <div className={styles.displayStyleGrid}>
                      <button
                        className={`${styles.styleOption} ${displayStyle === 'material' ? styles.selected : ''}`}
                        onClick={() => setDisplayStyle('material')}
                      >
                        <div className={styles.stylePreview}>
                          <div className={styles.materialPreview}></div>
                        </div>
                        <span className={styles.styleLabel}>재질</span>
                        <span className={styles.styleNumber}>⌘1</span>
                      </button>
                      <button
                        className={`${styles.styleOption} ${displayStyle === 'white' ? styles.selected : ''}`}
                        onClick={() => setDisplayStyle('white')}
                      >
                        <div className={styles.stylePreview}>
                          <div className={styles.whitePreview}></div>
                        </div>
                        <span className={styles.styleLabel}>화이트 모델</span>
                        <span className={styles.styleNumber}>⌘2</span>
                      </button>
                      <button
                        className={`${styles.styleOption} ${displayStyle === 'sketch' ? styles.selected : ''}`}
                        onClick={() => setDisplayStyle('sketch')}
                      >
                        <div className={styles.stylePreview}>
                          <div className={styles.sketchPreview}></div>
                        </div>
                        <span className={styles.styleLabel}>스케치</span>
                        <span className={styles.styleNumber}>⌘3</span>
                      </button>
                      <button
                        className={`${styles.styleOption} ${displayStyle === 'transparent' ? styles.selected : ''}`}
                        onClick={() => setDisplayStyle('transparent')}
                      >
                        <div className={styles.stylePreview}>
                          <div className={styles.transparentPreview}></div>
                        </div>
                        <span className={styles.styleLabel}>투명</span>
                        <span className={styles.styleNumber}>⌘4</span>
                      </button>
                    </div>
                  </div>

                  <div className={styles.dropdownDivider}></div>

                  <div className={styles.dropdownSection}>
                    <div className={styles.toggleRow}>
                      <span className={styles.toggleLabel}>은선모드</span>
                      <label className={styles.toggleSwitch}>
                        <input
                          type="checkbox"
                          checked={hiddenLineMode}
                          onChange={(e) => setHiddenLineMode(e.target.checked)}
                        />
                        <span className={styles.toggleSlider}></span>
                      </label>
                    </div>
                  </div>

                  <div className={styles.dropdownDivider}></div>

                  <div className={styles.dropdownSection}>
                    <h4 className={styles.dropdownTitle}>그래픽 설정</h4>
                    <div className={styles.graphicsButtons}>
                      <button
                        className={`${styles.graphicsBtn} ${photoRealisticMode ? styles.active : ''}`}
                        onClick={() => setPhotoRealisticMode(true)}
                      >
                        효과 우선
                      </button>
                      <button
                        className={`${styles.graphicsBtn} ${!photoRealisticMode ? styles.active : ''}`}
                        onClick={() => setPhotoRealisticMode(false)}
                      >
                        성능 우선
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className={`${styles.topBtn} ${lightPanelOpen ? styles.active : ''}`}
                title="Light"
                onClick={() => setLightPanelOpen(!lightPanelOpen)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
                </svg>
              </button>

              {lightPanelOpen && (
                <div className={styles.sunDropdown}>
                  <div className={styles.dropdownHeader}>
                    <span>Light Settings</span>
                    <button onClick={() => setLightPanelOpen(false)} className={styles.closeBtn}>×</button>
                  </div>
                  <div className={styles.dropdownBody}>
                    {/* Add Light Buttons */}
                    <div className={styles.controlGroup}>
                      <label>조명 추가</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={() => {
                            if (lightPlacementMode && selectedLightType === 'point') {
                              // Cancel placement mode
                              setLightPlacementMode(false);
                            } else {
                              // Start placement mode
                              setSelectedLightType('point');
                              setLightPlacementMode(true);
                              setViewMode('3D');
                              setPlayMode(false); // Disable play mode during light placement
                              console.log('[EditorPage] Starting point light placement mode');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: lightPlacementMode && selectedLightType === 'point' ? '#e74c3c' : '#3fae7a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {lightPlacementMode && selectedLightType === 'point' ? '배치 종료' : '+ 포인트 라이트'}
                        </button>
                        <button
                          onClick={() => {
                            if (lightPlacementMode && selectedLightType === 'spot') {
                              setLightPlacementMode(false);
                            } else {
                              setSelectedLightType('spot');
                              setLightPlacementMode(true);
                              setViewMode('3D');
                              setPlayMode(false);
                              console.log('[EditorPage] Starting spot light placement mode');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: lightPlacementMode && selectedLightType === 'spot' ? '#e74c3c' : '#3fae7a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {lightPlacementMode && selectedLightType === 'spot' ? '배치 종료' : '+ 스포트 라이트'}
                        </button>
                        <button
                          onClick={() => {
                            if (lightPlacementMode && selectedLightType === 'directional') {
                              setLightPlacementMode(false);
                            } else {
                              setSelectedLightType('directional');
                              setLightPlacementMode(true);
                              setViewMode('3D');
                              setPlayMode(false);
                              console.log('[EditorPage] Starting directional light placement mode');
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: lightPlacementMode && selectedLightType === 'directional' ? '#e74c3c' : '#3fae7a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {lightPlacementMode && selectedLightType === 'directional' ? '배치 종료' : '+ 방향성 라이트'}
                        </button>
                      </div>
                    </div>

                    {/* Light List */}
                    <div className={styles.controlGroup}>
                      <label>배치된 조명 ({lights.length})</label>
                      <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                        {lights.length === 0 ? (
                          <div style={{
                            padding: '20px',
                            textAlign: 'center',
                            color: '#999',
                            fontSize: '12px',
                            background: '#f9f9f9',
                            borderRadius: '4px'
                          }}>
                            배치된 조명이 없습니다
                          </div>
                        ) : (
                          lights.map((light) => (
                            <div
                              key={light.id}
                              onClick={() => setSelectedLightId(light.id)}
                              style={{
                                padding: '12px',
                                marginBottom: '6px',
                                background: selectedLightId === light.id ? '#e8f5f0' : '#f9f9f9',
                                border: `2px solid ${selectedLightId === light.id ? '#3fae7a' : '#eee'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#333', marginBottom: '4px' }}>
                                    [{light.type === 'point' ? '포인트' : light.type === 'spot' ? '스포트' : '방향성'}] {light.name}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#999' }}>
                                    강도: {light.intensity.toFixed(1)} | {light.enabled ? '켜짐' : '꺼짐'}
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLights(lights.filter(l => l.id !== light.id));
                                    if (selectedLightId === light.id) {
                                      setSelectedLightId(null);
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    background: '#ff4444',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Selected Light Settings */}
                    {selectedLightId && lights.find(l => l.id === selectedLightId) && (() => {
                      const selectedLight = lights.find(l => l.id === selectedLightId)!;
                      return (
                        <div style={{ borderTop: '1px solid #eee', paddingTop: '16px', marginTop: '8px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>
                            상세 설정
                          </div>

                          {/* Name */}
                          <div className={styles.controlGroup}>
                            <label>이름</label>
                            <input
                              type="text"
                              value={selectedLight.name}
                              onChange={(e) => {
                                setLights(lights.map(l =>
                                  l.id === selectedLightId ? { ...l, name: e.target.value } : l
                                ));
                              }}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '13px',
                              }}
                            />
                          </div>

                          {/* Intensity */}
                          <div className={styles.controlGroup}>
                            <label>강도 (Intensity)</label>
                            <div className={styles.controlInput}>
                              <input
                                type="range"
                                min="0"
                                max="5"
                                step="0.1"
                                value={selectedLight.intensity}
                                onChange={(e) => {
                                  setLights(lights.map(l =>
                                    l.id === selectedLightId ? { ...l, intensity: parseFloat(e.target.value) } : l
                                  ));
                                }}
                                className={styles.rangeSlider}
                              />
                              <span className={styles.valueDisplay}>{selectedLight.intensity.toFixed(1)}</span>
                            </div>
                          </div>

                          {/* Color */}
                          <div className={styles.controlGroup}>
                            <label>색상 (Color)</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input
                                type="color"
                                value={`#${selectedLight.color.r.toString(16).padStart(2, '0')}${selectedLight.color.g.toString(16).padStart(2, '0')}${selectedLight.color.b.toString(16).padStart(2, '0')}`}
                                onChange={(e) => {
                                  const hex = e.target.value;
                                  const r = parseInt(hex.slice(1, 3), 16);
                                  const g = parseInt(hex.slice(3, 5), 16);
                                  const b = parseInt(hex.slice(5, 7), 16);
                                  setLights(lights.map(l =>
                                    l.id === selectedLightId ? { ...l, color: { r, g, b } } : l
                                  ));
                                }}
                                style={{
                                  width: '50px',
                                  height: '32px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              />
                              <span style={{ fontSize: '12px', color: '#666' }}>
                                RGB({selectedLight.color.r}, {selectedLight.color.g}, {selectedLight.color.b})
                              </span>
                            </div>
                          </div>

                          {/* Range (for point and spot) */}
                          {(selectedLight.type === 'point' || selectedLight.type === 'spot') && (
                            <div className={styles.controlGroup}>
                              <label>범위 (Range)</label>
                              <div className={styles.controlInput}>
                                <input
                                  type="range"
                                  min="1"
                                  max="50"
                                  step="0.5"
                                  value={selectedLight.range || 10}
                                  onChange={(e) => {
                                    setLights(lights.map(l =>
                                      l.id === selectedLightId ? { ...l, range: parseFloat(e.target.value) } : l
                                    ));
                                  }}
                                  className={styles.rangeSlider}
                                />
                                <span className={styles.valueDisplay}>{(selectedLight.range || 10).toFixed(1)}m</span>
                              </div>
                            </div>
                          )}

                          {/* Angle (for spot) */}
                          {selectedLight.type === 'spot' && (
                            <div className={styles.controlGroup}>
                              <label>각도 (Angle)</label>
                              <div className={styles.controlInput}>
                                <input
                                  type="range"
                                  min="10"
                                  max="90"
                                  step="1"
                                  value={selectedLight.angle || 45}
                                  onChange={(e) => {
                                    setLights(lights.map(l =>
                                      l.id === selectedLightId ? { ...l, angle: parseFloat(e.target.value) } : l
                                    ));
                                  }}
                                  className={styles.rangeSlider}
                                />
                                <span className={styles.valueDisplay}>{selectedLight.angle || 45}°</span>
                              </div>
                            </div>
                          )}

                          {/* Shadows */}
                          <div className={styles.controlGroup}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>그림자 (Shadows)</label>
                              <label className={styles.toggleSwitch}>
                                <input
                                  type="checkbox"
                                  checked={selectedLight.castShadows}
                                  onChange={(e) => {
                                    setLights(lights.map(l =>
                                      l.id === selectedLightId ? { ...l, castShadows: e.target.checked } : l
                                    ));
                                  }}
                                />
                                <span className={styles.toggleSlider}></span>
                              </label>
                            </div>
                          </div>

                          {/* Enabled */}
                          <div className={styles.controlGroup}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label style={{ margin: 0 }}>활성화 (Enabled)</label>
                              <label className={styles.toggleSwitch}>
                                <input
                                  type="checkbox"
                                  checked={selectedLight.enabled}
                                  onChange={(e) => {
                                    setLights(lights.map(l =>
                                      l.id === selectedLightId ? { ...l, enabled: e.target.checked } : l
                                    ));
                                  }}
                                />
                                <span className={styles.toggleSlider}></span>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
            <button className={styles.topBtn} title="Material">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
              </svg>
            </button>
            <button
              className={`${styles.topBtn} ${showCharacter ? styles.active : ''}`}
              title="Character"
              onClick={() => setShowCharacter(!showCharacter)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className={`${styles.topBtn} ${sunPanelOpen ? styles.active : ''}`}
                title="Sun"
                onClick={() => setSunPanelOpen(!sunPanelOpen)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>
                </svg>
              </button>

              {sunPanelOpen && (
                <div className={styles.sunDropdown}>
                  <div className={styles.dropdownHeader}>
                    <span>Sun Settings</span>
                    <button onClick={() => setSunPanelOpen(false)} className={styles.closeBtn}>×</button>
                  </div>
                  <div className={styles.dropdownBody}>
                    {/* Intensity */}
                    <div className={styles.controlGroup}>
                      <label>Intensity</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          value={sunSettings.intensity}
                          onChange={(e) => setSunSettings({...sunSettings, intensity: parseFloat(e.target.value)})}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{sunSettings.intensity.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Azimuth */}
                    <div className={styles.controlGroup}>
                      <label>Azimuth</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="1"
                          value={sunSettings.azimuth}
                          onChange={(e) => setSunSettings({...sunSettings, azimuth: parseFloat(e.target.value)})}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{sunSettings.azimuth}°</span>
                      </div>
                    </div>

                    {/* Altitude */}
                    <div className={styles.controlGroup}>
                      <label>Altitude</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          step="1"
                          value={sunSettings.altitude}
                          onChange={(e) => setSunSettings({...sunSettings, altitude: parseFloat(e.target.value)})}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{sunSettings.altitude}°</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button className={styles.topBtn} title="Ambient">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
              </svg>
            </button>
            <button className={styles.topBtn} title="Dimensions">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button className={styles.topBtn} title="Render">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            </button>
            <button className={styles.topBtn} title="Draw">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
            <button
              className={styles.topBtn}
              title="Render Image"
              onClick={() => setRenderModalOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="3.2"/>
                <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
              </svg>
            </button>

            {false && (
              <div className={styles.sunDropdown} style={{ width: '320px', maxHeight: '600px', overflowY: 'auto' }}>
                <div className={styles.dropdownHeader}>
                  <span>Rendering Settings</span>
                  <button onClick={() => setRenderSettingsOpen(false)} className={styles.closeBtn}>×</button>
                </div>
                <div className={styles.dropdownBody}>
                  {/* SSAO Radius */}
                  <div className={styles.controlGroup}>
                    <label>SSAO Radius</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={renderSettings.ssaoRadius}
                        onChange={(e) => setRenderSettings({...renderSettings, ssaoRadius: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.ssaoRadius.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* SSAO Strength */}
                  <div className={styles.controlGroup}>
                    <label>SSAO Strength</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={renderSettings.ssaoStrength}
                        onChange={(e) => setRenderSettings({...renderSettings, ssaoStrength: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.ssaoStrength.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* SSR Strength */}
                  <div className={styles.controlGroup}>
                    <label>SSR Strength</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={renderSettings.ssrStrength}
                        onChange={(e) => setRenderSettings({...renderSettings, ssrStrength: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.ssrStrength.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Bloom Threshold */}
                  <div className={styles.controlGroup}>
                    <label>Bloom Threshold</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={renderSettings.bloomThreshold}
                        onChange={(e) => setRenderSettings({...renderSettings, bloomThreshold: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.bloomThreshold.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Bloom Weight */}
                  <div className={styles.controlGroup}>
                    <label>Bloom Weight</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={renderSettings.bloomWeight}
                        onChange={(e) => setRenderSettings({...renderSettings, bloomWeight: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.bloomWeight.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* DOF Focus Distance */}
                  <div className={styles.controlGroup}>
                    <label>DOF Focus Distance (mm)</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="1000"
                        max="10000"
                        step="100"
                        value={renderSettings.dofFocusDistance}
                        onChange={(e) => setRenderSettings({...renderSettings, dofFocusDistance: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.dofFocusDistance}</span>
                    </div>
                  </div>

                  {/* DOF F-Stop */}
                  <div className={styles.controlGroup}>
                    <label>DOF F-Stop</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="1"
                        max="22"
                        step="0.1"
                        value={renderSettings.dofFStop}
                        onChange={(e) => setRenderSettings({...renderSettings, dofFStop: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>f/{renderSettings.dofFStop.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Chromatic Aberration */}
                  <div className={styles.controlGroup}>
                    <label>Chromatic Aberration</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={renderSettings.chromaticAberration}
                        onChange={(e) => setRenderSettings({...renderSettings, chromaticAberration: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.chromaticAberration.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Grain Intensity */}
                  <div className={styles.controlGroup}>
                    <label>Grain Intensity</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={renderSettings.grainIntensity}
                        onChange={(e) => setRenderSettings({...renderSettings, grainIntensity: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.grainIntensity.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Vignette Weight */}
                  <div className={styles.controlGroup}>
                    <label>Vignette Weight</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.1"
                        value={renderSettings.vignetteWeight}
                        onChange={(e) => setRenderSettings({...renderSettings, vignetteWeight: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.vignetteWeight.toFixed(1)}</span>
                    </div>
                  </div>

                  {/* Sharpen Amount */}
                  <div className={styles.controlGroup}>
                    <label>Sharpen Amount</label>
                    <div className={styles.controlInput}>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={renderSettings.sharpenAmount}
                        onChange={(e) => setRenderSettings({...renderSettings, sharpenAmount: parseFloat(e.target.value)})}
                        className={styles.rangeSlider}
                      />
                      <span className={styles.valueDisplay}>{renderSettings.sharpenAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button className={styles.topBtn} title="Target">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
                <circle cx="12" cy="12" r="5"/>
              </svg>
            </button>
            <button className={styles.topBtn} title="Layout">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/>
              </svg>
            </button>
            <button className={styles.topBtn} title="Grid">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z"/>
              </svg>
            </button>
            <button className={styles.topBtn} title="View">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            </button>

            <div className={styles.playButtons}>
              <button className={styles.navBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                </svg>
              </button>
              <button className={styles.navBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              </button>
              <button
                className={`${styles.playBtn} ${playMode ? styles.playBtnActive : ''}`}
                onClick={() => {
                  if (!playMode) {
                    setViewMode('3D'); // Switch to 3D view
                  }
                  setPlayMode(!playMode);
                }}
                title={playMode ? 'Exit Play Mode' : 'Enter Play Mode (WASD)'}
              >
                {playMode ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                    Stop
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    Play
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.headerBtn}>Save</button>
          <button className={styles.headerBtn}>Export</button>
          <button className={styles.headerBtnPrimary}>Publish</button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className={styles.mainContent} style={playMode ? { paddingLeft: 0 } : {}}>
        {/* Left Green Sidebar */}
        {!playMode && (
        <div className={styles.leftSidebar}>
        <div className={styles.sidebarButtons}>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7"/>
                <rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/>
              </svg>
            </div>
            <span>Create<br/>Room</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6M1 12h6m6 0h6"/>
              </svg>
            </div>
            <span>Customize</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18"/>
                <path d="M3 9h18M9 9v12"/>
              </svg>
            </div>
            <span>Model<br/>Library</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 12l9-9 9 9M5 10v11h4v-6h6v6h4V10"/>
              </svg>
            </div>
            <span>Mode</span>
          </button>

          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="8" r="4"/>
                <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
              </svg>
            </div>
            <span>My</span>
          </button>
        </div>

        <div className={styles.sidebarBottom}>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="1"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            </div>
          </button>
          <button className={styles.sidebarBtn}>
            <div className={styles.icon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>
          </button>
        </div>
      </div>
        )}

      {/* Left Tools Panel */}
      {!playMode && leftPanelOpen && (
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h3>Create Room</h3>
            <button onClick={() => setLeftPanelOpen(false)}>×</button>
          </div>

          <div className={styles.createRoomOptions}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <input
              ref={glbFileInputRef}
              type="file"
              accept=".glb"
              onChange={handleGlbUpload}
              style={{ display: 'none' }}
            />
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
              </div>
              <span>Explore</span>
            </button>
            <button className={styles.optionCard} onClick={() => fileInputRef.current?.click()}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
              </div>
              <span>Import</span>
            </button>
            <button className={styles.optionCard} onClick={() => glbFileInputRef.current?.click()}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.9 8.89l-1.05-4.37c-.22-.9-1-1.52-1.91-1.52H5.05c-.9 0-1.69.63-1.9 1.52L2.1 8.89c-.24 1.02-.02 2.06.62 2.88.08.11.19.19.28.29V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6.94c.09-.09.2-.18.28-.28.64-.82.87-1.87.62-2.89zM18.91 4.99l1.05 4.37c.1.42.01.84-.25 1.17-.14.18-.44.47-1.05.47-.83 0-1.52-.64-1.63-1.5l-.5-4.5h2.38zM13 4.99h1.96l.54 4.52c.05.46.23.88.5 1.23.1.15.22.28.36.4-.07.08-.14.16-.22.25v3.61h-3.14V4.99zM5.05 4.99h2.38l-.5 4.5c-.11.86-.8 1.5-1.63 1.5-.61 0-.91-.29-1.05-.47-.25-.33-.35-.75-.25-1.17l1.05-4.36zM5 19v-6.03c.08-.01.15-.03.23-.06.24-.07.48-.23.7-.4.1.17.23.33.39.47.41.37.95.59 1.55.59.64 0 1.24-.25 1.66-.66.23-.23.39-.5.48-.78.09.28.25.54.48.78.42.41 1.02.66 1.66.66.23 0 .45-.03.66-.08v4.51H5zm14 0h-3V5.71l.54 4.79c.1.92.48 1.76 1.07 2.42.1.11.2.2.31.29v5.79z"/>
                </svg>
              </div>
              <span>3D Model</span>
            </button>
            <button className={styles.optionCard}>
              <div className={styles.optionIcon}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
                </svg>
              </div>
              <span>RoomScaner</span>
            </button>
          </div>

          {/* Walls */}
          <div className={styles.toolSection}>
            <h4>Walls</h4>
            <div className={styles.toolGrid}>
              <button
                className={`${styles.toolBtn} ${activeTool === ToolType.SELECT ? styles.toolBtnActive : ''}`}
                title="Select and Move Points"
                onClick={() => setActiveTool(ToolType.SELECT)}
              >
                <RxCursorArrow size={32} />
                <span>Select</span>
              </button>
              <button
                className={`${styles.toolBtn} ${activeTool === ToolType.WALL ? styles.toolBtnActive : ''}`}
                title="Draw Staight Walls"
                onClick={() => setActiveTool(ToolType.WALL)}
              >
                <img src="/icons/wall.svg" alt="Wall" width="32" height="32" />
                <span>Draw Staight Walls</span>
              </button>
              <button className={styles.toolBtn} title="Draw Arc Walls">
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 8 28 Q 24 8, 40 28" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Draw Arc Walls</span>
              </button>
              <button
                className={`${styles.toolBtn} ${activeTool === ToolType.RECTANGLE ? styles.toolBtnActive : ''}`}
                title="Draw Rooms"
                onClick={() => setActiveTool(ToolType.RECTANGLE)}
              >
                <img src="/icons/room.svg" alt="Room" width="32" height="32" />
                <span>Draw Rooms</span>
              </button>
            </div>
          </div>

          {/* Door */}
          <div className={styles.toolSection}>
            <h4>Door</h4>
            <div className={styles.toolGrid}>
              <button
                className={`${styles.toolBtn} ${activeTool === ToolType.DOOR ? styles.toolBtnActive : ''}`}
                title="Place Door (900mm x 2100mm)"
                onClick={() => setActiveTool(ToolType.DOOR)}
              >
                <img src="/icons/singledoor.svg" alt="Single Door" width="32" height="32" />
                <span>Single Door</span>
              </button>
              <button className={styles.toolBtn}>
                <img src="/icons/doubledoor.svg" alt="Double Door" width="32" height="32" />
                <span>Double Door</span>
              </button>
              <button className={styles.toolBtn}>
                <img src="/icons/window.svg" alt="Sliding Door" width="32" height="32" />
                <span>Sliding Door</span>
              </button>
            </div>
          </div>

          {/* Window */}
          <div className={styles.toolSection}>
            <h4>Window</h4>
            <div className={styles.toolGrid}>
              <button className={styles.toolBtn}>
                <img src="/icons/slidingdoor.svg" alt="Single Window" width="32" height="32" />
                <span>Single Window</span>
              </button>
              <button className={styles.toolBtn}>
                <img src="/icons/dualwindow.svg" alt="Dual Window" width="32" height="32" />
                <span>Dual Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="8" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="30" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Unequal Double Door</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 12 24 L 18 18 L 30 18 L 36 24 L 30 30 L 18 30 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Corner Bay Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 14 24 L 20 20 L 28 20 L 34 24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Corner Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="12" y="20" width="24" height="8" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Bay Window</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 16 24 Q 24 16, 32 24" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Arc Window</span>
              </button>
            </div>
          </div>

          {/* Structure */}
          <div className={styles.toolSection}>
            <h4>Structure</h4>
            <div className={styles.toolGrid}>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <path d="M 16 12 L 16 36 M 32 12 L 32 36" stroke="currentColor" strokeWidth="2"/>
                </svg>
                <span>Door Opening</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="16" y="20" width="16" height="8" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Flue</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="12" y="20" width="24" height="3" fill="currentColor"/>
                </svg>
                <span>Beam</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="16" y="16" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Square</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Circle</span>
              </button>
              <button className={styles.toolBtn}>
                <svg width="32" height="32" viewBox="0 0 48 48">
                  <rect x="14" y="14" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Frame</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className={styles.viewport}>
        {/* View Mode Toggle (Top Right) */}
        <div className={styles.viewModeToggle}>
          <button
            className={`${styles.viewModeBtn} ${viewMode === '2D' ? styles.viewModeBtnActive : ''}`}
            onClick={() => {
              setViewMode('2D');
              setPlayMode(false);
            }}
          >
            2D
          </button>
          <button
            className={`${styles.viewModeBtn} ${viewMode === '3D' ? styles.viewModeBtnActive : ''}`}
            onClick={() => {
              setViewMode('3D');
              setPlayMode(false);
            }}
          >
            3D
          </button>
        </div>

        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          visibility: playMode ? 'hidden' : (viewMode === '2D' ? 'visible' : 'hidden'),
          pointerEvents: playMode ? 'none' : (viewMode === '2D' ? 'auto' : 'none')
        }}>
          <FloorplanCanvas
            activeTool={activeTool}
            onDataChange={setFloorplanData}
            backgroundImage={showBackgroundImage ? backgroundImage : null}
            imageScale={imageScale}
            imageOpacity={imageOpacity}
            onDimensionClick={handleDimensionClick}
            rulerVisible={rulerVisible}
            rulerStart={rulerStart}
            rulerEnd={rulerEnd}
            onRulerDragStart={handleRulerDragStart}
            onRulerDrag={handleRulerDrag}
            onRulerDragEnd={handleRulerDragEnd}
            onRulerLabelClick={handleRulerLabelClick}
            draggingRulerPoint={draggingRulerPoint}
            scannedWalls={scannedWalls}
          />
        </div>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          visibility: playMode || viewMode === '3D' ? 'visible' : 'hidden',
          pointerEvents: playMode || viewMode === '3D' ? 'auto' : 'none',
          cursor: lightPlacementMode ? 'crosshair' : 'default'
        }}>
          <Babylon3DCanvas
            ref={babylon3DCanvasRef}
            floorplanData={floorplanData}
            visible={playMode || viewMode === '3D'}
            sunSettings={sunSettings}
            playMode={playMode}
            showCharacter={showCharacter}
            glbModelFile={glbModelFile}
            photoRealisticMode={photoRealisticMode}
            renderSettings={renderSettings}
            lights={lights}
            lightPlacementMode={lightPlacementMode}
            selectedLightType={selectedLightType}
            onLightPlaced={handleLightPlaced}
          />

          {/* Light Placement Guide Overlay */}
          {lightPlacementMode && viewMode === '3D' && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(0, 0, 0, 0.85)',
              color: 'white',
              padding: '32px 48px',
              borderRadius: '12px',
              fontSize: '24px',
              fontWeight: '600',
              textAlign: 'center',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            }}>
              <div style={{ marginBottom: '12px' }}>
                {selectedLightType === 'point' ? '포인트 라이트' :
                 selectedLightType === 'spot' ? '스포트 라이트' :
                 '방향성 라이트'} 배치 모드
              </div>
              <div style={{ fontSize: '18px', fontWeight: '400', color: '#ffc107' }}>
                3D 뷰를 클릭해서 조명을 배치하세요
              </div>
              <div style={{ fontSize: '14px', fontWeight: '400', color: '#aaa', marginTop: '8px' }}>
                여러 개 배치 가능 | 종료: 빨간 버튼 클릭
              </div>
            </div>
          )}
        </div>

        {/* Dimension Edit Modal */}
        {editingWallId && viewMode === '2D' && !playMode && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            border: '2px solid #3fae7a',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
            zIndex: 2000,
            minWidth: '320px',
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#333' }}>
              벽 치수 수정
            </h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#666', fontWeight: '500' }}>
                치수 (mm):
              </label>
              <input
                type="number"
                value={dimensionInput}
                onChange={(e) => setDimensionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDimensionSubmit();
                  if (e.key === 'Escape') {
                    setEditingWallId(null);
                    setDimensionInput('');
                  }
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setEditingWallId(null);
                  setDimensionInput('');
                }}
                style={{
                  padding: '8px 16px',
                  background: '#f5f5f5',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleDimensionSubmit}
                style={{
                  padding: '8px 20px',
                  background: '#3fae7a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* Ruler Label Edit Overlay */}
        {editingRulerLabel && viewMode === '2D' && !playMode && (
          <div style={{
            position: 'absolute',
            left: `${editingRulerLabel.x}px`,
            top: `${editingRulerLabel.y + 40}px`,
            background: 'white',
            padding: '12px',
            borderRadius: '6px',
            border: '2px solid #FF0000',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            zIndex: 2000,
            minWidth: '200px',
          }}>
            <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666', fontWeight: '500' }}>
              실제 거리 입력:
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                value={rulerDistance}
                onChange={(e) => setRulerDistance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRulerLabelSubmit();
                  if (e.key === 'Escape') setEditingRulerLabel(null);
                }}
                autoFocus
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '13px',
                }}
              />
              <span style={{ fontSize: '13px', color: '#666' }}>mm</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={() => setEditingRulerLabel(null)}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: '#f5f5f5',
                  color: '#666',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                취소
              </button>
              <button
                onClick={handleRulerLabelSubmit}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  background: '#FF0000',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                확인
              </button>
            </div>
          </div>
        )}

        {/* Image Controls Overlay */}
        {backgroundImage && viewMode === '2D' && !playMode && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'white',
            padding: '16px 24px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            minWidth: '400px',
          }}>
            {/* Ruler Guide Instructions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>
                🎯 줄자 가이드를 드래그해서 이미지의 알려진 치수에 맞추세요
              </span>
            </div>

            {/* Distance Input (always visible when ruler is present) */}
            {rulerVisible && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '13px', color: '#666', fontWeight: '500', minWidth: '80px' }}>
                  실제 거리:
                </label>
                <input
                  type="number"
                  value={rulerDistance}
                  onChange={(e) => setRulerDistance(e.target.value)}
                  placeholder="예: 3550"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '13px',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#666' }}>mm</span>
                <button
                  onClick={handleRulerSubmit}
                  style={{
                    padding: '8px 20px',
                    background: '#3fae7a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  스케일 적용
                </button>
              </div>
            )}

            {/* Image Visibility Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', color: '#666', fontWeight: '500', minWidth: '80px' }}>
                이미지 표시:
              </label>
              <button
                onClick={() => setShowBackgroundImage(!showBackgroundImage)}
                style={{
                  padding: '8px 16px',
                  background: showBackgroundImage ? '#3fae7a' : '#f5f5f5',
                  color: showBackgroundImage ? 'white' : '#666',
                  border: showBackgroundImage ? 'none' : '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {showBackgroundImage ? '표시됨' : '숨김'}
              </button>
            </div>

            {/* Opacity Control */}
            {showBackgroundImage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '13px', color: '#666', fontWeight: '500', minWidth: '50px' }}>
                  투명도:
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={imageOpacity}
                  onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '13px', color: '#333', fontWeight: '500', minWidth: '40px' }}>
                  {Math.round(imageOpacity * 100)}%
                </span>
              </div>
            )}

            {/* Scan Button */}
            <button
              onClick={handleScan}
              style={{
                padding: '10px 20px',
                background: '#3fae7a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2d9967';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#3fae7a';
              }}
            >
              스캐닝
            </button>
          </div>
        )}
      </div>

      {/* Right Settings Panel */}
      {!playMode && rightPanelOpen && (
        <div className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h3>Layer Settings</h3>
            <button onClick={() => setRightPanelOpen(false)}>×</button>
          </div>

          {/* Basic Parameters */}
          <div className={styles.settingsSection}>
            <h4>Basic Parameters</h4>
            <div className={styles.settingRow}>
              <label>Total Building</label>
              <input type="text" defaultValue="0.00 ㎡" readOnly />
            </div>
          </div>

          {/* Wall Settings */}
          <div className={styles.settingsSection}>
            <h4>Wall Settings</h4>
            <div className={styles.settingRow}>
              <label>Lock Walls</label>
              <input type="checkbox" />
            </div>
            <div className={styles.settingRow}>
              <label>Wall Height</label>
              <input type="text" defaultValue="2400 mm" />
            </div>
            <div className={styles.settingRow}>
              <label>Wall Thickness</label>
              <input type="text" defaultValue="100 mm" />
            </div>
            <button className={styles.deleteBtn}>Delete All Walls</button>
          </div>

          {/* Floor Setting */}
          <div className={styles.settingsSection}>
            <h4>Floor Setting</h4>
            <div className={styles.settingRow}>
              <label>Floor Thickness</label>
              <input type="text" defaultValue="120 mm" />
            </div>
            <button className={styles.editBtn}>Edit Floor ›</button>
          </div>
        </div>
      )}

      {/* Rendering Modal */}
      {renderModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            backgroundColor: '#1e1e1e',
            borderRadius: '12px',
            padding: '30px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#fff' }}>Photo-Realistic Render</h2>
              <button
                onClick={() => {
                  setRenderModalOpen(false);
                  setRenderedImage(null);
                  setRenderProgress(0);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '28px',
                  color: '#999',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1,
                }}
              >×</button>
            </div>

            {!renderedImage && !renderInProgress && (
              <>
                {/* Resolution */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '14px', fontWeight: 500 }}>해상도</label>
                  <select
                    value={renderSettings.resolution}
                    onChange={(e) => setRenderSettings({...renderSettings, resolution: e.target.value as any})}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #444',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '14px',
                    }}
                  >
                    <option value="1920x1080">Full HD (1920 x 1080)</option>
                    <option value="2560x1440">2K (2560 x 1440)</option>
                    <option value="3840x2160">4K (3840 x 2160)</option>
                  </select>
                </div>

                {/* Settings */}
                <div style={{ marginBottom: '25px' }}>
                  <h3 style={{ fontSize: '16px', color: '#fff', marginBottom: '15px', fontWeight: 600 }}>렌더링 설정</h3>

                  <div style={{ display: 'grid', gap: '15px' }}>
                    {/* SSAO */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#aaa', fontSize: '13px' }}>SSAO Strength</label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={renderSettings.ssaoStrength}
                        onChange={(e) => setRenderSettings({...renderSettings, ssaoStrength: parseFloat(e.target.value)})}
                        style={{ width: '100%' }}
                      />
                      <span style={{ color: '#888', fontSize: '12px' }}>{renderSettings.ssaoStrength.toFixed(1)}</span>
                    </div>

                    {/* Bloom */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#aaa', fontSize: '13px' }}>Bloom Weight</label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={renderSettings.bloomWeight}
                        onChange={(e) => setRenderSettings({...renderSettings, bloomWeight: parseFloat(e.target.value)})}
                        style={{ width: '100%' }}
                      />
                      <span style={{ color: '#888', fontSize: '12px' }}>{renderSettings.bloomWeight.toFixed(2)}</span>
                    </div>

                    {/* DOF F-Stop */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#aaa', fontSize: '13px' }}>DOF F-Stop</label>
                      <input
                        type="range"
                        min="1"
                        max="22"
                        step="0.1"
                        value={renderSettings.dofFStop}
                        onChange={(e) => setRenderSettings({...renderSettings, dofFStop: parseFloat(e.target.value)})}
                        style={{ width: '100%' }}
                      />
                      <span style={{ color: '#888', fontSize: '12px' }}>f/{renderSettings.dofFStop.toFixed(1)}</span>
                    </div>

                    {/* Grain */}
                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: '#aaa', fontSize: '13px' }}>Film Grain</label>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={renderSettings.grainIntensity}
                        onChange={(e) => setRenderSettings({...renderSettings, grainIntensity: parseFloat(e.target.value)})}
                        style={{ width: '100%' }}
                      />
                      <span style={{ color: '#888', fontSize: '12px' }}>{renderSettings.grainIntensity.toFixed(1)}</span>
                    </div>
                  </div>
                </div>

                {/* Start Render Button */}
                <button
                  onClick={handleStartRender}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#2196f3',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1976d2'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2196f3'}
                >
                  렌더링 시작
                </button>
              </>
            )}

            {/* Rendering Progress */}
            {renderInProgress && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#333',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${renderProgress}%`,
                      height: '100%',
                      backgroundColor: '#2196f3',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <p style={{ marginTop: '12px', color: '#ccc', fontSize: '14px' }}>{renderProgress}%</p>
                </div>
                <p style={{ color: '#999', fontSize: '14px' }}>렌더링 중...</p>
              </div>
            )}

            {/* Rendered Image */}
            {renderedImage && !renderInProgress && (
              <div>
                <div style={{
                  marginBottom: '20px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: '#000',
                }}>
                  <img
                    src={renderedImage}
                    alt="Rendered"
                    style={{ width: '100%', display: 'block' }}
                  />
                </div>
                <button
                  onClick={handleDownloadRender}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: '#4caf50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#45a049'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4caf50'}
                >
                  이미지 다운로드
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default EditorPage;
