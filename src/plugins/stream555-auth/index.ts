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
  STREAM555_AGENT_API_KEY_ENV,
  STREAM555_AGENT_TOKEN_ENV,
  STREAM_API_BEARER_TOKEN_ENV,
  describeAgentAuthSource,
  invalidateExchangedAgentTokenCache,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";

const MODULE = "stream555.auth";
const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM_API_ENV = "STREAM_API_URL";
const STREAM555_ADMIN_API_KEY_ENV = "STREAM555_ADMIN_API_KEY";
const STREAM555_AGENT_DEFAULT_USER_ID_ENV = "STREAM555_AGENT_DEFAULT_USER_ID";

type JsonObject = Record<string, unknown>;

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function resolveBaseUrl(): string {
  const base = trimEnv(STREAM555_BASE_ENV) || trimEnv(STREAM_API_ENV);
  if (!base) {
    throw new Error(
      `${STREAM555_BASE_ENV} (or ${STREAM_API_ENV}) must be configured`,
    );
  }
  return base;
}

function resolveBaseEnvSource(): string {
  if (trimEnv(STREAM555_BASE_ENV)) return STREAM555_BASE_ENV;
  if (trimEnv(STREAM_API_ENV)) return STREAM_API_ENV;
  return `${STREAM555_BASE_ENV}|${STREAM_API_ENV}`;
}

function assertStreamReadAccess(): void {
  assertFive55Capability(CAPABILITY_POLICY, "stream.read");
}

function assertStreamControlAccess(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  actionName: string,
): void {
  assertTrustedAdminForAction(runtime, message, state, actionName);
  assertFive55Capability(CAPABILITY_POLICY, "stream.control");
}

async function requestJson(
  method: "GET" | "POST" | "DELETE",
  base: string,
  endpoint: string,
  headers: Record<string, string>,
  body?: JsonObject,
): Promise<{
  ok: boolean;
  status: number;
  data?: JsonObject;
  rawBody: string;
}> {
  const target = new URL(endpoint, base);
  const response = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });

  const rawBody = await response.text();
  let data: JsonObject | undefined;
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as JsonObject;
    }
  } catch {
    // non-json response
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawBody,
  };
}

function getErrorDetail(result: { data?: JsonObject; rawBody: string }): string {
  const fromData = result.data?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  return result.rawBody || "upstream request failed";
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

function buildEnvelope({
  ok,
  action,
  status,
  message,
  data,
  details,
}: {
  ok: boolean;
  action: string;
  status: number;
  message: string;
  data?: unknown;
  details?: unknown;
}): { success: boolean; text: string } {
  return {
    success: ok,
    text: JSON.stringify({
      ok,
      code: ok ? "OK" : mapFailureCode(status),
      module: MODULE,
      action,
      message,
      status,
      retryable: status === 429 || status >= 500,
      ...(ok ? { data } : { details }),
    }),
  };
}

async function resolveManagementHeaders(
  base: string,
): Promise<Record<string, string>> {
  const adminKey = trimEnv(STREAM555_ADMIN_API_KEY_ENV);
  if (adminKey) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    };
  }

  const bearer = await resolveAgentBearer(base);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  };
}

async function resolveBearerHeaders(
  base: string,
): Promise<Record<string, string>> {
  const bearer = await resolveAgentBearer(base);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  };
}

function setActiveApiKey(apiKey: string): void {
  process.env[STREAM555_AGENT_API_KEY_ENV] = apiKey;
  delete process.env[STREAM555_AGENT_TOKEN_ENV];
  delete process.env[STREAM_API_BEARER_TOKEN_ENV];
  invalidateExchangedAgentTokenCache();
}

