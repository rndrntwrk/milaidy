import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStream555ControlPlugin } from "./index.js";

type EnvSnapshot = Record<string, string | undefined>;

const ENV_KEYS = [
  "STREAM555_BASE_URL",
  "STREAM555_AGENT_TOKEN",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN_EXCHANGE_ENDPOINT",
  "STREAM555_AGENT_TOKEN_REFRESH_WINDOW_SECONDS",
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

function resolveAction(name: string) {
  const plugin = createStream555ControlPlugin();
  const actions = plugin.actions ?? [];
  const action = actions.find((entry) => entry.name === name);
  if (!action?.handler) {
    throw new Error(`action ${name} is missing`);
  }
  return action;
}

describe("stream555-control plugin actions", () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
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

    const action = resolveAction("STREAM555_RADIO_CONTROL");
    const result = await action.handler?.(
      {} as never,
      {} as never,
      {} as never,
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

    const action = resolveAction("STREAM555_SCREEN_SHARE");
    const result = await action.handler?.(
      {} as never,
      {} as never,
      {} as never,
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

    const action = resolveAction("STREAM555_SEGMENT_OVERRIDE");
    const result = await action.handler?.(
      {} as never,
      {} as never,
      {} as never,
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

    const action = resolveAction("STREAM555_EARNINGS_ESTIMATE");
    const result = await action.handler?.(
      {} as never,
      {} as never,
      {} as never,
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
    const action = resolveAction("STREAM555_SCREEN_SHARE");

    const result = await action.handler?.(
      {} as never,
      {} as never,
      {} as never,
      { parameters: { sessionId: "session-fail" } } as never,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result?.success).toBe(false);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("E_RUNTIME_EXCEPTION");
    expect(String(envelope.message)).toContain("STREAM555_BASE_URL");
  });
});
