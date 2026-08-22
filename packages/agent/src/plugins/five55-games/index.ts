import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
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
  invalidateExchangedAgentTokenCache,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";
import { ensureGamesAgentSessionId } from "./agent-client.js";
import {
  AliceGameplayMemoryPersistence,
  type AliceGameplayMemoryRuntime,
} from "./alice-gameplay-memory-persistence.js";
import { AliceReactionBridge } from "./alice-reaction-bridge.js";
import { loadDrive555LocalArtifacts } from "./drive555-local-artifacts.js";
import { Drive555RehearsalSupervisor } from "./drive555-rehearsal-supervisor.js";
import { assertLoopbackRehearsalBase } from "./local-rehearsal-base.js";

const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const DIALECT_ENV = "FIVE55_GAMES_API_DIALECT";
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";
const CF_CONNECT_TIMEOUT_MS_ENV = "FIVE55_GAMES_CF_CONNECT_TIMEOUT_MS";
const CF_CONNECT_POLL_MS_ENV = "FIVE55_GAMES_CF_CONNECT_POLL_MS";
const CF_RECOVERY_ATTEMPTS_ENV = "FIVE55_GAMES_CF_RECOVERY_ATTEMPTS";
const DRIVE555_REHEARSE_LOCAL_ENV = "FIVE55_GAMES_DRIVE555_REHEARSE_LOCAL";
const DRIVE555_LIVE_CONTROL_ENABLED_ENV =
  "FIVE55_GAMES_DRIVE555_LIVE_CONTROL_ENABLED";
const DRIVE555_LOCAL_SDK_ROOT_ENV = "FIVE55_GAMES_LOCAL_SDK_ROOT";
const DRIVE555_LOCAL_SDK_ENTRY_ENV = "FIVE55_GAMES_LOCAL_SDK_ENTRY";
const DRIVE555_LOCAL_ARCADE_ROOT_ENV = "FIVE55_GAMES_LOCAL_ARCADE_ROOT";

const DEFAULT_CF_CONNECT_TIMEOUT_MS = 45_000;
const DEFAULT_CF_CONNECT_POLL_MS = 5_000;
const DEFAULT_CF_RECOVERY_ATTEMPTS = 1;

const DRIVE555_RACING_LINE_POLICY = {
  reactionWindowMs: 190,
  riskTolerance: 0.4,
  recenterBias: 0.8,
  hazardAvoidanceBias: 0.84,
} as const;

const DRIVE555_RECOVERY_POLICY = {
  schemaVersion: "555drive.recovery.v1",
  stallWindowMs: 4_000,
  maximumPositionRange: 10,
  maximumAttempts: 1,
  action: "restart",
  progressDeadlineMs: 5_000,
  minimumForwardDelta: 1_000,
} as const;

interface AliceStreamControlPort {
  broadcastEvent(
    topic: "emote",
    payload: { emoteId: string; path: string; duration: number; loop: boolean },
    sessionId: string,
  ): Promise<{ ok: boolean; sent: boolean }>;
  triggerAdBreak(
    adId: string,
    options: { duration: number },
    sessionId: string,
  ): Promise<{ graphicId: string; layout: string; duration: number }>;
}

type GamesDialect = "agent-v1";
type GameSessionMode = "standard" | "ranked" | "spectate" | "solo" | "agent";
type AgentBearerSource = string | (() => Promise<string>);

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function requireLocalEnv(key: string): string {
  const value = trimEnv(key);
  if (!value)
    throw new Error(`${key} is required for local 555Drive rehearsal`);
  return value;
}

function assertLocalDrive555RehearsalEnabled(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "555Drive rehearsal is local-only and cannot run in production",
    );
  }
  if (trimEnv(DRIVE555_REHEARSE_LOCAL_ENV)?.toLowerCase() !== "true") {
    throw new Error(
      `${DRIVE555_REHEARSE_LOCAL_ENV}=true is required for explicit local 555Drive rehearsal`,
    );
  }
}

