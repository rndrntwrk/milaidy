import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "FIVE55_GAMES_API_URL",
  "FIVE55_GAMES_API_DIALECT",
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
    envBefore = snapshotEnv();
    process.env.FIVE55_GAMES_API_DIALECT = "agent-v1";
    process.env.STREAM555_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_AGENT_TOKEN = "agent-token";
    delete process.env.FIVE55_GAMES_API_URL;
    delete process.env.STREAM555_AGENT_API_KEY;
    delete process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
    delete process.env.STREAM_SESSION_ID;
    delete process.env.STREAM555_DEFAULT_SESSION_ID;
  });

  afterEach(() => {
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
          game: { id: "ninja", path: "games/ninja" },
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

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, , streamStartCall, playCall] = fetchMock.mock.calls;
    expect(String(streamStartCall[0])).toContain(
      "/api/agent/v1/sessions/session-4/stream/start",
    );
    expect(parseFetchBody(streamStartCall)).toEqual({
      input: {
        type: "screen",
      },
    });
    expect(String(playCall[0])).toContain("/api/agent/v1/sessions/session-4/games/play");
    expect(parseFetchBody(playCall)).toEqual({
      gameId: "ninja",
      mode: "agent",
    });
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
          game: { id: "ninja", path: "games/ninja" },
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

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [, , stopCall, startCall, playCall] = fetchMock.mock.calls;
    expect(String(stopCall[0])).toContain("/api/agent/v1/sessions/session-5/stream/stop");
    expect(String(startCall[0])).toContain("/api/agent/v1/sessions/session-5/stream/start");
    expect(parseFetchBody(startCall)).toEqual({
      input: {
        type: "screen",
      },
    });
    expect(String(playCall[0])).toContain("/api/agent/v1/sessions/session-5/games/play");
    expect(result?.success).toBe(true);
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
          game: { id: "ninja", path: "games/ninja" },
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("E_RUNTIME_EXCEPTION");
    expect(String(envelope.message)).toContain("stream/start provisioning failed (502)");
  });
});
