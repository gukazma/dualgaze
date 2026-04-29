import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Viewer } from 'cesium';
import { createViewer } from '@/lib/cesium-bootstrap';

export function useCesiumViewer(
  containerRef: RefObject<HTMLDivElement | null>,
): Viewer | null {
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const v = createViewer(container);
    setViewer(v);
    return () => {
      v.destroy();
      setViewer(null);
    };
  }, [containerRef]);

  return viewer;
}
