import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateExchangedAgentTokenCache } from "../five55-shared/agent-auth.js";

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "FIVE55_GAMES_API_URL",
  "FIVE55_GAMES_API_DIALECT",
  "FIVE55_GAMES_CF_CONNECT_TIMEOUT_MS",
  "FIVE55_GAMES_CF_CONNECT_POLL_MS",
  "FIVE55_GAMES_CF_RECOVERY_ATTEMPTS",
  "MILAIDY_API_URL",
  "MILAIDY_PORT",
  "MILAIDY_API_TOKEN",
  "STREAM555_BASE_URL",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
  "STREAM_SESSION_ID",
  "STREAM555_DEFAULT_SESSION_ID",
  "FIVE55_GAMES_VIEWER_BASE_URL",
  "GAMES_BASE_URL",
  "ALICE_INTELLIGENCE_ENABLED",
  "ALICE_LEARNING_WRITEBACK_ENABLED",
  "MILADY_STATE_DIR",
] as const;

const INTERNAL_RUNTIME = { agentId: "alice-internal" } as never;
const INTERNAL_MESSAGE = {
  entityId: "alice-internal",
  content: { source: "system" },
} as never;
const INTERNAL_STATE = { values: {} } as never;

function snapshotEnv(): EnvSnapshot {
  const snapshot: EnvSnapshot = {};
  for (const key of ENV_KEYS) snapshot[key] = process.env[key];
  return snapshot;
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function parseFetchBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as RequestInit | undefined;
  const body = init?.body;
  if (typeof body !== "string") return {};
  return JSON.parse(body) as Record<string, unknown>;
}

function parseEnvelope(result: { text: string }): Record<string, unknown> {
  return JSON.parse(result.text) as Record<string, unknown>;
}

async function resolveAction(name: string) {
  const { createFive55GamesPlugin } = await import("./index.js");
  const plugin = createFive55GamesPlugin();
  const actions = plugin.actions ?? [];
  const action = actions.find((entry) => entry.name === name);
  if (!action?.handler) {
    throw new Error(`action ${name} is missing`);
  }
  return action;
}

