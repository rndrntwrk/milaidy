import type { ReactNode } from "react";
import { Badge } from "./ui/Badge";
import { ScrollArea } from "./ui/ScrollArea";
import { Button } from "./ui/Button";
import { CloseIcon } from "./ui/Icons";
import { cn } from "./ui/utils";

type DrawerShellProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  badge?: ReactNode;
  summary?: ReactNode;
  toolbar?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  contentClassName?: string;
};

export function DrawerShell({
  icon,
  title,
  description,
  badge,
  summary,
  toolbar,
  onClose,
  children,
  className,
  bodyClassName,
  contentClassName,
}: DrawerShellProps) {
  const normalizedBadge =
    typeof badge === "string" || typeof badge === "number" ? (
      <Badge variant="outline" className="rounded-full px-3 py-1">
        {badge}
      </Badge>
    ) : (
      badge
    );

  return (
    <div className={cn("pro-streamer-drawer-shell", className)}>
      <div className="pro-streamer-drawer-shell__header">
        <div className="pro-streamer-drawer-shell__heading">
          <h2 className="pro-streamer-drawer-shell__title">
            {icon ? <span className="pro-streamer-drawer-shell__icon">{icon}</span> : null}
            <span>{title}</span>
          </h2>
          {description ? (
            <p className="pro-streamer-drawer-shell__description">{description}</p>
          ) : null}
        </div>
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="pro-streamer-drawer-shell__close"
          >
            <CloseIcon width="16" height="16" />
          </Button>
        ) : null}
      </div>
      {normalizedBadge ? (
        <div className="pro-streamer-drawer-shell__badge-row">{normalizedBadge}</div>
      ) : null}
      {toolbar ? <div className="pro-streamer-drawer-shell__toolbar-row">{toolbar}</div> : null}
      {summary ? <div className="pro-streamer-drawer-shell__summary">{summary}</div> : null}
      <ScrollArea className={cn("pro-streamer-drawer-shell__body", bodyClassName, contentClassName)}>
        {children}
      </ScrollArea>
    </div>
  );
}
