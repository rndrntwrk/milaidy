import { useEffect, useRef, useState } from "react";
import type { UiLanguage } from "../../i18n/messages";
import type { TranslatorFn } from "../companion/walletUtils";

/** Language metadata with flag emoji and native label. */
const LANGUAGES: { id: UiLanguage; flag: string; label: string }[] = [
  { id: "en", flag: "🇺🇸", label: "English" },
  { id: "zh-CN", flag: "🇨🇳", label: "中文" },
  { id: "ko", flag: "🇰🇷", label: "한국어" },
  { id: "es", flag: "🇪🇸", label: "Español" },
  { id: "pt", flag: "🇧🇷", label: "Português" },
];

export interface LanguageDropdownProps {
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  /** Optional translator for ARIA labels */
  t?: TranslatorFn;
  /** Optional extra className on the root */
  className?: string;
}

export function LanguageDropdown({
  uiLanguage,
  setUiLanguage,
  t,
  className,
}: LanguageDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const current = LANGUAGES.find((l) => l.id === uiLanguage) ?? LANGUAGES[0];

  return (
    <div
      ref={rootRef}
      className={`anime-lang-dropdown ${className ?? ""}`}
      data-testid="language-dropdown"
    >
      <button
        type="button"
        className={`anime-lang-dropdown-trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t?.("settings.language") ?? "Language"}
        data-testid="language-dropdown-trigger"
      >
        <span className="anime-lang-dropdown-flag">{current.flag}</span>
        <span className="anime-lang-dropdown-label">{current.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`anime-lang-dropdown-caret ${open ? "is-open" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          className="anime-lang-dropdown-menu"
          aria-label={t?.("settings.language") ?? "Language"}
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={lang.id === uiLanguage}
                className={`anime-lang-dropdown-item ${lang.id === uiLanguage ? "is-active" : ""}`}
                onClick={() => {
                  setUiLanguage(lang.id);
                  setOpen(false);
                }}
                data-testid={`language-option-${lang.id}`}
              >
                <span className="anime-lang-dropdown-item-flag">
                  {lang.flag}
                </span>
                <span className="anime-lang-dropdown-item-label">
                  {lang.label}
                </span>
                {lang.id === uiLanguage && (
                  <svg
                    className="anime-lang-dropdown-check"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
