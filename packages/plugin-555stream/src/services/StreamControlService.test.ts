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
      await assert.rejects(service.getNativeSetup(), /unavailable/);
    } finally { await service.stop(); }
  });

  it("reads native chat with the current primary dispatch, preserves readiness and resets old cursors", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_INTERNAL_BASE_URL", "http://legacy-control-plane:3000");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant({ scopes: ['sessions:read', 'chat:read'] }));
    const originalFetch = globalThis.fetch;
    const calls: Array<{ path: string; cursor: string | null; session: string | null; dispatch: string | null }> = [];
    const cursor = (dispatch: string, sequence = 3) => Buffer.from(JSON.stringify([dispatch, sequence])).toString('base64url');
    let dispatch = 'dispatch-1';
    let reset = false;
    let gap = false;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      assert.equal(url.origin, 'https://stream.rndrntwrk.com');
      assert.equal(init?.method, 'GET');
      assert.equal(headers.get('Authorization'), `Bearer ${process.env.STREAM555_AGENT_TOKEN}`);
      calls.push({ path: url.pathname, cursor: url.searchParams.get('cursor'), session: headers.get('X-Session-Id'),
        dispatch: headers.get('X-Studio-Dispatch-Id') });
      if (url.pathname === '/api/stream/status') return Response.json({ sessionId: 'alice-session', jobId: dispatch,
        status: 'live', active: true, lease: { expiresAt: Date.now() + 60000 } });
      return Response.json({ version: 1, sessionId: 'alice-session', dispatchId: dispatch, revision: 2, sequence: 3,
        cursor: cursor(dispatch), gap, reset, channels: [{ platform: 'youtube', channelId: 'video-1', generation: 'channel-1',
          mode: 'direct', status: 'connected', reason: null, canSend: false, receivedCount: 3, liveReceivedCount: 2,
          connectedAt: 10, lastMessageAt: 20, retryAt: null }], messages: [{ id: 'youtube:video-1:m1',
          platform: 'youtube', channelId: 'video-1', sessionId: 'alice-session', user: { id: 'viewer', username: 'viewer', displayName: 'Viewer' },
          content: { text: 'hello Alice' }, metadata: { timestamp: 20, sequence: 3, receivedAt: 21, isHistory: false } }] });
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      assert.equal(service.getBoundSessionId(), null);
      assert.equal(service.isReady(), true);
      const first = await service.getChatMessages();
      assert.equal(first.count, 1);
      assert.equal(first.cursor, cursor('dispatch-1'));
      assert.equal(first.channels?.[0].canSend, false);
      assert.equal(first.channels?.[0].liveReceivedCount, 2);
      reset = gap = true;
      const delta = await service.getChatMessages({ cursor: first.cursor, platform: 'youtube', limit: 1 });
      assert.equal(delta.reset, true);
      assert.equal(delta.gap, true);
      assert.equal(calls.at(-1)?.cursor, first.cursor);
      const status = await service.getChatStatus();
      assert.equal(status.active, true);
      assert.equal(status.channels?.[0].canSend, false);
      assert.equal(status.platforms.youtube.connected, true);
      assert.equal(calls.at(-1)?.path, '/api/stream/chat/channels');
      dispatch = 'dispatch-2'; reset = gap = false;
      await service.getChatStatus();
      const replaced = await service.getChatMessages({ cursor: first.cursor });
      assert.equal(replaced.dispatchId, 'dispatch-2');
      assert.equal(replaced.reset, true);
      assert.equal(calls.at(-1)?.cursor, null);
      assert.ok(calls.every(call => call.session === 'alice-session'));
      assert.ok(calls.filter(call => call.path.startsWith('/api/stream/chat/')).every(call => call.dispatch));
      await Promise.all([service.getChatMessages(), service.getChatStatus()]);
      const before = calls.length;
      await assert.rejects(service.getChatMessages(undefined, 'other-session'), /configured native session/);
      await assert.rejects(service.sendChatMessage('hello'), /outbound chat is unavailable/);
      await assert.rejects(service.startChat([]), /shared Studio/);
      await assert.rejects(service.stopChat(), /shared Studio/);
      assert.equal(calls.length, before);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
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

  it("rejects foreign or stale native chat admission without falling back to legacy routes", async () => {
    setEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    setEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    setEnv("STREAM555_AGENT_TOKEN", nativeGrant({ scopes: ['sessions:read', 'chat:read'] }));
    const originalFetch = globalThis.fetch;
    let statusSession = 'alice-session';
    let chatDispatch = 'other-dispatch';
    let chatStatus = 200;
    const calls: string[] = [];
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname; calls.push(path);
      if (path === '/api/stream/status') return Response.json({ sessionId: statusSession, jobId: 'dispatch-1',
        status: 'live', active: true, lease: { expiresAt: Date.now() + 60000 } });
      return Response.json(chatStatus === 200 ? { version: 1, sessionId: 'alice-session', dispatchId: chatDispatch,
        revision: 0, sequence: 0, cursor: Buffer.from(JSON.stringify([chatDispatch, 0])).toString('base64url'),
        gap: false, reset: false, channels: [], messages: [] } : { error: 'current_primary_dispatch_required' }, { status: chatStatus });
    };
    const service = await StreamControlService.start({ agentId: 'alice' } as IAgentRuntime);
    try {
      await assert.rejects(service.getChatMessages(), /did not match the current dispatch/);
      statusSession = 'foreign-session';
      await assert.rejects(service.getChatStatus(), /current primary dispatch/);
      statusSession = 'alice-session';
      const before = calls.length;
      await assert.rejects(service.getChatMessages({ cursor: Buffer.from('["foreign-dispatch",0]').toString('base64url') }), /foreign cursor/);
      assert.equal(calls.length, before + 1);
      chatDispatch = 'dispatch-1'; chatStatus = 409;
      await assert.rejects(service.getChatMessages(), /current_primary_dispatch_required/);
      assert.ok(calls.every(path => ['/api/stream/status', '/api/stream/chat/messages'].includes(path)));
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("keeps other consumers on the existing explicit-session chat contract", async () => {
    setEnv("STREAM555_BASE_URL", "https://legacy.example");
    setEnv("STREAM555_AGENT_TOKEN", "stream-static-token");
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async input => { calls.push(String(input)); return Response.json({ sessionId: 'legacy-session', messages: [], count: 0 }); };
    const service = await StreamControlService.start({} as IAgentRuntime);
    try {
      assert.deepEqual(await service.getChatMessages({ limit: 7, platform: 'twitch' }, 'legacy-session'),
        { sessionId: 'legacy-session', messages: [], count: 0 });
      assert.deepEqual(calls, ['https://legacy.example/api/agent/v1/sessions/legacy-session/chat/messages?limit=7&platform=twitch']);
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
        : path.endsWith('/destinations') ? { sessionId: 'alice-session', ready: true, destinations: [
          { platformId: 'youtube', enabled: true, configured: true, streamKey: 'private-stream-key', rtmpUrl: 'private-rtmp-url' }] }
        : { sessionId: 'alice-session', active: true, status: 'live', token: 'private-status-token',
          alwaysOnLive: { publisher: 'capture_service_rtmps', status: 'bootstrap_keepalive_active',
            lastHandoffReason: 'private-handoff-reason' } };
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
      assert.equal(saved.status, 'live');
      assert.equal(saved.destinationsReady, true);
      assert.deepEqual(saved.continuity, { publisher: 'capture_service_rtmps', status: 'bootstrap_keepalive_active' });
      assert.doesNotMatch(JSON.stringify(saved), /private-/);
      assert.equal(service.getBoundSessionId(), null);
      revision = 8;
      assert.equal((await service.getNativeSetup()).revision, 8);
      assert.equal(calls.length, 6);
      assert.ok(calls.every(call => call.method === 'GET' && call.session === 'alice-session' && call.origin === 'https://stream.rndrntwrk.com'));
      assert.deepEqual(new Set(calls.map(call => call.path)), new Set([
        '/api/session/composition', '/api/session/destinations', '/api/stream/status']));
      const readFetch = globalThis.fetch;
      let transientFailed = false;
      globalThis.fetch = async (input, init) => {
        if (new URL(String(input)).pathname.endsWith('/composition') && !transientFailed) {
          transientFailed = true;
          return Response.json({ error: 'temporary' }, { status: 503 });
        }
        return readFetch(input, init);
      };
      revision = 9;
      assert.equal((await service.getNativeSetup()).revision, 9);
      assert.equal(transientFailed, true);
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
  });

  it("accepts only an exact empty capture while retaining saved session binding", async () => {
    setEnv("STREAM555_PUBLIC_BASE_URL", "https://stream.rndrntwrk.com");
    setEnv("STREAM555_AGENT_TOKEN", "private-server-token");
    setEnv("STREAM555_DEFAULT_SESSION_ID", "alice-session");
    const originalFetch = globalThis.fetch;
    let savedSessionId = 'alice-session';
    let live: Record<string, unknown> = { sessionId: null, status: 'stopped', active: false };
    globalThis.fetch = async input => {
      const path = new URL(String(input)).pathname;
      return Response.json(path.endsWith('/composition') ? { sessionId: savedSessionId,
        snapshot: { schemaVersion: 1, revision: 1, productionState: { sources: [] } } }
        : path.endsWith('/destinations') ? { sessionId: 'alice-session', ready: false, destinations: [] } : live);
    };
    const service = await StreamControlService.start({ agentId: "alice" } as IAgentRuntime);
    try {
      const saved = await service.getNativeSetup();
      assert.equal(saved.sessionId, 'alice-session');
      assert.equal(saved.status, 'stopped');
      assert.equal(saved.active, false);
      assert.equal(saved.destinationsReady, false);
      assert.equal(saved.continuity, null);
      for (const invalid of [
        { sessionId: null, status: 'starting', active: false },
        { sessionId: null, status: 'stopped', active: true },
        { sessionId: 'other-session', status: 'stopped', active: false },
      ]) {
        live = invalid;
        await assert.rejects(service.getNativeSetup(), /did not match the configured session/);
      }
      live = { sessionId: null, status: 'stopped', active: false };
      savedSessionId = 'other-session';
      await assert.rejects(service.getNativeSetup(), /did not match the configured session/);
      savedSessionId = 'alice-session';
      live = { sessionId: 'alice-session', status: 'reconnecting', active: false,
        alwaysOnLive: { publisher: 'capture_service_rtmps', status: 'handoff_in_progress' } };
      const recovering = await service.getNativeSetup();
      assert.equal(recovering.status, 'reconnecting');
      assert.deepEqual(recovering.continuity, { publisher: 'capture_service_rtmps', status: 'handoff_in_progress' });
    } finally { globalThis.fetch = originalFetch; await service.stop(); }
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
      assert.deepEqual(await service.broadcastEvent('emote', payload), { ok: true, sent: true });
      assert.deepEqual(calls, [{
        url: 'https://stream.rndrntwrk.com/api/agent/v1/sessions/alice-session/livekit/broadcast-event',
        body: { topic: 'emote', payload, kind: 'reliable' },
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
