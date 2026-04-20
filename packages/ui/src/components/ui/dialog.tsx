import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Z_DIALOG, Z_DIALOG_OVERLAY } from "../../lib/floating-layers";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Backdrop blur is intentional: the operator companion view puts chat
      // bubbles, the VRM avatar, and live scene overlays *behind* modals, and
      // bg-black/80 alone let bright scene content (speech bubbles, avatar
      // colors) read through the dim. The blur turns the leftover 20% of the
      // scene into unreadable shapes so the modal content wins visually.
      `fixed inset-0 z-[${Z_DIALOG_OVERLAY}] bg-black/80 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`,
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// ── Open-dialog tracking for app-wide scene suppression ───────────────
// Ref-counted on `window.__MILADY_OPEN_DIALOG_COUNT__` so nested dialogs
// (e.g. a Dialog inside a Drawer) don't clear the marker early on unmount
// while a sibling is still open. We expose a simple body dataset attribute
// — `body[data-milady-dialog-open="true"]` — that app CSS can hang hide
// rules off for scene chrome that otherwise leaks above the Dialog overlay
// on the companion view (chat dock, stage rail, etc.).
//
// We intentionally avoid keying off `document.body[data-scroll-locked]`
// which Radix sets from other primitives (Popover, Drawer) and would
// trigger unrelated hide bugs.
type MiladyDialogTrackingWindow = typeof window & {
  __MILADY_OPEN_DIALOG_COUNT__?: number;
};

function useDialogOpenBodyAttr(): void {
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    const w = window as MiladyDialogTrackingWindow;
    const prev = w.__MILADY_OPEN_DIALOG_COUNT__ ?? 0;
    const next = prev + 1;
    w.__MILADY_OPEN_DIALOG_COUNT__ = next;
    document.body.dataset.miladyDialogOpen = "true";
    return () => {
      const current = w.__MILADY_OPEN_DIALOG_COUNT__ ?? 0;
      const remaining = Math.max(0, current - 1);
      w.__MILADY_OPEN_DIALOG_COUNT__ = remaining;
      if (remaining === 0) {
        delete document.body.dataset.miladyDialogOpen;
      }
    };
  }, []);
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Portal to a specific DOM element (e.g. document.body) to escape 3D-transform stacking contexts */
    container?: HTMLElement | null;
    /** Hide the default top-right close button when the consumer renders its own close affordance. */
    showCloseButton?: boolean;
  }
>(({ className, children, container, showCloseButton = true, ...props }, ref) => {
  // Effect runs for the lifetime of this DialogContent — which maps to the
  // Dialog being open (DialogContent is only mounted when Radix's Portal is
  // open, so we don't need to thread open-state through props).
  useDialogOpenBodyAttr();

  return (
    <DialogPortal container={container}>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          `fixed left-[50%] top-[50%] z-[${Z_DIALOG}] grid w-[min(calc(100vw-1.5rem),42rem)] max-h-[min(calc(100dvh-1.5rem-var(--safe-area-top,0px)-var(--safe-area-bottom,0px)),44rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-[1.125rem] border border-border/70 bg-bg p-5 shadow-[0_24px_70px_rgba(2,8,23,0.24)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:p-6`,
          "max-sm:left-1/2 max-sm:top-auto max-sm:bottom-[max(0.75rem,var(--safe-area-bottom,0px))] max-sm:max-h-[min(calc(100dvh-1rem-var(--safe-area-top,0px)-var(--safe-area-bottom,0px)),42rem)] max-sm:w-[min(calc(100vw-1rem),42rem)] max-sm:translate-y-0 max-sm:rounded-[1.25rem] max-sm:data-[state=closed]:slide-out-to-bottom-6 max-sm:data-[state=open]:slide-in-from-bottom-6",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-bg transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-accent-fg">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-border/40 pt-4 sm:flex-row sm:justify-end sm:pt-5",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
