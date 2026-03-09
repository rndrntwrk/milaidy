import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./utils.js";

type SheetSide = "left" | "right" | "bottom" | "full";

export function Sheet({
  open,
  onClose,
  side = "right",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const getFocusableElements = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
          ].join(","),
        ) ?? [],
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        dialogRef.current?.focus();
      }
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/58 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
        data-sheet-side={side}
        className={cn(
          "sheet-panel",
          "absolute flex max-h-full max-w-full overflow-hidden border border-white/10 bg-[#07090e]/92 shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl outline-none",
          side === "left" &&
            "inset-y-0 left-0 w-full border-r sm:bottom-3 sm:left-3 sm:top-3 sm:w-[min(34rem,calc(100vw-3rem))] sm:rounded-[28px] md:w-[min(38rem,calc(100vw-4rem))]",
          side === "right" &&
            "inset-y-0 right-0 w-full border-l sm:bottom-3 sm:right-3 sm:top-3 sm:w-[min(34rem,calc(100vw-3rem))] sm:rounded-[28px] md:w-[min(38rem,calc(100vw-4rem))]",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-[min(88vh,48rem)] border-t rounded-t-[28px] sm:inset-x-3 sm:bottom-3 sm:rounded-[28px] sm:border sm:border-white/10",
          side === "full" && "inset-0 sm:inset-3 sm:rounded-[32px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
