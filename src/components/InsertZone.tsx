interface Props {
  onInsert: () => void;
}

export default function InsertZone({ onInsert }: Props) {
  return (
    <div
      className="group flex items-center gap-2 px-2 py-0.5 cursor-pointer"
      onClick={onInsert}
    >
      <div className="flex-1 h-px bg-gray-100 group-hover:bg-blue-200 transition-colors" />
      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-400 select-none flex items-center gap-1">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="2" x2="6" y2="10" />
          <line x1="2" y1="6" x2="10" y2="6" />
        </svg>
        追加
      </span>
      <div className="flex-1 h-px bg-gray-100 group-hover:bg-blue-200 transition-colors" />
    </div>
  );
}
