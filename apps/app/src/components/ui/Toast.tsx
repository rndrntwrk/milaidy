/**
 * Accessible toast notification — displays transient feedback messages
 * at the bottom-center of the viewport.
 */

import { useCallback } from "react";

export interface ToastItem {
  id: string;
  text: string;
  tone: "info" | "success" | "error";
  dismissedAt?: number;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const toneBg: Record<ToastItem["tone"], string> = {
  success: "bg-ok",
  error: "bg-danger",
  info: "bg-accent",
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
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
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-2.5 text-xs text-white shadow-lg transition-opacity ${
            toneBg[toast.tone]
          } ${toast.dismissedAt ? "opacity-0" : "opacity-100"}`}
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
      ))}
    </div>
  );
}
