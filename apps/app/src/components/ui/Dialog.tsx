/**
 * Accessible Dialog wrapper — provides focus trap, Escape handler, scroll lock,
 * and proper ARIA attributes for all modal/overlay components.
 */

import { useEffect, useRef, useCallback, type ReactNode } from "react";

/** Stack-safe scroll lock: only restore scroll when all dialogs have closed. */
let scrollLockCount = 0;

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** aria-label for the dialog (used when no visible title) */
  ariaLabel?: string;
  /** id of the element that labels this dialog */
  ariaLabelledBy?: string;
  /** Additional class names for the backdrop */
  backdropClassName?: string;
  /** Additional class names for the dialog panel */
  className?: string;
  /** If true, clicking outside does NOT close the dialog */
  persistent?: boolean;
}

export function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  backdropClassName = "",
  className = "",
  persistent = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save previous focus and lock scroll on open (stack-safe)
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    scrollLockCount++;
    document.body.style.overflow = "hidden";

    return () => {
      scrollLockCount--;
      if (scrollLockCount <= 0) {
        scrollLockCount = 0;
        document.body.style.overflow = "";
      }
      previousFocusRef.current?.focus();
    };
  }, [open]);

  // Auto-focus the dialog on open
  useEffect(() => {
    if (!open || !dialogRef.current) return;

    // Focus the first focusable element, or the dialog itself
    const focusable = dialogRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) {
      focusable.focus();
    } else {
      dialogRef.current.focus();
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    []
  );

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (!persistent && e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose, persistent]
  );

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 ${backdropClassName}`}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={className}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
