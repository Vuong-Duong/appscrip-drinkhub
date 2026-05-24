import { create } from "zustand";

export const useAppStore = create((set) => ({
  currentPage: "home",
  setCurrentPage: (page) => set({ currentPage: page }),

  activeTab: "dashboard",
  setActiveTab: (tab) => set({ activeTab: tab }),

  isProcessing: false,
  setIsProcessing: (processing) => set({ isProcessing: processing }),
}));
