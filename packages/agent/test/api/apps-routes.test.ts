/**
 * Integration tests for /api/apps/* routes.
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

describe("apps routes (real server)", () => {
  test("GET /api/apps returns available apps list", async () => {
    const { status, data } = await req(port, "GET", "/api/apps");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  }, 60_000);

  test("GET /api/apps/search returns results for blank query", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/apps/search?q=",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  }, 60_000);

  test("GET /api/apps/runs returns runs list", async () => {
    const { status, data } = await req(port, "GET", "/api/apps/runs");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  }, 60_000);

  test("GET /api/apps/runs/:runId returns 404 when missing", async () => {
    const { status, data } = await req(port, "GET", "/api/apps/runs/run-404");
    expect(status).toBe(404);
    expect(data).toHaveProperty("error");
  }, 60_000);

  test("POST /api/apps/stop rejects requests without name or runId", async () => {
    const { status, data } = await req(port, "POST", "/api/apps/stop", {});
    expect(status).toBe(500);
    expect(data).toHaveProperty("error");
    expect((data as { error: string }).error).toContain("required");
  }, 60_000);
});
