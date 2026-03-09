import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card.js";

function summarizePluginState(enabled: boolean, active: boolean, ready: boolean | null | undefined) {
  if (enabled && active && ready !== false) return { label: "live", tone: "text-ok" };
  if (enabled && (ready || ready === null)) return { label: "ready", tone: "text-accent" };
  if (enabled) return { label: "degraded", tone: "text-warn" };
  return { label: "offline", tone: "text-white/45" };
}

export function ActionDeckPanel() {
  const {
    plugins,
    mcpServerStatuses,
    extensionStatus,
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    setTab,
  } = useApp();

  const connectorCards = useMemo(() => {
    return [
      { label: "Discord", match: "discord" },
      { label: "Telegram", match: "telegram" },
      { label: "Twitter", match: "twitter" },
      { label: "Direct", match: "direct" },
    ].map((target) => {
      const plugin = plugins.find(
        (entry) =>
          entry.id.toLowerCase().includes(target.match) ||
          entry.name.toLowerCase().includes(target.match),
      );
      const state = summarizePluginState(
        Boolean(plugin?.enabled),
        Boolean(plugin?.enabled && plugin?.isActive),
        plugin?.ready,
      );
      return {
        label: target.label,
        summary: plugin?.statusSummary?.[0] ?? plugin?.loadError ?? state.label,
        state,
      };
    });
  }, [plugins]);

  const summary = useMemo(() => {
    const enabledConnectors = plugins.filter((plugin) => plugin.category === "connector" && plugin.enabled);
    const liveConnectors = enabledConnectors.filter((plugin) => plugin.isActive);
    const liveMcp = mcpServerStatuses.filter((server) => server.connected).length;
    return {
      enabledConnectors: enabledConnectors.length,
      liveConnectors: liveConnectors.length,
      apps: plugins.filter((plugin) => plugin.category === "app" && plugin.enabled).length,
      liveMcp,
      relayReachable: Boolean(extensionStatus?.relayReachable),
      cloudLabel:
        !cloudConnected || cloudCredits === null
          ? cloudConnected
            ? "connected"
            : "offline"
          : `$${cloudCredits.toFixed(2)}`,
      cloudTone: cloudCreditsCritical
        ? "text-danger"
        : cloudCreditsLow
          ? "text-warn"
          : cloudConnected
            ? "text-ok"
            : "text-white/45",
    };
  }, [cloudConnected, cloudCredits, cloudCreditsCritical, cloudCreditsLow, extensionStatus?.relayReachable, mcpServerStatuses, plugins]);

  return (
    <Card className="flex min-h-[16rem] flex-1 flex-col border-white/10 bg-black/32 shadow-none">
      <CardHeader className="border-b border-white/8 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm uppercase tracking-[0.22em] text-white/90">
            Ops overview
          </CardTitle>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em]">
            {summary.liveConnectors}/{summary.enabledConnectors} live
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
        <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.2em]">
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-white/45">
            <div>Cloud</div>
            <div className={`mt-1 text-sm ${summary.cloudTone}`}>{summary.cloudLabel}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-white/45">
            <div>Relay</div>
            <div className={`mt-1 text-sm ${summary.relayReachable ? "text-ok" : "text-warn"}`}>
              {summary.relayReachable ? "reachable" : "offline"}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-white/45">
            <div>MCP</div>
            <div className="mt-1 text-sm text-white/86">{summary.liveMcp} live</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-black/14 p-3 text-white/45">
            <div>Apps</div>
            <div className="mt-1 text-sm text-white/86">{summary.apps} enabled</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {connectorCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-white/8 bg-black/14 px-3 py-2"
            >
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                {card.label}
              </div>
              <div className={`mt-1 text-xs font-semibold uppercase ${card.state.tone}`}>
                {card.state.label}
              </div>
              <div className="mt-1 line-clamp-2 text-[11px] text-white/55">
                {card.summary}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => setTab("connectors")}>
            Connectors
          </Button>
          <Button variant="secondary" className="justify-start rounded-2xl" onClick={() => setTab("plugins")}>
            Plugins
          </Button>
          <Button variant="outline" className="justify-start rounded-2xl" onClick={() => setTab("actions")}>
            Actions
          </Button>
          <Button variant="outline" className="justify-start rounded-2xl" onClick={() => setTab("apps")}>
            Apps
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
