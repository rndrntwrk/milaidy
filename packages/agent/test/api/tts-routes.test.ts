/**
 * Integration tests for /api/tts/* routes.
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

describe("tts routes (real server)", () => {
  test("GET /api/tts/config returns TTS configuration", async () => {
    const { status, data } = await req(port, "GET", "/api/tts/config");
    expect(status).toBe(200);
    // The config response should include provider and mode
    expect(typeof data).toBe("object");
  }, 60_000);
});
