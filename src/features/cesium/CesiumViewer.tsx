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
 * 主 Cesium viewer。
 * v1 不再自动加载点云 —— 编辑器在 AMap 底图上工作。
 * 若以后要叠点云上去，加一个用户可控的 "加载 tileset" 入口
 * （`pointcloud.ts` 的 loadPointCloud 已就绪可复用）。
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
