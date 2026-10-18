import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { IAgentRuntime } from "../types/index.js";
import { createApprovalRequest } from "../routes/approvals.js";
import { StreamControlService } from "./StreamControlService.js";

const STREAM_ENV_KEYS = [
  "STREAM555_DEFAULT_SESSION_ID",
  "STREAM555_BASE_URL",
  "STREAM555_PUBLIC_BASE_URL",
  "STREAM555_INTERNAL_BASE_URL",
  "STREAM555_INTERNAL_AGENT_IDS",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM_API_BEARER_TOKEN",
  "STREAM555_DEST_PUMPFUN_ENABLED",
  "STREAM555_DEST_PUMPFUN_RTMP_URL",
  "STREAM555_DEST_PUMPFUN_STREAM_KEY",
  "STREAM555_DEST_X_ENABLED",
  "STREAM555_DEST_X_RTMP_URL",
  "STREAM555_DEST_X_STREAM_KEY",
] as const;

const ORIGINAL_ENV = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!ORIGINAL_ENV.has(key)) {
    ORIGINAL_ENV.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

describe("StreamControlService", () => {
  beforeEach(() => {
    for (const key of STREAM_ENV_KEYS) {
      setEnv(key, undefined);
    }
  });

  afterEach(() => {
    for (const [key, value] of ORIGINAL_ENV.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    ORIGINAL_ENV.clear();
  });

  it("reads the same configured native session without exposing secrets or mutating it", async () => {
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "private-server-token");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ origin: string; path: string; method: string | undefined; session: string | null }> = [];
    setEnv("STREAM555_INTERNAL_BASE_URL", "http://legacy-control-plane:3000");
    let revision = 7;
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      calls.push({ origin: new URL(String(input)).origin, path, method: init?.method, session: new Headers(init?.headers).get("X-Session-Id") });
      const data = path.endsWith('/composition') ? { sessionId: 'alice-session', snapshot: {
        schemaVersion: 1, revision, productionState: { aspectRatio: '16:9', activeLayout: 'pip', pipPosition: 'bottom-right',
          broadcastOverlay: { enabled: true, mode: 'filter' }, sources: [
            { id: 'game', type: 'game', gameId: '555drive', visible: true, url: 'private-source-url' },
            { id: 'pip', type: 'avatar', avatarPreset: 'alice-3d', visible: true }], token: 'private-composition-token' } } }
        : path.endsWith('/destinations') ? { sessionId: 'alice-session', destinations: [
          { platformId: 'youtube', enabled: true, configured: true, streamKey: 'private-stream-key', rtmpUrl: 'private-rtmp-url' }] }
        : { sessionId: 'alice-session', active: true, token: 'private-status-token' };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    };
    const service = await StreamControlService.start({ agentId: "alice" } as IAgentRuntime);
    try {
      const saved = await service.getNativeSetup();
      assert.equal(saved.studioUrl, 'https://stream.rndrntwrk.com/studio?sessionId=alice-session');
      assert.equal(service.getConfig()?.baseUrl, 'http://legacy-control-plane:3000');
      assert.equal(saved.revision, 7);
      assert.equal(saved.activeLayout, 'pip');
      assert.equal(saved.pipPosition, 'bottom-right');
      assert.equal(saved.sources[0].gameId, '555drive');
      assert.equal(saved.sources[1].avatarPreset, 'alice-3d');
      assert.deepEqual(saved.destinations, [{ platformId: 'youtube', enabled: true, configured: true }]);
      assert.equal(saved.active, true);
      assert.doesNotMatch(JSON.stringify(saved), /private-/);
      assert.equal(service.getBoundSessionId(), null);
      revision = 8;
      assert.equal((await service.getNativeSetup()).revision, 8);
      assert.equal(calls.length, 6);
      assert.ok(calls.every(call => call.method === 'GET' && call.session === 'alice-session' && call.origin === 'https://stream.rndrntwrk.com'));
      assert.deepEqual(new Set(calls.map(call => call.path)), new Set([
        '/api/session/composition', '/api/session/destinations', '/api/stream/status']));
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("requires explicit native binding and rejects denied or mismatched native readback", async () => {
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "private-server-token");
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{"error":"private-denial"}', { status: 403 }); };
    let service = await StreamControlService.start({} as IAgentRuntime);
    try {
      await assert.rejects(service.getNativeSetup(), /DEFAULT_SESSION_ID/);
      assert.equal(calls, 0);
      await service.stop();
      setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
      service = await StreamControlService.start({} as IAgentRuntime);
      await assert.rejects(service.getNativeSetup(), /admission or readback is unavailable/);
      assert.equal(service.getBoundSessionId(), null);
      globalThis.fetch = async () => new Response('{"sessionId":"other-owner-session","active":true}');
      await assert.rejects(service.getNativeSetup(), /did not match the configured session/);
      assert.equal(service.getBoundSessionId(), null);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("starts through the runtime service contract and reports channel readiness", async () => {
    setEnv("STREAM555_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "stream-static-token");
    setEnv("STREAM555_DEST_PUMPFUN_ENABLED", "true");
    setEnv(
      "STREAM555_DEST_PUMPFUN_RTMP_URL",
      "rtmps://pump-prod-tg2x8veh.rtmp.livekit.cloud/x",
    );
    setEnv("STREAM555_DEST_PUMPFUN_STREAM_KEY", "pump-stream-key");
    setEnv("STREAM555_DEST_X_RTMP_URL", "rtmps://or.pscp.tv:443/x");
    setEnv("STREAM555_DEST_X_STREAM_KEY", "x-stream-key");

    const service = await StreamControlService.start({} as IAgentRuntime);
    const runtimeState = service.getRuntimeState();

    assert.equal(service.serviceType, "stream555");
    assert.equal(runtimeState.loaded, true);
    assert.equal(runtimeState.baseUrlConfigured, true);
    assert.equal(runtimeState.authenticated, true);
    assert.equal(runtimeState.authConfigured, true);
    assert.match(runtimeState.authSource, /static bearer/i);
    assert.equal(runtimeState.wsState, "disconnected");
    assert.equal(runtimeState.lastWsError, null);
    assert.equal(runtimeState.channelsSaved, 2);
    assert.equal(runtimeState.channelsEnabled, 1);
    assert.equal(runtimeState.channelsReady, 1);
    assert.deepEqual(runtimeState.errors, []);

    await service.stop();
    assert.equal(service.getRuntimeState().loaded, false);
  });

  it("prefers the internal base URL for alice-bot when split URLs are configured", async () => {
    setEnv("STREAM555_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_INTERNAL_BASE_URL", "http://control-plane:3000");
    setEnv("STREAM555_AGENT_TOKEN", "stream-static-token");

    const service = await StreamControlService.start({
      agentId: "alice-bot",
    } as IAgentRuntime);

    assert.equal(service.getConfig()?.baseUrl, "http://control-plane:3000");
    assert.equal(
      ((service as unknown as { wsClient?: { url?: string } }).wsClient?.url),
      "ws://control-plane:3000/api/agent/v1/ws",
    );

    await service.stop();
  });

  it("exposes plugin-owned approval state for host approval APIs", async () => {
    setEnv("STREAM555_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "stream-static-token");

    const service = await StreamControlService.start({} as IAgentRuntime);
    const approval = createApprovalRequest("STREAM555_STREAM_STOP", {
      sessionId: "session-1",
    });

    const pending = service.listPendingApprovals();
    assert.equal(pending.some((entry) => entry.id === approval.id), true);

    const resolved = service.resolveApproval(
      approval.id,
      "approved",
      "stream-plugin-test",
    );
    assert.equal(resolved, true);

    const refreshed = service
      .listPendingApprovals()
      .find((entry) => entry.id === approval.id);
    assert.equal(refreshed, undefined);

    await service.stop();
  });
});
