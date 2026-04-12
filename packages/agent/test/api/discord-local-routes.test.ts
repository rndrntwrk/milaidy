/**
 * Integration tests for /api/discord-local/* routes.
 *
 * Starts a real API server (no runtime) and makes real HTTP requests.
 * Without a running runtime, the Discord local service is unavailable.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { req } from "../../../../test/helpers/http";
import { startApiServer } from "../../src/api/server";

vi.mock("../../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

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

describe("discord-local routes (real server)", () => {
  it("GET /api/discord-local/status reports unavailable when no runtime", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/discord-local/status",
    );
    expect(status).toBe(200);
    expect(data).toMatchObject({
      available: false,
      connected: false,
      authenticated: false,
    });
  }, 60_000);

  it("GET /api/discord-local/channels rejects without a guild id", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/discord-local/channels",
    );
    // Without runtime/service the server returns an error
    expect([400, 503]).toContain(status);
  }, 60_000);
});
