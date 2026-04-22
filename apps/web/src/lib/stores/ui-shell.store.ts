import { create } from "zustand";

interface UiShellState {
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (value) => set({ sidebarOpen: value })
}));

