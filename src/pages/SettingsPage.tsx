import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Save, Wifi, Eye, EyeOff, Check } from "lucide-react";
import { useSettingsStore, Settings } from "../store/settingsStore";

export default function SettingsPage() {
  const { settings, saveSettings } = useSettingsStore();
  const [local, setLocal] = useState<Settings>({ ...settings });
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  // Sync when settings load from DB after mount
  useEffect(() => {
    if (!initialized.current && settings.llm_endpoint !== "") {
      setLocal({ ...settings });
      initialized.current = true;
    }
  }, [settings]);

  const patch = (key: keyof Settings, value: Settings[keyof Settings]) => {
    setLocal((s) => ({ ...s, [key]: value }));
  };

  const handleSave = async () => {
    await saveSettings(local);
    // Apply always-on-top immediately
    await getCurrentWindow().setAlwaysOnTop(local.always_on_top);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<string>("test_llm_connection", {
        endpoint: local.llm_endpoint,
        apiKey: local.llm_api_key,
        model: local.llm_model,
      });
      setTestResult("✅ " + result);
    } catch (e) {
      setTestResult("❌ " + e);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-4 space-y-5">
      <h2 className="text-base font-bold text-gray-700">設定</h2>

      {/* LLM Settings */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-1">
          LLM 接続設定
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            エンドポイント URL
          </label>
          <input
            type="text"
            value={local.llm_endpoint}
            onChange={(e) => patch("llm_endpoint", e.target.value)}
            placeholder="http://127.0.0.1:8080/v1/chat/completions"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            ローカルLLMの場合は <code className="bg-gray-100 px-1 rounded">localhost</code> より <code className="bg-gray-100 px-1 rounded">127.0.0.1</code> を推奨（IPv6解決問題の回避）。末尾まで含めて入力してください。
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={local.llm_api_key}
              onChange={(e) => patch("llm_api_key", e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 pr-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
            />
            <button
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            モデル名
          </label>
          <input
            type="text"
            value={local.llm_model}
            onChange={(e) => patch("llm_model", e.target.value)}
            placeholder="gpt-4o-mini"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            プロンプトテンプレート{" "}
            <span className="text-gray-400 font-normal">
              ({"{title}"} {"{content}"} が使えます)
            </span>
          </label>
          <textarea
            value={local.prompt_template}
            onChange={(e) => patch("prompt_template", e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono resize-y"
          />
        </div>

        <button
          onClick={handleTest}
          disabled={testing || !local.llm_endpoint}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <Wifi className="w-4 h-4" />
          {testing ? "確認中…" : "LLMへの接続確認"}
        </button>

        {testResult && (
          <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono whitespace-pre-wrap">
            {testResult}
          </p>
        )}
      </section>

      {/* Window Settings */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b pb-1">
          ウィンドウ設定
        </h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={local.always_on_top}
            onChange={(e) => patch("always_on_top", e.target.checked)}
            className="w-4 h-4 accent-blue-500"
          />
          <span className="text-sm text-gray-700">常に最前面に表示</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={local.auto_transparent}
            onChange={(e) => patch("auto_transparent", e.target.checked)}
            className="w-4 h-4 accent-blue-500"
          />
          <span className="text-sm text-gray-700">非アクティブ時に半透明化</span>
        </label>

        {local.auto_transparent && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              非アクティブ時の不透明度:{" "}
              <span className="font-bold">{Math.round(local.inactive_opacity * 100)}%</span>
            </label>
            <input
              type="range"
              min={0.1}
              max={0.95}
              step={0.05}
              value={local.inactive_opacity}
              onChange={(e) => patch("inactive_opacity", parseFloat(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        )}
      </section>

      {/* Save button */}
      <button
        onClick={handleSave}
        className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors font-medium ${
          saved
            ? "text-green-700 bg-green-100"
            : "text-white bg-blue-600 hover:bg-blue-500"
        }`}
      >
        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "保存済み" : "設定を保存"}
      </button>
    </div>
  );
}
