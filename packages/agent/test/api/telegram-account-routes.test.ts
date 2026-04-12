/**
 * Integration tests for /api/telegram-account/* routes.
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

describe("telegram-account routes (real server)", () => {
  test("GET /api/telegram-account/status returns idle state when unconfigured", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/telegram-account/status",
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("status");
    // When unconfigured, status should be idle or similar
    expect(["idle", "configured"]).toContain(data.status);
  }, 60_000);

  test("POST /api/telegram-account/auth/start requires a phone number", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/telegram-account/auth/start",
      {},
    );
    // Should reject missing phone
    expect([400, 500]).toContain(status);
  }, 60_000);

  test("POST /api/telegram-account/disconnect handles no active session", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/telegram-account/disconnect",
      {},
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("ok", true);
  }, 60_000);

  test("unrelated path is not handled", async () => {
    const { status } = await req(
      port,
      "GET",
      "/api/telegram-account/unknown",
    );
    expect(status).toBe(404);
  }, 60_000);
});
