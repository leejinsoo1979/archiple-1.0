import { create } from 'zustand';

export interface CameraSettings {
  // Projection
  projectionType: 'perspective' | 'orthographic';

  // Camera angles (radians internally, displayed as degrees)
  alpha: number; // Azimuth angle (horizontal rotation) in radians
  beta: number; // Altitude angle (vertical rotation) in radians

  // Exposure
  autoExposure: boolean;
  exposure: number; // 0-100%

  // Field of View
  horizontalFov: number; // 30-120 degrees

  // Depth of Field
  depthOfField: number; // 0-100%

  // Modal visibility
  isModalOpen: boolean;
}

interface CameraSettingsStore extends CameraSettings {
  setProjectionType: (type: 'perspective' | 'orthographic') => void;
  setAlpha: (value: number) => void;
  setBeta: (value: number) => void;
  setAutoExposure: (enabled: boolean) => void;
  setExposure: (value: number) => void;
  setHorizontalFov: (value: number) => void;
  setDepthOfField: (value: number) => void;
  setModalOpen: (open: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS: CameraSettings = {
  projectionType: 'perspective',
  alpha: -Math.PI / 4, // -45 degrees
  beta: Math.PI / 3.5, // ~51 degrees
  autoExposure: true,
  exposure: 50, // 50% = neutral
  horizontalFov: 56, // 56 degrees horizontal (standard lens)
  depthOfField: 0, // Disabled by default
  isModalOpen: false,
};

export const useCameraSettingsStore = create<CameraSettingsStore>((set) => ({
  ...DEFAULT_SETTINGS,

  setProjectionType: (type) => set({ projectionType: type }),
  setAlpha: (value) => set({ alpha: value }),
  setBeta: (value) => set({ beta: Math.max(0.01, Math.min(Math.PI / 2 - 0.01, value)) }),
  setAutoExposure: (enabled) => set({ autoExposure: enabled }),
  setExposure: (value) => set({ exposure: Math.max(0, Math.min(100, value)) }),
  setHorizontalFov: (value) => set({ horizontalFov: Math.max(30, Math.min(120, value)) }),
  setDepthOfField: (value) => set({ depthOfField: Math.max(0, Math.min(100, value)) }),
  setModalOpen: (open) => set({ isModalOpen: open }),

  resetToDefaults: () => set(DEFAULT_SETTINGS),
}));
