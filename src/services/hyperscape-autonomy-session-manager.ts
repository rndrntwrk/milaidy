import crypto from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { resolveAgentBearer } from "../plugins/five55-shared/agent-auth.js";
import { deriveEvmAddress, deriveSolanaAddress } from "../api/wallet.js";
import { metrics } from "../telemetry/setup.js";
import type {
  CreateHyperscapeAutonomySessionInput,
  CreateHyperscapeAutonomySessionResult,
  HyperscapeAutonomyActionRecord,
  HyperscapeAutonomyEvent,
  HyperscapeAutonomySession,
  HyperscapeAutonomySessionResult,
  HyperscapeAutonomySessionState,
  HyperscapeWalletProvenance,
  HyperscapeWalletType,
} from "../contracts/hyperscape-autonomy.js";

const HYPERSCAPE_AGENT_START_TIMEOUT_MS = 90_000;
const HYPERSCAPE_POLL_INTERVAL_MS = 2_500;
const HYPERSCAPE_REQUEST_TIMEOUT_MS = 12_000;
const HYPERSCAPE_AUTH_RETRY_ATTEMPTS = 4;
const HYPERSCAPE_AUTH_CACHE_TTL_MS = 10 * 60_000;
const HYPERSCAPE_AUTH_REFRESH_WINDOW_MS = 90_000;
const HYPERSCAPE_SUPERVISOR_INTERVAL_MS = 10_000;
const HYPERSCAPE_STALLED_CHECK_LIMIT = 3;
const HYPERSCAPE_RECOVERY_LIMIT = 2;
const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
const DEFAULT_STREAM_INPUT_URL = "https://hyperscape.gg/";
const STREAM_AUTOSTART_ENV = "HYPERSCAPE_STREAM_AUTOSTART";
const HYPERSCAPE_SLO_METRIC_PREFIX = "milaidy.hyperscape.autonomy";

type SessionStateUpdate = {
  state?: HyperscapeAutonomySessionState;
  failureReason?: string | null;
  streamStarted?: boolean;
  stopped?: boolean;
};

type HyperscapeEmbeddedAgent = {
  agentId?: string;
  characterId?: string;
  name?: string;
  state?: string;
  entityId?: string | null;
  position?: unknown;
  lastActivity?: number | null;
};

type HyperscapeEmbeddedAgentsPayload = {
  success?: boolean;
  agents?: HyperscapeEmbeddedAgent[];
  data?: {
    agents?: HyperscapeEmbeddedAgent[];
  };
};

type HyperscapeCreateEmbeddedAgentPayload = {
  success?: boolean;
  agent?: HyperscapeEmbeddedAgent | null;
  data?: {
    agent?: HyperscapeEmbeddedAgent | null;
  };
};

type HyperscapeWalletAuthPayload = {
  success?: boolean;
  authToken?: string;
  characterId?: string;
  data?: {
    authToken?: string;
    characterId?: string;
    agentId?: string;
    expiresAt?: string;
  };
  token?: string;
  agentId?: string;
  expiresAt?: string;
};

type AuthCacheEntry = {
  authToken: string;
  characterId: string;
  expiresAtMs: number;
};

type ManagedSession = {
  session: HyperscapeAutonomySession;
  stopRequested: boolean;
  authToken: string | null;
  runnerPromise: Promise<void> | null;
  supervisorTimer: ReturnType<typeof setInterval> | null;
  stalledChecks: number;
  lastProgressSignature: string | null;
};

export interface HyperscapeAutonomyOperationalSnapshot {
  totalSessions: number;
  activeSessions: number;
  states: Record<HyperscapeAutonomySessionState, number>;
  failedSessions: number;
  degradedSessions: number;
}

type RequestJsonResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  raw: string;
};

