import { create } from "zustand";
import { PartyType } from "../types";

interface UIState {
  activeModule: PartyType;
  sidebarOpen: boolean;
  setModule: (module: PartyType) => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  initializeUI: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeModule: "customer",
  sidebarOpen: false,
  setModule: (activeModule) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("activeModule", activeModule);
    }
    set({ activeModule });
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  initializeUI: () => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("activeModule") as PartyType | null;
      if (saved === "customer" || saved === "shoper") {
        set({ activeModule: saved });
      }
    }
  },
}));
