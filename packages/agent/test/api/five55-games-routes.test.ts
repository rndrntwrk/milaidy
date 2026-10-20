import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RouteRequestContext } from "../../src/api/route-helpers";
import {
  __resetFive55GamesRouteStateForTests,
  handleFive55GamesRoutes,
} from "../../src/api/five55-games-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";
import { StreamControlService } from "../../../plugin-555stream/src/services/StreamControlService";

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

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe("Alice connection reads", () => {
    beforeEach(() => {
      process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
      process.env.ALICE_RUNTIME_PROFILE = "full-gated";
      process.env.STREAM555_DEFAULT_SESSION_ID = "alice-session";
      process.env.FIVE55_HTTP_RETRIES = "0";
    });

    it("reads the catalog from the configured session without a bootstrap request", async () => {
      const catalog = { sessionId: "alice-session", games: [{ id: "ninja" }] };
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(catalog)),
      );
      const { ctx, getStatus, getJson } = buildCtx(
        "POST", "/api/agent/v1/sessions/browser-local/games/catalog",
        { readJsonBody: vi.fn(async () => ({ includeBeta: true })) },
      );
      await handleFive55GamesRoutes(ctx);
      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual(catalog);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://stream555.example/api/agent/v1/sessions/alice-session/games/catalog");
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ includeBeta: true });
    });

    it("does not request a catalog without the configured session", async () => {
      delete process.env.STREAM555_DEFAULT_SESSION_ID;
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ sessionId: "browser-local", games: [] })),
      );
      const { ctx, getStatus } = buildCtx("POST", "/api/agent/v1/sessions/browser-local/games/catalog");
      await handleFive55GamesRoutes(ctx);
      expect(getStatus()).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      { sessionId: "unrelated-session", games: [] },
      { sessionId: "alice-session", games: null },
    ])("rejects an unverified catalog response: %j", async (catalog) => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(catalog)),
      );
      const { ctx, getStatus } = buildCtx("POST", "/api/agent/v1/sessions/browser-local/games/catalog");
      await handleFive55GamesRoutes(ctx);
      expect(getStatus()).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not request native selection without verified owner ingress", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ sessionId: "alice-session", live: false })),
      );
      const { ctx, getStatus, getJson } = buildCtx(
        "GET", "/api/agent/v1/sessions/browser-local/games/state",
      );
      await handleFive55GamesRoutes(ctx);
      expect(getStatus()).toBe(403);
      expect(getJson()).toEqual({
        error: "Verified owner access is required",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("native owner game selection", () => {
    let service: StreamControlService;
    const selection = {
      sessionId: "alice-session", sourceId: "game-1", gameId: "555drive",
      playMode: "agent", compositionRevision: 4,
    };
    const ownerHeaders = {
      "cf-access-authenticated-user-email": "alice-owner-verified.invalid",
      "x-milady-cloudflare-access-secret": "test-owner-proof",
    };
    const snapshot = {
      schemaVersion: 1, revision: 4, updatedAt: 123456,
      productionState: { sources: [
        { id: "game-1", type: "game", visible: true, gameId: "555drive", gameConfig: { playMode: "agent" } },
      ] },
      scenes: [], activeSceneId: null, sceneDslEnabled: false, graphics: { global: [], user: [] },
    };
    beforeEach(async () => {
      process.env.ALICE_RUNTIME_AUTHORITY_MODE = "proposer-only";
      process.env.ALICE_RUNTIME_PROFILE = "full-gated";
      process.env.MILADY_TRUST_CLOUDFLARE_ACCESS = "true";
      process.env.MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET = "test-owner-proof";
      process.env.STREAM555_PUBLIC_BASE_URL = "https://stream.rndrntwrk.com";
      process.env.STREAM555_DEFAULT_SESSION_ID = "alice-session";
      const now = Math.floor(Date.now() / 1000);
      process.env.STREAM555_AGENT_TOKEN = [
        Buffer.from('{"alg":"HS256"}').toString("base64url"),
        Buffer.from(JSON.stringify({
          type: "agent", studioAuthority: "d1-v1", iss: "555stream-studio-agent", aud: "555stream-native",
          jti: "grant-1", userId: "alice", subjectUserId: "alice", agentId: "alice", actorId: "actor-alice",
          actorType: "agent", authMethod: "agent_key", sessionKind: "agent_runtime", policyId: "policy-1",
          scopes: ["sessions:read", "studio:write"], sessionIds: ["alice-session"], iat: now, exp: now + 604800,
        })).toString("base64url"), "test-signature",
      ].join(".");
      service = await StreamControlService.start({ agentId: "alice", getService: () => undefined });
    });
    afterEach(async () => { await service.stop(); });

    function nativeCtx(method: string, operation: string, sessionId = "alice-session", headers = ownerHeaders,
      body: Record<string, unknown> = { gameId: "555drive", mode: "agent" }) {
      const pathname = `/api/agent/v1/sessions/${sessionId}/games/${operation}`;
      return buildCtx(method, pathname, {
        req: createMockIncomingMessage({ method, url: pathname, headers }),
        readJsonBody: vi.fn(async () => body),
        streamState: { runtime: { getService: (name: string) => name === "stream555" ? service : null } },
      });
    }

    it("reads saved selection and selects through native CAS without bootstrap or gameplay claims", async () => {
      const calls: string[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        calls.push(`${init?.method} ${String(input)}`);
        if (init?.method === "HEAD") return new Response(null, { headers: { "content-type": "text/html" } });
        expect(String(input)).toBe("https://stream.rndrntwrk.com/api/session/composition");
        expect(new Headers(init?.headers).get("X-Session-Id")).toBe("alice-session");
        if (init?.method === "PUT") {
          expect(JSON.parse(String(init.body)).expectedRevision).toBe(4);
          return Response.json({ sessionId: "alice-session", snapshot: { ...snapshot, revision: 5 } });
        }
        return Response.json({ sessionId: "alice-session", snapshot });
      });
      const state = nativeCtx("GET", "state");
      await handleFive55GamesRoutes(state.ctx);
      expect(state.getStatus()).toBe(200);
      expect(state.getJson()).toEqual({
        ok: true, sessionId: "alice-session", activeGameId: "555drive", activeGameLabel: "555drive",
        mode: "agent", phase: "selected", live: false, destination: null, selection,
      });
      for (const operation of ["play", "switch"]) {
        const request = nativeCtx("POST", operation);
        await handleFive55GamesRoutes(request.ctx);
        expect(request.getStatus()).toBe(200);
        expect(request.getJson()).toEqual({
          ok: true, message: "Game selected.",
          selection: { ...selection, compositionRevision: 5 },
        });
      }
      expect(calls).toEqual([
        "GET https://stream.rndrntwrk.com/api/session/composition",
        ...["play", "switch"].flatMap(() => [
          "GET https://stream.rndrntwrk.com/api/session/composition",
          "HEAD https://stream.rndrntwrk.com/game-embed/555drive/content",
          "PUT https://stream.rndrntwrk.com/api/session/composition",
        ]),
      ]);
    });

    it("rejects foreign sessions, forged owner identity and stop before any upstream call", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected upstream call"));
      for (const operation of ["state", "play", "switch", "stop"]) {
        const method = operation === "state" ? "GET" : "POST";
        for (const [sessionId, headers] of [
          ["foreign-session", ownerHeaders],
          ["alice-session", { ...ownerHeaders, "x-milady-cloudflare-access-secret": "wrong-proof" }],
          ["alice-session", { ...ownerHeaders, "cf-access-authenticated-user-email": "alice-gameplay-observer.invalid" }],
          ...(operation === "stop" ? [["alice-session", ownerHeaders] as const] : []),
        ] as const) {
          const request = nativeCtx(method, operation, sessionId, headers);
          await handleFive55GamesRoutes(request.ctx);
          expect(request.getStatus()).toBe(403);
        }
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects invalid or extra selection inputs before any upstream call", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected upstream call"));
      for (const body of [
        { gameId: "../other", mode: "agent" },
        { gameId: "555drive", mode: "ranked" },
        { gameId: "555drive", mode: "agent", sessionId: "foreign-session" },
      ]) {
        const request = nativeCtx("POST", "play", "alice-session", ownerHeaders, body);
        await handleFive55GamesRoutes(request.ctx);
        expect(request.getStatus()).toBe(400);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
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
