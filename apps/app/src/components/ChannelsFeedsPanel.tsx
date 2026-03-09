import { useEffect, useMemo } from "react";
import { useApp } from "../AppContext.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";

export function ChannelsFeedsPanel() {
  const { logs, loadLogs, plugins, mcpServerStatuses, extensionStatus, setTab } = useApp();

  const channelStates = useMemo(
    () =>
      [
        ["Discord", "discord"],
        ["Telegram", "telegram"],
        ["Twitter", "twitter"],
        ["Direct", "direct"],
      ].map(([label, match]) => {
        const plugin = plugins.find(
          (entry) =>
            entry.id.toLowerCase().includes(match) ||
            entry.name.toLowerCase().includes(match),
        );
        const enabled = Boolean(plugin?.enabled);
        const active = Boolean(plugin?.enabled && plugin?.isActive);
        return {
          label,
          state: active ? "live" : enabled ? "standby" : "offline",
        };
      }),
    [plugins],
  );

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
    <Card className="flex min-h-[16rem] flex-1 flex-col border-white/10 bg-black/32 shadow-none">
      <CardHeader className="border-b border-white/8 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm uppercase tracking-[0.22em] text-white/90">
            Channels & notices
          </CardTitle>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            {telemetry.errorCount} errors / {telemetry.warnCount} warnings
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        <div className="grid grid-cols-2 gap-2">
          {channelStates.map((channel) => (
            <div
              key={channel.label}
              className="rounded-2xl border border-white/8 bg-black/14 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                {channel.label}
              </div>
              <div
                className={`mt-1 text-xs font-semibold uppercase ${
                  channel.state === "live"
                    ? "text-ok"
                    : channel.state === "standby"
                      ? "text-accent"
                      : "text-white/45"
                }`}
              >
                {channel.state}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.2em]">
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-white/45">
            <div>Security relay</div>
            <div className={`mt-1 text-sm ${telemetry.secureRelay === "reachable" ? "text-ok" : "text-warn"}`}>
              {telemetry.secureRelay}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-white/45">
            <div>MCP links</div>
            <div className="mt-1 text-sm text-white/85">{telemetry.mcpLive} connected</div>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {recentNotices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-3 py-4 text-center text-sm text-white/40">
              No operational notices right now.
            </div>
          ) : null}
          {recentNotices.map((notice) => (
            <div
              key={notice.id}
              className="rounded-2xl border border-white/8 bg-black/10 px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
                  {notice.source}
                </div>
                <Badge variant={notice.variant}>{notice.label}</Badge>
              </div>
              <div className="mt-2 line-clamp-2 text-xs text-white/65">
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
      </CardContent>
    </Card>
  );
}
