import { useRef, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { useEditorStore, AgendaCard } from "../store/editorStore";

interface Props {
  card: AgendaCard;
  index: number;
  totalCards: number;
}

export default function AgendaCardComponent({ card, index, totalCards }: Props) {
  const { updateCard, removeCard } = useEditorStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [card.content]);

  return (
    <div className="group border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
        <span className="text-xs font-bold text-gray-300 w-5 text-center shrink-0">
          {index + 1}
        </span>
        <input
          type="text"
          placeholder="論点タイトル"
          value={card.title}
          onChange={(e) => updateCard(card.id, { title: e.target.value })}
          className="flex-1 text-sm font-medium bg-transparent border-none focus:outline-none placeholder:text-gray-300 text-gray-700"
        />
        {totalCards > 1 && (
          <button
            onClick={() => removeCard(card.id)}
            className="p-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 rounded transition-colors shrink-0"
            title="削除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Memo area */}
      <textarea
        ref={textareaRef}
        placeholder="メモを殴り書き…"
        value={card.content}
        onChange={(e) => updateCard(card.id, { content: e.target.value })}
        rows={3}
        className="w-full px-3 py-2 text-sm text-gray-700 bg-white border-none focus:outline-none placeholder:text-gray-300 resize-none leading-relaxed"
        style={{ minHeight: "72px" }}
      />
    </div>
  );
}
