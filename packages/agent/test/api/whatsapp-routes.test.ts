/**
 * Integration tests for /api/whatsapp/* routes.
 *
 * Starts a real API server (no runtime) and makes real HTTP requests.
 * Without a running runtime, the WhatsApp service is unavailable.
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

describe("WhatsApp routes (real server)", () => {
  test("GET /api/whatsapp/status reports status", async () => {
    const { status, data } = await req(port, "GET", "/api/whatsapp/status");
    expect(status).toBe(200);
    expect(data).toHaveProperty("status");
  }, 60_000);

  test("GET /api/whatsapp/webhook returns 503 when service unavailable", async () => {
    const { status } = await req(
      port,
      "GET",
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=12345",
    );
    expect(status).toBe(503);
  }, 60_000);

  test("POST /api/whatsapp/webhook returns 503 when service unavailable", async () => {
    const { status } = await req(port, "POST", "/api/whatsapp/webhook", {
      object: "whatsapp_business_account",
      entry: [{ id: "entry-1", changes: [] }],
    });
    expect(status).toBe(503);
  }, 60_000);
});
