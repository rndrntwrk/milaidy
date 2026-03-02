import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import {
  assertFive55Capability,
  createFive55CapabilityPolicy,
} from "../../runtime/five55-capability-policy.js";
import { assertTrustedAdminForAction } from "../../runtime/trusted-admin.js";
import {
  exceptionAction,
  executeApiAction,
  readParam,
} from "../five55-shared/action-kit.js";
import {
  describeAgentAuthSource,
  invalidateExchangedAgentTokenCache,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";
import {
  AutonomySupervisor,
  GamePolicyRegistry,
  LearningClient,
  OutcomeAnalyzer,
  PolicyEngine,
  type AgentRequest,
  type LaunchPolicyContext,
} from "./intelligence/index.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const API_ENV = "FIVE55_GAMES_API_URL";
const DIALECT_ENV = "FIVE55_GAMES_API_DIALECT";
const LOCAL_API_URL_ENV = "MILAIDY_API_URL";
const LOCAL_PORT_ENV = "MILAIDY_PORT";
const LOCAL_TOKEN_ENV = "MILAIDY_API_TOKEN";
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";
const CF_CONNECT_TIMEOUT_MS_ENV = "FIVE55_GAMES_CF_CONNECT_TIMEOUT_MS";
const CF_CONNECT_POLL_MS_ENV = "FIVE55_GAMES_CF_CONNECT_POLL_MS";
const CF_RECOVERY_ATTEMPTS_ENV = "FIVE55_GAMES_CF_RECOVERY_ATTEMPTS";
const ALICE_INTELLIGENCE_ENABLED_ENV = "ALICE_INTELLIGENCE_ENABLED";
const ALICE_LEARNING_WRITEBACK_ENABLED_ENV =
  "ALICE_LEARNING_WRITEBACK_ENABLED";
const SPRINT_SLOT_SECONDS_ENV = "FIVE55_GAMES_SPRINT_SLOT_SECONDS";
const SPRINT_AD_OFFSET_SECONDS_ENV = "FIVE55_GAMES_SPRINT_AD_OFFSET_SECONDS";
const SPRINT_DIAGNOSTIC_SLOTS = 2;
const SPRINT_EXPECTED_GAME_COUNT = 16;

const DEFAULT_CF_CONNECT_TIMEOUT_MS = 45_000;
const DEFAULT_CF_CONNECT_POLL_MS = 5_000;
const DEFAULT_CF_RECOVERY_ATTEMPTS = 1;
const DEFAULT_SPRINT_SLOT_SECONDS = 5 * 60;
const DEFAULT_SPRINT_AD_OFFSET_SECONDS = 4 * 60 + 30;
const DEFAULT_SPRINT_AD_RETRY_OFFSET_SECONDS = 4 * 60 + 55;
const DEFAULT_SPRINT_SLOT_CHECKPOINTS_SECONDS = [15, 60, 150];
const DEFAULT_SPRINT_LEARNING_BACKFILL_WAIT_MS = 12_000;
const DEFAULT_SPRINT_LEARNING_BACKFILL_POLL_MS = 2_000;

const SPRINT_GAME_ORDER = [
  "knighthood",
  "sector-13",
  "ninja",
  "clawstrike",
  "555drive",
  "chesspursuit",
  "wolf-and-sheep",
  "leftandright",
  "playback",
  "fighter-planes",
  "floor13",
  "godai-is-back",
  "peanball",
  "eat-my-dust",
  "where-were-going-we-do-need-roads",
  "vedas-run",
] as const;

type GamesDialect = "five55-web" | "milaidy-proxy" | "agent-v1";
type GameSessionMode = "standard" | "ranked" | "spectate" | "solo" | "agent";
type AgentBearerSource = string | (() => Promise<string>);

let cachedAgentSessionId: string | undefined;

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = trimEnv(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readNonNegativeIntEnv(key: string, fallback: number): number {
  const raw = trimEnv(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const raw = trimEnv(key);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeMode(
  mode: string | undefined,
  dialect: GamesDialect,
): GameSessionMode {
  const normalized = mode?.trim().toLowerCase();
  if (
    normalized === "standard" ||
    normalized === "ranked" ||
    normalized === "spectate" ||
    normalized === "solo" ||
    normalized === "agent"
  ) {
    return normalized;
  }
  if (
    normalized === "autonomous" ||
    normalized === "auto" ||
    normalized === "bot" ||
    normalized === "play"
  ) {
    return "agent";
  }
  return dialect === "agent-v1" ? "agent" : "spectate";
}

function resolveGamesDialect(): GamesDialect {
  const explicit = trimEnv(DIALECT_ENV)?.toLowerCase();
  if (explicit === "five55-web" || explicit === "web") return "five55-web";
  if (explicit === "agent-v1" || explicit === "agent") return "agent-v1";
  if (explicit === "milaidy-proxy" || explicit === "proxy") {
    return "milaidy-proxy";
  }
  if (trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured()) {
    return "agent-v1";
  }
  return trimEnv(API_ENV) ? "five55-web" : "milaidy-proxy";
}

function resolveGamesBase(dialect: GamesDialect): string {
  if (dialect === "five55-web") {
    const base = trimEnv(API_ENV);
    if (!base) throw new Error(`${API_ENV} is not configured`);
    return base;
  }

  if (dialect === "agent-v1") {
    const base = trimEnv(STREAM555_BASE_ENV);
    if (!base) throw new Error(`${STREAM555_BASE_ENV} is not configured`);
    return base;
  }

  const localBase = trimEnv(LOCAL_API_URL_ENV);
  if (localBase) return localBase;
  const localPort = trimEnv(LOCAL_PORT_ENV) ?? "2138";
  return `http://127.0.0.1:${localPort}`;
}

function resolveCatalogEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect === "agent-v1") {
    if (!sessionId) throw new Error("sessionId is required for agent-v1 games catalog");
    return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/catalog`;
  }
  return dialect === "five55-web"
    ? "/api/games/catalog"
    : "/api/five55/games/catalog";
}

function resolvePlayEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect === "agent-v1") {
    if (!sessionId) throw new Error("sessionId is required for agent-v1 game play");
    return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/play`;
  }
  return dialect === "five55-web" ? "/api/games/play" : "/api/five55/games/play";
}

function resolveSwitchEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect !== "agent-v1") {
    throw new Error("games switch endpoint requires agent-v1 dialect");
  }
  if (!sessionId) throw new Error("sessionId is required for agent-v1 game switch");
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/switch`;
}

function resolveStopEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect !== "agent-v1") {
    throw new Error("games stop endpoint requires agent-v1 dialect");
  }
  if (!sessionId) throw new Error("sessionId is required for agent-v1 game stop");
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/stop`;
}

