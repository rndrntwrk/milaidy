import * as React from "react";
import { cn } from "./utils.js";

export function Dialog({
  open,
  onClose,
  children,
  className,
  ariaLabel,
  ariaLabelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-xl"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={cn(
          "w-full max-w-3xl rounded-[28px] border border-white/12 bg-[#090d14]/98 shadow-[0_24px_80px_rgba(0,0,0,0.62)] backdrop-blur-2xl",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
