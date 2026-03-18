import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen, Sparkles, Send, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { useSettingsStore } from "../store/settingsStore";
import { addIssuerDbPath, getIssuerDbHistory } from "../store/settingsStore";

interface Props {
  meetingTitle: string;
  meetingContent: string;
  onClose: () => void;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

interface ExtractedIssue {
  title: string;
  body: string;
  checked: boolean;
  expanded: boolean;
}

export default function IssuerModal({ meetingTitle, meetingContent, onClose }: Props) {
  const { settings } = useSettingsStore();

  // DB フォルダ
  const [dbFolder, setDbFolder] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 手動入力
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");

  // LLM 抽出結果（非空のとき抽出モード）
  const [extractedIssues, setExtractedIssues] = useState<ExtractedIssue[]>([]);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const isExtractMode = extractedIssues.length > 0;

  useEffect(() => {
    const h = getIssuerDbHistory();
    setHistory(h);
    if (h.length > 0) setDbFolder(h[0]);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSelectFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) {
        setDbFolder(selected);
      }
    } catch (e) {
      setToast({ type: "error", message: `フォルダ選択エラー: ${e}` });
    }
  };

  const handleExtract = async () => {
    if (!settings.llm_endpoint || !settings.llm_model) {
      setToast({ type: "error", message: "設定画面でLLMエンドポイントとモデルを設定してください。" });
      return;
    }

    const prompt =
      `以下の議事録に含まれるタスクをすべて抽出し、JSON配列形式のみで出力してください。\n` +
      `他のテキストは一切含めず、必ず次の形式で出力してください:\n` +
      `[{"title": "タスクのタイトル", "body": "タスクの詳細（Markdown形式）"}, ...]\n\n` +
      `## 議事録タイトル\n${meetingTitle || "（無題）"}\n\n## 内容\n${meetingContent}`;

    setIsExtracting(true);
    try {
      const raw = await invoke<string>("call_llm_oneshot", {
        endpoint: settings.llm_endpoint,
        apiKey: settings.llm_api_key,
        model: settings.llm_model,
        prompt,
      });

      // JSON配列を抽出（コードフェンス対応）
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("JSONが見つかりませんでした");

      const parsed = JSON.parse(jsonMatch[0]) as { title?: string; body?: string }[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("タスクが見つかりませんでした");
      }

      setExtractedIssues(
        parsed.map((item) => ({
          title: item.title ?? "",
          body: item.body ?? "",
          checked: true,
          expanded: false,
        }))
      );
      setToast({ type: "success", message: `${parsed.length}件のタスクを抽出しました。登録するものを選択してください。` });
    } catch (e) {
      setToast({ type: "error", message: `自動抽出失敗: ${e}` });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmitManual = async () => {
    if (!dbFolder) {
      setToast({ type: "error", message: "保存先フォルダを選択してください。" });
      return;
    }
    if (!title.trim()) {
      setToast({ type: "error", message: "タイトルを入力してください。" });
      return;
    }

    setIsSubmitting(true);
    try {
      const id = await invoke<number>("export_issue_to_db", {
        dbPath: dbFolder,
        title: title.trim(),
        body,
        assignee,
        createdBy: "gijimemo",
      });
      const updated = addIssuerDbPath(dbFolder);
      setHistory(updated);
      setToast({ type: "success", message: `Issue #${id} を登録しました。` });
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setToast({ type: "error", message: `登録失敗: ${e}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitExtracted = async () => {
    if (!dbFolder) {
      setToast({ type: "error", message: "保存先フォルダを選択してください。" });
      return;
    }
    const targets = extractedIssues.filter((i) => i.checked);
    if (targets.length === 0) {
      setToast({ type: "error", message: "登録するIssueを1件以上選択してください。" });
      return;
    }

    setIsSubmitting(true);
    const registered: number[] = [];
    const errors: string[] = [];
    for (const issue of targets) {
      try {
        const id = await invoke<number>("export_issue_to_db", {
          dbPath: dbFolder,
          title: issue.title,
          body: issue.body,
          assignee,
          createdBy: "gijimemo",
        });
        registered.push(id);
      } catch (e) {
        errors.push(`"${issue.title}": ${e}`);
      }
    }

    const updated = addIssuerDbPath(dbFolder);
    setHistory(updated);

    if (errors.length === 0) {
      setToast({ type: "success", message: `${registered.length}件のIssueを登録しました。(#${registered.join(", #")})` });
      setTimeout(() => onClose(), 1800);
    } else {
      setToast({
        type: "error",
        message: `${registered.length}件成功、${errors.length}件失敗:\n${errors.join("\n")}`,
      });
    }
    setIsSubmitting(false);
  };

  const checkedCount = extractedIssues.filter((i) => i.checked).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-xl mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Issuerに登録</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div
            className={`mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-medium whitespace-pre-wrap shrink-0 ${
              toast.type === "success"
                ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700"
                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* DB folder */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              保存先DB フォルダ
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={dbFolder}
                  onChange={(e) => setDbFolder(e.target.value)}
                  placeholder="フォルダパスを選択…"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 placeholder:text-gray-300 dark:placeholder:text-gray-600 pr-8"
                />
                {history.length > 0 && (
                  <button
                    onClick={() => setShowHistory((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    title="履歴から選択"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                )}
                {showHistory && history.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                    {history.map((p) => (
                      <button
                        key={p}
                        onClick={() => { setDbFolder(p); setShowHistory(false); }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 truncate border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                        title={p}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleSelectFolder}
                className="flex items-center gap-1 px-3 py-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                選択
              </button>
            </div>
          </div>

          {/* ── 手動入力モード ── */}
          {!isExtractMode && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  タイトル <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Issueのタイトル"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  本文（Markdown）
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Issueの詳細内容…"
                  rows={9}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-y font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  担当者
                </label>
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="担当者名"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                />
              </div>
            </>
          )}

          {/* ── LLM 抽出モード ── */}
          {isExtractMode && (
            <>
              {/* 担当者（全Issue共通） */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  担当者（全Issue共通）
                </label>
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="担当者名"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 placeholder:text-gray-300 dark:placeholder:text-gray-600"
                />
              </div>

              {/* Issue チェックリスト */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    抽出されたIssue（{checkedCount}/{extractedIssues.length}件選択）
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setExtractedIssues((prev) => prev.map((i) => ({ ...i, checked: true })))
                      }
                      className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      全選択
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      onClick={() =>
                        setExtractedIssues((prev) => prev.map((i) => ({ ...i, checked: false })))
                      }
                      className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      全解除
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {extractedIssues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg overflow-hidden transition-colors ${
                        issue.checked
                          ? "border-blue-200 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-700/20"
                      }`}
                    >
                      {/* チェックボックス行 */}
                      <div className="flex items-start gap-2 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={issue.checked}
                          onChange={(e) =>
                            setExtractedIssues((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, checked: e.target.checked } : item
                              )
                            )
                          }
                          className="mt-0.5 shrink-0 accent-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={issue.title}
                            onChange={(e) =>
                              setExtractedIssues((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, title: e.target.value } : item
                                )
                              )
                            }
                            className="w-full text-sm font-medium text-gray-800 dark:text-gray-100 bg-transparent border-none outline-none focus:bg-white dark:focus:bg-gray-800 focus:ring-1 focus:ring-blue-300 rounded px-1 -mx-1"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setExtractedIssues((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, expanded: !item.expanded } : item
                              )
                            )
                          }
                          className="shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                          title={issue.expanded ? "折りたたむ" : "本文を表示"}
                        >
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform ${issue.expanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      </div>

                      {/* 本文（展開時） */}
                      {issue.expanded && (
                        <div className="px-3 pb-2.5 border-t border-gray-100 dark:border-gray-700">
                          <textarea
                            value={issue.body}
                            onChange={(e) =>
                              setExtractedIssues((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, body: e.target.value } : item
                                )
                              )
                            }
                            rows={4}
                            className="w-full mt-2 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 font-mono border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 resize-y bg-white dark:bg-gray-900"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={handleExtract}
              disabled={isExtracting || isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors font-medium disabled:opacity-50 border border-purple-200 dark:border-purple-700"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isExtracting ? "抽出中…" : "LLMで自動抽出"}
            </button>
            {isExtractMode && (
              <button
                onClick={() => setExtractedIssues([])}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                title="手動入力に戻る"
              >
                <RotateCcw className="w-3 h-3" />
                手動入力
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={isExtractMode ? handleSubmitExtracted : handleSubmitManual}
              disabled={isSubmitting || isExtracting}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting
                ? "登録中…"
                : isExtractMode
                ? `${checkedCount}件を登録`
                : "登録"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
