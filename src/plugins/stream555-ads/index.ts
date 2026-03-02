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
import { exceptionAction, readParam } from "../five55-shared/action-kit.js";
import {
  describeAgentAuthSource,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";

const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM_SESSION_ENV = "STREAM_SESSION_ID";
const STREAM555_SESSION_ENV = "STREAM555_DEFAULT_SESSION_ID";
const CAPABILITY_POLICY = createFive55CapabilityPolicy();

type AgentBearerSource = string | (() => Promise<string>);

let cachedAgentSessionId: string | undefined;
const adRotationIndex = new Map<string, number>();

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => {
    return Boolean(entry) && typeof entry === "object" && !Array.isArray(entry);
  });
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseIntLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return undefined;
}

function parseRetryAfterFromMessage(message: string | undefined): number | undefined {
  if (!message) return undefined;
  const match = message.match(/(\d+)\s*s/i);
  if (!match?.[1]) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}

function parseCooldownInfo(response: {
  data?: Record<string, unknown>;
  rawBody: string;
}): {
  active: boolean;
  code?: string;
  retryAfterSeconds?: number;
  nextEligibleAt?: string;
  cooldownSeconds?: number;
  hint?: string;
} {
  const code = readNonEmptyString(response.data?.code);
  const errorText = readNonEmptyString(response.data?.error) ?? response.rawBody;
  const active = code === "AD_COOLDOWN_ACTIVE"
    || Boolean(errorText && errorText.toLowerCase().includes("cooldown active"));
  return {
    active,
    code,
    retryAfterSeconds:
      parseIntLike(response.data?.retryAfterSeconds) ?? parseRetryAfterFromMessage(errorText),
    nextEligibleAt: readNonEmptyString(response.data?.nextEligibleAt),
    cooldownSeconds: parseIntLike(response.data?.cooldownSeconds),
    hint: readNonEmptyString(response.data?.hint),
  };
}

function mapFailureCode(status: number): string {
  if (status === 400) return "E_UPSTREAM_BAD_REQUEST";
  if (status === 401) return "E_UPSTREAM_UNAUTHORIZED";
  if (status === 403) return "E_UPSTREAM_FORBIDDEN";
  if (status === 404) return "E_UPSTREAM_NOT_FOUND";
  if (status === 409) return "E_UPSTREAM_CONFLICT";
  if (status === 429) return "E_UPSTREAM_RATE_LIMITED";
  if (status >= 500) return "E_UPSTREAM_SERVER";
  return "E_UPSTREAM_FAILURE";
}

function buildEnvelopeActionResult({
  ok,
  module,
  action,
  status,
  message,
  data,
  details,
  retryable,
}: {
  ok: boolean;
  module: string;
  action: string;
  status: number;
  message: string;
  data?: unknown;
  details?: unknown;
  retryable?: boolean;
}): { success: boolean; text: string } {
  return {
    success: ok,
    text: JSON.stringify({
      ok,
      code: ok ? "OK" : mapFailureCode(status),
      module,
      action,
      message,
      status,
      retryable: retryable ?? (status === 429 || status >= 500),
      ...(ok ? { data } : { details }),
    }),
  };
}

function getErrorDetail(payload: {
  data?: Record<string, unknown>;
  rawBody: string;
}): string {
  const fromData = payload.data?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  return payload.rawBody || "upstream request failed";
}

function assertAdsReadAccess(): void {
  assertFive55Capability(CAPABILITY_POLICY, "stream.read");
}

function assertAdsControlAccess(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  actionName: string,
): void {
  assertTrustedAdminForAction(runtime, message, state, actionName);
  assertFive55Capability(CAPABILITY_POLICY, "stream.control");
}

function parseCsvList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function readIntOption(value: string | undefined, fallback: number, min = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function resolveBaseUrl(): string {
  const base = trimEnv(STREAM555_BASE_ENV);
  if (!base) throw new Error(`${STREAM555_BASE_ENV} is not configured`);
  return base;
}

async function resolveAgentToken(baseUrl: string): Promise<string> {
  return resolveAgentBearer(baseUrl);
}

async function fetchJson(
  method: "GET" | "POST",
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
      const parsed = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore non-json
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
    bearerToken = await resolveToken();
    result = await executeWithToken(bearerToken);
  }
  return result;
}

