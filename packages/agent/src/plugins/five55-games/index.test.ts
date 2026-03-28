import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { createFive55GamesPlugin } from "./index";

const originalEnv = { ...process.env };

function actionResultText(result: { text: string }) {
  return JSON.parse(result.text) as Record<string, unknown>;
}

function buildRuntime(): IAgentRuntime {
  return {
    agentId: "agent-1",
    getSetting: vi.fn(() => undefined),
  } as unknown as IAgentRuntime;
}

function buildMessage(): Memory {
  return {
    entityId: "owner-1",
    roomId: "room-1",
    metadata: { provider: "web", sender: { id: "owner-1" } },
    content: { text: "run it" },
  } as unknown as Memory;
}

describe("five55-games plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
  });

  it("defaults play mode to agent and resolves a game id from catalog", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ games: [{ id: "knighthood" }, { id: "ninja" }] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ started: true }), { status: 200 }),
      );

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find((entry) => entry.name === "FIVE55_GAMES_PLAY");
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as State,
      { parameters: {} },
      undefined,
    );

    expect(result?.success).toBe(true);
    expect(actionResultText(result as { text: string }).message).toBe("game play started");
    const playCall = fetchMock.mock.calls[2];
    expect(String(playCall?.[0])).toContain("/api/agent/v1/sessions/session-1/games/play");
    expect(playCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(playCall?.[1]?.body))).toMatchObject({
      gameId: "knighthood",
      mode: "agent",
    });
  });

  it("go-live play provisions stream output before playing and waits for readiness", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ active: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cfSessionId: "cf-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ games: [{ id: "ninja" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ started: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            active: true,
            phase: "live",
            cloudflare: { isConnected: true, state: "connected" },
          }),
          { status: 200 },
        ),
      );

    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find(
      (entry) => entry.name === "FIVE55_GAMES_GO_LIVE_PLAY",
    );
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: true } } as State,
      { parameters: {} },
      undefined,
    );

    expect(result?.success).toBe(true);
    expect(
      fetchMock.mock.calls.map((call) => String(call[0])),
    ).toEqual([
      "https://stream555.example/api/agent/v1/sessions",
      "https://stream555.example/api/agent/v1/sessions/session-1",
      "https://stream555.example/api/agent/v1/sessions/session-1/stream/start",
      "https://stream555.example/api/agent/v1/sessions/session-1/games/catalog",
      "https://stream555.example/api/agent/v1/sessions/session-1/games/play",
      "https://stream555.example/api/agent/v1/sessions/session-1/stream/status",
    ]);
  });

  it("rejects play actions when the caller is not trusted", async () => {
    const plugin = createFive55GamesPlugin();
    const action = plugin.actions?.find((entry) => entry.name === "FIVE55_GAMES_PLAY");
    const result = await action?.handler?.(
      buildRuntime(),
      buildMessage(),
      { values: { trustedAdmin: false } } as State,
      { parameters: { gameId: "ninja" } },
      undefined,
    );

    expect(result?.success).toBe(false);
    expect(actionResultText(result as { text: string }).status).toBe(403);
  });
});
