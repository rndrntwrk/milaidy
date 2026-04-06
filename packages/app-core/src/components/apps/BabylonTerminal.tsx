/**
 * Babylon Agent Terminal — custom right-side panel for the Babylon app.
 *
 * Shows real-time agent activity, team status, wallet, and logs in a
 * terminal-like interface. Replaces the generic logs panel when Babylon
 * is the active game.
 */

import { Button, Input } from "@miladyai/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  client,
  type BabylonActivityItem,
  type BabylonAgentStatus,
  type BabylonLogEntry,
  type BabylonTeamAgent,
  type BabylonWallet,
} from "../../api";
import { useIntervalWhenDocumentVisible } from "../../hooks";
import { useBabylonSSE } from "../../hooks/useBabylonSSE";
import { formatTime } from "../../utils/format";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabId = "activity" | "team" | "wallet" | "logs";

const ACTIVITY_ICON: Record<string, string> = {
  trade: "\u{1F4C8}",
  post: "\u{1F4AC}",
  comment: "\u{1F4DD}",
  message: "\u{2709}\u{FE0F}",
  social: "\u{1F465}",
};

const LOG_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "trade", label: "Trade" },
  { value: "chat", label: "Chat" },
  { value: "post", label: "Post" },
  { value: "error", label: "Error" },
  { value: "system", label: "System" },
];

