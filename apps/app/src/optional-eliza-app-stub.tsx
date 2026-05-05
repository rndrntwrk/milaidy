import type {
  CompanionSceneStatus,
  VincentStateHookArgs,
  VincentStateHookResult,
} from "@elizaos/app-core";
import type { ComponentType } from "react";
import * as THREE from "three";

const EmptyComponent: ComponentType = () => null;

export const CompanionShell = EmptyComponent;
export const GlobalEmoteOverlay = EmptyComponent;
export const InferenceCloudAlertButton = EmptyComponent;
export const LifeOpsActivitySignalsEffect = EmptyComponent;
export const AppBlockerSettingsCard = EmptyComponent;
export const LifeOpsBrowserSetupPanel = EmptyComponent;
export const LifeOpsPageView = EmptyComponent;
export const WebsiteBlockerSettingsCard = EmptyComponent;
export const ApprovalQueue = EmptyComponent;
export const StewardLogo = EmptyComponent;
export const TransactionHistory = EmptyComponent;
export const CodingAgentControlChip = EmptyComponent;
export const CodingAgentSettingsSection = EmptyComponent;
export const CodingAgentTasksPanel = EmptyComponent;
export const PtyConsoleDrawer = EmptyComponent;
export const FineTuningView = EmptyComponent;

export function createVectorBrowserRenderer(): Promise<null> {
  return Promise.resolve(null);
}

export function prefetchVrmToCache(_url?: string): Promise<void> {
  return Promise.resolve();
}

export function resolveCompanionInferenceNotice(): null {
  return null;
}

export function useCompanionSceneStatus(): CompanionSceneStatus {
  return { avatarReady: false, teleportKey: "" };
}

export function useVincentState(
  _args: VincentStateHookArgs,
): VincentStateHookResult {
  return {
    vincentConnected: false,
    vincentLoginBusy: false,
    vincentLoginError: null,
    vincentConnectedAt: null,
    handleVincentLogin: async () => {},
    handleVincentDisconnect: async () => {},
    pollVincentStatus: async () => false,
  };
}

export function dispatchQueuedLifeOpsGithubCallbackFromUrl(
  _url?: string,
): void {}

export type PreflightAuthStatus =
  | "authenticated"
  | "unauthenticated"
  | "unknown";

export interface NormalizedPreflightAuth {
  status: PreflightAuthStatus;
  method?: string;
  detail?: string;
  loginHint?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePreflightAuth(
  raw: unknown,
): NormalizedPreflightAuth | undefined {
  if (!isRecord(raw)) return undefined;
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: PreflightAuthStatus =
    rawStatus === "authenticated" || rawStatus === "unauthenticated"
      ? rawStatus
      : "unknown";
  const out: NormalizedPreflightAuth = { status };
  if (typeof raw.method === "string") out.method = raw.method;
  if (typeof raw.detail === "string") out.detail = raw.detail;
  if (typeof raw.loginHint === "string") out.loginHint = raw.loginHint;
  return out;
}

export interface SanitizedAuthResult {
  launched?: boolean;
  url?: string;
  deviceCode?: string;
  instructions?: string;
}

export function sanitizeAuthResult(input: unknown): SanitizedAuthResult {
  if (!isRecord(input)) return {};
  const out: SanitizedAuthResult = {};
  if (typeof input.launched === "boolean") out.launched = input.launched;
  if (typeof input.url === "string") {
    try {
      const parsed = new URL(input.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        out.url = input.url;
      }
    } catch {
      // Drop malformed URLs; the UI can fall back to instructions.
    }
  }
  if (typeof input.deviceCode === "string") {
    out.deviceCode = input.deviceCode;
  }
  if (typeof input.instructions === "string") {
    out.instructions = input.instructions;
  }
  return out;
}

export type CoordinationDecisionKind =
  | "respond"
  | "escalate"
  | "ignore"
  | "complete"
  | "auto_resolved"
  | "stopped";

export interface CoordinationDecision {
  timestamp: number;
  event: string;
  promptText: string;
  decision: CoordinationDecisionKind;
  response?: string;
  reasoning: string;
}

export type CoordinatorTaskStatus =
  | "active"
  | "blocked"
  | "tool_running"
  | "completed"
  | "error"
  | "stopped";

export interface TaskContext {
  threadId: string;
  taskNodeId?: string;
  sessionId: string;
  agentType: string;
  label: string;
  originalTask: string;
  workdir: string;
  repo?: string;
  originRoomId?: string;
  originMetadata?: Record<string, unknown>;
  status: CoordinatorTaskStatus;
  decisions: CoordinationDecision[];
  autoResolvedCount: number;
  registeredAt: number;
  lastActivityAt: number;
  idleCheckCount: number;
  taskDelivered: boolean;
  completionSummary?: string;
  lastSeenDecisionIndex: number;
  lastInputSentAt?: number;
  stoppedAt?: number;
}

export interface SwarmEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data: unknown;
}

export interface TaskCompletionSummary {
  sessionId: string;
  label: string;
  agentType: string;
  originalTask: string;
  status: string;
  completionSummary: string;
  [key: string]: unknown;
}

export { THREE };