function assertDrive555LiveControlEnabled(): void {
  if (trimEnv(DRIVE555_LIVE_CONTROL_ENABLED_ENV)?.toLowerCase() !== "true") {
    throw new Error(
      `${DRIVE555_LIVE_CONTROL_ENABLED_ENV}=true is required for production 555Drive control`,
    );
  }
}

function assertDrive555ProductionBase(base: string): void {
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new Error(
      "production 555Drive control requires a credential-free remote HTTPS base",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.");
  if (
    parsed.protocol !== "https:" ||
    loopback ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "production 555Drive control requires a credential-free remote HTTPS base",
    );
  }
}

function requireDrive555LiveInputs(input: {
  requestedSessionId?: string;
  requestedGameRunId?: string;
  roomId?: Memory["roomId"];
}): {
  requestedSessionId: string;
  gameRunId: string;
  roomId: Memory["roomId"];
} {
  const requestedSessionId = input.requestedSessionId?.trim();
  const gameRunId = input.requestedGameRunId?.trim();
  if (!requestedSessionId || !gameRunId) {
    throw new Error(
      "sessionId and gameRunId are required for production 555Drive control",
    );
  }
  if (!input.roomId) {
    throw new Error(
      "Alice room context is required to persist production gameplay evidence",
    );
  }
  return { requestedSessionId, gameRunId, roomId: input.roomId };
}

function resolveAliceStreamControl(
  runtime: IAgentRuntime,
): AliceStreamControlPort {
  const service = runtime.getService("stream555");
  if (!isAliceStreamControlPort(service)) {
    throw new Error(
      "StreamControlService is required for Alice VRM reaction delivery",
    );
  }
  return service;
}

function isAliceStreamControlPort(
  value: unknown,
): value is AliceStreamControlPort {
  const service = asRecord(value);
  return (
    typeof service?.broadcastEvent === "function" &&
    typeof service?.triggerAdBreak === "function"
  );
}

function isAliceGameplayMemoryRuntime(
  value: unknown,
): value is AliceGameplayMemoryRuntime {
  const candidate = asRecord(value);
  return (
    candidate !== undefined &&
    typeof candidate.agentId === "string" &&
    typeof candidate.createMemory === "function"
  );
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readActionData(result: { text: string }): Record<string, unknown> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(result.text);
  } catch {
    throw new Error("555Drive play response was not a valid action envelope");
  }
  const data = asRecord(asRecord(envelope)?.data);
  if (!data)
    throw new Error("555Drive play response did not include binding data");
  return data;
}

function requireDrive555PlayBinding(
  result: { text: string },
  expected: { sessionId: string; gameRunId: string },
): {
  sessionId: string;
  gameId: "555drive";
  gameRunId: string;
  sourceId: string;
} {
  const data = readActionData(result);
  const status = typeof data.status === "string" ? data.status : "";
  const sessionId =
    typeof data.sessionId === "string" ? data.sessionId.trim() : "";
  const gameId =
    typeof data.gameId === "string" ? data.gameId.trim().toLowerCase() : "";
  const gameRunId = typeof data.runId === "string" ? data.runId.trim() : "";
  const sourceId =
    typeof data.sourceId === "string" ? data.sourceId.trim() : "";
  if (
    (status !== "started" && status !== "already_running") ||
    sessionId !== expected.sessionId ||
    gameId !== "555drive" ||
    gameRunId !== expected.gameRunId ||
    !sourceId
  ) {
    throw new Error(
      "555Drive play response did not bind the exact session, game run, and source",
    );
  }
  return { sessionId, gameId: "555drive", gameRunId, sourceId };
}

