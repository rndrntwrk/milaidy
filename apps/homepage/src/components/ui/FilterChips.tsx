export interface FilterChip<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = "filter",
}: {
  options: FilterChip<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <fieldset
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-black/20 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition ${
              active
                ? "bg-brand text-black shadow-[0_0_20px_rgba(240,185,11,0.28)]"
                : "text-white/60 hover:text-white"
            }`}
          >
            <span>{option.label}</span>
            {typeof option.count === "number" ? (
              <span
                className={`text-[10px] ${
                  active ? "text-black/60" : "text-white/40"
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
