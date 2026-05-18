import { create } from 'zustand';

export type TilesetLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface TilesetLoadingStore {
  status: TilesetLoadStatus;
  /** 加载完成后由 TilesetLoaderHost 写入：tileset 内含的 tile 个数（如可知）；为了 chip 显示 */
  fileCount?: number;
  /** 当前 tileset 的展示名（root file 或 URL 末段），给 chip 用 */
  label?: string;
  /** error 状态下的错误信息 */
  errorMsg?: string;
  setLoading: () => void;
  setLoaded: (info: { label?: string; fileCount?: number }) => void;
  setError: (msg: string) => void;
  reset: () => void;
}

/**
 * Tileset 加载状态的全局 store。
 *
 * 由 `TilesetLoaderHost` 写：source 变化时 setLoading() → 完成 setLoaded() / setError()。
 * 给 `FacadeLoadingOverlay` 读 status，给 `TilesetChip` 读 label / status / fileCount。
 *
 * 为什么不放局部 useState：FacadeLoadingOverlay 在主视图（CesiumViewer 兄弟节点）渲染，
 * 而 loading state 起自 TilesetLoaderHost；跨组件需要全局状态。
 */
export const useTilesetLoadingStore = create<TilesetLoadingStore>((set) => ({
  status: 'idle',
  setLoading: () => set({ status: 'loading', errorMsg: undefined }),
  setLoaded: ({ label, fileCount }) => set({ status: 'loaded', label, fileCount, errorMsg: undefined }),
  setError: (msg) => set({ status: 'error', errorMsg: msg }),
  reset: () => set({ status: 'idle', label: undefined, fileCount: undefined, errorMsg: undefined }),
}));
