/**
 * Integration tests for /api/bluebubbles/* routes.
 *
 * Starts a real API server (no runtime) and makes real HTTP requests.
 * Without a running runtime the BlueBubbles service is unavailable.
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

describe("BlueBubbles routes (real server)", () => {
  it("GET /api/bluebubbles/status reports unavailable when no runtime", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/bluebubbles/status",
    );
    expect(status).toBe(200);
    expect(data).toMatchObject({
      available: false,
      connected: false,
    });
    expect(data).toHaveProperty("webhookPath");
  }, 60_000);

  it("POST /webhooks/bluebubbles rejects without a runtime service", async () => {
    const { status } = await req(port, "POST", "/webhooks/bluebubbles", {
      type: "new-message",
      data: { chatGuid: "chat-1" },
    });
    // Without a runtime service the server returns an error
    expect([400, 503]).toContain(status);
  }, 60_000);

  it("GET /api/bluebubbles/chats requires a running service", async () => {
    const { status } = await req(port, "GET", "/api/bluebubbles/chats");
    expect([400, 503]).toContain(status);
  }, 60_000);

  it("GET /api/bluebubbles/messages requires chatGuid", async () => {
    const { status, data } = await req(
      port,
      "GET",
      "/api/bluebubbles/messages",
    );
    expect([400, 503]).toContain(status);
  }, 60_000);
});
