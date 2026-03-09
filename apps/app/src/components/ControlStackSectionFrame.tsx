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
      <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4 shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">
              Control Stack Section
            </div>
            <div className="mt-1 text-base font-semibold text-white/92">
              {title}
            </div>
            <div className="mt-1 max-w-3xl text-sm leading-relaxed text-white/68">
              {description}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {badge ? (
              <Badge
                variant="outline"
                className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]"
              >
                {badge}
              </Badge>
            ) : null}
            {actions}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
        {children}
      </div>
    </div>
  );
}
