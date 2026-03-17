import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Save, Clipboard, ClipboardList, Sparkles, FileX, Check } from "lucide-react";
import { useEditorStore } from "../store/editorStore";
import { useSettingsStore } from "../store/settingsStore";
import AgendaCardComponent from "../components/AgendaCard";
import InsertZone from "../components/InsertZone";

export default function EditorPage() {
  const {
    meeting,
    cards,
    isDirty,
    isSaving,
    llmResult,
    isStreaming,
    setMeeting,
    addCardAfter,
    newDocument,
    saveMeeting,
    setLlmResult,
    setIsStreaming,
  } = useEditorStore();

  const { settings } = useSettingsStore();
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedText, setCopiedText] = useState(false);


  const handleSave = useCallback(async () => {
    try {
      await saveMeeting();
    } catch (e) {
      alert("保存に失敗しました: " + e);
    }
  }, [saveMeeting]);

  // Ctrl+S shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const buildFullText = () => {
    return cards.map((c) => `${c.title}\n${c.content}`).join("\n\n");
  };

  const copyMarkdown = async () => {
    const lines: string[] = [];
    lines.push(`# ${meeting.title || "（無題）"}`);
    lines.push(`**日時:** ${meeting.held_at}`);
    lines.push("");
    for (const card of cards) {
      lines.push(`## ${card.title || "（論点）"}`);
      if (card.content) lines.push(card.content);
      lines.push("");
    }
    if (meeting.action_items) {
      lines.push("## アクションアイテム");
      lines.push(meeting.action_items);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1500);
  };

  const copyPlainText = async () => {
    const lines: string[] = [];
    lines.push(`【${meeting.title || "（無題）"}】`);
    lines.push(`日時: ${meeting.held_at}`);
    lines.push("");
    for (const card of cards) {
      lines.push(`■ ${card.title || "（論点）"}`);
      if (card.content) lines.push(card.content);
      lines.push("");
    }
    if (meeting.action_items) {
      lines.push("▼ アクションアイテム");
      lines.push(meeting.action_items);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 1500);
  };

  const handleSummarize = async () => {
    if (!settings.llm_endpoint || !settings.llm_model) {
      alert("設定画面でエンドポイントとモデル名を設定し、「設定を保存」または「接続確認」を押してください。");
      return;
    }
    const fullContent = buildFullText();
    const prompt = settings.prompt_template
      .replace("{title}", meeting.title || "（無題）")
      .replace("{content}", fullContent);

    setLlmResult("");
    setIsStreaming(true);

    // Register a fresh listener for this summarization only.
    // Unlisten as soon as done/error so stale listeners never accumulate.
    const unlisten = await listen<{ chunk?: string; done?: boolean; error?: string }>(
      "llm-stream-chunk",
      (event) => {
        if (event.payload.done) {
          setIsStreaming(false);
          unlisten();
        } else if (event.payload.error) {
          setIsStreaming(false);
          unlisten();
          alert("LLM要約エラー: " + event.payload.error);
        } else if (event.payload.chunk) {
          useEditorStore.getState().appendLlmResult(event.payload.chunk);
        }
      }
    );

    try {
      await invoke("generate_summary_stream", {
        endpoint: settings.llm_endpoint,
        apiKey: settings.llm_api_key,
        model: settings.llm_model,
        prompt,
      });
    } catch (e) {
      setIsStreaming(false);
      unlisten();
      alert(
        `LLM要約に失敗しました\n\nエンドポイント: ${settings.llm_endpoint}\nモデル: ${settings.llm_model}\n\nエラー: ${e}`
      );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <button
          onClick={() => {
            if (isDirty && !confirm("未保存の変更があります。新規作成しますか？")) return;
            newDocument();
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
          title="新規作成"
        >
          <FileX className="w-3.5 h-3.5" />
          新規
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            isDirty
              ? "text-blue-600 hover:bg-blue-50 font-semibold"
              : "text-gray-400"
          }`}
          title="保存 (Ctrl+S)"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? "保存中…" : "保存"}
        </button>

        <div className="flex-1" />

        <button
          onClick={copyMarkdown}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            copiedMd
              ? "text-green-600 bg-green-50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          }`}
          title="Markdownでコピー"
        >
          {copiedMd ? <Check className="w-3.5 h-3.5" /> : <Clipboard className="w-3.5 h-3.5" />}
          {copiedMd ? "コピー済み" : "MD"}
        </button>
        <button
          onClick={copyPlainText}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            copiedText
              ? "text-green-600 bg-green-50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
          }`}
          title="テキストでコピー"
        >
          {copiedText ? <Check className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
          {copiedText ? "コピー済み" : "TEXT"}
        </button>
        <button
          onClick={handleSummarize}
          disabled={isStreaming}
          className="flex items-center gap-1 px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded transition-colors font-medium disabled:opacity-50"
          title="LLMで要約"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {isStreaming ? "要約中…" : "LLM要約"}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Header fields */}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <input
              type="text"
              placeholder="会議タイトル"
              value={meeting.title}
              onChange={(e) => setMeeting({ title: e.target.value })}
              className="w-full px-3 py-2 text-lg font-semibold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-gray-300"
            />
          </div>
          <input
            type="text"
            placeholder="開催日時"
            value={meeting.held_at}
            onChange={(e) => setMeeting({ held_at: e.target.value })}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-gray-300"
          />
        </div>

        {/* Agenda cards with insert zones */}
        <div className="flex flex-col gap-0">
          <InsertZone onInsert={() => addCardAfter(-1)} />
          {cards.map((card, index) => (
            <div key={card.id} className="flex flex-col gap-0">
              <AgendaCardComponent
                card={card}
                index={index}
                totalCards={cards.length}
              />
              <InsertZone onInsert={() => addCardAfter(index)} />
            </div>
          ))}
        </div>

        {/* Action items */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
            アクションアイテム（全体）
          </label>
          <textarea
            placeholder="担当者・期日・内容を記入…"
            value={meeting.action_items}
            onChange={(e) => setMeeting({ action_items: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-gray-300 resize-y"
          />
        </div>

        {/* LLM Result */}
        {(llmResult || isStreaming) && (
          <div className="border border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-100 border-b border-purple-200">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-700">LLM要約</span>
              {isStreaming && (
                <span className="text-xs text-purple-500 animate-pulse">生成中…</span>
              )}
              <button
                onClick={() => setLlmResult("")}
                className="ml-auto text-xs text-purple-400 hover:text-purple-600"
              >
                閉じる
              </button>
            </div>
            <pre className="px-3 py-3 text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed overflow-y-auto max-h-64">
              {llmResult}
              {isStreaming && <span className="animate-pulse">▊</span>}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
