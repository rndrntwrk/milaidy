import type { ReactNode } from "react";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { CloseIcon } from "./ui/Icons.js";
import { ScrollArea } from "./ui/ScrollArea.js";
import { cn } from "./ui/utils.js";

export function DrawerShell({
  icon,
  title,
  description,
  badge,
  onClose,
  toolbar,
  summary,
  contentClassName,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  badge?: ReactNode;
  onClose: () => void;
  toolbar?: ReactNode;
  summary?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#07090e]/94 backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/62">
              {icon}
              <span>{title}</span>
            </div>
            <div className="mt-1 text-sm leading-relaxed text-white/74">
              {description}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {typeof badge === "string" ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {badge}
              </Badge>
            ) : (
              badge
            )}
            <Button
              type="button"
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="rounded-2xl border border-white/10 bg-white/[0.04] text-white/58 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
              aria-label={`Close ${title.toLowerCase()}`}
            >
              <CloseIcon width="16" height="16" />
            </Button>
          </div>
        </div>
        {toolbar ? (
          <div className="border-t border-white/8 px-4 py-3">{toolbar}</div>
        ) : null}
        {summary ? (
          <div className="border-t border-white/8 bg-white/[0.03] px-4 py-3">
            {summary}
          </div>
        ) : null}
      </div>
      <ScrollArea className="drawer-shell__body min-h-0 flex-1 overscroll-contain">
        <div
          className={cn(
            "milady-drawer-scope space-y-4 p-4",
            contentClassName,
          )}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
