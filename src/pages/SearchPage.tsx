import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, FileText, Trash2, Plus } from "lucide-react";
import { useEditorStore, MeetingListItem } from "../store/editorStore";
import { useAppStore } from "../store/appStore";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MeetingListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { meeting, loadMeeting, newDocument } = useEditorStore();
  const { setPage } = useAppStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const isMounted = useRef(false);

  // Auto-focus search input on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<MeetingListItem[]>("get_meetings_list");
      setItems(result);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      fetchAll();
      return;
    }
    setLoading(true);
    try {
      const result = await invoke<MeetingListItem[]>("search_meetings", {
        query: q.trim(),
      });
      setItems(result);
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  // Initial load
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Debounced search (skip on initial mount — fetchAll handles that)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    const timer = setTimeout(() => handleSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  const handleOpen = async (id: string) => {
    const { isDirty } = useEditorStore.getState();
    if (isDirty && !confirm("未保存の変更があります。別の議事録を開きますか？")) return;
    await loadMeeting(id);
    setPage("editor");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("この議事録を削除しますか？")) return;
    await invoke("delete_meeting", { id });
    await fetchAll();
  };

  const handleNew = () => {
    newDocument();
    setPage("editor");
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              ref={searchRef}
              type="text"
              placeholder="議事録を検索… (タイトル・メモ内容)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 placeholder:text-gray-400 dark:placeholder:text-gray-600"
            />
          </div>
          <button
            onClick={handleNew}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors font-medium shrink-0"
          >
            <Plus className="w-4 h-4" />
            新規
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-sm text-gray-400 dark:text-gray-500">
            読み込み中…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-500 gap-2">
            <FileText className="w-8 h-8 opacity-30" />
            <p className="text-sm">
              {query ? "検索結果がありません" : "議事録がありません"}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((item) => {
              const isActive = item.id === meeting.id;
              return (
                <li
                  key={item.id}
                  onClick={() => handleOpen(item.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer group transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-400 dark:border-blue-500"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                  }`}
                >
                  <FileText className={`w-5 h-5 shrink-0 ${isActive ? "text-blue-400" : "text-gray-300 dark:text-gray-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? "text-blue-700 dark:text-blue-300" : "text-gray-800 dark:text-gray-200"}`}>
                      {item.title || "（無題）"}
                      {isActive && <span className="ml-2 text-xs text-blue-400 dark:text-blue-400 font-normal">編集中</span>}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {item.held_at && `${item.held_at} · `}
                      論点 {item.card_count}件 · 更新 {formatDate(item.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(item.id, e)}
                    className="p-1.5 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-colors rounded"
                    title="削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
