import { useEffect, useMemo } from "react";
import { useApp } from "../AppContext.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { SectionEmptyState } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";

export function ChannelsFeedsPanel() {
  const { logs, loadLogs, plugins, mcpServerStatuses, extensionStatus, setTab } = useApp();

  const telemetry = useMemo(() => {
    const errorCount = logs.filter((entry) => entry.level === "error").length;
    const warnCount = logs.filter((entry) => entry.level === "warn").length;
    const secureRelay = extensionStatus?.relayReachable ? "reachable" : "offline";
    const mcpLive = mcpServerStatuses.filter((server) => server.connected).length;
    return { errorCount, warnCount, secureRelay, mcpLive };
  }, [extensionStatus?.relayReachable, logs, mcpServerStatuses]);

  useEffect(() => {
    void loadLogs();
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const recentNotices = useMemo(
    () =>
      logs
        .filter((entry) => entry.level !== "debug")
        .slice(0, 6)
        .map((log) => ({
          id: `${log.timestamp}-${log.source}-${log.level}`,
          source: log.source,
          label:
            log.level === "error"
              ? "issue"
              : log.level === "warn"
                ? "attention"
                : "update",
          message: log.message,
          variant:
            log.level === "error"
              ? "destructive"
              : log.level === "warn"
                ? "warning"
                : "outline",
        })),
    [logs],
  );

  return (
    <SectionShell
      title="Notices"
      description="Recent connector and runtime notices."
      toolbar={
        telemetry.errorCount > 0 || telemetry.warnCount > 0 ? (
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px]">
            {telemetry.errorCount} errors / {telemetry.warnCount} warnings
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px]">
            Relay {telemetry.secureRelay}
          </Badge>
        )
      }
      contentClassName="gap-3"
    >
      <div className="space-y-2">
        {recentNotices.length === 0 ? (
          <SectionEmptyState
            title="No notices"
            description="Connector events and runtime notices will appear here when attention is needed."
            className="border-none bg-transparent shadow-none"
          />
        ) : null}
        {recentNotices.map((notice) => (
          <div
            key={notice.id}
            className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                {notice.source}
              </div>
              <Badge variant={notice.variant}>{notice.label}</Badge>
            </div>
            <div className="mt-2 line-clamp-2 text-sm text-white/68">
              {notice.message}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => setTab("logs")}>
          Open logs
        </Button>
        <Button variant="outline" className="justify-start rounded-2xl" onClick={() => setTab("security")}>
          Security
        </Button>
      </div>
    </SectionShell>
  );
}
