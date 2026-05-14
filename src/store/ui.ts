import { create } from 'zustand';

export type RightSheetTab = 'waypoints' | 'config' | 'actions';
export type LibrarySort = 'updated_desc' | 'updated_asc' | 'name';

interface UiState {
  createModalOpen: boolean;
  rightSheetTab: RightSheetTab;
  leftSheetCollapsed: boolean;
  /** 航线库筛选 drone id，null = 全部机型 */
  libraryFilterDrone: string | null;
  /** 航线库排序 */
  librarySort: LibrarySort;

  openCreateModal: () => void;
  closeCreateModal: () => void;
  setRightSheetTab: (tab: RightSheetTab) => void;
  toggleLeftSheet: () => void;
  setLibraryFilterDrone: (id: string | null) => void;
  setLibrarySort: (s: LibrarySort) => void;
}

export const useUiStore = create<UiState>((set) => ({
  createModalOpen: false,
  rightSheetTab: 'waypoints',
  leftSheetCollapsed: false,
  libraryFilterDrone: null,
  librarySort: 'updated_desc',

  openCreateModal: () => set({ createModalOpen: true }),
  closeCreateModal: () => set({ createModalOpen: false }),
  setRightSheetTab: (tab) => set({ rightSheetTab: tab }),
  toggleLeftSheet: () => set((s) => ({ leftSheetCollapsed: !s.leftSheetCollapsed })),
  setLibraryFilterDrone: (id) => set({ libraryFilterDrone: id }),
  setLibrarySort: (s) => set({ librarySort: s }),
}));
