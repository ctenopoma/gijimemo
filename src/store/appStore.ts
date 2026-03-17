import { create } from "zustand";

type Page = "editor" | "settings" | "search";

interface AppStore {
  currentPage: Page;
  setPage: (page: Page) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  currentPage: "editor",
  setPage: (page) => set({ currentPage: page }),
}));