interface HyperscapeAutonomySessionManagerOptions {
  getRuntime: () => IAgentRuntime | null | undefined;
  getHyperscapeApiBaseUrl: () => string;
  now?: () => number;
  onEvent?: (event: HyperscapeAutonomyEvent) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeAuthHeader(token: string | undefined): string | null {
  const value = token?.trim();
  if (!value) return null;
  return /^Bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

function parsePositionSignature(position: unknown): string | null {
  if (!position) return null;
  if (Array.isArray(position) && position.length >= 3) {
    const [x, y, z] = position;
    return `${Math.round(Number(x) || 0)}:${Math.round(Number(y) || 0)}:${Math.round(
      Number(z) || 0,
    )}`;
  }
  if (typeof position === "object") {
    const rec = position as Record<string, unknown>;
    const x = Math.round(Number(rec.x) || 0);
    const y = Math.round(Number(rec.y) || 0);
    const z = Math.round(Number(rec.z) || 0);
    return `${x}:${y}:${z}`;
  }
  return null;
}

function parseIsoMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function isTruthyEnvValue(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export class HyperscapeAutonomySessionManager {
  private readonly getRuntime: () => IAgentRuntime | null | undefined;
  private readonly getHyperscapeApiBaseUrl: () => string;
  private readonly now: () => number;
  private onEvent?: (event: HyperscapeAutonomyEvent) => void;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly walletProvenance = new Map<string, HyperscapeWalletProvenance>();
  private readonly authCache = new Map<string, AuthCacheEntry>();

  constructor(options: HyperscapeAutonomySessionManagerOptions) {
    this.getRuntime = options.getRuntime;
    this.getHyperscapeApiBaseUrl = options.getHyperscapeApiBaseUrl;
    this.now = options.now ?? (() => Date.now());
    this.onEvent = options.onEvent;
  }

  setEventSink(handler?: (event: HyperscapeAutonomyEvent) => void): void {
    this.onEvent = handler;
  }

  dispose(): void {
    for (const managed of this.sessions.values()) {
      if (managed.supervisorTimer) {
        clearInterval(managed.supervisorTimer);
      }
      managed.stopRequested = true;
      managed.supervisorTimer = null;
    }
    this.sessions.clear();
    this.updateOperationalGauges();
  }

  async createSession(
    input: CreateHyperscapeAutonomySessionInput,
  ): Promise<CreateHyperscapeAutonomySessionResult> {
    const trimmedAgentId = input.agentId.trim();
    if (!trimmedAgentId) {
      throw new Error("agentId is required");
    }

    const now = this.now();
    const sessionId = `hs-${now.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const session: HyperscapeAutonomySession = {
      sessionId,
      agentId: trimmedAgentId,
      state: "created",
      goal: input.goal?.trim() || null,
      streamProfile: input.streamProfile ?? null,
      walletAddress: null,
      walletType: null,
      walletSource: null,
      characterId: null,
      embeddedAgentId: null,
      failureReason: null,
      createdAt: toIso(now),
      updatedAt: toIso(now),
      stateChangedAt: toIso(now),
      startedAt: null,
      inWorldAt: null,
      firstActionAt: null,
      streamStartedAt: null,
      stoppedAt: null,
      retryCount: 0,
      recoveries: 0,
      actionHistory: [],
      stream: {
        sessionId: null,
        startedAt: null,
        interruptions: 0,
        recoveryAttempts: 0,
        lastError: null,
        lastErrorAt: null,
      },
    };

    this.sessions.set(sessionId, {
      session,
      stopRequested: false,
      authToken: null,
      runnerPromise: null,
      supervisorTimer: null,
      stalledChecks: 0,
      lastProgressSignature: null,
    });
    metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.session_created_total`, 1, {
      agentId: trimmedAgentId,
    });
    this.updateOperationalGauges();
    this.emitSession(sessionId);
    void this.runSessionLifecycle(sessionId);

    return {
      sessionId,
      walletAddress: session.walletAddress,
      characterId: session.characterId,
      state: session.state,
      session: this.cloneSession(session),
    };
  }

  getSession(sessionId: string): HyperscapeAutonomySessionResult | null {
    const managed = this.sessions.get(sessionId);
    if (!managed) return null;
    return { session: this.cloneSession(managed.session) };
  }

  async stopSession(sessionId: string): Promise<HyperscapeAutonomySessionResult | null> {
    const managed = this.sessions.get(sessionId);
    if (!managed) return null;

    managed.stopRequested = true;
    if (managed.supervisorTimer) {
      clearInterval(managed.supervisorTimer);
      managed.supervisorTimer = null;
    }

    if (managed.session.characterId) {
      await this.requestJson<unknown>(
        "POST",
        `/api/embedded-agents/${encodeURIComponent(managed.session.characterId)}/stop`,
        {
          authToken: managed.authToken ?? process.env.HYPERSCAPE_AUTH_TOKEN,
          timeoutMs: 8_000,
          retryAttempts: 1,
        },
      ).catch(() => undefined);
    }

    this.updateSessionState(sessionId, { state: "stopped", stopped: true });
    return { session: this.cloneSession(managed.session) };
  }

  async recoverSession(sessionId: string): Promise<HyperscapeAutonomySessionResult | null> {
    const managed = this.sessions.get(sessionId);
    if (!managed) return null;

    managed.stopRequested = false;
    managed.stalledChecks = 0;
    managed.lastProgressSignature = null;
    managed.authToken = null;
    managed.session.recoveries += 1;
    this.recordAction(sessionId, "recover", "manual recovery requested");
    this.updateSessionState(sessionId, { state: "agent_starting", failureReason: null });
    void this.runSessionLifecycle(sessionId);
    return { session: this.cloneSession(managed.session) };
  }

  getWalletProvenance(agentId: string): HyperscapeWalletProvenance | null {
    const normalized = agentId.trim();
    if (!normalized) return null;
    const entry = this.walletProvenance.get(normalized);
    return entry ? { ...entry } : null;
  }

  getOperationalSnapshot(): HyperscapeAutonomyOperationalSnapshot {
    const states: Record<HyperscapeAutonomySessionState, number> = {
      created: 0,
      wallet_ready: 0,
      auth_ready: 0,
      agent_starting: 0,
      in_world: 0,
      streaming: 0,
      degraded: 0,
      failed: 0,
      stopped: 0,
    };

    for (const managed of this.sessions.values()) {
      states[managed.session.state] += 1;
    }

    const activeSessions =
      states.created +
      states.wallet_ready +
      states.auth_ready +
      states.agent_starting +
      states.in_world +
      states.streaming +
      states.degraded;

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      states,
      failedSessions: states.failed,
      degradedSessions: states.degraded,
    };
  }

  private async runSessionLifecycle(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed || managed.runnerPromise) return;

    managed.runnerPromise = (async () => {
      const session = managed.session;
      if (!session.startedAt) {
        session.startedAt = toIso(this.now());
      }

      while (!managed.stopRequested) {
        try {
          const wallet = this.resolveWalletForAgent(session.agentId);
          this.applyWallet(sessionId, wallet);
          this.updateSessionState(sessionId, { state: "wallet_ready", failureReason: null });
          if (managed.stopRequested) return;

          const auth = await this.ensureHyperscapeAuth(session.agentId, wallet);
          managed.authToken = auth.authToken;
          process.env.HYPERSCAPE_AUTH_TOKEN = auth.authToken;
          process.env.HYPERSCAPE_CHARACTER_ID = auth.characterId;
          this.patchSession(sessionId, (next) => {
            next.characterId = auth.characterId;
          });
          this.updateSessionState(sessionId, { state: "auth_ready", failureReason: null });
          if (managed.stopRequested) return;

          this.updateSessionState(sessionId, { state: "agent_starting", failureReason: null });
          const embeddedAgent = await this.ensureEmbeddedAgent(
            sessionId,
            auth.characterId,
            auth.authToken,
          );
          if (managed.stopRequested) return;

          await this.startOrResumeEmbeddedAgent(embeddedAgent.characterId, auth.authToken);
          const inWorldAgent = await this.waitForInWorld(sessionId, embeddedAgent, auth.authToken);
          if (managed.stopRequested) return;

          this.patchSession(sessionId, (next) => {
            next.inWorldAt = toIso(this.now());
            next.characterId = inWorldAgent.characterId;
            next.embeddedAgentId = inWorldAgent.agentId;
          });
          this.updateSessionState(sessionId, { state: "in_world", failureReason: null });
          await this.bootstrapGoal(sessionId, auth.authToken);
          this.startSupervisorLoop(sessionId, auth.authToken);

          if (isTruthyEnvValue(process.env[STREAM_AUTOSTART_ENV])) {
            const streamStarted = await this.startStream(sessionId);
            if (streamStarted) {
              this.updateSessionState(sessionId, { state: "streaming", streamStarted: true });
            } else {
              this.updateSessionState(sessionId, {
                state: "degraded",
                failureReason: "in-world, but stream autostart failed",
              });
            }
          }

          return;
        } catch (error) {
          const message = sanitizeError(error);
          if (managed.stopRequested) {
            return;
          }

          managed.session.retryCount += 1;
          const canRecover =
            managed.session.retryCount <= HYPERSCAPE_RECOVERY_LIMIT &&
            /timeout|timed out|websocket|network|status 5\d\d| 5\d\d/i.test(message);

          if (canRecover) {
            managed.session.recoveries += 1;
            this.recordAction(
              sessionId,
              "lifecycle.retry",
              `attempt ${managed.session.retryCount}: ${message}`,
            );
            this.updateSessionState(sessionId, {
              state: "degraded",
              failureReason: message,
            });
            await sleep(1_200 * managed.session.retryCount);
            this.updateSessionState(sessionId, {
              state: "agent_starting",
              failureReason: null,
            });
            continue;
          }

          this.updateSessionState(sessionId, {
            state: "failed",
            failureReason: message,
          });
          return;
        }
      }

      this.updateSessionState(sessionId, { state: "stopped", stopped: true });
    })().finally(() => {
      const current = this.sessions.get(sessionId);
      if (current) {
        current.runnerPromise = null;
      }
    });

    await managed.runnerPromise;
  }

