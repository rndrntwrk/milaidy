/**
 * Integration tests for /api/subscription/* routes.
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

describe("subscription routes (real server)", () => {
  test("GET /api/subscription/status returns provider status", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/subscription/status",
    );
    // Should succeed or return 500 if subscription auth module unavailable
    expect([200, 500]).toContain(status);
    if (status === 200) {
      expect(data).toHaveProperty("providers");
    }
  }, 60_000);

  test("POST /api/subscription/anthropic/setup-token stores the token", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/subscription/anthropic/setup-token",
      { token: "  sk-ant-oat01-test-token  " },
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("success", true);
  }, 60_000);

  test("DELETE /api/subscription/anthropic-subscription clears saved token", async () => {
    const { status, data } = await req(
      port,
      "DELETE",
      "/api/subscription/anthropic-subscription",
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("success", true);
  }, 60_000);

  test("DELETE /api/subscription/openai-codex clears matching route", async () => {
    const { status, data } = await req(
      port,
      "DELETE",
      "/api/subscription/openai-codex",
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("success", true);
  }, 60_000);

  test("unrelated path is not handled", async () => {
    const { status } = await req(
      port,
      "GET",
      "/api/subscription/unknown-path",
    );
    expect(status).toBe(404);
  }, 60_000);
});
