/**
 * Global application state via React Context.
 *
 * Children access state and actions through the useApp() hook.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AgentStartupDiagnostics,
  type AgentStatus,
  type AppViewerAuthMessage,
  type AvatarEmoteDef,
  type AutonomyExecutePlanRequest,
  type CatalogSkill,
  type CharacterData,
  type ContentBlock,
  type Conversation,
  type ConversationChannelType,
  type ConversationMessage,
  type CreateTriggerRequest,
  client,
  type DropStatus,
  type ExtensionStatus,
  type Five55AutonomyMode,
  type Five55AutonomyPreviewResponse,
  type Five55MasteryRun,
  type ImageAttachment,
  type LogEntry,
  type McpMarketplaceResult,
  type McpRegistryServerDetail,
  type McpServerConfig,
  type McpServerStatus,
  type MintResult,
  type OnboardingOptions,
  type PluginInfo,
  type RegistryPlugin,
  type RegistryStatus,
  type ReleaseChannel,
  type SkillInfo,
  type SkillMarketplaceResult,
  type SkillScanReportSummary,
  type StreamEventEnvelope,
  type StylePreset,
  type TriggerHealthSnapshot,
  type TriggerRunRecord,
  type TriggerSummary,
  type UpdateStatus,
  type UpdateTriggerRequest,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletConfigStatus,
  type WalletExportResult,
  type WalletNftsResponse,
  type WhitelistStatus,
 type WorkbenchOverview,
} from "./api-client";
import { pathForTab, tabFromPath } from "./navigation";
import { resolveAppAssetUrl } from "./asset-url";
import {
  getMissingOnboardingPermissions,
  ONBOARDING_PERMISSION_LABELS,
} from "./onboarding-permissions";
import type { ToastItem } from "./components/ui/Toast";
import {
  assetVaultSectionForTab,
  controlSectionForTab,
  defaultTabForControlSection,
  isTabEnabled,
  sanitizeControlSection,
  type HudAssetSection,
  type HudControlSection,
  type Tab,
} from "./miladyHudRouting.js";
import {
  QUICK_LAYER_CATALOG,
  type QuickLayerId,
} from "./components/quickLayerCatalog.js";
import {
  didToolActionSucceed,
  findLastToolEnvelope,
  getToolActionFailureMessage,
} from "./components/quickLayerPlan.js";
import {
  computeQuickLayerRetryDelayMs,
  getHttpStatusFromError,
  shouldRetryQuickLayerError,
} from "./components/quickLayerRetry.js";
import {
  buildAutonomousPrompt,
  DEFAULT_GAME_SANDBOX,
  isUnreachableLoopbackViewerUrl,
  parseAdIdFromEnvelope,
  parseGameLaunchFromEnvelope,
  parseProjectedEarningsFromEnvelope,
  selectPreferredGameId,
  summarizeStreamState,
  type ParsedGameLaunch,
} from "./quickLayerRuntime.js";
import {
  buildQuickLayerStatusRecord,
  hasPluginRegistration,
  resolveQuickLayerStatus,
  type QuickLayerStatus,
} from "./quickLayerSupport.js";
import {
  removeLiveSecondarySource,
  resolveLiveHeroSource,
  resolveLiveLayoutMode,
  resolveLiveSceneId,
  upsertLiveSecondarySource,
  type LiveLayoutMode,
  type LiveSecondarySource,
} from "./liveComposition.js";
import {
  buildStream555StatusSummary,
  isStream555PrimaryPlugin,
} from "./stream555Readiness";
import {
  routeProStreamerFeedback,
  type ProStreamerActionLogInlineFeedback,
  type ProStreamerFeedbackSinks,
  type ProStreamerFeedbackTone,
  type ProStreamerModalFeedback,
  type ProStreamerToastFeedback,
} from "./proStreamerFeedback.js";

// ── VRM helpers ─────────────────────────────────────────────────────────

/** Number of built-in milady VRM avatars shipped with the app. */
export const VRM_COUNT = 8;
export const DEFAULT_PRO_STREAMER_VRM_FILENAME = "alice.vrm";
export const DEFAULT_PRO_STREAMER_VRM_URL = resolveAppAssetUrl(
  `vrms/${DEFAULT_PRO_STREAMER_VRM_FILENAME}`,
);
export const DEFAULT_PRO_STREAMER_VRM_PREVIEW_URL = resolveAppAssetUrl(
  "vrms/previews/alice-stage.svg",
);

function normalizeAvatarIndex(index: number): number {
  if (!Number.isFinite(index)) return 1;
  const n = Math.trunc(index);
  if (n === 0) return 0;
  if (n < 1 || n > VRM_COUNT) return 1;
  return n;
}

/** Resolve a built-in VRM index (1–8) to its public asset URL. */
export function getVrmUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return safeIndex === 1
    ? DEFAULT_PRO_STREAMER_VRM_URL
    : resolveAppAssetUrl(`vrms/${safeIndex}.vrm`);
}

/** Resolve a built-in VRM index (1–8) to its preview thumbnail URL. */
export function getVrmPreviewUrl(index: number): string {
  const normalized = normalizeAvatarIndex(index);
  const safeIndex = normalized > 0 ? normalized : 1;
  return safeIndex === 1
    ? DEFAULT_PRO_STREAMER_VRM_PREVIEW_URL
    : resolveAppAssetUrl(`vrms/previews/milady-${safeIndex}.png`);
}

// ── Theme ──────────────────────────────────────────────────────────────

const THEME_STORAGE_KEY = "milady:theme";

export type ThemeName =
  | "milady"
  | "qt314"
  | "web2000"
  | "programmer"
  | "haxor"
  | "psycho"
  | "milady-os";

export type DockSurface = "none" | "threads" | "memory" | "ops" | "vault";
export type HudSurface = "none" | "control-stack";
export type RailBubbleState = "collapsed" | "peek" | "expanded";
export type ActiveBubble = "none" | "action-log" | "mission-stack";
export type GoLiveLaunchMode =
  | "camera"
  | "radio"
  | "screen-share"
  | "play-games"
  | "reaction";

export interface GoLiveConfig {
  channels: string[];
  launchMode: GoLiveLaunchMode;
  layoutMode: LiveLayoutMode;
}

export interface GoLiveLaunchFollowUp {
  target: "action-log";
  label: string;
  detail: string;
}

export interface GoLiveLaunchResult {
  state: "success" | "partial" | "blocked" | "failed";
  tone: "success" | "warning" | "error";
  message: string;
  followUp?: GoLiveLaunchFollowUp;
}

function labelForGoLiveLaunchMode(mode: GoLiveLaunchMode): string {
  switch (mode) {
    case "camera":
      return "Camera";
    case "radio":
      return "Lo-fi Radio";
    case "screen-share":
      return "Screen Share";
    case "play-games":
      return "Play Games";
    case "reaction":
      return "Reaction";
    default:
      return "Camera";
  }
}

export const THEMES: ReadonlyArray<{
  id: ThemeName;
  label: string;
  hint: string;
}> = [
    { id: "milady", label: "milady", hint: "clean black & white" },
    { id: "qt314", label: "qt3.14", hint: "soft pastels" },
    { id: "web2000", label: "web2000", hint: "green hacker vibes" },
    { id: "programmer", label: "programmer", hint: "vscode dark" },
    { id: "haxor", label: "haxor", hint: "terminal green" },
    { id: "psycho", label: "psycho", hint: "pure chaos" },
    { id: "milady-os", label: "Pro Streamer", hint: "broadcast conversation stage" },
  ];

const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));
const AGENT_TRANSFER_MIN_PASSWORD_LENGTH = 4;

function replaceMiladyLocationWithRoot() {
  if (typeof window === "undefined") return;
  if (window.location.protocol === "file:") {
    const next = `${window.location.pathname}${window.location.search}#/`;
    window.history.replaceState(null, "", next);
    return;
  }
  if (window.location.pathname !== "/" || window.location.search || window.location.hash) {
    window.history.replaceState(null, "", "/");
  }
}

function loadTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && VALID_THEMES.has(stored)) return stored as ThemeName;
  } catch {
    /* ignore */
  }
  return "milady-os";
}

function applyTheme(name: ThemeName) {
  document.documentElement.setAttribute("data-theme", name);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
}

/* ── Avatar persistence ───────────────────────────────────────────────── */
const AVATAR_INDEX_KEY = "milady_avatar_index";

function loadAvatarIndex(): number {
  try {
    const stored = localStorage.getItem(AVATAR_INDEX_KEY);
    if (stored) {
      const n = parseInt(stored, 10);
      return normalizeAvatarIndex(n);
    }
  } catch {
    /* ignore */
  }
  return 1;
}

function saveAvatarIndex(index: number) {
  try {
    localStorage.setItem(AVATAR_INDEX_KEY, String(normalizeAvatarIndex(index)));
  } catch {
    /* ignore */
  }
}

/* ── Chat UI persistence ──────────────────────────────────────────────── */
const CHAT_AVATAR_VISIBLE_KEY = "milady:chat:avatarVisible";
const CHAT_VOICE_MUTED_KEY = "milady:chat:voiceMuted";

