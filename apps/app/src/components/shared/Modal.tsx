/**
 * Reusable modal shell — overlay with backdrop blur, close on Escape/outside click.
 */
import { X } from "lucide-react";
import type React from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Max width class override, defaults to "max-w-md" */
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${maxWidth} border border-border bg-card p-5 shadow-2xl rounded-lg`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-bold text-sm">{title}</div>
          <button
            type="button"
            className="text-muted hover:text-txt text-lg leading-none px-2 py-1 rounded-md hover:bg-bg-hover transition-colors"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
