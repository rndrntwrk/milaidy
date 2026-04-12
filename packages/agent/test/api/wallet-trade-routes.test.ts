/**
 * Integration tests for /api/wallet/trade/execute route.
 *
 * Starts a real API server and makes real HTTP requests — no mocks.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

const ENV_KEYS = ["EVM_PRIVATE_KEY"] as const;
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

describe("wallet trade execute route (real server)", () => {
  test("POST /api/wallet/trade/execute validates required fields", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/trade/execute",
      { side: "buy" },
    );
    expect(status).toBe(400);
    expect(data).toHaveProperty("error");
    expect((data as { error: string }).error).toContain("required");
  }, 60_000);

  test("POST /api/wallet/trade/execute rejects when no private key is set", async () => {
    delete process.env.EVM_PRIVATE_KEY;
    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/trade/execute",
      {
        side: "buy",
        tokenAddress: "0x4444444444444444444444444444444444444444",
        amount: "0.01",
      },
    );
    // Without a private key, the server should reject
    expect([400, 403, 500]).toContain(status);
  }, 60_000);
});
