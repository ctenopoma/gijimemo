import { useRef, useEffect, useState, useCallback } from "react";
import { Trash2, X, ChevronDown, ChevronRight } from "lucide-react";
import { useEditorStore, AgendaCard, CardImage } from "../store/editorStore";
import { nanoid } from "../utils/nanoid";

interface Props {
  card: AgendaCard;
  index: number;
  totalCards: number;
}

export default function AgendaCardComponent({ card, index, totalCards }: Props) {
  const { updateCard, removeCard } = useEditorStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [card.content]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const data = ev.target?.result as string;
          if (!data) return;
          const newImage: CardImage = {
            id: nanoid(),
            data,
            order_index: card.images.length,
          };
          updateCard(card.id, { images: [...card.images, newImage] });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }, [card.id, card.images, updateCard]);

  const removeImage = (imgId: string) => {
    const updated = card.images
      .filter((img) => img.id !== imgId)
      .map((img, i) => ({ ...img, order_index: i }));
    updateCard(card.id, { images: updated });
  };

  return (
    <>
      <div
        className="group border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors overflow-hidden"
        onPaste={handlePaste}
      >
        {/* Card header */}
        <div
          className={`flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-750 cursor-pointer select-none ${isOpen ? "border-b border-gray-100 dark:border-gray-700" : ""}`}
          style={isOpen ? undefined : undefined}
          onClick={() => setIsOpen((v) => !v)}
        >
          <span className="text-gray-300 dark:text-gray-600 shrink-0">
            {isOpen
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-5 text-center shrink-0">
            {index + 1}
          </span>
          <input
            type="text"
            placeholder="論点タイトル"
            value={card.title}
            onChange={(e) => updateCard(card.id, { title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 text-sm font-medium bg-transparent border-none focus:outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 text-gray-700 dark:text-gray-200"
          />
          {totalCards > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); removeCard(card.id); }}
              className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 rounded transition-colors shrink-0"
              title="削除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Memo area + Images (collapsible) */}
        {isOpen && (
          <>
            <textarea
              ref={textareaRef}
              placeholder="メモを殴り書き…"
              value={card.content}
              onChange={(e) => updateCard(card.id, { content: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border-none focus:outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-none leading-relaxed"
              style={{ minHeight: "72px" }}
            />

            {card.images.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pb-3">
                {card.images.map((img) => (
                  <div key={img.id} className="relative group/img">
                    <img
                      src={img.data}
                      alt=""
                      className="max-h-32 max-w-xs rounded border border-gray-200 dark:border-gray-700 cursor-zoom-in object-contain"
                      onClick={() => setZoomedImage(img.data)}
                    />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
                      title="画像を削除"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Zoom modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-1.5 hover:bg-black/70"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}