describe("five55-games plugin actions", () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    vi.resetModules();
    invalidateExchangedAgentTokenCache();
    envBefore = snapshotEnv();
    process.env.FIVE55_GAMES_API_DIALECT = "agent-v1";
    process.env.FIVE55_GAMES_CF_CONNECT_TIMEOUT_MS = "1";
    process.env.FIVE55_GAMES_CF_CONNECT_POLL_MS = "1";
    process.env.FIVE55_GAMES_CF_RECOVERY_ATTEMPTS = "1";
    process.env.STREAM555_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_AGENT_TOKEN = "agent-token";
    process.env.ALICE_INTELLIGENCE_ENABLED = "true";
    process.env.ALICE_LEARNING_WRITEBACK_ENABLED = "true";
    delete process.env.FIVE55_GAMES_API_URL;
    delete process.env.STREAM555_AGENT_API_KEY;
    delete process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
    delete process.env.STREAM_SESSION_ID;
    delete process.env.STREAM555_DEFAULT_SESSION_ID;
  });

  afterEach(() => {
    invalidateExchangedAgentTokenCache();
    restoreEnv(envBefore);
    vi.restoreAllMocks();
  });

  it("defaults agent-v1 play mode to agent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      { parameters: { gameId: "ninja" } } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, playCall] = fetchMock.mock.calls;
    expect(String(playCall[0])).toContain("/api/agent/v1/sessions/session-1/games/play");
    expect(parseFetchBody(playCall)).toEqual({
      gameId: "ninja",
      mode: "agent",
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("resolves gameId from catalog when omitted in agent-v1 mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-2" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          games: [{ id: "555drive" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "555drive", path: "games/555drive" },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      { parameters: {} } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, , playCall] = fetchMock.mock.calls;
    expect(parseFetchBody(playCall)).toEqual({
      gameId: "555drive",
      mode: "agent",
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("passes explicit solo mode to game launch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-3" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
          mode: "solo",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, playCall] = fetchMock.mock.calls;
    expect(parseFetchBody(playCall)).toEqual({
      gameId: "ninja",
      mode: "solo",
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("passes masteryProfile payload through play action", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-mastery" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
          mode: "agent",
          masteryProfile: {
            suiteId: "suite-1",
            runId: "run-1",
            episodeIndex: 1,
          },
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, playCall] = fetchMock.mock.calls;
    expect(parseFetchBody(playCall)).toEqual({
      gameId: "ninja",
      mode: "agent",
      masteryProfile: {
        suiteId: "suite-1",
        runId: "run-1",
        episodeIndex: 1,
      },
    });
    expect(result?.success).toBe(true);
  });

  it("resolves mastery brief using alias game ids", async () => {
    const action = await resolveAction("FIVE55_GAMES_MASTERY_BRIEF");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja-vs-evilcorp",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    const data = envelope.data as Record<string, unknown>;
    expect(data.gameId).toBe("ninja");
    const contract = data.contract as Record<string, unknown>;
    expect(contract.gameId).toBe("ninja");
    expect(Array.isArray(contract.controls)).toBe(true);
  });

  it("provisions Cloudflare output before play when session is inactive", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-4" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: false,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { status: "created", cfSessionId: "cf-4" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sessionId: "session-4",
          agentId: "alice",
          gameId: "ninja",
          profile: {
            exists: false,
            policyVersion: 1,
            confidence: 0.5,
            policySnapshot: {},
            provenance: { source: "default" },
          },
          latestEpisode: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "live",
          cfSessionId: "cf-4",
          cloudflare: {
            isConnected: true,
            state: "connected",
          },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_GO_LIVE_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
        },
      } as never,
    );

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
    const streamStartCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/agent/v1/sessions/session-4/stream/start"),
    );
    const playCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/agent/v1/sessions/session-4/games/play"),
    );
    const statusCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/agent/v1/sessions/session-4/stream/status"),
    );
    expect(streamStartCall).toBeDefined();
    expect(playCall).toBeDefined();
    expect(statusCall).toBeDefined();
    expect(String(streamStartCall?.[0])).toContain(
      "/api/agent/v1/sessions/session-4/stream/start",
    );
    expect(parseFetchBody(streamStartCall as unknown[])).toEqual({
      input: {
        type: "screen",
      },
      options: {
        scene: "active-pip",
      },
    });
    expect(String(playCall?.[0])).toContain("/api/agent/v1/sessions/session-4/games/play");
    expect(parseFetchBody(playCall as unknown[])).toEqual(
      expect.objectContaining({
        gameId: "ninja",
        mode: "agent",
        controlAuthority: "milaidy",
        policyVersion: 1,
        policySnapshot: expect.any(Object),
        policyFamily: expect.any(String),
      }),
    );
    expect(String(statusCall?.[0])).toContain(
      "/api/agent/v1/sessions/session-4/stream/status",
    );
    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    expect(envelope.action).toBe("FIVE55_GAMES_GO_LIVE_PLAY");
  });

  it("auto-recovers active direct stream sessions before play", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-5" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { stopped: true }))
      .mockResolvedValueOnce(jsonResponse(201, { status: "created", cfSessionId: "cf-5" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sessionId: "session-5",
          agentId: "alice",
          gameId: "ninja",
          profile: {
            exists: false,
            policyVersion: 1,
            confidence: 0.5,
            policySnapshot: {},
            provenance: { source: "default" },
          },
          latestEpisode: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "queued",
          cfSessionId: "cf-5",
          cloudflare: {
            isConnected: false,
            state: "disconnected",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { stopped: true }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: false,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { status: "created", cfSessionId: "cf-5b" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "live",
          cfSessionId: "cf-5b",
          cloudflare: {
            isConnected: true,
            state: "connected",
          },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_GO_LIVE_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
        },
      } as never,
    );

    const calledUrls = fetchMock.mock.calls.map((entry) => String(entry[0]));
    expect(
      calledUrls.filter((url) => url.includes("/stream/stop")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      calledUrls.filter((url) => url.includes("/stream/start")).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      calledUrls.filter((url) => url.includes("/games/play")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      calledUrls.filter((url) => url.includes("/stream/status")).length,
    ).toBeGreaterThanOrEqual(2);
    const stopCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/agent/v1/sessions/session-5/stream/stop"),
    );
    const startCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/agent/v1/sessions/session-5/stream/start"),
    );
    expect(stopCall).toBeDefined();
    expect(startCall).toBeDefined();
    expect(String(stopCall?.[0])).toContain("/api/agent/v1/sessions/session-5/stream/stop");
    expect(String(startCall?.[0])).toContain("/api/agent/v1/sessions/session-5/stream/start");
    expect(parseFetchBody(startCall as unknown[])).toEqual({
      input: {
        type: "screen",
      },
      options: {
        scene: "active-pip",
      },
    });
    expect(result?.success).toBe(true);
  });

  it("honors explicit camera-full layout mode during stream provisioning", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-layout" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: false,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { status: "created", cfSessionId: "cf-layout" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sessionId: "session-layout",
          agentId: "alice",
          gameId: "ninja",
          profile: {
            exists: false,
            policyVersion: 1,
            confidence: 0.5,
            policySnapshot: {},
            provenance: { source: "default" },
          },
          latestEpisode: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "live",
          cfSessionId: "cf-layout",
          cloudflare: {
            isConnected: true,
            state: "connected",
          },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_GO_LIVE_PLAY");
    await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
          layoutMode: "camera-full",
        },
      } as never,
    );

    const startCall = fetchMock.mock.calls.find((entry) =>
      String(entry[0]).includes("/api/agent/v1/sessions/session-layout/stream/start"),
    );
    expect(parseFetchBody(startCall as unknown[])).toEqual({
      input: {
        type: "screen",
      },
      options: {
        scene: "default",
      },
    });
  });

  it("skips stream provisioning when Cloudflare output is already present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-6" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          cfSessionId: "cf-6",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sessionId: "session-6",
          agentId: "alice",
          gameId: "ninja",
          profile: {
            exists: false,
            policyVersion: 1,
            confidence: 0.5,
            policySnapshot: {},
            provenance: { source: "default" },
          },
          latestEpisode: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "live",
          cfSessionId: "cf-6",
          cloudflare: {
            isConnected: true,
            state: "connected",
          },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_GO_LIVE_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
        },
      } as never,
    );

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    const calledUrls = fetchMock.mock.calls.map((entry) => String(entry[0]));
    expect(calledUrls.some((url) => url.includes("/stream/start"))).toBe(false);
    expect(calledUrls.some((url) => url.includes("/stream/stop"))).toBe(false);
    expect(result?.success).toBe(true);
  });

  it("returns failure when Cloudflare provisioning fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-7" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: false,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(502, { error: "cf unavailable" }));

    const action = await resolveAction("FIVE55_GAMES_GO_LIVE_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
        },
      } as never,
    );

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("E_RUNTIME_EXCEPTION");
    expect(String(envelope.message)).toContain("stream/start provisioning failed (502)");
  });

  it("returns failure when Cloudflare never connects after recovery budget", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-8" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: false,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { status: "created", cfSessionId: "cf-8" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          sessionId: "session-8",
          agentId: "alice",
          gameId: "ninja",
          profile: {
            exists: false,
            policyVersion: 1,
            confidence: 0.5,
            policySnapshot: {},
            provenance: { source: "default" },
          },
          latestEpisode: null,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "queued",
          cfSessionId: "cf-8",
          cloudflare: {
            isConnected: false,
            state: "disconnected",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { stopped: true }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: false,
          cfSessionId: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { status: "created", cfSessionId: "cf-8b" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          game: { id: "ninja", path: "games/ninja" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: true,
          phase: "queued",
          cfSessionId: "cf-8b",
          cloudflare: {
            isConnected: false,
            state: "disconnected",
          },
        }),
      )
      .mockResolvedValue(
        jsonResponse(200, {
          active: true,
          phase: "queued",
          cfSessionId: "cf-8b",
          cloudflare: {
            isConnected: false,
            state: "disconnected",
          },
        }),
      );

    const action = await resolveAction("FIVE55_GAMES_GO_LIVE_PLAY");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          gameId: "ninja",
        },
      } as never,
    );

    const calledUrls = fetchMock.mock.calls.map((entry) => String(entry[0]));
    expect(
      calledUrls.filter((url) => url.includes("/games/play")).length,
    ).toBe(2);
    expect(
      calledUrls.filter((url) => url.includes("/stream/status")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("E_RUNTIME_EXCEPTION");
    expect(String(envelope.message)).toContain(
      "Cloudflare ingest stayed disconnected after 2 play attempt(s)",
    );
  });

  it("runs dry-run live capability sprint with 16 games plus 2 diagnostics", async () => {
    const learningCalls = new Map<string, number>();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/api/agent/v1/sessions")) {
        return jsonResponse(200, { sessionId: "session-sprint-1" });
      }

      if (url.includes("/api/agent/v1/sessions/session-sprint-1/ads")) {
        return jsonResponse(200, {
          ads: [
            { id: "ad01", name: "Ad 1" },
            { id: "ad02", name: "Ad 2" },
            { id: "ad03", name: "Ad 3" },
            { id: "ad04", name: "Ad 4" },
            { id: "ad05", name: "Ad 5" },
            { id: "ad06", name: "Ad 6" },
          ],
        });
      }

      if (
        url.includes("/api/agent/v1/sessions/session-sprint-1")
        && !url.includes("/games/")
        && !url.includes("/stream/")
      ) {
        return jsonResponse(200, {
          active: true,
          cfSessionId: "cf-sprint-1",
        });
      }

      if (url.includes("/api/agent/v1/sessions/session-sprint-1/stream/status")) {
        return jsonResponse(200, {
          active: true,
          phase: "live",
          cfSessionId: "cf-sprint-1",
          cloudflare: {
            isConnected: true,
            state: "connected",
          },
        });
      }

      if (url.includes("/api/agent/v1/sessions/session-sprint-1/games/catalog")) {
        return jsonResponse(200, {
          games: [
            { id: "knighthood" },
            { id: "sector-13" },
            { id: "ninja" },
            { id: "clawstrike" },
            { id: "555drive" },
            { id: "chesspursuit" },
            { id: "wolf-and-sheep" },
            { id: "leftandright" },
            { id: "playback" },
            { id: "fighter-planes" },
            { id: "floor13" },
            { id: "godai-is-back" },
            { id: "peanball" },
            { id: "eat-my-dust" },
            { id: "where-were-going-we-do-need-roads" },
            { id: "vedas-run" },
          ],
        });
      }

      const learningMatch = url.match(
        /\/api\/agent\/v1\/sessions\/session-sprint-1\/games\/([^/]+)\/learning/,
      );
      if (learningMatch?.[1]) {
        const gameId = decodeURIComponent(learningMatch[1]);
        const nextCount = (learningCalls.get(gameId) ?? 0) + 1;
        learningCalls.set(gameId, nextCount);
        return jsonResponse(200, {
          sessionId: "session-sprint-1",
          agentId: "alice",
          gameId,
          profile: {
            exists: true,
            id: `profile-${gameId}`,
            policyVersion: nextCount,
            confidence: 0.5,
            policySnapshot: { profileBias: 0.5 },
            provenance: { source: "test" },
            lastTelemetryAt: null,
            lastEpisodeId: null,
            lastEpisodeAt: null,
            updatedAt: new Date().toISOString(),
          },
          latestEpisode: {
            id: `episode-${gameId}-${nextCount}`,
            score: nextCount * 100,
            survivalMs: nextCount * 1000,
            causeOfDeath: nextCount % 2 === 0 ? null : "SPIKE",
            policyVersion: nextCount,
          },
        });
      }

      return jsonResponse(404, { error: `Unhandled URL in test: ${url}` });
    });

    const action = await resolveAction("FIVE55_GAMES_LIVE_CAPABILITY_SPRINT");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          dryRun: "true",
          slotSeconds: "0",
        },
      } as never,
    );

    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    const data = envelope.data as Record<string, unknown>;
    const summary = data.summary as Record<string, unknown>;
    const slots = data.slots as Array<Record<string, unknown>>;
    expect(summary.completedSlots).toBe(18);
    expect(summary.expectedSlots).toBe(18);
    expect(slots).toHaveLength(18);
    expect(
      slots.filter((entry) => entry.diagnosticRetest === true).length,
    ).toBe(2);
  });
});
