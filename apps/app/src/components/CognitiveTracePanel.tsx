import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { SectionEmptyState } from "./SectionStates.js";
import { Badge } from "./ui/Badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";
import { buildPublicActionEntries } from "./shared/publicActionEntries.js";

export function CognitiveTracePanel({ embedded = false }: { embedded?: boolean }) {
  const { autonomousEvents } = useApp();

  const traces = useMemo(
    () =>
      buildPublicActionEntries(autonomousEvents)
        .slice(-8)
        .reverse(),
    [autonomousEvents],
  );

  if (embedded) {
    return traces.length === 0 ? (
      <SectionEmptyState
        title="No public activity"
        description="Public-safe action summaries will appear here once the agent starts working."
        className="pro-streamer-empty-compact border-dashed bg-transparent shadow-none"
      />
    ) : (
      <div className="flex flex-col-reverse gap-2 overflow-y-auto px-0 pb-0 pt-3">
        {traces.map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant={event.variant}>{event.title}</Badge>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/38">{event.timestamp}</span>
            </div>
            <div className="text-xs leading-relaxed text-white/76">{event.detail}</div>
          </div>
        ))}
      </div>
    );
  }

  const body = (
    <CardContent className="flex h-[calc(100%-72px)] flex-col-reverse gap-2 overflow-y-auto p-4">
      {traces.length === 0 ? (
        <SectionEmptyState
          title="No public actions yet"
          description="Public-safe activity summaries will appear here as the agent works."
          className="border-dashed bg-transparent shadow-none"
        />
      ) : (
        traces.map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant={event.variant}>{event.title}</Badge>
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/38">{event.timestamp}</span>
            </div>
            <div className="text-xs leading-relaxed text-white/76">{event.detail}</div>
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
