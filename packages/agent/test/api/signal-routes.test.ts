/**
 * Integration tests for /api/signal/* routes.
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

describe("signal routes (real server)", () => {
  test("GET /api/signal/status returns idle state when no account is linked", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/signal/status?accountId=test-account",
    );
    expect(status).toBe(200);
    expect(data).toMatchObject({
      accountId: "test-account",
      status: "idle",
    });
  }, 60_000);

  test("POST /api/signal/pair creates a pairing session", async () => {
    const { status, data } = await req(port, "POST", "/api/signal/pair", {
      accountId: "test-account",
    });
    expect(status).toBe(200);
    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("status");
  }, 60_000);

  test("POST /api/signal/pair returns 400 with empty accountId", async () => {
    const { status, data } = await req(port, "POST", "/api/signal/pair", {
      accountId: "",
    });
    expect(status).toBe(400);
    expect(data).toHaveProperty("error");
  }, 60_000);
});
