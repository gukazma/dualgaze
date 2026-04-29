import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewer } from 'cesium';
import { SketchController } from './SketchController';
import type { SketchSnapshot } from './SketchController';

const INITIAL: SketchSnapshot = { mode: 'idle', vertexCount: 0, height: null };

export interface SketchHandle {
  mode: SketchSnapshot['mode'];
  vertexCount: number;
  height: number | null;
  start: () => void;
  cancel: () => void;
  close: () => void;
  setExtrudedHeight: (meters: number) => void;
  commitExtrude: () => void;
  setMouseLocked: (locked: boolean) => void;
  clearAll: () => void;
}

export function useSketch(viewer: Viewer | null): SketchHandle {
  const controllerRef = useRef<SketchController | null>(null);
  const [snap, setSnap] = useState<SketchSnapshot>(INITIAL);

  useEffect(() => {
    if (!viewer || !viewer.canvas) return;
    let c: SketchController;
    try {
      c = new SketchController(viewer, setSnap);
    } catch {
      return;
    }
    controllerRef.current = c;
    return () => {
      try {
        c.dispose();
      } catch {
        /* viewer may already be destroyed */
      }
      controllerRef.current = null;
      setSnap(INITIAL);
    };
  }, [viewer]);

  useEffect(() => {
    if (snap.mode !== 'drawing' && snap.mode !== 'extruding') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter' && snap.mode === 'drawing') {
        e.preventDefault();
        controllerRef.current?.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        controllerRef.current?.cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snap.mode]);

  const start = useCallback(() => controllerRef.current?.start(), []);
  const cancel = useCallback(() => controllerRef.current?.cancel(), []);
  const close = useCallback(() => {
    controllerRef.current?.close();
  }, []);
  const setExtrudedHeight = useCallback(
    (meters: number) => controllerRef.current?.setExtrudedHeight(meters),
    [],
  );
  const commitExtrude = useCallback(() => controllerRef.current?.commitExtrude(), []);
  const setMouseLocked = useCallback(
    (locked: boolean) => controllerRef.current?.setMouseLocked(locked),
    [],
  );
  const clearAll = useCallback(() => controllerRef.current?.clearAll(), []);

  return {
    mode: snap.mode,
    vertexCount: snap.vertexCount,
    height: snap.height,
    start,
    cancel,
    close,
    setExtrudedHeight,
    commitExtrude,
    setMouseLocked,
    clearAll,
  };
}
