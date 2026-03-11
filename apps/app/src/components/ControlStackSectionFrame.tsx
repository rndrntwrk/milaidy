import type { ReactNode } from "react";
import { Badge } from "./ui/Badge.js";

export function ControlStackSectionFrame({
  title,
  description,
  badge,
  actions,
  children,
}: {
  title: string;
  description: string;
  badge?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="pro-streamer-section-frame">
        <div className="pro-streamer-section-frame__copy">
          <div className="pro-streamer-section-frame__title">{title}</div>
          <div className="pro-streamer-section-frame__description">{description}</div>
        </div>
        <div className="pro-streamer-section-frame__actions">
          {badge ? (
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {badge}
            </Badge>
          ) : null}
          {actions}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
