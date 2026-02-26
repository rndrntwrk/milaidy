import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/registry-client.js", () => ({
  getPluginInfo: vi.fn(),
}));

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
  "STREAM555_ALLOW_LOCALHOST_APP_URLS",
  "STREAM_API_BEARER_TOKEN",
] as const;

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
  const { createStream555ControlPlugin } = await import("./index.js");
  const plugin = createStream555ControlPlugin();
  const actions = plugin.actions ?? [];
  const action = actions.find((entry) => entry.name === name);
  if (!action?.handler) {
    throw new Error(`action ${name} is missing`);
  }
  return action;
}

const INTERNAL_RUNTIME = { agentId: "alice-internal" } as never;
const INTERNAL_MESSAGE = {
  entityId: "alice-internal",
  content: { source: "system" },
} as never;
const INTERNAL_STATE = { values: {} } as never;

describe("stream555-control plugin actions", () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    vi.resetModules();
    envBefore = snapshotEnv();
    process.env.STREAM555_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_AGENT_TOKEN = "test-token";
    delete process.env.STREAM555_AGENT_API_KEY;
    delete process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
    delete process.env.STREAM_API_BEARER_TOKEN;
  });

  afterEach(() => {
    restoreEnv(envBefore);
    vi.restoreAllMocks();
  });

  it("sends radio control as { action, payload } contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-1" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const action = await resolveAction("STREAM555_RADIO_CONTROL");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-1",
          action: "setAutoDJMode",
          mode: "chill",
          target: "music",
          level: "70",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, radioCall] = fetchMock.mock.calls;
    expect(String(radioCall[0])).toContain(
      "/api/agent/v1/radio/session-1/control",
    );
    expect(parseFetchBody(radioCall)).toEqual({
      action: "setAutoDJMode",
      payload: {
        mode: "chill",
        target: "music",
        level: 70,
      },
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("uses screen input + default pip scene for screen share action", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-2" }))
      .mockResolvedValueOnce(jsonResponse(200, { accepted: true }));

    const action = await resolveAction("STREAM555_SCREEN_SHARE");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      { parameters: { sessionId: "session-2" } } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, streamStartCall] = fetchMock.mock.calls;
    expect(String(streamStartCall[0])).toContain(
      "/api/agent/v1/sessions/session-2/stream/start",
    );
    expect(parseFetchBody(streamStartCall)).toEqual({
      input: { type: "screen" },
      options: { scene: "active-pip" },
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("submits segment override with required segmentType", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-3" }))
      .mockResolvedValueOnce(jsonResponse(200, { queued: true }));

    const action = await resolveAction("STREAM555_SEGMENT_OVERRIDE");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-3",
          segmentType: "reaction",
          reason: "breaking-news",
          requestedBy: "control-room",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, overrideCall] = fetchMock.mock.calls;
    expect(String(overrideCall[0])).toContain(
      "/api/agent/v1/sessions/session-3/segments/override",
    );
    expect(parseFetchBody(overrideCall)).toEqual({
      segmentType: "reaction",
      reason: "breaking-news",
      requestedBy: "control-room",
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("normalizes category csv and posts marketplace earnings request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        summary: {
          projectedPayoutPerImpression: 0.12,
        },
      }),
    );

    const action = await resolveAction("STREAM555_EARNINGS_ESTIMATE");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          categories: "gaming, News,  ",
          limit: "3",
          poolSize: "25",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [evaluateCall] = fetchMock.mock.calls;
    expect(String(evaluateCall[0])).toContain(
      "/api/agent/v1/marketplace/evaluate",
    );
    expect(parseFetchBody(evaluateCall)).toEqual({
      categories: ["gaming", "news"],
      limit: 3,
      poolSize: 25,
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("returns a runtime exception envelope when base url is missing", async () => {
    delete process.env.STREAM555_BASE_URL;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const action = await resolveAction("STREAM555_SCREEN_SHARE");

    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      { parameters: { sessionId: "session-fail" } } as never,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("E_RUNTIME_EXCEPTION");
    expect(String(envelope.message)).toContain("STREAM555_BASE_URL");
  });

  it("resolves app viewer URL (prefers non-local) and starts website go-live", async () => {
    const { getPluginInfo } = await import("../../services/registry-client.js");
    vi.mocked(getPluginInfo).mockResolvedValue({
      name: "@elizaos/app-babylon",
      gitRepo: "elizaos/app-babylon",
      gitUrl: "https://github.com/elizaos/app-babylon.git",
      description: "Prediction market platform",
      homepage: "https://babylon.social",
      topics: ["defi"],
      stars: 200,
      language: "TypeScript",
      npm: {
        package: "@elizaos/app-babylon",
        v0Version: null,
        v1Version: null,
        v2Version: "1.0.0",
      },
      git: { v0Branch: null, v1Branch: null, v2Branch: "main" },
      supports: { v0: false, v1: false, v2: true },
      kind: "app",
      appMeta: {
        displayName: "Babylon",
        category: "platform",
        launchType: "url",
        launchUrl: "http://localhost:3000",
        icon: null,
        capabilities: [],
        minPlayers: null,
        maxPlayers: null,
      },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-4" }))
      .mockResolvedValueOnce(jsonResponse(200, { accepted: true }));

    const action = await resolveAction("STREAM555_GO_LIVE_APP");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      { parameters: { appName: "babylon", sessionId: "session-4" } } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, streamStartCall] = fetchMock.mock.calls;
    expect(String(streamStartCall[0])).toContain(
      "/api/agent/v1/sessions/session-4/stream/start",
    );
    expect(parseFetchBody(streamStartCall)).toEqual({
      input: { type: "website", url: "https://babylon.social" },
      options: {
        scene: "default",
        appName: "@elizaos/app-babylon",
        resolvedFrom: "homepage",
        app: {
          name: "@elizaos/app-babylon",
          displayName: "Babylon",
          category: "platform",
          launchType: "url",
          viewer: null,
          requirements: {
            wrapperRequired: false,
            wrapperProvided: false,
            publicUrlRequired: false,
            localhostAllowed: true,
          },
        },
      },
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("falls back to localhost launchUrl for local-only apps when wrapper URL is not provided", async () => {
    const { getPluginInfo } = await import("../../services/registry-client.js");
    vi.mocked(getPluginInfo).mockResolvedValue({
      name: "@elizaos/app-hyperscape",
      gitRepo: "elizaos/app-hyperscape",
      gitUrl: "https://github.com/elizaos/app-hyperscape.git",
      description: "Hyperscape",
      homepage: "",
      topics: ["rpg"],
      stars: 50,
      language: "TypeScript",
      npm: {
        package: "@elizaos/app-hyperscape",
        v0Version: null,
        v1Version: null,
        v2Version: "1.0.0",
      },
      git: { v0Branch: null, v1Branch: null, v2Branch: "main" },
      supports: { v0: false, v1: false, v2: true },
      kind: "app",
      appMeta: {
        displayName: "Hyperscape",
        category: "game",
        launchType: "connect",
        launchUrl: "http://localhost:3333",
        icon: null,
        capabilities: [],
        minPlayers: null,
        maxPlayers: null,
        viewer: {
          url: "http://localhost:3333",
          postMessageAuth: true,
        },
      },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-local" }))
      .mockResolvedValueOnce(jsonResponse(200, { accepted: true }));

    const action = await resolveAction("STREAM555_GO_LIVE_APP");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      { parameters: { appName: "hyperscape", sessionId: "session-local" } } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, streamStartCall] = fetchMock.mock.calls;
    expect(parseFetchBody(streamStartCall)).toEqual({
      input: { type: "website", url: "http://localhost:3333" },
      options: {
        scene: "default",
        appName: "@elizaos/app-hyperscape",
        resolvedFrom: "launchUrl",
        app: {
          name: "@elizaos/app-hyperscape",
          displayName: "Hyperscape",
          category: "game",
          launchType: "connect",
          viewer: {
            postMessageAuth: true,
            sandbox: null,
            embedParamKeys: [],
          },
          requirements: {
            wrapperRequired: true,
            wrapperProvided: false,
            publicUrlRequired: false,
            localhostAllowed: true,
          },
        },
      },
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });
});