  private resolveWalletForAgent(agentId: string): HyperscapeWalletProvenance {
    const normalizedAgentId = agentId.trim();
    const nowIso = toIso(this.now());
    const existing = this.walletProvenance.get(normalizedAgentId);
    if (existing) {
      const next = { ...existing, source: "existing_agent_wallet" as const, lastUsedAt: nowIso };
      this.walletProvenance.set(normalizedAgentId, next);
      return next;
    }

    const runtime = this.getRuntime();
    const evmKey =
      (runtime?.getSetting?.("EVM_PRIVATE_KEY") as string | undefined)?.trim() ||
      process.env.EVM_PRIVATE_KEY?.trim();
    if (evmKey) {
      const walletAddress = deriveEvmAddress(evmKey);
      const provenance: HyperscapeWalletProvenance = {
        agentId: normalizedAgentId,
        walletAddress,
        walletType: "evm",
        source: "managed_signer",
        createdAt: nowIso,
        lastUsedAt: nowIso,
      };
      this.walletProvenance.set(normalizedAgentId, provenance);
      return provenance;
    }

    const solanaKey =
      (runtime?.getSetting?.("SOLANA_PRIVATE_KEY") as string | undefined)?.trim() ||
      process.env.SOLANA_PRIVATE_KEY?.trim();
    if (solanaKey) {
      const walletAddress = deriveSolanaAddress(solanaKey);
      const provenance: HyperscapeWalletProvenance = {
        agentId: normalizedAgentId,
        walletAddress,
        walletType: "solana",
        source: "managed_signer",
        createdAt: nowIso,
        lastUsedAt: nowIso,
      };
      this.walletProvenance.set(normalizedAgentId, provenance);
      return provenance;
    }

    throw new Error(
      "No managed signer key available. Configure EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY.",
    );
  }

