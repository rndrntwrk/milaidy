/**
 * Tag editor — add/remove string tags with chip display.
 */
import { useState } from "react";
import { useApp } from "../../AppContext";

export interface TagEditorProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  /** Label for the Add button, defaults to i18n "characterview.Add" */
  addLabel?: string;
  /** Label for the remove button, defaults to i18n "characterview.Times" */
  removeLabel?: string;
}

export function TagEditor({
  label,
  items,
  onChange,
  placeholder = "add item...",
  addLabel,
  removeLabel,
}: TagEditorProps) {
  const { t } = useApp();
  const [inputValue, setInputValue] = useState("");

  const addBtnLabel = addLabel ?? t("characterview.Add");
  const removeBtnLabel = removeLabel ?? t("characterview.Times");

  const addItem = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
    }
    setInputValue("");
  };

  const removeItem = (index: number) => {
    const updated = [...items];
    updated.splice(index, 1);
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-1.5 h-[220px]">
      <span className="font-semibold text-xs">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          className="px-2 py-1 border border-[var(--border)] bg-[var(--card)] text-[11px] focus:border-[var(--accent)] focus:outline-none flex-1 min-w-0"
        />
        <button
          type="button"
          className="text-[10px] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          onClick={addItem}
        >
          {addBtnLabel}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border border-[var(--border)] bg-[var(--bg-muted)] p-1.5 flex flex-wrap gap-1.5 content-start">
        {items.map((item, i) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--border)] bg-[var(--card)] text-[11px] h-fit"
          >
            {item}
            <button
              type="button"
              className="text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer text-[10px] leading-none"
              onClick={() => removeItem(i)}
            >
              {removeBtnLabel}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