function resolveAdsListEndpoint(
  dialect: GamesDialect,
  sessionId?: string,
): string {
  if (dialect !== "agent-v1") {
    throw new Error("ads list endpoint requires agent-v1 dialect");
  }
  if (!sessionId) throw new Error("sessionId is required for agent-v1 ads list");
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads`;
}

function resolveAdTriggerEndpoint(
  dialect: GamesDialect,
  sessionId: string,
  adId: string,
): string {
  if (dialect !== "agent-v1") {
    throw new Error("ads trigger endpoint requires agent-v1 dialect");
  }
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/${encodeURIComponent(adId)}/trigger`;
}

function resolveAdActiveEndpoint(
  dialect: GamesDialect,
  sessionId: string,
): string {
  if (dialect !== "agent-v1") {
    throw new Error("ads active endpoint requires agent-v1 dialect");
  }
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/active`;
}

async function fetchJson(
  method: "GET" | "POST" | "PUT",
  base: string,
  endpoint: string,
  token: AgentBearerSource,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data?: Record<string, unknown>; rawBody: string }> {
  const target = new URL(endpoint, base);
  const resolveToken = async (): Promise<string> =>
    typeof token === "function" ? await token() : token;

  const executeWithToken = async (
    bearerToken: string,
  ): Promise<{
    ok: boolean;
    status: number;
    data?: Record<string, unknown>;
    rawBody: string;
  }> => {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const response = await fetch(target, init);
    const rawBody = await response.text();
    let data: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // non-JSON response
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      rawBody,
    };
  };

  let bearerToken = await resolveToken();
  let result = await executeWithToken(bearerToken);
  if (result.status === 401 && typeof token === "function") {
    invalidateExchangedAgentTokenCache();
    bearerToken = await resolveToken();
    result = await executeWithToken(bearerToken);
  }
  return result;
}

function createAgentRequest(base: string, token: AgentBearerSource): AgentRequest {
  return (method, endpoint, body) => fetchJson(method, base, endpoint, token, body);
}

function getErrorDetail(payload: {
  data?: Record<string, unknown>;
  rawBody: string;
}): string {
  const fromData = payload.data?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  return payload.rawBody || "upstream request failed";
}

function actionSuccessResult(
  module: string,
  action: string,
  status: number,
  message: string,
  data: Record<string, unknown>,
): { success: true; text: string } {
  return {
    success: true,
    text: JSON.stringify({
      ok: true,
      code: "OK",
      module,
      action,
      message,
      status,
      retryable: false,
      data,
    }),
  };
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function readBooleanOption(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readIntOption(value: string | undefined, fallback: number, min = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function waitUntil(startMs: number, targetOffsetSeconds: number): Promise<void> {
  const targetMs = startMs + targetOffsetSeconds * 1000;
  const remaining = targetMs - Date.now();
  if (remaining <= 0) return Promise.resolve();
  return sleep(remaining);
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCatalogGameId(data: Record<string, unknown> | undefined): string | undefined {
  if (!data) return undefined;
  const games = Array.isArray(data.games) ? data.games : [];
  for (const game of games) {
    const gameRecord = asRecord(game);
    const gameId = typeof gameRecord?.id === "string" ? gameRecord.id.trim() : "";
    if (gameId.length > 0) return gameId;
  }
  return undefined;
}

async function resolveAgentGameId(
  base: string,
  token: string,
  sessionId: string,
  requestedGameId?: string,
): Promise<string | undefined> {
  const preferred = requestedGameId?.trim();
  if (preferred) return preferred;

  const catalog = await fetchJson(
    "POST",
    base,
    resolveCatalogEndpoint("agent-v1", sessionId),
    token,
    { includeBeta: true },
  );
  if (!catalog.ok) return undefined;
  return resolveCatalogGameId(catalog.data);
}

async function ensureAgentSessionId(
  base: string,
  token: string,
  requestedSessionId?: string,
): Promise<string> {
  const preferredSessionId =
    requestedSessionId?.trim() ||
    cachedAgentSessionId ||
    trimEnv(STREAM_SESSION_ENV) ||
    trimEnv(STREAM555_SESSION_ENV);

  const body =
    preferredSessionId && preferredSessionId.length > 0
      ? { sessionId: preferredSessionId }
      : {};
  const response = await fetchJson(
    "POST",
    base,
    "/api/agent/v1/sessions",
    token,
    body,
  );

  if (!response.ok) {
    throw new Error(
      `session bootstrap failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }

  const sessionId = response.data?.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new Error("session bootstrap did not return sessionId");
  }
  cachedAgentSessionId = sessionId;
  return sessionId;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type AgentSessionSnapshot = {
  active: boolean;
  cfSessionId?: string;
};

type AgentStreamStatusSnapshot = {
  active: boolean;
  phase?: string;
  cfSessionId?: string;
  cloudflareConnected: boolean;
  cloudflareState?: string;
};

type CloudflareConnectCheck = {
  connected: boolean;
  lastSnapshot?: AgentStreamStatusSnapshot;
};

type SprintAdSummary = {
  adId: string;
  adName: string;
};

type SprintSlotSnapshot = {
  stage: "checkpoint" | "final";
  at: string;
  status: string;
  policyVersion: number | null;
  score: number | null;
  survivalMs: number | null;
  causeOfDeath: string | null;
};

type SprintIssue = {
  category:
    | "lifecycle"
    | "control"
    | "risk"
    | "resources"
    | "objective"
    | "learning"
    | "ads"
    | "integrity";
  severity: "low" | "medium" | "high";
  symptom: string;
  probableCause: string;
  evidence: string;
  fixHint: string;
};

