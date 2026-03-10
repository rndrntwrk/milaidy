/**
 * Themed select — custom dropdown with grouped options.
 */
import { useEffect, useRef, useState } from "react";

export interface SelectGroup<T extends string = string> {
  label: string;
  items: { id: T; text: string; hint?: string }[];
}

export interface ThemedSelectProps<T extends string = string> {
  value: T | null;
  groups: SelectGroup<T>[];
  onChange: (id: T) => void;
  placeholder?: string;
}

export function ThemedSelect<T extends string>({
  value,
  groups,
  onChange,
  placeholder = "select...",
}: ThemedSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Find current label
  let currentLabel = placeholder;
  for (const g of groups) {
    const found = g.items.find((i) => i.id === value);
    if (found) {
      currentLabel = found.hint ? `${found.text} — ${found.hint}` : found.text;
      break;
    }
  }

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs text-left cursor-pointer hover:border-[var(--accent)] transition-colors focus:border-[var(--accent)] focus:outline-none"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{currentLabel}</span>
        <span
          className={`ml-2 text-[10px] text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          &#9660;
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-[280px] overflow-y-auto border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-2.5 py-1 text-[10px] font-semibold text-[var(--muted)] bg-[var(--bg-muted)] sticky top-0">
                {g.label}
              </div>
              {g.items.map((item) => {
                const active = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full text-left px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--text)] hover:bg-[var(--bg-muted)]"
                    }`}
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="font-semibold">{item.text}</span>
                    {item.hint && (
                      <span
                        className={`ml-1.5 ${active ? "opacity-70" : "text-[var(--muted)]"}`}
                      >
                        {item.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
