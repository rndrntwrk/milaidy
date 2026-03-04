import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/registry-client.js", () => ({
  getPluginInfo: vi.fn(),
}));

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM_API_URL",
  "STREAM555_PUBLIC_BASE_URL",
  "STREAM555_INTERNAL_BASE_URL",
  "STREAM555_INTERNAL_AGENT_IDS",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
  "STREAM555_ALLOW_LOCALHOST_APP_URLS",
  "STREAM555_DEST_SYNC_ON_GO_LIVE",
  "STREAM555_DEST_X_RTMP_URL",
  "STREAM555_DEST_X_STREAM_KEY",
  "STREAM555_DEST_X_ENABLED",
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

const INTERNAL_STATE = { values: {} } as never;

function makeRuntime(agentId = "alice-internal") {
  return {
    agentId,
    getSetting: (key: string) => process.env[key],
  } as never;
}

function makeMessage(agentId = "alice-internal") {
  return {
    entityId: agentId,
    content: { source: "system" },
  } as never;
}

describe("stream555-control plugin actions", () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    vi.resetModules();
    envBefore = snapshotEnv();
    process.env.STREAM555_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_PUBLIC_BASE_URL = "https://stream.rndrntwrk.com";
    process.env.STREAM555_INTERNAL_BASE_URL = "http://control-plane:3000";
    process.env.STREAM555_INTERNAL_AGENT_IDS = "alice,alice-internal";
    process.env.STREAM555_AGENT_TOKEN = "test-token";
    delete process.env.STREAM555_AGENT_API_KEY;
    delete process.env.STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT;
    delete process.env.STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS;
    delete process.env.STREAM_API_BEARER_TOKEN;
    delete process.env.STREAM555_DEST_SYNC_ON_GO_LIVE;
    delete process.env.STREAM555_DEST_X_RTMP_URL;
    delete process.env.STREAM555_DEST_X_STREAM_KEY;
    delete process.env.STREAM555_DEST_X_ENABLED;
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
      makeRuntime(),
      makeMessage(),
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

  it("applies configured destination credentials to platform + session toggle", async () => {
    process.env.STREAM555_DEST_X_RTMP_URL = "rtmps://or.pscp.tv:443/x";
    process.env.STREAM555_DEST_X_STREAM_KEY = "x-key";
    process.env.STREAM555_DEST_X_ENABLED = "true";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-plat-1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          platformId: "x",
          enabled: true,
          configured: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          platformId: "x",
          enabled: true,
        }),
      );

    const action = await resolveAction("STREAM555_DESTINATIONS_APPLY");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-plat-1",
          platforms: "x",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/agent/v1/platforms/x");
    expect(parseFetchBody(fetchMock.mock.calls[1])).toEqual({
      rtmpUrl: "rtmps://or.pscp.tv:443/x",
      streamKey: "x-key",
      enabled: true,
    });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "/api/agent/v1/sessions/session-plat-1/platforms/x/toggle",
    );
    expect(parseFetchBody(fetchMock.mock.calls[2])).toEqual({ enabled: true });
    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    const data = envelope.data as Record<string, unknown>;
    expect(data.attempted).toBe(1);
  });

  it("syncs destinations automatically before go-live when enabled", async () => {
    process.env.STREAM555_DEST_SYNC_ON_GO_LIVE = "true";
    process.env.STREAM555_DEST_X_RTMP_URL = "rtmps://or.pscp.tv:443/x";
    process.env.STREAM555_DEST_X_STREAM_KEY = "x-key";
    process.env.STREAM555_DEST_X_ENABLED = "true";

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-live-1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          platformId: "x",
          enabled: true,
          configured: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          platformId: "x",
          enabled: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { accepted: true }));

    const action = await resolveAction("STREAM555_GO_LIVE");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-live-1",
          inputType: "screen",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/agent/v1/platforms/x");
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "/api/agent/v1/sessions/session-live-1/platforms/x/toggle",
    );
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      "/api/agent/v1/sessions/session-live-1/stream/start",
    );
    expect(result?.success).toBe(true);
  });

  it("uses screen input + default pip scene for screen share action", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-2" }))
      .mockResolvedValueOnce(jsonResponse(200, { accepted: true }));

    const action = await resolveAction("STREAM555_SCREEN_SHARE");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
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
      makeRuntime(),
      makeMessage(),
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

  it("routes l-bar ad creation through brand-intake template endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-ad-1" }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, ad: { id: "ad-1" } }));

    const action = await resolveAction("STREAM555_AD_CREATE");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-ad-1",
          type: "l-bar",
          adName: "Alice Promo",
          brandName: "Alice Promo",
          imageUrl: "https://cdn.example.com/promo.png",
          text: "Level up with Alice",
          ctaUrl: "https://example.com/play",
          durationMs: "15000",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createCall] = fetchMock.mock.calls;
    expect(String(createCall[0])).toContain(
      "/api/agent/v1/sessions/session-ad-1/ads/l-bar/from-brand",
    );
    const payload = parseFetchBody(createCall);
    expect(payload._adName).toBe("Alice Promo");
    expect(payload._duration).toBe(15000);
    const brand = payload.brand as Record<string, unknown>;
    expect(typeof brand.id).toBe("string");
    expect(String(brand.id)).toContain("alice-promo");
    expect(brand.name).toBe("Alice Promo");
    expect(brand.color).toBe("#6D28D9");
    expect(brand.tagline).toBe("Level up with Alice");
    expect(brand.video).toEqual({
      src: "https://cdn.example.com/promo.png",
      aspect: "square",
      type: "image",
    });
    expect(brand.cta).toEqual({
      text: "Level up with Alice",
      url: "https://example.com/play",
    });
    expect(brand.qr).toEqual({
      url: "https://example.com/play",
      label: "Level up with Alice",
    });
    expect(result?.success).toBe(true);
    expect(parseEnvelope(result as { text: string }).code).toBe("OK");
  });

  it("falls back to generic ads endpoint when l-bar media input is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-ad-2" }))
      .mockResolvedValueOnce(jsonResponse(201, { success: true, ad: { id: "ad-2" } }));

    const action = await resolveAction("STREAM555_AD_CREATE");
    const result = await action.handler?.(
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-ad-2",
          type: "l-bar",
          adName: "Fallback Ad",
          text: "Fallback copy",
          durationMs: "12000",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, createCall] = fetchMock.mock.calls;
    expect(String(createCall[0])).toContain("/api/agent/v1/sessions/session-ad-2/ads");
    expect(String(createCall[0])).not.toContain("/from-brand");
    expect(parseFetchBody(createCall)).toEqual({
      type: "l-bar",
      layout: "l-bar",
      name: "Fallback Ad",
      duration: 12000,
      mainContent: {
        title: "Fallback copy",
      },
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
      makeRuntime(),
      makeMessage(),
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

  it("falls back to public base URL for non-internal agents when explicit base env is missing", async () => {
    delete process.env.STREAM555_BASE_URL;
    delete process.env.STREAM_API_URL;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        summary: { projectedPayoutPerImpression: 0.12 },
      }),
    );

    const action = await resolveAction("STREAM555_EARNINGS_ESTIMATE");
    const result = await action.handler?.(
      makeRuntime("builder-agent"),
      makeMessage("builder-agent"),
      INTERNAL_STATE,
      { parameters: {} } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "https://stream.rndrntwrk.com/api/agent/v1/marketplace/evaluate",
    );
    expect(result?.success).toBe(true);
  });

  it("falls back to internal base URL for internal agents when explicit base env is missing", async () => {
    delete process.env.STREAM555_BASE_URL;
    delete process.env.STREAM_API_URL;
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        summary: { projectedPayoutPerImpression: 0.12 },
      }),
    );

    const action = await resolveAction("STREAM555_EARNINGS_ESTIMATE");
    const result = await action.handler?.(
      makeRuntime("alice"),
      makeMessage("alice"),
      INTERNAL_STATE,
      { parameters: {} } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "http://control-plane:3000/api/agent/v1/marketplace/evaluate",
    );
    expect(result?.success).toBe(true);
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
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      { parameters: { appName: "babylon", sessionId: "session-4" } } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, streamStartCall] = fetchMock.mock.calls;
    expect(String(streamStartCall[0])).toContain(
      "/api/agent/v1/sessions/session-4/stream/start",
    );
    expect(parseFetchBody(streamStartCall)).toEqual({
      input: { type: "website", url: "https://babylon.market/" },
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

  it("prefers managed stream URL defaults for known apps", async () => {
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
      makeRuntime(),
      makeMessage(),
      INTERNAL_STATE,
      { parameters: { appName: "hyperscape", sessionId: "session-local" } } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, streamStartCall] = fetchMock.mock.calls;
    expect(parseFetchBody(streamStartCall)).toEqual({
      input: { type: "website", url: "https://hyperscape.gg/" },
      options: {
        scene: "default",
        appName: "@elizaos/app-hyperscape",
        resolvedFrom: "homepage",
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
