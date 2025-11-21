import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FloorplanCanvas from '../floorplan/FloorplanCanvas';
import Babylon3DCanvas, { type Babylon3DCanvasRef } from '../babylon/Babylon3DCanvas';
import styles from './EditorPage.module.css';
import { ToolType } from '../core/types/EditorState';
// import { createTestRoom } from '../floorplan/blueprint/BlueprintToBabylonAdapter';
import { RxCursorArrow } from 'react-icons/rx';
import { PiCubeTransparentLight } from 'react-icons/pi';
import { eventBus } from '../core/events/EventBus';
import { EditorEvents } from '../core/events/EditorEvents';
import type { Light, LightType } from '../core/types/Light';
import { CameraSettingsModal } from '../ui/modals/CameraSettingsModal';
import { ExportModal } from '../ui/modals/ExportModal';
import { useCameraSettingsStore } from '../stores/cameraSettingsStore';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { AIRenderModal } from '../ui/landing/components/AIRenderModal';
import FloorplanPreview from '../ui/components/FloorplanPreview';

type ToolCategory = 'walls' | 'door' | 'window' | 'structure';

const EditorPage = () => {
  const navigate = useNavigate();
  const setModalOpen = useCameraSettingsStore((state) => state.setModalOpen);
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
  const [exportModalOpen, setExportModalOpen] = useState(false); // Export modal toggle
  const [aiRenderModalOpen, setAiRenderModalOpen] = useState(false); // New AI Render Modal toggle
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // Captured 3D view for AI

  // Screenshot resolution settings
  const [screenshotResolution, setScreenshotResolution] = useState<'1080p' | '4k' | '8k'>('4k');
  const [aiRenderStyle, setAiRenderStyle] = useState<'photorealistic' | 'product' | 'minimalist' | 'sticker'>('photorealistic');
  const [aiAspectRatio, setAiAspectRatio] = useState<'1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9'>('1:1');
  const [aiTimeOfDay, setAiTimeOfDay] = useState<'day' | 'golden_hour' | 'blue_hour' | 'night' | 'overcast'>('day');
  const [aiLightingMood, setAiLightingMood] = useState<'bright' | 'soft' | 'moody' | 'dramatic'>('soft');
  const [aiFurnitureStyle, setAiFurnitureStyle] = useState<'modern' | 'classic' | 'scandinavian' | 'industrial' | 'luxury' | 'minimalist'>('modern');
  const [aiRenderPanelOpen, setAiRenderPanelOpen] = useState(false);
  const [aiInputImage, setAiInputImage] = useState<string | null>(null);
  const [aiOutputImage, setAiOutputImage] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Rendering settings panel (right sidebar)
  const [renderPanelOpen, setRenderPanelOpen] = useState(false);
  const [renderSettings, setRenderSettings] = useState({
    ssaoRadius: 1.5,
    ssaoStrength: 2.0,
    ssrStrength: 0.8,
    bloomThreshold: 0.6,
    bloomWeight: 0.5,
    dofFocusDistance: 5000,
    dofFStop: 2.0,
    chromaticAberration: 5,
    grainIntensity: 8,
    vignetteWeight: 2.0,
    sharpenAmount: 0.5,
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

  // Theme settings state
  const [themeSettingsOpen, setThemeSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [themeColor, setThemeColor] = useState<string>('#3fae7a');

  // Render style state (for header panel)
  const [renderStyleOpen, setRenderStyleOpen] = useState(false);
  const [renderStyle, setRenderStyle] = useState<'wireframe' | 'hidden-line' | 'solid' | 'realistic'>('realistic');

  // Grid visibility state
  const [showGrid, setShowGrid] = useState(true);

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

  // Handle light movement via gizmo
  const handleLightMoved = (lightId: string, newPosition: { x: number; y: number; z: number }) => {
    console.log('[EditorPage] Light moved:', lightId, 'to position:', newPosition);
    setLights(lights.map(l => l.id === lightId ? { ...l, position: newPosition } : l));
  };

  // Babylon3DCanvas ref for screenshot capture
  const babylon3DCanvasRef = useRef<Babylon3DCanvasRef | null>(null);

  // Capture and download high-quality render
  const handleCaptureScreenshot = async () => {
    if (!babylon3DCanvasRef.current) {
      alert('3D 뷰를 먼저 로드해주세요.');
      return;
    }

    try {
      // Resolution mapping
      const resolutions = {
        '1080p': { width: 1920, height: 1080 },
        '4k': { width: 3840, height: 2160 },
        '8k': { width: 7680, height: 4320 },
      };

      const { width, height } = resolutions[screenshotResolution];
      console.log(`[EditorPage] Starting ULTRA-QUALITY render at ${screenshotResolution} (${width}x${height})`);

      // Show loading message
      const loadingMessage = document.createElement('div');
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 1px solid #333;
        color: white;
        padding: 40px 60px;
        border-radius: 8px;
        font-size: 16px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.7);
        min-width: 320px;
      `;
      loadingMessage.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          border: 3px solid #333;
          border-top: 3px solid #3dbc58;
          border-radius: 50%;
          margin: 0 auto 20px;
          animation: spin 0.8s linear infinite;
        "></div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 12px;">
          Rendering
        </div>
        <div style="font-size: 14px; color: #888; line-height: 1.6;">
          Resolution: ${screenshotResolution.toUpperCase()} (${width}x${height})<br>
          Quality: Ultra (16K Shadows, 8x MSAA)
        </div>
      `;
      document.body.appendChild(loadingMessage);

      const blobUrl = await babylon3DCanvasRef.current.captureRender(width, height);

      console.log('[EditorPage] Blob URL created:', blobUrl);

      // Remove loading message
      document.body.removeChild(loadingMessage);

      // Download using Blob URL - with proper timing
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `archiple_render_${screenshotResolution}_${Date.now()}.png`;
      document.body.appendChild(link);

      console.log('[EditorPage] Download link appended, preparing to click...');

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        try {
          link.click();
          console.log('[EditorPage] Download triggered successfully');

          // Show success message AFTER successful download trigger
          const successMessage = document.createElement('div');
          successMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 1px solid #3dbc58;
        color: white;
        padding: 40px 60px;
        border-radius: 8px;
        font-size: 16px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.7);
        min-width: 320px;
      `;
          successMessage.innerHTML = `
        <div style="
          width: 48px;
          height: 48px;
          border: 3px solid #3dbc58;
          border-radius: 50%;
          margin: 0 auto 20px;
          position: relative;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -60%) rotate(45deg);
            width: 12px;
            height: 20px;
            border: solid #3dbc58;
            border-width: 0 3px 3px 0;
          "></div>
        </div>
        <div style="font-size: 18px; font-weight: 500; margin-bottom: 12px;">
          Render Complete
        </div>
        <div style="font-size: 14px; color: #888; line-height: 1.6;">
          ${screenshotResolution.toUpperCase()} image downloaded
        </div>
      `;
          document.body.appendChild(successMessage);
          setTimeout(() => document.body.removeChild(successMessage), 2000);

        } catch (error) {
          console.error('[EditorPage] Click failed:', error);
          alert('다운로드 실패: ' + (error as Error).message);
        }

        // Clean up after download
        setTimeout(() => {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(blobUrl);
          console.log('[EditorPage] Download cleanup complete');
        }, 2000);
      });

    } catch (error) {
      console.error('[EditorPage] Render failed:', error);
      alert('렌더링 실패: ' + (error as Error).message);
    }
  };

  // Generate lighting description based on time of day and mood
  const getLightingPrompt = (timeOfDay: typeof aiTimeOfDay, mood: typeof aiLightingMood): string => {
    const timeDescriptions = {
      day: {
        bright: 'Bright midday sunlight (12000K) streaming through windows, strong direct light, crisp sharp shadows, high contrast, vibrant colors, clear blue sky visible through windows',
        soft: 'Soft natural daylight (6500K), diffused through sheer curtains or clouds, gentle shadows with soft edges, balanced exposure, warm inviting atmosphere',
        moody: 'Dramatic side-lit daylight, strong directional light creating defined shadow areas, high contrast between light and shadow, cinematic depth',
        dramatic: 'Intense direct sunlight with dramatic light shafts, strong contrast, deep shadows in corners, spotlight effect from windows, theatrical lighting'
      },
      golden_hour: {
        bright: 'Intense golden hour sunlight (3500K), warm amber and orange tones flooding the room, long dramatic shadows, rich golden highlights, magic hour glow',
        soft: 'Soft golden hour light (4000K), warm honey tones, gentle amber glow, romantic atmosphere, soft peachy highlights, dreamy sunset ambiance',
        moody: 'Deep golden hour shadows, strong warm/cool contrast, dramatic side lighting, rich amber shadows, cinematic sunset mood',
        dramatic: 'Theatrical golden hour with intense orange sunbeams, extreme warm light, deep contrasting shadows, epic sunset atmosphere, HDR golden glow'
      },
      blue_hour: {
        bright: 'Bright twilight blue hour (8000K), cool blue-purple ambient light, some warm interior artificial lights, magical dusk atmosphere',
        soft: 'Gentle blue hour glow (7000K), soft cool blue ambient light, warm interior lights creating cozy contrast, serene twilight mood',
        moody: 'Moody blue hour with deep blue shadows, cool atmospheric lighting, mysterious twilight ambiance, dramatic blue tones',
        dramatic: 'Cinematic blue hour with intense cool blue exterior light vs. warm golden interior lights, strong color contrast, theatrical dusk lighting'
      },
      night: {
        bright: 'Well-lit night interior, multiple warm artificial lights (3000-3500K), bright and welcoming, minimal shadows, cozy evening atmosphere',
        soft: 'Soft ambient night lighting (2700K), warm dim interior lights, intimate atmosphere, gentle shadows, peaceful evening mood',
        moody: 'Atmospheric night lighting, selective illumination, areas of darkness and light, mysterious shadows, dramatic contrast',
        dramatic: 'Dramatic night scene with strong artificial lighting, theatrical spotlighting, deep shadows, high contrast, cinematic night atmosphere'
      },
      overcast: {
        bright: 'Bright overcast daylight (6500K), even diffused illumination from all directions, no direct shadows, soft uniform lighting, gallery-like conditions',
        soft: 'Gentle overcast light (6000K), extremely soft diffused illumination, almost shadowless, calm neutral atmosphere, peaceful even lighting',
        moody: 'Dark overcast with low light levels, muted colors, soft but dim illumination, melancholic atmosphere, subtle shadows',
        dramatic: 'Stormy overcast with dark moody light, low contrast, heavy atmospheric feeling, dramatic weather lighting, somber tones'
      }
    };

    return timeDescriptions[timeOfDay][mood];
  };

  // Generate furniture style description
  const getFurniturePrompt = (furnitureStyle: typeof aiFurnitureStyle): string => {
    const furnitureDescriptions = {
      modern: 'Contemporary modern furniture with clean lines, smooth surfaces, neutral colors (white, gray, black, beige), glass and metal accents, minimal ornamentation, functional design, sleek silhouettes, geometric shapes',
      classic: 'Traditional classic furniture with ornate details, carved wood, rich fabrics (velvet, silk, leather), warm wood tones (mahogany, cherry, walnut), elegant curves, decorative elements, timeless sophistication, luxury materials',
      scandinavian: 'Scandinavian Nordic furniture with light wood (oak, ash, birch), simple functional forms, natural materials, white and neutral palette, cozy textiles (wool, linen), organic shapes, hygge aesthetic, minimalist elegance',
      industrial: 'Industrial loft furniture with exposed materials, raw metal (steel, iron), reclaimed wood, concrete surfaces, Edison bulbs, utilitarian design, weathered finishes, factory-inspired pieces, urban edge',
      luxury: 'High-end luxury furniture with premium materials (marble, brass, gold accents), designer pieces, plush upholstery, rich textures, statement pieces, sophisticated color palette, artisan craftsmanship, opulent details',
      minimalist: 'Ultra-minimalist furniture with essential pieces only, pure geometric forms, monochromatic palette, hidden storage, clean flat surfaces, no decoration, Japanese-inspired simplicity, zen aesthetic'
    };

    return furnitureDescriptions[furnitureStyle];
  };

  // Generate style-specific prompts for AI rendering
  const getStylePrompt = (style: typeof aiRenderStyle, timeOfDay: typeof aiTimeOfDay, mood: typeof aiLightingMood, furnitureStyle: typeof aiFurnitureStyle): string => {
    const lightingDescription = getLightingPrompt(timeOfDay, mood);
    const furnitureDescription = getFurniturePrompt(furnitureStyle);

    switch (style) {
      case 'photorealistic':
        return `Transform this 3D architectural rendering into an ULTRA-REALISTIC, PHOTO-QUALITY interior photograph that is INDISTINGUISHABLE from a real photograph.

CRITICAL REQUIREMENTS - PRESERVE EXACT LAYOUT:
- Keep the EXACT same room layout, wall positions, window locations, door placements
- Maintain ALL furniture positions and arrangements EXACTLY as shown
- Preserve the camera angle, perspective, and composition PRECISELY

FURNITURE STYLE REQUIREMENT:
Transform all furniture and decor to match this aesthetic: ${furnitureDescription}
Apply this style consistently to ALL furniture pieces, decor items, and accessories while maintaining their exact positions and proportions.

MATERIALS & TEXTURES (Maximum Realism):
- Wood surfaces: Show REAL wood grain patterns, subtle color variations, natural knots, slight wear marks, authentic surface reflections
- Fabric materials: Display actual fabric weaves, textile texture depth, natural wrinkles and folds, realistic light absorption and scattering
- Glass/Windows: Crystal-clear transparency with authentic reflections, subtle dirt/fingerprints, accurate refraction, environmental reflections
- Walls/Paint: Slight texture variation, subtle imperfections, natural light bounce, realistic matte finish
- Floors: Authentic material appearance (wood planks with gaps, tile grout lines, carpet fibers), natural wear patterns, realistic reflections
- Metal surfaces: True metallic reflections, brushed/polished finishes, environmental map reflections

LIGHTING (Professional Architectural Photography):
SPECIFIC LIGHTING SETUP: ${lightingDescription}
- Global illumination: Light bouncing realistically off all surfaces, color bleeding from colored surfaces
- Ambient occlusion in corners and crevices for depth
- Realistic HDR lighting with natural exposure, highlights that don't blow out, shadows that retain detail
- Dust particles visible in light beams for atmospheric depth
- Soft fill light and ambient bounce light for natural illumination

CAMERA & OPTICS (Professional DSLR):
- Shot with professional full-frame camera (Canon EOS 5D, Sony A7R)
- Wide-angle architectural lens (16-35mm) with minimal distortion correction
- Natural depth of field: Slight background softness, foreground sharp, realistic focus fall-off
- Realistic lens characteristics: subtle vignetting, natural chromatic behavior, micro-contrast
- Professional architectural photography composition and framing

ATMOSPHERE & ENVIRONMENT:
- Subtle atmospheric haze/air perspective for depth
- Dust particles floating in sunlight beams
- Natural color grading: Warm, inviting tones, accurate white balance
- Realistic dynamic range: Natural contrast, film-like color response
- Environmental details: Slight imperfections, lived-in feeling, realistic cleanliness level

FINAL OUTPUT QUALITY:
- 8K resolution quality, razor-sharp details where in focus
- Professional color grading like Architectural Digest or interior design magazines
- Absolutely NO cartoon/3D/render appearance - must look like REAL PHOTOGRAPH
- Every material, texture, and lighting must be 100% physically accurate and believable
- The result should fool a professional photographer into thinking it's a real photo`;

      case 'product':
        return `Transform this 3D rendering into ULTRA HIGH-END product photography interior. PRESERVE exact layout and furniture positions.

STUDIO LIGHTING SETUP:
- Professional 3-point lighting: Key light (main), fill light (shadows), rim light (separation)
- Large softbox diffusers creating perfectly soft, even illumination
- Zero harsh shadows, completely controlled lighting environment
- Color-accurate daylight balanced lights (5500K)
- Perfect exposure across entire scene, no hot spots or dark areas

MATERIALS (Commercial Photography Quality):
- Ultra-sharp focus throughout entire scene (f/8-f/11 depth of field)
- Polished wood with mirror-like reflections
- Pristine fabrics without wrinkles, perfect draping
- Crystal-clear glass with no smudges
- Everything looking brand new, showroom perfect
- Maximum material clarity and definition

CAMERA SETTINGS:
- Professional medium format camera (Hasselblad, Phase One)
- Tilt-shift lens for perfect perspective control
- f/8-f/11 aperture for extended depth of field
- ISO 100 for zero noise, maximum clarity
- Perfect white balance, accurate color reproduction

OUTPUT QUALITY:
- E-commerce/catalog photography standard
- Absolutely perfect exposure and color accuracy
- Maximum sharpness and detail, no soft areas
- Professional retouching quality: flawless, pristine, showroom condition
- Suitable for luxury furniture catalogs or high-end interior design portfolios`;

      case 'minimalist':
        return `Transform this 3D rendering into a serene, minimalist Scandinavian-style interior photograph. PRESERVE exact layout and furniture positions.

MINIMALIST AESTHETIC:
- Clean, uncluttered composition with emphasis on negative space
- Predominantly white and neutral color palette (white, soft gray, warm beige, light wood tones)
- Natural materials: Light oak/ash wood, linen textiles, matte white paint, concrete
- Simple, functional furniture with clean lines and organic shapes

LIGHTING (Soft Nordic Light):
- Soft, diffused natural daylight from large windows
- Gentle, even illumination without harsh contrasts
- Subtle shadows with very soft edges
- Cool-to-neutral color temperature (5500-6500K) like overcast Scandinavian sky
- Gentle light gradient creating calm, peaceful atmosphere

MATERIALS & TEXTURES:
- Light wood with natural grain (not glossy, subtle matte finish)
- Soft linen and cotton textiles with natural texture
- Matte white walls with slight texture variation
- Natural stone or light concrete for accent surfaces
- Everything with subtle, tactile quality - no high gloss

ATMOSPHERE:
- Calm, peaceful, meditative feeling
- Hygge ambiance: warm, cozy, but minimal
- Natural, organic, breathable space
- Clean air feeling, sense of simplicity and order
- Emphasis on quality over quantity, each element purposeful

PHOTOGRAPHY STYLE:
- Natural, unprocessed look with gentle color grading
- Slight desaturation for calm mood
- Soft contrast, no blown highlights or blocked shadows
- Architectural photography approach: straight lines, balanced composition
- Film-like quality with natural grain and organic feel`;

      case 'sticker':
        return `Transform this 3D rendering into a clean, modern architectural illustration with BOLD ARTISTIC STYLE. PRESERVE exact layout and furniture positions.

ILLUSTRATION STYLE:
- Bold, confident outlines defining all major elements (2-3px black/dark lines)
- Simplified geometric forms with clean edges
- Modern flat design aesthetic with subtle depth
- Cel-shading technique: 2-3 tone values per color (highlight, midtone, shadow)

COLOR PALETTE:
- Vibrant but harmonious colors: saturated but not garish
- Warm wood tones (amber, honey, caramel)
- Fresh accent colors (teal, coral, sage green, mustard yellow)
- Clean whites and soft neutrals for balance
- Consistent color temperature throughout

RENDERING TECHNIQUE:
- Soft, diffused shadows (no harsh black shadows)
- Simple lighting from above and front (like editorial illustration)
- Minimal texture: solid colors with occasional subtle patterns
- Slight gradient shading on curved surfaces for dimension
- No photorealistic textures - simplified, stylized representation

ARTISTIC APPROACH:
- Professional architectural visualization illustration style
- Similar to: Architectural Digest illustrations, Dwell magazine graphics, modern editorial illustration
- Clean, contemporary, designer-friendly aesthetic
- Suitable for presentations, magazines, design portfolios
- Balance between abstraction and recognizability - clearly an illustration but beautifully designed`;
    }
  };

  // Open AI render panel and capture input image
  const openAIRenderPanel = async () => {
    if (!babylon3DCanvasRef.current || viewMode !== '3D') {
      alert('3D 뷰로 전환해주세요.');
      return;
    }

    try {
      console.log('[EditorPage] Capturing current screen view...');

      // Capture what user actually sees on screen
      const dataUrl = await babylon3DCanvasRef.current.takeScreenshot();

      if (!dataUrl) {
        throw new Error('Screenshot capture returned null');
      }

      console.log('[EditorPage] Screenshot captured successfully');

      // Convert data URL to blob URL for display
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      setAiInputImage(blobUrl);
      setAiOutputImage(null);
      setAiRenderPanelOpen(true);
    } catch (error) {
      console.error('[EditorPage] Failed to capture input image:', error);
      alert('이미지 캡처 실패');
    }
  };

  // Generate AI render from input image
  const generateAIImage = async () => {
    if (!aiInputImage || !babylon3DCanvasRef.current) return;

    setAiGenerating(true);

    try {
      console.log(`[EditorPage] Starting AI ${aiRenderStyle} rendering...`);

      // Convert input image blob URL to base64
      const response = await fetch(aiInputImage);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });

      console.log('[EditorPage] Calling Gemini API...');

      // Call Gemini API for image generation
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key not found in environment');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

      const prompt = getStylePrompt(aiRenderStyle, aiTimeOfDay, aiLightingMood, aiFurnitureStyle);

      console.log('[EditorPage] Prompt:', prompt);
      console.log('[EditorPage] Time of day:', aiTimeOfDay);
      console.log('[EditorPage] Lighting mood:', aiLightingMood);
      console.log('[EditorPage] Furniture style:', aiFurnitureStyle);
      console.log('[EditorPage] Aspect ratio:', aiAspectRatio);
      console.log('[EditorPage] Base64 length:', base64.length);

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: base64,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      const aiResponse = await result.response;
      console.log('[EditorPage] Gemini API response received');

      // Extract image from response parts
      let imageFound = false;
      for (const part of aiResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
          const imageBlob = new Blob([buffer], { type: 'image/png' });
          const imageBlobUrl = URL.createObjectURL(imageBlob);

          // Set output image
          setAiOutputImage(imageBlobUrl);
          console.log('[EditorPage] AI rendered image ready');
          imageFound = true;
          break;
        }
      }

      if (!imageFound) {
        throw new Error('No image data in API response');
      }

    } catch (error) {
      console.error('[EditorPage] AI rendering failed:', error);
      console.error('[EditorPage] Error details:', JSON.stringify(error, null, 2));

      // Handle specific error types
      const errorMessage = (error as Error).message || String(error);

      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Quota')) {
        alert('AI 렌더링 실패: API 무료 할당량 초과\n\n' +
          '• Google Gemini API 무료 요청 한도에 도달했습니다.\n' +
          '• 잠시 후 다시 시도하거나 내일 다시 시도해주세요.\n' +
          '• 또는 Google Cloud Console에서 유료 플랜으로 업그레이드하세요.\n\n' +
          '자세한 정보: https://ai.google.dev/gemini-api/docs/rate-limits');
      } else if (errorMessage.includes('API key')) {
        alert('AI 렌더링 실패: API 키 오류\n\nGemini API 키를 확인해주세요.');
      } else {
        alert('AI 렌더링 실패:\n\n' + errorMessage + '\n\n상세 정보는 콘솔을 확인하세요.');
      }
    } finally {
      setAiGenerating(false);
    }
  };

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedThemeMode = localStorage.getItem('themeMode') as 'light' | 'dark' | null;
    const savedThemeColor = localStorage.getItem('themeColor');

    if (savedThemeMode) {
      setThemeMode(savedThemeMode);
    }
    if (savedThemeColor) {
      setThemeColor(savedThemeColor);
    }
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    document.documentElement.style.setProperty('--theme-color', themeColor);

    // Save to localStorage
    localStorage.setItem('themeMode', themeMode);
    localStorage.setItem('themeColor', themeColor);
  }, [themeMode, themeColor]);

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

  // Close AI style menu when clicking outside
  useEffect(() => {
    if (!aiRenderPanelOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside the AI render panel or the AI render button
      const aiRenderPanel = target.closest('[data-ai-render-panel]');
      const aiRenderButton = target.closest('[data-ai-render-button]');

      // Only close if click is outside both the panel and the button
      if (!aiRenderPanel && !aiRenderButton) {
        setAiRenderPanelOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [aiRenderPanelOpen]);

  // Close theme settings panel when clicking outside
  useEffect(() => {
    if (!themeSettingsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.themeSettingsPanel}`)) {
        setThemeSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeSettingsOpen]);

  // Close render style panel when clicking outside
  useEffect(() => {
    if (!renderStyleOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.renderStylePanel}`)) {
        setRenderStyleOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [renderStyleOpen]);

  // Load test room data (2800mm x 2800mm room with 100mm walls)
  // Commented out - currently unused but may be needed for testing
  /*
  const handleLoadTestRoom = () => {
    const testData = createTestRoom();
    console.log('[EditorPage] Loading test room:', testData);
    setFloorplanData(testData);
    setViewMode('3D'); // Switch to 3D view to see the result
  };
  */

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
          <div className={styles.logoWrapper}>
            <img src="/images/archiple_logo.png" alt="Archiple Studio" className={styles.headerLogo} />
          </div>
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
                  <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
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
                            background: 'var(--bg-tertiary)',
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
                                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '4px' }}>
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
                          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px' }}>
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
                                border: '1px solid var(--border-color)',
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
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              />
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
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
            <div style={{ position: 'relative' }}>
              <button
                className={`${styles.topBtn} ${renderPanelOpen ? styles.active : ''}`}
                title="Render Settings"
                onClick={() => setRenderPanelOpen(!renderPanelOpen)}
                disabled={!photoRealisticMode}
                style={{ opacity: photoRealisticMode ? 1 : 0.4 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
                </svg>
              </button>

              {renderPanelOpen && photoRealisticMode && (
                <div className={styles.sunDropdown}>
                  <div className={styles.dropdownHeader}>
                    <span>Render Settings</span>
                    <button onClick={() => setRenderPanelOpen(false)} className={styles.closeBtn}>×</button>
                  </div>
                  <div className={styles.dropdownBody}>
                    {/* Preset Buttons */}
                    <div className={styles.controlGroup}>
                      <label>프리셋</label>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={() => setRenderSettings({
                            ssaoRadius: 1.5,
                            ssaoStrength: 2.0,
                            ssrStrength: 0.8,
                            bloomThreshold: 0.6,
                            bloomWeight: 0.5,
                            dofFocusDistance: 5000,
                            dofFStop: 2.0,
                            chromaticAberration: 5,
                            grainIntensity: 8,
                            vignetteWeight: 2.0,
                            sharpenAmount: 0.5,
                          })}
                          style={{
                            flex: 1,
                            padding: '8px',
                            backgroundColor: '#3a3a3a',
                            color: '#fff',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          기본
                        </button>
                        <button
                          onClick={() => setRenderSettings({
                            ssaoRadius: 0,
                            ssaoStrength: 0,
                            ssrStrength: 0,
                            bloomThreshold: 1,
                            bloomWeight: 0,
                            dofFocusDistance: 5000,
                            dofFStop: 22,
                            chromaticAberration: 0,
                            grainIntensity: 0,
                            vignetteWeight: 0,
                            sharpenAmount: 0,
                          })}
                          style={{
                            flex: 1,
                            padding: '8px',
                            backgroundColor: '#3a3a3a',
                            color: '#fff',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          꺼짐
                        </button>
                        <button
                          onClick={() => setRenderSettings({
                            ssaoRadius: 2.0,
                            ssaoStrength: 2.0,
                            ssrStrength: 1.0,
                            bloomThreshold: 0.3,
                            bloomWeight: 1.0,
                            dofFocusDistance: 3000,
                            dofFStop: 1.4,
                            chromaticAberration: 10,
                            grainIntensity: 20,
                            vignetteWeight: 3.0,
                            sharpenAmount: 1.0,
                          })}
                          style={{
                            flex: 1,
                            padding: '8px',
                            backgroundColor: '#3a3a3a',
                            color: '#fff',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          극대
                        </button>
                        <button
                          onClick={() => setRenderSettings({
                            ssaoRadius: 3.0, // Beyond slider max (2.0)
                            ssaoStrength: 3.0, // Beyond slider max (2.0)
                            ssrStrength: 1.0,
                            bloomThreshold: 0.1, // Very low = maximum bloom
                            bloomWeight: 2.0, // Beyond slider max (1.0)
                            dofFocusDistance: 2000, // Very close focus
                            dofFStop: 1.0, // Minimum f-stop = maximum blur
                            chromaticAberration: 30, // Beyond slider max (10)
                            grainIntensity: 50, // Beyond slider max (20)
                            vignetteWeight: 5.0, // Beyond slider max (3.0)
                            sharpenAmount: 2.0, // Beyond slider max (1.0)
                          })}
                          style={{
                            flex: 1,
                            padding: '8px',
                            backgroundColor: '#8b0000', // Dark red to indicate "extreme"
                            color: '#fff',
                            border: '1px solid #ff0000',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}
                        >
                          슈퍼극대
                        </button>
                      </div>
                    </div>

                    {/* SSAO */}
                    <div className={styles.controlGroup}>
                      <label>SSAO Radius</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={renderSettings.ssaoRadius}
                          onChange={(e) => setRenderSettings({ ...renderSettings, ssaoRadius: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.ssaoRadius.toFixed(1)}</span>
                      </div>
                    </div>

                    <div className={styles.controlGroup}>
                      <label>SSAO Strength</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.1"
                          value={renderSettings.ssaoStrength}
                          onChange={(e) => setRenderSettings({ ...renderSettings, ssaoStrength: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.ssaoStrength.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* SSR */}
                    <div className={styles.controlGroup}>
                      <label>SSR Strength</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={renderSettings.ssrStrength}
                          onChange={(e) => setRenderSettings({ ...renderSettings, ssrStrength: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.ssrStrength.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Bloom */}
                    <div className={styles.controlGroup}>
                      <label>Bloom Threshold</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={renderSettings.bloomThreshold}
                          onChange={(e) => setRenderSettings({ ...renderSettings, bloomThreshold: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.bloomThreshold.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className={styles.controlGroup}>
                      <label>Bloom Weight</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={renderSettings.bloomWeight}
                          onChange={(e) => setRenderSettings({ ...renderSettings, bloomWeight: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.bloomWeight.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* DOF */}
                    <div className={styles.controlGroup}>
                      <label>DOF Focus (mm)</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="1000"
                          max="10000"
                          step="100"
                          value={renderSettings.dofFocusDistance}
                          onChange={(e) => setRenderSettings({ ...renderSettings, dofFocusDistance: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.dofFocusDistance}</span>
                      </div>
                    </div>

                    <div className={styles.controlGroup}>
                      <label>DOF F-Stop</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="1"
                          max="22"
                          step="0.1"
                          value={renderSettings.dofFStop}
                          onChange={(e) => setRenderSettings({ ...renderSettings, dofFStop: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>f/{renderSettings.dofFStop.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Effects */}
                    <div className={styles.controlGroup}>
                      <label>Chromatic Aberration</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={renderSettings.chromaticAberration}
                          onChange={(e) => setRenderSettings({ ...renderSettings, chromaticAberration: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.chromaticAberration.toFixed(1)}</span>
                      </div>
                    </div>

                    <div className={styles.controlGroup}>
                      <label>Film Grain</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="20"
                          step="0.5"
                          value={renderSettings.grainIntensity}
                          onChange={(e) => setRenderSettings({ ...renderSettings, grainIntensity: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.grainIntensity.toFixed(1)}</span>
                      </div>
                    </div>

                    <div className={styles.controlGroup}>
                      <label>Vignette</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="0.1"
                          value={renderSettings.vignetteWeight}
                          onChange={(e) => setRenderSettings({ ...renderSettings, vignetteWeight: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.vignetteWeight.toFixed(1)}</span>
                      </div>
                    </div>

                    <div className={styles.controlGroup}>
                      <label>Sharpen</label>
                      <div className={styles.controlInput}>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={renderSettings.sharpenAmount}
                          onChange={(e) => setRenderSettings({ ...renderSettings, sharpenAmount: parseFloat(e.target.value) })}
                          className={styles.rangeSlider}
                        />
                        <span className={styles.valueDisplay}>{renderSettings.sharpenAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button className={styles.topBtn} title="Material">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
              </svg>
            </button>
            <button
              className={`${styles.topBtn} ${showCharacter ? styles.active : ''}`}
              title="Character"
              onClick={() => setShowCharacter(!showCharacter)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className={`${styles.topBtn} ${sunPanelOpen ? styles.active : ''}`}
                title="Sun"
                onClick={() => setSunPanelOpen(!sunPanelOpen)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" />
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
                          onChange={(e) => setSunSettings({ ...sunSettings, intensity: parseFloat(e.target.value) })}
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
                          onChange={(e) => setSunSettings({ ...sunSettings, azimuth: parseFloat(e.target.value) })}
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
                          onChange={(e) => setSunSettings({ ...sunSettings, altitude: parseFloat(e.target.value) })}
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
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
              </svg>
            </button>
            <button className={styles.topBtn} title="Dimensions">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
            </button>
            <button className={styles.topBtn} title="Render">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
            </button>
            <button className={styles.topBtn} title="Draw">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
            </button>
            <button
              className={`${styles.topBtn} ${photoRealisticMode ? styles.active : ''}`}
              title="Photo-Realistic Rendering"
              onClick={() => setPhotoRealisticMode(!photoRealisticMode)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
              </svg>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <select
                value={screenshotResolution}
                onChange={(e) => setScreenshotResolution(e.target.value as '1080p' | '4k' | '8k')}
                style={{
                  padding: '6px 8px',
                  backgroundColor: '#2a2a2a',
                  color: '#fff',
                  border: '1px solid #555',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  height: '32px',
                }}
                title="Screenshot Resolution"
              >
                <option value="1080p">1080p</option>
                <option value="4k">4K</option>
                <option value="8k">8K</option>
              </select>
              <button
                className={styles.topBtn}
                title="Capture Screenshot"
                onClick={handleCaptureScreenshot}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z" />
                </svg>
              </button>
              {/* AI Render Button - Premium Design */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  data-ai-render-button
                  onClick={openAIRenderPanel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 20px',
                    background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)`,
                    border: 'none',
                    borderRadius: '8px',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: `0 4px 15px ${themeColor}40`,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = `0 6px 20px ${themeColor}60`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = `0 4px 15px ${themeColor}40`;
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                  <span>AI Render</span>
                  <div style={{
                    fontSize: '10px',
                    opacity: 0.9,
                    fontWeight: '600',
                    background: 'rgba(255,255,255,0.2)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {aiRenderStyle.substring(0, 6).toUpperCase()}
                  </div>
                </button>

                {/* Style Selector Button */}
                <button
                  data-ai-render-button
                  onClick={() => setAiRenderPanelOpen(!aiRenderPanelOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    background: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                    border: `1px solid ${themeColor}40`,
                    borderRadius: '8px',
                    color: themeColor,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `${themeColor}20`;
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>

                {/* AI Render Settings Panel */}
                {aiRenderPanelOpen && (
                  <div
                    data-ai-render-panel
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 10px)',
                      right: 0,
                      background: themeMode === 'dark' ? '#1e1e1e' : '#ffffff',
                      border: `2px solid ${themeColor}40`,
                      borderRadius: '12px',
                      padding: '20px',
                      width: '420px',
                      maxHeight: '80vh',
                      overflowY: 'auto',
                      zIndex: 10000,
                      boxShadow: `0 10px 40px ${themeColor}40`,
                      animation: 'slideDown 0.2s ease-out'
                    }}
                  >
                    <style>{`
                      @keyframes slideDown {
                        from {
                          opacity: 0;
                          transform: translateY(-10px);
                        }
                        to {
                          opacity: 1;
                          transform: translateY(0);
                        }
                      }
                    `}</style>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                      <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: themeColor }}>AI Rendering</h3>
                      <button
                        onClick={() => setAiRenderPanelOpen(false)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: 'none',
                          background: themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                          color: themeMode === 'dark' ? '#fff' : '#000',
                          cursor: 'pointer',
                          fontSize: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >×</button>
                    </div>

                    {/* Input Image - Show First */}
                    {aiInputImage && (
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                          Input Image (3D View)
                        </label>
                        <div style={{
                          width: '100%',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: `2px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
                          background: themeMode === 'dark' ? '#252525' : '#f8f8f8'
                        }}>
                          <img
                            src={aiInputImage}
                            alt="Input 3D View"
                            style={{
                              width: '100%',
                              height: 'auto',
                              display: 'block'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Style Selection */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                        Rendering Style
                      </label>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px'
                      }}>
                        {(['photorealistic', 'product', 'minimalist', 'sticker'] as const).map((style) => (
                          <button
                            key={style}
                            onClick={() => setAiRenderStyle(style)}
                            style={{
                              padding: '12px 8px',
                              borderRadius: '8px',
                              border: aiRenderStyle === style ? `2px solid ${themeColor}` : `2px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
                              background: aiRenderStyle === style ? `${themeColor}15` : (themeMode === 'dark' ? '#252525' : '#f8f8f8'),
                              color: themeMode === 'dark' ? '#fff' : '#000',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: aiRenderStyle === style ? '600' : '500',
                              transition: 'all 0.2s',
                              textAlign: 'center',
                              textTransform: 'capitalize'
                            }}
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Furniture Style */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                        Furniture Style
                      </label>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px'
                      }}>
                        {([
                          { value: 'modern', label: 'Modern' },
                          { value: 'classic', label: 'Classic' },
                          { value: 'scandinavian', label: 'Scandinavian' },
                          { value: 'industrial', label: 'Industrial' },
                          { value: 'luxury', label: 'Luxury' },
                          { value: 'minimalist', label: 'Minimalist' }
                        ] as const).map((furniture) => (
                          <button
                            key={furniture.value}
                            onClick={() => setAiFurnitureStyle(furniture.value)}
                            style={{
                              padding: '10px 6px',
                              borderRadius: '6px',
                              border: aiFurnitureStyle === furniture.value ? `2px solid ${themeColor}` : `2px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
                              background: aiFurnitureStyle === furniture.value ? `${themeColor}15` : 'transparent',
                              color: aiFurnitureStyle === furniture.value ? themeColor : (themeMode === 'dark' ? '#fff' : '#000'),
                              cursor: 'pointer',
                              fontWeight: aiFurnitureStyle === furniture.value ? '600' : '500',
                              fontSize: '11px',
                              transition: 'all 0.2s',
                              textAlign: 'center'
                            }}
                          >
                            {furniture.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time of Day */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                        Time of Day
                      </label>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px'
                      }}>
                        {([
                          { value: 'day', label: 'Day' },
                          { value: 'golden_hour', label: 'Golden Hour' },
                          { value: 'blue_hour', label: 'Blue Hour' },
                          { value: 'night', label: 'Night' },
                          { value: 'overcast', label: 'Overcast' }
                        ] as const).map((time) => (
                          <button
                            key={time.value}
                            onClick={() => setAiTimeOfDay(time.value)}
                            style={{
                              padding: '10px 6px',
                              borderRadius: '6px',
                              border: aiTimeOfDay === time.value ? `2px solid ${themeColor}` : `2px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
                              background: aiTimeOfDay === time.value ? `${themeColor}15` : 'transparent',
                              color: aiTimeOfDay === time.value ? themeColor : (themeMode === 'dark' ? '#fff' : '#000'),
                              cursor: 'pointer',
                              fontWeight: aiTimeOfDay === time.value ? '600' : '500',
                              fontSize: '11px',
                              transition: 'all 0.2s',
                              textAlign: 'center'
                            }}
                          >
                            {time.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Lighting Mood */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                        Lighting Mood
                      </label>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '8px'
                      }}>
                        {([
                          { value: 'bright', label: 'Bright' },
                          { value: 'soft', label: 'Soft' },
                          { value: 'moody', label: 'Moody' },
                          { value: 'dramatic', label: 'Dramatic' }
                        ] as const).map((mood) => (
                          <button
                            key={mood.value}
                            onClick={() => setAiLightingMood(mood.value)}
                            style={{
                              padding: '10px 6px',
                              borderRadius: '6px',
                              border: aiLightingMood === mood.value ? `2px solid ${themeColor}` : `2px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
                              background: aiLightingMood === mood.value ? `${themeColor}15` : 'transparent',
                              color: aiLightingMood === mood.value ? themeColor : (themeMode === 'dark' ? '#fff' : '#000'),
                              cursor: 'pointer',
                              fontWeight: aiLightingMood === mood.value ? '600' : '500',
                              fontSize: '11px',
                              transition: 'all 0.2s',
                              textAlign: 'center'
                            }}
                          >
                            {mood.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aspect Ratio Selection */}
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                        Aspect Ratio
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        {(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const).map((ratio) => (
                          <button
                            key={ratio}
                            onClick={() => setAiAspectRatio(ratio)}
                            style={{
                              padding: '8px 4px',
                              borderRadius: '6px',
                              border: aiAspectRatio === ratio ? `2px solid ${themeColor}` : `2px solid ${themeMode === 'dark' ? '#333' : '#ddd'}`,
                              background: aiAspectRatio === ratio ? `${themeColor}15` : 'transparent',
                              color: aiAspectRatio === ratio ? themeColor : (themeMode === 'dark' ? '#fff' : '#000'),
                              cursor: 'pointer',
                              fontWeight: aiAspectRatio === ratio ? '600' : '500',
                              fontSize: '11px',
                              transition: 'all 0.2s'
                            }}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Generate Button */}
                    <button
                      onClick={generateAIImage}
                      disabled={aiGenerating || !aiInputImage}
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: aiGenerating || !aiInputImage
                          ? (themeMode === 'dark' ? '#444' : '#ccc')
                          : `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%)`,
                        color: 'white',
                        fontSize: '15px',
                        fontWeight: '600',
                        cursor: aiGenerating || !aiInputImage ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: aiGenerating || !aiInputImage ? 'none' : `0 4px 15px ${themeColor}40`,
                        opacity: aiGenerating || !aiInputImage ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!aiGenerating && aiInputImage) {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = `0 6px 20px ${themeColor}60`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!aiGenerating && aiInputImage) {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = `0 4px 15px ${themeColor}40`;
                        }
                      }}
                    >
                      {aiGenerating ? 'Generating...' : 'Generate AI Render'}
                    </button>

                    {/* Output Image - Show After Generation */}
                    {aiOutputImage && (
                      <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: themeMode === 'dark' ? '#fff' : '#000' }}>
                          AI Rendered Result
                        </label>
                        <div style={{
                          width: '100%',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          border: `2px solid ${themeColor}`,
                          background: themeMode === 'dark' ? '#252525' : '#f8f8f8'
                        }}>
                          <img
                            src={aiOutputImage}
                            alt="AI Rendered Output"
                            style={{
                              width: '100%',
                              height: 'auto',
                              display: 'block'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Download Button (only when output exists) */}
                    {aiOutputImage && !aiGenerating && (
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = aiOutputImage;
                          link.download = `archiple-ai-render-${aiRenderStyle}-${Date.now()}.png`;
                          link.click();
                        }}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: '10px',
                          border: `2px solid ${themeColor}`,
                          background: 'transparent',
                          color: themeColor,
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `${themeColor}15`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        Download Rendered Image
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {false && (
              <div className={styles.sunDropdown} style={{ width: '320px', maxHeight: '600px', overflowY: 'auto' }}>
                <div className={styles.dropdownHeader}>
                  <span>Rendering Settings</span>
                  <button onClick={() => setRenderPanelOpen(false)} className={styles.closeBtn}>×</button>
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, ssaoRadius: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, ssaoStrength: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, ssrStrength: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, bloomThreshold: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, bloomWeight: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, dofFocusDistance: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, dofFStop: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, chromaticAberration: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, grainIntensity: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, vignetteWeight: parseFloat(e.target.value) })}
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
                        onChange={(e) => setRenderSettings({ ...renderSettings, sharpenAmount: parseFloat(e.target.value) })}
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
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                <circle cx="12" cy="12" r="5" />
              </svg>
            </button>
            <button className={styles.topBtn} title="Layout">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z" />
              </svg>
            </button>
            <button
              className={`${styles.topBtn} ${showGrid ? styles.topBtnActive : ''}`}
              title="Grid"
              onClick={() => setShowGrid(!showGrid)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 20H4v-4h4v4zm0-6H4v-4h4v4zm0-6H4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4zm6 12h-4v-4h4v4zm0-6h-4v-4h4v4zm0-6h-4V4h4v4z" />
              </svg>
            </button>
            <button className={styles.topBtn} title="View">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              </svg>
            </button>

            <div className={styles.playButtons}>
              <button className={styles.navBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                </svg>
              </button>
              <button className={styles.navBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
              <button
                className={`${styles.playBtn} ${playMode ? styles.playBtnActive : ''}`}
                onClick={() => {
                  if (!playMode) {
                    setViewMode('3D'); // Switch to 3D view
                    setDisplayStyle('material'); // Ensure textures are visible
                    setShowGrid(false); // Hide grid for immersive experience
                    // Photo-realistic mode disabled - clean PBR rendering is better quality
                  } else {
                    setDisplayStyle('material'); // Keep material style
                    setShowGrid(true); // Restore grid
                  }
                  setPlayMode(!playMode);
                }}
                title={playMode ? 'Exit Play Mode' : 'Enter Play Mode (WASD)'}
              >
                {playMode ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                    Stop
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Play
                  </>
                )}
              </button>
              {playMode && (
                <button
                  className={styles.topBtn}
                  onClick={() => setModalOpen(true)}
                  title="Camera Settings"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              )}

              {/* New AI Render Button (Nanobanana) */}
              <button
                className={styles.topBtn}
                onClick={async () => {
                  // Capture current view using Babylon's built-in tool
                  if (babylon3DCanvasRef.current) {
                    try {
                      // Capture screenshot via ref
                      const screenshot = await babylon3DCanvasRef.current.takeScreenshot();
                      if (screenshot) {
                        setCapturedImage(screenshot);
                        console.log('[EditorPage] Captured 3D view for AI render');
                      } else {
                        console.warn('[EditorPage] Screenshot returned null');
                      }
                    } catch (e) {
                      console.error('[EditorPage] Failed to capture screenshot:', e);
                    }
                  }
                  setAiRenderModalOpen(true);
                }}
                title="AI Render (Nanobanana)"
                style={{ marginLeft: '8px', color: themeColor }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.headerBtn}>Save</button>
          <button className={styles.headerBtn} onClick={() => setExportModalOpen(true)}>Export</button>
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
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                  </svg>
                </div>
                <span>Create<br />Room</span>
              </button>

              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6M1 12h6m6 0h6" />
                  </svg>
                </div>
                <span>Customize</span>
              </button>

              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" />
                    <path d="M3 9h18M9 9v12" />
                  </svg>
                </div>
                <span>Model<br />Library</span>
              </button>

              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 12l9-9 9 9M5 10v11h4v-6h6v6h4V10" />
                  </svg>
                </div>
                <span>Mode</span>
              </button>

              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
                  </svg>
                </div>
                <span>My</span>
              </button>
            </div>

            <div className={styles.sidebarBottom}>
              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="1" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn} onClick={() => setRenderStyleOpen(!renderStyleOpen)}>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44C3.21 17.21 3 16.88 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9zM12 4.15L5 8.09v7.82l7 3.94 7-3.94V8.09l-7-3.94z" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn} onClick={() => setThemeSettingsOpen(!themeSettingsOpen)}>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn}>
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
              </button>
              <button className={styles.sidebarBtn} onClick={() => navigate('/')} title="나가기">
                <div className={styles.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
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
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                  </svg>
                </div>
                <span>Explore</span>
              </button>
              <button className={styles.optionCard} onClick={() => fileInputRef.current?.click()}>
                <div className={styles.optionIcon}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                  </svg>
                </div>
                <span>Import</span>
              </button>
              <button className={styles.optionCard} onClick={() => glbFileInputRef.current?.click()}>
                <div className={styles.optionIcon}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.9 8.89l-1.05-4.37c-.22-.9-1-1.52-1.91-1.52H5.05c-.9 0-1.69.63-1.9 1.52L2.1 8.89c-.24 1.02-.02 2.06.62 2.88.08.11.19.19.28.29V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-6.94c.09-.09.2-.18.28-.28.64-.82.87-1.87.62-2.89zM18.91 4.99l1.05 4.37c.1.42.01.84-.25 1.17-.14.18-.44.47-1.05.47-.83 0-1.52-.64-1.63-1.5l-.5-4.5h2.38zM13 4.99h1.96l.54 4.52c.05.46.23.88.5 1.23.1.15.22.28.36.4-.07.08-.14.16-.22.25v3.61h-3.14V4.99zM5.05 4.99h2.38l-.5 4.5c-.11.86-.8 1.5-1.63 1.5-.61 0-.91-.29-1.05-.47-.25-.33-.35-.75-.25-1.17l1.05-4.36zM5 19v-6.03c.08-.01.15-.03.23-.06.24-.07.48-.23.7-.4.1.17.23.33.39.47.41.37.95.59 1.55.59.64 0 1.24-.25 1.66-.66.23-.23.39-.5.48-.78.09.28.25.54.48.78.42.41 1.02.66 1.66.66.23 0 .45-.03.66-.08v4.51H5zm14 0h-3V5.71l.54 4.79c.1.92.48 1.76 1.07 2.42.1.11.2.2.31.29v5.79z" />
                  </svg>
                </div>
                <span>3D Model</span>
              </button>
              <button className={styles.optionCard}>
                <div className={styles.optionIcon}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
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
                    <path d="M 8 28 Q 24 8, 40 28" stroke="currentColor" strokeWidth="2" fill="none" />
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
                <button
                  className={`${styles.toolBtn} ${activeTool === ToolType.WINDOW ? styles.toolBtnActive : ''}`}
                  title="Place Window (1200mm x 1200mm)"
                  onClick={() => setActiveTool(ToolType.WINDOW)}
                >
                  <img src="/icons/slidingdoor.svg" alt="Single Window" width="32" height="32" />
                  <span>Single Window</span>
                </button>
                <button className={styles.toolBtn}>
                  <img src="/icons/dualwindow.svg" alt="Dual Window" width="32" height="32" />
                  <span>Dual Window</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <rect x="8" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
                    <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
                    <rect x="30" y="18" width="10" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Unequal Double Door</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <path d="M 12 24 L 18 18 L 30 18 L 36 24 L 30 30 L 18 30 Z" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Corner Bay Window</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <path d="M 14 24 L 20 20 L 28 20 L 34 24" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Corner Window</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <rect x="12" y="20" width="24" height="8" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Bay Window</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <path d="M 16 24 Q 24 16, 32 24" stroke="currentColor" strokeWidth="2" fill="none" />
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
                    <path d="M 16 12 L 16 36 M 32 12 L 32 36" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  <span>Door Opening</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <rect x="16" y="20" width="16" height="8" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Flue</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <rect x="12" y="20" width="24" height="3" fill="currentColor" />
                  </svg>
                  <span>Beam</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <rect x="16" y="16" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Square</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                  <span>Circle</span>
                </button>
                <button className={styles.toolBtn}>
                  <svg width="32" height="32" viewBox="0 0 48 48">
                    <rect x="14" y="14" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" />
                    <rect x="18" y="18" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" />
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
              renderStyle={renderStyle}
              showGrid={showGrid}
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
              onLightMoved={handleLightMoved}
              displayStyle={displayStyle}
              showGrid={showGrid}
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
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                벽 치수 수정
              </h3>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
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
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '14px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
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
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
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
                    background: 'var(--theme-color)',
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
              <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
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
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    fontSize: '13px',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>mm</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => setEditingRulerLabel(null)}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
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
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              minWidth: '400px',
            }}>
              {/* Ruler Guide Instructions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                  🎯 줄자 가이드를 드래그해서 이미지의 알려진 치수에 맞추세요
                </span>
              </div>

              {/* Distance Input (always visible when ruler is present) */}
              {rulerVisible && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', minWidth: '80px' }}>
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
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontSize: '13px',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>mm</span>
                  <button
                    onClick={handleRulerSubmit}
                    style={{
                      padding: '8px 20px',
                      background: 'var(--theme-color)',
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
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', minWidth: '80px' }}>
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
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', minWidth: '50px' }}>
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
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500', minWidth: '40px' }}>
                    {Math.round(imageOpacity * 100)}%
                  </span>
                </div>
              )}

              {/* Scan Button */}
              <button
                onClick={handleScan}
                style={{
                  padding: '10px 20px',
                  background: 'var(--theme-color)',
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

            {/* 3D Preview */}
            <FloorplanPreview
              floorplanData={floorplanData}
              viewMode={viewMode}
            />

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

        {/* Render Style Panel */}
        {renderStyleOpen && (
          <div className={styles.renderStylePanel}>
            <div className={styles.panelHeader}>
              <h3>Render Style</h3>
              <button onClick={() => setRenderStyleOpen(false)} className={styles.closeBtn}>×</button>
            </div>

            <div className={styles.panelContent}>
              <div className={styles.styleOption}>
                <button
                  className={`${styles.styleBtn} ${renderStyle === 'wireframe' ? styles.active : ''}`}
                  onClick={() => setRenderStyle('wireframe')}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                  <span>Wireframe</span>
                </button>
              </div>

              <div className={styles.styleOption}>
                <button
                  className={`${styles.styleBtn} ${renderStyle === 'hidden-line' ? styles.active : ''}`}
                  onClick={() => setRenderStyle('hidden-line')}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                    <polyline points="7.5 19.79 12 17.19 16.5 19.79" />
                    <line x1="3.27" y1="6.96" x2="12" y2="12.01" />
                    <line x1="12" y1="12.01" x2="20.73" y2="6.96" />
                  </svg>
                  <span>Hidden Line</span>
                </button>
              </div>

              <div className={styles.styleOption}>
                <button
                  className={`${styles.styleBtn} ${renderStyle === 'solid' ? styles.active : ''}`}
                  onClick={() => setRenderStyle('solid')}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44C3.21 17.21 3 16.88 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z" />
                  </svg>
                  <span>Solid</span>
                </button>
              </div>

              <div className={styles.styleOption}>
                <button
                  className={`${styles.styleBtn} ${renderStyle === 'realistic' ? styles.active : ''}`}
                  onClick={() => setRenderStyle('realistic')}
                >
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                    <defs>
                      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style={{ stopColor: 'currentColor', stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: 'currentColor', stopOpacity: 0.3 }} />
                      </linearGradient>
                    </defs>
                    <path fill="url(#grad1)" d="M21 16.5c0 .38-.21.71-.53.88l-7.9 4.44c-.16.12-.36.18-.57.18-.21 0-.41-.06-.57-.18l-7.9-4.44C3.21 17.21 3 16.88 3 16.5v-9c0-.38.21-.71.53-.88l7.9-4.44c.16-.12.36-.18.57-.18.21 0 .41.06.57.18l7.9 4.44c.32.17.53.5.53.88v9z" />
                    <circle cx="8" cy="10" r="1" fill="currentColor" opacity="0.6" />
                    <circle cx="16" cy="10" r="1" fill="currentColor" opacity="0.6" />
                    <circle cx="12" cy="14" r="1" fill="currentColor" opacity="0.6" />
                  </svg>
                  <span>Realistic</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Theme Settings Panel */}
        {themeSettingsOpen && (
          <div className={styles.themeSettingsPanel}>
            <div className={styles.panelHeader}>
              <h3>테마 설정</h3>
              <button onClick={() => setThemeSettingsOpen(false)} className={styles.closeBtn}>×</button>
            </div>

            <div className={styles.panelContent}>
              {/* Theme Mode Selection */}
              <div className={styles.settingsSection}>
                <h4>모드</h4>
                <div className={styles.themeModeGrid}>
                  <button
                    className={`${styles.themeModeBtn} ${themeMode === 'light' ? styles.active : ''}`}
                    onClick={() => setThemeMode('light')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
                    </svg>
                    <span>라이트</span>
                  </button>
                  <button
                    className={`${styles.themeModeBtn} ${themeMode === 'dark' ? styles.active : ''}`}
                    onClick={() => setThemeMode('dark')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
                    </svg>
                    <span>다크</span>
                  </button>
                </div>
              </div>

              {/* Theme Color Selection */}
              <div className={styles.settingsSection}>
                <h4>테마 색상</h4>
                <div className={styles.colorGrid}>
                  {[
                    { name: '그린', color: '#3fae7a' },
                    { name: '블루', color: '#4a90e2' },
                    { name: '퍼플', color: '#9b59b6' },
                    { name: '오렌지', color: '#e67e22' },
                    { name: '레드', color: '#e74c3c' },
                    { name: '핑크', color: '#ec4899' },
                    { name: '틸', color: '#14b8a6' },
                    { name: '인디고', color: '#6366f1' },
                  ].map(({ name, color }) => (
                    <button
                      key={color}
                      className={`${styles.colorBtn} ${themeColor === color ? styles.active : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setThemeColor(color)}
                      title={name}
                    >
                      {themeColor === color && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Picker */}
              <div className={styles.settingsSection}>
                <h4>커스텀 색상</h4>
                <div className={styles.customColorRow}>
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className={styles.colorPicker}
                  />
                  <span className={styles.colorValue}>{themeColor.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Camera Settings Modal */}
      <CameraSettingsModal />

      {/* Export Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        floorplanData={floorplanData}
      />
      {/* New AI Render Modal */}
      <AIRenderModal
        isOpen={aiRenderModalOpen}
        onClose={() => setAiRenderModalOpen(false)}
        themeMode={themeMode}
        themeColor={themeColor}
        initialImage={capturedImage}
      />
    </div>
  );
};

export default EditorPage;
