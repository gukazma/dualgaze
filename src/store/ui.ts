import { create } from 'zustand';

export type RightSheetTab = 'waypoints' | 'config' | 'actions';

interface UiState {
  createModalOpen: boolean;
  rightSheetTab: RightSheetTab;
  leftSheetCollapsed: boolean;

  openCreateModal: () => void;
  closeCreateModal: () => void;
  setRightSheetTab: (tab: RightSheetTab) => void;
  toggleLeftSheet: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  createModalOpen: false,
  rightSheetTab: 'waypoints',
  leftSheetCollapsed: false,

  openCreateModal: () => set({ createModalOpen: true }),
  closeCreateModal: () => set({ createModalOpen: false }),
  setRightSheetTab: (tab) => set({ rightSheetTab: tab }),
  toggleLeftSheet: () => set((s) => ({ leftSheetCollapsed: !s.leftSheetCollapsed })),
}));
