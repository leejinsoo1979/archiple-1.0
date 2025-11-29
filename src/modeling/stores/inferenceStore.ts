/**
 * Inference Store - Zustand state management for inference system
 *
 * Manages inference state for React component binding:
 * - Current active inferences
 * - Lock states (axis, inference, plane)
 * - Screen tip display
 * - HUD state
 */

import { create } from 'zustand';
import { Vector3, Color3 } from '@babylonjs/core';
import type {
  Inference,
  InferenceLockAxis,
  LinearInferenceMode,
  PointInferenceType,
  LinearInferenceType,
  ScreenTip,
  MeasurementsBoxState,
} from '../types';
import { INFERENCE_COLORS } from '../types';

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface InferenceStoreState {
  // Active inferences
  activeInferences: Inference[];
  primaryInference: Inference | null;

  // Lock states
  lockedAxis: InferenceLockAxis;
  lockedInference: Inference | null;
  linearMode: LinearInferenceMode;
  planeLock: 'none' | 'red' | 'green' | 'blue';
  shiftHeld: boolean;

  // Current position
  cursorPosition: Vector3 | null;
  snappedPosition: Vector3 | null;

  // Reference geometry
  startPoint: Vector3 | null;
  referenceEdge: { start: Vector3; end: Vector3 } | null;

  // Display state
  screenTip: ScreenTip;
  measurementsBox: MeasurementsBoxState;

  // Line preview color (changes based on axis)
  lineColor: Color3;

  // Actions
  setActiveInferences: (inferences: Inference[]) => void;
  setPrimaryInference: (inference: Inference | null) => void;
  setLockedAxis: (axis: InferenceLockAxis) => void;
  setLockedInference: (inference: Inference | null) => void;
  setLinearMode: (mode: LinearInferenceMode) => void;
  setPlaneLock: (plane: 'none' | 'red' | 'green' | 'blue') => void;
  setShiftHeld: (held: boolean) => void;
  setCursorPosition: (position: Vector3 | null) => void;
  setSnappedPosition: (position: Vector3 | null) => void;
  setStartPoint: (point: Vector3 | null) => void;
  setReferenceEdge: (edge: { start: Vector3; end: Vector3 } | null) => void;
  setScreenTip: (tip: Partial<ScreenTip>) => void;
  setMeasurementsBox: (state: Partial<MeasurementsBoxState>) => void;
  setLineColor: (color: Color3) => void;
  reset: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialScreenTip: ScreenTip = {
  text: '',
  position: { x: 0, y: 0 },
  color: '#888888',
  visible: false,
};

const initialMeasurementsBox: MeasurementsBoxState = {
  visible: true,
  value: '',
  placeholder: 'Length',
  isEditing: false,
  inputType: 'length',
};

// ============================================================================
// STORE
// ============================================================================

export const useInferenceStore = create<InferenceStoreState>((set) => ({
  // Initial state
  activeInferences: [],
  primaryInference: null,
  lockedAxis: 'none',
  lockedInference: null,
  linearMode: 'all_on',
  planeLock: 'none',
  shiftHeld: false,
  cursorPosition: null,
  snappedPosition: null,
  startPoint: null,
  referenceEdge: null,
  screenTip: initialScreenTip,
  measurementsBox: initialMeasurementsBox,
  lineColor: INFERENCE_COLORS.DEFAULT,

  // Actions
  setActiveInferences: (inferences) =>
    set({ activeInferences: inferences }),

  setPrimaryInference: (inference) =>
    set({
      primaryInference: inference,
      lineColor: inference?.color || INFERENCE_COLORS.DEFAULT,
      screenTip: inference
        ? {
            text: inference.screenTip,
            position: { x: 0, y: 0 }, // Will be updated by component
            color: colorToHex(inference.color),
            icon: getInferenceIcon(inference),
            visible: true,
          }
        : { ...initialScreenTip, visible: false },
    }),

  setLockedAxis: (axis) =>
    set({
      lockedAxis: axis,
      lineColor: getAxisColor(axis),
    }),

  setLockedInference: (inference) =>
    set({ lockedInference: inference }),

  setLinearMode: (mode) =>
    set({ linearMode: mode }),

  setPlaneLock: (plane) =>
    set({ planeLock: plane }),

  setShiftHeld: (held) =>
    set({ shiftHeld: held }),

  setCursorPosition: (position) =>
    set({ cursorPosition: position }),

  setSnappedPosition: (position) =>
    set({ snappedPosition: position }),

  setStartPoint: (point) =>
    set({ startPoint: point }),

  setReferenceEdge: (edge) =>
    set({ referenceEdge: edge }),

  setScreenTip: (tip) =>
    set((state) => ({
      screenTip: { ...state.screenTip, ...tip },
    })),

  setMeasurementsBox: (boxState) =>
    set((state) => ({
      measurementsBox: { ...state.measurementsBox, ...boxState },
    })),

  setLineColor: (color) =>
    set({ lineColor: color }),

  reset: () =>
    set({
      activeInferences: [],
      primaryInference: null,
      lockedAxis: 'none',
      lockedInference: null,
      linearMode: 'all_on',
      planeLock: 'none',
      shiftHeld: false,
      cursorPosition: null,
      snappedPosition: null,
      startPoint: null,
      referenceEdge: null,
      screenTip: initialScreenTip,
      measurementsBox: initialMeasurementsBox,
      lineColor: INFERENCE_COLORS.DEFAULT,
    }),
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function colorToHex(color: Color3): string {
  const r = Math.round(color.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(color.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(color.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function getAxisColor(axis: InferenceLockAxis): Color3 {
  switch (axis) {
    case 'red':
      return INFERENCE_COLORS.RED_AXIS;
    case 'green':
      return INFERENCE_COLORS.GREEN_AXIS;
    case 'blue':
      return INFERENCE_COLORS.BLUE_AXIS;
    case 'magenta':
      return INFERENCE_COLORS.PARALLEL;
    default:
      return INFERENCE_COLORS.DEFAULT;
  }
}

function getInferenceIcon(inference: Inference): 'dot' | 'square' | 'x' | 'line' | undefined {
  if (inference.type === 'point') {
    const pointType = inference.subType as PointInferenceType;
    switch (pointType) {
      case 'origin':
      case 'endpoint':
      case 'midpoint':
      case 'center':
      case 'quarter_point':
      case 'arc_midpoint':
        return 'dot';
      case 'intersection':
        return 'dot'; // Black dot
      case 'on_face':
      case 'on_edge':
        return 'square';
      case 'guide_point':
        return 'x';
      default:
        return 'dot';
    }
  } else if (inference.type === 'linear') {
    return 'line';
  }
  return undefined;
}

// ============================================================================
// SELECTORS
// ============================================================================

export const selectIsAxisLocked = (state: InferenceStoreState) =>
  state.lockedAxis !== 'none';

export const selectIsInferenceLocked = (state: InferenceStoreState) =>
  state.lockedInference !== null;

export const selectCurrentInferenceText = (state: InferenceStoreState) => {
  if (state.lockedInference) {
    return `${state.lockedInference.screenTip} [Locked]`;
  }
  if (state.primaryInference) {
    return state.primaryInference.screenTip;
  }
  return '';
};

export const selectAxisLockText = (state: InferenceStoreState) => {
  switch (state.lockedAxis) {
    case 'red':
      return 'Red Axis (X)';
    case 'green':
      return 'Green Axis (Z)';
    case 'blue':
      return 'Blue Axis (Y)';
    case 'magenta':
      return 'Parallel/Perpendicular';
    default:
      return '';
  }
};

export const selectLinearModeText = (state: InferenceStoreState) => {
  switch (state.linearMode) {
    case 'all_on':
      return 'Linear: All On';
    case 'all_off':
      return 'Linear: Off';
    case 'parallel_perpendicular_only':
      return 'Linear: Parallel/Perp Only';
  }
};

export default useInferenceStore;
