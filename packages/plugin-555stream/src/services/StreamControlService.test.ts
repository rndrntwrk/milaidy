import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { IAgentRuntime } from "../types/index.js";
import { createApprovalRequest } from "../routes/approvals.js";
import { StreamControlService } from "./StreamControlService.js";
import { setNativeAgentTokenPersistence } from "../lib/agentAuth.js";

function nativeGrant(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({
    type: 'agent', studioAuthority: 'd1-v1', iss: '555stream-studio-agent', aud: '555stream-native',
    jti: 'grant-1', userId: 'alice', subjectUserId: 'alice', agentId: 'alice', actorId: 'actor-alice',
    actorType: 'agent', authMethod: 'agent_key', sessionKind: 'agent_runtime', policyId: 'policy-1',
    scopes: ['sessions:read', 'studio:write'], sessionIds: ['alice-session'], iat: now, exp: now + 604800,
    ...overrides,
  })).toString('base64url'), 'test-signature'].join('.');
}

const STREAM_ENV_KEYS = [
  "STREAM555_DEFAULT_SESSION_ID",
  "STREAM555_BASE_URL",
  "STREAM555_PUBLIC_BASE_URL",
  "STREAM555_INTERNAL_BASE_URL",
  "STREAM555_INTERNAL_AGENT_IDS",
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM_API_BEARER_TOKEN",
  "ALICE_RUNTIME_AUTHORITY_MODE",
  "ALICE_RUNTIME_PROFILE",
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
    setNativeAgentTokenPersistence(undefined);
    for (const [key, value] of ORIGINAL_ENV.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    ORIGINAL_ENV.clear();
  });

  it("keeps Alice chat bootable and reports Stream unconnected before native authorization", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_AGENT_API_KEY", "retired-key");
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      assert.equal(service.getRuntimeState().loaded, false);
      assert.equal(service.getRuntimeState().authenticated, false);
      assert.equal(service.getConfig(), null);
    } finally { await service.stop(); }
  });

  it("keeps Alice bootable with an expired native grant and reports a sanitized connection error", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    const now = Math.floor(Date.now() / 1000);
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant({ iat: now - 600, exp: now - 1 }));
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      assert.equal(service.isReady(), false);
      assert.equal(service.getRuntimeState().authenticated, false);
      assert.equal(service.getRuntimeState().baseUrlConfigured, true);
      assert.ok(service.getRuntimeState().errors.includes('Native Stream authorization is unavailable; reconnect Stream'));
      await assert.rejects(service.getStreamStatus(), /unavailable/);
    } finally { await service.stop(); }
  });

  it("reads native stream lifecycle without claiming configured destinations are live", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    let live: Record<string, unknown> = { sessionId: 'alice-session', jobId: 'dispatch-1', status: 'reconnecting',
      active: false, pendingJob: true, platforms: { youtube: { status: 'connecting' } },
      lease: { expiresAt: Date.now() + 60000, autoRenew: true, nextRenewalAt: Date.now() + 30000 },
      alwaysOnLive: { publisher: 'capture_service_rtmps', status: 'handoff_in_progress', lastHandoffReason: 'private-diagnostic' },
      realtimeKit: { authToken: 'private-token' } };
    globalThis.fetch = async (input, init) => {
      assert.equal(init?.method, 'GET');
      assert.equal(new Headers(init?.headers).get('X-Session-Id'), 'alice-session');
      calls.push(String(input)); return Response.json(live);
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      const status = await service.getStreamStatus();
      assert.equal(status.status, 'reconnecting');
      assert.equal(status.active, false);
      assert.equal(status.jobId, 'dispatch-1');
      assert.equal(status.pendingJob, true);
      assert.equal(status.lease?.autoRenew, true);
      assert.deepEqual(status.platforms, { youtube: { status: 'connecting' } });
      assert.deepEqual(status.continuity, { publisher: 'capture_service_rtmps', status: 'handoff_in_progress' });
      assert.doesNotMatch(JSON.stringify(status), /private-/);
      live = { sessionId: null, jobId: null, status: 'stopped', active: false, lease: null, platforms: {} };
      assert.equal((await service.getStreamStatus()).status, 'stopped');
      assert.equal(service.getBoundSessionId(), null);
      for (const invalid of [
        { sessionId: null, status: 'starting', active: false },
        { sessionId: null, status: 'stopped', active: true },
        { sessionId: 'foreign-session', jobId: 'dispatch-1', status: 'live', active: true },
      ]) {
        live = invalid;
        await assert.rejects(service.getStreamStatus(), /configured session or current primary dispatch/);
      }
      assert.ok(calls.every(url => url === 'https://stream.rndrntwrk.com/api/stream/status'));
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("reads the deployed native game catalog with the existing grant and public metadata", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    const grant = nativeGrant();
    setEnv("STREAM555_AGENT_TOKEN", grant);
    const game = { id: '555drive', name: '555 Drive', inputType: 'keyboard',
      description: 'Racing game', beta: true, path: 'beta/555drive/public' };
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      assert.equal(init?.method, 'GET');
      assert.equal(init?.body, undefined);
      assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${grant}`);
      assert.equal(new Headers(init?.headers).get('X-Session-Id'), 'alice-session');
      calls.push(String(input));
      return Response.json([{ ...game, privateToken: 'must-not-be-returned' }]);
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      assert.deepEqual(await service.getNativeGameCatalog(), { sessionId: 'alice-session', games: [game] });
      assert.deepEqual(await service.getNativeGameCatalog(false, 'alice-session'), { sessionId: 'alice-session', games: [game] });
      assert.deepEqual(calls, [
        'https://stream.rndrntwrk.com/api/sources/games?beta=true',
        'https://stream.rndrntwrk.com/api/sources/games',
      ]);
      assert.equal(service.getBoundSessionId(), null);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("rejects malformed native catalogs and foreign sessions without a legacy fallback", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    const originalFetch = globalThis.fetch;
    let payload: unknown = { games: [] };
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json(payload); };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      await assert.rejects(service.getNativeGameCatalog(), /native game catalog/i);
      payload = [{ id: '555drive', name: '555 Drive', inputType: 'keyboard', path: '../private' }];
      await assert.rejects(service.getNativeGameCatalog(), /native game catalog/i);
      payload = [{ id: '555drive', name: '555 Drive', inputType: 'unsupported' }];
      await assert.rejects(service.getNativeGameCatalog(), /native game catalog/i);
      await assert.rejects(service.getNativeGameCatalog(true, 'other-session'), /configured native session/);
      assert.equal(calls, 3);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("renews native credentials while idle and finishes persistence before stopping", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    const originalInterval = globalThis.setInterval;
    const originalClear = globalThis.clearInterval;
    const originalFetch = globalThis.fetch;
    let tick: (() => void) | undefined;
    let cleared = false;
    const timer = { unref() {} };
    globalThis.setInterval = ((callback: () => void, delay: number) => {
      assert.equal(delay, 60000);
      tick = callback;
      return timer;
    }) as typeof setInterval;
    globalThis.clearInterval = ((handle: unknown) => { cleared = handle === timer; }) as typeof clearInterval;
    let service: StreamControlService | undefined;
    try {
      service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
      const now = Math.floor(Date.now() / 1000);
      setEnv("STREAM555_AGENT_TOKEN", nativeGrant({ iat: now - 172800, exp: now + 432000 }));
      const child = nativeGrant({ jti: 'grant-2' });
      let saved: string | undefined;
      let release!: () => void;
      const saving = new Promise<void>(resolve => { release = resolve; });
      setNativeAgentTokenPersistence(async next => { saved = next; await saving; });
      globalThis.fetch = async () => Response.json({ token: child });
      tick?.();
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(saved, child);
      let stopped = false;
      const stopping = service.stop().then(() => { stopped = true; });
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(stopped, false);
      assert.equal(cleared, true);
      release();
      await stopping;
      assert.equal(process.env.STREAM555_AGENT_TOKEN, child);
      assert.equal(service.getConfig(), null);
      assert.equal(cleared, true);
    } finally {
      if (service) await service.stop();
      globalThis.setInterval = originalInterval;
      globalThis.clearInterval = originalClear;
      globalThis.fetch = originalFetch;
    }
  });

  it("relays native emotes to the configured session without a legacy bind or replay", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_INTERNAL_BASE_URL", "http://legacy-control-plane:3000");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    let status = 200;
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json(status === 200 ? { ok: true, sent: true } : { error: 'unavailable' }, { status });
    };
    const service = await StreamControlService.start({ agentId: "alice" } as IAgentRuntime);
    try {
      const payload = { emoteId: 'dance-happy', path: '/animations/emotes/dance-happy.glb.gz', duration: 4, loop: false };
      assert.deepEqual(await service.broadcastEvent('emote', payload, 'alice-session', 'dispatch-1'), { ok: true, sent: true });
      assert.deepEqual(calls, [{
        url: 'https://stream.rndrntwrk.com/api/agent/v1/sessions/alice-session/livekit/broadcast-event',
        body: { topic: 'emote', payload, kind: 'reliable', dispatchId: 'dispatch-1' },
      }]);
      assert.equal(service.getBoundSessionId(), null);
      await assert.rejects(service.broadcastEvent('emote', payload, 'other-session'), /configured native session/);
      assert.equal(calls.length, 1);
      status = 503;
      await assert.rejects(service.broadcastEvent('emote', payload), /unavailable/);
      assert.equal(calls.length, 2);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("preserves explicit event targets for other Stream plugin consumers", async () => {
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "private-server-token");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "default-session");
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, sent: true });
    };
    const service = await StreamControlService.start({} as IAgentRuntime);
    try {
      assert.deepEqual(await service.broadcastEvent('emote', {}, 'other-session'), { ok: true, sent: true });
      assert.deepEqual(calls, [{
        url: 'https://stream.rndrntwrk.com/api/agent/v1/sessions/other-session/livekit/broadcast-event',
        body: { topic: 'emote', payload: {} },
      }]);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("persists native game selection with one revision-checked write and preserves the full composition", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    const snapshot = {
      schemaVersion: 1, revision: 7, updatedAt: 123456,
      productionState: { activeLayout: 'pip', cameraOn: true, sources: [
        { id: 'avatar-1', type: 'avatar', visible: true, avatarIndex: 3 },
        { id: 'game-1', type: 'game', visible: true, gameId: 'old-game', agentId: 'alice',
          gameConfig: { playMode: 'solo', difficulty: 3 }, position: { x: 5, y: 8 } },
        { id: 'hidden-game', type: 'game', visible: false, gameId: 'unchanged' },
      ], overlay: { enabled: true } },
      scenes: [{ id: 'scene-1', sources: [{ id: 'preserve-scene-source' }] }],
      activeSceneId: 'scene-1', sceneDslEnabled: false,
      graphics: { global: [{ id: 'overlay-1' }], user: [{ id: 'user-graphic' }] },
    };
    const before = structuredClone(snapshot);
    const calls: Array<{ url: string; method: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: String(init?.method) });
      if (init?.method === 'HEAD') {
        assert.equal(new Headers(init.headers).get('Authorization'), null);
        assert.equal(new Headers(init.headers).get('Cookie'), null);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.redirect, 'error');
        assert.ok(init.signal);
        return new Response(null, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      assert.equal(new Headers(init?.headers).get('X-Session-Id'), 'alice-session');
      assert.match(new Headers(init?.headers).get('Authorization') || '', /^Bearer /);
      if (init?.method === 'GET') return Response.json({ sessionId: 'alice-session', snapshot });
      const expectedState = structuredClone(snapshot.productionState);
      const selected = expectedState.sources[1];
      selected.gameId = '555drive';
      selected.gameConfig = { ...selected.gameConfig!, playMode: 'agent' };
      assert.deepEqual(JSON.parse(String(init?.body)), {
        sessionId: 'alice-session', schemaVersion: 1, expectedRevision: 7,
        productionState: expectedState, scenes: snapshot.scenes,
        activeSceneId: snapshot.activeSceneId, sceneDslEnabled: false, graphics: snapshot.graphics,
      });
      return Response.json({ sessionId: 'alice-session', snapshot: { ...snapshot,
        revision: 8, updatedAt: 123457, productionState: expectedState } });
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      assert.deepEqual(await service.getNativeGameState(), {
        sessionId: 'alice-session', sourceId: 'game-1', gameId: 'old-game',
        playMode: 'solo', compositionRevision: 7,
      });
      await assert.rejects(service.getNativeGameState('foreign-session'), /configured native session/);
      assert.deepEqual(calls, [
        { method: 'GET', url: 'https://stream.rndrntwrk.com/api/session/composition' },
      ]);
      calls.length = 0;
      assert.deepEqual(await service.selectNativeGame('555drive'), {
        sessionId: 'alice-session', sourceId: 'game-1', gameId: '555drive', compositionRevision: 8,
      });
      assert.deepEqual(snapshot, before);
      assert.deepEqual(calls, [
        { method: 'GET', url: 'https://stream.rndrntwrk.com/api/session/composition' },
        { method: 'HEAD', url: 'https://stream.rndrntwrk.com/game-embed/555drive/content' },
        { method: 'PUT', url: 'https://stream.rndrntwrk.com/api/session/composition' },
      ]);
      assert.equal(service.getBoundSessionId(), null);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("does not replay native game selection after a revision conflict or authorization failure", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    const originalFetch = globalThis.fetch;
    let writes = 0;
    let status = 409;
    globalThis.fetch = async (_input, init) => {
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Type': 'text/html' } });
      if (init?.method === 'PUT') { writes++; return Response.json({ error: 'conflict or unauthorized' }, { status }); }
      return Response.json({ sessionId: 'alice-session', snapshot: {
        schemaVersion: 1, revision: 7, updatedAt: 123456,
        productionState: { sources: [{ id: 'game-1', type: 'game', visible: true }] },
        scenes: [], activeSceneId: null, sceneDslEnabled: false, graphics: { global: [], user: [] },
      } });
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      await assert.rejects(service.selectNativeGame('555drive'), /read current composition before retrying/i);
      assert.equal(writes, 1);
      status = 401;
      await assert.rejects(service.selectNativeGame('555drive'), /read current composition before retrying/i);
      assert.equal(writes, 2);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("rejects unsupported or undeployed native game selection without writing", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant());
    const originalFetch = globalThis.fetch;
    let sceneDslEnabled = true;
    const methods: string[] = [];
    globalThis.fetch = async (_input, init) => {
      methods.push(String(init?.method));
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      assert.equal(init?.method, 'GET');
      return Response.json({ sessionId: 'alice-session', snapshot: {
        schemaVersion: 1, revision: 7, updatedAt: 123456,
        productionState: { sources: [{ id: 'game-1', type: 'game', visible: true }] },
        scenes: [], activeSceneId: null, sceneDslEnabled, graphics: { global: [], user: [] },
      } });
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      await assert.rejects(service.selectNativeGame('../invalid'), /game ID/i);
      assert.deepEqual(methods, []);
      await assert.rejects(service.selectNativeGame('555drive'), /SceneDSL/i);
      assert.deepEqual(methods, ['GET']);
      sceneDslEnabled = false;
      await assert.rejects(service.selectNativeGame('missing-game'), /deployed game/i);
      assert.deepEqual(methods, ['GET', 'GET', 'HEAD']);
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
