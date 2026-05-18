import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { toast } from 'sonner';
import { useCesiumViewer } from '../cesium/CesiumContext';
import { useCurrentMission } from '../../store/missions';
import { useTilesetLoadingStore } from '../../store/tileset-loading';
import { loadTileset, unloadTileset } from '../../lib/tileset-source';
import type { TilesetSource } from '../../types/mission';

/**
 * 监听 currentMission.tilesetSource 变化时加载 / 卸载 3DTileset。
 *
 * - 只在 mission.type === 'facade' 时挂载有效
 * - source 变化（新 URL 或新 session）→ 卸载旧 tileset，加载新的
 * - source 变 undefined / null → 仅卸载
 * - 组件 unmount 时卸载（避免泄露 primitive）
 *
 * loading 状态广播到 `useTilesetLoadingStore`，供 FacadeLoadingOverlay / TilesetChip 订阅。
 * 出错时弹 sonner toast。
 */
export function TilesetLoaderHost() {
  const viewer = useCesiumViewer();
  const mission = useCurrentMission();
  const tilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);
  const setLoading = useTilesetLoadingStore((s) => s.setLoading);
  const setLoaded = useTilesetLoadingStore((s) => s.setLoaded);
  const setError = useTilesetLoadingStore((s) => s.setError);
  const reset = useTilesetLoadingStore((s) => s.reset);

  const source: TilesetSource | undefined =
    mission?.type === 'facade' ? mission.tilesetSource : undefined;

  // 用 source 的 (kind + url + sessionId) 作为变化 key
  const sourceKey = source
    ? `${source.kind}::${source.url ?? ''}::${source.sessionId ?? ''}`
    : '';

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;

    // 先卸载旧 tileset
    if (tilesetRef.current) {
      unloadTileset(viewer, tilesetRef.current);
      tilesetRef.current = null;
    }

    if (!source) {
      reset();
      return;
    }

    setLoading();
    loadTileset(viewer, source)
      .then((tileset) => {
        if (cancelled) {
          unloadTileset(viewer, tileset);
          return;
        }
        tilesetRef.current = tileset;
        const label =
          source.kind === 'http'
            ? source.url?.split('/').pop() ?? 'tileset.json'
            : source.rootFile ?? 'tileset.json';
        setLoaded({ label, fileCount: source.fileCount });
        toast.success('3DTileset 加载完成');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        toast.error('3DTileset 加载失败', { description: msg });
      });

    return () => {
      cancelled = true;
      if (tilesetRef.current && viewer) {
        unloadTileset(viewer, tilesetRef.current);
        tilesetRef.current = null;
      }
    };
  }, [viewer, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
