import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStream555AuthPlugin } from "./index.js";

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM_API_URL",
  "STREAM555_PUBLIC_BASE_URL",
  "STREAM555_INTERNAL_BASE_URL",
  "STREAM555_INTERNAL_AGENT_IDS",
  "STREAM555_ADMIN_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM_API_BEARER_TOKEN",
  "STREAM555_AGENT_DEFAULT_USER_ID",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
  "STREAM555_WALLET_AUTH_PREFERRED_CHAIN",
  "STREAM555_WALLET_AUTH_ALLOW_PROVISION",
  "STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
] as const;

const INTERNAL_STATE = { values: {} } as never;

function makeRuntime(agentId = "alice-internal") {
  return {
    agentId,
    getSetting: (key: string) => process.env[key],
  } as never;
}

function makeMessage(agentId = "alice-internal") {
  return {
    entityId: agentId,
    content: { source: "system" },
  } as never;
}

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

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Buffer): string {
  if (bytes.length === 0) return "";
  let value = BigInt(`0x${bytes.toString("hex")}`);
  const output: string[] = [];
  while (value > 0n) {
    const mod = Number(value % 58n);
    output.unshift(BASE58_ALPHABET[mod] ?? "");
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) output.unshift("1");
    else break;
  }
  return output.join("") || "1";
}

function generateSolanaPrivateKey(): string {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privBytes = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const pubBytes = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const seed = privBytes.subarray(16, 48);
  const pubRaw = pubBytes.subarray(12, 44);
  return base58Encode(Buffer.concat([seed, pubRaw]));
}

