import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { ActionDeckPanel } from "./ActionDeckPanel.js";
import { ChannelsFeedsPanel } from "./ChannelsFeedsPanel.js";
import { DrawerShell } from "./DrawerShell.js";
import { Badge } from "./ui/Badge.js";
import { Card } from "./ui/Card.js";
import { Sheet } from "./ui/Sheet.js";
import { OpsIcon } from "./ui/Icons.js";

export function OpsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    extensionStatus,
    mcpServerStatuses,
    plugins,
  } = useApp();

  const summaryCards = useMemo(() => {
    const liveChannels = plugins.filter(
      (plugin) => plugin.category === "connector" && plugin.enabled && plugin.isActive,
    ).length;
    const liveMcp = mcpServerStatuses.filter((server) => server.connected).length;
    return [
      {
        label: "Cloud",
        value:
          cloudConnected && cloudCredits !== null
            ? `$${cloudCredits.toFixed(2)}`
            : cloudConnected
              ? "connected"
              : "offline",
        tone: cloudCreditsCritical
          ? "text-danger"
          : cloudCreditsLow
            ? "text-warn"
            : cloudConnected
              ? "text-ok"
              : "text-white/45",
      },
      {
        label: "Relay",
        value: extensionStatus?.relayReachable ? "reachable" : "offline",
        tone: extensionStatus?.relayReachable ? "text-ok" : "text-warn",
      },
      {
        label: "MCP",
        value: `${liveMcp} live`,
        tone: liveMcp > 0 ? "text-white/88" : "text-white/45",
      },
      {
        label: "Channels",
        value: `${liveChannels} live`,
        tone: liveChannels > 0 ? "text-white/88" : "text-white/45",
      },
    ];
  }, [
    cloudConnected,
    cloudCredits,
    cloudCreditsCritical,
    cloudCreditsLow,
    extensionStatus?.relayReachable,
    mcpServerStatuses,
    plugins,
  ]);

  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-[min(38rem,100vw)]">
      <DrawerShell
        icon={<OpsIcon width="14" height="14" />}
        title="Ops"
        description="Connector state, operator shortcuts, channels, and runtime notices live here instead of on the broadcast stage."
        badge={
          <Badge variant="outline" className="rounded-full px-3 py-1">
            Live ops
          </Badge>
        }
        onClose={onClose}
        summary={
          <div className="grid gap-2 sm:grid-cols-4">
            {summaryCards.map((card) => (
              <Card key={card.label} className="rounded-2xl px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">
                  {card.label}
                </div>
                <div className={`mt-1 text-sm ${card.tone}`}>{card.value}</div>
              </Card>
            ))}
          </div>
        }
        contentClassName="space-y-4"
      >
          <ActionDeckPanel />
          <ChannelsFeedsPanel />
      </DrawerShell>
    </Sheet>
  );
}