async function ensureAgentSessionId(
  base: string,
  token: AgentBearerSource,
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

  const sessionId = readNonEmptyString(response.data?.sessionId);
  if (!sessionId) {
    throw new Error("session bootstrap did not return sessionId");
  }

  cachedAgentSessionId = sessionId;
  return sessionId;
}

async function listSessionAds(
  base: string,
  token: AgentBearerSource,
  sessionId: string,
): Promise<Array<Record<string, unknown>>> {
  const response = await fetchJson(
    "GET",
    base,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads`,
    token,
  );
  if (!response.ok) {
    throw new Error(
      `ads list failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }
  return asRecordArray(response.data?.ads);
}

function resolveNextAdId(
  sessionId: string,
  ads: Array<Record<string, unknown>>,
  preferredAdId?: string,
): string | undefined {
  if (preferredAdId) {
    const exactMatch = ads.find((entry) => readNonEmptyString(entry.id) === preferredAdId);
    if (exactMatch) return preferredAdId;
  }

  const candidates = ads
    .map((entry) => readNonEmptyString(entry.id))
    .filter((entry): entry is string => Boolean(entry));
  if (candidates.length === 0) return undefined;

  const index = adRotationIndex.get(sessionId) ?? 0;
  const resolved = candidates[index % candidates.length];
  adRotationIndex.set(sessionId, (index + 1) % candidates.length);
  return resolved;
}