async function runDrive555LiveControl(input: {
  runtime: IAgentRuntime;
  roomId: Memory["roomId"];
  base: string;
  token: string;
  binding: {
    sessionId: string;
    gameId: "555drive";
    gameRunId: string;
    sourceId: string;
  };
  goal: string;
}): Promise<Awaited<ReturnType<Drive555RehearsalSupervisor["run"]>>> {
  const artifacts = await loadDrive555LocalArtifacts({
    mode: "local",
    sdk: {
      allowedRoot: requireLocalEnv(DRIVE555_LOCAL_SDK_ROOT_ENV),
      entryPath: requireLocalEnv(DRIVE555_LOCAL_SDK_ENTRY_ENV),
    },
    arcade: {
      allowedRoot: requireLocalEnv(DRIVE555_LOCAL_ARCADE_ROOT_ENV),
    },
  });
  const client = new artifacts.sdk.GameplayApiClient({
    apiUrl: input.base,
    token: input.token,
  });
  const assertLiveBinding = async (): Promise<void> => {
    const capabilities = await client.getGameCapabilities(
      input.binding.sessionId,
    );
    if (
      capabilities.protocolVersion !== "gameplay.v1" ||
      capabilities.sessionId !== input.binding.sessionId ||
      capabilities.gameRunId !== input.binding.gameRunId ||
      capabilities.binding.gameRunId !== input.binding.gameRunId ||
      capabilities.binding.gameId !== input.binding.gameId ||
      capabilities.binding.sourceId !== input.binding.sourceId ||
      capabilities.controlMode !== "fenced_agent_v1" ||
      capabilities.binding.controlMode !== "fenced_agent_v1"
    ) {
      throw new Error(
        "555Drive gameplay authority did not match the exact live session, game run, and source",
      );
    }
  };
  await assertLiveBinding();
  if (!isAliceGameplayMemoryRuntime(input.runtime)) {
    throw new Error(
      "Alice runtime memory persistence is required for production 555Drive control",
    );
  }
  const persistence = new AliceGameplayMemoryPersistence(
    input.runtime,
    input.roomId,
  );
  const streamControl = resolveAliceStreamControl(input.runtime);
  const policyId = "alice.555drive.racing-line";
  const policyVersion = 1;
  const policyDigest = artifacts.sdk.sha256GameplayCanonical({
    policyId,
    policyVersion,
    snapshot: DRIVE555_RACING_LINE_POLICY,
    recoveryPolicy: DRIVE555_RECOVERY_POLICY,
  });
  const supervisor = new Drive555RehearsalSupervisor({
    client,
    gameplay: {
      adapter: artifacts.adapter,
      controller: artifacts.controller,
    },
    policy: {
      policyId,
      policyVersion,
      policyDigest,
      strategyFamily: "racing_line",
      snapshot: { ...DRIVE555_RACING_LINE_POLICY },
      recoveryPolicy: { ...DRIVE555_RECOVERY_POLICY },
    },
    expectedArtifacts: artifacts.expectedArtifacts,
    controllerArtifact: artifacts.controllerArtifact,
    sha256GameplayCanonical: artifacts.sdk.sha256GameplayCanonical,
    persistence,
    reactions: new AliceReactionBridge({ persistence, streamControl }),
  });
  const result = await supervisor.run({
    sessionId: input.binding.sessionId,
    gameRunId: input.binding.gameRunId,
    goal: input.goal,
  });
  await assertLiveBinding();
  return result;
}

type Drive555LiveControlResult = Awaited<
  ReturnType<Drive555RehearsalSupervisor["run"]>
>;
const inFlightDrive555Control = new Map<
  string,
  Promise<Drive555LiveControlResult>
>();

function runDrive555LiveControlOnce(
  input: Parameters<typeof runDrive555LiveControl>[0],
): Promise<Drive555LiveControlResult> {
  const key = JSON.stringify([
    input.base,
    input.runtime.agentId,
    input.roomId,
    input.binding.sessionId,
    input.binding.gameId,
    input.binding.gameRunId,
    input.binding.sourceId,
  ]);
  const existing = inFlightDrive555Control.get(key);
  if (existing) return existing;

  const created = runDrive555LiveControl(input).finally(() => {
    if (inFlightDrive555Control.get(key) === created) {
      inFlightDrive555Control.delete(key);
    }
  });
  inFlightDrive555Control.set(key, created);
  return created;
}

