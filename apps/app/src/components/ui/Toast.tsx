/**
 * Accessible toast notification — displays transient feedback messages
 * at the bottom-center of the viewport.
 */

import { useCallback } from "react";
import { useApp } from "../../AppContext.js";
import type { ProStreamerFeedbackTone } from "../../proStreamerFeedback.js";
import { CloseIcon } from "./Icons.js";

export interface ToastItem {
  id: string;
  text: string;
  tone: ProStreamerFeedbackTone;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const toneBg: Record<ToastItem["tone"], string> = {
  success: "bg-ok",
  error: "bg-danger",
  warning: "bg-warn",
  info: "bg-accent",
};

const miladyToneClasses: Record<ToastItem["tone"], string> = {
  success:
    "border-ok/24 bg-[linear-gradient(180deg,rgba(8,18,16,0.94),rgba(7,15,14,0.9))] text-white shadow-[0_18px_52px_rgba(0,0,0,0.34)]",
  error:
    "border-danger/24 bg-[linear-gradient(180deg,rgba(24,10,10,0.94),rgba(16,9,9,0.9))] text-white shadow-[0_18px_52px_rgba(0,0,0,0.34)]",
  warning:
    "border-warn/24 bg-[linear-gradient(180deg,rgba(28,20,8,0.96),rgba(22,15,7,0.92))] text-white shadow-[0_18px_52px_rgba(0,0,0,0.34)]",
  info:
    "border-accent/24 bg-[linear-gradient(180deg,rgba(19,14,8,0.96),rgba(14,10,7,0.92))] text-white shadow-[0_18px_52px_rgba(0,0,0,0.34)]",
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const { currentTheme } = useApp();
  const visible = toasts.slice(0, 3);

  const handleDismiss = useCallback(
    (id: string) => () => onDismiss(id),
    [onDismiss],
  );

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {visible.map((toast) => (
        currentTheme === "milady-os" ? (
          <div
            key={toast.id}
            className={`milady-drawer-scope flex w-[min(42rem,calc(100vw-2rem))] items-start gap-3 rounded-[24px] border px-4 py-3 backdrop-blur-2xl ${miladyToneClasses[toast.tone]}`}
          >
            <div
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                toast.tone === "success"
                  ? "bg-ok shadow-[0_0_18px_color-mix(in_srgb,var(--ok)_75%,transparent)]"
                  : toast.tone === "error"
                    ? "bg-danger shadow-[0_0_18px_color-mix(in_srgb,var(--danger)_75%,transparent)]"
                    : toast.tone === "warning"
                      ? "bg-warn shadow-[0_0_18px_color-mix(in_srgb,var(--warn)_75%,transparent)]"
                    : "bg-accent shadow-[0_0_18px_color-mix(in_srgb,var(--accent)_75%,transparent)]"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">
                {toast.tone === "success"
                  ? "Update"
                  : toast.tone === "error"
                    ? "Attention"
                    : toast.tone === "warning"
                      ? "Warning"
                    : "Notice"}
              </div>
              <div className="mt-1 text-sm leading-relaxed text-white/88">
                {toast.text}
              </div>
            </div>
            <button
              aria-label="Dismiss"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/18 text-white/72 transition hover:border-white/18 hover:text-white"
              onClick={handleDismiss(toast.id)}
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-2.5 text-xs text-white shadow-lg ${
              toneBg[toast.tone]
            }`}
          >
            <span>{toast.text}</span>
            <button
              aria-label="Dismiss"
              className="ml-1 cursor-pointer text-white/80 hover:text-white"
              onClick={handleDismiss(toast.id)}
            >
              x
            </button>
          </div>
        )
      ))}
    </div>
  );
}