function loadChatAvatarVisible(): boolean {
  try {
    const stored = localStorage.getItem(CHAT_AVATAR_VISIBLE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function loadChatVoiceMuted(): boolean {
  try {
    const stored = localStorage.getItem(CHAT_VOICE_MUTED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function saveChatAvatarVisible(value: boolean): void {
  try {
    localStorage.setItem(CHAT_AVATAR_VISIBLE_KEY, String(value));
  } catch {
    /* ignore */
  }
}

function saveChatVoiceMuted(value: boolean): void {
  try {
    localStorage.setItem(CHAT_VOICE_MUTED_KEY, String(value));
  } catch {
    /* ignore */
  }
}

// ── Onboarding step type ───────────────────────────────────────────────

export type OnboardingStep =
  | "welcome"
  | "name"
  | "avatar"
  | "style"
  | "theme"
  | "mint"
  | "runMode"
  | "dockerSetup"
  | "cloudProvider"
  | "modelSelection"
  | "cloudLogin"
  | "llmProvider"
  | "inventorySetup"
  | "connectors"
  | "permissions";

const FALLBACK_ONBOARDING_STYLE_CATCHPHRASE = "lol k let me handle it";

function resolveOnboardingStyleCatchphrase(
  options: OnboardingOptions | null | undefined,
  requested: string,
): string {
  if (!options || options.styles.length === 0) return "";
  const trimmed = requested.trim();
  const aliases = options.styleAliases ?? {};
  const canonical = (aliases[trimmed] ?? trimmed).trim();
  if (canonical && options.styles.some((preset) => preset.catchphrase === canonical)) {
    return canonical;
  }
  const preferred = (
    options.defaultStyleCatchphrase ?? FALLBACK_ONBOARDING_STYLE_CATCHPHRASE
  ).trim();
  if (preferred && options.styles.some((preset) => preset.catchphrase === preferred)) {
    return preferred;
  }
  return options.styles[0]?.catchphrase ?? "";
}

// ── Action notice ──────────────────────────────────────────────────────

interface ActionNotice {
  tone: ProStreamerFeedbackTone;
  text: string;
}

interface GoLiveInlineNotice {
  tone: ProStreamerFeedbackTone;
  message: string;
}

interface ActionLogInlineNotice {
  id: string;
  tone: ProStreamerFeedbackTone;
  title?: string;
  message: string;
  actionLabel?: string;
}

type LifecycleAction =
  | "start"
  | "stop"
  | "pause"
  | "resume"
  | "restart"
  | "reset";

const LIFECYCLE_MESSAGES: Record<
  LifecycleAction,
  {
    inProgress: string;
    progress: string;
    success: string;
    verb: string;
  }
> = {
  start: {
    inProgress: "starting",
    progress: "Starting agent...",
    success: "Agent started.",
    verb: "start",
  },
  stop: {
    inProgress: "stopping",
    progress: "Stopping agent...",
    success: "Agent stopped.",
    verb: "stop",
  },
  pause: {
    inProgress: "pausing",
    progress: "Pausing agent...",
    success: "Agent paused.",
    verb: "pause",
  },
  resume: {
    inProgress: "resuming",
    progress: "Resuming agent...",
    success: "Agent resumed.",
    verb: "resume",
  },
  restart: {
    inProgress: "restarting",
    progress: "Restarting agent...",
    success: "Agent restarted.",
    verb: "restart",
  },
  reset: {
    inProgress: "resetting",
    progress: "Resetting agent...",
    success: "Agent reset. Returning to onboarding.",
    verb: "reset",
  },
};

type GamePostMessageAuthPayload = AppViewerAuthMessage;

const AGENT_STATES: ReadonlySet<AgentStatus["state"]> = new Set([
  "not_started",
  "starting",
  "running",
  "paused",
  "stopped",
  "restarting",
  "error",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAgentStatusEvent(
  data: Record<string, unknown>,
): AgentStatus | null {
  const state = data.state;
  const agentName = data.agentName;
  if (
    typeof state !== "string" ||
    !AGENT_STATES.has(state as AgentStatus["state"])
  ) {
    return null;
  }
  if (typeof agentName !== "string") return null;
  const model = typeof data.model === "string" ? data.model : undefined;
  const startedAt =
    typeof data.startedAt === "number" ? data.startedAt : undefined;
  const uptime = typeof data.uptime === "number" ? data.uptime : undefined;
  const startup = parseAgentStartupDiagnostics(data.startup);
  return {
    state: state as AgentStatus["state"],
    agentName,
    model,
    startedAt,
    uptime,
    startup,
  };
}

function parseAgentStartupDiagnostics(
  value: unknown,
): AgentStartupDiagnostics | undefined {
  if (!isRecord(value)) return undefined;
  const phase = value.phase;
  const attempt = value.attempt;
  if (typeof phase !== "string" || typeof attempt !== "number") {
    return undefined;
  }
  const startup: AgentStartupDiagnostics = { phase, attempt };
  if (typeof value.lastError === "string") startup.lastError = value.lastError;
  if (typeof value.lastErrorAt === "number")
    startup.lastErrorAt = value.lastErrorAt;
  if (typeof value.nextRetryAt === "number")
    startup.nextRetryAt = value.nextRetryAt;
  return startup;
}

function parseStreamEventEnvelopeEvent(
  data: Record<string, unknown>,
): StreamEventEnvelope | null {
  const type = data.type;
  const eventId = data.eventId;
  const ts = data.ts;
  const payload = data.payload;
  if (
    (type !== "agent_event" &&
      type !== "heartbeat_event" &&
      type !== "training_event") ||
    typeof eventId !== "string" ||
    typeof ts !== "number" ||
    !isRecord(payload)
  ) {
    return null;
  }

  const envelope: StreamEventEnvelope = {
    type,
    version: 1,
    eventId,
    ts,
    payload,
  };
  if (typeof data.runId === "string") envelope.runId = data.runId;
  if (typeof data.seq === "number") envelope.seq = data.seq;
  if (typeof data.stream === "string") envelope.stream = data.stream;
  if (typeof data.sessionKey === "string")
    envelope.sessionKey = data.sessionKey;
  if (typeof data.agentId === "string") envelope.agentId = data.agentId;
  if (typeof data.roomId === "string") envelope.roomId = data.roomId;
  return envelope;
}

function parseConversationMessageEvent(
  value: unknown,
): ConversationMessage | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  const role = value.role;
  const text = value.text;
  const timestamp = value.timestamp;
  const source = value.source;
  const blocks = value.blocks;
  if (
    typeof id !== "string" ||
    (role !== "user" && role !== "assistant") ||
    typeof text !== "string" ||
    typeof timestamp !== "number"
  ) {
    return null;
  }
  const parsed: ConversationMessage = { id, role, text, timestamp };
  if (Array.isArray(blocks)) {
    const parsedBlocks = blocks.filter((block): block is ContentBlock => {
      if (!isRecord(block) || typeof block.type !== "string") return false;
      if (block.type === "text") {
        return typeof block.text === "string";
      }
      if (block.type === "action-pill") {
        return (
          typeof block.label === "string" &&
          (block.kind === "stream" ||
            block.kind === "avatar" ||
            block.kind === "launch") &&
          (block.detail === undefined || typeof block.detail === "string")
        );
      }
      if (block.type === "ui-spec") {
        return isRecord(block.spec);
      }
      if (block.type === "config-form") {
        return typeof block.pluginId === "string" && isRecord(block.schema);
      }
      return false;
    });
    if (parsedBlocks.length > 0) {
      parsed.blocks = parsedBlocks;
    }
  }
  if (typeof source === "string" && source.length > 0) {
    parsed.source = source;
  }
  return parsed;
}

function parseProactiveMessageEvent(
  data: Record<string, unknown>,
): { conversationId: string; message: ConversationMessage } | null {
  const conversationId = data.conversationId;
  if (typeof conversationId !== "string") return null;
  const message = parseConversationMessageEvent(data.message);
  if (!message) return null;
  return { conversationId, message };
}

function computeStreamingDelta(existing: string, incoming: string): string {
  if (!incoming) return "";
  if (!existing) return incoming;
  if (incoming === existing) return "";
  if (incoming.startsWith(existing)) return incoming.slice(existing.length);
  if (existing.startsWith(incoming)) return "";

  // Small chunks are usually raw token deltas; keep them even if they
  // duplicate suffix characters (e.g., "l" + "l" in "Hello").
  if (incoming.length <= 3) return incoming;

  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existing.endsWith(incoming.slice(0, overlap))) {
      const delta = incoming.slice(overlap);
      if (!delta && overlap === incoming.length) return "";
      return delta;
    }
  }
  return incoming;
}

function normalizeStreamComparisonText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function shouldApplyFinalStreamText(
  streamed: string,
  finalText: string,
): boolean {
  if (!finalText.trim()) return false;
  if (!streamed) return true;
  if (streamed === finalText) return false;
  return (
    normalizeStreamComparisonText(streamed) !==
    normalizeStreamComparisonText(finalText)
  );
}

type LoadConversationMessagesResult =
  | { ok: true }
  | { ok: false; status?: number; message: string };

export type StartupPhase = "starting-backend" | "initializing-agent";

export type StartupErrorReason =
  | "backend-timeout"
  | "backend-unreachable"
  | "agent-timeout"
  | "agent-error";

export interface StartupErrorState {
  reason: StartupErrorReason;
  phase: StartupPhase;
  message: string;
  detail?: string;
  status?: number;
  path?: string;
}

const BACKEND_STARTUP_TIMEOUT_MS = 30_000;
const AGENT_READY_TIMEOUT_MS = 90_000;

interface ApiLikeError {
  kind?: string;
  status?: number;
  path?: string;
  message?: string;
}

function asApiLikeError(err: unknown): ApiLikeError | null {
  if (!isRecord(err)) return null;
  const kind = err.kind;
  const status = err.status;
  const path = err.path;
  const message = err.message;
  const hasApiShape =
    typeof kind === "string" ||
    typeof status === "number" ||
    typeof path === "string";
  if (!hasApiShape) return null;
  return {
    kind: typeof kind === "string" ? kind : undefined,
    status: typeof status === "number" ? status : undefined,
    path: typeof path === "string" ? path : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

function formatStartupErrorDetail(err: unknown): string | undefined {
  const apiErr = asApiLikeError(err);
  if (apiErr) {
    const parts: string[] = [];
    if (apiErr.path) parts.push(apiErr.path);
    if (typeof apiErr.status === "number") parts.push(`HTTP ${apiErr.status}`);
    if (apiErr.message) parts.push(apiErr.message);
    return parts.filter(Boolean).join(" - ");
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return undefined;
}

// ── Context value type ─────────────────────────────────────────────────

export interface AppState {
  // Core
  tab: Tab;
  currentTheme: ThemeName;
  dockSurface: DockSurface;
  streamViewMode: "broadcast" | "operator";
  leftRailState: RailBubbleState;
  rightRailState: RailBubbleState;
  activeBubble: ActiveBubble;
  hudSurface: HudSurface;
  hudControlSection: HudControlSection | null;
  hudAssetSection: HudAssetSection | null;
  connected: boolean;
  agentStatus: AgentStatus | null;
  onboardingComplete: boolean;
  onboardingLoading: boolean;
  startupPhase: StartupPhase;
  startupError: StartupErrorState | null;
  authRequired: boolean;
  actionNotice: ActionNotice | null;
  toasts: ToastItem[];
  goLiveInlineNotice: GoLiveInlineNotice | null;
  actionLogInlineNotice: ActionLogInlineNotice | null;
  lifecycleBusy: boolean;
  lifecycleAction: LifecycleAction | null;

  // Deferred restart
  pendingRestart: boolean;
  pendingRestartReasons: string[];
  restartBannerDismissed: boolean;

  // Pairing
  pairingEnabled: boolean;
  pairingExpiresAt: number | null;
  pairingCodeInput: string;
  pairingError: string | null;
  pairingBusy: boolean;

  // Chat
  chatInput: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
  chatAvatarVisible: boolean;
  chatAgentVoiceMuted: boolean;
  chatAvatarSpeaking: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  conversationMessages: ConversationMessage[];
  autonomousEvents: StreamEventEnvelope[];
  autonomousLatestEventId: string | null;
  /** Conversation IDs with unread proactive messages from the agent. */
  unreadConversations: Set<string>;
  quickLayerStatuses: Record<QuickLayerId, QuickLayerStatus>;
  autonomousRunOpen: boolean;
  autoRunMode: Five55AutonomyMode;
  autoRunTopic: string;
  autoRunDurationMin: number;
  autoRunAvatarRuntime: "auto" | "local" | "premium";
  autoRunPreview: Five55AutonomyPreviewResponse | null;
  autoRunPreviewBusy: boolean;
  autoRunLaunching: boolean;

  // Triggers
  triggers: TriggerSummary[];
  triggersLoading: boolean;
  triggersSaving: boolean;
  triggerRunsById: Record<string, TriggerRunRecord[]>;
  triggerHealth: TriggerHealthSnapshot | null;
  triggerError: string | null;

  // Plugins
  plugins: PluginInfo[];
  pluginFilter: "all" | "ai-provider" | "connector" | "feature";
  pluginStatusFilter: "all" | "enabled" | "disabled";
  pluginSearch: string;
  pluginSettingsOpen: Set<string>;
  pluginAdvancedOpen: Set<string>;
  pluginSaving: Set<string>;
  pluginSaveSuccess: Set<string>;

  // Skills
  skills: SkillInfo[];
  skillsSubTab: "my" | "browse";
  skillCreateFormOpen: boolean;
  skillCreateName: string;
  skillCreateDescription: string;
  skillCreating: boolean;
  skillReviewReport: SkillScanReportSummary | null;
  skillReviewId: string;
  skillReviewLoading: boolean;
  skillToggleAction: string;
  skillsMarketplaceQuery: string;
  skillsMarketplaceResults: SkillMarketplaceResult[];
  skillsMarketplaceError: string;
  skillsMarketplaceLoading: boolean;
  skillsMarketplaceAction: string;
  skillsMarketplaceManualGithubUrl: string;

  // Logs
  logs: LogEntry[];
  logSources: string[];
  logTags: string[];
  logTagFilter: string;
  logLevelFilter: string;
  logSourceFilter: string;

  // Wallet / Inventory
  walletAddresses: WalletAddresses | null;
  walletConfig: WalletConfigStatus | null;
  walletBalances: WalletBalancesResponse | null;
  walletNfts: WalletNftsResponse | null;
  walletLoading: boolean;
  walletNftsLoading: boolean;
  inventoryView: "tokens" | "nfts";
  walletExportData: WalletExportResult | null;
  walletExportVisible: boolean;
  walletApiKeySaving: boolean;
  inventorySort: "chain" | "symbol" | "value";
  walletError: string | null;

  // ERC-8004 Registry
  registryStatus: RegistryStatus | null;
  registryLoading: boolean;
  registryRegistering: boolean;
  registryError: string | null;

  // Drop / Mint
  dropStatus: DropStatus | null;
  dropLoading: boolean;
  mintInProgress: boolean;
  mintResult: MintResult | null;
  mintError: string | null;
  mintShiny: boolean;

  // Whitelist
  whitelistStatus: WhitelistStatus | null;
  whitelistLoading: boolean;
  twitterVerifyMessage: string | null;
  twitterVerifyUrl: string;
  twitterVerifying: boolean;

  // Character
  characterData: CharacterData | null;
  characterLoading: boolean;
  characterSaving: boolean;
  characterSaveSuccess: string | null;
  characterSaveError: string | null;
  characterDraft: CharacterData;
  selectedVrmIndex: number;
  customVrmUrl: string;

  // Cloud
  cloudEnabled: boolean;
  cloudConnected: boolean;
  cloudCredits: number | null;
  cloudCreditsLow: boolean;
  cloudCreditsCritical: boolean;
  cloudTopUpUrl: string;
  cloudUserId: string | null;
  cloudLoginBusy: boolean;
  cloudLoginError: string | null;
  cloudDisconnecting: boolean;

  // Updates
  updateStatus: UpdateStatus | null;
  updateLoading: boolean;
  updateChannelSaving: boolean;

  // Extension
  extensionStatus: ExtensionStatus | null;
  extensionChecking: boolean;

  // Store
  storePlugins: RegistryPlugin[];
  storeSearch: string;
  storeFilter: "all" | "installed" | "ai-provider" | "connector" | "feature";
  storeLoading: boolean;
  storeInstalling: Set<string>;
  storeUninstalling: Set<string>;
  storeError: string | null;
  storeDetailPlugin: RegistryPlugin | null;
  storeSubTab: "plugins" | "skills";

  // Catalog
  catalogSkills: CatalogSkill[];
  catalogTotal: number;
  catalogPage: number;
  catalogTotalPages: number;
  catalogSort: "downloads" | "stars" | "updated" | "name";
  catalogSearch: string;
  catalogLoading: boolean;
  catalogError: string | null;
  catalogDetailSkill: CatalogSkill | null;
  catalogInstalling: Set<string>;
  catalogUninstalling: Set<string>;

  // Workbench
  workbenchLoading: boolean;
  workbench: WorkbenchOverview | null;
  workbenchTasksAvailable: boolean;
  workbenchTriggersAvailable: boolean;
  workbenchTodosAvailable: boolean;

  // Agent export/import
  exportBusy: boolean;
  exportPassword: string;
  exportIncludeLogs: boolean;
  exportError: string | null;
  exportSuccess: string | null;
  importBusy: boolean;
  importPassword: string;
  importFile: File | null;
  importError: string | null;
  importSuccess: string | null;

  // Onboarding
  onboardingStep: OnboardingStep;
  onboardingOptions: OnboardingOptions | null;
  onboardingName: string;
  onboardingStyle: string;
  onboardingTheme: ThemeName;
  onboardingRunMode: "local-rawdog" | "local-sandbox" | "cloud" | "";
  onboardingCloudProvider: string;
  onboardingSmallModel: string;
  onboardingLargeModel: string;
  onboardingProvider: string;
  onboardingApiKey: string;
  onboardingOpenRouterModel: string;
  onboardingPrimaryModel: string;
  onboardingTelegramToken: string;
  onboardingDiscordToken: string;
  onboardingWhatsAppSessionPath: string;
  onboardingTwilioAccountSid: string;
  onboardingTwilioAuthToken: string;
  onboardingTwilioPhoneNumber: string;
  onboardingBlooioApiKey: string;
  onboardingBlooioPhoneNumber: string;
  onboardingGithubToken: string;
  onboardingSubscriptionTab: "token" | "oauth";
  onboardingSelectedChains: Set<string>;
  onboardingRpcSelections: Record<string, string>;
  onboardingRpcKeys: Record<string, string>;
  onboardingAvatar: number;
  onboardingRestarting: boolean;

  // Command palette
  commandPaletteOpen: boolean;
  commandQuery: string;
  commandActiveIndex: number;

  // Emote picker
  emotePickerOpen: boolean;
  availableEmotes: AvatarEmoteDef[];
  activeAvatarEmoteId: string | null;
  avatarMotionMode: "idle" | "manual" | "auto";

  // MCP
  mcpConfiguredServers: Record<string, McpServerConfig>;
  mcpServerStatuses: McpServerStatus[];
  mcpMarketplaceQuery: string;
  mcpMarketplaceResults: McpMarketplaceResult[];
  mcpMarketplaceLoading: boolean;
  mcpAction: string;
  mcpAddingServer: McpRegistryServerDetail | null;
  mcpAddingResult: McpMarketplaceResult | null;
  mcpEnvInputs: Record<string, string>;
  mcpHeaderInputs: Record<string, string>;

  // Share ingest
  droppedFiles: string[];
  shareIngestNotice: string;

  // Chat image attachments queued for the next message
  chatPendingImages: ImageAttachment[];

  // Game
  activeGameApp: string;
  activeGameDisplayName: string;
  activeGameViewerUrl: string;
  activeGameSandbox: string;
  activeGamePostMessageAuth: boolean;
  activeGamePostMessagePayload: GamePostMessageAuthPayload | null;
  five55MasteryRuns: Five55MasteryRun[];
  five55MasteryRunsLoading: boolean;
  liveBroadcastState: "offline" | "live";
  goLiveModalOpen: boolean;
  liveLayoutMode: LiveLayoutMode;
  liveSceneId: "default" | "active-pip";
  liveSecondarySources: LiveSecondarySource[];
  liveHeroSource: LiveSecondarySource | null;

  /** When true, the game iframe persists as a floating overlay across all tabs. */
  gameOverlayEnabled: boolean;

  // Sub-tabs
  appsSubTab: "browse" | "games";
  agentSubTab: "character" | "inventory" | "knowledge";
  pluginsSubTab: "features" | "connectors" | "plugins";
  databaseSubTab: "tables" | "media" | "vectors";

  // Config text
  configRaw: Record<string, unknown>;
  configText: string;
}

export interface AppActions {
  // Navigation
  setTab: (tab: Tab) => void;
  setTheme: (theme: ThemeName) => void;
  openDockSurface: (surface: Exclude<DockSurface, "none">) => void;
  closeDockSurface: () => void;
  setStreamViewMode: (mode: "broadcast" | "operator") => void;
  openHudControlStack: (section?: HudControlSection, tabOverride?: Tab) => void;
  openHudAssetVault: (section?: HudAssetSection, tabOverride?: Tab) => void;
  closeHudSurface: () => void;
  setRailDisplay: (
    bubble: Exclude<ActiveBubble, "none">,
    state: RailBubbleState,
  ) => void;
  collapseRails: () => void;

  // Lifecycle
  handleStart: () => Promise<void>;
  handleStop: () => Promise<void>;
  handlePauseResume: () => Promise<void>;
  handleRestart: () => Promise<void>;
  handleReset: () => Promise<void>;
  retryStartup: () => void;
  dismissRestartBanner: () => void;
  triggerRestart: () => Promise<void>;

  // Chat
  handleChatSend: (channelType?: ConversationChannelType) => Promise<void>;
  handleChatStop: () => void;
  handleChatClear: () => Promise<void>;
  handleNewConversation: () => Promise<void>;
  setChatPendingImages: (images: ImageAttachment[]) => void;
  handleSelectConversation: (id: string) => Promise<void>;
  handleDeleteConversation: (id: string) => Promise<void>;
  handleRenameConversation: (id: string, title: string) => Promise<void>;
  runQuickLayer: (layerId: QuickLayerId) => Promise<void>;
  openGoLiveModal: () => void;
  closeGoLiveModal: () => void;
  launchGoLive: (config: GoLiveConfig) => Promise<GoLiveLaunchResult>;
  openAutonomousRun: () => void;
  closeAutonomousRun: () => void;
  runAutonomousEstimate: () => Promise<Five55AutonomyPreviewResponse | null>;
  runAutonomousLaunch: () => Promise<void>;

  // Triggers
  loadTriggers: () => Promise<void>;
  createTrigger: (
    request: CreateTriggerRequest,
  ) => Promise<TriggerSummary | null>;
  updateTrigger: (
    id: string,
    request: UpdateTriggerRequest,
  ) => Promise<TriggerSummary | null>;
  deleteTrigger: (id: string) => Promise<boolean>;
  runTriggerNow: (id: string) => Promise<boolean>;
  loadTriggerRuns: (id: string) => Promise<void>;
  loadTriggerHealth: () => Promise<void>;

  // Pairing
  handlePairingSubmit: () => Promise<void>;

  // Plugins
  loadPlugins: () => Promise<void>;
  handlePluginToggle: (pluginId: string, enabled: boolean) => Promise<void>;
  handlePluginConfigSave: (
    pluginId: string,
    config: Record<string, string>,
  ) => Promise<void>;

  // Skills
  loadSkills: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  handleSkillToggle: (skillId: string, enabled: boolean) => Promise<void>;
  handleCreateSkill: () => Promise<void>;
  handleOpenSkill: (skillId: string) => Promise<void>;
  handleDeleteSkill: (skillId: string, name: string) => Promise<void>;
  handleReviewSkill: (skillId: string) => Promise<void>;
  handleAcknowledgeSkill: (skillId: string) => Promise<void>;
  searchSkillsMarketplace: () => Promise<void>;
  installSkillFromMarketplace: (item: SkillMarketplaceResult) => Promise<void>;
  uninstallMarketplaceSkill: (skillId: string, name: string) => Promise<void>;
  installSkillFromGithubUrl: () => Promise<void>;

  // Logs
  loadLogs: () => Promise<void>;
  loadFive55MasteryRuns: () => Promise<void>;
  startFive55MasteryRun: (input?: {
    suiteId?: string;
    games?: string[];
    episodesPerGame?: number;
    seedMode?: "fixed" | "mixed" | "rolling";
    maxDurationSec?: number;
    strict?: boolean;
  }) => Promise<string | null>;

  // Inventory
  loadInventory: () => Promise<void>;
  loadBalances: () => Promise<void>;
  loadNfts: () => Promise<void>;
  handleWalletApiKeySave: (config: Record<string, string>) => Promise<void>;
  handleExportKeys: () => Promise<void>;

  // Registry / Drop
  loadRegistryStatus: () => Promise<void>;
  registerOnChain: () => Promise<void>;
  syncRegistryProfile: () => Promise<void>;
  loadDropStatus: () => Promise<void>;
  mintFromDrop: (shiny: boolean) => Promise<void>;
  loadWhitelistStatus: () => Promise<void>;

  // Character
  loadCharacter: () => Promise<void>;
  handleSaveCharacter: () => Promise<void>;
  handleCharacterFieldInput: <K extends keyof CharacterData>(
    field: K,
    value: CharacterData[K],
  ) => void;
  handleCharacterArrayInput: (
    field: "adjectives" | "topics" | "postExamples",
    value: string,
  ) => void;
  handleCharacterStyleInput: (
    subfield: "all" | "chat" | "post",
    value: string,
  ) => void;
  handleCharacterMessageExamplesInput: (value: string) => void;

  // Onboarding
  handleOnboardingNext: (options?: OnboardingNextOptions) => Promise<void>;
  handleOnboardingBack: () => void;

  // Cloud
  handleCloudLogin: () => Promise<void>;
  handleCloudDisconnect: () => Promise<void>;

  // Updates
  loadUpdateStatus: (force?: boolean) => Promise<void>;
  handleChannelChange: (channel: ReleaseChannel) => Promise<void>;

  // Extension
  checkExtensionStatus: () => Promise<void>;

  // Emote picker
  openEmotePicker: () => void;
  closeEmotePicker: () => void;
  playAvatarEmote: (emoteId: string) => Promise<void>;
  stopAvatarEmote: () => void;

  // Workbench
  loadWorkbench: () => Promise<void>;

  // Agent export/import
  handleAgentExport: () => Promise<void>;
  handleAgentImport: () => Promise<void>;

  // Action notice / toasts
  setActionNotice: (
    text: string,
    tone?: ProStreamerFeedbackTone,
    ttlMs?: number,
  ) => void;
  dismissToast: (id: string) => void;
  dismissGoLiveInlineNotice: () => void;
  dismissActionLogInlineNotice: () => void;

  // Generic state setter
  setState: <K extends keyof AppState>(key: K, value: AppState[K]) => void;

  // Clipboard
  copyToClipboard: (text: string) => Promise<void>;
}

type OnboardingNextOptions = {
  allowPermissionBypass?: boolean;
};

type AppContextValue = AppState & AppActions;

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: ReactNode }) {
  // --- Core state ---
  const [tab, setTabRaw] = useState<Tab>("chat");
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(loadTheme);
  const [dockSurface, setDockSurface] = useState<DockSurface>("none");
  const [streamViewMode, setStreamViewMode] =
    useState<"broadcast" | "operator">("broadcast");
  const [leftRailState, setLeftRailState] =
    useState<RailBubbleState>("collapsed");
  const [rightRailState, setRightRailState] =
    useState<RailBubbleState>("collapsed");
  const [activeBubble, setActiveBubble] = useState<ActiveBubble>("none");
  const [hudSurface, setHudSurface] = useState<HudSurface>("none");
  const [hudControlSection, setHudControlSection] =
    useState<HudControlSection | null>(null);
  const [hudAssetSection, setHudAssetSection] =
    useState<HudAssetSection | null>(null);
  const [connected, setConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [startupPhase, setStartupPhase] =
    useState<StartupPhase>("starting-backend");
  const [startupError, setStartupError] = useState<StartupErrorState | null>(
    null,
  );
  const [startupRetryNonce, setStartupRetryNonce] = useState(0);
  const [authRequired, setAuthRequired] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [goLiveInlineNotice, setGoLiveInlineNotice] =
    useState<GoLiveInlineNotice | null>(null);
  const [actionLogInlineNotice, setActionLogInlineNotice] =
    useState<ActionLogInlineNotice | null>(null);
  const actionNotice: ActionNotice | null =
    toasts.length > 0
      ? { tone: toasts[0].tone, text: toasts[0].text }
      : null;
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleAction, setLifecycleAction] =
    useState<LifecycleAction | null>(null);

  // --- Deferred restart ---
  const [pendingRestart, setPendingRestart] = useState(false);
  const [pendingRestartReasons, setPendingRestartReasons] = useState<string[]>(
    [],
  );
  const [restartBannerDismissed, setRestartBannerDismissed] = useState(false);

  // --- Pairing ---
  const [pairingEnabled, setPairingEnabled] = useState(false);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<number | null>(null);
  const [pairingCodeInput, setPairingCodeInput] = useState("");
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);

  // --- Chat ---
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatFirstTokenReceived, setChatFirstTokenReceived] = useState(false);
  const [chatAvatarVisible, setChatAvatarVisible] = useState(
    loadChatAvatarVisible,
  );
  const [chatAgentVoiceMuted, setChatAgentVoiceMuted] =
    useState(loadChatVoiceMuted);
  const [chatAvatarSpeaking, setChatAvatarSpeaking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([]);
  const [autonomousEvents, setAutonomousEvents] = useState<
    StreamEventEnvelope[]
  >([]);
  const [autonomousLatestEventId, setAutonomousLatestEventId] = useState<
    string | null
  >(null);
  const [unreadConversations, setUnreadConversations] = useState<Set<string>>(
    new Set(),
  );
  const [autonomousRunOpen, setAutonomousRunOpen] = useState(false);
  const [autoRunMode, setAutoRunMode] =
    useState<Five55AutonomyMode>("newscast");
  const [autoRunTopic, setAutoRunTopic] = useState("");
  const [autoRunDurationMin, setAutoRunDurationMin] = useState(30);
  const [autoRunAvatarRuntime, setAutoRunAvatarRuntime] = useState<
    "auto" | "local" | "premium"
  >("local");
  const [autoRunPreview, setAutoRunPreview] =
    useState<Five55AutonomyPreviewResponse | null>(null);
  const [autoRunPreviewBusy, setAutoRunPreviewBusy] = useState(false);
  const [autoRunLaunching, setAutoRunLaunching] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    saveChatAvatarVisible(chatAvatarVisible);
  }, [chatAvatarVisible]);

  useEffect(() => {
    saveChatVoiceMuted(chatAgentVoiceMuted);
  }, [chatAgentVoiceMuted]);

  useEffect(() => {
    setAutoRunPreview(null);
  }, [autoRunMode, autoRunTopic, autoRunDurationMin, autoRunAvatarRuntime]);

  // --- Triggers ---
  const [triggers, setTriggers] = useState<TriggerSummary[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [triggersSaving, setTriggersSaving] = useState(false);
  const [triggerRunsById, setTriggerRunsById] = useState<
    Record<string, TriggerRunRecord[]>
  >({});
  const [triggerHealth, setTriggerHealth] =
    useState<TriggerHealthSnapshot | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // --- Plugins ---
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [pluginFilter, setPluginFilter] = useState<
    "all" | "ai-provider" | "connector" | "feature"
  >("all");
  const [pluginStatusFilter, setPluginStatusFilter] = useState<
    "all" | "enabled" | "disabled"
  >("all");
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginSettingsOpen, setPluginSettingsOpen] = useState<Set<string>>(
    new Set(),
  );
  const [pluginAdvancedOpen, setPluginAdvancedOpen] = useState<Set<string>>(
    new Set(),
  );
  const [pluginSaving, setPluginSaving] = useState<Set<string>>(new Set());
  const [pluginSaveSuccess, setPluginSaveSuccess] = useState<Set<string>>(
    new Set(),
  );

  // --- Skills ---
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsSubTab, setSkillsSubTab] = useState<"my" | "browse">("my");
  const [skillCreateFormOpen, setSkillCreateFormOpen] = useState(false);
  const [skillCreateName, setSkillCreateName] = useState("");
  const [skillCreateDescription, setSkillCreateDescription] = useState("");
  const [skillCreating, setSkillCreating] = useState(false);
  const [skillReviewReport, setSkillReviewReport] =
    useState<SkillScanReportSummary | null>(null);
  const [skillReviewId, setSkillReviewId] = useState("");
  const [skillReviewLoading, setSkillReviewLoading] = useState(false);
  const [skillToggleAction, setSkillToggleAction] = useState("");
  const [skillsMarketplaceQuery, setSkillsMarketplaceQuery] = useState("");
  const [skillsMarketplaceResults, setSkillsMarketplaceResults] = useState<
    SkillMarketplaceResult[]
  >([]);
  const [skillsMarketplaceError, setSkillsMarketplaceError] = useState("");
  const [skillsMarketplaceLoading, setSkillsMarketplaceLoading] =
    useState(false);
  const [skillsMarketplaceAction, setSkillsMarketplaceAction] = useState("");
  const [
    skillsMarketplaceManualGithubUrl,
    setSkillsMarketplaceManualGithubUrl,
  ] = useState("");

  // --- Logs ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logSources, setLogSources] = useState<string[]>([]);
  const [logTags, setLogTags] = useState<string[]>([]);
  const [logTagFilter, setLogTagFilter] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState("");
  const [logSourceFilter, setLogSourceFilter] = useState("");

  // --- Wallet / Inventory ---
  const [walletAddresses, setWalletAddresses] =
    useState<WalletAddresses | null>(null);
  const [walletConfig, setWalletConfig] = useState<WalletConfigStatus | null>(
    null,
  );
  const [walletBalances, setWalletBalances] =
    useState<WalletBalancesResponse | null>(null);
  const [walletNfts, setWalletNfts] = useState<WalletNftsResponse | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletNftsLoading, setWalletNftsLoading] = useState(false);
  const [inventoryView, setInventoryView] = useState<"tokens" | "nfts">(
    "tokens",
  );
  const [walletExportData, setWalletExportData] =
    useState<WalletExportResult | null>(null);
  const [walletExportVisible, setWalletExportVisible] = useState(false);
  const [walletApiKeySaving, setWalletApiKeySaving] = useState(false);
  const [inventorySort, setInventorySort] = useState<
    "chain" | "symbol" | "value"
  >("value");
  const [walletError, setWalletError] = useState<string | null>(null);

  // --- ERC-8004 Registry ---
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(
    null,
  );
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryRegistering, setRegistryRegistering] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);

  // --- Drop / Mint ---
  const [dropStatus, setDropStatus] = useState<DropStatus | null>(null);
  const [dropLoading, setDropLoading] = useState(false);
  const [mintInProgress, setMintInProgress] = useState(false);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintShiny, setMintShiny] = useState(false);

  // --- Whitelist ---
  const [whitelistStatus, setWhitelistStatus] =
    useState<WhitelistStatus | null>(null);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [twitterVerifyMessage] = useState<string | null>(null);
  const [twitterVerifyUrl] = useState("");
  const [twitterVerifying] = useState(false);

  // --- Character ---
  const [characterData, setCharacterData] = useState<CharacterData | null>(
    null,
  );
  const [characterLoading, setCharacterLoading] = useState(false);
  const [characterSaving, setCharacterSaving] = useState(false);
  const [characterSaveSuccess, setCharacterSaveSuccess] = useState<
    string | null
  >(null);
  const [characterSaveError, setCharacterSaveError] = useState<string | null>(
    null,
  );
  const [characterDraft, setCharacterDraft] = useState<CharacterData>({});
  const [selectedVrmIndex, setSelectedVrmIndexRaw] = useState(loadAvatarIndex);
  const [customVrmUrl, setCustomVrmUrl] = useState("");

  // Wrap setter to also persist to localStorage
  const setSelectedVrmIndex = useCallback((v: number) => {
    const normalized = normalizeAvatarIndex(v);
    setSelectedVrmIndexRaw(normalized);
    saveAvatarIndex(normalized);
  }, []);

  // --- Cloud ---
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [cloudCredits, setCloudCredits] = useState<number | null>(null);
  const [cloudCreditsLow, setCloudCreditsLow] = useState(false);
  const [cloudCreditsCritical, setCloudCreditsCritical] = useState(false);
  const [cloudTopUpUrl, setCloudTopUpUrl] = useState(
    "https://www.elizacloud.ai/dashboard/settings?tab=billing",
  );
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);
  const [cloudLoginBusy, setCloudLoginBusy] = useState(false);
  const [cloudLoginError, setCloudLoginError] = useState<string | null>(null);
  const [cloudDisconnecting, setCloudDisconnecting] = useState(false);

  // --- Updates ---
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateChannelSaving, setUpdateChannelSaving] = useState(false);

  // --- Extension ---
  const [extensionStatus, setExtensionStatus] =
    useState<ExtensionStatus | null>(null);
  const [extensionChecking, setExtensionChecking] = useState(false);

  // --- Store ---
  const [storePlugins, setStorePlugins] = useState<RegistryPlugin[]>([]);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<
    "all" | "installed" | "ai-provider" | "connector" | "feature"
  >("all");
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeInstalling, setStoreInstalling] = useState<Set<string>>(
    new Set(),
  );
  const [storeUninstalling, setStoreUninstalling] = useState<Set<string>>(
    new Set(),
  );
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeDetailPlugin, setStoreDetailPlugin] =
    useState<RegistryPlugin | null>(null);
  const [storeSubTab, setStoreSubTab] = useState<"plugins" | "skills">(
    "plugins",
  );

  // --- Catalog ---
  const [catalogSkills, setCatalogSkills] = useState<CatalogSkill[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogSort, setCatalogSort] = useState<
    "downloads" | "stars" | "updated" | "name"
  >("downloads");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogDetailSkill, setCatalogDetailSkill] =
    useState<CatalogSkill | null>(null);
  const [catalogInstalling, setCatalogInstalling] = useState<Set<string>>(
    new Set(),
  );
  const [catalogUninstalling, setCatalogUninstalling] = useState<Set<string>>(
    new Set(),
  );

  // --- Workbench ---
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbench, setWorkbench] = useState<WorkbenchOverview | null>(null);
  const [workbenchTasksAvailable, setWorkbenchTasksAvailable] = useState(false);
  const [workbenchTriggersAvailable, setWorkbenchTriggersAvailable] =
    useState(false);
  const [workbenchTodosAvailable, setWorkbenchTodosAvailable] = useState(false);

  // --- Agent export/import ---
  const [exportBusy, setExportBusy] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportIncludeLogs, setExportIncludeLogs] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // --- Onboarding ---
  const [onboardingStep, setOnboardingStep] =
    useState<OnboardingStep>("welcome");
  const [onboardingOptions, setOnboardingOptions] =
    useState<OnboardingOptions | null>(null);
  const [onboardingName, setOnboardingName] = useState("");
  const [onboardingStyle, setOnboardingStyle] = useState(
    FALLBACK_ONBOARDING_STYLE_CATCHPHRASE,
  );
  const [onboardingTheme, setOnboardingTheme] = useState<ThemeName>(loadTheme);
  const [onboardingRunMode, setOnboardingRunMode] = useState<
    "local-rawdog" | "local-sandbox" | "cloud" | ""
  >("");
  const [onboardingCloudProvider, setOnboardingCloudProvider] = useState("");
  const [onboardingSmallModel, setOnboardingSmallModel] = useState(
    "moonshotai/kimi-k2-turbo",
  );
  const [onboardingLargeModel, setOnboardingLargeModel] = useState(
    "moonshotai/kimi-k2-0905",
  );
  const [onboardingProvider, setOnboardingProvider] = useState("");
  const [onboardingApiKey, setOnboardingApiKey] = useState("");
  const [onboardingOpenRouterModel, setOnboardingOpenRouterModel] =
    useState("");
  const [onboardingPrimaryModel, setOnboardingPrimaryModel] = useState("");
  const [onboardingTelegramToken, setOnboardingTelegramToken] = useState("");
  const [onboardingDiscordToken, setOnboardingDiscordToken] = useState("");
  const [onboardingWhatsAppSessionPath, setOnboardingWhatsAppSessionPath] =
    useState("");
  const [onboardingTwilioAccountSid, setOnboardingTwilioAccountSid] =
    useState("");
  const [onboardingTwilioAuthToken, setOnboardingTwilioAuthToken] =
    useState("");
  const [onboardingTwilioPhoneNumber, setOnboardingTwilioPhoneNumber] =
    useState("");
  const [onboardingBlooioApiKey, setOnboardingBlooioApiKey] = useState("");
  const [onboardingBlooioPhoneNumber, setOnboardingBlooioPhoneNumber] =
    useState("");
  const [onboardingGithubToken, setOnboardingGithubToken] = useState("");
  const [onboardingSubscriptionTab, setOnboardingSubscriptionTab] = useState<
    "token" | "oauth"
  >("token");
  const [onboardingSelectedChains, setOnboardingSelectedChains] = useState<
    Set<string>
  >(new Set(["evm", "solana"]));
  const [onboardingRpcSelections, setOnboardingRpcSelections] = useState<
    Record<string, string>
  >({});
  const [onboardingRpcKeys, setOnboardingRpcKeys] = useState<
    Record<string, string>
  >({});
  const [onboardingAvatar, setOnboardingAvatar] = useState(1);
  const [onboardingRestarting, setOnboardingRestarting] = useState(false);

  // Keep style selection canonicalized when options load or aliases change.
  useEffect(() => {
    if (!onboardingOptions) return;
    setOnboardingStyle((current) => {
      const resolved = resolveOnboardingStyleCatchphrase(onboardingOptions, current);
      return current === resolved ? current : resolved;
    });
  }, [onboardingOptions]);

  // --- Command palette ---
  const [commandPaletteOpen, _setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  // --- Emote picker ---
  const [emotePickerOpen, setEmotePickerOpen] = useState(false);
  const [availableEmotes, setAvailableEmotes] = useState<AvatarEmoteDef[]>([]);
  const [activeAvatarEmoteId, setActiveAvatarEmoteId] = useState<string | null>(
    null,
  );
  const [avatarMotionMode, setAvatarMotionMode] = useState<
    "idle" | "manual" | "auto"
  >("idle");
  const avatarMotionResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingManualAvatarEmoteRef = useRef<{
    emoteId: string;
    expiresAt: number;
  } | null>(null);

  // --- MCP ---
  const [mcpConfiguredServers, setMcpConfiguredServers] = useState<
    Record<string, McpServerConfig>
  >({});
  const [mcpServerStatuses, setMcpServerStatuses] = useState<McpServerStatus[]>(
    [],
  );
  const [mcpMarketplaceQuery, setMcpMarketplaceQuery] = useState("");
  const [mcpMarketplaceResults, setMcpMarketplaceResults] = useState<
    McpMarketplaceResult[]
  >([]);
  const [mcpMarketplaceLoading, setMcpMarketplaceLoading] = useState(false);
  const [mcpAction, setMcpAction] = useState("");
  const [mcpAddingServer, setMcpAddingServer] =
    useState<McpRegistryServerDetail | null>(null);
  const [mcpAddingResult, setMcpAddingResult] =
    useState<McpMarketplaceResult | null>(null);
  const [mcpEnvInputs, setMcpEnvInputs] = useState<Record<string, string>>({});
  const [mcpHeaderInputs, setMcpHeaderInputs] = useState<
    Record<string, string>
  >({});

  // --- Share ingest ---
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [shareIngestNotice, setShareIngestNotice] = useState("");

  // --- Chat pending images ---
  const [chatPendingImages, setChatPendingImages] = useState<ImageAttachment[]>(
    [],
  );

  // --- Game ---
  const [activeGameApp, setActiveGameApp] = useState("");
  const [activeGameDisplayName, setActiveGameDisplayName] = useState("");
  const [activeGameViewerUrl, setActiveGameViewerUrl] = useState("");
  const [activeGameSandbox, setActiveGameSandbox] = useState(
    "allow-scripts allow-same-origin allow-popups",
  );
  const [activeGamePostMessageAuth, setActiveGamePostMessageAuth] =
    useState(false);
  const [activeGamePostMessagePayload, setActiveGamePostMessagePayload] =
    useState<GamePostMessageAuthPayload | null>(null);
  const [five55MasteryRuns, setFive55MasteryRuns] = useState<Five55MasteryRun[]>(
    [],
  );
  const [five55MasteryRunsLoading, setFive55MasteryRunsLoading] =
    useState(false);
  const [liveBroadcastState, setLiveBroadcastState] =
    useState<"offline" | "live">("offline");
  const [goLiveModalOpen, setGoLiveModalOpen] = useState(false);
  const [liveSecondarySources, setLiveSecondarySources] = useState<
    LiveSecondarySource[]
  >([]);
  const [gameOverlayEnabled, setGameOverlayEnabled] = useState(false);
  const quickLayerStatuses = useMemo(
    () => buildQuickLayerStatusRecord(plugins),
    [plugins],
  );
  const liveLayoutMode = useMemo(
    () => resolveLiveLayoutMode(liveSecondarySources),
    [liveSecondarySources],
  );
  const liveSceneId = useMemo(
    () => resolveLiveSceneId(liveLayoutMode),
    [liveLayoutMode],
  );
  const liveHeroSource = useMemo(
    () => resolveLiveHeroSource(liveSecondarySources),
    [liveSecondarySources],
  );
  const availableEmoteById = useMemo(
    () => new Map(availableEmotes.map((emote) => [emote.id, emote])),
    [availableEmotes],
  );

  useEffect(() => {
    if (activeGameViewerUrl.trim()) return;
    setLiveSecondarySources((current) =>
      removeLiveSecondarySource(current, "active-game"),
    );
  }, [activeGameViewerUrl]);

  // --- Admin ---
  const [appsSubTab, setAppsSubTab] = useState<"browse" | "games">("browse");
  const [agentSubTab, setAgentSubTab] = useState<
    "character" | "inventory" | "knowledge"
  >("character");
  const [pluginsSubTab, setPluginsSubTab] = useState<
    "features" | "connectors" | "plugins"
  >("features");
  const [databaseSubTab, setDatabaseSubTab] = useState<
    "tables" | "media" | "vectors"
  >("tables");

  // --- Config ---
  const [configRaw, setConfigRaw] = useState<Record<string, unknown>>({});
  const [configText, setConfigText] = useState("");

  // --- Refs for timers ---
  const toastIdCounter = useRef(0);
  const actionLogNoticeIdCounter = useRef(0);
  const cloudPollInterval = useRef<number | null>(null);
  const cloudLoginPollTimer = useRef<number | null>(null);
  const prevAgentStateRef = useRef<string | null>(null);
  const lifecycleBusyRef = useRef(false);
  const lifecycleActionRef = useRef<LifecycleAction | null>(null);
  /** Synchronous lock for onboarding finish to prevent duplicate same-tick submits. */
  const onboardingFinishBusyRef = useRef(false);
  const pairingBusyRef = useRef(false);
  /** Guards against double-greeting when both init and state-transition paths fire. */
  const greetingFiredRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  /** Synchronous lock so same-tick chat submits cannot double-send. */
  const chatSendBusyRef = useRef(false);
  /** Synchronous lock for export action to prevent duplicate clicks in the same tick. */
  const exportBusyRef = useRef(false);
  /** Synchronous lock for import action to prevent duplicate clicks in the same tick. */
  const importBusyRef = useRef(false);
  /** Synchronous lock for wallet API key save to prevent duplicate clicks in the same tick. */
  const walletApiKeySavingRef = useRef(false);
  /** Synchronous lock for cloud login action to prevent duplicate clicks in the same tick. */
  const cloudLoginBusyRef = useRef(false);
  /** Synchronous lock for update channel changes to prevent duplicate submits. */
  const updateChannelSavingRef = useRef(false);
  /** Synchronous lock for onboarding completion submit to prevent duplicate clicks. */
  const onboardingFinishSavingRef = useRef(false);

  // ── Action notice / toasts ─────────────────────────────────────────

  const toastTimers = useRef<Map<string, number>>(new Map());

  // Clean up all toast timers on unmount
  useEffect(() => {
    const timers = toastTimers.current;
    return () => { timers.forEach((t) => window.clearTimeout(t)); timers.clear(); };
  }, []);

  const dismissToast = useCallback((id: string) => {
    const handle = toastTimers.current.get(id);
    if (handle != null) { window.clearTimeout(handle); toastTimers.current.delete(id); }
    setToasts((prev: ToastItem[]) => prev.filter((t: ToastItem) => t.id !== id));
  }, []);

  const pushToastFeedback = useCallback(
    ({ message, tone, ttlMs = 2800 }: ProStreamerToastFeedback) => {
      const id = `toast-${++toastIdCounter.current}`;
      setToasts((prev: ToastItem[]) => [...prev.slice(-2), { id, text: message, tone }]);
      const handle = window.setTimeout(() => {
        toastTimers.current.delete(id);
        setToasts((prev: ToastItem[]) => prev.filter((t: ToastItem) => t.id !== id));
      }, ttlMs);
      toastTimers.current.set(id, handle);
    },
    [],
  );

  const dismissGoLiveInlineNotice = useCallback(() => {
    setGoLiveInlineNotice(null);
  }, []);

  const dismissActionLogInlineNotice = useCallback(() => {
    setActionLogInlineNotice(null);
  }, []);

  const setActionNotice = useCallback(
    (text: string, tone: ProStreamerFeedbackTone = "info", ttlMs = 2800) => {
      pushToastFeedback({ target: "toast", message: text, tone, ttlMs });
    },
    [pushToastFeedback],
  );

  // ── Clipboard ──────────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, []);

  // ── Theme ──────────────────────────────────────────────────────────

  const lastLegacyTabRef = useRef<Tab>("chat");

  const collapseRails = useCallback(() => {
    setLeftRailState("collapsed");
    setRightRailState("collapsed");
    setActiveBubble("none");
  }, []);

  const setRailDisplay = useCallback(
    (bubble: Exclude<ActiveBubble, "none">, state: RailBubbleState) => {
      if (bubble === "action-log") {
        setLeftRailState(state);
        setRightRailState("collapsed");
        setActiveBubble(state === "collapsed" ? "none" : "action-log");
        return;
      }
      setRightRailState(state);
      setLeftRailState("collapsed");
      setActiveBubble(state === "collapsed" ? "none" : "mission-stack");
    },
    [],
  );

  const openActionLogSurface = useCallback(() => {
    setRailDisplay("action-log", "expanded");
  }, [setRailDisplay]);

  const proStreamerFeedbackSinks = useMemo<ProStreamerFeedbackSinks>(
    () => ({
      showToast: pushToastFeedback,
      showGoLiveInline: (feedback) => {
        setGoLiveInlineNotice({
          tone: feedback.tone,
          message: feedback.message,
        });
      },
      showActionLogInline: (feedback: ProStreamerActionLogInlineFeedback) => {
        setActionLogInlineNotice({
          id: `action-log-inline-${++actionLogNoticeIdCounter.current}`,
          tone: feedback.tone,
          title: feedback.title,
          message: feedback.message,
          actionLabel: feedback.actionLabel,
        });
      },
      showModal: (feedback: ProStreamerModalFeedback) => {
        setGoLiveInlineNotice({
          tone: feedback.tone,
          message: feedback.message,
        });
      },
      openActionLog: openActionLogSurface,
    }),
    [openActionLogSurface, pushToastFeedback],
  );

  const closeHudSurface = useCallback(() => {
    collapseRails();
    setHudSurface("none");
    setHudControlSection(null);
  }, [collapseRails]);

  const closeDockSurface = useCallback(() => {
    setDockSurface("none");
  }, []);

  const openDockSurface = useCallback(
    (surface: Exclude<DockSurface, "none">) => {
      collapseRails();
      setHudSurface("none");
      setHudControlSection(null);
      setDockSurface(surface);

      if (surface === "vault") {
        setHudAssetSection(
          (current) => current ?? assetVaultSectionForTab(tab) ?? "identity",
        );
        return;
      }

      setHudAssetSection(null);
      if (surface === "memory") {
        setTabRaw("knowledge");
        return;
      }

      if (surface === "ops") {
        setTabRaw("plugins");
      }
    },
    [collapseRails, tab],
  );

  const openHudControlStack = useCallback(
    (section: HudControlSection = "settings", tabOverride?: Tab) => {
      const resolvedSection = sanitizeControlSection(section);
      const overrideSection = tabOverride ? controlSectionForTab(tabOverride) : null;
      const targetTab =
        tabOverride &&
        isTabEnabled(tabOverride) &&
        overrideSection === resolvedSection
          ? tabOverride
          : defaultTabForControlSection(resolvedSection);
      collapseRails();
      setDockSurface("none");
      setHudSurface("control-stack");
      setHudControlSection(resolvedSection);
      setHudAssetSection(null);
      setTabRaw(targetTab);
    },
    [collapseRails],
  );

  const openHudAssetVault = useCallback(
    (section: HudAssetSection = "identity", tabOverride?: Tab) => {
      const targetTab =
        tabOverride && isTabEnabled(tabOverride) ? tabOverride : section;
      collapseRails();
      setDockSurface("vault");
      setHudSurface("none");
      setHudAssetSection(section);
      setHudControlSection(null);
      setTabRaw(targetTab);
    },
    [collapseRails],
  );

  const applyMiladyTabIntent = useCallback(
    (newTab: Tab) => {
      const targetTab = isTabEnabled(newTab) ? newTab : "chat";
      setTabRaw(targetTab);
      const controlSection = controlSectionForTab(targetTab);
      const assetSection = assetVaultSectionForTab(targetTab);
      if (controlSection) {
        collapseRails();
        setDockSurface("none");
        setHudSurface("control-stack");
        setHudControlSection(controlSection);
        setHudAssetSection(null);
        return;
      }
      if (assetSection) {
        collapseRails();
        setDockSurface("vault");
        setHudSurface("none");
        setHudAssetSection(assetSection);
        setHudControlSection(null);
        return;
      }
      if (targetTab === "knowledge") {
        collapseRails();
        setDockSurface("memory");
        setHudSurface("none");
        setHudControlSection(null);
        setHudAssetSection(null);
        return;
      }
      collapseRails();
      setDockSurface("none");
      setHudSurface("none");
      setHudControlSection(null);
      setHudAssetSection(null);
    },
    [collapseRails],
  );

  const setTheme = useCallback((name: ThemeName) => {
    const switchingToMilady = name === "milady-os" && currentTheme !== "milady-os";
    const switchingFromMilady = name !== "milady-os" && currentTheme === "milady-os";

    setCurrentTheme(name);
    applyTheme(name);

    if (switchingToMilady) {
      collapseRails();
      applyMiladyTabIntent(tab);
      replaceMiladyLocationWithRoot();
      return;
    }

    if (switchingFromMilady) {
      collapseRails();
      setDockSurface("none");
      setHudSurface("none");
      setHudControlSection(null);
      setHudAssetSection(null);
      const restoreTab = lastLegacyTabRef.current || "chat";
      setTabRaw(restoreTab);
      const path = pathForTab(restoreTab);
      if (window.location.protocol === "file:") {
        window.location.hash = path;
      } else {
        window.history.replaceState(null, "", path);
      }
    }
  }, [applyMiladyTabIntent, currentTheme, tab]);

  // ── Navigation ─────────────────────────────────────────────────────

  const setTab = useCallback(
    (newTab: Tab) => {
      if (!isTabEnabled(newTab)) return;
      if (newTab === "apps") {
        setAppsSubTab(activeGameViewerUrl.trim() ? "games" : "browse");
      }
      if (currentTheme === "milady-os") {
        applyMiladyTabIntent(newTab);
        return;
      }
      setTabRaw(newTab);
      lastLegacyTabRef.current = newTab;
      const path = pathForTab(newTab);
      // In Electron packaged builds (file:// URLs), use hash routing to avoid
      // "Not allowed to load local resource: file:///..." errors.
      if (window.location.protocol === "file:") {
        window.location.hash = path;
      } else {
        window.history.pushState(null, "", path);
      }
    },
    [activeGameViewerUrl, applyMiladyTabIntent, currentTheme],
  );

  const sortTriggersByNextRun = useCallback(
    (items: TriggerSummary[]): TriggerSummary[] => {
      return [...items].sort((a: TriggerSummary, b: TriggerSummary) => {
        const aNext = a.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
        const bNext = b.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
        if (aNext !== bNext) return aNext - bNext;
        return a.displayName.localeCompare(b.displayName);
      });
    },
    [],
  );

  // ── Data loading ───────────────────────────────────────────────────

  const loadPlugins = useCallback(async () => {
    try {
      const { plugins: p } = await client.getPlugins();
      setPlugins(p);
    } catch (err) {
      console.error("[loadPlugins]", err);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    try {
      const { skills: s } = await client.getSkills();
      setSkills(s);
    } catch (err) {
      console.error("[loadSkills]", err);
    }
  }, []);

  const refreshSkills = useCallback(async () => {
    try {
      const { skills: s } = await client.refreshSkills();
      setSkills(s);
    } catch {
      try {
        const { skills: s } = await client.getSkills();
        setSkills(s);
      } catch (err) {
        console.error("[refreshSkills]", err);
      }
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const filter: Record<string, string> = {};
      if (logTagFilter) filter.tag = logTagFilter;
      if (logLevelFilter) filter.level = logLevelFilter;
      if (logSourceFilter) filter.source = logSourceFilter;
      const data = await client.getLogs(
        Object.keys(filter).length > 0 ? filter : undefined,
      );
      setLogs(data.entries);
      if (data.sources?.length) setLogSources(data.sources);
      if (data.tags?.length) setLogTags(data.tags);
    } catch (err) {
      console.error("[loadLogs]", err);
    }
  }, [logTagFilter, logLevelFilter, logSourceFilter]);

  const loadFive55MasteryRuns = useCallback(async () => {
    setFive55MasteryRunsLoading(true);
    try {
      const page = await client.listFive55MasteryRuns({ limit: 20 });
      setFive55MasteryRuns(page.runs);
    } catch (err) {
      console.error("[loadFive55MasteryRuns]", err);
    } finally {
      setFive55MasteryRunsLoading(false);
    }
  }, []);

  const startFive55MasteryRun = useCallback(
    async (input?: {
      suiteId?: string;
      games?: string[];
      episodesPerGame?: number;
      seedMode?: "fixed" | "mixed" | "rolling";
      maxDurationSec?: number;
      strict?: boolean;
    }): Promise<string | null> => {
      try {
        const result = await client.startFive55MasteryRun({
          suiteId: input?.suiteId,
          games: input?.games,
          episodesPerGame: input?.episodesPerGame,
          seedMode: input?.seedMode,
          maxDurationSec: input?.maxDurationSec,
          strict: input?.strict,
        });
        await loadFive55MasteryRuns();
        return result.runId;
      } catch (err) {
        console.error("[startFive55MasteryRun]", err);
        return null;
      }
    },
    [loadFive55MasteryRuns],
  );

  const loadTriggerHealth = useCallback(async () => {
    try {
      const health = await client.getTriggerHealth();
      setTriggerHealth(health);
    } catch {
      setTriggerHealth(null);
    }
  }, []);

  const loadTriggers = useCallback(async () => {
    setTriggersLoading(true);
    try {
      const data = await client.getTriggers();
      setTriggers(sortTriggersByNextRun(data.triggers));
      setTriggerError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load triggers";
      setTriggerError(message);
      setTriggers([]);
    } finally {
      setTriggersLoading(false);
    }
  }, [sortTriggersByNextRun]);

  const loadTriggerRuns = useCallback(async (id: string) => {
    try {
      const data = await client.getTriggerRuns(id);
      setTriggerRunsById((prev: Record<string, TriggerRunRecord[]>) => ({
        ...prev,
        [id]: data.runs,
      }));
      setTriggerError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load trigger runs";
      setTriggerError(message);
    }
  }, []);

  const createTrigger = useCallback(
    async (request: CreateTriggerRequest): Promise<TriggerSummary | null> => {
      setTriggersSaving(true);
      try {
        const response = await client.createTrigger(request);
        const created = response.trigger;
        setTriggers((prev: TriggerSummary[]) => {
          const merged = prev.filter(
            (item: TriggerSummary) => item.id !== created.id,
          );
          merged.push(created);
          return sortTriggersByNextRun(merged);
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return created;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, sortTriggersByNextRun],
  );

  const updateTrigger = useCallback(
    async (
      id: string,
      request: UpdateTriggerRequest,
    ): Promise<TriggerSummary | null> => {
      setTriggersSaving(true);
      try {
        const response = await client.updateTrigger(id, request);
        const updated = response.trigger;
        setTriggers((prev: TriggerSummary[]) => {
          const merged = prev.map((item: TriggerSummary) =>
            item.id === updated.id ? updated : item,
          );
          return sortTriggersByNextRun(merged);
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return updated;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update trigger";
        setTriggerError(message);
        return null;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, sortTriggersByNextRun],
  );

  const deleteTrigger = useCallback(
    async (id: string): Promise<boolean> => {
      setTriggersSaving(true);
      try {
        await client.deleteTrigger(id);
        setTriggers((prev: TriggerSummary[]) =>
          prev.filter((item: TriggerSummary) => item.id !== id),
        );
        setTriggerRunsById((prev: Record<string, TriggerRunRecord[]>) => {
          const next: Record<string, TriggerRunRecord[]> = {};
          for (const [key, runs] of Object.entries(prev)) {
            if (key !== id) next[key] = runs;
          }
          return next;
        });
        setTriggerError(null);
        void loadTriggerHealth();
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete trigger";
        setTriggerError(message);
        return false;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth],
  );

  const runTriggerNow = useCallback(
    async (id: string): Promise<boolean> => {
      setTriggersSaving(true);
      try {
        const response = await client.runTriggerNow(id);
        if (response.trigger) {
          const trigger = response.trigger;
          setTriggers((prev: TriggerSummary[]) => {
            const idx = prev.findIndex(
              (item: TriggerSummary) => item.id === id,
            );
            if (idx === -1) {
              return sortTriggersByNextRun([...prev, trigger]);
            }
            const updated = [...prev];
            updated[idx] = trigger;
            return sortTriggersByNextRun(updated);
          });
        } else {
          await loadTriggers();
        }
        await loadTriggerRuns(id);
        void loadTriggerHealth();
        setTriggerError(null);
        return response.ok;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to run trigger";
        setTriggerError(message);
        return false;
      } finally {
        setTriggersSaving(false);
      }
    },
    [loadTriggerHealth, loadTriggerRuns, loadTriggers, sortTriggersByNextRun],
  );

  const appendAutonomousEvent = useCallback((event: StreamEventEnvelope) => {
    setAutonomousEvents((prev) => {
      if (prev.some((entry) => entry.eventId === event.eventId)) {
        return prev;
      }
      const merged = [...prev, event];
      if (merged.length > 1200) {
        return merged.slice(merged.length - 1200);
      }
      return merged;
    });
    setAutonomousLatestEventId(event.eventId);
  }, []);

  const loadConversations = useCallback(async (): Promise<
    Conversation[] | null
  > => {
    try {
      const { conversations: c } = await client.listConversations();
      setConversations(c);
      return c;
    } catch {
      return null;
    }
  }, []);

  const loadConversationMessages = useCallback(
    async (convId: string): Promise<LoadConversationMessagesResult> => {
      try {
        const { messages } = await client.getConversationMessages(convId);
        setConversationMessages(messages);
        return { ok: true };
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          const refreshed = await client.listConversations().catch(() => null);
          if (refreshed) {
            setConversations(refreshed.conversations);
            if (activeConversationIdRef.current === convId) {
              const fallbackId = refreshed.conversations[0]?.id ?? null;
              setActiveConversationId(fallbackId);
              activeConversationIdRef.current = fallbackId;
            }
          } else if (activeConversationIdRef.current === convId) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
          }
        }
        setConversationMessages([]);
        return {
          ok: false,
          status,
          message:
            err instanceof Error
              ? err.message
              : "Failed to load conversation messages",
        };
      }
    },
    [],
  );

  const loadWalletConfig = useCallback(async () => {
    try {
      const cfg = await client.getWalletConfig();
      setWalletConfig(cfg);
      setWalletAddresses({
        evmAddress: cfg.evmAddress,
        solanaAddress: cfg.solanaAddress,
      });
      setWalletError(null);
    } catch (err) {
      setWalletError(
        `Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
  }, []);

  const loadBalances = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const b = await client.getWalletBalances();
      setWalletBalances(b);
    } catch (err) {
      setWalletError(
        `Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
    setWalletLoading(false);
  }, []);

  const loadNfts = useCallback(async () => {
    setWalletNftsLoading(true);
    setWalletError(null);
    try {
      const n = await client.getWalletNfts();
      setWalletNfts(n);
    } catch (err) {
      setWalletError(
        `Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
    setWalletNftsLoading(false);
  }, []);

  const loadInventory = useCallback(async () => {
    await loadWalletConfig();
  }, [loadWalletConfig]);

  const loadCharacter = useCallback(async () => {
    setCharacterLoading(true);
    setCharacterSaveError(null);
    setCharacterSaveSuccess(null);
    try {
      const { character } = await client.getCharacter();
      setCharacterData(character);
      setCharacterDraft({
        name: character.name ?? "",
        username: character.username ?? "",
        bio: Array.isArray(character.bio)
          ? character.bio.join("\n")
          : (character.bio ?? ""),
        system: character.system ?? "",
        adjectives: character.adjectives ?? [],
        topics: character.topics ?? [],
        style: {
          all: character.style?.all ?? [],
          chat: character.style?.chat ?? [],
          post: character.style?.post ?? [],
        },
        postExamples: character.postExamples ?? [],
      });
    } catch (err) {
      console.error("[loadCharacter]", err);
      setCharacterData(null);
      setCharacterDraft({});
    }
    setCharacterLoading(false);
  }, []);

  const loadWorkbench = useCallback(async () => {
    setWorkbenchLoading(true);
    try {
      const result = await client.getWorkbenchOverview();
      setWorkbench(result);
      setWorkbenchTasksAvailable(result.tasksAvailable ?? false);
      setWorkbenchTriggersAvailable(result.triggersAvailable ?? false);
      setWorkbenchTodosAvailable(result.todosAvailable ?? false);
    } catch (err) {
      console.error("[loadWorkbench]", err);
      setWorkbench(null);
      setWorkbenchTasksAvailable(false);
      setWorkbenchTriggersAvailable(false);
      setWorkbenchTodosAvailable(false);
    } finally {
      setWorkbenchLoading(false);
    }
  }, []);

  const loadUpdateStatus = useCallback(async (force = false) => {
    setUpdateLoading(true);
    try {
      const status = await client.getUpdateStatus(force);
      setUpdateStatus(status);
    } catch (err) {
      console.error("[loadUpdateStatus]", err);
    }
    setUpdateLoading(false);
  }, []);

  const checkExtensionStatus = useCallback(async () => {
    setExtensionChecking(true);
    try {
      const ext = await client.getExtensionStatus();
      setExtensionStatus(ext);
    } catch {
      setExtensionStatus({
        relayReachable: false,
        relayPort: 18792,
        extensionPath: null,
      });
    }
    setExtensionChecking(false);
  }, []);

  const pollCloudCredits = useCallback(async () => {
    const cloudStatus = await client.getCloudStatus().catch(() => null);
    if (!cloudStatus) {
      setCloudConnected(false);
      setCloudCredits(null);
      setCloudCreditsLow(false);
      setCloudCreditsCritical(false);
      return;
    }
    // A cached cloud API key represents a completed login and should be shared
    // across all views, even before runtime CLOUD_AUTH fully initializes.
    const isConnected = Boolean(cloudStatus.connected || cloudStatus.hasApiKey);
    setCloudEnabled(Boolean(cloudStatus.enabled ?? false));
    setCloudConnected(Boolean(isConnected));
    setCloudUserId(cloudStatus.userId ?? null);
    if (cloudStatus.topUpUrl) setCloudTopUpUrl(cloudStatus.topUpUrl);
    if (isConnected) {
      const credits = await client.getCloudCredits().catch(() => null);
      if (credits && typeof credits.balance === "number") {
        setCloudCredits(credits.balance);
        setCloudCreditsLow(credits.low ?? false);
        setCloudCreditsCritical(credits.critical ?? false);
        if (credits.topUpUrl) setCloudTopUpUrl(credits.topUpUrl);
      } else {
        setCloudCredits(null);
        setCloudCreditsLow(false);
        setCloudCreditsCritical(false);
        if (credits?.topUpUrl) setCloudTopUpUrl(credits.topUpUrl);
      }
    } else {
      setCloudCredits(null);
      setCloudCreditsLow(false);
      setCloudCreditsCritical(false);
    }
  }, []);

  // ── Lifecycle actions ──────────────────────────────────────────────

  const beginLifecycleAction = useCallback(
    (action: LifecycleAction): boolean => {
      if (lifecycleBusyRef.current) {
        const activeAction =
          lifecycleActionRef.current ?? lifecycleAction ?? action;
        setActionNotice(
          `Agent action already in progress (${LIFECYCLE_MESSAGES[activeAction].inProgress}). Please wait.`,
          "info",
          2800,
        );
        return false;
      }
      lifecycleBusyRef.current = true;
      lifecycleActionRef.current = action;
      setLifecycleBusy(true);
      setLifecycleAction(action);
      return true;
    },
    [lifecycleAction, setActionNotice],
  );

  const finishLifecycleAction = useCallback(() => {
    lifecycleBusyRef.current = false;
    lifecycleActionRef.current = null;
    setLifecycleBusy(false);
    setLifecycleAction(null);
  }, []);

  const handleStart = useCallback(async () => {
    if (!beginLifecycleAction("start")) return;
    setActionNotice(LIFECYCLE_MESSAGES.start.progress, "info", 3000);
    try {
      const s = await client.startAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.start.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.start.verb} agent: ${err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [beginLifecycleAction, finishLifecycleAction, setActionNotice]);

  const handleStop = useCallback(async () => {
    if (!beginLifecycleAction("stop")) return;
    setActionNotice(LIFECYCLE_MESSAGES.stop.progress, "info", 3000);
    try {
      const s = await client.stopAgent();
      setAgentStatus(s);
      setActionNotice(LIFECYCLE_MESSAGES.stop.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.stop.verb} agent: ${err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [beginLifecycleAction, finishLifecycleAction, setActionNotice]);

  const handlePauseResume = useCallback(async () => {
    if (!agentStatus) return;
    const action: LifecycleAction | null =
      agentStatus.state === "running"
        ? "pause"
        : agentStatus.state === "paused"
          ? "resume"
          : null;
    if (!action) return;
    if (!beginLifecycleAction(action)) return;
    setActionNotice(LIFECYCLE_MESSAGES[action].progress, "info", 3000);
    try {
      if (agentStatus.state === "running") {
        setAgentStatus(await client.pauseAgent());
      } else if (agentStatus.state === "paused") {
        setAgentStatus(await client.resumeAgent());
      }
      setActionNotice(LIFECYCLE_MESSAGES[action].success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES[action].verb} agent: ${err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
    } finally {
      finishLifecycleAction();
    }
  }, [
    agentStatus,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
  ]);

  const handleRestart = useCallback(async () => {
    if (!beginLifecycleAction("restart")) return;
    setActionNotice(LIFECYCLE_MESSAGES.restart.progress, "info", 3200);
    try {
      setAgentStatus({
        ...(agentStatus ?? {
          agentName: "rasp",
          model: undefined,
          uptime: undefined,
          startedAt: undefined,
        }),
        state: "restarting",
      });
      // Server restart clears in-memory conversations — reset client state
      setActiveConversationId(null);
      setConversationMessages([]);
      setConversations([]);
      const s = await client.restartAgent();
      setAgentStatus(s);
      setPendingRestart(false);
      setPendingRestartReasons([]);
      setActionNotice(LIFECYCLE_MESSAGES.restart.success, "success", 2400);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.restart.verb} agent: ${err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      setTimeout(async () => {
        try {
          setAgentStatus(await client.getStatus());
        } catch {
          /* ignore */
        }
      }, 3000);
    } finally {
      finishLifecycleAction();
    }
  }, [
    agentStatus,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
  ]);

  const dismissRestartBanner = useCallback(() => {
    setRestartBannerDismissed(true);
  }, []);

  const triggerRestart = useCallback(async () => {
    await handleRestart();
  }, [handleRestart]);

  const retryStartup = useCallback(() => {
    setStartupError(null);
    setAuthRequired(false);
    setOnboardingLoading(true);
    setStartupPhase("starting-backend");
    setStartupRetryNonce((prev) => prev + 1);
  }, []);

  const handleReset = useCallback(async () => {
    if (lifecycleBusyRef.current) {
      const activeAction =
        lifecycleActionRef.current ?? lifecycleAction ?? "reset";
      setActionNotice(
        `Agent action already in progress (${LIFECYCLE_MESSAGES[activeAction].inProgress}). Please wait.`,
        "info",
        2800,
      );
      return;
    }
    const confirmed = window.confirm(
      "This will completely reset the agent — wiping all config, memory, and data.\n\n" +
      "You will be taken back to the onboarding wizard.\n\n" +
      "Are you sure?",
    );
    if (!confirmed) return;
    if (!beginLifecycleAction("reset")) return;
    setActionNotice(LIFECYCLE_MESSAGES.reset.progress, "info", 3200);
    try {
      await client.resetAgent();
      setAgentStatus(null);
      setOnboardingComplete(false);
      setOnboardingStep("welcome");
      setConversationMessages([]);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversations([]);
      setPlugins([]);
      setSkills([]);
      setLogs([]);
      try {
        const options = await client.getOnboardingOptions();
        setOnboardingOptions(options);
      } catch {
        /* ignore */
      }
      setActionNotice(LIFECYCLE_MESSAGES.reset.success, "success", 3200);
    } catch (err) {
      setActionNotice(
        `Failed to ${LIFECYCLE_MESSAGES.reset.verb} agent: ${err instanceof Error ? err.message : "unknown error"
        }`,
        "error",
        4200,
      );
      window.alert("Reset failed. Check the console for details.");
    } finally {
      finishLifecycleAction();
    }
  }, [
    lifecycleAction,
    beginLifecycleAction,
    finishLifecycleAction,
    setActionNotice,
  ]);

  // ── Chat ───────────────────────────────────────────────────────────

  /** Request an agent greeting for a conversation and add it to messages. */
  const fetchGreeting = useCallback(async (convId: string) => {
    setChatSending(true);
    try {
      const data = await client.requestGreeting(convId);
      if (data.text) {
        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          {
            id: `greeting-${Date.now()}`,
            role: "assistant",
            text: data.text,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch {
      /* greeting failed silently — user can still chat */
    } finally {
      setChatSending(false);
    }
  }, []);

  const handleNewConversation = useCallback(async () => {
    try {
      const { conversation } = await client.createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      activeConversationIdRef.current = conversation.id;
      setConversationMessages([]);
      // Agent sends the first message
      greetingFiredRef.current = true;
      void fetchGreeting(conversation.id);
      client.sendWsMessage({
        type: "active-conversation",
        conversationId: conversation.id,
      });
    } catch {
      /* ignore */
    }
  }, [fetchGreeting]);

  const sendConversationTurn = useCallback(
    async ({
      text,
      channelType = "DM",
      images,
      userBlocks,
      clearComposer = false,
    }: {
      text: string;
      channelType?: ConversationChannelType;
      images?: ImageAttachment[];
      userBlocks?: ContentBlock[];
      clearComposer?: boolean;
    }): Promise<boolean> => {
      const trimmedText = text.trim();
      if (!trimmedText) return false;
      if (chatSendBusyRef.current || chatSending) return false;
      chatSendBusyRef.current = true;

      try {
        let convId: string = activeConversationId ?? "";
        if (!convId) {
          try {
            const { conversation } = await client.createConversation();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            convId = conversation.id;
          } catch {
            return false;
          }
        }

        client.sendWsMessage({
          type: "active-conversation",
          conversationId: convId,
        });

        const now = Date.now();
        const userMsgId = `temp-${now}`;
        const assistantMsgId = `temp-resp-${now}`;

        setConversationMessages((prev: ConversationMessage[]) => [
          ...prev,
          {
            id: userMsgId,
            role: "user",
            text: trimmedText,
            timestamp: now,
            blocks: userBlocks,
          },
          { id: assistantMsgId, role: "assistant", text: "", timestamp: now },
        ]);

        if (clearComposer) {
          setChatInput("");
        }

        setChatSending(true);
        setChatFirstTokenReceived(false);

        const controller = new AbortController();
        chatAbortRef.current = controller;
        let streamedAssistantText = "";

        try {
          const data = await client.sendConversationMessageStream(
            convId,
            trimmedText,
            (token) => {
              const delta = computeStreamingDelta(streamedAssistantText, token);
              if (!delta) return;
              streamedAssistantText += delta;
              setChatFirstTokenReceived(true);
              setConversationMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMsgId
                    ? { ...message, text: `${message.text}${delta}` }
                    : message,
                ),
              );
            },
            channelType,
            controller.signal,
            images,
          );

          if (shouldApplyFinalStreamText(streamedAssistantText, data.text)) {
            setConversationMessages((prev) => {
              let changed = false;
              const next = prev.map((message) => {
                if (message.id !== assistantMsgId) return message;
                if (message.text === data.text) return message;
                changed = true;
                return { ...message, text: data.text };
              });
              return changed ? next : prev;
            });
          }
          void loadConversations();
          return true;
        } catch (err) {
          const abortError = err as Error;
          if (abortError.name === "AbortError") {
            setConversationMessages((prev) =>
              prev.filter(
                (message) =>
                  !(message.id === assistantMsgId && !message.text.trim()),
              ),
            );
            return false;
          }

          const status = (err as { status?: number }).status;
          if (status === 404) {
            try {
              const { conversation } = await client.createConversation();
              setConversations((prev) => [conversation, ...prev]);
              setActiveConversationId(conversation.id);
              activeConversationIdRef.current = conversation.id;
              client.sendWsMessage({
                type: "active-conversation",
                conversationId: conversation.id,
              });

              const retryData = await client.sendConversationMessage(
                conversation.id,
                trimmedText,
                channelType,
                images,
              );
              setConversationMessages([
                {
                  id: `temp-${Date.now()}`,
                  role: "user",
                  text: trimmedText,
                  timestamp: Date.now(),
                  blocks: userBlocks,
                },
                {
                  id: `temp-resp-${Date.now()}`,
                  role: "assistant",
                  text: retryData.text,
                  timestamp: Date.now(),
                  blocks: retryData.blocks,
                },
              ]);
              return true;
            } catch {
              setConversationMessages((prev) =>
                prev.filter(
                  (message) =>
                    !(message.id === assistantMsgId && !message.text.trim()),
                ),
              );
              return false;
            }
          }

          await loadConversationMessages(convId);
          return false;
        } finally {
          if (chatAbortRef.current === controller) {
            chatAbortRef.current = null;
          }
          setChatSending(false);
          setChatFirstTokenReceived(false);
        }
      } finally {
        chatSendBusyRef.current = false;
      }
    },
    [activeConversationId, chatSending, loadConversationMessages, loadConversations],
  );

  const handleChatSend = useCallback(
    async (channelType: ConversationChannelType = "DM") => {
      const text = chatInput.trim();
      if (!text) return;
      const imagesToSend = chatPendingImages.length ? chatPendingImages : undefined;
      setChatPendingImages([]);
      await sendConversationTurn({
        text,
        channelType,
        images: imagesToSend,
        clearComposer: true,
      });
    },
    [chatInput, chatPendingImages, sendConversationTurn],
  );

  const sendOperatorActionMessage = useCallback(
    async ({
      label,
      kind,
      detail,
    }: {
      label: string;
      kind: "stream" | "avatar" | "launch";
      detail?: string;
    }) => {
      let convId = activeConversationIdRef.current ?? activeConversationId;
      if (!convId) {
        try {
          const { conversation } = await client.createConversation();
          setConversations((prev) => [conversation, ...prev]);
          setActiveConversationId(conversation.id);
          activeConversationIdRef.current = conversation.id;
          setConversationMessages([]);
          convId = conversation.id;
        } catch {
          return false;
        }
      }

      const appendLoggedAction = (message: ConversationMessage) => {
        setConversationMessages((prev) => {
          if (prev.some((entry) => entry.id === message.id)) return prev;
          return [...prev, message];
        });
      };

      const logActionForConversation = async (conversationId: string) => {
        client.sendWsMessage({
          type: "active-conversation",
          conversationId,
        });
        const { message } = await client.logConversationOperatorAction(
          conversationId,
          {
            label,
            kind,
            detail,
            fallbackText: label,
          },
        );
        appendLoggedAction(message);
        return message;
      };

      try {
        await logActionForConversation(convId);
        void loadConversations();
        return true;
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          try {
            const { conversation } = await client.createConversation();
            setConversations((prev) => [conversation, ...prev]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            setConversationMessages([]);
            await logActionForConversation(conversation.id);
            void loadConversations();
            return true;
          } catch {
            return false;
          }
        }

        setActionNotice(
          `Action executed, but logging failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "info",
          2600,
        );
        return false;
      }
    },
    [activeConversationId, loadConversations, setActionNotice],
  );

  const handleChatStop = useCallback(() => {
    chatSendBusyRef.current = false;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setChatSending(false);
    setChatFirstTokenReceived(false);
  }, []);

  const handleChatClear = useCallback(async () => {
    const convId = activeConversationId;
    if (!convId) {
      setActionNotice("No active conversation to clear.", "info", 2200);
      return;
    }
    try {
      await client.deleteConversation(convId);
      setActiveConversationId(null);
      activeConversationIdRef.current = null;
      setConversationMessages([]);
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(convId);
        return next;
      });
      await loadConversations();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setActiveConversationId(null);
        activeConversationIdRef.current = null;
        setConversationMessages([]);
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(convId);
          return next;
        });
        await loadConversations();
        setActionNotice("Conversation was already cleared.", "info", 2600);
        return;
      }
      setActionNotice(
        `Failed to clear conversation: ${err instanceof Error ? err.message : "network error"}`,
        "error",
        4200,
      );
    }
  }, [activeConversationId, loadConversations, setActionNotice]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationId) return;
      const previousActive = activeConversationId;
      setActiveConversationId(id);
      activeConversationIdRef.current = id;
      client.sendWsMessage({ type: "active-conversation", conversationId: id });
      setUnreadConversations((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      const loaded = await loadConversationMessages(id);
      if (loaded.ok) return;

      if (loaded.status === 404) {
        const refreshed = await loadConversations();
        const fallbackId = refreshed?.[0]?.id ?? null;
        if (fallbackId) {
          setActiveConversationId(fallbackId);
          activeConversationIdRef.current = fallbackId;
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: fallbackId,
          });
          const fallbackLoaded = await loadConversationMessages(fallbackId);
          if (!fallbackLoaded.ok) {
            setActionNotice(
              `Failed to load fallback conversation: ${fallbackLoaded.message}`,
              "error",
              4200,
            );
          }
        } else {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        setActionNotice(
          "Conversation was not found. Refreshed the conversation list.",
          "info",
          3200,
        );
        return;
      }

      setActiveConversationId(previousActive);
      activeConversationIdRef.current = previousActive;
      if (previousActive) {
        client.sendWsMessage({
          type: "active-conversation",
          conversationId: previousActive,
        });
        const restored = await loadConversationMessages(previousActive);
        if (!restored.ok) {
          setActionNotice(
            `Failed to restore previous conversation: ${restored.message}`,
            "error",
            4200,
          );
        }
      } else {
        setConversationMessages([]);
      }
      setActionNotice(
        `Failed to load conversation: ${loaded.message}`,
        "error",
        4200,
      );
    },
    [
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
    ],
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const deletingActive = activeConversationId === id;
      try {
        await client.deleteConversation(id);
        setConversations((prev) =>
          prev.filter((conversation) => conversation.id !== id),
        );
        setUnreadConversations((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        if (deletingActive) {
          setActiveConversationId(null);
          activeConversationIdRef.current = null;
          setConversationMessages([]);
        }
        const refreshed = await loadConversations();
        if (deletingActive) {
          const fallbackId = refreshed?.[0]?.id ?? null;
          if (fallbackId) {
            setActiveConversationId(fallbackId);
            activeConversationIdRef.current = fallbackId;
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: fallbackId,
            });
            const fallbackLoaded = await loadConversationMessages(fallbackId);
            if (!fallbackLoaded.ok) {
              setActionNotice(
                `Failed to load fallback conversation: ${fallbackLoaded.message}`,
                "error",
                4200,
              );
            }
          }
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          setConversations((prev) =>
            prev.filter((conversation) => conversation.id !== id),
          );
          setUnreadConversations((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          if (deletingActive) {
            setActiveConversationId(null);
            activeConversationIdRef.current = null;
            setConversationMessages([]);
          }
          await loadConversations();
          setActionNotice(
            "Conversation was already deleted. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to delete conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [
      activeConversationId,
      loadConversationMessages,
      loadConversations,
      setActionNotice,
    ],
  );

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim();
      if (!trimmed) {
        setActionNotice("Conversation title cannot be empty.", "error", 2800);
        return;
      }
      try {
        const { conversation } = await client.renameConversation(id, trimmed);
        setConversations((prev) =>
          prev.map((existing) =>
            existing.id === id ? conversation : existing,
          ),
        );
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) {
          await loadConversations();
          setActionNotice(
            "Conversation was not found. Refreshed the conversation list.",
            "info",
            3200,
          );
          return;
        }
        setActionNotice(
          `Failed to rename conversation: ${err instanceof Error ? err.message : "network error"}`,
          "error",
          4200,
        );
      }
    },
    [loadConversations, setActionNotice],
  );

  const openAutonomousRun = useCallback(() => {
    setAutonomousRunOpen(true);
    setActionNotice(
      "Configure mode, duration, and credit estimate before starting autonomous live mode.",
      "info",
      2600,
    );
  }, [setActionNotice]);

  const closeAutonomousRun = useCallback(() => {
    setAutonomousRunOpen(false);
  }, []);

  const setLiveSource = useCallback(
    (source: Omit<LiveSecondarySource, "activatedAt">) => {
      setLiveSecondarySources((current) =>
        upsertLiveSecondarySource(current, {
          ...source,
          activatedAt: Date.now(),
        }),
      );
    },
    [],
  );

  const resetLiveComposition = useCallback(() => {
    setLiveBroadcastState("offline");
    setLiveSecondarySources([]);
  }, []);

  const executePlanWithRetry = useCallback(
    async (
      input: AutonomyExecutePlanRequest,
      opts?: { label?: string; maxAttempts?: number },
    ) => {
      const label = opts?.label ?? "Action";
      const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3);
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          return await client.executeAutonomyPlan(input);
        } catch (err) {
          const status = getHttpStatusFromError(err);
          const shouldRetry = shouldRetryQuickLayerError(
            err,
            attempt,
            maxAttempts,
          );
          if (!shouldRetry) throw err;
          const retryDelayMs = computeQuickLayerRetryDelayMs(attempt);
          setActionNotice(
            `${label} transient failure (HTTP ${status}). Retrying ${attempt + 1}/${maxAttempts}...`,
            "info",
            1800,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
      throw new Error(`${label} failed`);
    },
    [setActionNotice],
  );

  const resolveAutonomousGameLaunch = useCallback(
    async (
      planResults: unknown[],
      selectedGameId?: string,
    ): Promise<ParsedGameLaunch> => {
      const launchFromPlan = parseGameLaunchFromEnvelope(
        findLastToolEnvelope(planResults, "FIVE55_GAMES_PLAY"),
      );
      if (launchFromPlan) return launchFromPlan;

      const playResult = await client.playFive55Game({
        gameId: selectedGameId,
        mode: "spectate",
      });
      const fallbackViewerUrl =
        typeof playResult.viewer?.url === "string"
          ? playResult.viewer.url.trim()
          : "";
      if (!fallbackViewerUrl) {
        throw new Error("Game launch did not return a viewer URL.");
      }
      if (isUnreachableLoopbackViewerUrl(fallbackViewerUrl)) {
        throw new Error(
          "Game launch returned a localhost viewer URL. Configure FIVE55_GAMES_VIEWER_BASE_URL to a public URL.",
        );
      }

      return {
        gameId: playResult.game.id,
        gameTitle: playResult.game.title,
        viewerUrl: fallbackViewerUrl,
        sandbox: playResult.viewer.sandbox,
        postMessageAuth: Boolean(playResult.viewer.postMessageAuth),
      };
    },
    [],
  );

  const openGoLiveModal = useCallback(() => {
    dismissGoLiveInlineNotice();
    setGoLiveModalOpen(true);
  }, [dismissGoLiveInlineNotice]);

  const closeGoLiveModal = useCallback(() => {
    dismissGoLiveInlineNotice();
    setGoLiveModalOpen(false);
  }, [dismissGoLiveInlineNotice]);

  const launchGoLive = useCallback(
    async (config: GoLiveConfig): Promise<GoLiveLaunchResult> => {
      const stream555ControlAvailable =
        hasPluginRegistration(plugins, "stream555-control") &&
        resolveQuickLayerStatus(plugins, ["stream555-control"]) !== "disabled";
      const legacyStreamAvailable =
        hasPluginRegistration(plugins, "stream") &&
        resolveQuickLayerStatus(plugins, ["stream"]) !== "disabled";
      const selectedChannels = Array.from(
        new Set(
          config.channels
            .map((channel) => channel.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      const destinationPlatforms =
        selectedChannels.length > 0 ? selectedChannels.join(",") : undefined;
      const destinationParams = destinationPlatforms
        ? { destinationPlatforms }
        : {};
      const destinationApplyParams = destinationPlatforms
        ? { platforms: destinationPlatforms }
        : {};
      const formatChannelLabel = (channel: string) =>
        channel === "x"
          ? "X"
          : channel === "pumpfun"
            ? "Pump.fun"
            : channel.charAt(0).toUpperCase() + channel.slice(1);
      const channelLabel = selectedChannels.length
        ? selectedChannels.map(formatChannelLabel).join(", ")
        : "Configured channels";
      const layoutLabel =
        config.layoutMode === "camera-hold" ? "Camera hold" : "Camera full";
      const streamPlugin =
        plugins.find((plugin) => isStream555PrimaryPlugin(plugin.id)) ?? null;
      const streamSummary = streamPlugin
        ? buildStream555StatusSummary(streamPlugin.parameters ?? [])
        : null;
      const buildLaunchResult = (
        state: GoLiveLaunchResult["state"],
        message: string,
        tone: GoLiveLaunchResult["tone"],
        followUp?: GoLiveLaunchFollowUp,
      ): GoLiveLaunchResult => {
        if (state === "blocked" || state === "failed") {
          routeProStreamerFeedback(
            { target: "go-live-inline", tone, message },
            proStreamerFeedbackSinks,
          );
        }
        return {
          state,
          tone,
          message,
          ...(followUp ? { followUp } : {}),
        };
      };
      const blocked = (
        message: string,
        tone: GoLiveLaunchResult["tone"] = "warning",
      ) => buildLaunchResult("blocked", message, tone);
      const failed = (message: string) =>
        buildLaunchResult("failed", message, "error");
      const succeeded = (message: string) =>
        buildLaunchResult("success", message, "success");
      const partial = (
        message: string,
        label: string,
        detail: string,
      ) =>
        buildLaunchResult("partial", message, "warning", {
          target: "action-log",
          label,
          detail,
        });
      const completeLaunch = async (
        launchLabel: string,
        launchResult: GoLiveLaunchResult,
      ) => {
        if (
          launchResult.state === "partial" &&
          launchResult.followUp?.target === "action-log"
        ) {
          routeProStreamerFeedback(
            {
              target: "action-log-inline",
              tone: launchResult.tone,
              title: launchLabel,
              message: launchResult.message,
              actionLabel: launchResult.followUp.label,
            },
            proStreamerFeedbackSinks,
          );
        }
        if (
          launchResult.state === "success" ||
          launchResult.state === "partial"
        ) {
          const detailParts = [channelLabel, layoutLabel];
          if (launchResult.state === "partial") {
            detailParts.push("Partial launch");
          }
          if (launchResult.followUp?.detail) {
            detailParts.push(launchResult.followUp.detail);
          }
          await sendOperatorActionMessage({
            label: launchLabel,
            kind: "launch",
            detail: detailParts.join(" · "),
          });
        }
        return launchResult;
      };

      dismissGoLiveInlineNotice();

      if (!stream555ControlAvailable && !legacyStreamAvailable) {
        return blocked(
          "555 Stream is not available yet. Configure it before launching.",
        );
      }
      if (selectedChannels.length === 0) {
        return blocked("Select at least one ready channel for this launch.");
      }
      if (streamSummary) {
        const invalidSelectedChannels = selectedChannels.flatMap((channel) => {
          const destination = streamSummary.destinations.find(
            (entry) => entry.id === channel,
          );
          if (!destination) {
            return [`${formatChannelLabel(channel)} (unavailable)`];
          }
          if (destination.readinessState === "ready") {
            return [];
          }
          const reason =
            destination.readinessState === "missing-stream-key"
              ? "missing stream key"
              : destination.readinessState === "missing-url"
                ? "missing RTMP URL"
                : "disabled";
          return [`${destination.label} (${reason})`];
        });
        if (invalidSelectedChannels.length > 0) {
          return blocked(
            `Selected channels are no longer ready: ${invalidSelectedChannels.join(", ")}.`,
          );
        }
      }

      let launchLabel = labelForGoLiveLaunchMode(config.launchMode);

      try {
        if (config.launchMode === "camera") {
          let launchResult: GoLiveLaunchResult | null = null;
          let stream555FailureReason: string | null = null;

          if (stream555ControlAvailable) {
            try {
              const goLivePlan = await executePlanWithRetry(
                {
                  plan: {
                    id: "go-live-modal-camera",
                    steps: [
                      {
                        id: "go-live",
                        toolName: "STREAM555_GO_LIVE",
                        params: {
                          layoutMode: config.layoutMode,
                          ...destinationParams,
                        },
                      },
                      {
                        id: "segment-bootstrap",
                        toolName: "STREAM555_GO_LIVE_SEGMENTS",
                        params: { segmentIntent: "balanced" },
                      },
                    ],
                  },
                  request: { source: "user", sourceTrust: 1 },
                  options: { stopOnFailure: false },
                },
                { label: "Guided go-live" },
              );

              const didGoLiveSucceed = didToolActionSucceed(
                goLivePlan,
                "STREAM555_GO_LIVE",
              );
              const didSegmentBootstrapSucceed = didToolActionSucceed(
                goLivePlan,
                "STREAM555_GO_LIVE_SEGMENTS",
              );

              if (didGoLiveSucceed) {
                setLiveSecondarySources([]);
                setLiveBroadcastState("live");
                if (didSegmentBootstrapSucceed) {
                  launchResult = succeeded(
                    "Go live executed via 555 Stream with segment orchestration.",
                  );
                } else {
                  const bootstrapFailureReason = getToolActionFailureMessage(
                    goLivePlan,
                    "STREAM555_GO_LIVE_SEGMENTS",
                    "segment bootstrap did not succeed",
                  );
                  launchResult = partial(
                    `Go live started, but segment bootstrap failed: ${bootstrapFailureReason}`,
                    "Complete segment bootstrap",
                    `Camera launch is live, but segment bootstrap failed: ${bootstrapFailureReason}`,
                  );
                }
              } else if (!legacyStreamAvailable) {
                stream555FailureReason = getToolActionFailureMessage(
                  goLivePlan,
                  "STREAM555_GO_LIVE",
                  "stream555 go-live action did not succeed",
                );
                return failed(`Go live failed: ${stream555FailureReason}`);
              } else {
                stream555FailureReason = getToolActionFailureMessage(
                  goLivePlan,
                  "STREAM555_GO_LIVE",
                  "stream555 go-live action did not succeed",
                );
              }
            } catch (err) {
              if (!legacyStreamAvailable) {
                return failed(
                  `Go live execution failed: ${err instanceof Error ? err.message : "unknown error"}`,
                );
              }
              stream555FailureReason =
                err instanceof Error ? err.message : "unknown error";
            }
          }

          if (!launchResult && legacyStreamAvailable) {
            const legacyPlan = await executePlanWithRetry(
              {
                plan: {
                  id: "go-live-modal-camera-legacy",
                  steps: [
                    {
                      id: "status-before",
                      toolName: "STREAM_STATUS",
                      params: { scope: "current" },
                    },
                    {
                      id: "start",
                      toolName: "STREAM_CONTROL",
                      params: {
                        operation: "start",
                        scene: resolveLiveSceneId(config.layoutMode),
                      },
                    },
                    {
                      id: "status-after",
                      toolName: "STREAM_STATUS",
                      params: { scope: "current" },
                    },
                  ],
                },
                request: { source: "user", sourceTrust: 1 },
                options: { stopOnFailure: false },
              },
              { label: "Guided go-live fallback" },
            );
            const streamState = summarizeStreamState(
              findLastToolEnvelope(legacyPlan.results, "STREAM_STATUS"),
            );
            if (legacyPlan.allSucceeded || streamState.live) {
              setLiveSecondarySources([]);
              setLiveBroadcastState("live");
              launchResult = partial(
                stream555FailureReason
                  ? `Go live started via legacy fallback after 555 Stream failed: ${stream555FailureReason}. Stream state: ${streamState.label}.`
                  : `Go live executed via legacy stream. Stream state: ${streamState.label}.`,
                "Review legacy fallback",
                stream555FailureReason
                  ? `Camera launch is live via legacy fallback after primary failure: ${stream555FailureReason}`
                  : "Camera launch is live via legacy fallback. Verify destination routing and segment orchestration.",
              );
            } else {
              return failed(
                "Legacy go-live ran but stream status still needs follow-up.",
              );
            }
          }
          return completeLaunch(
            launchLabel,
            launchResult ?? failed("Launch did not complete."),
          );
        } else if (config.launchMode === "radio") {
          if (!stream555ControlAvailable) {
            return blocked(
              "Lo-fi radio launch requires the 555 Stream control plugin.",
            );
          }
          const plan = await executePlanWithRetry(
            {
              plan: {
                id: "go-live-modal-radio",
                steps: [
                  {
                    id: "go-live",
                    toolName: "STREAM555_GO_LIVE",
                    params: {
                      inputType: "radio",
                      layoutMode: config.layoutMode,
                      ...destinationParams,
                    },
                  },
                  {
                    id: "radio-mode",
                    toolName: "STREAM555_RADIO_CONTROL",
                    params: { action: "setAutoDJMode", mode: "MUSIC" },
                  },
                ],
              },
              request: { source: "user", sourceTrust: 1 },
              options: { stopOnFailure: false },
            },
            { label: "Guided radio launch" },
          );
          if (
            didToolActionSucceed(plan, "STREAM555_GO_LIVE") &&
            didToolActionSucceed(plan, "STREAM555_RADIO_CONTROL")
          ) {
            setLiveSecondarySources([]);
            setLiveBroadcastState("live");
            launchLabel = "Lo-fi Radio";
            return completeLaunch(launchLabel, succeeded("Lo-fi radio is live."));
          } else {
            return failed(
              `Lo-fi radio launch failed: ${getToolActionFailureMessage(
                plan,
                "STREAM555_GO_LIVE",
                "go-live action did not succeed",
              )}`,
            );
          }
        } else if (config.launchMode === "screen-share") {
          if (!stream555ControlAvailable) {
            return blocked(
              "Screen share launch requires the 555 Stream control plugin.",
            );
          }
          const plan = await executePlanWithRetry(
            {
              plan: {
                id: "go-live-modal-screen-share",
                steps: [
                  {
                    id: "screen-share",
                    toolName: "STREAM555_SCREEN_SHARE",
                    params: {
                      sceneId: "active-pip",
                    },
                  },
                  {
                    id: "destinations-apply",
                    toolName: "STREAM555_DESTINATIONS_APPLY",
                    params: {
                      ...destinationApplyParams,
                    },
                  },
                ],
              },
              request: { source: "user", sourceTrust: 1 },
              options: { stopOnFailure: false },
            },
            { label: "Guided screen-share launch" },
          );
          if (didToolActionSucceed(plan, "STREAM555_SCREEN_SHARE")) {
            setLiveBroadcastState("live");
            setLiveSource({
              id: "screen-share",
              kind: "screen",
              label: "Screen Share",
            });
            launchLabel = "Screen Share";
            if (didToolActionSucceed(plan, "STREAM555_DESTINATIONS_APPLY")) {
              return completeLaunch(
                launchLabel,
                succeeded("Screen share is live."),
              );
            }
            const attachFailureReason = getToolActionFailureMessage(
              plan,
              "STREAM555_DESTINATIONS_APPLY",
              "screen-share destination attach did not succeed",
            );
            return completeLaunch(
              launchLabel,
              partial(
                `Screen share started, but destination attach failed: ${attachFailureReason}`,
                "Attach selected destinations",
                `Screen share is prepared, but destination attach failed: ${attachFailureReason}`,
              ),
            );
          } else {
            return failed(
              `Screen-share launch failed: ${getToolActionFailureMessage(
                plan,
                "STREAM555_SCREEN_SHARE",
                "screen-share action did not succeed",
              )}`,
            );
          }
        } else if (config.launchMode === "reaction") {
          if (!stream555ControlAvailable) {
            return blocked(
              "Reaction launch requires the 555 Stream control plugin.",
            );
          }
          const plan = await executePlanWithRetry(
            {
              plan: {
                id: "go-live-modal-reaction",
                steps: [
                  {
                    id: "go-live",
                    toolName: "STREAM555_GO_LIVE",
                    params: {
                      layoutMode: config.layoutMode,
                      ...destinationParams,
                    },
                  },
                  {
                    id: "segment-bootstrap",
                    toolName: "STREAM555_GO_LIVE_SEGMENTS",
                    params: {
                      segmentIntent: "reaction",
                      segmentTypes: "reaction,analysis",
                    },
                  },
                  {
                    id: "segment-override",
                    toolName: "STREAM555_SEGMENT_OVERRIDE",
                    params: {
                      segmentType: "reaction",
                      reason: "guided launch reaction mode",
                    },
                  },
                ],
              },
              request: { source: "user", sourceTrust: 1 },
              options: { stopOnFailure: false },
            },
            { label: "Guided reaction launch" },
          );
          const didGoLiveSucceed = didToolActionSucceed(plan, "STREAM555_GO_LIVE");
          const didSegmentBootstrapSucceed = didToolActionSucceed(
            plan,
            "STREAM555_GO_LIVE_SEGMENTS",
          );
          const didSegmentOverrideSucceed = didToolActionSucceed(
            plan,
            "STREAM555_SEGMENT_OVERRIDE",
          );
          if (didGoLiveSucceed) {
            setLiveSecondarySources([]);
            setLiveBroadcastState("live");
            launchLabel = "Reaction";
            if (didSegmentBootstrapSucceed && didSegmentOverrideSucceed) {
              return completeLaunch(
                launchLabel,
                succeeded("Reaction mode is live."),
              );
            }
            const followUpReasons: string[] = [];
            if (!didSegmentBootstrapSucceed) {
              followUpReasons.push(
                `segment bootstrap failed: ${getToolActionFailureMessage(
                  plan,
                  "STREAM555_GO_LIVE_SEGMENTS",
                  "reaction segment bootstrap did not succeed",
                )}`,
              );
            }
            if (!didSegmentOverrideSucceed) {
              followUpReasons.push(
                `segment override failed: ${getToolActionFailureMessage(
                  plan,
                  "STREAM555_SEGMENT_OVERRIDE",
                  "reaction override did not succeed",
                )}`,
              );
            }
            return completeLaunch(
              launchLabel,
              partial(
                `Reaction mode is live, but follow-up is required: ${followUpReasons.join("; ")}`,
                "Complete reaction orchestration",
                `Reaction launch is live, but ${followUpReasons.join("; ")}`,
              ),
            );
          } else {
            return failed(
              `Reaction launch failed: ${getToolActionFailureMessage(
                plan,
                "STREAM555_GO_LIVE",
                "reaction go-live action did not succeed",
              )}`,
            );
          }
        } else if (config.launchMode === "play-games") {
          launchLabel = "Play Games";
          const catalog = await client.getFive55GamesCatalog({ includeBeta: true });
          const selectedGameId = selectPreferredGameId(catalog.games);
          const selectedGame = selectedGameId
            ? catalog.games.find((game) => game.id === selectedGameId)
            : undefined;

          const playPlan = await executePlanWithRetry(
            {
              plan: {
                id: "go-live-modal-play-games",
                steps: [
                  {
                    id: "play-autonomous",
                    toolName: "FIVE55_GAMES_PLAY",
                    params: {
                      ...(selectedGameId ? { gameId: selectedGameId } : {}),
                      mode: "spectate",
                    },
                  },
                ],
              },
              request: { source: "user", sourceTrust: 1 },
              options: { stopOnFailure: true },
            },
            { label: "Guided play games launch" },
          );

          const launch = await resolveAutonomousGameLaunch(
            playPlan.results,
            selectedGameId,
          );

          if (!launch.viewerUrl) {
            return failed(
              "Autonomous game launch did not return a viewer URL.",
            );
          }

          const resolvedGameId = launch.gameId || selectedGameId || "unknown-game";
          const resolvedGameTitle =
            launch.gameTitle || selectedGame?.title || resolvedGameId;

          setActiveGameApp(`five55:${resolvedGameId}`);
          setActiveGameDisplayName(resolvedGameTitle);
          setActiveGameViewerUrl(launch.viewerUrl);
          setActiveGameSandbox(launch.sandbox ?? DEFAULT_GAME_SANDBOX);
          setActiveGamePostMessageAuth(launch.postMessageAuth);
          setActiveGamePostMessagePayload(null);
          launchLabel = resolvedGameTitle;

          if (currentTheme === "milady-os" || !isTabEnabled("apps")) {
            setGameOverlayEnabled(Boolean(launch.viewerUrl));
          } else {
            setTab("apps");
            setAppsSubTab("games");
          }

          if (stream555ControlAvailable) {
            const attachPlan = await executePlanWithRetry(
              {
                plan: {
                  id: "go-live-modal-game-stream-attach",
                  steps: [
                    {
                      id: "start-game-feed",
                      toolName: "STREAM555_GO_LIVE",
                      params: {
                        inputType: "website",
                        inputUrl: launch.viewerUrl,
                        layoutMode: "camera-hold",
                        ...destinationParams,
                      },
                    },
                  ],
                },
                request: { source: "user", sourceTrust: 1 },
                options: { stopOnFailure: false },
              },
              { label: "Game stream attach" },
            );
            if (!didToolActionSucceed(attachPlan, "STREAM555_GO_LIVE")) {
              return completeLaunch(
                launchLabel,
                partial(
                  `Game launched, but 555 Stream attach failed: ${getToolActionFailureMessage(
                    attachPlan,
                    "STREAM555_GO_LIVE",
                    "game stream attach did not succeed",
                  )}`,
                  "Attach game stream",
                  `Game launched, but 555 Stream attach failed for ${resolvedGameTitle}.`,
                ),
              );
            }
          } else if (legacyStreamAvailable) {
            const attachPlan = await executePlanWithRetry(
              {
                plan: {
                  id: "go-live-modal-game-legacy-attach",
                  steps: [
                    {
                      id: "status-before",
                      toolName: "STREAM_STATUS",
                      params: { scope: "current" },
                    },
                    {
                      id: "start-game-feed",
                      toolName: "STREAM_CONTROL",
                      params: {
                        operation: "start",
                        scene: "active-pip",
                        inputType: "website",
                        url: launch.viewerUrl,
                      },
                    },
                    {
                      id: "status-after",
                      toolName: "STREAM_STATUS",
                      params: { scope: "current" },
                    },
                  ],
                },
                request: { source: "user", sourceTrust: 1 },
                options: { stopOnFailure: false },
              },
              { label: "Game legacy attach" },
            );
            const finalStatus = summarizeStreamState(
              findLastToolEnvelope(attachPlan.results, "STREAM_STATUS"),
            );
            if (!(attachPlan.allSucceeded || finalStatus.live)) {
              return completeLaunch(
                launchLabel,
                partial(
                  "Game launched, but legacy stream attach still needs follow-up.",
                  "Attach game stream",
                  `Game launched, but legacy stream attach still needs follow-up for ${resolvedGameTitle}.`,
                ),
              );
            }
          } else {
            return blocked(
              "Play Games launch requires a stream plugin to broadcast the selected game.",
            );
          }

          setLiveBroadcastState("live");
          setLiveSource({
            id: "active-game",
            kind: "game",
            label: resolvedGameTitle,
            viewerUrl: launch.viewerUrl,
          });
          return completeLaunch(
            launchLabel,
            succeeded(`Launched ${resolvedGameTitle} live.`),
          );
        }
        return failed("Launch did not complete.");
      } catch (err) {
        return failed(
          `Launch failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    },
    [
      currentTheme,
      executePlanWithRetry,
      plugins,
      dismissGoLiveInlineNotice,
      proStreamerFeedbackSinks,
      resolveAutonomousGameLaunch,
      sendOperatorActionMessage,
      setLiveSource,
      setTab,
    ],
  );

  const runAutonomousEstimate = useCallback(async () => {
    if (autoRunMode === "topic" && autoRunTopic.trim().length === 0) {
      setActionNotice(
        "Topic mode requires a topic before estimating.",
        "info",
        2600,
      );
      return null;
    }

    setAutoRunPreviewBusy(true);
    try {
      const preview = await client.getFive55AutonomyPreview({
        mode: autoRunMode,
        topic: autoRunTopic.trim() || undefined,
        durationMin: autoRunDurationMin,
        avatarRuntime: autoRunAvatarRuntime,
      });
      setAutoRunPreview(preview);
      setActionNotice(
        preview.canStart
          ? "Autonomous run estimate ready."
          : "Estimate ready. Credits are insufficient for this run.",
        preview.canStart ? "success" : "info",
        2600,
      );
      return preview;
    } catch (err) {
      setActionNotice(
        `Failed to estimate autonomous run: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
      return null;
    } finally {
      setAutoRunPreviewBusy(false);
    }
  }, [
    autoRunMode,
    autoRunTopic,
    autoRunDurationMin,
    autoRunAvatarRuntime,
    setActionNotice,
  ]);

  const runAutonomousLaunch = useCallback(async () => {
    if (chatSending || autoRunLaunching) return;
    if (autoRunMode === "topic" && autoRunTopic.trim().length === 0) {
      setActionNotice(
        "Topic mode requires a topic before launch.",
        "info",
        3000,
      );
      return;
    }

    const stream555Available =
      hasPluginRegistration(plugins, "stream555-control") &&
      resolveQuickLayerStatus(plugins, ["stream555-control"]) !== "disabled";
    const legacyStreamAvailable =
      hasPluginRegistration(plugins, "stream") &&
      resolveQuickLayerStatus(plugins, ["stream"]) !== "disabled";

    if (!stream555Available && !legacyStreamAvailable) {
      setActionNotice(
        "No stream control plugin is available. Enable 555 Stream or legacy stream before starting autonomous runs.",
        "info",
        3000,
      );
      return;
    }

    setAutoRunLaunching(true);
    try {
      const preview = autoRunPreview ?? (await runAutonomousEstimate());
      if (!preview) return;
      if (!preview.canStart) {
        setActionNotice(
          "Insufficient credits for this autonomous run. Adjust duration/runtime or top up credits.",
          "error",
          4200,
        );
        return;
      }

      let gameTitle: string | undefined;
      let streamStartParams: Record<string, unknown> = {
        operation: "start",
        scene: "default",
        inputType: "avatar",
      };
      let stream555StartParams: Record<string, unknown> = {
        inputType: "avatar",
        layoutMode: "camera-full",
      };

      if (autoRunMode === "games") {
        const catalog = await client.getFive55GamesCatalog({ includeBeta: true });
        const selectedGameId = selectPreferredGameId(catalog.games);

        const playPlan = await executePlanWithRetry({
          plan: {
            id: "autonomous-live-games-launch",
            steps: [
              {
                id: "play",
                toolName: "FIVE55_GAMES_PLAY",
                params: {
                  ...(selectedGameId ? { gameId: selectedGameId } : {}),
                  mode: "spectate",
                },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        }, { label: "Autonomous game launch" });
        const launch = await resolveAutonomousGameLaunch(
          playPlan.results,
          selectedGameId,
        );

        gameTitle = launch.gameTitle;
        setActiveGameApp(`five55:${launch.gameId}`);
        setActiveGameDisplayName(launch.gameTitle);
        setActiveGameViewerUrl(launch.viewerUrl);
        setActiveGameSandbox(launch.sandbox ?? DEFAULT_GAME_SANDBOX);
        setActiveGamePostMessageAuth(launch.postMessageAuth);
        setActiveGamePostMessagePayload(null);
        setLiveSource({
          id: "active-game",
          kind: "game",
          label: launch.gameTitle,
          viewerUrl: launch.viewerUrl,
        });
        if (currentTheme === "milady-os" || !isTabEnabled("apps")) {
          setGameOverlayEnabled(true);
        } else {
          setTab("apps");
          setAppsSubTab("games");
        }
        streamStartParams = {
          operation: "start",
          scene: "active-pip",
          inputType: "website",
          url: launch.viewerUrl,
        };
        stream555StartParams = {
          inputType: "website",
          inputUrl: launch.viewerUrl,
          layoutMode: "camera-hold",
        };
      }

      if (stream555Available) {
        const streamPlan = await executePlanWithRetry({
          plan: {
            id: "autonomous-live-stream555-start",
            steps: [
              {
                id: "start",
                toolName: "STREAM555_GO_LIVE",
                params: stream555StartParams,
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Autonomous stream start" });

        if (!didToolActionSucceed(streamPlan, "STREAM555_GO_LIVE")) {
          const reason = getToolActionFailureMessage(
            streamPlan,
            "STREAM555_GO_LIVE",
            "stream start failed",
          );
          setActionNotice(
            `Autonomous stream start failed: ${reason}`,
            "error",
            4200,
          );
          return;
        }
      } else {
        const streamPlan = await executePlanWithRetry({
          plan: {
            id: "autonomous-live-stream-start",
            steps: [
              {
                id: "status-before",
                toolName: "STREAM_STATUS",
                params: { scope: "current" },
              },
              {
                id: "start",
                toolName: "STREAM_CONTROL",
                params: streamStartParams,
              },
              {
                id: "status-after",
                toolName: "STREAM_STATUS",
                params: { scope: "current" },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Autonomous stream start" });

        const finalStatus = summarizeStreamState(
          findLastToolEnvelope(streamPlan.results, "STREAM_STATUS"),
        );
        if (!(streamPlan.allSucceeded || finalStatus.live)) {
          setActionNotice(
            "Autonomous launch started, but stream status needs verification.",
            "info",
            3600,
          );
        }
      }

      setLiveBroadcastState("live");
      const prompt = buildAutonomousPrompt({
        mode: autoRunMode,
        topic: autoRunTopic,
        durationMin: autoRunDurationMin,
        gameTitle,
      });
      setChatInput(prompt);
      setAutonomousRunOpen(false);
      setTimeout(() => void handleChatSend(), 30);
    } catch (err) {
      setActionNotice(
        `Autonomous live launch failed: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
    } finally {
      setAutoRunLaunching(false);
    }
  }, [
    autoRunDurationMin,
    autoRunLaunching,
    autoRunMode,
    autoRunPreview,
    autoRunTopic,
    currentTheme,
    chatSending,
    executePlanWithRetry,
    handleChatSend,
    plugins,
    resolveAutonomousGameLaunch,
    runAutonomousEstimate,
    setActionNotice,
    setLiveSource,
    setTab,
  ]);

  const runQuickLayer = useCallback(async (layerId: QuickLayerId) => {
    if (chatSending) return;
    const layer = QUICK_LAYER_CATALOG.find((entry) => entry.id === layerId);
    if (!layer) return;

    const pushQuickLayerToast = (
      message: string,
      tone: ProStreamerFeedbackTone = "info",
      ttlMs = 2800,
    ) => {
      routeProStreamerFeedback(
        { target: "toast", message, tone, ttlMs },
        proStreamerFeedbackSinks,
      );
    };
    const pushActionLogFollowUp = (
      title: string,
      message: string,
      tone: ProStreamerFeedbackTone = "error",
      actionLabel = "Review live controls",
    ) => {
      routeProStreamerFeedback(
        {
          target: "action-log-inline",
          title,
          message,
          tone,
          actionLabel,
        },
        proStreamerFeedbackSinks,
      );
    };

    const status = quickLayerStatuses[layer.id] ?? "available";
    if (status === "disabled" && layer.id !== "go-live") {
      const pluginLabel = layer.pluginIds.join(", ");
      pushQuickLayerToast(
        `${pluginLabel} is disabled or not active. Enable the plugin when ready.`,
        "info",
        2200,
      );
      return;
    }

    if (layer.id === "autonomous-run") {
      openAutonomousRun();
      return;
    }

    let prompt = layer.prompt;
    let shouldSendOperatorMessage = false;
    let operatorDetail: string | undefined;
    let openedViewerThisRun = false;
    let viewerUrlForStream =
      typeof activeGameViewerUrl === "string" && activeGameViewerUrl.trim().length > 0
        ? activeGameViewerUrl
        : undefined;
    const stream555ControlAvailable =
      hasPluginRegistration(plugins, "stream555-control") &&
      resolveQuickLayerStatus(plugins, ["stream555-control"]) !== "disabled";
    const legacyStreamAvailable =
      hasPluginRegistration(plugins, "stream") &&
      resolveQuickLayerStatus(plugins, ["stream"]) !== "disabled";

    if (layer.id === "go-live") {
      openGoLiveModal();
      return;
    }

    if (layer.id === "screen-share") {
      try {
        const plan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-screen-share",
            steps: [
              {
                id: "screen-share",
                toolName: "STREAM555_SCREEN_SHARE",
                params: { sceneId: "active-pip" },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Screen share" });
        if (didToolActionSucceed(plan, "STREAM555_SCREEN_SHARE")) {
          setLiveBroadcastState("live");
          setLiveSource({
            id: "screen-share",
            kind: "screen",
            label: "Screen Share",
          });
          pushQuickLayerToast("Screen-share request dispatched.", "success", 2600);
          prompt =
            "Confirm screen-share is active and narrate what viewers should focus on next.";
          shouldSendOperatorMessage = true;
        } else {
          const reason = getToolActionFailureMessage(
            plan,
            "STREAM555_SCREEN_SHARE",
            "screen-share action did not succeed",
          );
          pushActionLogFollowUp(
            "Screen Share",
            `Screen-share request failed: ${reason}`,
          );
        }
      } catch (err) {
        pushActionLogFollowUp(
          "Screen Share",
          `Screen-share request failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "ads") {
      try {
        const createPlan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-ad-create",
            steps: [
              {
                id: "ad-create",
                toolName: "STREAM555_AD_CREATE",
                params: {
                  type: "l-bar",
                  imageUrl: "https://picsum.photos/seed/alice-ad/1280/720",
                  durationMs: "15000",
                },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Ad create" });
        if (!didToolActionSucceed(createPlan, "STREAM555_AD_CREATE")) {
          const reason = getToolActionFailureMessage(
            createPlan,
            "STREAM555_AD_CREATE",
            "ad create action did not succeed",
          );
          pushActionLogFollowUp("Ads", `Ad create failed: ${reason}`);
          return;
        }

        const createdAdId = parseAdIdFromEnvelope(
          findLastToolEnvelope(createPlan.results, "STREAM555_AD_CREATE"),
        );
        if (!createdAdId) {
          pushActionLogFollowUp(
            "Ads",
            "Ad create request completed, but no adId was returned for trigger.",
            "warning",
          );
          return;
        }

        const triggerPlan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-ad-trigger",
            steps: [
              {
                id: "ad-trigger",
                toolName: "STREAM555_AD_TRIGGER",
                params: { adId: createdAdId, durationMs: "15000" },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Ad trigger" });
        if (!didToolActionSucceed(triggerPlan, "STREAM555_AD_TRIGGER")) {
          const reason = getToolActionFailureMessage(
            triggerPlan,
            "STREAM555_AD_TRIGGER",
            "ad trigger action did not succeed",
          );
          pushActionLogFollowUp("Ads", `Ad trigger failed: ${reason}`);
          return;
        }
        pushQuickLayerToast(`Ad created and triggered (${createdAdId}).`, "success", 2800);
        prompt =
          `Ad ${createdAdId} was triggered. Briefly summarize monetization impact and what comes next on stream.`;
        shouldSendOperatorMessage = true;
      } catch (err) {
        pushActionLogFollowUp(
          "Ads",
          `Ad action failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "invite-guest") {
      try {
        const plan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-guest-invite",
            steps: [
              {
                id: "guest-invite",
                toolName: "STREAM555_GUEST_INVITE",
                params: { name: "Guest" },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Guest invite" });
        if (didToolActionSucceed(plan, "STREAM555_GUEST_INVITE")) {
          pushQuickLayerToast("Guest invite generated.", "success", 2600);
          prompt =
            "Announce guest invite status and provide concise host handoff guidance.";
          shouldSendOperatorMessage = true;
        } else {
          const reason = getToolActionFailureMessage(
            plan,
            "STREAM555_GUEST_INVITE",
            "guest invite action did not succeed",
          );
          pushActionLogFollowUp("Invite Guest", `Guest invite failed: ${reason}`);
        }
      } catch (err) {
        pushActionLogFollowUp(
          "Invite Guest",
          `Guest invite failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "radio") {
      try {
        const plan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-radio-control",
            steps: [
              {
                id: "radio-mode",
                toolName: "STREAM555_RADIO_CONTROL",
                params: { action: "setAutoDJMode", mode: "MUSIC" },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Radio control" });
        if (didToolActionSucceed(plan, "STREAM555_RADIO_CONTROL")) {
          pushQuickLayerToast("Radio mode updated.", "success", 2600);
          prompt = "Summarize current radio/audio mode and how it supports this segment.";
          shouldSendOperatorMessage = true;
        } else {
          const reason = getToolActionFailureMessage(
            plan,
            "STREAM555_RADIO_CONTROL",
            "radio control action did not succeed",
          );
          pushActionLogFollowUp("Radio", `Radio control failed: ${reason}`);
        }
      } catch (err) {
        pushActionLogFollowUp(
          "Radio",
          `Radio control failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "pip") {
      try {
        const plan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-pip-enable",
            steps: [
              {
                id: "pip-enable",
                toolName: "STREAM555_PIP_ENABLE",
                params: { sceneId: "active-pip" },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "PiP enable" });
        if (didToolActionSucceed(plan, "STREAM555_PIP_ENABLE")) {
          pushQuickLayerToast("PiP scene activated.", "success", 2600);
          prompt =
            "Confirm PiP composition is active and describe what each frame currently shows.";
          shouldSendOperatorMessage = true;
        } else {
          const reason = getToolActionFailureMessage(
            plan,
            "STREAM555_PIP_ENABLE",
            "PiP action did not succeed",
          );
          pushActionLogFollowUp("PiP", `PiP activation failed: ${reason}`);
        }
      } catch (err) {
        pushActionLogFollowUp(
          "PiP",
          `PiP activation failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "reaction-segment") {
      try {
        const plan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-reaction-segment",
            steps: [
              {
                id: "segment-state-before",
                toolName: "STREAM555_SEGMENT_STATE",
                params: {},
              },
              {
                id: "segment-bootstrap",
                toolName: "STREAM555_GO_LIVE_SEGMENTS",
                params: {
                  segmentIntent: "reaction",
                  segmentTypes: "reaction,analysis",
                },
              },
              {
                id: "segment-override-reaction",
                toolName: "STREAM555_SEGMENT_OVERRIDE",
                params: {
                  segmentType: "reaction",
                  reason: "actions-tab reaction segment",
                },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Reaction segment override" });
        if (didToolActionSucceed(plan, "STREAM555_SEGMENT_OVERRIDE")) {
          const bootstrapOk = didToolActionSucceed(plan, "STREAM555_GO_LIVE_SEGMENTS");
          if (bootstrapOk) {
            pushQuickLayerToast(
              "Reaction segment override queued with segment orchestration active.",
              "success",
              2600,
            );
          } else {
            const bootstrapReason = getToolActionFailureMessage(
              plan,
              "STREAM555_GO_LIVE_SEGMENTS",
              "segment orchestration needs follow-up",
            );
            pushActionLogFollowUp(
              "Reaction",
              `Reaction segment override queued, but segment orchestration needs follow-up: ${bootstrapReason}`,
              "warning",
            );
          }
          prompt =
            "Start the next reaction segment now and keep your commentary focused on viewer engagement.";
          shouldSendOperatorMessage = true;
        } else {
          const reason = getToolActionFailureMessage(
            plan,
            "STREAM555_SEGMENT_OVERRIDE",
            "segment override action did not succeed",
          );
          pushActionLogFollowUp(
            "Reaction",
            `Reaction segment override failed: ${reason}`,
          );
        }
      } catch (err) {
        pushActionLogFollowUp(
          "Reaction",
          `Reaction segment override failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "earnings") {
      try {
        const earningsPlan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-earnings-estimate",
            steps: [
              {
                id: "earnings-estimate",
                toolName: "STREAM555_EARNINGS_ESTIMATE",
                params: {
                  categories: "gaming,reaction,news",
                  limit: "5",
                  poolSize: "30",
                },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "Earnings estimate" });
        if (!didToolActionSucceed(earningsPlan, "STREAM555_EARNINGS_ESTIMATE")) {
          const reason = getToolActionFailureMessage(
            earningsPlan,
            "STREAM555_EARNINGS_ESTIMATE",
            "earnings estimate action did not succeed",
          );
          pushActionLogFollowUp("Earnings", `Earnings estimate failed: ${reason}`);
          return;
        }
        const envelope = findLastToolEnvelope(
          earningsPlan.results,
          "STREAM555_EARNINGS_ESTIMATE",
        );
        const maxPayout = parseProjectedEarningsFromEnvelope(envelope);
        pushQuickLayerToast(
          maxPayout && maxPayout > 0
            ? `Projected top payout per impression: ${maxPayout.toFixed(4)} credits.`
            : "Earnings estimate computed.",
          "success",
          3200,
        );
        prompt =
          "Summarize projected earnings opportunities and recommend the next monetization move.";
        shouldSendOperatorMessage = true;
      } catch (err) {
        pushActionLogFollowUp(
          "Earnings",
          `Earnings estimate failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "end-live") {
      try {
        const plan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-end-live",
            steps: [
              {
                id: "end-live",
                toolName: "STREAM555_END_LIVE",
                params: {},
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: false },
        }, { label: "End live" });
        if (didToolActionSucceed(plan, "STREAM555_END_LIVE")) {
          resetLiveComposition();
          pushQuickLayerToast("End-live request dispatched.", "success", 2600);
          prompt =
            "Provide a concise stream wrap-up, final outcomes, and next scheduled action.";
          shouldSendOperatorMessage = true;
        } else {
          const reason = getToolActionFailureMessage(
            plan,
            "STREAM555_END_LIVE",
            "end-live action did not succeed",
          );
          pushActionLogFollowUp("End Live", `End-live failed: ${reason}`);
        }
      } catch (err) {
        pushActionLogFollowUp(
          "End Live",
          `End-live failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "play-games") {
      try {
        const catalog = await client.getFive55GamesCatalog({ includeBeta: true });
        const selectedGameId = selectPreferredGameId(catalog.games);
        const selectedGame = selectedGameId
          ? catalog.games.find((game) => game.id === selectedGameId)
          : undefined;

        const playPlan = await executePlanWithRetry({
          plan: {
            id: "quick-layer-play-games-autonomous",
            steps: [
              {
                id: "play-autonomous",
                toolName: "FIVE55_GAMES_PLAY",
                params: {
                  ...(selectedGameId ? { gameId: selectedGameId } : {}),
                  mode: "spectate",
                },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        }, { label: "Play games" });

        const launch = await resolveAutonomousGameLaunch(
          playPlan.results,
          selectedGameId,
        );

        if (launch.viewerUrl) {
          const resolvedGameId = launch.gameId || selectedGameId || "unknown-game";
          const resolvedGameTitle =
            launch.gameTitle || selectedGame?.title || resolvedGameId;

          openedViewerThisRun = true;
          setActiveGameApp(`five55:${resolvedGameId}`);
          setActiveGameDisplayName(resolvedGameTitle);
          setActiveGameViewerUrl(launch.viewerUrl);
          setActiveGameSandbox(launch.sandbox ?? DEFAULT_GAME_SANDBOX);
          setActiveGamePostMessageAuth(launch.postMessageAuth);
          setActiveGamePostMessagePayload(null);
          setLiveSource({
            id: "active-game",
            kind: "game",
            label: resolvedGameTitle,
            viewerUrl: launch.viewerUrl,
          });
          viewerUrlForStream = launch.viewerUrl;
          prompt =
            `You are now spectating ${resolvedGameTitle} (${resolvedGameId}) in autonomous bot mode. ` +
            "Provide live game commentary, key decisions, and score/capture updates while continuing in-play control.";
          shouldSendOperatorMessage = true;
          operatorDetail = resolvedGameTitle;
          pushQuickLayerToast(
            `Launched ${resolvedGameTitle} in autonomous mode.`,
            "success",
            2400,
          );
        } else {
          pushActionLogFollowUp(
            "Play Games",
            "Autonomous game launch did not return a viewer URL.",
          );
        }
      } catch (err) {
        pushActionLogFollowUp(
          "Play Games",
          `Failed to launch five55 game: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    if (layer.id === "play-games" && viewerUrlForStream) {
      if (stream555ControlAvailable) {
        try {
          const attachPlan = await executePlanWithRetry({
            plan: {
              id: "quick-layer-game-stream555-attach",
              steps: [
                {
                  id: "start-game-feed",
                  toolName: "STREAM555_GO_LIVE",
                  params: {
                    inputType: "website",
                    inputUrl: viewerUrlForStream,
                    layoutMode: "camera-hold",
                  },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
        }, { label: "Game stream attach" });
        if (didToolActionSucceed(attachPlan, "STREAM555_GO_LIVE")) {
          setLiveBroadcastState("live");
          pushQuickLayerToast(
            "Game feed routed to 555 Stream with Alice camera in hold.",
            "success",
            2600,
          );
        } else {
            const reason = getToolActionFailureMessage(
            attachPlan,
            "STREAM555_GO_LIVE",
            "game stream attach did not succeed",
          );
          pushActionLogFollowUp(
            "Play Games",
            `Game launched, but 555 Stream attach failed: ${reason}`,
            "warning",
          );
        }
      } catch (err) {
        pushActionLogFollowUp(
          "Play Games",
          `Game launched, but 555 Stream attach failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "warning",
        );
      }
    } else if (legacyStreamAvailable) {
        try {
          const attachPlan = await executePlanWithRetry({
            plan: {
              id: "quick-layer-game-stream-attach",
              steps: [
                {
                  id: "status-before",
                  toolName: "STREAM_STATUS",
                  params: { scope: "current" },
                },
                {
                  id: "start-game-feed",
                  toolName: "STREAM_CONTROL",
                  params: {
                    operation: "start",
                    scene: "active-pip",
                    inputType: "website",
                    url: viewerUrlForStream,
                  },
                },
                {
                  id: "status-after",
                  toolName: "STREAM_STATUS",
                  params: { scope: "current" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          }, { label: "Game stream attach" });
          const finalStatus = summarizeStreamState(
            findLastToolEnvelope(attachPlan.results, "STREAM_STATUS"),
          );
          if (attachPlan.allSucceeded || finalStatus.live) {
            setLiveBroadcastState("live");
            pushQuickLayerToast(
              `Game feed routed to stream. Stream state: ${finalStatus.label}.`,
              "success",
              2600,
            );
          } else {
            pushActionLogFollowUp(
              "Play Games",
              "Game launched, but stream feed attach needs follow-up in stream controls.",
              "warning",
            );
          }
        } catch (err) {
          pushActionLogFollowUp(
            "Play Games",
            `Game launched, but stream attach failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "warning",
          );
        }
      }
    }

    if (layer.id === "play-games") {
      if (currentTheme === "milady-os" || !isTabEnabled("apps")) {
        setGameOverlayEnabled(Boolean(viewerUrlForStream));
      } else if (layer.navigateToApps) {
        setTab("apps");
        setAppsSubTab(openedViewerThisRun || activeGameViewerUrl.trim() ? "games" : "browse");
      }
    }

    if (shouldSendOperatorMessage && (layer.label.trim().length > 0 || prompt.trim().length > 0)) {
      await sendOperatorActionMessage({
        label: layer.label,
        kind: "stream",
        detail: operatorDetail,
      });
    }
  }, [
    activeGameViewerUrl,
    chatSending,
    currentTheme,
    executePlanWithRetry,
    liveLayoutMode,
    liveSceneId,
    openGoLiveModal,
    openAutonomousRun,
    plugins,
    proStreamerFeedbackSinks,
    quickLayerStatuses,
    resetLiveComposition,
    resolveAutonomousGameLaunch,
    sendOperatorActionMessage,
    setLiveSource,
    setTab,
  ]);

  // ── Pairing ────────────────────────────────────────────────────────

  const handlePairingSubmit = useCallback(async () => {
    if (pairingBusyRef.current || pairingBusy) return;
    const code = pairingCodeInput.trim();
    if (!code) {
      setPairingError("Enter the pairing code from the server logs.");
      return;
    }
    setPairingError(null);
    pairingBusyRef.current = true;
    setPairingBusy(true);
    try {
      const { token } = await client.pair(code);
      client.setToken(token);
      window.location.reload();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 410)
        setPairingError("Pairing code expired. Check logs for a new code.");
      else if (status === 429)
        setPairingError("Too many attempts. Try again later.");
      else setPairingError("Pairing failed. Check the code and try again.");
    } finally {
      pairingBusyRef.current = false;
      setPairingBusy(false);
    }
  }, [pairingBusy, pairingCodeInput]);

  // ── Plugin actions ─────────────────────────────────────────────────

  const handlePluginToggle = useCallback(
    async (pluginId: string, enabled: boolean) => {
      const plugin = plugins.find((p: PluginInfo) => p.id === pluginId);
      const pluginName = plugin?.name ?? pluginId;
      if (
        enabled &&
        plugin?.validationErrors &&
        plugin.validationErrors.length > 0
      ) {
        setPluginSettingsOpen((prev) => new Set([...prev, pluginId]));
        setActionNotice(
          `${pluginName} has required settings. Configure them after enabling.`,
          "info",
          3400,
        );
      }
      try {
        setActionNotice(
          `${enabled ? "Enabling" : "Disabling"} ${pluginName}...`,
          "info",
          4200,
        );
        await client.updatePlugin(pluginId, { enabled });
        await loadPlugins();
        setActionNotice(
          `${pluginName} ${enabled ? "enabled" : "disabled"}. Restart required to apply.`,
          "success",
          2800,
        );
      } catch (err) {
        await loadPlugins().catch(() => {
          /* ignore */
        });
        setActionNotice(
          `Failed to ${enabled ? "enable" : "disable"} ${pluginName}: ${err instanceof Error ? err.message : "unknown error"
          }`,
          "error",
          4200,
        );
      }
    },
    [plugins, loadPlugins, setActionNotice],
  );

  const handlePluginConfigSave = useCallback(
    async (pluginId: string, config: Record<string, string>) => {
      if (Object.keys(config).length === 0) return;
      setPluginSaving((prev) => new Set([...prev, pluginId]));
      try {
        await client.updatePlugin(pluginId, { config });

        // Check if this is an AI provider plugin
        const plugin = plugins.find((p) => p.id === pluginId);
        const isAiProvider = plugin?.category === "ai-provider";

        await loadPlugins();
        setActionNotice(
          isAiProvider
            ? "Provider settings saved. Restart required to apply."
            : "Plugin settings saved.",
          "success",
        );
        setPluginSaveSuccess((prev) => new Set([...prev, pluginId]));
        setTimeout(() => {
          setPluginSaveSuccess((prev) => {
            const next = new Set(prev);
            next.delete(pluginId);
            return next;
          });
        }, 2000);
      } catch (err) {
        setActionNotice(
          `Save failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          3800,
        );
      } finally {
        setPluginSaving((prev) => {
          const next = new Set(prev);
          next.delete(pluginId);
          return next;
        });
      }
    },
    [loadPlugins, setActionNotice, plugins],
  );

  // ── Skill actions ──────────────────────────────────────────────────

  const handleSkillToggle = useCallback(
    async (skillId: string, enabled: boolean) => {
      setSkillToggleAction(skillId);
      try {
        const { skill } = await client.updateSkill(skillId, enabled);
        setSkills((prev) =>
          prev.map((s) =>
            s.id === skillId ? { ...s, enabled: skill.enabled } : s,
          ),
        );
        setActionNotice(
          `${skill.name} ${skill.enabled ? "enabled" : "disabled"}.`,
          "success",
        );
      } catch (err) {
        setActionNotice(
          `Failed to update skill: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          4200,
        );
      } finally {
        setSkillToggleAction("");
      }
    },
    [setActionNotice],
  );

  const handleCreateSkill = useCallback(async () => {
    const name = skillCreateName.trim();
    if (!name) return;
    setSkillCreating(true);
    try {
      const result = await client.createSkill(
        name,
        skillCreateDescription.trim() || "",
      );
      setSkillCreateName("");
      setSkillCreateDescription("");
      setSkillCreateFormOpen(false);
      setActionNotice(`Skill "${name}" created.`, "success");
      await refreshSkills();
      if (result.path)
        await client.openSkill(result.skill?.id ?? name).catch(() => undefined);
    } catch (err) {
      setActionNotice(
        `Failed to create skill: ${err instanceof Error ? err.message : "error"}`,
        "error",
        4200,
      );
    } finally {
      setSkillCreating(false);
    }
  }, [skillCreateName, skillCreateDescription, refreshSkills, setActionNotice]);

  const handleOpenSkill = useCallback(
    async (skillId: string) => {
      try {
        await client.openSkill(skillId);
        setActionNotice("Opening skill folder...", "success", 2000);
      } catch (err) {
        setActionNotice(
          `Failed to open: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      }
    },
    [setActionNotice],
  );

  const handleDeleteSkill = useCallback(
    async (skillId: string, skillName: string) => {
      if (!confirm(`Delete skill "${skillName}"? This cannot be undone.`))
        return;
      try {
        await client.deleteSkill(skillId);
        setActionNotice(`Skill "${skillName}" deleted.`, "success");
        await refreshSkills();
      } catch (err) {
        setActionNotice(
          `Failed to delete: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      }
    },
    [refreshSkills, setActionNotice],
  );

  const handleReviewSkill = useCallback(async (skillId: string) => {
    setSkillReviewId(skillId);
    setSkillReviewLoading(true);
    setSkillReviewReport(null);
    try {
      const { report } = await client.getSkillScanReport(skillId);
      setSkillReviewReport(report);
    } catch {
      setSkillReviewReport(null);
    } finally {
      setSkillReviewLoading(false);
    }
  }, []);

  const handleAcknowledgeSkill = useCallback(
    async (skillId: string) => {
      try {
        await client.acknowledgeSkill(skillId, true);
        setActionNotice(
          `Skill "${skillId}" acknowledged and enabled.`,
          "success",
        );
        setSkillReviewReport(null);
        setSkillReviewId("");
        await refreshSkills();
      } catch (err) {
        setActionNotice(
          `Failed: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      }
    },
    [refreshSkills, setActionNotice],
  );

  const searchSkillsMarketplace = useCallback(async () => {
    const query = skillsMarketplaceQuery.trim();
    if (!query) {
      setSkillsMarketplaceResults([]);
      setSkillsMarketplaceError("");
      return;
    }
    setSkillsMarketplaceLoading(true);
    setSkillsMarketplaceError("");
    try {
      const { results } = await client.searchSkillsMarketplace(
        query,
        false,
        20,
      );
      setSkillsMarketplaceResults(results);
    } catch (err) {
      setSkillsMarketplaceResults([]);
      setSkillsMarketplaceError(
        err instanceof Error ? err.message : "unknown error",
      );
    } finally {
      setSkillsMarketplaceLoading(false);
    }
  }, [skillsMarketplaceQuery]);

  const installSkillFromMarketplace = useCallback(
    async (item: SkillMarketplaceResult) => {
      setSkillsMarketplaceAction(`install:${item.id}`);
      try {
        await client.installMarketplaceSkill({
          slug: item.slug ?? item.id,
          githubUrl: item.githubUrl,
          repository: item.repository,
          path: item.path ?? undefined,
          name: item.name,
          description: item.description,
          source: item.source ?? "clawhub",
          autoRefresh: true,
        });
        await refreshSkills();
        setActionNotice(`Installed skill: ${item.name}`, "success");
      } catch (err) {
        setActionNotice(
          `Skill install failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          4200,
        );
      } finally {
        setSkillsMarketplaceAction("");
      }
    },
    [refreshSkills, setActionNotice],
  );

  const installSkillFromGithubUrl = useCallback(async () => {
    const githubUrl = skillsMarketplaceManualGithubUrl.trim();
    if (!githubUrl) return;
    setSkillsMarketplaceAction("install:manual");
    try {
      let repository: string | undefined;
      let skillPath: string | undefined;
      let inferredName: string | undefined;
      try {
        const parsed = new URL(githubUrl);
        if (parsed.hostname === "github.com") {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) repository = `${parts[0]}/${parts[1]}`;
          if (parts[2] === "tree" && parts.length >= 5) {
            skillPath = parts.slice(4).join("/");
            inferredName = parts[parts.length - 1];
          }
        }
      } catch {
        /* keep raw URL */
      }
      await client.installMarketplaceSkill({
        githubUrl,
        repository,
        path: skillPath,
        name: inferredName,
        source: "manual",
        autoRefresh: true,
      });
      setSkillsMarketplaceManualGithubUrl("");
      await refreshSkills();
      setActionNotice("Skill installed from GitHub URL.", "success");
    } catch (err) {
      setActionNotice(
        `GitHub install failed: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
    } finally {
      setSkillsMarketplaceAction("");
    }
  }, [skillsMarketplaceManualGithubUrl, refreshSkills, setActionNotice]);

  const uninstallMarketplaceSkill = useCallback(
    async (skillId: string, name: string) => {
      setSkillsMarketplaceAction(`uninstall:${skillId}`);
      try {
        await client.deleteSkill(skillId);
        await refreshSkills();
        setActionNotice(`Uninstalled skill: ${name}`, "success");
      } catch (err) {
        setActionNotice(
          `Skill uninstall failed: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          4200,
        );
      } finally {
        setSkillsMarketplaceAction("");
      }
    },
    [refreshSkills, setActionNotice],
  );

  // ── Inventory actions ──────────────────────────────────────────────

  const handleWalletApiKeySave = useCallback(
    async (config: Record<string, string>) => {
      if (Object.keys(config).length === 0) return;
      if (walletApiKeySavingRef.current || walletApiKeySaving) return;
      walletApiKeySavingRef.current = true;
      setWalletApiKeySaving(true);
      setWalletError(null);
      try {
        await client.updateWalletConfig(config);
        await loadWalletConfig();
        await loadBalances();
        setActionNotice(
          "Wallet API keys saved. Restart required to apply.",
          "success",
        );
      } catch (err) {
        setWalletError(
          `Failed to save API keys: ${err instanceof Error ? err.message : "network error"}`,
        );
      } finally {
        walletApiKeySavingRef.current = false;
        setWalletApiKeySaving(false);
      }
    },
    [walletApiKeySaving, loadWalletConfig, loadBalances, setActionNotice],
  );

  const handleExportKeys = useCallback(async () => {
    if (walletExportVisible) {
      setWalletExportVisible(false);
      setWalletExportData(null);
      return;
    }
    const confirmed = window.confirm(
      "This will reveal your private keys.\n\nNEVER share your private keys with anyone.\nAnyone with your private keys can steal all funds in your wallets.\n\nContinue?",
    );
    if (!confirmed) return;
    const exportToken = window.prompt(
      "Enter your wallet export token (MILADY_WALLET_EXPORT_TOKEN):",
      "",
    );
    if (exportToken === null) return;
    if (!exportToken.trim()) {
      setWalletError("Wallet export token is required.");
      return;
    }
    try {
      const data = await client.exportWalletKeys(exportToken.trim());
      setWalletExportData(data);
      setWalletExportVisible(true);
      setTimeout(() => {
        setWalletExportVisible(false);
        setWalletExportData(null);
      }, 60_000);
    } catch (err) {
      setWalletError(
        `Failed to export keys: ${err instanceof Error ? err.message : "network error"}`,
      );
    }
  }, [walletExportVisible]);

  // ── Registry / Drop / Whitelist actions ─────────────────────────────

  const loadRegistryStatus = useCallback(async () => {
    setRegistryLoading(true);
    setRegistryError(null);
    try {
      const status = await client.getRegistryStatus();
      setRegistryStatus(status);
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Failed to load registry status",
      );
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const registerOnChain = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.registerAgent({
        name: characterDraft?.name || agentStatus?.agentName,
      });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(
        err instanceof Error ? err.message : "Registration failed",
      );
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterDraft?.name, agentStatus?.agentName, loadRegistryStatus]);

  const syncRegistryProfile = useCallback(async () => {
    setRegistryRegistering(true);
    setRegistryError(null);
    try {
      await client.syncRegistryProfile({
        name: characterDraft?.name || agentStatus?.agentName,
      });
      await loadRegistryStatus();
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setRegistryRegistering(false);
    }
  }, [characterDraft?.name, agentStatus?.agentName, loadRegistryStatus]);

  const loadDropStatus = useCallback(async () => {
    setDropLoading(true);
    try {
      const status = await client.getDropStatus();
      setDropStatus(status);
    } catch {
      // Non-critical -- drop may not be configured
    } finally {
      setDropLoading(false);
    }
  }, []);

  const mintFromDrop = useCallback(
    async (shiny: boolean) => {
      setMintInProgress(true);
      setMintShiny(shiny);
      setMintError(null);
      setMintResult(null);
      try {
        const result = await client.mintAgent({
          name: characterDraft?.name || agentStatus?.agentName,
          shiny,
        });
        setMintResult(result);
        await loadRegistryStatus();
        await loadDropStatus();
      } catch (err) {
        setMintError(err instanceof Error ? err.message : "Mint failed");
      } finally {
        setMintInProgress(false);
        setMintShiny(false);
      }
    },
    [
      characterDraft?.name,
      agentStatus?.agentName,
      loadRegistryStatus,
      loadDropStatus,
    ],
  );

  const loadWhitelistStatus = useCallback(async () => {
    setWhitelistLoading(true);
    try {
      const status = await client.getWhitelistStatus();
      setWhitelistStatus(status);
    } catch {
      // Non-critical
    } finally {
      setWhitelistLoading(false);
    }
  }, []);

  // ── Character actions ──────────────────────────────────────────────

  const handleSaveCharacter = useCallback(async () => {
    setCharacterSaving(true);
    setCharacterSaveError(null);
    setCharacterSaveSuccess(null);
    try {
      const draft = { ...characterDraft };
      if (typeof draft.bio === "string") {
        const lines = draft.bio
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        draft.bio = lines.length > 0 ? lines : undefined;
      }
      if (Array.isArray(draft.adjectives) && draft.adjectives.length === 0)
        delete draft.adjectives;
      if (Array.isArray(draft.topics) && draft.topics.length === 0)
        delete draft.topics;
      if (Array.isArray(draft.postExamples) && draft.postExamples.length === 0)
        delete draft.postExamples;
      if (
        Array.isArray(draft.messageExamples) &&
        draft.messageExamples.length === 0
      )
        delete draft.messageExamples;
      if (draft.style) {
        const s = draft.style;
        if (s.all && s.all.length === 0) delete s.all;
        if (s.chat && s.chat.length === 0) delete s.chat;
        if (s.post && s.post.length === 0) delete s.post;
        if (!s.all && !s.chat && !s.post) delete draft.style;
      }
      if (draft.name) draft.username = draft.name;
      if (!draft.name) delete draft.name;
      if (!draft.username) delete draft.username;
      if (!draft.system) delete draft.system;
      const { agentName } = await client.updateCharacter(draft);
      // Also persist avatar selection to config (under "ui" which is allowlisted)
      try {
        await client.updateConfig({
          ui: { avatarIndex: selectedVrmIndex },
        });
      } catch {
        /* non-fatal */
      }
      setCharacterSaveSuccess("Character saved successfully.");
      if (agentName && agentStatus) {
        setAgentStatus({ ...agentStatus, agentName });
      }
      await loadCharacter();
    } catch (err) {
      setCharacterSaveError(
        `Failed to save: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    setCharacterSaving(false);
  }, [characterDraft, agentStatus, loadCharacter, selectedVrmIndex]);

  const handleCharacterFieldInput = useCallback(
    <K extends keyof CharacterData>(field: K, value: CharacterData[K]) => {
      setCharacterDraft((prev: CharacterData) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleCharacterArrayInput = useCallback(
    (field: "adjectives" | "topics" | "postExamples", value: string) => {
      const items = value
        .split("\n")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      setCharacterDraft((prev: CharacterData) => ({ ...prev, [field]: items }));
    },
    [],
  );

  const handleCharacterStyleInput = useCallback(
    (subfield: "all" | "chat" | "post", value: string) => {
      const items = value
        .split("\n")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      setCharacterDraft((prev: CharacterData) => ({
        ...prev,
        style: { ...(prev.style ?? {}), [subfield]: items },
      }));
    },
    [],
  );

  const handleCharacterMessageExamplesInput = useCallback((value: string) => {
    if (!value.trim()) {
      setCharacterDraft((prev: CharacterData) => ({
        ...prev,
        messageExamples: [],
      }));
      return;
    }
    const blocks = value.split(/\n\s*\n/).filter((b) => b.trim().length > 0);
    const parsed = blocks.map((block) => {
      const lines = block.split("\n").filter((l) => l.trim().length > 0);
      const examples = lines.map((line) => {
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          return {
            name: line.slice(0, colonIdx).trim(),
            content: { text: line.slice(colonIdx + 1).trim() },
          };
        }
        return { name: "User", content: { text: line.trim() } };
      });
      return { examples };
    });
    setCharacterDraft((prev: CharacterData) => ({
      ...prev,
      messageExamples: parsed,
    }));
  }, []);

  // ── Onboarding ─────────────────────────────────────────────────────

  const handleOnboardingFinish = useCallback(async () => {
    if (onboardingFinishBusyRef.current || onboardingRestarting) return;
    if (!onboardingOptions) return;
    if (onboardingFinishSavingRef.current || onboardingRestarting) return;
    const style = onboardingOptions.styles.find(
      (s: StylePreset) => s.catchphrase === onboardingStyle,
    );
    const systemPrompt = style?.system
      ? style.system.replace(/\{\{name\}\}/g, onboardingName)
      : `You are ${onboardingName}, an autonomous AI agent powered by ElizaOS. ${onboardingOptions.sharedStyleRules}`;

    const isLocalMode =
      onboardingRunMode === "local-rawdog" ||
      onboardingRunMode === "local-sandbox";
    const inventoryProviders: Array<{
      chain: string;
      rpcProvider: string;
      rpcApiKey?: string;
    }> = [];
    if (isLocalMode) {
      for (const chain of onboardingSelectedChains) {
        const rpcProvider = onboardingRpcSelections[chain] || "elizacloud";
        const rpcApiKey =
          onboardingRpcKeys[`${chain}:${rpcProvider}`] || undefined;
        inventoryProviders.push({ chain, rpcProvider, rpcApiKey });
      }
    }

    // Map the 3-mode selection to the API's runMode field
    // "local-rawdog" and "local-sandbox" both map to "local" for backward compat
    // Sandbox mode is additionally stored as a separate flag
    const apiRunMode = onboardingRunMode === "cloud" ? "cloud" : "local";

    onboardingFinishBusyRef.current = true;
    setOnboardingRestarting(true);
    onboardingFinishSavingRef.current = true;

    try {
      await client.submitOnboarding({
        name: onboardingName,
        theme: onboardingTheme,
        runMode: apiRunMode as "local" | "cloud",
        sandboxMode:
          onboardingRunMode === "local-sandbox"
            ? "standard"
            : onboardingRunMode === "cloud"
              ? "light"
              : "off",
        bio: style?.bio ?? ["An autonomous AI agent."],
        systemPrompt,
        style: style?.style,
        adjectives: style?.adjectives,
        topics: style?.topics,
        postExamples: style?.postExamples,
        messageExamples: style?.messageExamples,
        cloudProvider:
          onboardingRunMode === "cloud" ? onboardingCloudProvider : undefined,
        smallModel:
          onboardingRunMode === "cloud" ? onboardingSmallModel : undefined,
        largeModel:
          onboardingRunMode === "cloud" ? onboardingLargeModel : undefined,
        provider: isLocalMode ? onboardingProvider || undefined : undefined,
        providerApiKey: isLocalMode ? onboardingApiKey || undefined : undefined,
        primaryModel: isLocalMode
          ? onboardingPrimaryModel.trim() || undefined
          : undefined,
        inventoryProviders:
          inventoryProviders.length > 0 ? inventoryProviders : undefined,
        // Connectors
        telegramToken: onboardingTelegramToken.trim() || undefined,
        discordToken: onboardingDiscordToken.trim() || undefined,
        whatsappSessionPath: onboardingWhatsAppSessionPath.trim() || undefined,
        twilioAccountSid: onboardingTwilioAccountSid.trim() || undefined,
        twilioAuthToken: onboardingTwilioAuthToken.trim() || undefined,
        twilioPhoneNumber: onboardingTwilioPhoneNumber.trim() || undefined,
        blooioApiKey: onboardingBlooioApiKey.trim() || undefined,
        blooioPhoneNumber: onboardingBlooioPhoneNumber.trim() || undefined,
        githubToken: onboardingGithubToken.trim() || undefined,
      });
      setOnboardingComplete(true);
      setTab("chat");
      try {
        setAgentStatus(await client.restartAgent());
      } catch {
        /* ignore */
      }
    } catch (err) {
      window.alert(
        `Setup failed: ${err instanceof Error ? err.message : "network error"}. Please try again.`,
      );
    } finally {
      onboardingFinishSavingRef.current = false;
      onboardingFinishBusyRef.current = false;
      setOnboardingRestarting(false);
    }
  }, [
    onboardingRestarting,
    onboardingOptions,
    onboardingStyle,
    onboardingName,
    onboardingTheme,
    onboardingRunMode,
    onboardingCloudProvider,
    onboardingSmallModel,
    onboardingLargeModel,
    onboardingProvider,
    onboardingApiKey,
    onboardingPrimaryModel,
    onboardingSelectedChains,
    onboardingRpcSelections,
    onboardingRpcKeys,
    onboardingTelegramToken,
    onboardingDiscordToken,
    onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid,
    onboardingTwilioAuthToken,
    onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey,
    onboardingBlooioPhoneNumber,
    onboardingGithubToken,
    setTab,
  ]);

  const handleOnboardingNext = useCallback(
    async (options?: OnboardingNextOptions) => {
      const opts = onboardingOptions;
      switch (onboardingStep) {
        case "welcome":
          setOnboardingStep("name");
          break;
        case "name":
          setOnboardingStep("avatar");
          break;
        case "avatar":
          setOnboardingStep("style");
          break;
        case "style":
          setOnboardingStep("theme");
          break;
        case "theme": {
          setTheme(onboardingTheme);
          // If drop is enabled and user hasn't minted, go to mint step
          if (
            dropStatus?.dropEnabled &&
            !dropStatus.userHasMinted &&
            !dropStatus.mintedOut
          ) {
            setOnboardingStep("mint");
          } else {
            setOnboardingStep("runMode");
          }
          break;
        }
        case "mint":
          setOnboardingStep("runMode");
          break;
        case "runMode":
          if (onboardingRunMode === "cloud") {
            if (opts && opts.cloudProviders.length === 1) {
              setOnboardingCloudProvider(opts.cloudProviders[0].id);
            }
            setOnboardingStep("cloudProvider");
          } else if (onboardingRunMode === "local-sandbox") {
            setOnboardingStep("dockerSetup");
          } else {
            // local-rawdog: skip docker, go straight to LLM provider
            setOnboardingStep("llmProvider");
          }
          break;
        case "dockerSetup":
          setOnboardingStep("llmProvider");
          break;
        case "cloudProvider":
          setOnboardingStep("modelSelection");
          break;
        case "modelSelection":
          if (cloudConnected) {
            setOnboardingStep("connectors");
          } else {
            setOnboardingStep("cloudLogin");
          }
          break;
        case "cloudLogin":
          setOnboardingStep("connectors");
          break;
        case "llmProvider":
          setOnboardingStep("inventorySetup");
          break;
        case "inventorySetup":
          setOnboardingStep("connectors");
          break;
        case "connectors":
          setOnboardingStep("permissions");
          break;
        case "permissions": {
          if (options?.allowPermissionBypass) {
            await handleOnboardingFinish();
            break;
          }
          try {
            const permissions = await client.getPermissions();
            const missingPermissions =
              getMissingOnboardingPermissions(permissions);
            if (missingPermissions.length > 0) {
              const missingLabels = missingPermissions
                .map((id) => ONBOARDING_PERMISSION_LABELS[id] ?? id)
                .join(", ");
              setActionNotice(
                `Missing required permissions: ${missingLabels}. Grant them or use "Skip for Now".`,
                "error",
                5200,
              );
              return;
            }
          } catch (err) {
            setActionNotice(
              `Could not verify permissions (${err instanceof Error ? err.message : "unknown error"}). Use "Skip for Now" to continue.`,
              "error",
              5200,
            );
            return;
          }
          await handleOnboardingFinish();
          break;
        }
      }
    },
    [
      onboardingStep,
      onboardingOptions,
      onboardingRunMode,
      onboardingTheme,
      setTheme,
      cloudConnected,
      setActionNotice,
      handleOnboardingFinish,
      dropStatus?.dropEnabled,
      dropStatus?.userHasMinted,
      dropStatus?.mintedOut,
    ],
  );

  const handleOnboardingBack = useCallback(() => {
    switch (onboardingStep) {
      case "name":
        setOnboardingStep("welcome");
        break;
      case "avatar":
        setOnboardingStep("name");
        break;
      case "style":
        setOnboardingStep("avatar");
        break;
      case "theme":
        setOnboardingStep("style");
        break;
      case "mint":
        setOnboardingStep("theme");
        break;
      case "runMode":
        if (
          dropStatus?.dropEnabled &&
          !dropStatus.userHasMinted &&
          !dropStatus.mintedOut
        ) {
          setOnboardingStep("mint");
        } else {
          setOnboardingStep("theme");
        }
        break;
      case "cloudProvider":
        setOnboardingStep("runMode");
        break;
      case "modelSelection":
        setOnboardingStep("cloudProvider");
        break;
      case "cloudLogin":
        setOnboardingStep("modelSelection");
        if (cloudLoginPollTimer.current) {
          clearInterval(cloudLoginPollTimer.current);
          cloudLoginPollTimer.current = null;
        }
        cloudLoginBusyRef.current = false;
        setCloudLoginBusy(false);
        setCloudLoginError(null);
        break;
      case "dockerSetup":
        setOnboardingStep("runMode");
        break;
      case "llmProvider":
        if (onboardingRunMode === "local-sandbox") {
          setOnboardingStep("dockerSetup");
        } else {
          setOnboardingStep("runMode");
        }
        break;
      case "inventorySetup":
        setOnboardingStep("llmProvider");
        break;
      case "connectors":
        // Go back to whichever path we came from
        if (onboardingRunMode === "cloud") {
          setOnboardingStep("modelSelection");
        } else {
          setOnboardingStep("inventorySetup");
        }
        break;
      case "permissions":
        setOnboardingStep("connectors");
        break;
    }
  }, [onboardingStep, onboardingOptions, onboardingRunMode]);

  // ── Cloud ──────────────────────────────────────────────────────────

  const handleCloudLogin = useCallback(async () => {
    if (cloudLoginBusyRef.current || cloudLoginBusy) return;
    cloudLoginBusyRef.current = true;
    setCloudLoginBusy(true);
    setCloudLoginError(null);
    try {
      const resp = await client.cloudLogin();
      if (!resp.ok) throw new Error("Failed to start login session");
      window.open(resp.browserUrl, "_blank");
      // Poll for completion
      let attempts = 0;
      cloudLoginPollTimer.current = window.setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          if (cloudLoginPollTimer.current)
            clearInterval(cloudLoginPollTimer.current);
          setCloudLoginError("Login timed out. Please try again.");
          cloudLoginBusyRef.current = false;
          setCloudLoginBusy(false);
          return;
        }
        try {
          const poll = await client.cloudLoginPoll(resp.sessionId);
          if (poll.status === "authenticated") {
            if (cloudLoginPollTimer.current)
              clearInterval(cloudLoginPollTimer.current);
            cloudLoginBusyRef.current = false;
            setCloudLoginBusy(false);
            // Immediately reflect the login in the UI — don't wait for the
            // background poll which may race with the config save.
            setCloudConnected(true);
            setCloudEnabled(true);
            setActionNotice(
              "Logged in to Eliza Cloud successfully.",
              "success",
              6000,
            );
            void loadWalletConfig();
            // Delay the credit fetch slightly so the backend has time to
            // persist the API key before we query cloud status / credits.
            setTimeout(() => void pollCloudCredits(), 2000);
          } else if (poll.status === "expired" || poll.status === "error") {
            if (cloudLoginPollTimer.current)
              clearInterval(cloudLoginPollTimer.current);
            setCloudLoginError(
              poll.error ?? "Session expired. Please try again.",
            );
            cloudLoginBusyRef.current = false;
            setCloudLoginBusy(false);
          }
        } catch {
          /* keep trying */
        }
      }, 1000);
    } catch (err) {
      setCloudLoginError(err instanceof Error ? err.message : "Login failed");
      cloudLoginBusyRef.current = false;
      setCloudLoginBusy(false);
    }
  }, [cloudLoginBusy, setActionNotice, pollCloudCredits, loadWalletConfig]);

  const handleCloudDisconnect = useCallback(async () => {
    if (
      !confirm(
        "Disconnect from Eliza Cloud? The agent will need a local AI provider to continue working.",
      )
    )
      return;
    setCloudDisconnecting(true);
    try {
      await client.cloudDisconnect();
      setCloudEnabled(false);
      setCloudConnected(false);
      setCloudCredits(null);
      setCloudUserId(null);
      setActionNotice("Disconnected from Eliza Cloud.", "success");
    } catch (err) {
      setActionNotice(
        `Disconnect failed: ${err instanceof Error ? err.message : "error"}`,
        "error",
      );
    } finally {
      setCloudDisconnecting(false);
    }
  }, [setActionNotice]);

  // ── Updates ────────────────────────────────────────────────────────

  const handleChannelChange = useCallback(
    async (channel: ReleaseChannel) => {
      if (updateChannelSavingRef.current || updateChannelSaving) return;
      if (updateStatus?.channel === channel) return;
      updateChannelSavingRef.current = true;
      setUpdateChannelSaving(true);
      try {
        await client.setUpdateChannel(channel);
        await loadUpdateStatus(true);
      } catch {
        /* ignore */
      } finally {
        updateChannelSavingRef.current = false;
        setUpdateChannelSaving(false);
      }
    },
    [updateChannelSaving, updateStatus, loadUpdateStatus],
  );

  // ── Agent export/import ────────────────────────────────────────────

  const handleAgentExport = useCallback(async () => {
    if (exportBusyRef.current || exportBusy) return;
    if (!exportPassword) {
      setExportError("Password is required.");
      setExportSuccess(null);
      return;
    }
    if (exportPassword.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      setExportError(
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
      );
      setExportSuccess(null);
      return;
    }
    try {
      exportBusyRef.current = true;
      setExportBusy(true);
      setExportError(null);
      setExportSuccess(null);
      const resp = await client.exportAgent(exportPassword, exportIncludeLogs);
      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
      const filename = filenameMatch?.[1] ?? "agent-export.eliza-agent";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(
        `Exported successfully (${(blob.size / 1024).toFixed(0)} KB)`,
      );
      setExportPassword("");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      exportBusyRef.current = false;
      setExportBusy(false);
    }
  }, [exportBusy, exportPassword, exportIncludeLogs]);

  const handleAgentImport = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError("Select an export file before importing.");
      setImportSuccess(null);
      return;
    }
    if (!importPassword) {
      setImportError("Password is required.");
      setImportSuccess(null);
      return;
    }
    if (importPassword.length < AGENT_TRANSFER_MIN_PASSWORD_LENGTH) {
      setImportError(
        `Password must be at least ${AGENT_TRANSFER_MIN_PASSWORD_LENGTH} characters.`,
      );
      setImportSuccess(null);
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully: ${summary || "no data"}. Restart the agent to activate.`,
      );
      setImportPassword("");
      setImportFile(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword]);

  // ── Emote picker ────────────────────────────────────────────────────

  const openEmotePicker = useCallback(() => {
    setEmotePickerOpen(true);
  }, []);

  const closeEmotePicker = useCallback(() => {
    setEmotePickerOpen(false);
  }, []);

  const clearAvatarMotionReset = useCallback(() => {
    if (avatarMotionResetTimeoutRef.current !== null) {
      clearTimeout(avatarMotionResetTimeoutRef.current);
      avatarMotionResetTimeoutRef.current = null;
    }
  }, []);

  const scheduleAvatarMotionReset = useCallback(
    (durationMs: number) => {
      clearAvatarMotionReset();
      avatarMotionResetTimeoutRef.current = setTimeout(() => {
        pendingManualAvatarEmoteRef.current = null;
        setActiveAvatarEmoteId(null);
        setAvatarMotionMode("idle");
        avatarMotionResetTimeoutRef.current = null;
      }, Math.max(750, durationMs));
    },
    [clearAvatarMotionReset],
  );

  const loadAvailableEmotes = useCallback(async () => {
    try {
      const response = await client.listEmotes();
      setAvailableEmotes(response.emotes ?? []);
    } catch (err) {
      console.warn("[milady] Failed to load emotes", err);
    }
  }, []);

  useEffect(() => {
    if (authRequired) return;
    void loadAvailableEmotes();
    return () => {
      clearAvatarMotionReset();
    };
  }, [authRequired, clearAvatarMotionReset, loadAvailableEmotes]);

  useEffect(() => {
    if (authRequired) return undefined;

    const unbindEmotes = client.onWsEvent("emote", (data) => {
      const emoteId =
        typeof data.emoteId === "string" ? data.emoteId.trim() : "";
      if (!emoteId) return;

      const loop = data.loop === true;
      const rawDuration =
        typeof data.duration === "number" ? data.duration : Number(data.duration);
      const durationMs =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration * 1000
          : 3000;

      const pending = pendingManualAvatarEmoteRef.current;
      const isManual =
        pending?.emoteId === emoteId && pending.expiresAt > Date.now();
      if (!isManual) {
        pendingManualAvatarEmoteRef.current = null;
      }

      setActiveAvatarEmoteId(emoteId);
      setAvatarMotionMode(isManual ? "manual" : "auto");

      if (loop) {
        clearAvatarMotionReset();
      } else {
        scheduleAvatarMotionReset(durationMs);
      }
    });

    return () => {
      unbindEmotes?.();
    };
  }, [authRequired, clearAvatarMotionReset, scheduleAvatarMotionReset]);

  const playAvatarEmote = useCallback(
    async (emoteId: string) => {
      const emote = availableEmoteById.get(emoteId);
      if (!emote) {
        setActionNotice(`Unknown avatar action: ${emoteId}`, "error", 2400);
        return;
      }

      pendingManualAvatarEmoteRef.current = {
        emoteId,
        expiresAt: Date.now() + 4_000,
      };
      clearAvatarMotionReset();
      setActiveAvatarEmoteId(emoteId);
      setAvatarMotionMode("manual");

      try {
        await client.playEmote(emoteId);
        void sendOperatorActionMessage({
          label: emote.name,
          kind: "avatar",
          detail: emote.loop ? "Looping motion" : "One-shot motion",
        });
        if (!emote.loop) {
          scheduleAvatarMotionReset(emote.duration * 1000);
        }
      } catch (err) {
        pendingManualAvatarEmoteRef.current = null;
        setActiveAvatarEmoteId(null);
        setAvatarMotionMode("idle");
        setActionNotice(
          `Failed to play ${emote.name}: ${err instanceof Error ? err.message : "unknown error"}`,
          "error",
          3200,
        );
      }
    },
    [
      availableEmoteById,
      clearAvatarMotionReset,
      scheduleAvatarMotionReset,
      sendOperatorActionMessage,
      setActionNotice,
    ],
  );

  const stopAvatarEmote = useCallback(() => {
    pendingManualAvatarEmoteRef.current = null;
    clearAvatarMotionReset();
    setActiveAvatarEmoteId(null);
    setAvatarMotionMode("idle");
    document.dispatchEvent(new CustomEvent("milady:stop-emote"));
    void sendOperatorActionMessage({
      label: "Stop Motion",
      kind: "avatar",
      detail: "Idle pool restored",
    });
  }, [clearAvatarMotionReset, sendOperatorActionMessage]);

  // ── Generic state setter ───────────────────────────────────────────

  const setState = useCallback(
    <K extends keyof AppState>(key: K, value: AppState[K]) => {
      const setterMap: Partial<{
        [S in keyof AppState]: (v: AppState[S]) => void;
      }> = {
        tab: setTabRaw,
        chatInput: setChatInput,
        chatAvatarVisible: setChatAvatarVisible,
        chatAgentVoiceMuted: setChatAgentVoiceMuted,
        chatAvatarSpeaking: setChatAvatarSpeaking,
        autonomousRunOpen: setAutonomousRunOpen,
        autoRunMode: setAutoRunMode,
        autoRunTopic: setAutoRunTopic,
        autoRunDurationMin: setAutoRunDurationMin,
        autoRunAvatarRuntime: setAutoRunAvatarRuntime,
        autoRunPreview: setAutoRunPreview,
        autoRunPreviewBusy: setAutoRunPreviewBusy,
        autoRunLaunching: setAutoRunLaunching,
        startupError: setStartupError,
        pairingCodeInput: setPairingCodeInput,
        pluginFilter: setPluginFilter,
        pluginStatusFilter: setPluginStatusFilter,
        pluginSearch: setPluginSearch,
        pluginSettingsOpen: setPluginSettingsOpen,
        pluginAdvancedOpen: setPluginAdvancedOpen,
        skillsSubTab: setSkillsSubTab,
        skillCreateFormOpen: setSkillCreateFormOpen,
        skillCreateName: setSkillCreateName,
        skillCreateDescription: setSkillCreateDescription,
        skillsMarketplaceQuery: setSkillsMarketplaceQuery,
        skillsMarketplaceManualGithubUrl: setSkillsMarketplaceManualGithubUrl,
        logTagFilter: setLogTagFilter,
        logLevelFilter: setLogLevelFilter,
        logSourceFilter: setLogSourceFilter,
        inventoryView: setInventoryView,
        inventorySort: setInventorySort,
        exportPassword: setExportPassword,
        exportIncludeLogs: setExportIncludeLogs,
        exportError: setExportError,
        exportSuccess: setExportSuccess,
        importPassword: setImportPassword,
        importFile: setImportFile,
        importError: setImportError,
        importSuccess: setImportSuccess,
        onboardingName: setOnboardingName,
        onboardingStyle: setOnboardingStyle,
        onboardingTheme: setOnboardingTheme,
        onboardingRunMode: setOnboardingRunMode,
        onboardingCloudProvider: setOnboardingCloudProvider,
        onboardingSmallModel: setOnboardingSmallModel,
        onboardingLargeModel: setOnboardingLargeModel,
        onboardingProvider: setOnboardingProvider,
        onboardingApiKey: setOnboardingApiKey,
        onboardingSelectedChains: setOnboardingSelectedChains,
        onboardingRpcSelections: setOnboardingRpcSelections,
        onboardingOpenRouterModel: setOnboardingOpenRouterModel,
        onboardingPrimaryModel: setOnboardingPrimaryModel,
        onboardingTelegramToken: setOnboardingTelegramToken,
        onboardingDiscordToken: setOnboardingDiscordToken,
        onboardingWhatsAppSessionPath: setOnboardingWhatsAppSessionPath,
        onboardingTwilioAccountSid: setOnboardingTwilioAccountSid,
        onboardingTwilioAuthToken: setOnboardingTwilioAuthToken,
        onboardingTwilioPhoneNumber: setOnboardingTwilioPhoneNumber,
        onboardingBlooioApiKey: setOnboardingBlooioApiKey,
        onboardingBlooioPhoneNumber: setOnboardingBlooioPhoneNumber,
        onboardingGithubToken: setOnboardingGithubToken,
        onboardingSubscriptionTab: setOnboardingSubscriptionTab,
        onboardingRpcKeys: setOnboardingRpcKeys,
        onboardingAvatar: setOnboardingAvatar,
        onboardingRestarting: setOnboardingRestarting,
        cloudEnabled: setCloudEnabled,
        selectedVrmIndex: setSelectedVrmIndex,
        customVrmUrl: setCustomVrmUrl,
        commandQuery: setCommandQuery,
        commandActiveIndex: setCommandActiveIndex,
        emotePickerOpen: setEmotePickerOpen,
        availableEmotes: setAvailableEmotes,
        activeAvatarEmoteId: setActiveAvatarEmoteId,
        avatarMotionMode: setAvatarMotionMode,
        storeSearch: setStoreSearch,
        storeFilter: setStoreFilter,
        storeSubTab: setStoreSubTab,
        catalogSearch: setCatalogSearch,
        catalogSort: setCatalogSort,
        catalogPage: setCatalogPage,
        skillReviewId: setSkillReviewId,
        skillReviewReport: setSkillReviewReport,
        activeGameApp: setActiveGameApp,
        activeGameDisplayName: setActiveGameDisplayName,
        activeGameViewerUrl: setActiveGameViewerUrl,
        activeGameSandbox: setActiveGameSandbox,
        activeGamePostMessageAuth: setActiveGamePostMessageAuth,
        activeGamePostMessagePayload: setActiveGamePostMessagePayload,
        liveBroadcastState: setLiveBroadcastState,
        liveSecondarySources: setLiveSecondarySources,
        gameOverlayEnabled: setGameOverlayEnabled,
        storePlugins: setStorePlugins,
        storeLoading: setStoreLoading,
        storeInstalling: setStoreInstalling,
        storeUninstalling: setStoreUninstalling,
        storeError: setStoreError,
        storeDetailPlugin: setStoreDetailPlugin,
        catalogSkills: setCatalogSkills,
        catalogTotal: setCatalogTotal,
        catalogTotalPages: setCatalogTotalPages,
        catalogLoading: setCatalogLoading,
        catalogError: setCatalogError,
        catalogDetailSkill: setCatalogDetailSkill,
        catalogInstalling: setCatalogInstalling,
        catalogUninstalling: setCatalogUninstalling,
        mcpConfiguredServers: setMcpConfiguredServers,
        mcpServerStatuses: setMcpServerStatuses,
        mcpMarketplaceQuery: setMcpMarketplaceQuery,
        mcpMarketplaceResults: setMcpMarketplaceResults,
        mcpMarketplaceLoading: setMcpMarketplaceLoading,
        mcpAction: setMcpAction,
        mcpAddingServer: setMcpAddingServer,
        mcpAddingResult: setMcpAddingResult,
        mcpEnvInputs: setMcpEnvInputs,
        mcpHeaderInputs: setMcpHeaderInputs,
        droppedFiles: setDroppedFiles,
        shareIngestNotice: setShareIngestNotice,
        appsSubTab: setAppsSubTab,
        agentSubTab: setAgentSubTab,
        pluginsSubTab: setPluginsSubTab,
        databaseSubTab: setDatabaseSubTab,
        configRaw: setConfigRaw,
        configText: setConfigText,
      };
      const setter = setterMap[key];
      if (setter) setter(value);
    },
    [setSelectedVrmIndex],
  );

  // ── Initialization ─────────────────────────────────────────────────

  useEffect(() => {
    applyTheme(currentTheme);
    const startupRunId = startupRetryNonce;
    let unbindStatus: (() => void) | null = null;
    let unbindAgentEvents: (() => void) | null = null;
    let unbindHeartbeatEvents: (() => void) | null = null;
    let unbindProactiveMessages: (() => void) | null = null;
    let cancelled = false;
    const describeBackendFailure = (
      err: unknown,
      timedOut: boolean,
    ): StartupErrorState => {
      const apiErr = asApiLikeError(err);
      if (apiErr?.kind === "http" && apiErr.status === 404) {
        return {
          reason: "backend-unreachable",
          phase: "starting-backend",
          message:
            "Backend API routes are unavailable on this origin (received 404).",
          detail: formatStartupErrorDetail(err),
          status: apiErr.status,
          path: apiErr.path,
        };
      }
      if (timedOut || apiErr?.kind === "timeout") {
        return {
          reason: "backend-timeout",
          phase: "starting-backend",
          message: `Backend did not become reachable within ${Math.round(
            BACKEND_STARTUP_TIMEOUT_MS / 1000,
          )}s.`,
          detail: formatStartupErrorDetail(err),
          status: apiErr?.status,
          path: apiErr?.path,
        };
      }
      return {
        reason: "backend-unreachable",
        phase: "starting-backend",
        message: "Failed to reach backend during startup.",
        detail: formatStartupErrorDetail(err),
        status: apiErr?.status,
        path: apiErr?.path,
      };
    };
    const describeAgentFailure = (
      err: unknown,
      timedOut: boolean,
      diagnostics?: AgentStartupDiagnostics,
    ): StartupErrorState => {
      const detail =
        diagnostics?.lastError ||
        formatStartupErrorDetail(err) ||
        "Agent runtime did not report a reason.";
      if (timedOut) {
        return {
          reason: "agent-timeout",
          phase: "initializing-agent",
          message: `Agent did not reach running or paused within ${Math.round(
            AGENT_READY_TIMEOUT_MS / 1000,
          )}s.`,
          detail,
        };
      }
      return {
        reason: "agent-error",
        phase: "initializing-agent",
        message: "Agent runtime reported a startup error.",
        detail,
      };
    };
    const STARTUP_WARN_PREFIX = "[milady][startup:init]";
    const logStartupWarning = (scope: string, err: unknown) => {
      console.warn(`${STARTUP_WARN_PREFIX} ${scope}`, err);
    };

    const initApp = async () => {
      if (import.meta.env.DEV && startupRunId > 0) {
        console.debug(`[milady] Retrying startup run #${startupRunId}`);
      }
      const BASE_DELAY_MS = 250;
      const MAX_DELAY_MS = 1000;
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      let onboardingNeedsOptions = false;
      let requiresAuth = false;
      let latestAuth: {
        required: boolean;
        pairingEnabled: boolean;
        expiresAt: number | null;
      } = {
        required: false,
        pairingEnabled: false,
        expiresAt: null,
      };
      setStartupError(null);
      setStartupPhase("starting-backend");
      setAuthRequired(false);
      setConnected(false);
      const backendDeadlineAt = Date.now() + BACKEND_STARTUP_TIMEOUT_MS;
      let lastBackendError: unknown = null;

      // Keep the splash screen up until the backend is reachable.
      let backendAttempts = 0;
      while (!cancelled) {
        if (Date.now() >= backendDeadlineAt) {
          setStartupError(describeBackendFailure(lastBackendError, true));
          setOnboardingLoading(false);
          return;
        }
        try {
          const auth = await client.getAuthStatus();
          latestAuth = auth;
          if (auth.required && !client.hasToken()) {
            setAuthRequired(true);
            setPairingEnabled(auth.pairingEnabled);
            setPairingExpiresAt(auth.expiresAt);
            requiresAuth = true;
            break;
          }
          const { complete } = await client.getOnboardingStatus();
          setOnboardingComplete(complete);
          onboardingNeedsOptions = !complete;
          break;
        } catch (err) {
          const apiErr = asApiLikeError(err);
          if (apiErr?.status === 401 && client.hasToken()) {
            client.setToken(null);
            setAuthRequired(true);
            setPairingEnabled(latestAuth.pairingEnabled);
            setPairingExpiresAt(latestAuth.expiresAt);
            requiresAuth = true;
            break;
          }
          if (apiErr?.status === 404) {
            setStartupError(describeBackendFailure(err, false));
            setOnboardingLoading(false);
            return;
          }
          lastBackendError = err;
          backendAttempts += 1;
          const delay = Math.min(
            BASE_DELAY_MS * 2 ** Math.min(backendAttempts, 2),
            MAX_DELAY_MS,
          );
          await sleep(delay);
        }
      }
      if (cancelled) {
        return;
      }

      if (requiresAuth) {
        setOnboardingLoading(false);
        return;
      }

      // On fresh installs, unblock to onboarding as soon as options are available.
      if (onboardingNeedsOptions) {
        const optionsDeadlineAt = Date.now() + BACKEND_STARTUP_TIMEOUT_MS;
        let optionsError: unknown = null;
        while (!cancelled) {
          if (Date.now() >= optionsDeadlineAt) {
            setStartupError(describeBackendFailure(optionsError, true));
            setOnboardingLoading(false);
            return;
          }
          try {
            const options = await client.getOnboardingOptions();
            setOnboardingOptions(options);
            setOnboardingLoading(false);
            return;
          } catch (err) {
            const apiErr = asApiLikeError(err);
            if (apiErr?.status === 401 && client.hasToken()) {
              client.setToken(null);
              setAuthRequired(true);
              setPairingEnabled(latestAuth.pairingEnabled);
              setPairingExpiresAt(latestAuth.expiresAt);
              setOnboardingLoading(false);
              return;
            }
            if (apiErr?.status === 404) {
              setStartupError(describeBackendFailure(err, false));
              setOnboardingLoading(false);
              return;
            }
            optionsError = err;
            await sleep(500);
          }
        }
        return;
      }

      setStartupPhase("initializing-agent");

      // Existing installs: keep loading until the runtime reports ready.
      let agentReady = false;
      const agentDeadlineAt = Date.now() + AGENT_READY_TIMEOUT_MS;
      let lastAgentError: unknown = null;
      let lastAgentDiagnostics: AgentStartupDiagnostics | undefined;
      while (!cancelled) {
        if (Date.now() >= agentDeadlineAt) {
          setStartupError(
            describeAgentFailure(lastAgentError, true, lastAgentDiagnostics),
          );
          setOnboardingLoading(false);
          return;
        }
        try {
          let status = await client.getStatus();
          setAgentStatus(status);
          setConnected(true);
          lastAgentDiagnostics = status.startup;

          // Hydrate deferred restart state
          if (status.pendingRestart) {
            setPendingRestart(true);
            setPendingRestartReasons(status.pendingRestartReasons ?? []);
          }

          if (status.state === "not_started" || status.state === "stopped") {
            try {
              status = await client.startAgent();
              setAgentStatus(status);
              lastAgentDiagnostics = status.startup;
            } catch (err) {
              lastAgentError = err;
            }
          }

          if (status.state === "running" || status.state === "paused") {
            agentReady = true;
            break;
          }

          if (status.state === "error") {
            setStartupError(
              describeAgentFailure(lastAgentError, false, status.startup),
            );
            setOnboardingLoading(false);
            return;
          }
        } catch (err) {
          const apiErr = asApiLikeError(err);
          if (apiErr?.status === 401 && client.hasToken()) {
            client.setToken(null);
            setAuthRequired(true);
            setPairingEnabled(latestAuth.pairingEnabled);
            setPairingExpiresAt(latestAuth.expiresAt);
            setOnboardingLoading(false);
            return;
          }
          lastAgentError = err;
          setConnected(false);
        }
        await sleep(500);
      }
      if (cancelled) return;

      if (!agentReady) {
        setStartupError(
          describeAgentFailure(lastAgentError, true, lastAgentDiagnostics),
        );
        setOnboardingLoading(false);
        return;
      }

      setStartupError(null);
      setOnboardingLoading(false);

      // Load conversations — if none exist, create one and request a greeting
      let greetConvId: string | null = null;
      try {
        const { conversations: c } = await client.listConversations();
        setConversations(c);
        if (c.length > 0) {
          const latest = c[0];
          setActiveConversationId(latest.id);
          activeConversationIdRef.current = latest.id;
          client.sendWsMessage({
            type: "active-conversation",
            conversationId: latest.id,
          });
          try {
            const { messages } = await client.getConversationMessages(
              latest.id,
            );
            setConversationMessages(messages);
            // If the latest conversation has no messages, queue a greeting
            if (messages.length === 0) {
              greetConvId = latest.id;
            }
          } catch (err) {
            logStartupWarning(
              "failed to load latest conversation messages",
              err,
            );
          }
        } else {
          // First launch — create a conversation and greet
          try {
            const { conversation } = await client.createConversation();
            setConversations([conversation]);
            setActiveConversationId(conversation.id);
            activeConversationIdRef.current = conversation.id;
            client.sendWsMessage({
              type: "active-conversation",
              conversationId: conversation.id,
            });
            setConversationMessages([]);
            greetConvId = conversation.id;
          } catch (err) {
            logStartupWarning("failed to create initial conversation", err);
          }
        }
      } catch (err) {
        logStartupWarning("failed to list conversations", err);
      }

      // If the agent is already running and we have a conversation needing a
      // greeting, fire it now. Otherwise the agent-state-transition effect
      // below will trigger it once the agent starts.
      if (greetConvId) {
        try {
          const s = await client.getStatus();
          if (s.state === "running" && !greetingFiredRef.current) {
            greetingFiredRef.current = true;
            setChatSending(true);
            try {
              const data = await client.requestGreeting(greetConvId);
              if (data.text) {
                setConversationMessages((prev: ConversationMessage[]) => [
                  ...prev,
                  {
                    id: `greeting-${Date.now()}`,
                    role: "assistant",
                    text: data.text,
                    timestamp: Date.now(),
                  },
                ]);
              }
            } catch (err) {
              logStartupWarning("failed to request greeting", err);
            }
            setChatSending(false);
          }
        } catch (err) {
          logStartupWarning(
            "failed to confirm runtime state for greeting",
            err,
          );
        }
      }

      void loadWorkbench();

      // Connect WebSocket
      client.connectWs();
      unbindStatus = client.onWsEvent(
        "status",
        (data: Record<string, unknown>) => {
          const nextStatus = parseAgentStatusEvent(data);
          if (nextStatus) {
            setAgentStatus(nextStatus);
            // Auto-refresh plugins when agent reports a restart
            if (data.restarted) {
              setPendingRestart(false);
              setPendingRestartReasons([]);
              void loadPlugins();
            }
          }
          // Sync pending restart state from periodic broadcasts
          if (typeof data.pendingRestart === "boolean") {
            setPendingRestart(data.pendingRestart);
          }
          if (Array.isArray(data.pendingRestartReasons)) {
            setPendingRestartReasons(
              data.pendingRestartReasons.filter(
                (el): el is string => typeof el === "string",
              ),
            );
          }
        },
      );
      client.onWsEvent("restart-required", (data: Record<string, unknown>) => {
        if (Array.isArray(data.reasons)) {
          setPendingRestartReasons(
            data.reasons.filter((el): el is string => typeof el === "string"),
          );
          setPendingRestart(true);
          setRestartBannerDismissed(false);
        }
      });
      unbindAgentEvents = client.onWsEvent(
        "agent_event",
        (data: Record<string, unknown>) => {
          const event = parseStreamEventEnvelopeEvent(data);
          if (event) {
            appendAutonomousEvent(event);
          }
        },
      );
      unbindHeartbeatEvents = client.onWsEvent(
        "heartbeat_event",
        (data: Record<string, unknown>) => {
          const event = parseStreamEventEnvelopeEvent(data);
          if (event) {
            appendAutonomousEvent(event);
          }
        },
      );

      try {
        const replay = await client.getAgentEvents({ limit: 300 });
        if (replay.events.length > 0) {
          setAutonomousEvents(replay.events);
          setAutonomousLatestEventId(replay.latestEventId);
        }
      } catch (err) {
        console.warn("[milady] Failed to fetch autonomous event replay", err);
      }

      // Handle proactive messages from autonomy
      unbindProactiveMessages = client.onWsEvent(
        "proactive-message",
        (data: Record<string, unknown>) => {
          const parsed = parseProactiveMessageEvent(data);
          if (!parsed) return;
          const { conversationId: convId, message: msg } = parsed;

          if (convId === activeConversationIdRef.current) {
            // Active conversation — append in real-time.
            // If this is an echo of the streamed temporary assistant message,
            // reconcile IDs instead of rendering duplicate content.
            setConversationMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;

              if (msg.role === "assistant" && msg.text.trim().length > 0) {
                const tempIndex = prev.findIndex(
                  (m) =>
                    m.role === "assistant" &&
                    m.id.startsWith("temp-resp-") &&
                    m.text.trim().length > 0 &&
                    m.text.trim() === msg.text.trim(),
                );
                if (tempIndex !== -1) {
                  const next = [...prev];
                  next[tempIndex] = {
                    ...next[tempIndex],
                    id: msg.id,
                    timestamp: msg.timestamp,
                    source: msg.source ?? next[tempIndex].source,
                  };
                  return next;
                }
              }

              return [...prev, msg];
            });
          } else {
            // Non-active — mark unread
            setUnreadConversations((prev) => new Set([...prev, convId]));
          }

          // Bump conversation to top of list
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === convId ? { ...c, updatedAt: new Date().toISOString() } : c,
            );
            return updated.sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            );
          });
        },
      );

      // Handle conversation updates (e.g. title changes)
      client.onWsEvent(
        "conversation-updated",
        (data: Record<string, unknown>) => {
          const conv = data.conversation as Conversation;
          if (conv?.id) {
            setConversations((prev) => {
              const updated = prev.map((c) => (c.id === conv.id ? conv : c));
              return updated.sort(
                (a, b) =>
                  new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime(),
              );
            });
          }
        },
      );

      // Load wallet addresses for header
      try {
        setWalletAddresses(await client.getWalletAddresses());
      } catch (err) {
        logStartupWarning("failed to load wallet addresses", err);
      }

      // Restore avatar selection from config (server-persisted under "ui")
      let resolvedIndex = loadAvatarIndex();
      try {
        const cfg = await client.getConfig();
        const ui = cfg.ui as Record<string, unknown> | undefined;
        if (ui?.avatarIndex != null) {
          resolvedIndex = normalizeAvatarIndex(Number(ui.avatarIndex));
          setSelectedVrmIndex(resolvedIndex);
        }
      } catch (err) {
        logStartupWarning("failed to load config for avatar selection", err);
      }
      // If custom avatar selected, verify the file still exists on the server
      if (resolvedIndex === 0) {
        const hasVrm = await client.hasCustomVrm();
        if (hasVrm) {
          setCustomVrmUrl(`/api/avatar/vrm?t=${Date.now()}`);
        } else {
          setSelectedVrmIndex(1);
        }
      }

      // Cloud polling
      pollCloudCredits();
      cloudPollInterval.current = window.setInterval(
        () => pollCloudCredits(),
        60_000,
      );
      void loadFive55MasteryRuns();

      // Load tab from URL — use hash in file:// mode (Electron packaged builds)
      const navPath =
        window.location.protocol === "file:"
          ? window.location.hash.replace(/^#/, "") || "/"
          : window.location.pathname;
      const urlTab = tabFromPath(navPath);
      if (urlTab) {
        if (currentTheme === "milady-os") {
          applyMiladyTabIntent(urlTab);
          replaceMiladyLocationWithRoot();
        } else {
          setTabRaw(urlTab);
          lastLegacyTabRef.current = urlTab;
        }
        if (urlTab === "plugins" || urlTab === "connectors") {
          void loadPlugins();
          if (urlTab === "plugins") {
            void loadSkills();
          }
        }
        if (urlTab === "settings") {
          void checkExtensionStatus();
          void loadWalletConfig();
          void loadCharacter();
          void loadUpdateStatus();
          void loadPlugins();
        }
        if (urlTab === "character") {
          void loadCharacter();
        }
        if (urlTab === "wallets") {
          void loadInventory();
        }
      }
    };

    void initApp();

    // Navigation listener — use hashchange in file:// mode (Electron packaged builds)
    const isFileProtocol = window.location.protocol === "file:";
    const handleNavChange = () => {
      const navPath = isFileProtocol
        ? window.location.hash.replace(/^#/, "") || "/"
        : window.location.pathname;
      const t = tabFromPath(navPath);
      if (!t) return;
      if (currentTheme === "milady-os") {
        applyMiladyTabIntent(t);
        replaceMiladyLocationWithRoot();
        return;
      }
      setTabRaw(t);
      lastLegacyTabRef.current = t;
    };
    const navEvent = isFileProtocol ? "hashchange" : "popstate";
    window.addEventListener(navEvent, handleNavChange);

    return () => {
      cancelled = true;
      window.removeEventListener(navEvent, handleNavChange);
      if (cloudPollInterval.current) clearInterval(cloudPollInterval.current);
      if (cloudLoginPollTimer.current)
        clearInterval(cloudLoginPollTimer.current);
      unbindStatus?.();
      unbindAgentEvents?.();
      unbindHeartbeatEvents?.();
      unbindProactiveMessages?.();
      client.disconnectWs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appendAutonomousEvent,
    applyMiladyTabIntent,
    checkExtensionStatus,
    currentTheme,
    loadCharacter,
    loadFive55MasteryRuns,
    loadInventory,
    loadPlugins,
    loadSkills,
    loadUpdateStatus,
    loadWalletConfig,
    loadWorkbench, // Cloud polling
    pollCloudCredits,
    setSelectedVrmIndex,
    startupRetryNonce,
  ]);

  // When agent transitions to "running", send a greeting if conversation is empty
  useEffect(() => {
    const current = agentStatus?.state ?? null;
    const prev = prevAgentStateRef.current;
    prevAgentStateRef.current = current;

    if (current === "running" && prev !== "running") {
      void loadWorkbench();

      // Agent just started — greet if conversation is empty.
      // The greetingFiredRef guard prevents double-greeting when both the
      // init mount effect and this state-transition effect race to fire.
      if (
        activeConversationId &&
        conversationMessages.length === 0 &&
        !chatSending &&
        !greetingFiredRef.current
      ) {
        greetingFiredRef.current = true;
        void fetchGreeting(activeConversationId);
      }
    }
  }, [
    agentStatus?.state,
    loadWorkbench,
    activeConversationId,
    conversationMessages.length,
    chatSending,
    fetchGreeting,
  ]);

  // ── Context value ──────────────────────────────────────────────────

  const value: AppContextValue = {
    // State
    tab, currentTheme, dockSurface, streamViewMode, leftRailState, rightRailState, activeBubble, hudSurface, hudControlSection, hudAssetSection, connected, agentStatus, onboardingComplete, onboardingLoading,
    startupPhase, startupError, authRequired, actionNotice, toasts, lifecycleBusy, lifecycleAction,
    pendingRestart, pendingRestartReasons, restartBannerDismissed,
    pairingEnabled, pairingExpiresAt, pairingCodeInput, pairingError, pairingBusy,
    chatInput, chatSending, chatFirstTokenReceived, chatAvatarVisible, chatAgentVoiceMuted, chatAvatarSpeaking, conversations, activeConversationId, conversationMessages, chatPendingImages,
    autonomousEvents, autonomousLatestEventId, unreadConversations, quickLayerStatuses, autonomousRunOpen, autoRunMode, autoRunTopic, autoRunDurationMin, autoRunAvatarRuntime, autoRunPreview, autoRunPreviewBusy, autoRunLaunching,
    triggers, triggersLoading, triggersSaving, triggerRunsById, triggerHealth, triggerError,
    plugins, pluginFilter, pluginStatusFilter, pluginSearch, pluginSettingsOpen,
    pluginAdvancedOpen, pluginSaving, pluginSaveSuccess,
    skills, skillsSubTab, skillCreateFormOpen, skillCreateName, skillCreateDescription,
    skillCreating, skillReviewReport, skillReviewId, skillReviewLoading, skillToggleAction,
    skillsMarketplaceQuery, skillsMarketplaceResults, skillsMarketplaceError,
    skillsMarketplaceLoading, skillsMarketplaceAction, skillsMarketplaceManualGithubUrl,
    logs, logSources, logTags, logTagFilter, logLevelFilter, logSourceFilter,
    walletAddresses, walletConfig, walletBalances, walletNfts, walletLoading,
    walletNftsLoading, inventoryView, walletExportData, walletExportVisible,
    walletApiKeySaving, inventorySort, walletError,
    registryStatus, registryLoading, registryRegistering, registryError,
    dropStatus, dropLoading, mintInProgress, mintResult, mintError, mintShiny,
    whitelistStatus, whitelistLoading, twitterVerifyMessage, twitterVerifyUrl, twitterVerifying,
    characterData, characterLoading, characterSaving, characterSaveSuccess,
    characterSaveError, characterDraft, selectedVrmIndex, customVrmUrl,
    cloudEnabled, cloudConnected, cloudCredits, cloudCreditsLow, cloudCreditsCritical,
    cloudTopUpUrl, cloudUserId, cloudLoginBusy, cloudLoginError, cloudDisconnecting,
    updateStatus, updateLoading, updateChannelSaving,
    extensionStatus, extensionChecking,
    storePlugins, storeSearch, storeFilter, storeLoading, storeInstalling,
    storeUninstalling, storeError, storeDetailPlugin, storeSubTab,
    catalogSkills, catalogTotal, catalogPage, catalogTotalPages, catalogSort,
    catalogSearch, catalogLoading, catalogError, catalogDetailSkill,
    catalogInstalling, catalogUninstalling,
    workbenchLoading, workbench, workbenchTasksAvailable, workbenchTriggersAvailable, workbenchTodosAvailable,
    exportBusy, exportPassword, exportIncludeLogs, exportError, exportSuccess,
    importBusy, importPassword, importFile, importError, importSuccess,
    onboardingStep, onboardingOptions, onboardingName, onboardingStyle, onboardingTheme,
    onboardingRunMode, onboardingCloudProvider, onboardingSmallModel, onboardingLargeModel,
    onboardingProvider, onboardingApiKey, onboardingOpenRouterModel, onboardingPrimaryModel,
    onboardingTelegramToken, onboardingDiscordToken, onboardingWhatsAppSessionPath,
    onboardingTwilioAccountSid, onboardingTwilioAuthToken, onboardingTwilioPhoneNumber,
    onboardingBlooioApiKey, onboardingBlooioPhoneNumber, onboardingGithubToken, onboardingSubscriptionTab,
    onboardingSelectedChains, onboardingRpcSelections, onboardingRpcKeys,
    onboardingAvatar, onboardingRestarting,
    commandPaletteOpen, commandQuery, commandActiveIndex, emotePickerOpen,
    availableEmotes, activeAvatarEmoteId, avatarMotionMode,
    mcpConfiguredServers, mcpServerStatuses, mcpMarketplaceQuery, mcpMarketplaceResults,
    mcpMarketplaceLoading, mcpAction, mcpAddingServer, mcpAddingResult,
    mcpEnvInputs, mcpHeaderInputs,
    droppedFiles, shareIngestNotice,
    activeGameApp, activeGameDisplayName, activeGameViewerUrl, activeGameSandbox,
    activeGamePostMessageAuth,
    five55MasteryRuns,
    five55MasteryRunsLoading,
    liveBroadcastState,
    goLiveInlineNotice,
    actionLogInlineNotice,
    goLiveModalOpen,
    liveLayoutMode,
    liveSceneId,
    liveSecondarySources,
    liveHeroSource,
    gameOverlayEnabled,
    appsSubTab,
    agentSubTab,
    pluginsSubTab,
    databaseSubTab,
    configRaw,
    configText,
    activeGamePostMessagePayload,

    // Actions
    setTab,
    setTheme,
    openDockSurface,
    closeDockSurface,
    setStreamViewMode,
    openHudControlStack,
    openHudAssetVault,
    closeHudSurface,
    setRailDisplay,
    collapseRails,
    handleStart,
    handleStop,
    handlePauseResume,
    handleRestart,
    handleReset,
    retryStartup,
    dismissRestartBanner,
    triggerRestart,
    handleChatSend,
    handleChatStop,
    handleChatClear,
    handleNewConversation,
    setChatPendingImages,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    runQuickLayer,
    openGoLiveModal,
    closeGoLiveModal,
    dismissGoLiveInlineNotice,
    dismissActionLogInlineNotice,
    launchGoLive,
    openAutonomousRun,
    closeAutonomousRun,
    runAutonomousEstimate,
    runAutonomousLaunch,
    loadTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    runTriggerNow,
    loadTriggerRuns,
    loadTriggerHealth,
    handlePairingSubmit,
    loadPlugins,
    handlePluginToggle,
    handlePluginConfigSave,
    loadSkills,
    refreshSkills,
    handleSkillToggle,
    handleCreateSkill,
    handleOpenSkill,
    handleDeleteSkill,
    handleReviewSkill,
    handleAcknowledgeSkill,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    uninstallMarketplaceSkill,
    installSkillFromGithubUrl,
    loadLogs,
    loadFive55MasteryRuns,
    startFive55MasteryRun,
    loadInventory,
    loadBalances,
    loadNfts,
    handleWalletApiKeySave,
    handleExportKeys,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
    loadWhitelistStatus,
    loadCharacter,
    handleSaveCharacter,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleCharacterMessageExamplesInput,
    handleOnboardingNext,
    handleOnboardingBack,
    handleCloudLogin,
    handleCloudDisconnect,
    loadUpdateStatus,
    handleChannelChange,
    checkExtensionStatus,
    openEmotePicker,
    closeEmotePicker,
    playAvatarEmote,
    stopAvatarEmote,
    loadWorkbench,
    handleAgentExport,
    handleAgentImport,
    setActionNotice,
    dismissToast,
    setState,
    copyToClipboard,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