async function triggerAdAndAwaitRender(
  base: string,
  token: AgentBearerSource,
  sessionId: string,
  adId: string,
  durationMs?: number,
): Promise<{
  triggered: boolean;
  rendered: boolean;
  detail?: string;
  status: number;
  cooldownActive?: boolean;
  retryAfterSeconds?: number;
  nextEligibleAt?: string;
  cooldownSeconds?: number;
  upstreamCode?: string;
  attempts?: number;
}> {
  const triggerEndpoint = `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/${encodeURIComponent(adId)}/trigger`;
  const maxAttempts = 2;
  const maxCooldownRetrySeconds = 5;

  let triggerResponse:
    | {
      ok: boolean;
      status: number;
      data?: Record<string, unknown>;
      rawBody: string;
    }
    | undefined;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    triggerResponse = await fetchJson(
      "POST",
      base,
      triggerEndpoint,
      token,
      Number.isFinite(durationMs) ? { durationMs } : {},
    );
    if (triggerResponse.ok) break;

    const cooldown = parseCooldownInfo(triggerResponse);
    const canRetryCooldown =
      cooldown.active
      && attempts < maxAttempts
      && typeof cooldown.retryAfterSeconds === "number"
      && cooldown.retryAfterSeconds <= maxCooldownRetrySeconds;
    if (!canRetryCooldown) {
      return {
        triggered: false,
        rendered: false,
        status: triggerResponse.status,
        detail: `ad trigger failed (${triggerResponse.status}): ${getErrorDetail(triggerResponse)}`,
        cooldownActive: cooldown.active,
        retryAfterSeconds: cooldown.retryAfterSeconds,
        nextEligibleAt: cooldown.nextEligibleAt,
        cooldownSeconds: cooldown.cooldownSeconds,
        upstreamCode: cooldown.code,
        attempts,
      };
    }

    const waitMs = Math.max(0, cooldown.retryAfterSeconds * 1000);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (!triggerResponse || !triggerResponse.ok) {
    return {
      triggered: false,
      rendered: false,
      status: triggerResponse?.status ?? 500,
      detail: `ad trigger failed (${triggerResponse?.status ?? 500}): ${getErrorDetail(triggerResponse ?? { rawBody: "unknown trigger failure" })}`,
      attempts,
    };
  }

  const expectedGraphicId = readNonEmptyString(triggerResponse.data?.graphic?.id);
  const timeoutMs = 9_000;
  const pollMs = 600;
  const startedAt = Date.now();
  let detail = "render acknowledgement pending";

  while (Date.now() - startedAt < timeoutMs) {
    const activeResponse = await fetchJson(
      "GET",
      base,
      `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/active`,
      token,
    );

    if (!activeResponse.ok) {
      detail = `active ad lookup failed (${activeResponse.status}): ${getErrorDetail(activeResponse)}`;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }

    const active = asRecord(activeResponse.data?.active);
    const activeAdId = readNonEmptyString(active?.adId);
    const activeGraphicId = readNonEmptyString(active?.graphicId);
    const renderAcked = active?.renderAcked === true;

    if (!active) {
      detail = "ad became inactive before render acknowledgement";
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }
    if (activeAdId !== adId) {
      detail = `active ad mismatch (expected ${adId}, saw ${activeAdId ?? "none"})`;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }
    if (expectedGraphicId && activeGraphicId && activeGraphicId !== expectedGraphicId) {
      detail = `graphic mismatch (expected ${expectedGraphicId}, saw ${activeGraphicId})`;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      continue;
    }
    if (renderAcked) {
      return { triggered: true, rendered: true, status: 200, attempts };
    }

    detail = "render acknowledgement pending";
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return {
    triggered: true,
    rendered: false,
    status: 504,
    detail,
    attempts,
  };
}

const stream555AdsProvider: Provider = {
  name: "stream555Ads",
  description:
    "Dedicated livestream ads surface for campaign loading, rotation, trigger status, and earnings.",
  dynamic: true,
  get: async (): Promise<ProviderResult> => {
    const configured = Boolean(trimEnv(STREAM555_BASE_ENV) && isAgentAuthConfigured());
    return {
      text: [
        "Stream555 Ads plugin status:",
        `Configured: ${configured ? "yes" : "no"}`,
        `Base env: ${trimEnv(STREAM555_BASE_ENV) ?? "unset"}`,
        `Auth source: ${describeAgentAuthSource()}`,
        "Actions: STREAM555_ADS_SETUP_DEFAULTS, STREAM555_ADS_ROTATION_START, STREAM555_ADS_TRIGGER_NEXT, STREAM555_ADS_STATUS, STREAM555_ADS_EARNINGS",
      ].join("\n"),
      values: {
        configured,
      },
      data: {
        configured,
      },
    };
  },
};

const setupDefaultsAction: Action = {
  name: "STREAM555_ADS_SETUP_DEFAULTS",
  similes: [
    "STREAM555_ADS_SETUP",
    "STREAM555_ADS_BOOTSTRAP",
    "STREAM555_LOAD_CAMPAIGNS",
  ],
  description:
    "Bootstraps campaign-backed ads for the current session by evaluating, accepting, and loading marketplace campaigns.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertAdsControlAccess(runtime, message, state, "STREAM555_ADS_SETUP_DEFAULTS");
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const categories = parseCsvList(
        readParam(options as HandlerOptions | undefined, "categories"),
      );
      const limit = Math.min(
        6,
        readIntOption(
          readParam(options as HandlerOptions | undefined, "limit"),
          4,
          1,
        ),
      );
      const durationMs = readIntOption(
        readParam(options as HandlerOptions | undefined, "durationMs"),
        0,
        0,
      );

      const base = resolveBaseUrl();
      const tokenProvider = async (): Promise<string> => resolveAgentToken(base);
      const sessionId = await ensureAgentSessionId(base, tokenProvider, requestedSessionId);

      const evaluateResponse = await fetchJson(
        "POST",
        base,
        "/api/agent/v1/marketplace/evaluate",
        tokenProvider,
        {
          ...(categories ? { categories } : {}),
          limit,
          poolSize: Math.max(limit * 3, 18),
        },
      );
      if (!evaluateResponse.ok) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.ads",
          action: "STREAM555_ADS_SETUP_DEFAULTS",
          status: evaluateResponse.status,
          message: "marketplace evaluation failed",
          details: {
            error: getErrorDetail(evaluateResponse),
          },
        });
      }

      const evaluated = asRecordArray(evaluateResponse.data?.evaluated);
      const selectedCampaignIds = evaluated
        .filter((entry) => entry.eligible !== false)
        .map((entry) => readNonEmptyString(entry.campaignId))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, limit);

      const loadedCampaigns: Array<{
        campaignId: string;
        adId?: string;
        deduped: boolean;
      }> = [];
      const failures: Array<{
        campaignId: string;
        stage: "accept" | "load";
        status: number;
        detail: string;
      }> = [];

      for (const campaignId of selectedCampaignIds) {
        const acceptResponse = await fetchJson(
          "POST",
          base,
          `/api/agent/v1/marketplace/campaigns/${encodeURIComponent(campaignId)}/accept`,
          tokenProvider,
          {},
        );
        if (!acceptResponse.ok) {
          failures.push({
            campaignId,
            stage: "accept",
            status: acceptResponse.status,
            detail: getErrorDetail(acceptResponse),
          });
          continue;
        }

        const loadResponse = await fetchJson(
          "POST",
          base,
          `/api/agent/v1/marketplace/sessions/${encodeURIComponent(sessionId)}/campaigns/${encodeURIComponent(campaignId)}/load`,
          tokenProvider,
          Number.isFinite(durationMs) && durationMs > 0 ? { duration: durationMs } : {},
        );
        if (!loadResponse.ok) {
          failures.push({
            campaignId,
            stage: "load",
            status: loadResponse.status,
            detail: getErrorDetail(loadResponse),
          });
          continue;
        }

        loadedCampaigns.push({
          campaignId,
          adId: readNonEmptyString(asRecord(loadResponse.data?.ad)?.id),
          deduped: loadResponse.data?.deduped === true,
        });
      }

      const ads = await listSessionAds(base, tokenProvider, sessionId);
      if (ads.length === 0) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.ads",
          action: "STREAM555_ADS_SETUP_DEFAULTS",
          status: 502,
          message: "no ads available after setup",
          details: {
            selectedCampaignIds,
            loadedCampaigns,
            failures,
          },
        });
      }

      return buildEnvelopeActionResult({
        ok: true,
        module: "stream555.ads",
        action: "STREAM555_ADS_SETUP_DEFAULTS",
        status: 200,
        message: "campaign-backed ad defaults ready",
        data: {
          sessionId,
          selectedCampaignIds,
          loadedCampaigns,
          failures,
          adCount: ads.length,
        },
      });
    } catch (err) {
      return exceptionAction("stream555.ads", "STREAM555_ADS_SETUP_DEFAULTS", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "categories", description: "Optional campaign categories csv", required: false, schema: { type: "string" as const } },
    { name: "limit", description: "Number of campaigns to load (1-6)", required: false, schema: { type: "string" as const } },
    { name: "durationMs", description: "Optional campaign ad duration override", required: false, schema: { type: "string" as const } },
  ],
};

