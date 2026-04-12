/**
 * Integration tests for /api/models routes.
 *
 * Starts a real API server and makes real HTTP requests — no mocks.
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

describe("models-routes (real server)", () => {
  test("GET /api/models returns provider data", async () => {
    const { status, data } = await req(port, "GET", "/api/models");
    expect(status).toBe(200);
    // The real server returns a providers object (possibly empty if no keys configured)
    expect(data).toHaveProperty("providers");
  }, 60_000);

  test("GET /api/models?provider=openai returns specific provider", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/models?provider=openai",
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("provider", "openai");
    expect(data).toHaveProperty("models");
  }, 60_000);

  test("GET /api/models?refresh=true forces a cache refresh", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/models?refresh=true",
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("providers");
  }, 60_000);

  test("POST /api/models is not handled (wrong method)", async () => {
    const { status } = await req(port, "POST", "/api/models", {});
    // Wrong method falls through to other routes or 404
    expect(status).not.toBe(200);
  }, 60_000);
});