const stream555AuthProvider: Provider = {
  name: "stream555Auth",
  description:
    "555stream agent auth controls (API key lifecycle + linked wallet provisioning via sw4p).",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const baseConfigured = Boolean(
      trimEnv(STREAM555_BASE_ENV) || trimEnv(STREAM_API_ENV),
    );
    const adminConfigured = Boolean(trimEnv(STREAM555_ADMIN_API_KEY_ENV));
    const authConfigured = isAgentAuthConfigured();
    return {
      text: [
        "## 555stream Auth Surface",
        "",
        "Actions: STREAM555_AUTH_APIKEY_CREATE, STREAM555_AUTH_APIKEY_LIST, STREAM555_AUTH_APIKEY_REVOKE, STREAM555_AUTH_APIKEY_SET_ACTIVE, STREAM555_AUTH_WALLET_PROVISION_LINKED",
        `Base configured: ${baseConfigured ? "yes" : "no"} (${resolveBaseEnvSource()})`,
        `Admin API key configured: ${adminConfigured ? "yes" : "no"} (${STREAM555_ADMIN_API_KEY_ENV})`,
        `Agent auth configured: ${authConfigured ? "yes" : "no"} (${describeAgentAuthSource()})`,
      ].join("\n"),
    };
  },
};

const createApiKeyAction: Action = {
  name: "STREAM555_AUTH_APIKEY_CREATE",
  similes: [
    "STREAM555_CREATE_API_KEY",
    "STREAM555_AUTH_CREATE_KEY",
    "STREAM555_AGENT_KEY_CREATE",
  ],
  description:
    "Creates a new 555stream agent API key and can optionally set it active in local runtime env.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_CREATE",
      );
      const base = resolveBaseUrl();
      const headers = await resolveManagementHeaders(base);
      const name =
        readParam(options as HandlerOptions | undefined, "name") ||
        "milaidy-agent-key";
      const userId =
        readParam(options as HandlerOptions | undefined, "userId") ||
        trimEnv(STREAM555_AGENT_DEFAULT_USER_ID_ENV);
      const agentId = readParam(options as HandlerOptions | undefined, "agentId");
      const scopes = parseCsv(
        readParam(options as HandlerOptions | undefined, "scopes"),
      );
      const sessionIds = parseCsv(
        readParam(options as HandlerOptions | undefined, "sessionIds"),
      );
      const expiresIn = readParam(
        options as HandlerOptions | undefined,
        "expiresIn",
      );
      const spendLimitTotalRaw = readParam(
        options as HandlerOptions | undefined,
        "spendLimitTotal",
      );
      const maxLeaseMinutesRaw = readParam(
        options as HandlerOptions | undefined,
        "maxLeaseMinutes",
      );
      const setActive = parseBoolean(
        readParam(options as HandlerOptions | undefined, "setActive"),
        true,
      );
      const revealApiKey = parseBoolean(
        readParam(options as HandlerOptions | undefined, "revealApiKey"),
        false,
      );

      const spendLimitTotal = spendLimitTotalRaw
        ? Number.parseFloat(spendLimitTotalRaw)
        : undefined;
      const maxLeaseMinutes = maxLeaseMinutesRaw
        ? Number.parseInt(maxLeaseMinutesRaw, 10)
        : undefined;

      const payload: JsonObject = {
        name,
        ...(userId ? { userId } : {}),
        ...(agentId ? { agentId } : {}),
        ...(scopes ? { scopes } : {}),
        ...(sessionIds ? { sessionIds } : {}),
        ...(expiresIn ? { expiresIn } : {}),
        ...(Number.isFinite(spendLimitTotal)
          ? { spendLimitTotal }
          : {}),
        ...(Number.isFinite(maxLeaseMinutes)
          ? { maxLeaseMinutes }
          : {}),
      };

      const response = await requestJson(
        "POST",
        base,
        "/api/agent/v1/auth/apikeys",
        headers,
        payload,
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_APIKEY_CREATE",
          status: response.status || 502,
          message: `api key creation failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }

      const rawApiKey =
        typeof response.data?.apiKey === "string" ? response.data.apiKey : null;
      if (setActive && rawApiKey) {
        setActiveApiKey(rawApiKey);
      }

      const data: JsonObject = {
        keyPrefix:
          typeof response.data?.keyPrefix === "string"
            ? response.data.keyPrefix
            : null,
        name: typeof response.data?.name === "string" ? response.data.name : name,
        userId:
          typeof response.data?.userId === "string"
            ? response.data.userId
            : userId ?? null,
        agentId:
          typeof response.data?.agentId === "string"
            ? response.data.agentId
            : agentId ?? null,
        scopes: Array.isArray(response.data?.scopes)
          ? response.data?.scopes
          : null,
        sessionIds: Array.isArray(response.data?.sessionIds)
          ? response.data?.sessionIds
          : null,
        expiresAt:
          typeof response.data?.expiresAt === "string"
            ? response.data.expiresAt
            : null,
        activeApiKeySet: Boolean(setActive && rawApiKey),
        authSource: describeAgentAuthSource(),
      };
      if (revealApiKey && rawApiKey) {
        data.apiKey = rawApiKey;
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_CREATE",
        status: response.status,
        message: "api key created",
        data,
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_CREATE", err);
    }
  },
  parameters: [
    { name: "name", description: "Key label", required: true, schema: { type: "string" as const } },
    { name: "userId", description: "Owner user id (optional if admin token infers it)", required: false, schema: { type: "string" as const } },
    { name: "agentId", description: "Optional fixed agent id for issued JWTs", required: false, schema: { type: "string" as const } },
    { name: "scopes", description: "Comma-separated scopes", required: false, schema: { type: "string" as const } },
    { name: "sessionIds", description: "Comma-separated session ids", required: false, schema: { type: "string" as const } },
    { name: "expiresIn", description: "TTL like 30d, 24h", required: false, schema: { type: "string" as const } },
    { name: "spendLimitTotal", description: "Optional lifetime credit cap", required: false, schema: { type: "string" as const } },
    { name: "maxLeaseMinutes", description: "Optional max lease duration (minutes)", required: false, schema: { type: "string" as const } },
    { name: "setActive", description: "Set created key into local runtime env (default true)", required: false, schema: { type: "string" as const } },
    { name: "revealApiKey", description: "Include raw apiKey in response (default false)", required: false, schema: { type: "string" as const } },
  ],
};

const listApiKeysAction: Action = {
  name: "STREAM555_AUTH_APIKEY_LIST",
  similes: [
    "STREAM555_LIST_API_KEYS",
    "STREAM555_AUTH_LIST_KEYS",
    "STREAM555_AGENT_KEY_LIST",
  ],
  description: "Lists 555stream agent API keys (metadata only).",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_LIST",
      );
      const base = resolveBaseUrl();
      const headers = await resolveManagementHeaders(base);
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      const status = readParam(options as HandlerOptions | undefined, "status");
      const query = new URLSearchParams();
      if (userId) query.set("userId", userId);
      if (status) query.set("status", status);
      const endpoint = `/api/agent/v1/auth/apikeys${query.toString() ? `?${query.toString()}` : ""}`;
      const response = await requestJson("GET", base, endpoint, headers);
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_APIKEY_LIST",
          status: response.status || 502,
          message: `api key list failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_LIST",
        status: response.status,
        message: "api keys fetched",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_LIST", err);
    }
  },
  parameters: [
    { name: "userId", description: "Optional key owner user id filter", required: false, schema: { type: "string" as const } },
    { name: "status", description: "active|revoked", required: false, schema: { type: "string" as const } },
  ],
};

