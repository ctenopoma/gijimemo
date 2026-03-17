import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import EditorPage from "./pages/EditorPage";
import SettingsPage from "./pages/SettingsPage";
import SearchPage from "./pages/SearchPage";
import { useAppStore } from "./store/appStore";
import { useSettingsStore } from "./store/settingsStore";

export default function App() {
  const { currentPage } = useAppStore();
  const { settings, loadSettings } = useSettingsStore();

  // Load settings on startup
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Focus/Blur → auto opacity control
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const setupListeners = async () => {
      unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
        if (!settings.auto_transparent) return;
        if (focused) {
          document.documentElement.style.opacity = "1";
        } else {
          document.documentElement.style.opacity = String(settings.inactive_opacity);
        }
      });
    };

    setupListeners();

    return () => {
      unlisten?.();
    };
  }, [settings.auto_transparent, settings.inactive_opacity]);

  return (
    <div className="flex flex-col h-screen bg-white/95 backdrop-blur-sm rounded-xl overflow-hidden border border-gray-200 shadow-2xl">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        {currentPage === "editor" && <EditorPage />}
        {currentPage === "settings" && <SettingsPage />}
        {currentPage === "search" && <SearchPage />}
      </div>
    </div>
  );
}
