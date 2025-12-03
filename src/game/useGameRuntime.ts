/**
 * useGameRuntime - React Hook for Game Runtime
 *
 * EditorPage에서 쉽게 사용할 수 있는 React 훅
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Engine, Scene } from '@babylonjs/core';
import { GameRuntime } from './GameRuntime';
import { GameState, BuildProgress } from './types';

export interface UseGameRuntimeOptions {
  onStateChange?: (state: GameState) => void;
  onBuildProgress?: (progress: BuildProgress) => void;
}

export interface UseGameRuntimeReturn {
  state: GameState;
  buildProgress: BuildProgress | null;
  isPointerLocked: boolean;
  play: (floorplanData: any, engine: Engine, editorScene: Scene, canvas: HTMLCanvasElement) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  requestPointerLock: () => void;
}

export function useGameRuntime(options: UseGameRuntimeOptions = {}): UseGameRuntimeReturn {
  const [state, setState] = useState<GameState>('idle');
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const runtimeRef = useRef<GameRuntime | null>(null);
  const checkIntervalRef = useRef<number | null>(null);

  // Pointer Lock 상태 체크
  useEffect(() => {
    if (state === 'playing' || state === 'paused') {
      checkIntervalRef.current = window.setInterval(() => {
        const locked = runtimeRef.current?.isPointerLocked() ?? false;
        setIsPointerLocked(locked);
      }, 100);
    } else {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      setIsPointerLocked(false);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [state]);

  const play = useCallback(async (
    floorplanData: any,
    engine: Engine,
    editorScene: Scene,
    canvas: HTMLCanvasElement
  ) => {
    if (runtimeRef.current) {
      runtimeRef.current.dispose();
    }

    runtimeRef.current = new GameRuntime(engine, canvas, {
      onStateChange: (newState) => {
        setState(newState);
        options.onStateChange?.(newState);
      },
      onBuildProgress: (progress) => {
        setBuildProgress(progress);
        options.onBuildProgress?.(progress);
      },
    });

    await runtimeRef.current.play(floorplanData, editorScene);
  }, [options]);

  const pause = useCallback(() => {
    runtimeRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    runtimeRef.current?.resume();
  }, []);

  const stop = useCallback(() => {
    runtimeRef.current?.stop();
    runtimeRef.current = null;
    setBuildProgress(null);
  }, []);

  const requestPointerLock = useCallback(() => {
    runtimeRef.current?.requestPointerLock();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      runtimeRef.current?.dispose();
    };
  }, []);

  return {
    state,
    buildProgress,
    isPointerLocked,
    play,
    pause,
    resume,
    stop,
    requestPointerLock,
  };
}