type SprintSlotResult = {
  sprintId: string;
  slotId: number;
  gameId: string;
  diagnosticRetest: boolean;
  startedAt: string;
  endedAt: string;
  runId: string;
  adId: string;
  adTriggered: boolean;
  adRendered: boolean;
  score: number | null;
  episodeId: string | null;
  policyVersionBefore: number | null;
  policyVersionAfter: number | null;
  compositeScore: number;
  snapshots: SprintSlotSnapshot[];
  issues: SprintIssue[];
};

async function fetchAgentSessionSnapshot(
  base: string,
  token: string,
  sessionId: string,
): Promise<AgentSessionSnapshot> {
  const response = await fetchJson(
    "GET",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`,
    token,
  );
  if (!response.ok) {
    throw new Error(
      `session status preflight failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
  return {
    active: Boolean(response.data?.active),
    cfSessionId: readNonEmptyString(response.data?.cfSessionId),
  };
}

async function stopAgentStream(
  base: string,
  token: string,
  sessionId: string,
  options?: { allowMissing?: boolean },
): Promise<void> {
  const response = await fetchJson(
    "POST",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/stop`,
    token,
    {},
  );
  if (
    !response.ok &&
    !(
      options?.allowMissing &&
      (response.status === 404 || response.status === 409)
    )
  ) {
    throw new Error(
      `stream/stop failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
}

async function startAgentScreenStream(
  base: string,
  token: string,
  sessionId: string,
): Promise<string | undefined> {
  const response = await fetchJson(
    "POST",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/start`,
    token,
    {
      input: {
        type: "screen",
      },
    },
  );

  const cfSessionId = readNonEmptyString(response.data?.cfSessionId);
  if (!response.ok && !(response.status === 409 && cfSessionId)) {
    throw new Error(
      `stream/start provisioning failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }

  return cfSessionId;
}

async function ensureAgentCloudflareOutput(
  base: string,
  token: string,
  sessionId: string,
): Promise<void> {
  const snapshot = await fetchAgentSessionSnapshot(base, token, sessionId);
  if (snapshot.cfSessionId) return;

  if (snapshot.active) {
    await stopAgentStream(base, token, sessionId);
  }

  const startedCfSessionId = await startAgentScreenStream(base, token, sessionId);
  if (startedCfSessionId) return;

  const verifiedSnapshot = await fetchAgentSessionSnapshot(base, token, sessionId);
  if (verifiedSnapshot.cfSessionId) return;

  throw new Error(
    "Cloudflare output provisioning did not produce cfSessionId for session",
  );
}

async function prepareLaunchPolicyContext(
  base: string,
  token: AgentBearerSource,
  sessionId: string,
  gameId: string,
): Promise<LaunchPolicyContext | null> {
  const intelligenceEnabled = readBooleanEnv(ALICE_INTELLIGENCE_ENABLED_ENV, true);
  if (!intelligenceEnabled) return null;

  const learningWritebackEnabled = readBooleanEnv(
    ALICE_LEARNING_WRITEBACK_ENABLED_ENV,
    true,
  );

  const request = createAgentRequest(base, token);
  const policyRegistry = new GamePolicyRegistry();
  const supervisor = new AutonomySupervisor({
    learningClient: new LearningClient(request),
    policyEngine: new PolicyEngine(policyRegistry),
    outcomeAnalyzer: new OutcomeAnalyzer(policyRegistry),
    learningWritebackEnabled,
  });

  return supervisor.prepareLaunchContext(sessionId, gameId);
}

async function fetchAgentStreamStatusSnapshot(
  base: string,
  token: string,
  sessionId: string,
): Promise<AgentStreamStatusSnapshot> {
  const response = await fetchJson(
    "GET",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/status`,
    token,
  );
  if (!response.ok) {
    throw new Error(
      `stream status check failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }

  const cloudflare = asRecord(response.data?.cloudflare);
  return {
    active: Boolean(response.data?.active),
    phase: readNonEmptyString(response.data?.phase),
    cfSessionId: readNonEmptyString(response.data?.cfSessionId),
    cloudflareConnected: Boolean(cloudflare?.isConnected),
    cloudflareState: readNonEmptyString(cloudflare?.state),
  };
}

async function waitForAgentCloudflareConnection(
  base: string,
  token: string,
  sessionId: string,
  timeoutMs: number,
  pollMs: number,
): Promise<CloudflareConnectCheck> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: AgentStreamStatusSnapshot | undefined;

  while (Date.now() <= deadline) {
    lastSnapshot = await fetchAgentStreamStatusSnapshot(base, token, sessionId);
    if (lastSnapshot.cloudflareConnected) {
      return { connected: true, lastSnapshot };
    }

    if (Date.now() >= deadline) break;
    await sleep(pollMs);
  }

  return {
    connected: false,
    lastSnapshot,
  };
}

function asSprintSlotSnapshot(
  stage: "checkpoint" | "final",
  snapshot: Awaited<ReturnType<LearningClient["fetchSessionLearning"]>>,
): SprintSlotSnapshot {
  const episode = snapshot.latestEpisode ?? null;
  return {
    stage,
    at: new Date().toISOString(),
    status:
      episode?.causeOfDeath && episode.causeOfDeath.length > 0
        ? "GAME_OVER"
        : "PLAYING",
    policyVersion: snapshot.profile.policyVersion ?? null,
    score: toFiniteNumber(episode?.score),
    survivalMs: toFiniteNumber(episode?.survivalMs),
    causeOfDeath: episode?.causeOfDeath ?? null,
  };
}

function parseIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isEpisodeFreshForSlot(
  episode: Awaited<ReturnType<LearningClient["fetchSessionLearning"]>>["latestEpisode"],
  slotStartedMs: number,
): boolean {
  if (!episode?.id) return false;
  const episodeCreatedMs = parseIsoMs(episode.createdAt);
  if (episodeCreatedMs == null) return true;
  return episodeCreatedMs >= slotStartedMs - 1_000;
}

async function fetchSlotFinalLearningSnapshot(
  learningClient: LearningClient,
  sessionId: string,
  gameId: string,
  slotStartedMs: number,
): Promise<Awaited<ReturnType<LearningClient["fetchSessionLearning"]>>> {
  let snapshot = await learningClient.fetchSessionLearning(sessionId, gameId);
  if (isEpisodeFreshForSlot(snapshot.latestEpisode, slotStartedMs)) {
    return snapshot;
  }

  const deadline = Date.now() + DEFAULT_SPRINT_LEARNING_BACKFILL_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(DEFAULT_SPRINT_LEARNING_BACKFILL_POLL_MS);
    snapshot = await learningClient.fetchSessionLearning(sessionId, gameId);
    if (isEpisodeFreshForSlot(snapshot.latestEpisode, slotStartedMs)) {
      break;
    }
  }

  return snapshot;
}

