/**
 * HighQualityRenderingSetup - Coohom-style Photorealistic Rendering
 *
 * Features:
 * - IBL (Image Based Lighting) with HDR environment
 * - SSAO2 for ambient occlusion
 * - DefaultRenderingPipeline with FXAA
 * - Image processing (exposure, contrast)
 * - Soft shadows
 *
 * Performance optimized for real-time interaction.
 */

import {
  Scene,
  Engine,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Color3,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
  CubeTexture,
  ImageProcessingConfiguration,
  HemisphericLight,
} from '@babylonjs/core';

// Import inspector (ensure it's installed: npm install @babylonjs/inspector)
import '@babylonjs/inspector';

export interface HighQualityRenderingOptions {
  // Environment
  environmentTexturePath?: string;
  environmentIntensity?: number;

  // SSAO
  ssaoEnabled?: boolean;
  ssaoRadius?: number;
  ssaoStrength?: number;
  ssaoSamples?: number;

  // Image Processing
  exposure?: number;
  contrast?: number;
  toneMappingEnabled?: boolean;

  // Shadows
  shadowMapSize?: number;
  shadowDarkness?: number;

  // Debug
  showInspector?: boolean;
}

const DEFAULT_OPTIONS: Required<HighQualityRenderingOptions> = {
  environmentTexturePath: '/textures/environment.env',
  environmentIntensity: 1.0,

  ssaoEnabled: true,
  ssaoRadius: 2.0,
  ssaoStrength: 1.5,
  ssaoSamples: 16,

  exposure: 1.0,
  contrast: 1.2,
  toneMappingEnabled: true,

  shadowMapSize: 1024,
  shadowDarkness: 0.4,

  showInspector: false,
};

export interface HighQualityRenderingResult {
  pipeline: DefaultRenderingPipeline;
  ssao: SSAO2RenderingPipeline | null;
  sunLight: DirectionalLight;
  ambientLight: HemisphericLight;
  shadowGenerator: ShadowGenerator;
  showInspector: () => void;
  hideInspector: () => void;
  dispose: () => void;
}

/**
 * Setup high-quality photorealistic rendering for interior design
 */
