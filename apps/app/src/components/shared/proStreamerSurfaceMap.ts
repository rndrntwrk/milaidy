export type ProStreamerSurfaceOwner =
  | "stage"
  | "threads-drawer"
  | "memory-drawer"
  | "ops-drawer"
  | "asset-vault-drawer"
  | "action-log"
  | "mission-stack"
  | "control-stack";

export const PRO_STREAMER_SURFACE_MAP = [
  {
    capability: "conversation",
    owner: "stage",
    summary: "Chronological agent/operator/system conversation, composer, send-stop state, and latest execution context.",
  },
  {
    capability: "thread-management",
    owner: "threads-drawer",
    summary: "Full transcript, conversation switching, creation, and deletion.",
  },
  {
    capability: "memory-and-ingest",
    owner: "memory-drawer",
    summary: "Memory search, ingest state, upload/drop status, and knowledge jump-off surfaces.",
  },
  {
    capability: "ops-and-connectivity",
    owner: "ops-drawer",
    summary: "Cloud balance, extension relay, MCP status, channel connectivity, app shortcuts, and operator actions.",
  },
  {
    capability: "identity-and-wallets",
    owner: "asset-vault-drawer",
    summary: "Identity, avatar, wallet balances, addresses, chain state, and profile surfaces.",
  },
  {
    capability: "public-action-summary",
    owner: "action-log",
    summary: "Public-safe action lifecycle summaries, approval-required events, and connector updates.",
  },
  {
    capability: "missions-and-interventions",
    owner: "mission-stack",
    summary: "Approvals, triggers, active mission state, and the next operator-required intervention.",
  },
  {
    capability: "deep-configuration",
    owner: "control-stack",
    summary: "Settings, apps, plugins/connectors, runtime, logs, security, governance, trajectories, and other dense tools.",
  },
] as const;
