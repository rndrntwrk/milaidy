import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as auth from './agentAuth.js';

const keys = ['ALICE_RUNTIME_AUTHORITY_MODE', 'ALICE_RUNTIME_PROFILE',
  'STREAM555_PUBLIC_BASE_URL', 'STREAM555_DEFAULT_SESSION_ID',
  'STREAM555_AGENT_TOKEN', 'STREAM555_AGENT_API_KEY', 'STREAM_API_BEARER_TOKEN'];
let saved: Map<string, string | undefined>;
let originalFetch: typeof fetch;

function grant(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = { type: 'agent', studioAuthority: 'd1-v1',
    iss: '555stream-studio-agent', aud: '555stream-native',
    jti: 'grant-1', userId: 'alice', subjectUserId: 'alice', agentId: 'alice',
    actorId: 'actor-alice', actorType: 'agent', authMethod: 'agent_key',
    sessionKind: 'agent_runtime', policyId: 'policy-1',
    scopes: ['sessions:read', 'studio:write'], sessionIds: ['alice-session'],
    iat: now, exp: now + 604800, ...overrides };
  return [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify(claims)).toString('base64url'), 'test-signature'].join('.');
}

describe('Alice native Stream credentials', () => {
  beforeEach(() => {
    saved = new Map(keys.map(key => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    process.env.ALICE_RUNTIME_AUTHORITY_MODE = 'proposer-only';
    process.env.ALICE_RUNTIME_PROFILE = 'full-gated';
    process.env.STREAM555_PUBLIC_BASE_URL = 'https://stream.rndrntwrk.com';
    process.env.STREAM555_DEFAULT_SESSION_ID = 'alice-session';
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('unexpected credential request'); };
    auth.invalidateExchangedAgentTokenCache();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    auth.invalidateExchangedAgentTokenCache();
    auth.setNativeAgentTokenPersistence?.(undefined);
  });

  it('requires a current native grant for the configured session and native origin', async () => {
    process.env.STREAM555_AGENT_TOKEN = 'legacy-opaque-token';
    await assert.rejects(auth.resolveAgentBearer('https://stream.rndrntwrk.com'), /native.*grant/i);
    process.env.STREAM555_AGENT_TOKEN = grant({ sessionIds: ['other-session'] });
    await assert.rejects(auth.resolveAgentBearer('https://stream.rndrntwrk.com'), /session/i);
    const now = Math.floor(Date.now() / 1000);
    process.env.STREAM555_AGENT_TOKEN = grant({ iat: now - 600, exp: now - 1 });
    await assert.rejects(auth.resolveAgentBearer('https://stream.rndrntwrk.com'), /expired/i);
    process.env.STREAM555_AGENT_TOKEN = grant();
    await assert.rejects(auth.resolveAgentBearer('https://legacy.example'), /origin/i);
  });

  it('uses a fresh native grant without exchanging a legacy API key', async () => {
    const token = grant();
    process.env.STREAM555_AGENT_TOKEN = token;
    process.env.STREAM555_AGENT_API_KEY = 'old-api-key';
    assert.equal(await auth.resolveAgentBearer('https://stream.rndrntwrk.com'), token);
  });

  it('preserves static bearer behavior outside Alice production', async () => {
    delete process.env.ALICE_RUNTIME_PROFILE;
    process.env.STREAM555_AGENT_TOKEN = 'desktop-token';
    assert.equal(await auth.resolveAgentBearer('https://desktop.example'), 'desktop-token');
  });

  it('refreshes once and durably saves unchanged grant bounds before publishing the child', async () => {
    const now = Math.floor(Date.now() / 1000);
    const parent = grant({ iat: now - 172800, exp: now + 432000 });
    const child = grant({ jti: 'grant-2' });
    process.env.STREAM555_AGENT_TOKEN = parent;
    let requests = 0;
    let persisted: string | undefined;
    auth.setNativeAgentTokenPersistence(async (next, previous) => {
      assert.equal(previous, parent);
      assert.equal(process.env.STREAM555_AGENT_TOKEN, parent);
      persisted = next;
    });
    // Server-only boot loads the API first, then a separate runtime config.
    // Its fallback writer must not replace the API's live config writer.
    auth.setNativeAgentTokenPersistence(async () => { throw new Error('stale runtime writer'); }, true);
    globalThis.fetch = async (input, init) => {
      requests++;
      assert.equal(String(input), 'https://stream.rndrntwrk.com/api/agent/v1/auth/refresh');
      assert.equal(init?.method, 'POST');
      assert.equal(JSON.parse(String(init?.body)).token, parent);
      return Response.json({ token: child });
    };
    assert.deepEqual(await Promise.all([
      auth.resolveAgentBearer('https://stream.rndrntwrk.com'),
      auth.resolveAgentBearer('https://stream.rndrntwrk.com'),
    ]), [child, child]);
    assert.equal(requests, 1);
    assert.equal(persisted, child);
    assert.equal(process.env.STREAM555_AGENT_TOKEN, child);
  });

  it('retains the parent when persistence fails or refresh changes capabilities', async () => {
    const now = Math.floor(Date.now() / 1000);
    const parent = grant({ iat: now - 172800, exp: now + 432000 });
    process.env.STREAM555_AGENT_TOKEN = parent;
    const child = grant({ jti: 'grant-2' });
    globalThis.fetch = async () => Response.json({ token: child });
    auth.setNativeAgentTokenPersistence(async () => { throw new Error('store unavailable'); });
    await assert.rejects(auth.resolveAgentBearer('https://stream.rndrntwrk.com'), /persist/i);
    assert.equal(process.env.STREAM555_AGENT_TOKEN, parent);
    let writes = 0;
    auth.setNativeAgentTokenPersistence(async () => { writes++; });
    globalThis.fetch = async () => Response.json({ token: grant({ jti: 'grant-2', scopes: ['sessions:read', 'stream:start'] }) });
    await assert.rejects(auth.resolveAgentBearer('https://stream.rndrntwrk.com'), /bounds/i);
    assert.equal(writes, 0);
    assert.equal(process.env.STREAM555_AGENT_TOKEN, parent);
  });
});
