/**
 * Integration tests for /api/wallet/* routes.
 *
 * Starts a real API server and makes real HTTP requests — no mocks.
 * Wallet routes that require real private keys or RPC providers use
 * describe.skipIf to skip when credentials are unavailable.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

const ENV_KEYS = [
  "ALCHEMY_API_KEY",
  "INFURA_API_KEY",
  "ANKR_API_KEY",
  "ETHEREUM_RPC_URL",
  "BASE_RPC_URL",
  "AVALANCHE_RPC_URL",
  "HELIUS_API_KEY",
  "BIRDEYE_API_KEY",
  "NODEREAL_BSC_RPC_URL",
  "QUICKNODE_BSC_RPC_URL",
  "BSC_RPC_URL",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_BASE_URL",
  "EVM_PRIVATE_KEY",
  "SOLANA_PRIVATE_KEY",
  "SOLANA_RPC_URL",
  "MILADY_WALLET_NETWORK",
] as const;

const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

let port: number;
let close: () => Promise<void>;

beforeAll(async () => {
  const server = await startApiServer({ port: 0 });
  port = server.port;
  close = server.close;
}, 180_000);

afterAll(async () => {
  await close();
});

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("wallet routes (real server)", () => {
  test("GET /api/wallet/addresses returns address fields", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/addresses");
    expect(status).toBe(200);
    // The server returns address fields (possibly null if no keys)
    expect(data).toHaveProperty("evmAddress");
    expect(data).toHaveProperty("solanaAddress");
  }, 60_000);

  test("GET /api/wallet/config returns wallet configuration", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/config");
    expect(status).toBe(200);
    expect(data).toHaveProperty("walletNetwork");
  }, 60_000);

  test("GET /api/wallet/balances returns balance structure", async () => {
    const { status, data } = await req(port, "GET", "/api/wallet/balances");
    expect(status).toBe(200);
    expect(data).toHaveProperty("evm");
    expect(data).toHaveProperty("solana");
  }, 60_000);

  test("POST /api/wallet/import requires privateKey", async () => {
    const { status, data } = await req(port, "POST", "/api/wallet/import", {});
    expect(status).toBe(400);
    expect(data).toHaveProperty("error", "privateKey is required");
  }, 60_000);

  test("POST /api/wallet/import rejects unsupported chain", async () => {
    const { status, data } = await req(port, "POST", "/api/wallet/import", {
      chain: "bitcoin",
      privateKey: "key",
    });
    expect(status).toBe(400);
    expect((data as { error: string }).error).toContain("Unsupported chain");
  }, 60_000);

  test("POST /api/wallet/generate with chain=both generates wallets", async () => {
    const { status, data } = await req(port, "POST", "/api/wallet/generate", {
      chain: "both",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("wallets");
    const wallets = (data as { wallets: Array<{ chain: string }> }).wallets;
    expect(wallets).toHaveLength(2);
  }, 60_000);

  test("POST /api/wallet/export requires confirm field", async () => {
    const { status, data } = await req(port, "POST", "/api/wallet/export", {});
    // Without confirm=true, the server should reject or return error
    expect([400, 403]).toContain(status);
  }, 60_000);
});
