import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteRequestContext } from "../../src/api/route-helpers";
import {
  __resetFive55GamesRouteStateForTests,
  handleFive55GamesRoutes,
} from "../../src/api/five55-games-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

const originalEnv = { ...process.env };

function buildCtx(
  method: string,
  pathname: string,
  overrides: (Partial<RouteRequestContext> & Record<string, unknown>) = {},
) {
  const { res, getStatus, getJson } = createMockHttpResponse();
  const req = createMockIncomingMessage({ method, url: pathname });
  const ctx = {
    req,
    res,
    method,
    pathname,
    json: vi.fn((r, data, status = 200) => {
      r.writeHead(status);
      r.end(JSON.stringify(data));
    }),
    error: vi.fn((r, message, status = 400) => {
      r.writeHead(status);
      r.end(JSON.stringify({ error: message }));
    }),
    readJsonBody: vi.fn(async () => ({})),
    ...overrides,
  } as RouteRequestContext & {
    getStatus: () => number;
    getJson: () => unknown;
  };
  return { ctx, getStatus, getJson };
}

describe("five55-games-routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetFive55GamesRouteStateForTests();
    process.env = { ...originalEnv };
    process.env.STREAM555_BASE_URL = "https://stream555.example";
    process.env.STREAM555_AGENT_TOKEN = "static-token";
  });

  it("returns false for unrelated paths", async () => {
    const { ctx } = buildCtx("POST", "/api/other");
    const handled = await handleFive55GamesRoutes(ctx);
    expect(handled).toBe(false);
  });

  it("proxies catalog requests through the current session route", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ games: [{ id: "ninja" }] }), {
          status: 200,
        }),
      );
    const { ctx, getStatus, getJson } = buildCtx(
      "POST",
      "/api/agent/v1/sessions/session-1/games/catalog",
      {
        readJsonBody: vi.fn(async () => ({ includeBeta: true })),
      },
    );

    const handled = await handleFive55GamesRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({ games: [{ id: "ninja" }] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://stream555.example/api/agent/v1/sessions",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      sessionId: "session-1",
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://stream555.example/api/agent/v1/sessions/session-1/games/catalog",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer static-token",
      }),
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      includeBeta: true,
    });
  });

  it("returns bootstrap errors before proxying when session preparation fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    );
    const { ctx, getStatus, getJson } = buildCtx(
      "POST",
      "/api/agent/v1/sessions/session-1/games/play",
    );

    const handled = await handleFive55GamesRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(502);
    expect(getJson()).toEqual({
      error: expect.stringContaining("Session bootstrap failed"),
    });
  });

  it("rejects invalid session ids", async () => {
    const { ctx, getStatus, getJson } = buildCtx(
      "POST",
      "/api/agent/v1/sessions/%20/games/play",
    );

    const handled = await handleFive55GamesRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({ error: "sessionId is required" });
  });

  it("surfaces upstream auth failures with the request id", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
        }),
      );
    const { ctx, getStatus, getJson } = buildCtx(
      "POST",
      "/api/agent/v1/sessions/session-1/games/stop",
    );

    const handled = await handleFive55GamesRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(401);
    expect(getJson()).toEqual({
      error: expect.stringMatching(/^Unauthorized \[requestId: api-five55-games-stop-/),
    });
  });

  it("returns cached game state with local live and destination fallback", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: "session-1" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, gameId: "ninja", gameTitle: "Ninja" }),
          {
            status: 200,
          },
        ),
      );

    const { ctx: playCtx } = buildCtx(
      "POST",
      "/api/agent/v1/sessions/session-1/games/play",
      {
        readJsonBody: vi.fn(async () => ({ gameId: "ninja", mode: "agent" })),
      },
    );

    await handleFive55GamesRoutes(playCtx);

    delete process.env.STREAM555_BASE_URL;
    delete process.env.STREAM555_AGENT_TOKEN;

    const { ctx, getStatus, getJson } = buildCtx(
      "GET",
      "/api/agent/v1/sessions/session-1/games/state",
      {
        streamState: {
          streamManager: {
            isRunning: () => true,
            writeFrame: () => true,
            start: vi.fn(),
            stop: vi.fn(),
            getHealth: () => ({
              running: true,
              ffmpegAlive: true,
              uptime: 12,
              frameCount: 24,
              volume: 1,
              muted: false,
              audioSource: "system",
              inputMode: null,
            }),
            getVolume: () => 1,
            isMuted: () => false,
            setVolume: vi.fn(),
            mute: vi.fn(),
            unmute: vi.fn(),
          },
          destinations: new Map([
            ["twitch", { id: "twitch", name: "Twitch" }],
          ]),
          activeDestinationId: "twitch",
          activeStreamSource: { type: "stream-tab" },
        } as any,
      },
    );

    const handled = await handleFive55GamesRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      ok: true,
      sessionId: "session-1",
      activeGameId: "ninja",
      activeGameLabel: "Ninja",
      mode: "agent",
      phase: "live",
      live: true,
      destination: { id: "twitch", name: "Twitch" },
    });
  });

  it("prefers upstream game state when the dedicated state route is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "session-1",
          activeGameId: "ninja",
          activeGameLabel: "Ninja",
          mode: "agent",
          phase: "live",
          live: true,
          destination: { id: "kick", name: "Kick" },
        }),
        { status: 200 },
      ),
    );

    const { ctx, getStatus, getJson } = buildCtx(
      "GET",
      "/api/agent/v1/sessions/session-1/games/state",
    );

    const handled = await handleFive55GamesRoutes(ctx);

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toEqual({
      ok: true,
      sessionId: "session-1",
      activeGameId: "ninja",
      activeGameLabel: "Ninja",
      mode: "agent",
      phase: "live",
      live: true,
      destination: { id: "kick", name: "Kick" },
    });
  });
});
