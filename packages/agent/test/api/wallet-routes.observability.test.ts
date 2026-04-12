/**
 * Integration tests for wallet route observability (telemetry spans).
 *
 * Starts a real API server and makes real HTTP requests to trigger
 * the telemetry paths in the wallet balance endpoint.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

const { createSpanMock, spanSuccessMock, spanFailureMock } = vi.hoisted(() => ({
  createSpanMock: vi.fn(),
  spanSuccessMock: vi.fn(),
  spanFailureMock: vi.fn(),
}));

vi.mock("../../src/diagnostics/integration-observability.js", () => ({
  createIntegrationTelemetrySpan: createSpanMock,
}));

const ENV_KEYS = [
  "ALCHEMY_API_KEY",
  "HELIUS_API_KEY",
  "ELIZAOS_CLOUD_API_KEY",
  "SOLANA_RPC_URL",
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
  vi.clearAllMocks();
  createSpanMock.mockReturnValue({
    success: spanSuccessMock,
    failure: spanFailureMock,
  });
  delete process.env.ELIZAOS_CLOUD_API_KEY;
  delete process.env.SOLANA_RPC_URL;
  process.env.ALCHEMY_API_KEY = "alchemy";
  process.env.HELIUS_API_KEY = "helius";
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
  vi.restoreAllMocks();
});

describe("wallet routes observability (real server)", () => {
  it("GET /api/wallet/balances triggers telemetry spans", async () => {
    const { status } = await req(port, "GET", "/api/wallet/balances");
    expect(status).toBe(200);
    // The telemetry span creation should have been called for balance fetches
    expect(createSpanMock).toHaveBeenCalled();
  }, 60_000);
});
