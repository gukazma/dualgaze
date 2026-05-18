import { Loader2 } from 'lucide-react';
import { useMissionsStore } from '../store/missions';
import { useTilesetLoadingStore } from '../store/tileset-loading';

/**
 * Facade tileset 加载中的主视图中央卡片（Pencil FrameD6）。
 *
 * 条件：`useTilesetLoadingStore.status === 'loading'`。
 *
 * 设计：480×260 居中卡片，cyan 边框；spinner + 文案 + 取消按钮。
 * 取消按钮目前只是把 tilesetSource 清回 undefined（让 TilesetLoaderHost 卸载），
 * Cesium fromUrl 本身没法 abort。
 */
export function FacadeLoadingOverlay() {
  const setTilesetSource = useMissionsStore((s) => s.setTilesetSource);
  const status = useTilesetLoadingStore((s) => s.status);

  if (status !== 'loading') return null;

  const onCancel = (): void => {
    setTilesetSource(undefined);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="pointer-events-auto w-[480px] rounded-xl border border-accent-cyan bg-bg-panel/95 p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-4 flex justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-accent-cyan" />
        </div>
        <h2 className="mb-2 text-center text-[16px] font-semibold text-text-primary">
          正在加载 tileset.json...
        </h2>
        <p className="mb-5 text-center text-[11px] text-text-secondary">
          ContextCapture / Smart3D 输出可能上万块，需要几秒
        </p>
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-bg-input">
          <div className="h-full w-1/2 animate-pulse bg-accent-cyan" />
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md border border-border bg-bg-input px-4 text-[11px] font-semibold text-text-primary hover:bg-bg-panel"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
