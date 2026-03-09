import { useMemo } from "react";
import { useApp } from "../AppContext.js";
import { DrawerShell } from "./DrawerShell.js";
import { SectionEmptyState } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";
import { SummaryStatRow } from "./SummaryStatRow.js";
import { Button } from "./ui/Button.js";
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
    setTab,
  } = useApp();

  const summaryCards = useMemo(() => {
    const liveChannels = plugins.filter(
      (plugin) => plugin.category === "connector" && plugin.enabled && plugin.isActive,
    ).length;
    const liveMcp = mcpServerStatuses.filter((server) => server.connected).length;
    const relayLive = Boolean(extensionStatus?.relayReachable);
    return [
      {
        label: "Cloud",
        value:
          cloudConnected && cloudCredits !== null
            ? `$${cloudCredits.toFixed(2)}`
            : cloudConnected
              ? "connected"
              : "offline",
        tone: cloudCreditsCritical ? "danger" : cloudCreditsLow ? "warning" : cloudConnected ? "positive" : "default",
      },
      {
        label: "Relay",
        value: relayLive ? "online" : "offline",
        tone: relayLive ? "positive" : "default",
      },
      {
        label: "MCP",
        value: `${liveMcp} live`,
        tone: liveMcp > 0 ? "positive" : "default",
      },
      {
        label: "Channels",
        value: `${liveChannels} live`,
        tone: liveChannels > 0 ? "positive" : "default",
      },
    ];
  }, [cloudConnected, cloudCredits, cloudCreditsCritical, cloudCreditsLow, extensionStatus?.relayReachable, mcpServerStatuses, plugins]);

  const liveChannels = useMemo(
    () =>
      [
        ["discord", "Discord"],
        ["telegram", "Telegram"],
        ["twitter", "Twitter"],
        ["direct", "Direct"],
      ].map(([match, label]) => {
        const plugin = plugins.find(
          (entry) =>
            entry.category === "connector" &&
            (entry.id.toLowerCase().includes(match) || entry.name.toLowerCase().includes(match)),
        );
        return {
          label,
          active: Boolean(plugin?.enabled && plugin?.isActive),
          enabled: Boolean(plugin?.enabled),
        };
      }),
    [plugins],
  );

  const mcpLive = mcpServerStatuses.filter((server) => server.connected).length;
  const relayLive = Boolean(extensionStatus?.relayReachable);
  const quickLinks = [
    { label: "Connectors", tab: "connectors" },
    { label: "Plugins", tab: "plugins" },
    { label: "Actions", tab: "actions" },
    { label: "Apps", tab: "apps" },
  ] as const;

  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-[min(38rem,100vw)]">
      <DrawerShell
        icon={<OpsIcon width="14" height="14" />}
        title="Ops"
        description="Connections, channels, and quick operator actions."
        onClose={onClose}
        summary={<SummaryStatRow items={summaryCards} className="pro-streamer-drawer-summary-row" />}
        contentClassName="space-y-4"
      >
        <SectionShell
          title="Quick actions"
          description="Jump straight into the operator surfaces that matter most."
          contentClassName="gap-3"
        >
          <div className="pro-streamer-quick-grid">
            {quickLinks.map((link) => (
              <Button
                key={link.tab}
                type="button"
                variant="secondary"
                className="justify-start rounded-xl"
                onClick={() => {
                  setTab(link.tab);
                  onClose();
                }}
              >
                {link.label}
              </Button>
            ))}
          </div>
        </SectionShell>

        <SectionShell
          title="Channels"
          description="Broadcast-facing connectors and their current state."
          contentClassName="gap-3"
        >
          <div className="pro-streamer-status-grid">
            {liveChannels.map((channel) => (
              <div key={channel.label} className="pro-streamer-status-card">
                <div className="pro-streamer-status-card__label">{channel.label}</div>
                <div className={`pro-streamer-status-card__value ${channel.active ? "is-live" : ""}`}>
                  {channel.active ? "Live" : channel.enabled ? "Standby" : "Offline"}
                </div>
                <div className="pro-streamer-status-card__meta">
                  {channel.enabled ? "Installed" : "Not configured"}
                </div>
              </div>
            ))}
          </div>
          {liveChannels.every((channel) => !channel.enabled) ? (
            <SectionEmptyState
              title="No connectors configured"
              description="Configure channels in Connectors before putting them on stage."
              actionLabel="Open connectors"
              onAction={() => {
                setTab("connectors");
                onClose();
              }}
              className="border-none bg-transparent shadow-none"
            />
          ) : null}
        </SectionShell>
      </DrawerShell>
    </Sheet>
  );
}
