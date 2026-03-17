import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { Minus, Square, X, Settings, Search, FileText, Pin, PinOff, Minimize2, Maximize2 } from "lucide-react";
import { useAppStore } from "../store/appStore";
import { useSettingsStore } from "../store/settingsStore";
import { useState } from "react";

const NORMAL_SIZE = { width: 860, height: 700 };
const COMPACT_SIZE = { width: 480, height: 160 };

export default function TitleBar() {
  const { currentPage, setPage } = useAppStore();
  const { settings, saveSettings } = useSettingsStore();
  const [alwaysOnTop, setAlwaysOnTop] = useState(settings.always_on_top);
  const [isCompact, setIsCompact] = useState(false);

  const appWindow = getCurrentWindow();

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = () => appWindow.toggleMaximize();
  const handleClose = () => appWindow.close();

  const toggleCompact = async () => {
    const next = !isCompact;
    setIsCompact(next);
    const size = next ? COMPACT_SIZE : NORMAL_SIZE;
    await appWindow.setSize(new LogicalSize(size.width, size.height));
  };

  const togglePin = async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    await appWindow.setAlwaysOnTop(next);
    await saveSettings({ ...settings, always_on_top: next });
  };

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
          onClick={toggleCompact}
          className={`p-1.5 rounded transition-colors ${
            isCompact
              ? "text-orange-400 hover:text-orange-300"
              : "text-gray-400 hover:text-gray-200"
          }`}
          title={isCompact ? "元のサイズに戻す" : "コンパクトにする"}
        >
          {isCompact ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
        <button
          onClick={togglePin}
          className={`p-1.5 rounded transition-colors ${
            alwaysOnTop
              ? "text-blue-400 hover:text-blue-300"
              : "text-gray-400 hover:text-gray-200"
          }`}
          title={alwaysOnTop ? "常に最前面 ON" : "常に最前面 OFF"}
        >
          {alwaysOnTop ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
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
