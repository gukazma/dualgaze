import { useEffect, useRef } from 'react';
import type { Viewer } from 'cesium';
import { createViewer } from '../../viewer';
import { useCesiumSetViewer } from './CesiumContext';
import { loadTileset } from '../../lib/tileset';
import { useMissionsStore } from '../../store/missions';

declare global {
  interface Window {
    __viewer?: Viewer;
  }
}

/**
 * 主 Cesium viewer。
 * ArcGIS 卫星底图 + Bavaria pnts 叠加；无 mission 时初始相机飞到 tileset 中心，
 * 否则交由 useFlyToMission 处理。
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

    loadTileset(viewer, { maximumScreenSpaceError: 4, pointSize: 4 })
      .then((tileset) => {
        if (!tileset || viewer.isDestroyed()) return;
        // 无 mission 时，把相机定位到 Bavaria pnts，方便用户直接画点
        const hasMission = useMissionsStore.getState().currentMissionId !== null;
        if (!hasMission) {
          void viewer.zoomTo(tileset);
        }
      })
      .catch((err) => {
        console.error('[CesiumViewer] tileset load failed', err);
      });

    return () => {
      if (import.meta.env.DEV) delete window.__viewer;
      viewer.destroy();
      setViewer(null);
    };
  }, [setViewer]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