function normalizeMode(mode: string | undefined): GameSessionMode {
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
  return "agent";
}

function resolveGamesDialect(): GamesDialect {
  const explicit = trimEnv(DIALECT_ENV)?.toLowerCase();
  if (explicit && explicit !== "agent-v1" && explicit !== "agent") {
    throw new Error(
      "five55-games currently supports only agent-v1 dialect on develop",
    );
  }
  if (!trimEnv(STREAM555_BASE_ENV) || !isAgentAuthConfigured()) {
    throw new Error(
      `${STREAM555_BASE_ENV} plus agent auth are required for five55-games`,
    );
  }
  return "agent-v1";
}

function resolveGamesBase(_dialect: GamesDialect): string {
  const base = trimEnv(STREAM555_BASE_ENV);
  if (!base) throw new Error(`${STREAM555_BASE_ENV} is not configured`);
  return base;
}

function resolveCatalogEndpoint(sessionId: string): string {
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/catalog`;
}

function resolvePlayEndpoint(sessionId: string): string {
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/play`;
}

function resolveSwitchEndpoint(sessionId: string): string {
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/switch`;
}

function resolveStopEndpoint(sessionId: string): string {
  return `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/games/stop`;
}

async function fetchJson(
  method: "GET" | "POST",
  base: string,
  endpoint: string,
  token: AgentBearerSource,
  body?: Record<string, unknown>,
): Promise<{
  ok: boolean;
  status: number;
  data?: Record<string, unknown>;
  rawBody: string;
}> {
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

function getErrorDetail(payload: {
  data?: Record<string, unknown>;
  rawBody: string;
}): string {
  const fromData = payload.data?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  return payload.rawBody || "upstream request failed";
}

function resolveCatalogGameId(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;
  const games = Array.isArray(data.games) ? data.games : [];
  for (const game of games) {
    const gameRecord = asRecord(game);
    const gameId =
      typeof gameRecord?.id === "string" ? gameRecord.id.trim() : "";
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
    resolveCatalogEndpoint(sessionId),
    token,
    { includeBeta: true },
  );
  if (!catalog.ok) return undefined;
  return resolveCatalogGameId(catalog.data);
}

async function fetchAgentSessionSnapshot(
  base: string,
  token: string,
  sessionId: string,
): Promise<{ active: boolean; cfSessionId?: string }> {
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
  const cfSessionId =
    typeof response.data?.cfSessionId === "string" &&
    response.data.cfSessionId.trim()
      ? response.data.cfSessionId.trim()
      : undefined;
  return {
    active: Boolean(response.data?.active),
    cfSessionId,
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
      input: { type: "screen" },
      options: { scene: "active-pip" },
    },
  );

  const cfSessionId =
    typeof response.data?.cfSessionId === "string" &&
    response.data.cfSessionId.trim()
      ? response.data.cfSessionId.trim()
      : undefined;
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

  const startedCfSessionId = await startAgentScreenStream(
    base,
    token,
    sessionId,
  );
  if (startedCfSessionId) return;

  const verifiedSnapshot = await fetchAgentSessionSnapshot(
    base,
    token,
    sessionId,
  );
  if (verifiedSnapshot.cfSessionId) return;

  throw new Error(
    "Cloudflare output provisioning did not produce cfSessionId for session",
  );
}

async function fetchAgentStreamStatusSnapshot(
  base: string,
  token: string,
  sessionId: string,
): Promise<{
  phase?: string;
  cloudflareConnected: boolean;
  cloudflareState?: string;
}> {
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
    phase:
      typeof response.data?.phase === "string" && response.data.phase.trim()
        ? response.data.phase.trim()
        : undefined,
    cloudflareConnected: Boolean(cloudflare?.isConnected),
    cloudflareState:
      typeof cloudflare?.state === "string" && cloudflare.state.trim()
        ? cloudflare.state.trim()
        : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForAgentCloudflareConnection(
  base: string,
  token: string,
  sessionId: string,
  timeoutMs: number,
  pollMs: number,
): Promise<{
  connected: boolean;
  lastSnapshot?: {
    phase?: string;
    cloudflareConnected: boolean;
    cloudflareState?: string;
  };
}> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot:
    | {
        phase?: string;
        cloudflareConnected: boolean;
        cloudflareState?: string;
      }
    | undefined;

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

async function resolveSessionId(
  base: string,
  requestedSessionId?: string,
): Promise<string> {
  return ensureGamesAgentSessionId(
    base,
    requestedSessionId?.trim() ||
      trimEnv(STREAM_SESSION_ENV) ||
      trimEnv(STREAM555_SESSION_ENV),
  );
}

const catalogAction: Action = {
  name: "FIVE55_GAMES_CATALOG",
  similes: ["LIST_FIVE55_GAMES", "FIVE55_GAME_CATALOG", "LIST_GAMES"],
  description:
    "Returns the current Five55 game catalog for the active session.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertFive55Capability(CAPABILITY_POLICY, "games.observe");
      const dialect = resolveGamesDialect();
      const base = resolveGamesBase(dialect);
      const sessionId = await resolveSessionId(
        base,
        readParam(options as HandlerOptions | undefined, "sessionId"),
      );
      const includeBeta = readParam(
        options as HandlerOptions | undefined,
        "includeBeta",
      );
      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_CATALOG",
        base,
        endpoint: resolveCatalogEndpoint(sessionId),
        payload: {
          includeBeta: includeBeta
            ? includeBeta.trim().toLowerCase() !== "false"
            : true,
        },
        requestContract: {
          includeBeta: { required: false, type: "boolean" },
        },
        successMessage: "game catalog resolved",
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_CATALOG", err);
    }
  },
  parameters: [
    {
      name: "sessionId",
      description: "Optional session id for agent-v1 catalog requests.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const playAction: Action = {
  name: "FIVE55_GAMES_PLAY",
  similes: ["PLAY_GAME", "START_FIVE55_GAME", "LAUNCH_FIVE55_GAME"],
  description: "Launches a Five55 game for the active agent-v1 session.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "FIVE55_GAMES_PLAY");
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const dialect = resolveGamesDialect();
      const base = resolveGamesBase(dialect);
      const token = await resolveAgentBearer(base);
      const sessionId = await resolveSessionId(
        base,
        readParam(options as HandlerOptions | undefined, "sessionId"),
      );
      const resolvedGameId = await resolveAgentGameId(
        base,
        token,
        sessionId,
        readParam(options as HandlerOptions | undefined, "gameId"),
      );
      if (!resolvedGameId) {
        throw new Error("No playable game could be resolved");
      }
      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_PLAY",
        base,
        endpoint: resolvePlayEndpoint(sessionId),
        payload: {
          gameId: resolvedGameId,
          mode: normalizeMode(
            readParam(options as HandlerOptions | undefined, "mode"),
          ),
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
        successMessage: "game play started",
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_PLAY", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description:
        "Optional game identifier. The first playable game is used when omitted.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (defaults to agent).",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional session id for agent-v1 play requests.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const switchAction: Action = {
  name: "FIVE55_GAMES_SWITCH",
  similes: ["SWITCH_FIVE55_GAME", "CHANGE_FIVE55_GAME"],
  description: "Switches the active Five55 game inside the current session.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_GAMES_SWITCH",
      );
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const dialect = resolveGamesDialect();
      const base = resolveGamesBase(dialect);
      const token = await resolveAgentBearer(base);
      const sessionId = await resolveSessionId(
        base,
        readParam(options as HandlerOptions | undefined, "sessionId"),
      );
      const resolvedGameId = await resolveAgentGameId(
        base,
        token,
        sessionId,
        readParam(options as HandlerOptions | undefined, "gameId"),
      );
      if (!resolvedGameId) {
        throw new Error("No playable game could be resolved");
      }
      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_SWITCH",
        base,
        endpoint: resolveSwitchEndpoint(sessionId),
        payload: {
          gameId: resolvedGameId,
          mode: normalizeMode(
            readParam(options as HandlerOptions | undefined, "mode"),
          ),
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
        successMessage: "game switch started",
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_SWITCH", err);
    }
  },
  parameters: [
    {
      name: "gameId",
      description: "Target game identifier.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "mode",
      description: "Session mode (defaults to agent).",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "sessionId",
      description: "Optional session id for agent-v1 switch requests.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const stopAction: Action = {
  name: "FIVE55_GAMES_STOP",
  similes: ["STOP_FIVE55_GAME", "END_FIVE55_GAME"],
  description: "Stops the active Five55 game for the current session.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(runtime, message, state, "FIVE55_GAMES_STOP");
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      const dialect = resolveGamesDialect();
      const base = resolveGamesBase(dialect);
      const sessionId = await resolveSessionId(
        base,
        readParam(options as HandlerOptions | undefined, "sessionId"),
      );
      return executeApiAction({
        module: "five55.games",
        action: "FIVE55_GAMES_STOP",
        base,
        endpoint: resolveStopEndpoint(sessionId),
        payload: {},
        successMessage: "game stopped",
      });
    } catch (err) {
      return exceptionAction("five55.games", "FIVE55_GAMES_STOP", err);
    }
  },
  parameters: [
    {
      name: "sessionId",
      description: "Optional session id for agent-v1 stop requests.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

const drive555RehearseAction: Action = {
  name: "FIVE55_GAMES_DRIVE555_REHEARSE",
  similes: [
    "REHEARSE_ALICE_555DRIVE",
    "TEST_ALICE_555DRIVE_LOCAL",
    "ALICE_DRIVE555_REHEARSAL",
  ],
  description:
    "Runs one local-only, evidence-gated Alice 555Drive rehearsal without creating or restarting a live composition.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_GAMES_DRIVE555_REHEARSE",
      );
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");
      assertLocalDrive555RehearsalEnabled();

      const sessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      )?.trim();
      const gameRunId = readParam(
        options as HandlerOptions | undefined,
        "gameRunId",
      )?.trim();
      const adId = readParam(
        options as HandlerOptions | undefined,
        "adId",
      )?.trim();
      const adDuration = Number(
        readParam(
          options as HandlerOptions | undefined,
          "adDurationMs",
        )?.trim(),
      );
      if (!sessionId || !gameRunId) {
        throw new Error(
          "sessionId and gameRunId are required for 555Drive rehearsal",
        );
      }
      if (!adId || !Number.isSafeInteger(adDuration) || adDuration <= 0) {
        throw new Error(
          "adId and a positive adDurationMs are required for the product rehearsal",
        );
      }
      if (!message.roomId) {
        throw new Error(
          "Alice room context is required to persist gameplay reflection",
        );
      }

      const dialect = resolveGamesDialect();
      const base = resolveGamesBase(dialect);
      assertLoopbackRehearsalBase(base);
      const token = await resolveAgentBearer(base);
      const artifacts = await loadDrive555LocalArtifacts({
        mode: "local",
        sdk: {
          allowedRoot: requireLocalEnv(DRIVE555_LOCAL_SDK_ROOT_ENV),
          entryPath: requireLocalEnv(DRIVE555_LOCAL_SDK_ENTRY_ENV),
        },
        arcade: {
          allowedRoot: requireLocalEnv(DRIVE555_LOCAL_ARCADE_ROOT_ENV),
        },
      });
      const policyId = "alice.555drive.racing-line";
      const policyVersion = 1;
      const policyDigest = artifacts.sdk.sha256GameplayCanonical({
        policyId,
        policyVersion,
        snapshot: DRIVE555_RACING_LINE_POLICY,
        recoveryPolicy: DRIVE555_RECOVERY_POLICY,
      });
      if (!isAliceGameplayMemoryRuntime(runtime)) {
        throw new Error(
          "Alice runtime memory persistence is required for gameplay rehearsal",
        );
      }
      const alicePersistence = new AliceGameplayMemoryPersistence(
        runtime,
        message.roomId,
      );
      const streamControl = resolveAliceStreamControl(runtime);
      const reactionBridge = new AliceReactionBridge({
        persistence: alicePersistence,
        streamControl,
      });
      const supervisor = new Drive555RehearsalSupervisor({
        client: new artifacts.sdk.GameplayApiClient({ apiUrl: base, token }),
        gameplay: {
          adapter: artifacts.adapter,
          controller: artifacts.controller,
        },
        policy: {
          policyId,
          policyVersion,
          policyDigest,
          strategyFamily: "racing_line",
          snapshot: { ...DRIVE555_RACING_LINE_POLICY },
          recoveryPolicy: { ...DRIVE555_RECOVERY_POLICY },
        },
        expectedArtifacts: artifacts.expectedArtifacts,
        controllerArtifact: artifacts.controllerArtifact,
        sha256GameplayCanonical: artifacts.sdk.sha256GameplayCanonical,
        persistence: alicePersistence,
        reactions: reactionBridge,
        ads: streamControl,
      });
      const result = await supervisor.run({
        sessionId,
        gameRunId,
        goal:
          readParam(options as HandlerOptions | undefined, "goal")?.trim() ||
          "drive the verified racing line safely",
        ad: { adId, duration: adDuration },
      });
      return {
        success: true,
        text: JSON.stringify({
          ok: true,
          module: "five55.games",
          action: "FIVE55_GAMES_DRIVE555_REHEARSE",
          message:
            "Alice 555Drive local rehearsal completed with reflected native evidence",
          data: result,
        }),
      };
    } catch (err) {
      return exceptionAction(
        "five55.games",
        "FIVE55_GAMES_DRIVE555_REHEARSE",
        err,
      );
    }
  },
  parameters: [
    {
      name: "sessionId",
      description:
        "Existing trusted gameplay session id; no session or composition is created.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "gameRunId",
      description:
        "Existing 555Drive run id whose frozen authority/evidence binding will be verified.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "goal",
      description:
        "Optional Alice gameplay goal for the one-decision local rehearsal.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "adId",
      description:
        "Existing Stream555 ad inventory identifier to trigger after reflected movement.",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "adDurationMs",
      description: "Positive ad duration in milliseconds.",
      required: true,
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
    "Launches a Five55 game with Cloudflare output; 555Drive additionally requires fenced native-control reflection, durable Alice mastery, a visible VRM reaction, and proven neutral release before success.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertTrustedAdminForAction(
        runtime,
        message,
        state,
        "FIVE55_GAMES_GO_LIVE_PLAY",
      );
      assertFive55Capability(CAPABILITY_POLICY, "games.play");
      assertFive55Capability(CAPABILITY_POLICY, "stream.control");

      const dialect = resolveGamesDialect();
      const base = resolveGamesBase(dialect);
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const requestedGameId = readParam(
        options as HandlerOptions | undefined,
        "gameId",
      );
      const requestedGameRunId = readParam(
        options as HandlerOptions | undefined,
        "gameRunId",
      )?.trim();
      const mode = normalizeMode(
        readParam(options as HandlerOptions | undefined, "mode"),
      );
      const requestedDrive555 =
        requestedGameId?.trim().toLowerCase() === "555drive";
      const requestedDrive555Inputs = requestedDrive555
        ? requireDrive555LiveInputs({
            requestedSessionId,
            requestedGameRunId,
            roomId: message.roomId,
          })
        : undefined;
      if (requestedDrive555Inputs) {
        assertDrive555LiveControlEnabled();
        assertDrive555ProductionBase(base);
        if (mode !== "agent") {
          throw new Error("production 555Drive control requires agent mode");
        }
      }
      const token = await resolveAgentBearer(base);
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

      const sessionId = await resolveSessionId(base, requestedSessionId);
      if (
        requestedDrive555Inputs &&
        sessionId !== requestedDrive555Inputs.requestedSessionId
      ) {
        throw new Error(
          "session bootstrap did not preserve the requested 555Drive identity",
        );
      }
      await ensureAgentCloudflareOutput(base, token, sessionId);

      const resolvedGameId = await resolveAgentGameId(
        base,
        token,
        sessionId,
        requestedGameId,
      );
      if (!resolvedGameId) {
        throw new Error(
          "No playable game could be resolved for go-live launch",
        );
      }
      const drive555Live = resolvedGameId.trim().toLowerCase() === "555drive";
      const drive555Inputs = drive555Live
        ? (requestedDrive555Inputs ??
          requireDrive555LiveInputs({
            requestedSessionId,
            requestedGameRunId,
            roomId: message.roomId,
          }))
        : undefined;
      if (drive555Inputs) {
        assertDrive555LiveControlEnabled();
        assertDrive555ProductionBase(base);
        if (mode !== "agent") {
          throw new Error("production 555Drive control requires agent mode");
        }
      }

      let lastConnectivity:
        | {
            connected: boolean;
            lastSnapshot?: {
              phase?: string;
              cloudflareConnected: boolean;
              cloudflareState?: string;
            };
          }
        | undefined;
      for (let attempt = 0; attempt <= cfRecoveryAttempts; attempt += 1) {
        const playResult = await executeApiAction({
          module: "five55.games",
          action: "FIVE55_GAMES_GO_LIVE_PLAY",
          base,
          endpoint: resolvePlayEndpoint(sessionId),
          payload: {
            gameId: resolvedGameId,
            mode,
            ...(drive555Inputs
              ? {
                  runId: drive555Inputs.gameRunId,
                  controlAuthority: "milaidy",
                  policyVersion: 1,
                  policySnapshot: { ...DRIVE555_RACING_LINE_POLICY },
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
          },
          successMessage: "game play started",
        });

        if (!playResult.success) {
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
          if (drive555Inputs) {
            const binding = requireDrive555PlayBinding(playResult, {
              sessionId,
              gameRunId: drive555Inputs.gameRunId,
            });
            const control = await runDrive555LiveControlOnce({
              runtime,
              roomId: drive555Inputs.roomId,
              base,
              token,
              binding,
              goal:
                readParam(
                  options as HandlerOptions | undefined,
                  "goal",
                )?.trim() || "drive the verified racing line safely",
            });
            return {
              success: true,
              text: JSON.stringify({
                ok: true,
                code: "OK",
                module: "five55.games",
                action: "FIVE55_GAMES_GO_LIVE_PLAY",
                message:
                  "Alice 555Drive is live with reflected native control evidence",
                status: 200,
                retryable: false,
                data: { binding, control },
              }),
            };
          }
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
      description:
        "Canonical game identifier (optional, resolves first playable game when omitted)",
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
      description:
        "Optional stream session id for agent-v1; required and identity-checked for production 555Drive control.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "gameRunId",
      description:
        "Required immutable run id for fenced production 555Drive control.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "goal",
      description:
        "Optional Alice objective for the bounded 555Drive control decision.",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

export function createFive55GamesPlugin(): Plugin {
  return {
    name: "five55-games",
    description: "Five55 games orchestration plugin",
    actions: [
      catalogAction,
      playAction,
      switchAction,
      stopAction,
      drive555RehearseAction,
      goLivePlayAction,
    ],
  };
}

export const five55GamesPlugin = createFive55GamesPlugin();
export const plugin = five55GamesPlugin;

export default five55GamesPlugin;