  private applyWallet(sessionId: string, wallet: HyperscapeWalletProvenance): void {
    this.patchSession(sessionId, (next) => {
      next.walletAddress = wallet.walletAddress;
      next.walletType = wallet.walletType;
      next.walletSource = wallet.source;
    });
  }

  private async ensureHyperscapeAuth(
    agentId: string,
    wallet: HyperscapeWalletProvenance,
  ): Promise<{ authToken: string; characterId: string }> {
    const cacheKey = `${agentId}:${wallet.walletAddress}`;
    const now = this.now();
    const cached = this.authCache.get(cacheKey);
    if (cached && cached.expiresAtMs - HYPERSCAPE_AUTH_REFRESH_WINDOW_MS > now) {
      return { authToken: cached.authToken, characterId: cached.characterId };
    }

    const requestBody = {
      walletAddress: wallet.walletAddress,
      walletType: wallet.walletType,
      agentName: agentId,
    };
    let lastError = "wallet-auth failed";

    for (let attempt = 1; attempt <= HYPERSCAPE_AUTH_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await this.requestJson<HyperscapeWalletAuthPayload>(
          "POST",
          "/api/agents/wallet-auth",
          {
            body: requestBody,
            includeAuth: false,
            timeoutMs: HYPERSCAPE_REQUEST_TIMEOUT_MS,
            retryAttempts: 1,
          },
        );
        if (!response.ok) {
          lastError = `wallet-auth failed with status ${response.status}`;
        } else {
          const payload = response.data;
          const authToken =
            payload?.authToken?.trim() ||
            payload?.data?.authToken?.trim() ||
            payload?.token?.trim();
          const characterId =
            payload?.characterId?.trim() ||
            payload?.data?.characterId?.trim() ||
            payload?.data?.agentId?.trim() ||
            payload?.agentId?.trim();
          if (authToken && characterId) {
            const expiresAtRaw = payload?.data?.expiresAt ?? payload?.expiresAt;
            const expiresAt = expiresAtRaw ? Date.parse(expiresAtRaw) : NaN;
            this.authCache.set(cacheKey, {
              authToken,
              characterId,
              expiresAtMs: Number.isFinite(expiresAt)
                ? expiresAt
                : this.now() + HYPERSCAPE_AUTH_CACHE_TTL_MS,
            });
            return { authToken, characterId };
          }
          lastError = "wallet-auth response missing authToken or characterId";
        }
      } catch (error) {
        lastError = sanitizeError(error);
      }

      if (attempt < HYPERSCAPE_AUTH_RETRY_ATTEMPTS) {
        const jitter = Math.floor(Math.random() * 220);
        await sleep(attempt * 700 + jitter);
      }
    }

