export type HyperscapeAutonomySessionState =
  | "created"
  | "wallet_ready"
  | "auth_ready"
  | "agent_starting"
  | "in_world"
  | "streaming"
  | "degraded"
  | "failed"
  | "stopped";

export type HyperscapeWalletType = "evm" | "solana";

export type HyperscapeWalletSource = "existing_agent_wallet" | "managed_signer";

export interface HyperscapeWalletProvenance {
  agentId: string;
  walletAddress: string;
  walletType: HyperscapeWalletType;
  source: HyperscapeWalletSource;
  createdAt: string;
  lastUsedAt: string;
}

export interface HyperscapeAutonomyActionRecord {
  at: string;
  type: string;
  detail: string;
}

export interface HyperscapeAutonomyStreamStatus {
  sessionId: string | null;
  startedAt: string | null;
  interruptions: number;
  recoveryAttempts: number;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface HyperscapeAutonomySession {
  sessionId: string;
  agentId: string;
  state: HyperscapeAutonomySessionState;
  goal: string | null;
  streamProfile: Record<string, unknown> | null;
  walletAddress: string | null;
  walletType: HyperscapeWalletType | null;
  walletSource: HyperscapeWalletSource | null;
  characterId: string | null;
  embeddedAgentId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  stateChangedAt: string;
  startedAt: string | null;
  inWorldAt: string | null;
  firstActionAt: string | null;
  streamStartedAt: string | null;
  stoppedAt: string | null;
  retryCount: number;
  recoveries: number;
  actionHistory: HyperscapeAutonomyActionRecord[];
  stream: HyperscapeAutonomyStreamStatus | null;
}

export interface CreateHyperscapeAutonomySessionInput {
  agentId: string;
  goal?: string;
  streamProfile?: Record<string, unknown>;
}

export interface CreateHyperscapeAutonomySessionResult {
  sessionId: string;
  walletAddress: string | null;
  characterId: string | null;
  state: HyperscapeAutonomySessionState;
  session: HyperscapeAutonomySession;
}

export interface HyperscapeAutonomySessionResult {
  session: HyperscapeAutonomySession;
}

export interface HyperscapeAutonomyEvent {
  type: "hyperscape-autonomy";
  event: "session-update";
  session: HyperscapeAutonomySession;
}
