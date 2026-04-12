/**
 * Integration tests for /api/triggers routes.
 *
 * Starts a real API server (no runtime) and makes real HTTP requests.
 */

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
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

describe("trigger routes (real server)", () => {
  test("GET /api/triggers returns 503 when runtime is not running", async () => {
    const { status, data } = await req(port, "GET", "/api/triggers");
    expect(status).toBe(503);
    expect(data).toHaveProperty("error");
  }, 60_000);

  test("GET /api/triggers/health returns health snapshot even without runtime", async () => {
    const { status, data } = await req(port, "GET", "/api/triggers/health");
    expect(status).toBe(200);
    expect(data).toHaveProperty("healthy");
  }, 60_000);

  test("GET /api/heartbeats aliases to triggers endpoint", async () => {
    const { status } = await req(port, "GET", "/api/heartbeats");
    // Without runtime, should return 503 (same as /api/triggers)
    expect(status).toBe(503);
  }, 60_000);
});