export function setupHighQualityRendering(
  scene: Scene,
  _engine?: Engine,
  options: HighQualityRenderingOptions = {}
): HighQualityRenderingResult {
  const config = { ...DEFAULT_OPTIONS, ...options };

  console.log('[HQRendering] Setting up photorealistic rendering...');

  // ============================================
  // 1. Ambient Light (fill shadows)
  // ============================================
  const ambientLight = new HemisphericLight(
    'ambientLight',
    new Vector3(0, 1, 0),
    scene
  );
  ambientLight.intensity = 0.4;
  ambientLight.diffuse = new Color3(1, 1, 1);
  ambientLight.groundColor = new Color3(0.5, 0.5, 0.52);
  ambientLight.specular = new Color3(0.1, 0.1, 0.1);

  // ============================================
  // 2. Sun Light with Soft Shadows
  // ============================================
  const sunLight = new DirectionalLight(
    'sunLight',
    new Vector3(-0.5, -1, -0.5).normalize(),
    scene
  );
  sunLight.intensity = 2.0;
  sunLight.diffuse = new Color3(1, 0.98, 0.95);
  sunLight.specular = new Color3(1, 1, 1);

  // Shadow Generator - soft blurred shadows
  const shadowGenerator = new ShadowGenerator(config.shadowMapSize, sunLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 32;
  shadowGenerator.blurScale = 1;
  shadowGenerator.useKernelBlur = true;
  shadowGenerator.bias = 0.001;
  shadowGenerator.normalBias = 0.02;
  shadowGenerator.setDarkness(config.shadowDarkness);

  console.log('[HQRendering] Lighting and shadows configured');

  // ============================================
  // 3. IBL (Image Based Lighting) Environment
  // ============================================
  try {
    const hdrTexture = CubeTexture.CreateFromPrefilteredData(
      config.environmentTexturePath,
      scene
    );
    scene.environmentTexture = hdrTexture;
    scene.environmentIntensity = config.environmentIntensity;
    console.log('[HQRendering] HDR environment loaded:', config.environmentTexturePath);
  } catch (e) {
    console.warn('[HQRendering] Failed to load HDR environment, using fallback');
    // Fallback to Babylon.js default environment
    try {
      const fallbackHdr = CubeTexture.CreateFromPrefilteredData(
        'https://assets.babylonjs.com/environments/environmentSpecular.env',
        scene
      );
      scene.environmentTexture = fallbackHdr;
      scene.environmentIntensity = config.environmentIntensity;
    } catch (e2) {
      console.warn('[HQRendering] Fallback HDR also failed');
    }
  }

  // ============================================
  // 4. DefaultRenderingPipeline
  // ============================================
  const pipeline = new DefaultRenderingPipeline(
    'hqPipeline',
    true, // HDR mode
    scene,
    scene.cameras
  );

  // FXAA Antialiasing (fast)
  pipeline.fxaaEnabled = true;
  pipeline.samples = 2; // Light MSAA

  // Image Processing
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.exposure = config.exposure;
  pipeline.imageProcessing.contrast = config.contrast;

  // Tone Mapping (ACES for realistic HDR handling)
  if (config.toneMappingEnabled) {
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.imageProcessing.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
  }

  // Bloom disabled
  pipeline.bloomEnabled = false;
  pipeline.sharpenEnabled = false;
  pipeline.chromaticAberrationEnabled = false;
  pipeline.grainEnabled = false;
  pipeline.imageProcessing.vignetteEnabled = false;

  console.log('[HQRendering] Rendering pipeline configured');

  // ============================================
  // 5. SSAO2 (Screen Space Ambient Occlusion)
  // ============================================
  let ssao: SSAO2RenderingPipeline | null = null;

  if (config.ssaoEnabled) {
    ssao = new SSAO2RenderingPipeline('ssao', scene, {
      ssaoRatio: 0.5, // Half resolution for performance
      blurRatio: 1,
    });

    ssao.radius = config.ssaoRadius;
    ssao.totalStrength = config.ssaoStrength;
    ssao.base = 0.5;
    ssao.samples = config.ssaoSamples;
    ssao.maxZ = 100;
    ssao.minZAspect = 0.5;
    ssao.expensiveBlur = false; // Faster blur

    // Attach to all cameras
    scene.cameras.forEach((camera) => {
      scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
        'ssao',
        camera
      );
    });

    console.log('[HQRendering] SSAO2 enabled');
  }

  // ============================================
  // 6. Inspector (Debug)
  // ============================================
  const showInspector = () => {
    scene.debugLayer.show({
      embedMode: true,
      overlay: true,
    });
  };

  const hideInspector = () => {
    scene.debugLayer.hide();
  };

  if (config.showInspector) {
    showInspector();
  }

  // ============================================
  // 7. Dispose function
  // ============================================
  const dispose = () => {
    pipeline.dispose();
    ssao?.dispose();
    shadowGenerator.dispose();
    sunLight.dispose();
    ambientLight.dispose();
    console.log('[HQRendering] Disposed');
  };

  console.log('[HQRendering] ✅ Setup complete');

  return {
    pipeline,
    ssao,
    sunLight,
    ambientLight,
    shadowGenerator,
    showInspector,
    hideInspector,
    dispose,
  };
}

/**
 * Quick presets for different quality levels
 */
export const RENDERING_PRESETS = {
  /** Ultra quality - for screenshots/exports */
  ultra: {
    ssaoSamples: 32,
    ssaoRadius: 1.5,
    ssaoStrength: 2.0,
    shadowMapSize: 2048,
  } as HighQualityRenderingOptions,

  /** High quality - balanced */
  high: {
    ssaoSamples: 16,
    ssaoRadius: 2.0,
    ssaoStrength: 1.5,
    shadowMapSize: 1024,
  } as HighQualityRenderingOptions,

  /** Performance - for slower devices */
  performance: {
    ssaoEnabled: false,
    shadowMapSize: 512,
  } as HighQualityRenderingOptions,
};