const rotationStartAction: Action = {
  name: "STREAM555_ADS_ROTATION_START",
  similes: [
    "STREAM555_ADS_SCHEDULE_ROTATION",
    "STREAM555_ADS_AUTO_ROTATE",
  ],
  description:
    "Schedules rotation entries for ads in the current session using default cooldown cadence.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertAdsControlAccess(runtime, message, state, "STREAM555_ADS_ROTATION_START");
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const intervalSeconds = Math.max(
        60,
        readIntOption(
          readParam(options as HandlerOptions | undefined, "intervalSeconds"),
          300,
          60,
        ),
      );
      const maxAds = Math.min(
        6,
        readIntOption(
          readParam(options as HandlerOptions | undefined, "limit"),
          3,
          1,
        ),
      );

      const base = resolveBaseUrl();
      const tokenProvider = async (): Promise<string> => resolveAgentToken(base);
      const sessionId = await ensureAgentSessionId(base, tokenProvider, requestedSessionId);
      const ads = await listSessionAds(base, tokenProvider, sessionId);
      const adIds = ads
        .map((entry) => readNonEmptyString(entry.id))
        .filter((entry): entry is string => Boolean(entry))
        .slice(0, maxAds);

      if (adIds.length === 0) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.ads",
          action: "STREAM555_ADS_ROTATION_START",
          status: 404,
          message: "no ads available to schedule",
        });
      }

      const nowMs = Date.now();
      const schedules: Array<{ adId: string; scheduleId?: string }> = [];
      const failures: Array<{ adId: string; status: number; detail: string }> = [];
      for (let index = 0; index < adIds.length; index += 1) {
        const adId = adIds[index];
        const startTime = new Date(nowMs + (index + 1) * intervalSeconds * 1000).toISOString();
        const scheduleResponse = await fetchJson(
          "POST",
          base,
          `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/schedule`,
          tokenProvider,
          {
            adId,
            startTime,
          },
        );
        if (!scheduleResponse.ok) {
          failures.push({
            adId,
            status: scheduleResponse.status,
            detail: getErrorDetail(scheduleResponse),
          });
          continue;
        }
        const schedule = asRecord(scheduleResponse.data?.schedule);
        schedules.push({
          adId,
          scheduleId: readNonEmptyString(schedule?.id),
        });
      }

      return buildEnvelopeActionResult({
        ok: failures.length === 0,
        module: "stream555.ads",
        action: "STREAM555_ADS_ROTATION_START",
        status: failures.length === 0 ? 200 : 207,
        message: failures.length === 0
          ? "ad rotation scheduled"
          : "ad rotation scheduled with partial failures",
        ...(failures.length === 0
          ? { data: { sessionId, schedules, intervalSeconds } }
          : { details: { sessionId, schedules, failures, intervalSeconds } }),
      });
    } catch (err) {
      return exceptionAction("stream555.ads", "STREAM555_ADS_ROTATION_START", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "intervalSeconds", description: "Rotation interval seconds (default 300)", required: false, schema: { type: "string" as const } },
    { name: "limit", description: "Max ads to schedule (1-6)", required: false, schema: { type: "string" as const } },
  ],
};

