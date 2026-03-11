import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { Badge } from "./ui/Badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";
import { ConnectionIcon } from "./ui/Icons.js";

export function RuntimeHealthPanel() {
  const { connected, agentStatus, cloudCredits, plugins, autonomousEvents } =
    useApp();

  const activePluginsCount = useMemo(
    () => plugins.filter((p) => p.enabled).length,
    [plugins],
  );
  const runMode =
    agentStatus?.runMode ??
    agentStatus?.mode ??
    agentStatus?.autonomyMode ??
    (autonomousEvents.length > 0 ? "autonomous" : "chat");
  const provider =
    agentStatus?.provider ??
    agentStatus?.apiProvider ??
    agentStatus?.backend ??
    "local";

  return (
    <Card className="flex h-64 flex-col">
      <CardHeader className="border-b border-white/8 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-white/90">
            <ConnectionIcon width="16" height="16" />
            Runtime Health
          </CardTitle>
          <Badge
            variant="outline"
            className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
              connected ? "text-ok" : "text-warn"
            }`}
          >
            {connected ? "Connected" : "Offline"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 overflow-y-auto pt-4">
        {[
          ["Process State", agentStatus?.state || "unknown"],
          ["Provider", provider],
          ["Run Mode", String(runMode)],
          ["Active Model", agentStatus?.model || "unknown"],
          [
            "Credit Balance",
            cloudCredits !== null ? `$${cloudCredits.toFixed(2)}` : "N/A",
          ],
          ["Plugins Loaded", String(activePluginsCount)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/12 p-3"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</span>
            <span
              className="max-w-[12rem] truncate text-right text-xs font-medium text-white/88"
              title={value}
            >
              {value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
