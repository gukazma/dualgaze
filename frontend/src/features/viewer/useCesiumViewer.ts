import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { Viewer } from 'cesium';
import { createViewer } from '@/lib/cesium-bootstrap';

export function useCesiumViewer(containerRef: RefObject<HTMLDivElement | null>) {
  const viewerRef = useRef<Viewer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewer = createViewer(container);
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [containerRef]);

  return viewerRef;
}
