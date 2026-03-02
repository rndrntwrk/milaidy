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

function parseEnvelope(result: { text: string }): Record<string, unknown> {
  return JSON.parse(result.text) as Record<string, unknown>;
}

async function resolveAction(name: string) {
  const { createStream555AdsPlugin } = await import("./index.js");
  const plugin = createStream555AdsPlugin();
  const action = (plugin.actions ?? []).find((entry) => entry.name === name);
  if (!action?.handler) throw new Error(`action ${name} is missing`);
  return action;
}

const INTERNAL_RUNTIME = { agentId: "alice-internal" } as never;
const INTERNAL_MESSAGE = {
  entityId: "alice-internal",
  content: { source: "system" },
} as never;
const INTERNAL_STATE = { values: {} } as never;

describe("stream555-ads plugin actions", () => {
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

  it("bootstraps campaign-backed defaults and reports ad inventory", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-ads-1" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          evaluated: [
            { campaignId: "camp-1", eligible: true },
            { campaignId: "camp-2", eligible: true },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(201, { acceptance: { campaignId: "camp-1" } }))
      .mockResolvedValueOnce(jsonResponse(201, { ad: { id: "ad-1" }, deduped: false }))
      .mockResolvedValueOnce(jsonResponse(201, { acceptance: { campaignId: "camp-2" } }))
      .mockResolvedValueOnce(jsonResponse(201, { ad: { id: "ad-2" }, deduped: false }))
      .mockResolvedValueOnce(jsonResponse(200, { ads: [{ id: "ad-1" }, { id: "ad-2" }] }));

    const action = await resolveAction("STREAM555_ADS_SETUP_DEFAULTS");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-ads-1",
          categories: "gaming,arcade",
          limit: "2",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    expect(envelope.code).toBe("OK");
    const data = envelope.data as Record<string, unknown>;
    expect(data.sessionId).toBe("session-ads-1");
    expect(data.adCount).toBe(2);
  });

  it("triggers next ad and waits for render acknowledgement", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-ads-2" }))
      .mockResolvedValueOnce(jsonResponse(200, { ads: [{ id: "ad-1" }, { id: "ad-2" }] }))
      .mockResolvedValueOnce(jsonResponse(200, { graphic: { id: "graphic-1" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: {
            adId: "ad-1",
            graphicId: "graphic-1",
            renderAcked: true,
          },
        }),
      );

    const action = await resolveAction("STREAM555_ADS_TRIGGER_NEXT");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: {
          sessionId: "session-ads-2",
        },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    const data = envelope.data as Record<string, unknown>;
    expect(data.sessionId).toBe("session-ads-2");
    expect(data.adId).toBe("ad-1");
    expect(data.rendered).toBe(true);
  });

  it("returns runtime status with earnings snapshot", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { sessionId: "session-ads-3" }))
      .mockResolvedValueOnce(jsonResponse(200, { ads: [{ id: "ad-1" }] }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          active: { adId: "ad-1", renderAcked: true },
          runtime: { nextEligibleAt: "2026-02-28T00:00:00.000Z" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          earnings: { totalEarned: 123, totalImpressions: 7 },
        }),
      );

    const action = await resolveAction("STREAM555_ADS_STATUS");
    const result = await action.handler?.(
      INTERNAL_RUNTIME,
      INTERNAL_MESSAGE,
      INTERNAL_STATE,
      {
        parameters: { sessionId: "session-ads-3" },
      } as never,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result?.success).toBe(true);
    const envelope = parseEnvelope(result as { text: string });
    const data = envelope.data as Record<string, unknown>;
    expect(data.adCount).toBe(1);
    expect((data.earnings as Record<string, unknown>).totalEarned).toBe(123);
  });
});
