import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStream555AuthPlugin } from "./index.js";

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM_API_URL",
  "STREAM555_ADMIN_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM_API_BEARER_TOKEN",
  "STREAM555_AGENT_DEFAULT_USER_ID",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
] as const;

const INTERNAL_RUNTIME = { agentId: "alice-internal" } as never;
const INTERNAL_MESSAGE = {
  entityId: "alice-internal",
  content: { source: "system" },
} as never;
const INTERNAL_STATE = { values: {} } as never;

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function parseEnvelope(result: { text: string }): Record<string, unknown> {
  return JSON.parse(result.text) as Record<string, unknown>;
}

function parseFetchBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit | undefined;
  const body = init?.body;
  if (typeof body !== "string") return {};
  return JSON.parse(body) as Record<string, unknown>;
}

function resolveAction(name: string) {
  const plugin = createStream555AuthPlugin();
  const actions = plugin.actions ?? [];
  const action = actions.find((entry) => entry.name === name);
  if (!action?.handler) {
    throw new Error(`action ${name} is missing`);
  }
  return action;
}

describe("stream555-auth plugin actions", () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    envBefore = snapshotEnv();
    process.env.STREAM555_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_ADMIN_API_KEY = "admin-secret";
    process.env.STREAM555_AGENT_TOKEN = "agent-token";
    delete process.env.STREAM555_AGENT_API_KEY;
    delete process.env.STREAM_API_BEARER_TOKEN;
    delete process.env.STREAM_API_URL;
    delete process.env.STREAM555_AGENT_DEFAULT_USER_ID;
    delete process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
  });

  afterEach(() => {
    restoreEnv(envBefore);
    vi.restoreAllMocks();
  });

  it("creates API key and sets active key by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        apiKey: "sk_ag_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        keyPrefix: "sk_ag_aaaaaa",
        name: "alice-runtime",
        userId: "user-1",
        scopes: ["stream:*", "sessions:create"],
        sessionIds: ["*"],
      }),
    );

    const action = resolveAction("STREAM555_AUTH_APIKEY_CREATE");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          name: "alice-runtime",
          userId: "user-1",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/agent/v1/auth/apikeys");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-admin-key"]).toBe("admin-secret");

    expect(process.env.STREAM555_AGENT_API_KEY).toBe(
      "sk_ag_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(process.env.STREAM555_AGENT_TOKEN).toBeUndefined();

    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    expect(envelope.action).toBe("STREAM555_AUTH_APIKEY_CREATE");
  });

  it("returns runtime exception when setting invalid active API key", async () => {
    const action = resolveAction("STREAM555_AUTH_APIKEY_SET_ACTIVE");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          apiKey: "invalid-key",
        },
      } as never,
    );

    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("E_RUNTIME_EXCEPTION");
  });

  it("lists API keys with query filters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        keys: [],
        count: 0,
      }),
    );

    const action = resolveAction("STREAM555_AUTH_APIKEY_LIST");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          userId: "user-1",
          status: "active",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/agent/v1/auth/apikeys?userId=user-1&status=active");
    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
  });

  it("provisions linked wallet via bearer auth route", async () => {
    delete process.env.STREAM555_ADMIN_API_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        linkedWallet: {
          walletId: "wallet-1",
          address: "0x1234567890abcdef1234567890abcdef12345678",
          blockchain: "BASE",
        },
      }),
    );

    const action = resolveAction("STREAM555_AUTH_WALLET_PROVISION_LINKED");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          targetChain: "base",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/auth/wallets/linked");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer agent-bearer-token");
    expect(parseFetchBody(fetchMock.mock.calls[0])).toEqual({
      targetChain: "base",
    });

    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    expect(envelope.action).toBe("STREAM555_AUTH_WALLET_PROVISION_LINKED");
  });
});
