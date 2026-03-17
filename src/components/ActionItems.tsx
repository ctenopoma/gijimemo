import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function ActionItems({ value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Parse newline-separated string into array (always at least 1 item)
  const items = value ? value.split("\n") : [""];

  const setItems = (newItems: string[]) => {
    onChange(newItems.join("\n"));
  };

  const updateItem = (index: number, text: string) => {
    const next = [...items];
    next[index] = text;
    setItems(next);
  };

  const addItem = (afterIndex: number) => {
    const next = [...items];
    next.splice(afterIndex + 1, 0, "");
    setItems(next);
    setTimeout(() => inputRefs.current[afterIndex + 1]?.focus(), 0);
  };

  const removeItem = (index: number) => {
    if (items.length === 1) {
      setItems([""]);
      return;
    }
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    setTimeout(() => inputRefs.current[Math.max(0, index - 1)]?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem(index);
    } else if (e.key === "Backspace" && items[index] === "" && items.length > 1) {
      e.preventDefault();
      removeItem(index);
    }
  };

  const filledCount = items.filter((item) => item.trim() !== "").length;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer select-none ${isOpen ? "border-b border-gray-100" : ""}`}
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className="text-gray-300 shrink-0">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex-1">
          アクションアイテム
        </span>
        {filledCount > 0 && (
          <span className="text-xs text-gray-400">{filledCount}件</span>
        )}
      </div>

      {/* Items */}
      {isOpen && (
        <div>
          {items.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-1.5 group border-b border-gray-50 last:border-b-0"
            >
              <span className="text-gray-300 text-sm shrink-0 leading-none">•</span>
              <input
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                value={item}
                onChange={(e) => updateItem(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                placeholder="担当者・期日・内容…"
                className="flex-1 text-sm text-gray-700 bg-transparent border-none focus:outline-none placeholder:text-gray-300 py-0.5"
              />
              <button
                onClick={() => removeItem(index)}
                className={`p-0.5 text-gray-200 hover:text-red-400 transition-colors shrink-0 ${
                  items.length === 1 && item === "" ? "invisible" : "opacity-0 group-hover:opacity-100"
                }`}
                title="削除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="px-3 py-1.5">
            <button
              onClick={() => addItem(items.length - 1)}
              className="flex items-center gap-1 text-xs text-gray-300 hover:text-gray-500 transition-colors"
            >
              <Plus className="w-3 h-3" />
              追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
