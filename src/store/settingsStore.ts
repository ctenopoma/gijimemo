import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

// ─── Issuer DB フォルダ履歴 (localStorage) ───────────────────────────────────

const ISSUER_HISTORY_KEY = "issuer_db_history";
const MAX_ISSUER_HISTORY = 5;

function loadIssuerHistory(): string[] {
  try {
    const raw = localStorage.getItem(ISSUER_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persistIssuerHistory(paths: string[]) {
  localStorage.setItem(ISSUER_HISTORY_KEY, JSON.stringify(paths));
}

export function addIssuerDbPath(folderPath: string): string[] {
  const current = loadIssuerHistory().filter((p) => p !== folderPath);
  const updated = [folderPath, ...current].slice(0, MAX_ISSUER_HISTORY);
  persistIssuerHistory(updated);
  return updated;
}

export function getIssuerDbHistory(): string[] {
  return loadIssuerHistory();
}

export interface Settings {
  llm_api_key: string;
  llm_endpoint: string;
  llm_model: string;
  prompt_template: string;
  always_on_top: boolean;
  auto_transparent: boolean;
  inactive_opacity: number;
  dark_mode: boolean;
}

const defaultSettings: Settings = {
  llm_api_key: "",
  llm_endpoint: "",
  llm_model: "gpt-4o-mini",
  prompt_template:
    "あなたは議事録のアシスタントです。\n\n以下の議事録の内容を整理し、\n1. 要点（箇条書き）\n2. 決定事項\n3. アクションアイテム（担当者・期日があれば含める）\nをMarkdown形式で出力してください。\n\n## 議事録タイトル\n{title}\n\n## 内容\n{content}",
  always_on_top: true,
  auto_transparent: true,
  inactive_opacity: 0.6,
  dark_mode: false,
};

interface SettingsStore {
  settings: Settings;
  loadSettings: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: defaultSettings,

  loadSettings: async () => {
    try {
      const s = await invoke<Settings>("get_settings");
      set({ settings: s });
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  saveSettings: async (s: Settings) => {
    try {
      await invoke("save_settings", { settings: s });
      set({ settings: s });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  },
}));
