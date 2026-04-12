/**
 * Integration tests for GET /api/knowledge root route.
 *
 * Starts a real API server and makes real HTTP requests.
 * Without a running runtime, the knowledge endpoint returns unavailable.
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

describe("knowledge root route (real server)", () => {
  test("GET /api/knowledge returns availability summary", async () => {
    const { status, data } = await req(port, "GET", "/api/knowledge");
    expect(status).toBe(200);
    expect(data).toHaveProperty("ok");
    // Without runtime, knowledge service may report unavailable
    expect(typeof (data as { ok: boolean }).ok).toBe("boolean");
  }, 60_000);
});