const triggerNextAction: Action = {
  name: "STREAM555_ADS_TRIGGER_NEXT",
  similes: [
    "STREAM555_ADS_TRIGGER",
    "STREAM555_ADS_PLAY_NEXT",
  ],
  description:
    "Triggers the next ad in session rotation and waits for render acknowledgement.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertAdsControlAccess(runtime, message, state, "STREAM555_ADS_TRIGGER_NEXT");
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const preferredAdId = readParam(options as HandlerOptions | undefined, "adId");
      const durationMs = readIntOption(
        readParam(options as HandlerOptions | undefined, "durationMs"),
        0,
        0,
      );

      const base = resolveBaseUrl();
      const tokenProvider = async (): Promise<string> => resolveAgentToken(base);
      const sessionId = await ensureAgentSessionId(base, tokenProvider, requestedSessionId);
      const ads = await listSessionAds(base, tokenProvider, sessionId);
      const adId = resolveNextAdId(sessionId, ads, preferredAdId);
      if (!adId) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.ads",
          action: "STREAM555_ADS_TRIGGER_NEXT",
          status: 404,
          message: "no ads available for trigger",
        });
      }

      const triggerResult = await triggerAdAndAwaitRender(
        base,
        tokenProvider,
        sessionId,
        adId,
        durationMs > 0 ? durationMs : undefined,
      );
      if (!triggerResult.triggered || !triggerResult.rendered) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.ads",
          action: "STREAM555_ADS_TRIGGER_NEXT",
          status: triggerResult.status,
          message: "ad trigger did not render successfully",
          retryable: triggerResult.cooldownActive ? true : undefined,
          details: {
            sessionId,
            adId,
            ...triggerResult,
          },
        });
      }

      return buildEnvelopeActionResult({
        ok: true,
        module: "stream555.ads",
        action: "STREAM555_ADS_TRIGGER_NEXT",
        status: 200,
        message: "ad triggered and render acknowledged",
        data: {
          sessionId,
          adId,
          ...triggerResult,
        },
      });
    } catch (err) {
      return exceptionAction("stream555.ads", "STREAM555_ADS_TRIGGER_NEXT", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
    { name: "adId", description: "Optional explicit ad id", required: false, schema: { type: "string" as const } },
    { name: "durationMs", description: "Optional ad duration override", required: false, schema: { type: "string" as const } },
  ],
};

