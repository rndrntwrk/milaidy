import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { SectionEmptyState } from "./SectionStates.js";
import { Badge } from "./ui/Badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";
import { cn } from "./ui/utils.js";
import { buildPublicActionEntries } from "./shared/publicActionEntries.js";

export function CognitiveTracePanel({
  embedded = false,
  mode,
  className,
}: {
  embedded?: boolean;
  mode?: "card" | "content";
  className?: string;
}) {
  const { autonomousEvents } = useApp();
  const contentMode = mode === "content" || embedded;

  const traces = useMemo(
    () =>
      buildPublicActionEntries(autonomousEvents)
      .slice(-8)
      .reverse(),
    [autonomousEvents],
  );

  if (contentMode) {
    return traces.length === 0 ? (
      <SectionEmptyState
        title="No public activity"
        description="Public-safe action summaries will appear here once the agent starts working."
        className={cn(
          "pro-streamer-empty-compact border-dashed bg-transparent shadow-none",
          className,
        )}
      />
    ) : (
      <div
        className={cn("flex flex-col-reverse gap-1.5", className)}
        data-action-log-trace-list
      >
        {traces.map((event) => (
          <div key={event.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Badge variant={event.variant}>{event.title}</Badge>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/38">{event.timestamp}</span>
            </div>
            <div className="text-[11px] leading-relaxed text-white/76">{event.detail}</div>
          </div>
        ))}
      </div>
    );
  }

  const body = (
    <CardContent className="flex h-[calc(100%-72px)] flex-col-reverse gap-1.5 overflow-y-auto p-4">
      {traces.length === 0 ? (
        <SectionEmptyState
          title="No public actions yet"
          description="Public-safe activity summaries will appear here as the agent works."
          className="border-dashed bg-transparent shadow-none"
        />
      ) : (
        traces.map((event) => (
          <div key={event.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Badge variant={event.variant}>{event.title}</Badge>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/38">{event.timestamp}</span>
            </div>
            <div className="text-[11px] leading-relaxed text-white/76">{event.detail}</div>
          </div>
        ))
      )}
    </CardContent>
  );

  return (
    <Card className="h-full border-white/10 bg-black/48 shadow-[0_14px_44px_rgba(0,0,0,0.28)]">
      <CardHeader className="border-b border-white/8 pb-3">
        <CardTitle>Action Log</CardTitle>
      </CardHeader>
      {body}
    </Card>
  );
}
