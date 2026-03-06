/**
 * Accessible toast notification — displays transient feedback messages
 * at the bottom-center of the viewport.
 */

import { useCallback } from "react";

export interface ToastItem {
  id: string;
  text: string;
  tone: "info" | "success" | "error";
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
  const liveAnnouncement = visible.map((toast) => toast.text).join(" ");

  const handleDismiss = useCallback(
    (id: string) => () => onDismiss(id),
    [onDismiss],
  );

  return (
    <div className="fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2">
      <output aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </output>
      <ol className="flex flex-col items-center gap-2">
        {visible.map((toast) => (
          <li
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-2.5 text-xs text-white shadow-lg ${
              toneBg[toast.tone]
            }`}
          >
            <p>{toast.text}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="ml-1 cursor-pointer text-white/80 hover:text-white"
              onClick={handleDismiss(toast.id)}
            >
              x
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
