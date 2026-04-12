/**
 * Integration tests for POST /api/provider/switch route.
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

const originalEnv = { ...process.env };

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
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("provider-switch routes (real server)", () => {
  test("POST /api/provider/switch processes a provider switch request", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/provider/switch",
      { provider: "openai" },
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("success", true);
    expect(data).toHaveProperty("provider", "openai");
  }, 60_000);
});