const TEST_EVM_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945382db6a20db9f0f5ebf57a9df85f7f9c3d3";

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
    process.env.STREAM555_PUBLIC_BASE_URL = "https://stream.rndrntwrk.com";
    process.env.STREAM555_INTERNAL_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_INTERNAL_AGENT_IDS = "alice,alice-internal";
    process.env.STREAM555_ADMIN_API_KEY = "admin-secret";
    process.env.STREAM555_AGENT_TOKEN = "agent-token";
    delete process.env.STREAM555_AGENT_API_KEY;
    delete process.env.STREAM_API_BEARER_TOKEN;
    delete process.env.STREAM_API_URL;
    delete process.env.STREAM555_AGENT_DEFAULT_USER_ID;
    delete process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
    delete process.env.STREAM555_WALLET_AUTH_PREFERRED_CHAIN;
    delete process.env.STREAM555_WALLET_AUTH_ALLOW_PROVISION;
    delete process.env.STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN;
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
      makeRuntime(),
      makeMessage(),
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
      makeRuntime(),
      makeMessage(),
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
      makeRuntime(),
      makeMessage(),
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
      makeRuntime(),
      makeMessage(),
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

  it("requests wallet auth challenge via agent wallet route", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        challengeId: "challenge-1",
        message: "sign this message",
      }),
    );

    const action = resolveAction("STREAM555_AUTH_WALLET_CHALLENGE");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
          chainType: "evm",
          agentId: "alice-wallet",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/agent/v1/auth/wallet/challenge");
    expect(parseFetchBody(fetchMock.mock.calls[0])).toEqual({
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
      chainType: "evm",
      agentId: "alice-wallet",
    });

    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    expect(envelope.action).toBe("STREAM555_AUTH_WALLET_CHALLENGE");
  });

  it("verifies wallet challenge and sets active bearer token", async () => {
    process.env.STREAM555_AGENT_API_KEY =
      "sk_ag_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    delete process.env.STREAM555_AGENT_TOKEN;

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        token: "wallet-auth-token",
        agentId: "alice-wallet",
        userId: "user-1",
        actorId: "actor-1",
        policyId: "policy-v1",
        walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
        chainType: "evm",
        scopes: ["stream:*"],
      }),
    );

    const action = resolveAction("STREAM555_AUTH_WALLET_VERIFY");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          challengeId: "challenge-1",
          signature: "0xdeadbeef",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/agent/v1/auth/wallet/verify");
    expect(parseFetchBody(fetchMock.mock.calls[0])).toEqual({
      challengeId: "challenge-1",
      signature: "0xdeadbeef",
    });

    expect(process.env.STREAM555_AGENT_TOKEN).toBe("wallet-auth-token");
    expect(process.env.STREAM555_AGENT_API_KEY).toBeUndefined();

    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    expect(envelope.action).toBe("STREAM555_AUTH_WALLET_VERIFY");
  });

  it("prefers Solana wallet when both Solana and EVM keys exist", async () => {
    process.env.SOLANA_PRIVATE_KEY = generateSolanaPrivateKey();
    process.env.EVM_PRIVATE_KEY = TEST_EVM_PRIVATE_KEY;
    delete process.env.STREAM555_AGENT_API_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          challengeId: "challenge-solana",
          message: "sign this solana challenge",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          token: "wallet-auth-token-sol",
          chainType: "solana",
          walletAddress: "ExampleAddress",
        }),
      );

    const action = resolveAction("STREAM555_AUTH_WALLET_LOGIN");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          agentId: "alice-wallet",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parseFetchBody(fetchMock.mock.calls[0]).chainType).toBe("solana");
    expect(result?.success).toBe(true);
    expect(process.env.STREAM555_AGENT_TOKEN).toBe("wallet-auth-token-sol");
    expect(parseEnvelope(result as { text: string }).action).toBe(
      "STREAM555_AUTH_WALLET_LOGIN",
    );
  });

  it("falls back to EVM wallet when Solana key is unavailable", async () => {
    delete process.env.SOLANA_PRIVATE_KEY;
    process.env.EVM_PRIVATE_KEY = TEST_EVM_PRIVATE_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          challengeId: "challenge-evm",
          message: "sign this evm challenge",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          token: "wallet-auth-token-evm",
          chainType: "evm",
        }),
      );

    const action = resolveAction("STREAM555_AUTH_WALLET_LOGIN");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {} as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parseFetchBody(fetchMock.mock.calls[0]).chainType).toBe("evm");
    expect(result?.success).toBe(true);
    expect(process.env.STREAM555_AGENT_TOKEN).toBe("wallet-auth-token-evm");
  });

  it("uses preferred chain from env when set to ethereum", async () => {
    process.env.STREAM555_WALLET_AUTH_PREFERRED_CHAIN = "ethereum";
    process.env.SOLANA_PRIVATE_KEY = generateSolanaPrivateKey();
    process.env.EVM_PRIVATE_KEY = TEST_EVM_PRIVATE_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          challengeId: "challenge-env-evm",
          message: "sign this evm challenge",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          token: "wallet-auth-token-env-evm",
          chainType: "evm",
        }),
      );

    const action = resolveAction("STREAM555_AUTH_WALLET_LOGIN");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {} as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(parseFetchBody(fetchMock.mock.calls[0]).chainType).toBe("evm");
    expect(result?.success).toBe(true);
  });

  it("provisions linked wallet via sw4p when no local wallet exists", async () => {
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          linkedWallet: {
            walletId: "wallet-1",
            address: "0xD43bA26f6f6A0C8f0C95181cA259539fF3A743F1",
            blockchain: "BASE",
            privateKey: TEST_EVM_PRIVATE_KEY,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          challengeId: "challenge-provisioned",
          message: "sign provisioned challenge",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          token: "wallet-auth-token-provisioned",
          chainType: "evm",
        }),
      );

    const action = resolveAction("STREAM555_AUTH_WALLET_LOGIN");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          provisionTargetChain: "eth",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/auth/wallets/linked");
    expect(parseFetchBody(fetchMock.mock.calls[1]).walletAddress).toBe(
      "0xD43bA26f6f6A0C8f0C95181cA259539fF3A743F1",
    );
    expect(parseFetchBody(fetchMock.mock.calls[1]).chainType).toBe("evm");
    const envelope = parseEnvelope(result as { text: string });
    expect(result?.success).toBe(true);
    expect(envelope.action).toBe("STREAM555_AUTH_WALLET_LOGIN");
    const data = envelope.data as Record<string, unknown>;
    expect(data.linkedWalletProvisioned).toBe(true);
    expect(data.walletSource).toBe("sw4p_linked_wallet");
  });

  it("returns explicit failure when linked wallet has no signing key material", async () => {
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        linkedWallet: {
          walletId: "wallet-1",
          address: "0xD43bA26f6f6A0C8f0C95181cA259539fF3A743F1",
          blockchain: "BASE",
        },
      }),
    );

    const action = resolveAction("STREAM555_AUTH_WALLET_LOGIN");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {} as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(String(envelope.message)).toContain("signing material");
  });

  it("disables provisioning when env default is false", async () => {
    process.env.STREAM555_WALLET_AUTH_ALLOW_PROVISION = "false";
    delete process.env.SOLANA_PRIVATE_KEY;
    delete process.env.EVM_PRIVATE_KEY;
    process.env.STREAM555_AGENT_TOKEN = "agent-bearer-token";

    const fetchMock = vi.spyOn(globalThis, "fetch");

    const action = resolveAction("STREAM555_AUTH_WALLET_LOGIN");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {} as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(0);
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.status).toBe(412);
    expect(String(envelope.message)).toContain("no wallet available");
  });

  it("defaults to public URL for non-internal agents when base env is missing", async () => {
    delete process.env.STREAM555_BASE_URL;
    delete process.env.STREAM_API_URL;

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { keys: [], count: 0 }));

    const action = resolveAction("STREAM555_AUTH_APIKEY_LIST");
    const result = await action.handler?.(
      makeRuntime("builder-agent"),
      makeMessage("builder-agent"),
      INTERNAL_STATE,
      {} as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://stream.rndrntwrk.com/api/agent/v1/auth/apikeys",
    );
    expect(result?.success).toBe(true);
  });

  it("defaults to internal URL for Alice agents when base env is missing", async () => {
    delete process.env.STREAM555_BASE_URL;
    delete process.env.STREAM_API_URL;

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { keys: [], count: 0 }));

    const action = resolveAction("STREAM555_AUTH_APIKEY_LIST");
    const result = await action.handler?.(
      makeRuntime("alice"),
      makeMessage("alice"),
      INTERNAL_STATE,
      {} as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "http://control-plane:3000/api/agent/v1/auth/apikeys",
    );
    expect(result?.success).toBe(true);
  });
});