const statusAction: Action = {
  name: "STREAM555_ADS_STATUS",
  similes: [
    "STREAM555_ADS_HEALTH",
    "STREAM555_ADS_RUNTIME",
  ],
  description:
    "Returns ads inventory, active ad runtime state, cooldown, and marketplace earnings snapshot.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, options) => {
    try {
      assertAdsReadAccess();
      const requestedSessionId = readParam(
        options as HandlerOptions | undefined,
        "sessionId",
      );
      const base = resolveBaseUrl();
      const tokenProvider = async (): Promise<string> => resolveAgentToken(base);
      const sessionId = await ensureAgentSessionId(base, tokenProvider, requestedSessionId);
      const ads = await listSessionAds(base, tokenProvider, sessionId);

      const activeResponse = await fetchJson(
        "GET",
        base,
        `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/active`,
        tokenProvider,
      );
      const activePayload = activeResponse.ok
        ? {
            active: activeResponse.data?.active ?? null,
            runtime: activeResponse.data?.runtime ?? null,
          }
        : {
            active: null,
            runtime: null,
            error: getErrorDetail(activeResponse),
          };

      const earningsResponse = await fetchJson(
        "GET",
        base,
        "/api/agent/v1/marketplace/earnings",
        tokenProvider,
      );
      const earnings = earningsResponse.ok
        ? earningsResponse.data?.earnings ?? null
        : null;
      const earningsError = earningsResponse.ok ? null : getErrorDetail(earningsResponse);

      return buildEnvelopeActionResult({
        ok: true,
        module: "stream555.ads",
        action: "STREAM555_ADS_STATUS",
        status: 200,
        message: "ads runtime status loaded",
        data: {
          sessionId,
          adCount: ads.length,
          ads,
          ...activePayload,
          earnings,
          earningsError,
        },
      });
    } catch (err) {
      return exceptionAction("stream555.ads", "STREAM555_ADS_STATUS", err);
    }
  },
  parameters: [
    { name: "sessionId", description: "Optional session id", required: false, schema: { type: "string" as const } },
  ],
};

const earningsAction: Action = {
  name: "STREAM555_ADS_EARNINGS",
  similes: [
    "STREAM555_MARKETPLACE_EARNINGS",
    "STREAM555_AD_REVENUE",
  ],
  description:
    "Returns realized marketplace earnings for the authenticated agent owner.",
  validate: async () => true,
  handler: async () => {
    try {
      assertAdsReadAccess();
      const base = resolveBaseUrl();
      const tokenProvider = async (): Promise<string> => resolveAgentToken(base);
      const earningsResponse = await fetchJson(
        "GET",
        base,
        "/api/agent/v1/marketplace/earnings",
        tokenProvider,
      );
      if (!earningsResponse.ok) {
        return buildEnvelopeActionResult({
          ok: false,
          module: "stream555.ads",
          action: "STREAM555_ADS_EARNINGS",
          status: earningsResponse.status,
          message: "failed to fetch earnings",
          details: {
            error: getErrorDetail(earningsResponse),
          },
        });
      }

      return buildEnvelopeActionResult({
        ok: true,
        module: "stream555.ads",
        action: "STREAM555_ADS_EARNINGS",
        status: 200,
        message: "earnings loaded",
        data: {
          earnings: earningsResponse.data?.earnings ?? null,
        },
      });
    } catch (err) {
      return exceptionAction("stream555.ads", "STREAM555_ADS_EARNINGS", err);
    }
  },
  parameters: [],
};

export function createStream555AdsPlugin(): Plugin {
  return {
    name: "stream555-ads",
    description:
      "Dedicated livestream ads plugin for campaign loading, ad rotation, render-verified triggering, and earnings visibility.",
    providers: [stream555AdsProvider],
    actions: [
      setupDefaultsAction,
      rotationStartAction,
      triggerNextAction,
      statusAction,
      earningsAction,
    ],
    evaluators: [],
    services: [],
  };
}
