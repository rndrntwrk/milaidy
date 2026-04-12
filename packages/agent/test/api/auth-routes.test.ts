/**
 * Integration tests for /api/auth/* routes.
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

let port: number;
let close: () => Promise<void>;
let envBackup: string | undefined;
const originalEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  const server = await startApiServer({ port: 0 });
  port = server.port;
  close = server.close;
}, 180_000);

afterAll(async () => {
  await close();
});

beforeEach(() => {
  for (const key of [
    "ELIZA_API_TOKEN",
    "MILADY_CLOUD_PROVISIONED",
    "ELIZA_CLOUD_PROVISIONED",
    "STEWARD_AGENT_TOKEN",
    "ELIZAOS_CLOUD_ENABLED",
    "ELIZAOS_CLOUD_API_KEY",
  ]) {
    originalEnv[key] = process.env[key];
  }
  envBackup = process.env.ELIZA_API_TOKEN;
  process.env.ELIZA_API_TOKEN = "test-token-secret";
  delete process.env.MILADY_CLOUD_PROVISIONED;
  delete process.env.ELIZA_CLOUD_PROVISIONED;
  delete process.env.STEWARD_AGENT_TOKEN;
  delete process.env.ELIZAOS_CLOUD_ENABLED;
  delete process.env.ELIZAOS_CLOUD_API_KEY;
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("auth-routes (real server)", () => {
  test("GET /api/auth/status returns pairing status", async () => {
    const { status, data } = await req(port, "GET", "/api/auth/status");
    expect(status).toBe(200);
    expect(data).toHaveProperty("pairingEnabled");
    expect(data).toHaveProperty("required");
  }, 60_000);

  test("POST /api/auth/pair rejects with wrong code", async () => {
    const { status, data } = await req(port, "POST", "/api/auth/pair", {
      code: "WRONG-CODE-123",
    });
    // Should reject with 403 or 429 or similar
    expect([400, 403, 429]).toContain(status);
  }, 60_000);

  test("POST /api/auth/pair rejects with no body", async () => {
    const { status } = await req(port, "POST", "/api/auth/pair", {});
    expect([400, 403, 429]).toContain(status);
  }, 60_000);

  test("unrelated auth path is not handled", async () => {
    const { status } = await req(port, "GET", "/api/auth/unknown");
    // Unmatched auth sub-paths fall through to 404
    expect(status).toBe(404);
  }, 60_000);
});
