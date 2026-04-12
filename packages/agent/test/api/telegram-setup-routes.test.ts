/**
 * Integration tests for /api/telegram-setup/* routes.
 *
 * Starts a real API server and makes real HTTP requests.
 * The validate-token endpoint calls the Telegram API, so we stub fetch.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          id: 123456,
          is_bot: true,
          first_name: "Milady Bot",
          username: "milady_bot",
        },
      }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("telegram-setup routes (real server)", () => {
  test("POST /api/telegram-setup/validate-token validates and persists bot token", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/telegram-setup/validate-token",
      { token: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ123456" },
    );
    expect(status).toBe(200);
    expect(data).toHaveProperty("ok", true);
    expect(data).toHaveProperty("bot");
    expect((data as { bot: { username: string } }).bot.username).toBe(
      "milady_bot",
    );
  }, 60_000);
});
