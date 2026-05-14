import { useEffect, useRef } from 'react';
import type { Viewer } from 'cesium';
import { createViewer } from '../../viewer';
import { useCesiumSetViewer } from './CesiumContext';

declare global {
  interface Window {
    __viewer?: Viewer;
  }
}

/**
 * 主 Cesium viewer：ArcGIS World Imagery 底图，无 tileset 叠加。
 * 初始相机定位由 useFlyToMission 接管（有 mission 飞到航点中心，否则飞默认视角）。
 */
export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setViewer = useCesiumSetViewer();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewer = createViewer(container);
    setViewer(viewer);
    if (import.meta.env.DEV) {
      window.__viewer = viewer;
    }

    return () => {
      if (import.meta.env.DEV) delete window.__viewer;
      viewer.destroy();
      setViewer(null);
    };
  }, [setViewer]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
