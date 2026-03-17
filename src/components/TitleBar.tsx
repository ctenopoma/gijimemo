import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Settings, Search, FileText, Pin, PinOff } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";

export default function TitleBar() {
  const { currentPage, setPage } = useAppStore();
  const { settings, saveSettings } = useSettingsStore();

  const handleMinimize = useCallback(() => getCurrentWindow().minimize(), []);
  const handleMaximize = useCallback(() => getCurrentWindow().toggleMaximize(), []);
  const handleClose = useCallback(() => getCurrentWindow().close(), []);

  const togglePin = useCallback(async () => {
    const next = !settings.always_on_top;
    await getCurrentWindow().setAlwaysOnTop(next);
    await saveSettings({ ...settings, always_on_top: next });
  }, [settings, saveSettings]);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center h-10 px-3 bg-gray-800 select-none shrink-0 rounded-t-xl"
    >
      {/* Window controls (left) */}
      <div className="flex items-center gap-1.5 mr-3">
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group"
          title="閉じる"
        >
          <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors flex items-center justify-center group"
          title="最小化"
        >
          <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors flex items-center justify-center group"
          title="最大化"
        >
          <Square className="w-1.5 h-1.5 text-green-900 opacity-0 group-hover:opacity-100" strokeWidth={3} />
        </button>
      </div>

      {/* Title */}
      <span
        data-tauri-drag-region
        className="text-gray-200 text-sm font-medium flex-1 cursor-default"
      >
        議事メモ
      </span>

      {/* Nav icons (right) */}
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <NavButton
          active={currentPage === "editor"}
          onClick={() => setPage("editor")}
          title="エディタ"
        >
          <FileText className="w-4 h-4" />
        </NavButton>
        <NavButton
          active={currentPage === "search"}
          onClick={() => setPage("search")}
          title="検索・一覧"
        >
          <Search className="w-4 h-4" />
        </NavButton>
        <NavButton
          active={currentPage === "settings"}
          onClick={() => setPage("settings")}
          title="設定"
        >
          <Settings className="w-4 h-4" />
        </NavButton>
        <button
          onClick={togglePin}
          className={`p-1.5 rounded transition-colors ${
            settings.always_on_top
              ? "text-blue-400 hover:text-blue-300"
              : "text-gray-400 hover:text-gray-200"
          }`}
          title={settings.always_on_top ? "常に最前面 ON" : "常に最前面 OFF"}
        >
          {settings.always_on_top ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "text-white bg-gray-600"
          : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
      }`}
      title={title}
    >
      {children}
    </button>
  );
}
