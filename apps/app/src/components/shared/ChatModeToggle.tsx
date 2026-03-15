import { useRenderGuard } from "@milady/app-core/hooks";
import { useApp } from "@milady/app-core/state";
import { memo } from "react";

export interface ChatModeToggleProps {
  variant?: "native" | "companion";
  showDescription?: boolean;
  showVoiceHint?: boolean;
  className?: string;
}

export const ChatModeToggle = memo(function ChatModeToggle({
  variant = "native",
  showDescription = false,
  showVoiceHint = false,
  className = "",
}: ChatModeToggleProps) {
  useRenderGuard("ChatModeToggle");
  const { chatMode, setState, t } = useApp();

  const isCompanion = variant === "companion";
  const activeButtonClass = isCompanion
    ? "bg-white text-black shadow-sm"
    : "bg-accent text-accent-fg shadow-sm";
  const inactiveButtonClass = isCompanion
    ? "text-white/65 hover:text-white hover:bg-white/10"
    : "text-muted hover:text-txt hover:bg-bg-hover";
  const helperText =
    chatMode === "power" ? t("chat.mode.proHint") : t("chat.mode.fastHint");

  return (
    <div
      className={`${isCompanion ? "inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-1 py-1 backdrop-blur-xl shadow-xl hover:border-white/20" : "flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-bg/60 px-3 py-2.5"} ${className}`.trim()}
      data-testid={`chat-mode-toggle-${variant}`}
    >
      {(showDescription || showVoiceHint) && (
        <div className="min-w-0 flex-1">
          {showDescription && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              {t("chat.mode.label")}
            </div>
          )}
          <p
            className="mt-0.5 text-[11px] leading-tight text-muted"
            data-testid={`chat-mode-copy-${variant}`}
          >
            {showDescription && <span>{helperText}</span>}
            {showDescription && showVoiceHint && <span> </span>}
            {showVoiceHint && <span>{t("chat.mode.voiceFast")}</span>}
          </p>
        </div>
      )}

      <fieldset
        className={`${isCompanion ? "inline-flex rounded-full bg-white/5 p-0.5" : "inline-flex rounded-full bg-bg-accent p-0.5"} shrink-0`}
      >
        <legend className="sr-only">{t("chat.mode.label")}</legend>
        <button
          type="button"
          className={`min-h-[32px] min-w-[56px] rounded-full px-3 text-[12px] font-medium transition-all ${chatMode === "simple" ? activeButtonClass : inactiveButtonClass}`}
          aria-pressed={chatMode === "simple"}
          title={t("chat.mode.fastHint")}
          onClick={() => setState("chatMode", "simple")}
          data-testid={`chat-mode-fast-${variant}`}
        >
          {t("chat.mode.fast")}
        </button>
        <button
          type="button"
          className={`min-h-[32px] min-w-[56px] rounded-full px-3 text-[12px] font-medium transition-all ${chatMode === "power" ? activeButtonClass : inactiveButtonClass}`}
          aria-pressed={chatMode === "power"}
          title={t("chat.mode.proHint")}
          onClick={() => setState("chatMode", "power")}
          data-testid={`chat-mode-pro-${variant}`}
        >
          {t("chat.mode.pro")}
        </button>
      </fieldset>
    </div>
  );
});
