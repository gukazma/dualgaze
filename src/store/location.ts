/**
 * Location 搜索 / 跳转 状态管理。
 *
 * - recent: 最近 1 条定位结果（用户主动 commit 后写入 localStorage）
 * - favorites: 用户手动收藏的快捷点（v3 先内置 3 个 demo：北京 / 上海 / 丹江口大坝）
 * - expanded: 搜索 tab 是否展开（点击搜索框 / 输入文字 / 失焦自动收回）
 *
 * **不做 viewer.flyTo** —— flyTo 是个 imperative 副作用，放 store action 里
 * 会变成跨层耦合。LocationSearchTab 组件自己 useEffect 监听 store 然后调
 * viewer.camera.flyTo，store 只持久化最近 / 收藏。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LocationSource = 'amap' | 'manual' | 'ip' | 'favorite';

export interface LocationRecord {
  label: string;
  lon: number;
  lat: number;
  source: LocationSource;
  at: number;
}

interface LocationState {
  recent: LocationRecord | null;
  favorites: LocationRecord[];

  setRecent: (r: LocationRecord) => void;
  clearRecent: () => void;
  addFavorite: (r: LocationRecord) => void;
  removeFavorite: (label: string) => void;
}

const DEFAULT_FAVORITES: LocationRecord[] = [
  { label: '北京', lon: 116.4074, lat: 39.9042, source: 'favorite', at: 0 },
  { label: '上海', lon: 121.4737, lat: 31.2304, source: 'favorite', at: 0 },
  { label: '丹江口大坝', lon: 111.5189, lat: 32.5413, source: 'favorite', at: 0 },
];

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      recent: null,
      favorites: DEFAULT_FAVORITES,
      setRecent: (r) => set({ recent: r }),
      clearRecent: () => set({ recent: null }),
      addFavorite: (r) =>
        set((s) => ({
          favorites: [r, ...s.favorites.filter((f) => f.label !== r.label)].slice(0, 8),
        })),
      removeFavorite: (label) =>
        set((s) => ({ favorites: s.favorites.filter((f) => f.label !== label) })),
    }),
    {
      name: 'dualgaze.location',
      version: 1,
    },
  ),
);
