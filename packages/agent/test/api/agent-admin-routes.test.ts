/**
 * Integration tests for /api/agent/admin routes.
 *
 * Starts a real API server (no runtime, no restart handler) and makes
 * real HTTP requests.
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
  // Start without a restart handler — POST /api/agent/restart should return 501
  const server = await startApiServer({ port: 0 });
  port = server.port;
  close = server.close;
}, 180_000);

afterAll(async () => {
  await close();
});

describe("agent-admin-routes (real server)", () => {
  test("POST /api/agent/restart returns 501 when no restart handler", async () => {
    const { status, data } = await req(port, "POST", "/api/agent/restart");
    expect(status).toBe(501);
    expect(data).toHaveProperty("error");
    expect((data as { error: string }).error).toContain("not supported");
  }, 60_000);

  test("GET /api/agent/restart returns 404 (wrong method)", async () => {
    const { status } = await req(port, "GET", "/api/agent/restart");
    expect(status).toBe(404);
  }, 60_000);

  test("unrelated path is not handled", async () => {
    const { status } = await req(port, "GET", "/api/agent/unknown-path");
    expect(status).toBe(404);
  }, 60_000);
});