const revokeApiKeyAction: Action = {
  name: "STREAM555_AUTH_APIKEY_REVOKE",
  similes: [
    "STREAM555_REVOKE_API_KEY",
    "STREAM555_AUTH_REVOKE_KEY",
    "STREAM555_AGENT_KEY_REVOKE",
  ],
  description: "Revokes a 555stream agent API key by id.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_REVOKE",
      );
      const keyId = readParam(options as HandlerOptions | undefined, "keyId");
      if (!keyId) throw new Error("keyId is required");
      const base = resolveBaseUrl();
      const headers = await resolveManagementHeaders(base);
      const response = await requestJson(
        "DELETE",
        base,
        `/api/agent/v1/auth/apikeys/${encodeURIComponent(keyId)}`,
        headers,
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_APIKEY_REVOKE",
          status: response.status || 502,
          message: `api key revoke failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_REVOKE",
        status: response.status,
        message: "api key revoked",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_REVOKE", err);
    }
  },
  parameters: [
    { name: "keyId", description: "API key record id", required: true, schema: { type: "string" as const } },
  ],
};

const setActiveApiKeyAction: Action = {
  name: "STREAM555_AUTH_APIKEY_SET_ACTIVE",
  similes: [
    "STREAM555_SET_ACTIVE_API_KEY",
    "STREAM555_AUTH_SET_KEY",
    "STREAM555_AGENT_KEY_SET",
  ],
  description:
    "Sets STREAM555_AGENT_API_KEY in the current runtime and optionally validates token exchange.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_SET_ACTIVE",
      );
      const apiKey = readParam(options as HandlerOptions | undefined, "apiKey");
      if (!apiKey) throw new Error("apiKey is required");
      if (!apiKey.startsWith("sk_ag_")) {
        throw new Error("apiKey must use sk_ag_ prefix");
      }
      const verifyExchange = parseBoolean(
        readParam(options as HandlerOptions | undefined, "verifyExchange"),
        true,
      );

      const previousApiKey = process.env[STREAM555_AGENT_API_KEY_ENV];
      const previousToken = process.env[STREAM555_AGENT_TOKEN_ENV];
      const previousLegacyToken = process.env[STREAM_API_BEARER_TOKEN_ENV];

      setActiveApiKey(apiKey);

      if (verifyExchange) {
        try {
          const base = resolveBaseUrl();
          await resolveAgentBearer(base);
        } catch (err) {
          if (previousApiKey !== undefined) {
            process.env[STREAM555_AGENT_API_KEY_ENV] = previousApiKey;
          } else {
            delete process.env[STREAM555_AGENT_API_KEY_ENV];
          }
          if (previousToken !== undefined) {
            process.env[STREAM555_AGENT_TOKEN_ENV] = previousToken;
          } else {
            delete process.env[STREAM555_AGENT_TOKEN_ENV];
          }
          if (previousLegacyToken !== undefined) {
            process.env[STREAM_API_BEARER_TOKEN_ENV] = previousLegacyToken;
          } else {
            delete process.env[STREAM_API_BEARER_TOKEN_ENV];
          }
          invalidateExchangedAgentTokenCache();
          throw err;
        }
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_SET_ACTIVE",
        status: 200,
        message: "active api key updated",
        data: {
          authSource: describeAgentAuthSource(),
          verifyExchange,
        },
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_SET_ACTIVE", err);
    }
  },
  parameters: [
    { name: "apiKey", description: "Raw API key (sk_ag_...)", required: true, schema: { type: "string" as const } },
    { name: "verifyExchange", description: "Verify token exchange after setting (default true)", required: false, schema: { type: "string" as const } },
  ],
};

const provisionLinkedWalletAction: Action = {
  name: "STREAM555_AUTH_WALLET_PROVISION_LINKED",
  similes: [
    "STREAM555_WALLET_PROVISION_LINKED",
    "STREAM555_AUTH_LINKED_WALLET",
    "STREAM555_SW4P_LINKED_WALLET",
  ],
  description:
    "Requests linked-wallet provisioning through control-plane auth route backed by sw4p WaaS.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_WALLET_PROVISION_LINKED",
      );
      assertStreamReadAccess();
      const base = resolveBaseUrl();
      const headers = await resolveBearerHeaders(base);
      const targetChain = readParam(
        options as HandlerOptions | undefined,
        "targetChain",
      );
      const response = await requestJson(
        "POST",
        base,
        "/api/auth/wallets/linked",
        headers,
        {
          ...(targetChain ? { targetChain } : {}),
        },
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_PROVISION_LINKED",
          status: response.status || 502,
          message: `linked wallet provisioning failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_WALLET_PROVISION_LINKED",
        status: response.status,
        message: "linked wallet provisioned",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_WALLET_PROVISION_LINKED", err);
    }
  },
  parameters: [
    { name: "targetChain", description: "base|eth|polygon|arbitrum (optional)", required: false, schema: { type: "string" as const } },
  ],
};

export function createStream555AuthPlugin(): Plugin {
  return {
    name: "stream555-auth",
    description:
      "555stream auth + wallet provisioning controls for API key lifecycle and sw4p linked wallets.",
    providers: [stream555AuthProvider],
    actions: [
      createApiKeyAction,
      listApiKeysAction,
      revokeApiKeyAction,
      setActiveApiKeyAction,
      provisionLinkedWalletAction,
    ],
  };
}

export default createStream555AuthPlugin;
