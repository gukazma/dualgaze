import { useEffect, useRef, useState } from 'react';
import type { Viewer } from 'cesium';
import { createViewer } from '../../viewer';
import { loadPointCloud } from '../../pointcloud';
import { useCesiumSetViewer } from './CesiumContext';

declare global {
  interface Window {
    __viewer?: Viewer;
  }
}

type TilesetStatus = 'loading' | 'ready' | 'error';

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setViewer = useCesiumSetViewer();
  const [tilesetStatus, setTilesetStatus] = useState<TilesetStatus>('loading');
  const [tilesetError, setTilesetError] = useState<string>('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewer = createViewer(container);
    setViewer(viewer);
    if (import.meta.env.DEV) {
      window.__viewer = viewer;
    }

    let cancelled = false;
    loadPointCloud(viewer, '/datas/pnts/tileset.json')
      .then(() => {
        if (!cancelled) setTilesetStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTilesetStatus('error');
        setTilesetError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      if (import.meta.env.DEV) delete window.__viewer;
      viewer.destroy();
      setViewer(null);
    };
  }, [setViewer]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <TilesetStatusBadge status={tilesetStatus} error={tilesetError} />
      </div>
    </>
  );
}

function TilesetStatusBadge({ status, error }: { status: TilesetStatus; error: string }) {
  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-border bg-bg-surface/90 px-3 py-1.5 text-[11px] text-text-secondary backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        加载点云中…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-accent-danger bg-bg-surface/90 px-3 py-1.5 text-[11px] text-accent-danger backdrop-blur">
        点云加载失败: {error}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-accent-cyan/40 bg-bg-surface/90 px-3 py-1.5 text-[11px] text-accent-cyan backdrop-blur">
      <span className="h-2 w-2 rounded-full bg-accent-cyan" />
      tileset 已加载
    </span>
  );
}