const LOG_LEVEL_OPTIONS = [
  { value: "", label: "All" },
  { value: "error", label: "Error" },
  { value: "warn", label: "Warn" },
  { value: "info", label: "Info" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPnL(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}

function formatBalance(value: number): string {
  return `$${value.toFixed(2)}`;
}

function summarizeActivity(item: BabylonActivityItem): string {
  if (item.summary) return item.summary;
  switch (item.type) {
    case "trade": {
      const side = item.side ?? item.action ?? "trade";
      const ticker = item.ticker ?? item.marketId ?? "unknown";
      const amount = item.amount != null ? ` $${item.amount.toFixed(2)}` : "";
      return `${side} ${ticker}${amount}`;
    }
    case "post":
      return item.contentPreview ?? "Posted an update";
    case "comment":
      return item.contentPreview ?? "Left a comment";
    case "message":
      return item.contentPreview ?? "Sent a message";
    default:
      return "Activity";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AutonomyToggles({
  agent,
  onToggleAll,
}: {
  agent: BabylonAgentStatus;
  onToggleAll: () => void;
}) {
  const flags = [
    { key: "trading", on: agent.autonomousTrading ?? agent.autonomous },
    { key: "posting", on: agent.autonomousPosting ?? agent.autonomous },
    { key: "comments", on: agent.autonomousCommenting ?? agent.autonomous },
    { key: "DMs", on: agent.autonomousDMs ?? agent.autonomous },
  ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {flags.map((f) => (
        <span
          key={f.key}
          className={`text-[8px] px-1 py-px rounded ${f.on ? "bg-green-400/15 text-green-400" : "bg-gray-500/15 text-gray-500"}`}
        >
          {f.key}
        </span>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="h-4 text-[8px] px-1 py-0 ml-auto"
        onClick={onToggleAll}
      >
        {agent.autonomous ? "Pause All" : "Resume All"}
      </Button>
    </div>
  );
}

function AgentStatusHeader({
  agent,
  sseConnected,
  onToggle,
}: {
  agent: BabylonAgentStatus | null;
  sseConnected: boolean;
  onToggle: () => void;
}) {
  if (!agent) {
    return (
      <div className="px-3 py-3 border-b border-border">
        <div className="text-xs text-muted italic">
          Connecting to Babylon...
        </div>
      </div>
    );
  }

  const pnlColor =
    agent.lifetimePnL >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="px-3 py-2 border-b border-border space-y-1.5">
      {/* Agent name + connection */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${sseConnected ? "bg-green-400" : "bg-yellow-400"}`}
          title={sseConnected ? "Live" : "Polling"}
        />
        <span className="font-bold text-xs text-txt truncate">
          {agent.displayName ?? agent.name}
        </span>
        {agent.agentStatus && agent.agentStatus !== "active" ? (
          <span className="text-[9px] px-1 py-px rounded bg-red-400/15 text-red-400">
            {agent.agentStatus}
          </span>
        ) : null}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-mono text-txt">{formatBalance(agent.balance)}</span>
        <span className={`font-mono ${pnlColor}`}>{formatPnL(agent.lifetimePnL)}</span>
        <span className="text-muted">{(agent.winRate * 100).toFixed(0)}%W</span>
        <span className="text-muted">{agent.totalTrades}T</span>
        <span className="text-muted">R{agent.reputationScore}</span>
      </div>

      {/* Autonomy controls */}
      <AutonomyToggles agent={agent} onToggleAll={onToggle} />
    </div>
  );
}

function ActivityFeed({
  items,
  loading,
}: {
  items: BabylonActivityItem[];
  loading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (loading && items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted italic">
        Loading activity...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted italic">
        No agent activity yet
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      {items.map((item, idx) => {
        const icon = ACTIVITY_ICON[item.type] ?? "\u{2022}";
        const pnlBadge =
          item.type === "trade" && item.pnl != null ? (
            <span
              className={`text-[9px] font-mono ml-1 ${item.pnl >= 0 ? "text-green-400" : "text-red-400"}`}
            >
              {formatPnL(item.pnl)}
            </span>
          ) : null;

        return (
          <div
            key={item.id ?? `${item.timestamp}-${idx}`}
            className="px-3 py-1.5 border-b border-border/50 hover:bg-card/50"
          >
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] flex-shrink-0">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted flex-shrink-0">
                    {formatTime(
                      typeof item.timestamp === "string"
                        ? new Date(item.timestamp).getTime()
                        : item.timestamp,
                      { fallback: "\u2014" },
                    )}
                  </span>
                  <span className="text-[9px] uppercase text-muted font-semibold flex-shrink-0">
                    {item.type}
                  </span>
                  {pnlBadge}
                  {item.agent?.name ? (
                    <span className="text-[9px] text-blue-400 truncate">
                      @{item.agent.name}
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-txt break-all leading-tight">
                  {summarizeActivity(item)}
                </div>
                {item.reasoning ? (
                  <div className="text-[10px] text-muted italic mt-0.5 leading-tight">
                    {item.reasoning.length > 80
                      ? `${item.reasoning.slice(0, 80)}...`
                      : item.reasoning}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamView({
  agents,
  loading,
  onMention,
}: {
  agents: BabylonTeamAgent[];
  loading: boolean;
  onMention: (name: string) => void;
}) {
  if (loading && agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted italic">
        Loading team...
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted italic p-4">
        <div className="text-center">
          <div>No team agents found</div>
          <div className="text-[10px] mt-1">
            Create agents in Babylon to build your team
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-3 py-1 border-b border-border text-[9px] text-muted font-semibold uppercase tracking-wider">
        {agents.length} Agent{agents.length !== 1 ? "s" : ""}
      </div>
      {agents.map((agent) => {
        const pnlColor =
          agent.lifetimePnL >= 0 ? "text-green-400" : "text-red-400";
        const statusColor = agent.autonomous ? "bg-green-400" : "bg-gray-400";

        return (
          <div
            key={agent.id}
            className="px-3 py-2 border-b border-border/50 hover:bg-card/50 cursor-pointer"
            onClick={() => onMention(agent.name)}
            title={`Click to @mention ${agent.name}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor}`}
              />
              <span className="font-semibold text-[11px] text-txt truncate">
                {agent.displayName ?? agent.name}
              </span>
              <span className="flex-1" />
              <span
                className={`text-[9px] px-1 py-px rounded ${agent.autonomous ? "bg-green-400/15 text-green-400" : "bg-gray-400/15 text-gray-400"}`}
              >
                {agent.autonomous ? "Auto" : "Paused"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] mt-0.5 pl-3.5">
              <span className="font-mono text-muted">
                {formatBalance(agent.balance)}
              </span>
              <span className={`font-mono ${pnlColor}`}>
                {formatPnL(agent.lifetimePnL)}
              </span>
              <span className="text-muted">
                {(agent.winRate * 100).toFixed(0)}%
              </span>
              <span className="text-muted">{agent.totalTrades}T</span>
            </div>
            {(agent.recentErrorsCount ?? 0) > 0 ? (
              <div className="text-[9px] text-red-400 pl-3.5 mt-0.5">
                {agent.recentErrorsCount} recent error
                {agent.recentErrorsCount === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function WalletView({
  wallet,
  loading,
}: {
  wallet: BabylonWallet | null;
  loading: boolean;
}) {
  if (loading && !wallet) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted italic">
        Loading wallet...
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-muted italic">
        Wallet not available
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <div className="text-[10px] text-muted">Balance</div>
        <div className="text-lg font-bold font-mono text-txt">
          {formatBalance(wallet.balance)}
        </div>
      </div>
      <div className="px-3 py-1 border-b border-border text-[9px] text-muted font-semibold uppercase tracking-wider">
        Recent Transactions
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {wallet.transactions.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted italic">
            No transactions yet
          </div>
        ) : (
          wallet.transactions.map((tx) => (
            <div
              key={tx.id}
              className="px-3 py-1.5 border-b border-border/50 flex items-center gap-2"
            >
              <span
                className={`font-mono text-[10px] ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {tx.amount >= 0 ? "+" : ""}
                {tx.amount.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted truncate flex-1">
                {tx.type}
              </span>
              <span className="text-[9px] text-muted flex-shrink-0">
                {formatTime(new Date(tx.timestamp).getTime(), {
                  fallback: "\u2014",
                })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LogsView({
  logs,
  loading,
  logType,
  logLevel,
  onTypeChange,
  onLevelChange,
}: {
  logs: BabylonLogEntry[];
  loading: boolean;
  logType: string;
  logLevel: string;
  onTypeChange: (v: string) => void;
  onLevelChange: (v: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        <select
          value={logType}
          onChange={(e) => onTypeChange(e.target.value)}
          className="h-5 text-[9px] bg-bg border border-border rounded px-1 text-txt"
        >
          {LOG_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={logLevel}
          onChange={(e) => onLevelChange(e.target.value)}
          className="h-5 text-[9px] bg-bg border border-border rounded px-1 text-txt"
        >
          {LOG_LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 text-[10px] font-mono">
        {loading && logs.length === 0 ? (
          <div className="text-center py-4 text-muted italic">
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-4 text-muted italic">
            No logs found
          </div>
        ) : (
          logs.slice(0, 100).map((entry, idx) => (
            <div
              key={entry.id ?? `${entry.timestamp}-${idx}`}
              className="py-0.5 border-b border-border/30"
            >
              <span className="text-muted">
                {formatTime(new Date(entry.timestamp).getTime(), {
                  fallback: "\u2014",
                })}
              </span>{" "}
              <span
                className={`font-semibold uppercase ${
                  entry.level === "error"
                    ? "text-red-400"
                    : entry.level === "warn"
                      ? "text-yellow-400"
                      : "text-muted"
                }`}
              >
                {entry.level}
              </span>{" "}
              <span className="text-blue-400">[{entry.type}]</span>{" "}
              <span className="text-txt">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface BabylonTerminalProps {
  appName: string;
}

export function BabylonTerminal({ appName: _appName }: BabylonTerminalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("activity");
  const [agentStatus, setAgentStatus] = useState<BabylonAgentStatus | null>(
    null,
  );
  const [activityItems, setActivityItems] = useState<BabylonActivityItem[]>([]);
  const [teamAgents, setTeamAgents] = useState<BabylonTeamAgent[]>([]);
  const [wallet, setWallet] = useState<BabylonWallet | null>(null);
  const [logs, setLogs] = useState<BabylonLogEntry[]>([]);
  const [logType, setLogType] = useState("");
  const [logLevel, setLogLevel] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // SSE for real-time updates
  const apiBase = useMemo(() => {
    const loc = window.location;
    return `${loc.protocol}//${loc.host}`;
  }, []);
  const sse = useBabylonSSE(apiBase, true);

  // Merge SSE items with polled items
  const mergedActivity = useMemo(() => {
    if (sse.items.length === 0) return activityItems;
    const sseIds = new Set(sse.items.map((i) => i.id).filter(Boolean));
    const deduped = activityItems.filter((i) => !i.id || !sseIds.has(i.id));
    return [...sse.items, ...deduped].slice(0, 100);
  }, [sse.items, activityItems]);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await client.getBabylonAgentStatus();
      setAgentStatus(status);
    } catch {
      /* keep stale */
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const feed = await client.getBabylonAgentActivity({ limit: 50 });
      setActivityItems(feed.items ?? []);
    } catch {
      /* keep stale */
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  const fetchTeam = useCallback(async () => {
    setLoadingTeam(true);
    try {
      const response = await client.getBabylonTeam();
      setTeamAgents(response.agents ?? []);
    } catch {
      /* keep stale */
    } finally {
      setLoadingTeam(false);
    }
  }, []);

  const fetchWallet = useCallback(async () => {
    setLoadingWallet(true);
    try {
      const w = await client.getBabylonAgentWallet();
      setWallet(w);
    } catch {
      /* keep stale */
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const entries = await client.getBabylonAgentLogs({
        type: logType || undefined,
        level: logLevel || undefined,
      });
      setLogs(Array.isArray(entries) ? entries : []);
    } catch {
      /* keep stale */
    } finally {
      setLoadingLogs(false);
    }
  }, [logType, logLevel]);

  // Initial load
  useEffect(() => {
    void fetchStatus();
    void fetchActivity();
  }, [fetchStatus, fetchActivity]);

  // Load tab-specific data on switch
  useEffect(() => {
    if (activeTab === "team") void fetchTeam();
    if (activeTab === "wallet") void fetchWallet();
    if (activeTab === "logs") void fetchLogs();
  }, [activeTab, fetchTeam, fetchWallet, fetchLogs]);

  // Poll every 5s
  useIntervalWhenDocumentVisible(
    () => {
      void fetchStatus();
      if (activeTab === "activity") void fetchActivity();
      if (activeTab === "team") void fetchTeam();
      if (activeTab === "wallet") void fetchWallet();
      if (activeTab === "logs") void fetchLogs();
    },
    5_000,
    true,
  );

  const handleToggle = useCallback(async () => {
    try {
      await client.toggleBabylonAgent("toggle");
      void fetchStatus();
    } catch {
      /* silent */
    }
  }, [fetchStatus]);

  const handleSendChat = useCallback(async () => {
    const content = chatInput.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await client.sendBabylonTeamChat(content);
      setChatInput("");
      setTimeout(() => void fetchActivity(), 1_500);
    } catch {
      /* silent */
    } finally {
      setSending(false);
    }
  }, [chatInput, sending, fetchActivity]);

  const handleMention = useCallback((name: string) => {
    setChatInput((prev) => {
      const mention = `@${name} `;
      return prev.includes(mention) ? prev : `${mention}${prev}`;
    });
  }, []);

  const tabClass = (tab: TabId) =>
    `h-6 text-[10px] px-2 py-0 ${activeTab === tab ? "bg-accent text-accent-foreground" : "bg-card hover:border-accent"}`;

  return (
    <div className="w-96 border-l border-border bg-card flex flex-col min-h-0">
      {/* Agent status header */}
      <AgentStatusHeader
        agent={agentStatus}
        sseConnected={sse.connected}
        onToggle={handleToggle}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          className={tabClass("activity")}
          onClick={() => setActiveTab("activity")}
        >
          Activity
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={tabClass("team")}
          onClick={() => setActiveTab("team")}
        >
          Team{teamAgents.length > 0 ? ` (${teamAgents.length})` : ""}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={tabClass("wallet")}
          onClick={() => setActiveTab("wallet")}
        >
          Wallet
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={tabClass("logs")}
          onClick={() => setActiveTab("logs")}
        >
          Logs
        </Button>
      </div>

      {/* Tab content */}
      {activeTab === "activity" && (
        <ActivityFeed items={mergedActivity} loading={loadingActivity} />
      )}
      {activeTab === "team" && (
        <TeamView
          agents={teamAgents}
          loading={loadingTeam}
          onMention={handleMention}
        />
      )}
      {activeTab === "wallet" && (
        <WalletView wallet={wallet} loading={loadingWallet} />
      )}
      {activeTab === "logs" && (
        <LogsView
          logs={logs}
          loading={loadingLogs}
          logType={logType}
          logLevel={logLevel}
          onTypeChange={setLogType}
          onLevelChange={setLogLevel}
        />
      )}

      {/* Command input — always visible */}
      <div className="flex items-center gap-2 px-2 py-2 border-t border-border">
        <Input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !sending) {
              e.preventDefault();
              handleSendChat();
            }
          }}
          placeholder="Command your team..."
          className="flex-1 h-7 text-xs bg-bg focus-visible:ring-accent"
          disabled={sending}
        />
        <Button
          variant="default"
          size="sm"
          onClick={handleSendChat}
          disabled={sending || !chatInput.trim()}
          className="h-7 text-xs shadow-sm font-bold"
        >
          {sending ? "..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