function computeCompositeScore(slot: SprintSlotResult): number {
  const survival = slot.score != null && slot.score > 0
    ? Math.min(100, slot.score / 10)
    : slot.snapshots.some((entry) => entry.status === "PLAYING")
      ? 60
      : 20;
  const avoidableFailure = slot.snapshots.some((entry) => {
    const cause = entry.causeOfDeath?.toLowerCase() ?? "";
    return cause.includes("spike") || cause.includes("gap");
  })
    ? 30
    : 90;
  const controlEfficiency = slot.snapshots.some((entry) => entry.status === "PLAYING")
    ? 75
    : 40;
  const policyResponsive = slot.policyVersionAfter != null
    && slot.policyVersionBefore != null
    && slot.policyVersionAfter > slot.policyVersionBefore
    ? 85
    : 55;

  const weighted =
    survival * 0.4
    + avoidableFailure * 0.25
    + controlEfficiency * 0.2
    + policyResponsive * 0.15;
  return Number(weighted.toFixed(2));
}

function buildSlotIssues(slot: SprintSlotResult): SprintIssue[] {
  const issues: SprintIssue[] = [];

  if (!slot.adTriggered || !slot.adRendered) {
    issues.push({
      category: "ads",
      severity: "high",
      symptom: "Ad trigger or render did not complete within slot window",
      probableCause: "Cooldown gating, missing ad inventory, or trigger API failure",
      evidence: `adTriggered=${slot.adTriggered}; adRendered=${slot.adRendered}`,
      fixHint: "Verify ad inventory, cooldown timing, and re-trigger near slot close",
    });
  }

  if (!slot.episodeId) {
    issues.push({
      category: "learning",
      severity: "high",
      symptom: "Episode summary was not persisted",
      probableCause: "Learning ingest auth missing or ingest endpoint failure",
      evidence: "latestEpisode.id not returned at final snapshot",
      fixHint: "Verify agent auth token passthrough and /episodes/complete route health",
    });
  }

  if (slot.policyVersionBefore != null
    && slot.policyVersionAfter != null
    && slot.policyVersionAfter < slot.policyVersionBefore) {
    issues.push({
      category: "learning",
      severity: "medium",
      symptom: "Policy version regressed after slot completion",
      probableCause: "Profile write race or stale policy overwrite",
      evidence: `before=${slot.policyVersionBefore}; after=${slot.policyVersionAfter}`,
      fixHint: "Audit policy write ordering and idempotency guards",
    });
  }

  const deadlySnapshot = slot.snapshots.find(
    (entry) =>
      entry.causeOfDeath?.toLowerCase().includes("spike")
      || entry.causeOfDeath?.toLowerCase().includes("gap"),
  );
  if (deadlySnapshot) {
    issues.push({
      category: "risk",
      severity: "high",
      symptom: "Avoidable hazard death pattern persists",
      probableCause: "Hazard prioritization and landing checks not conservative enough",
      evidence: `causeOfDeath=${deadlySnapshot.causeOfDeath}`,
      fixHint: "Increase spike/gap threat weighting and recenter aggressiveness",
    });
  }

  if (slot.score == null || slot.score <= 0) {
    issues.push({
      category: "objective",
      severity: "medium",
      symptom: "No meaningful score progression observed",
      probableCause: "Lifecycle stalls, rapid deaths, or inactive input loops",
      evidence: "final slot score was null/zero",
      fixHint: "Audit menu/pause transitions and first-action latency",
    });
  }

  return issues;
}

function selectDiagnosticRetests(
  slots: SprintSlotResult[],
  count: number,
): Array<{ gameId: string; sourceSlotId: number }> {
  const eligible = slots
    .filter((slot) => !slot.diagnosticRetest)
    .slice()
    .sort((a, b) => a.compositeScore - b.compositeScore);

  const selections: Array<{ gameId: string; sourceSlotId: number }> = [];
  for (const candidate of eligible) {
    if (selections.some((entry) => entry.gameId === candidate.gameId)) continue;
    selections.push({
      gameId: candidate.gameId,
      sourceSlotId: candidate.slotId,
    });
    if (selections.length >= count) break;
  }
  return selections;
}