    throw new Error(`Unable to obtain Hyperscape auth token: ${lastError}`);
  }

  private async ensureEmbeddedAgent(
    sessionId: string,
    expectedCharacterId: string,
    authToken: string,
  ): Promise<{ agentId: string; characterId: string }> {
    const session = this.sessions.get(sessionId)?.session;
    if (!session) throw new Error("Session not found");

    const listed = await this.listEmbeddedAgents(authToken);
    const byCharacter = listed.find((item) => item.characterId === expectedCharacterId);
    if (byCharacter) {
      this.patchSession(sessionId, (next) => {
        next.embeddedAgentId = byCharacter.agentId;
        next.characterId = byCharacter.characterId;
      });
      return byCharacter;
    }

    const byName = listed.find(
      (item) => item.name.trim().toLowerCase() === session.agentId.trim().toLowerCase(),
    );
    if (byName) {
      this.patchSession(sessionId, (next) => {
        next.embeddedAgentId = byName.agentId;
        next.characterId = byName.characterId;
      });
      return byName;
    }

    const createResponse = await this.requestJson<HyperscapeCreateEmbeddedAgentPayload>(
      "POST",
      "/api/embedded-agents",
      {
        authToken,
        body: { characterId: expectedCharacterId, autoStart: false, scriptedRole: "balanced" },
      },
    );
    if (!createResponse.ok) {
      throw new Error(`embedded-agent create failed (${createResponse.status})`);
    }
    const created = createResponse.data?.agent ?? createResponse.data?.data?.agent ?? null;
    const characterId = created?.characterId?.trim() || expectedCharacterId;
    const agentId = created?.agentId?.trim() || characterId;
    this.patchSession(sessionId, (next) => {
      next.characterId = characterId;
      next.embeddedAgentId = agentId;
    });
    this.recordAction(sessionId, "agent.create", `created embedded agent ${agentId}`);
    return { agentId, characterId };
  }

  private async startOrResumeEmbeddedAgent(
    characterId: string,
    authToken: string,
  ): Promise<void> {
    const encoded = encodeURIComponent(characterId);
    const start = await this.requestJson<unknown>(
      "POST",
      `/api/embedded-agents/${encoded}/start`,
      { authToken, retryAttempts: 1 },
    );
    if (start.ok) return;
    const resume = await this.requestJson<unknown>(
      "POST",
      `/api/embedded-agents/${encoded}/resume`,
      { authToken, retryAttempts: 1 },
    );
    if (!resume.ok) {
      throw new Error(`embedded-agent start failed (${start.status}/${resume.status})`);
    }
  }

  private async waitForInWorld(
    sessionId: string,
    agent: { agentId: string; characterId: string },
    authToken: string,
  ): Promise<{ agentId: string; characterId: string }> {
    const started = this.now();
    while (this.now() - started < HYPERSCAPE_AGENT_START_TIMEOUT_MS) {
      const managed = this.sessions.get(sessionId);
      if (!managed || managed.stopRequested) {
        throw new Error("Session was stopped before world initialization completed");
      }

      const listed = await this.listEmbeddedAgents(authToken);
      const target =
        listed.find((item) => item.characterId === agent.characterId) ??
        listed.find((item) => item.agentId === agent.agentId);
      if (target && this.isInWorld(target)) {
        return target;
      }
      await sleep(HYPERSCAPE_POLL_INTERVAL_MS);
    }
    throw new Error("Timed out waiting for embedded agent to enter world");
  }

  private isInWorld(agent: HyperscapeEmbeddedAgent): boolean {
    if (agent.state?.toLowerCase() !== "running") return false;
    if (agent.entityId && agent.entityId.trim().length > 0) return true;
    if (parsePositionSignature(agent.position)) return true;
    return typeof agent.lastActivity === "number" && agent.lastActivity > 0;
  }

  private async bootstrapGoal(sessionId: string, authToken: string): Promise<void> {
    const session = this.sessions.get(sessionId)?.session;
    if (!session?.goal || !session.characterId) return;

    const goalValue = session.goal.trim();
    if (!goalValue) return;
    const encodedAgentId = encodeURIComponent(session.embeddedAgentId ?? session.characterId);
    const encodedCharacterId = encodeURIComponent(session.characterId);

    await this.requestJson<unknown>("POST", `/api/agents/${encodedAgentId}/goal`, {
      authToken,
      body: { goal: goalValue },
      retryAttempts: 1,
    }).catch(() => undefined);

    await this.requestJson<unknown>(
      "POST",
      `/api/embedded-agents/${encodedCharacterId}/command`,
      {
        authToken,
        body: {
          command: "chat",
          data: {
            message: `Primary objective: ${goalValue}. Keep moving and act autonomously.`,
          },
        },
        retryAttempts: 1,
      },
    ).catch(() => undefined);

    this.recordAction(sessionId, "goal.bootstrap", goalValue);
  }

  private startSupervisorLoop(sessionId: string, authToken: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    if (managed.supervisorTimer) {
      clearInterval(managed.supervisorTimer);
    }

    managed.supervisorTimer = setInterval(() => {
      void this.supervisorTick(sessionId, authToken);
    }, HYPERSCAPE_SUPERVISOR_INTERVAL_MS);
  }

  private async supervisorTick(sessionId: string, authToken: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed || managed.stopRequested) return;
    if (!managed.session.characterId) return;

    try {
      const listed = await this.listEmbeddedAgents(authToken);
      const target =
        listed.find((item) => item.characterId === managed.session.characterId) ??
        listed.find((item) => item.agentId === managed.session.embeddedAgentId);
      if (!target) {
        throw new Error("embedded agent not found in runtime list");
      }

      const progressSignature =
        `${parsePositionSignature(target.position) ?? "no-pos"}:${target.lastActivity ?? "na"}`;
      if (progressSignature !== managed.lastProgressSignature) {
        managed.lastProgressSignature = progressSignature;
        managed.stalledChecks = 0;
        return;
      }

      managed.stalledChecks += 1;
      if (managed.stalledChecks < HYPERSCAPE_STALLED_CHECK_LIMIT) return;

      managed.stalledChecks = 0;
      await this.requestJson<unknown>(
        "POST",
        `/api/embedded-agents/${encodeURIComponent(target.characterId)}/command`,
        {
          authToken,
          body: {
            command: "chat",
            data: {
              message:
                "You appear idle. Continue your current goal, move to a useful location, and keep progressing.",
            },
          },
          retryAttempts: 1,
        },
      );
      this.recordAction(sessionId, "supervisor.nudge", "Issued idle recovery nudge");
    } catch (error) {
      managed.session.retryCount += 1;
      const message = sanitizeError(error);
      this.recordAction(sessionId, "supervisor.error", message);

      if (managed.session.recoveries < HYPERSCAPE_RECOVERY_LIMIT && managed.session.characterId) {
        managed.session.recoveries += 1;
        managed.session.stream = {
          ...(managed.session.stream ?? {
            sessionId: null,
            startedAt: null,
            interruptions: 0,
            recoveryAttempts: 0,
            lastError: null,
            lastErrorAt: null,
          }),
          interruptions: (managed.session.stream?.interruptions ?? 0) + 1,
          recoveryAttempts: (managed.session.stream?.recoveryAttempts ?? 0) + 1,
          lastError: message,
          lastErrorAt: toIso(this.now()),
        };
        await this.startOrResumeEmbeddedAgent(managed.session.characterId, authToken).catch(
          () => undefined,
        );
        return;
      }

      if (managed.supervisorTimer) {
        clearInterval(managed.supervisorTimer);
        managed.supervisorTimer = null;
      }
      this.updateSessionState(sessionId, {
        state: "degraded",
        failureReason: `supervisor exhausted recovery budget: ${message}`,
      });
    }
  }

  private async startStream(sessionId: string): Promise<boolean> {
    const managed = this.sessions.get(sessionId);
    if (!managed) return false;

    const upstreamBase =
      process.env.STREAM555_BASE_URL?.trim() || process.env.STREAM_API_URL?.trim();
    if (!upstreamBase) {
      this.recordAction(sessionId, "stream.skip", "STREAM555_BASE_URL is not configured");
      return false;
    }

    try {
      const token = await resolveAgentBearer(upstreamBase);
      let streamSessionId =
        this.readStreamProfileValue(managed.session, "sessionId") ||
        process.env.STREAM555_DEFAULT_SESSION_ID?.trim() ||
        null;
      if (!streamSessionId) {
        const bootstrap = await this.requestExternalJson<{ sessionId?: string }>(
          "POST",
          upstreamBase,
          "/api/agent/v1/sessions",
          token,
          {},
        );
        if (!bootstrap.ok || !bootstrap.data?.sessionId?.trim()) {
          this.recordAction(
            sessionId,
            "stream.bootstrap.failed",
            `session bootstrap failed (${bootstrap.status})`,
          );
          return false;
        }
        streamSessionId = bootstrap.data.sessionId.trim();
      }

      const inputUrl =
        process.env.MILAIDY_APP_STREAM_URL_HYPERSCAPE?.trim() ||
        process.env.MILAIDY_APP_FALLBACK_URL_HYPERSCAPE?.trim() ||
        DEFAULT_STREAM_INPUT_URL;
      const streamStart = await this.requestExternalJson<unknown>(
        "POST",
        upstreamBase,
        `/api/agent/v1/sessions/${encodeURIComponent(streamSessionId)}/stream/start`,
        token,
        {
          input: { type: "website", url: inputUrl },
          options: { scene: "default", appName: HYPERSCAPE_APP_NAME },
        },
      );
      if (!streamStart.ok) {
        this.recordAction(
          sessionId,
          "stream.start.failed",
          `stream start failed (${streamStart.status})`,
        );
        return false;
      }

      this.patchSession(sessionId, (next) => {
        const nowIso = toIso(this.now());
        next.streamStartedAt = nowIso;
        next.stream = {
          ...(next.stream ?? {
            sessionId: null,
            startedAt: null,
            interruptions: 0,
            recoveryAttempts: 0,
            lastError: null,
            lastErrorAt: null,
          }),
          sessionId: streamSessionId,
          startedAt: nowIso,
          lastError: null,
          lastErrorAt: null,
        };
      });
      this.recordAction(sessionId, "stream.start", `stream started (${streamSessionId})`);
      return true;
    } catch (error) {
      this.recordAction(sessionId, "stream.error", sanitizeError(error));
      return false;
    }
  }

  private readStreamProfileValue(
    session: HyperscapeAutonomySession,
    key: string,
  ): string | null {
    const raw = session.streamProfile?.[key];
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }

  private async listEmbeddedAgents(
    authToken: string | undefined,
  ): Promise<Array<{ agentId: string; characterId: string; name: string; position: unknown; lastActivity: number | null; entityId: string | null; state: string }>> {
    const response = await this.requestJson<HyperscapeEmbeddedAgentsPayload>(
      "GET",
      "/api/embedded-agents",
      { authToken, retryAttempts: 1 },
    );
    if (!response.ok) {
      throw new Error(`embedded-agents list failed (${response.status})`);
    }
    const source = response.data?.agents ?? response.data?.data?.agents ?? [];
    return source
      .map((agent) => ({
        agentId: agent.agentId?.trim() || "",
        characterId: agent.characterId?.trim() || "",
        name: agent.name?.trim() || "",
        position: agent.position ?? null,
        lastActivity:
          typeof agent.lastActivity === "number" ? agent.lastActivity : null,
        entityId:
          typeof agent.entityId === "string" && agent.entityId.trim().length > 0
            ? agent.entityId.trim()
            : null,
        state: agent.state?.trim().toLowerCase() || "unknown",
      }))
      .filter((agent) => agent.characterId.length > 0);
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    options?: {
      body?: unknown;
      authToken?: string;
      includeAuth?: boolean;
      timeoutMs?: number;
      retryAttempts?: number;
    },
  ): Promise<RequestJsonResponse<T>> {
    const retries = Math.max(1, options?.retryAttempts ?? 2);
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await this.performRequest<T>(
          method,
          path,
          options?.body,
          options?.includeAuth !== false
            ? normalizeAuthHeader(options?.authToken) ??
                normalizeAuthHeader(process.env.HYPERSCAPE_AUTH_TOKEN)
            : null,
          options?.timeoutMs ?? HYPERSCAPE_REQUEST_TIMEOUT_MS,
          this.getHyperscapeApiBaseUrl(),
        );
        if (
          response.ok ||
          ![408, 429, 500, 502, 503, 504].includes(response.status) ||
          attempt === retries
        ) {
          return response;
        }
      } catch (error) {
        lastError = sanitizeError(error);
        if (attempt === retries) {
          throw new Error(lastError);
        }
      }
      await sleep(300 * attempt);
    }

    throw new Error(lastError ?? "request failed");
  }

  private async requestExternalJson<T>(
    method: "GET" | "POST",
    baseUrl: string,
    path: string,
    bearerToken: string,
    body?: unknown,
  ): Promise<RequestJsonResponse<T>> {
    return this.performRequest<T>(
      method,
      path,
      body,
      normalizeAuthHeader(bearerToken),
      HYPERSCAPE_REQUEST_TIMEOUT_MS,
      baseUrl,
    );
  }

  private async performRequest<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    authorizationHeader: string | null,
    timeoutMs: number,
    baseUrl: string,
  ): Promise<RequestJsonResponse<T>> {
    const target = new URL(path, baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (authorizationHeader) {
        headers.Authorization = authorizationHeader;
      }
      let payload: string | undefined;
      if (body !== undefined && body !== null) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      const response = await fetch(target.toString(), {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      const raw = await response.text();
      let data: T | null = null;
      if (raw.trim().length > 0) {
        try {
          data = JSON.parse(raw) as T;
        } catch {
          data = null;
        }
      }
      return { ok: response.ok, status: response.status, data, raw };
    } finally {
      clearTimeout(timeout);
    }
  }

  private patchSession(
    sessionId: string,
    patcher: (session: HyperscapeAutonomySession) => void,
  ): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    patcher(managed.session);
    managed.session.updatedAt = toIso(this.now());
    this.emitSession(sessionId);
  }

  private updateSessionState(sessionId: string, update: SessionStateUpdate): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    const next = managed.session;
    const previousState = next.state;
    if (update.state && next.state !== update.state) {
      next.state = update.state;
      next.stateChangedAt = toIso(this.now());
      this.recordStateTransitionMetrics(next, previousState, update.state);
    }
    if (update.failureReason !== undefined) {
      next.failureReason = update.failureReason;
    }
    if (update.streamStarted && !next.streamStartedAt) {
      next.streamStartedAt = toIso(this.now());
    }
    if (update.stopped) {
      next.stoppedAt = toIso(this.now());
    }
    next.updatedAt = toIso(this.now());
    this.updateOperationalGauges();
    this.emitSession(sessionId);
  }

  private recordAction(sessionId: string, type: string, detail: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    const entry: HyperscapeAutonomyActionRecord = {
      at: toIso(this.now()),
      type,
      detail,
    };
    managed.session.actionHistory = [...managed.session.actionHistory.slice(-59), entry];
    if (
      !managed.session.firstActionAt &&
      this.isAutonomyProgressAction(type)
    ) {
      const nowIso = toIso(this.now());
      managed.session.firstActionAt = nowIso;
      const createdAtMs = parseIsoMillis(managed.session.createdAt);
      const firstActionAtMs = parseIsoMillis(nowIso);
      if (createdAtMs !== null && firstActionAtMs !== null) {
        metrics.histogram(
          `${HYPERSCAPE_SLO_METRIC_PREFIX}.time_to_first_action_ms`,
          Math.max(0, firstActionAtMs - createdAtMs),
          { agentId: managed.session.agentId },
        );
      }
    }
    managed.session.updatedAt = toIso(this.now());
    this.updateOperationalGauges();
    this.emitSession(sessionId);
  }

  private emitSession(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) return;
    const payload: HyperscapeAutonomyEvent = {
      type: "hyperscape-autonomy",
      event: "session-update",
      session: this.cloneSession(managed.session),
    };
    this.onEvent?.(payload);
  }

  private isAutonomyProgressAction(type: string): boolean {
    return (
      type.startsWith("goal.") ||
      type.startsWith("supervisor.") ||
      type === "agent.create"
    );
  }

  private recordStateTransitionMetrics(
    session: HyperscapeAutonomySession,
    fromState: HyperscapeAutonomySessionState,
    toState: HyperscapeAutonomySessionState,
  ): void {
    metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.state_transition_total`, 1, {
      fromState,
      toState,
      agentId: session.agentId,
    });

    const createdAtMs = parseIsoMillis(session.createdAt);
    const nowMs = this.now();
    if (toState === "in_world") {
      metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.in_world_total`, 1, {
        agentId: session.agentId,
      });
      if (createdAtMs !== null) {
        metrics.histogram(
          `${HYPERSCAPE_SLO_METRIC_PREFIX}.time_to_in_world_ms`,
          Math.max(0, nowMs - createdAtMs),
          { agentId: session.agentId },
        );
      }
      return;
    }

    if (toState === "streaming") {
      metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.stream_started_total`, 1, {
        agentId: session.agentId,
      });
      if (createdAtMs !== null) {
        metrics.histogram(
          `${HYPERSCAPE_SLO_METRIC_PREFIX}.time_to_stream_ms`,
          Math.max(0, nowMs - createdAtMs),
          { agentId: session.agentId },
        );
      }
      return;
    }

    if (toState === "degraded") {
      metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.degraded_total`, 1, {
        agentId: session.agentId,
      });
      return;
    }

    if (toState === "failed") {
      metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.failed_total`, 1, {
        agentId: session.agentId,
      });
      return;
    }

    if (toState === "stopped") {
      metrics.counter(`${HYPERSCAPE_SLO_METRIC_PREFIX}.stopped_total`, 1, {
        agentId: session.agentId,
      });
    }
  }

  private updateOperationalGauges(): void {
    const snapshot = this.getOperationalSnapshot();
    metrics.gauge(`${HYPERSCAPE_SLO_METRIC_PREFIX}.sessions_total`, snapshot.totalSessions);
    metrics.gauge(`${HYPERSCAPE_SLO_METRIC_PREFIX}.sessions_active`, snapshot.activeSessions);
    metrics.gauge(`${HYPERSCAPE_SLO_METRIC_PREFIX}.sessions_failed`, snapshot.failedSessions);
    metrics.gauge(
      `${HYPERSCAPE_SLO_METRIC_PREFIX}.sessions_degraded`,
      snapshot.degradedSessions,
    );
    for (const [state, value] of Object.entries(snapshot.states)) {
      metrics.gauge(`${HYPERSCAPE_SLO_METRIC_PREFIX}.sessions_${state}`, value);
    }
  }

  private cloneSession(session: HyperscapeAutonomySession): HyperscapeAutonomySession {
    return {
      ...session,
      actionHistory: [...session.actionHistory],
      stream: session.stream ? { ...session.stream } : null,
      streamProfile: session.streamProfile ? { ...session.streamProfile } : null,
    };
  }
}

export function resolveHyperscapeAutonomyEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.HYPERSCAPE_AUTONOMY_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return true;
}

export function resolveDefaultHyperscapeAutonomyAgentId(
  runtime: IAgentRuntime | null | undefined,
): string {
  return (
    runtime?.character?.name?.trim() ||
    (runtime?.getSetting?.("BOT_NAME") as string | undefined)?.trim() ||
    process.env.BOT_NAME?.trim() ||
    "alice"
  );
}

export function logHyperscapeAutonomyEvent(event: HyperscapeAutonomyEvent): void {
  logger.info(
    `[hyperscape-autonomy] ${event.session.sessionId} state=${event.session.state} agent=${event.session.agentId}`,
  );
}
