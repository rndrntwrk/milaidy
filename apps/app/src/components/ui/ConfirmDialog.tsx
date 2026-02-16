/**
 * Accessible confirmation dialog — replaces window.confirm() and alert().
 */

import { Dialog } from "./Dialog.js";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass =
    tone === "danger"
      ? "bg-danger text-destructive-fg hover:opacity-90"
      : "bg-accent text-accent-fg hover:opacity-90";

  return (
    <Dialog open={open} onClose={onCancel} ariaLabelledBy="confirm-dialog-title">
      <div className="w-full max-w-sm border border-border bg-card shadow-lg flex flex-col overflow-hidden">
        <div className="px-5 py-4">
          <h2 id="confirm-dialog-title" className="text-sm font-bold text-txt mb-2">
            {title}
          </h2>
          <p className="text-[13px] text-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            className="px-3 py-1.5 text-xs border border-border text-muted hover:text-txt cursor-pointer"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`px-3 py-1.5 text-xs border border-transparent cursor-pointer ${confirmClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