async function fetchSprintCatalogGameIds(
  base: string,
  token: AgentBearerSource,
  sessionId: string,
): Promise<Set<string>> {
  const response = await fetchJson(
    "POST",
    base,
    resolveCatalogEndpoint("agent-v1", sessionId),
    token,
    { includeBeta: true },
  );
  if (!response.ok) {
    throw new Error(
      `games catalog preflight failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
  const games = asRecordArray(response.data?.games);
  return new Set(
    games
      .map((entry) => readNonEmptyString(entry.id)?.toLowerCase())
      .filter((entry): entry is string => Boolean(entry)),
  );
}

function resolveSprintGameOrder(availableGames: Set<string>): string[] {
  const ordered = SPRINT_GAME_ORDER.filter((gameId) => availableGames.has(gameId));
  if (ordered.length < SPRINT_EXPECTED_GAME_COUNT) {
    const missing = SPRINT_GAME_ORDER.filter((gameId) => !availableGames.has(gameId));
    throw new Error(
      `catalog missing required sprint games (${SPRINT_EXPECTED_GAME_COUNT - ordered.length} missing): ${missing.join(", ")}`,
    );
  }
  return ordered.slice(0, SPRINT_EXPECTED_GAME_COUNT);
}

async function fetchSprintAds(
  base: string,
  token: AgentBearerSource,
  sessionId: string,
): Promise<SprintAdSummary[]> {
  const response = await fetchJson(
    "GET",
    base,
    resolveAdsListEndpoint("agent-v1", sessionId),
    token,
  );
  if (!response.ok) {
    throw new Error(
      `ads inventory preflight failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
  const ads = asRecordArray(response.data?.ads)
    .map((entry) => {
      const adId = readNonEmptyString(entry.id);
      if (!adId) return null;
      const adName =
        readNonEmptyString(entry.name)
        ?? readNonEmptyString(entry.title)
        ?? adId;
      return { adId, adName };
    })
    .filter((entry): entry is SprintAdSummary => Boolean(entry));

  if (ads.length < 6) {
    throw new Error(
      `ads inventory preflight failed: expected at least 6 default creatives, found ${ads.length}`,
    );
  }
  return ads.slice(0, 6);
}

async function triggerSprintAd(
  base: string,
  token: AgentBearerSource,
  sessionId: string,
  adId: string,
): Promise<{ triggered: boolean; rendered: boolean; detail?: string }> {
  const response = await fetchJson(
    "POST",
    base,
    resolveAdTriggerEndpoint("agent-v1", sessionId, adId),
    token,
    {},
  );
  if (!response.ok) {
    return {
      triggered: false,
      rendered: false,
      detail: `ad trigger failed (${response.status}): ${getErrorDetail(response)}`,
    };
  }

  const expectedGraphicId = readNonEmptyString(response.data?.graphic?.id);
  const timeoutMs = 9_000;
  const pollMs = 600;
  const startedAt = Date.now();
  let lastObservedDetail = "render acknowledgement pending";

  while (Date.now() - startedAt < timeoutMs) {
    const activeResponse = await fetchJson(
      "GET",
      base,
      resolveAdActiveEndpoint("agent-v1", sessionId),
      token,
    );
    if (!activeResponse.ok) {
      lastObservedDetail = `active ad lookup failed (${activeResponse.status}): ${getErrorDetail(activeResponse)}`;
      await sleep(pollMs);
      continue;
    }

    const active = asRecord(activeResponse.data?.active);
    const activeAdId = readNonEmptyString(active?.adId);
    const activeGraphicId = readNonEmptyString(active?.graphicId);
    const renderAcked = active?.renderAcked === true;

    if (!active) {
      lastObservedDetail = "ad became inactive before render acknowledgement";
      await sleep(pollMs);
      continue;
    }

    if (activeAdId !== adId) {
      lastObservedDetail = `active ad mismatch (expected ${adId}, saw ${activeAdId ?? "none"})`;
      await sleep(pollMs);
      continue;
    }

    if (expectedGraphicId && activeGraphicId && activeGraphicId !== expectedGraphicId) {
      lastObservedDetail = `graphic mismatch (expected ${expectedGraphicId}, saw ${activeGraphicId})`;
      await sleep(pollMs);
      continue;
    }

    if (renderAcked) {
      return { triggered: true, rendered: true };
    }

    lastObservedDetail = "render acknowledgement pending";
    await sleep(pollMs);
  }

  return {
    triggered: true,
    rendered: false,
    detail: lastObservedDetail,
  };
}

function isActionSuccess(result: unknown): boolean {
  const envelope = asRecord(result);
  return envelope?.success === true;
}

const gamesProvider: Provider = {
  name: "five55Games",
  description: "Five55 game discovery and launch orchestration surface",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const dialect = resolveGamesDialect();
    const configured =
      dialect === "five55-web"
        ? Boolean(trimEnv(API_ENV))
        : dialect === "agent-v1"
          ? Boolean(trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured())
          : true;
    return {
      text: [
        "## Five55 Games Surface",
        "",
        "Actions: FIVE55_GAMES_CATALOG, FIVE55_GAMES_PLAY, FIVE55_GAMES_GO_LIVE_PLAY, FIVE55_GAMES_LIVE_CAPABILITY_SPRINT",
        `API configured: ${configured ? "yes" : "no"} (${dialect === "five55-web" ? API_ENV : dialect === "agent-v1" ? `${STREAM555_BASE_ENV}|${describeAgentAuthSource()}` : `${LOCAL_API_URL_ENV}|${LOCAL_PORT_ENV}`})`,
        `Dialect: ${dialect}`,
        ...(dialect === "agent-v1"
          ? [`Session env: ${trimEnv(STREAM_SESSION_ENV) ?? trimEnv(STREAM555_SESSION_ENV) ?? "auto-create"}`]
          : []),
      ].join("\n"),
    };
  },
};

const catalogAction: Action = {
  name: "FIVE55_GAMES_CATALOG",
  similes: ["GAMES_CATALOG", "LIST_GAMES", "FIVE55_LIST_GAMES"],
  description: "Lists available Five55 games for play orchestration.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.observe");
      const dialect = resolveGamesDialect();
      const filter = readParam(options as HandlerOptions | undefined, "filter");
      const includeBeta =
        readParam(options as HandlerOptions | undefined, "includeBeta") ?? "true";
      const category = filter && filter !== "all" ? filter : undefined;
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );

      if (dialect === "agent-v1") {
        const base = resolveGamesBase(dialect);
        const token = await resolveAgentBearer(base);
        const sessionId = await ensureAgentSessionId(
          base,
          token,
          requestedSessionId,
        );
        return executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_CATALOG",
          base,
          endpoint: resolveCatalogEndpoint(dialect, sessionId),
          payload: {
            ...(category ? { category } : {}),
            includeBeta,
          },
          requestContract: {
            category: {
              required: false,
              type: "string",
              nonEmpty: true,
              oneOf: ["arcade", "rpg", "puzzle", "racing", "casino"],
            },
            includeBeta: {
              required: true,
              type: "string",
              nonEmpty: true,
              oneOf: ["true", "false", "1", "0", "yes", "no", "on", "off"],
            },
          },
          responseContract: {},
          successMessage: "game catalog fetched",
          transport: {
            service: "games",
            operation: "query",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          context: { sessionId },
        });
      }

      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_CATALOG",
        base: resolveGamesBase(dialect),
        endpoint: resolveCatalogEndpoint(dialect),
        payload: {
          ...(category ? { category } : {}),
          includeBeta,
        },
        requestContract: {
          category: {
            required: false,
            type: "string",
            nonEmpty: true,
            oneOf: ["arcade", "rpg", "puzzle", "racing", "casino"],
          },
          includeBeta: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["true", "false", "1", "0", "yes", "no", "on", "off"],
          },
        },
        responseContract: {},
        successMessage: "game catalog fetched",
        transport: {
          service: "games",
          operation: "query",
          ...(dialect === "milaidy-proxy"
            ? { bearerTokenEnv: LOCAL_TOKEN_ENV }
            : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_CATALOG", err);
    }
  },
  parameters: [
    {
      name: "filter",
      description: "Catalog filter (all|arcade|rpg|puzzle|racing|casino)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "includeBeta",
      description: "Include beta games (true|false)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const playAction: Action = {
  name: "FIVE55_GAMES_PLAY",
  similes: [
    "PLAY_GAME",
    "PLAY_GAMES",
    "LAUNCH_GAME",
    "START_GAME_SESSION",
    "FIVE55_PLAY",
  ],
  description: "Starts a game session for a selected Five55 game.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const dialect = resolveGamesDialect();
      const gameId = readParam(options as HandlerOptions | undefined, "gameId");
      const mode = normalizeMode(
        readParam(options as HandlerOptions | undefined, "mode"),
        dialect,
      );
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );

      if (dialect === "agent-v1") {
        const base = resolveGamesBase(dialect);
        const token = await resolveAgentBearer(base);
        const sessionId = await ensureAgentSessionId(
          base,
          token,
          requestedSessionId,
        );
        const resolvedGameId = await resolveAgentGameId(
          base,
          token,
          sessionId,
          gameId,
        );
        return executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_PLAY",
          base,
          endpoint: resolvePlayEndpoint(dialect, sessionId),
          payload: {
            ...(resolvedGameId ? { gameId: resolvedGameId } : {}),
            mode,
          },
          requestContract: {
            gameId: { required: true, type: "string", nonEmpty: true },
            mode: {
              required: true,
              type: "string",
              nonEmpty: true,
              oneOf: ["standard", "ranked", "spectate", "solo", "agent"],
            },
          },
          responseContract: {},
          successMessage: "game play started",
          transport: {
            service: "games",
            operation: "command",
            idempotent: true,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          context: { sessionId },
        });
      }

      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_PLAY",
        base: resolveGamesBase(dialect),
        endpoint: resolvePlayEndpoint(dialect),
        payload: {
          ...(gameId ? { gameId } : {}),
          mode,
        },
        requestContract: {
          gameId: { required: false, type: "string", nonEmpty: true },
          mode: {
            required: true,
            type: "string",
            nonEmpty: true,
            oneOf: ["standard", "ranked", "spectate", "solo", "agent"],
          },
        },
        responseContract: {},
        successMessage: "game play started",
        transport: {
          service: "games",
          operation: "command",
          idempotent: true,
          ...(dialect === "milaidy-proxy"
            ? { bearerTokenEnv: LOCAL_TOKEN_ENV }
            : {}),
        },
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_PLAY", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Canonical game identifier",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (standard|ranked|spectate|solo|agent)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const goLivePlayAction: Action = {
  name: "FIVE55_GAMES_GO_LIVE_PLAY",
  similes: [
    "PLAY_GAME_GO_LIVE",
    "GO_LIVE_PLAY_GAME",
    "START_GAME_STREAM",
    "FIVE55_GO_LIVE_PLAY",
  ],
  description:
    "Launches a Five55 game in agent mode and ensures Cloudflare stream output is provisioned for the session.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "FIVE55_GAMES_GO_LIVE_PLAY");
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");

      const dialect = resolveGamesDialect();
      if (dialect !== "agent-v1") {
        throw new Error(
          "FIVE55_GAMES_GO_LIVE_PLAY requires agent-v1 dialect (set FIVE55_GAMES_API_DIALECT=agent-v1 with STREAM555_BASE_URL + agent auth)",
        );
      }

      const base = resolveGamesBase(dialect);
      const tokenProvider = async (): Promise<string> => resolveAgentBearer(base);
      const token = await tokenProvider();
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const requestedGameId = readParam(
        options as HandlerOptions | undefined,
        "gameId",
      );
      const mode = normalizeMode(
        readParam(options as HandlerOptions | undefined, "mode"),
        dialect,
      );
      const cfConnectTimeoutMs = readPositiveIntEnv(
        CF_CONNECT_TIMEOUT_MS_ENV,
        DEFAULT_CF_CONNECT_TIMEOUT_MS,
      );
      const cfConnectPollMs = readPositiveIntEnv(
        CF_CONNECT_POLL_MS_ENV,
        DEFAULT_CF_CONNECT_POLL_MS,
      );
      const cfRecoveryAttempts = readNonNegativeIntEnv(
        CF_RECOVERY_ATTEMPTS_ENV,
        DEFAULT_CF_RECOVERY_ATTEMPTS,
      );

      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);
      await ensureAgentCloudflareOutput(base, token, sessionId);

      const resolvedGameId = await resolveAgentGameId(
        base,
        token,
        sessionId,
        requestedGameId,
      );
      if (!resolvedGameId) {
        throw new Error("No playable game could be resolved for go-live launch");
      }

      let launchPolicyContext: LaunchPolicyContext | null = null;
      try {
        launchPolicyContext = await prepareLaunchPolicyContext(
          base,
          token,
          sessionId,
          resolvedGameId,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[five55.games] intelligence bootstrap skipped for ${resolvedGameId}: ${message}`,
        );
      }

      let lastConnectivity: CloudflareConnectCheck | undefined;
      for (let attempt = 0; attempt <= cfRecoveryAttempts; attempt += 1) {
        const playResult = await executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_GO_LIVE_PLAY",
          base,
          endpoint: resolvePlayEndpoint(dialect, sessionId),
          payload: {
            gameId: resolvedGameId,
            mode,
            ...(launchPolicyContext
              ? {
                controlAuthority: launchPolicyContext.controlAuthority,
                policyVersion: launchPolicyContext.policyVersion,
                policySnapshot: launchPolicyContext.policySnapshot,
                policyFamily: launchPolicyContext.policyFamily,
              }
              : {}),
          },
          requestContract: {
            gameId: { required: true, type: "string", nonEmpty: true },
            mode: {
              required: true,
              type: "string",
              nonEmpty: true,
              oneOf: ["standard", "ranked", "spectate", "solo", "agent"],
            },
            controlAuthority: {
              required: false,
              type: "string",
              nonEmpty: true,
              oneOf: ["milaidy"],
            },
            policyVersion: {
              required: false,
              type: "number",
            },
            policySnapshot: {
              required: false,
              type: "object",
            },
            policyFamily: {
              required: false,
              type: "string",
              nonEmpty: true,
            },
          },
          responseContract: {},
          successMessage: "game play started",
          transport: {
            service: "games",
            operation: "command",
            idempotent: true,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
          context: { sessionId },
        });

        if (!isActionSuccess(playResult)) {
          return playResult;
        }

        lastConnectivity = await waitForAgentCloudflareConnection(
          base,
          token,
          sessionId,
          cfConnectTimeoutMs,
          cfConnectPollMs,
        );
        if (lastConnectivity.connected) {
          return playResult;
        }

        if (attempt >= cfRecoveryAttempts) {
          break;
        }

        await stopAgentStream(base, token, sessionId, {
          allowMissing: true,
        });
        await ensureAgentCloudflareOutput(base, token, sessionId);
      }

      const phase = lastConnectivity?.lastSnapshot?.phase ?? "unknown";
      const cloudflareState =
        lastConnectivity?.lastSnapshot?.cloudflareState ?? "unknown";
      throw new Error(
        `Cloudflare ingest stayed disconnected after ${cfRecoveryAttempts + 1} play attempt(s) (phase=${phase}, cloudflareState=${cloudflareState})`,
      );
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_GO_LIVE_PLAY", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Canonical game identifier (optional, resolves first playable game when omitted)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (defaults to agent for agent-v1)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const liveCapabilitySprintAction: Action = {
  name: "FIVE55_GAMES_LIVE_CAPABILITY_SPRINT",
  similes: [
    "FIVE55_GAMES_SPRINT",
    "RUN_18_SLOT_GAME_SPRINT",
    "ALICE_GAME_CAPABILITY_SPRINT",
  ],
  description:
    "Runs the 18-slot Alice live capability sprint with continuous stream, per-slot ads, and learning verification.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_GAMES_LIVE_CAPABILITY_SPRINT",
      );
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      assertFive55Capability(CAPABILITY_POLICY, "games.observe");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");

      const dialect = resolveGamesDialect();
      if (dialect !== "agent-v1") {
        throw new Error(
          "FIVE55_GAMES_LIVE_CAPABILITY_SPRINT requires agent-v1 dialect (set FIVE55_GAMES_API_DIALECT=agent-v1 with STREAM555_BASE_URL + agent auth)",
        );
      }

      const base = resolveGamesBase(dialect);
      const tokenProvider = async (): Promise<string> => resolveAgentBearer(base);
      const token = await tokenProvider();
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const dryRun = readBooleanOption(
        readParam(options as HandlerOptions | undefined, "dryRun"),
        false,
      );
      const slotSeconds = readIntOption(
        readParam(options as HandlerOptions | undefined, "slotSeconds"),
        readPositiveIntEnv(SPRINT_SLOT_SECONDS_ENV, DEFAULT_SPRINT_SLOT_SECONDS),
        0,
      );
      const adOffsetSeconds = Math.min(
        slotSeconds,
        readIntOption(
          readParam(options as HandlerOptions | undefined, "adOffsetSeconds"),
          readPositiveIntEnv(
            SPRINT_AD_OFFSET_SECONDS_ENV,
            DEFAULT_SPRINT_AD_OFFSET_SECONDS,
          ),
          0,
        ),
      );
      const sprintId =
        readParam(options as HandlerOptions | undefined, "sprintId")?.trim()
        || `alice-capability-sprint-${Date.now()}`;

      const sessionId = await ensureAgentSessionId(base, token, requestedSessionId);
      await ensureAgentCloudflareOutput(base, token, sessionId);
      const streamStatus = await fetchAgentStreamStatusSnapshot(base, token, sessionId);
      if (!streamStatus.active) {
        throw new Error("session stream is not active after Cloudflare provisioning");
      }

      const availableGameIds = await fetchSprintCatalogGameIds(
        base,
        tokenProvider,
        sessionId,
      );
      const orderedGameIds = resolveSprintGameOrder(availableGameIds);
      const sprintAds = await fetchSprintAds(base, tokenProvider, sessionId);
      const learningClient = new LearningClient(createAgentRequest(base, tokenProvider));
      const slotResults: SprintSlotResult[] = [];
      const reconcilePendingSlots = async (): Promise<void> => {
        for (const slot of slotResults) {
          if (slot.episodeId) continue;
          const startedMs = parseIsoMs(slot.startedAt);
          if (startedMs == null) continue;
          const snapshot = await learningClient.fetchSessionLearning(sessionId, slot.gameId)
            .catch(() => null);
          if (!snapshot || !isEpisodeFreshForSlot(snapshot.latestEpisode, startedMs)) {
            continue;
          }
          slot.episodeId = snapshot.latestEpisode?.id ?? null;
          slot.score = toFiniteNumber(snapshot.latestEpisode?.score);
          slot.policyVersionAfter = snapshot.profile.policyVersion ?? slot.policyVersionAfter;
          slot.snapshots.push(asSprintSlotSnapshot("final", snapshot));
          slot.compositeScore = computeCompositeScore(slot);
          slot.issues = buildSlotIssues(slot);
        }
      };

      const runSlot = async (
        slotId: number,
        gameId: string,
        diagnosticRetest: boolean,
        sourceSlotId?: number,
      ): Promise<SprintSlotResult> => {
        const ad = sprintAds[(slotId - 1) % sprintAds.length];
        const runId = `${sprintId}-slot-${slotId}-${Date.now()}`;
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();
        const preLearning = await learningClient.fetchSessionLearning(sessionId, gameId);
        const launchPolicyContext = dryRun
          ? null
          : await prepareLaunchPolicyContext(
            base,
            tokenProvider,
            sessionId,
            gameId,
          ).catch(() => null);

        if (!dryRun) {
          const switchPayload: Record<string, unknown> = {
            gameId,
            mode: "agent",
            runId,
            sprintId,
            slotId,
            adId: ad.adId,
            allowUncertified: true,
            certificationBypass: true,
            controlAuthority: "milaidy",
          };
          if (launchPolicyContext) {
            switchPayload.policyVersion = launchPolicyContext.policyVersion;
            switchPayload.policySnapshot = launchPolicyContext.policySnapshot;
          }

          let switchResponse = await fetchJson(
            "POST",
            base,
            resolveSwitchEndpoint(dialect, sessionId),
            tokenProvider,
            switchPayload,
          );
          if (!switchResponse.ok && switchResponse.status === 404) {
            await fetchJson(
              "POST",
              base,
              resolveStopEndpoint(dialect, sessionId),
              tokenProvider,
              { reason: "sprint_switch_fallback" },
            );
            switchResponse = await fetchJson(
              "POST",
              base,
              resolvePlayEndpoint(dialect, sessionId),
              tokenProvider,
              switchPayload,
            );
          }
          if (!switchResponse.ok) {
            throw new Error(
              `slot ${slotId} switch failed (${switchResponse.status}): ${getErrorDetail(switchResponse)}`,
            );
          }
        }

        const snapshots: SprintSlotSnapshot[] = [];
        if (!dryRun) {
          for (const checkpoint of DEFAULT_SPRINT_SLOT_CHECKPOINTS_SECONDS) {
            if (checkpoint > slotSeconds) continue;
            await waitUntil(startedMs, checkpoint);
            const checkpointLearning = await learningClient.fetchSessionLearning(
              sessionId,
              gameId,
            );
            snapshots.push(asSprintSlotSnapshot("checkpoint", checkpointLearning));
          }
        }

        let adOutcome = { triggered: false, rendered: false, detail: "ad not attempted" };
        if (!dryRun) {
          await waitUntil(startedMs, adOffsetSeconds);
          adOutcome = await triggerSprintAd(
            base,
            tokenProvider,
            sessionId,
            ad.adId,
          );
          if (
            !adOutcome.triggered
            && (adOutcome.detail || "").toLowerCase().includes("cooldown")
            && DEFAULT_SPRINT_AD_RETRY_OFFSET_SECONDS <= slotSeconds
          ) {
            await waitUntil(startedMs, DEFAULT_SPRINT_AD_RETRY_OFFSET_SECONDS);
            adOutcome = await triggerSprintAd(
              base,
              tokenProvider,
              sessionId,
              ad.adId,
            );
          }
        }

        if (!dryRun) {
          await waitUntil(startedMs, slotSeconds);
        }

        const postLearning = await fetchSlotFinalLearningSnapshot(
          learningClient,
          sessionId,
          gameId,
          startedMs,
        );
        snapshots.push(asSprintSlotSnapshot("final", postLearning));

        const slotResult: SprintSlotResult = {
          sprintId,
          slotId,
          gameId,
          diagnosticRetest,
          startedAt,
          endedAt: new Date().toISOString(),
          runId,
          adId: ad.adId,
          adTriggered: adOutcome.triggered,
          adRendered: adOutcome.rendered,
          score: toFiniteNumber(postLearning.latestEpisode?.score),
          episodeId: postLearning.latestEpisode?.id ?? null,
          policyVersionBefore: preLearning.profile.policyVersion ?? null,
          policyVersionAfter: postLearning.profile.policyVersion ?? null,
          compositeScore: 0,
          snapshots,
          issues: [],
        };

        slotResult.compositeScore = computeCompositeScore(slotResult);
        slotResult.issues = buildSlotIssues(slotResult);

        if (diagnosticRetest && sourceSlotId != null) {
          const baseline = slotResults.find((entry) => entry.slotId === sourceSlotId);
          if (baseline && slotResult.compositeScore <= baseline.compositeScore) {
            slotResult.issues.push({
              category: "learning",
              severity: "medium",
              symptom: "Diagnostic retest did not improve over baseline slot",
              probableCause: "Policy corrections were not applied or were ineffective",
              evidence: `baseline=${baseline.compositeScore}, retest=${slotResult.compositeScore}`,
              fixHint: "Review correction deltas and apply tighter hazard/resource tuning",
            });
          }
        }

        return slotResult;
      };

      for (let index = 0; index < orderedGameIds.length; index += 1) {
        const gameId = orderedGameIds[index];
        const slotId = index + 1;
        const result = await runSlot(slotId, gameId, false);
        slotResults.push(result);
        await reconcilePendingSlots();
      }

      const diagnostics = selectDiagnosticRetests(
        slotResults,
        SPRINT_DIAGNOSTIC_SLOTS,
      );
      for (let index = 0; index < diagnostics.length; index += 1) {
        const selection = diagnostics[index];
        const slotId = orderedGameIds.length + index + 1;
        const result = await runSlot(
          slotId,
          selection.gameId,
          true,
          selection.sourceSlotId,
        );
        slotResults.push(result);
        await reconcilePendingSlots();
      }

      await reconcilePendingSlots();

      const summary = {
        sprintId,
        sessionId,
        dryRun,
        slotSeconds,
        adOffsetSeconds,
        expectedSlots: SPRINT_EXPECTED_GAME_COUNT + SPRINT_DIAGNOSTIC_SLOTS,
        completedSlots: slotResults.length,
        adSuccessSlots: slotResults.filter((entry) => entry.adTriggered && entry.adRendered)
          .length,
        learningEpisodeSlots: slotResults.filter((entry) => Boolean(entry.episodeId)).length,
        averageCompositeScore:
          slotResults.length > 0
            ? Number(
              (
                slotResults.reduce((sum, entry) => sum + entry.compositeScore, 0)
                / slotResults.length
              ).toFixed(2),
            )
            : 0,
        diagnosticRetests: diagnostics,
      };

      return actionSuccessResult(
        "five55.games",
        "FIVE55_GAMES_LIVE_CAPABILITY_SPRINT",
        200,
        "live capability sprint completed",
        {
          summary,
          slots: slotResults,
        },
      );
    } catch (err) {
      return exceptionAction(
        "five55.games",
        "FIVE55_GAMES_LIVE_CAPABILITY_SPRINT",
        err,
      );
    }
  },
  parameters: [
    {
      name: "sessionId",
      description: "Optional stream session id for agent-v1 dialect",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sprintId",
      description: "Optional custom sprint id for reporting",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "slotSeconds",
      description: "Per-slot runtime in seconds (default 300)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "adOffsetSeconds",
      description: "Ad trigger offset in seconds within each slot (default 270)",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "dryRun",
      description: "If true, validates preflight and plan without waiting full slot durations",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55GamesPlugin(): Plugin {
  return {
    name: "five55-games",
    description: "Five55 games orchestration plugin",
    providers: [gamesProvider],
    actions: [
      catalogAction,
      playAction,
      goLivePlayAction,
      liveCapabilitySprintAction,
    ],
  };
}

export default createFive55GamesPlugin;
