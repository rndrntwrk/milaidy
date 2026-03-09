/**
 * Accessible confirmation dialog — replaces window.confirm() and alert().
 */

import { useId } from "react";
import { Dialog } from "./Dialog.js";
import { Button } from "./Button.js";
import { Card } from "./Card.js";

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
  const titleId = useId();

  return (
    <Dialog open={open} onClose={onCancel} ariaLabelledBy={titleId}>
      <Card className="flex w-full max-w-sm flex-col overflow-hidden rounded-[28px] border-white/12 bg-[#07090e]/96 shadow-[0_24px_72px_rgba(0,0,0,0.36)]">
        <div className="px-5 py-4">
          <h2 id={titleId} className="mb-2 text-sm font-bold text-white">
            {title}
          </h2>
          <p className="text-[13px] leading-relaxed text-white/62">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
          <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "destructive" : "default"} size="sm" className="rounded-xl" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </Dialog>
  );
}
