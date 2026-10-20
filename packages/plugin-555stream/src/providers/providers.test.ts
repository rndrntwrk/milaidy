import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { IAgentRuntime, StreamStatus } from '../types/index.js';
import { stateProvider } from './stateProvider.js';
import { capabilitiesProvider } from './capabilitiesProvider.js';

const envKeys = ['ALICE_RUNTIME_AUTHORITY_MODE', 'ALICE_RUNTIME_PROFILE'];
let saved: Array<string | undefined>;
beforeEach(() => {
  saved = envKeys.map(key => process.env[key]);
  process.env.ALICE_RUNTIME_AUTHORITY_MODE = 'proposer-only';
  process.env.ALICE_RUNTIME_PROFILE = 'full-gated';
});
afterEach(() => envKeys.forEach((key, index) => {
  if (saved[index] === undefined) delete process.env[key];
  else process.env[key] = saved[index];
}));

function runtime(service: object): IAgentRuntime {
  return { getService: <T>() => service as T };
}

const status: StreamStatus = {
  sessionId: 'alice-session', status: 'live', active: true,
  jobId: 'current-dispatch', serverFallbackActive: false,
  continuity: { publisher: 'realtimekit_rtmp_out', status: 'live_output_active' },
  platforms: { youtube: { status: 'connecting' } },
};
const config = { defaultSessionId: 'alice-session', requireApprovals: true };

test('native status context reads the configured session with no legacy WebSocket cache', async () => {
  const result = await stateProvider.get(runtime({
    getConfig: () => config,
    getState: () => undefined,
    async getStreamStatus(sessionId: string) {
      assert.equal(sessionId, 'alice-session');
      return status;
    },
  }), {});
  assert.equal(typeof result.text, 'string');
  assert.match(result.text, /alice-session/);
  assert.match(result.text, /current-dispatch/);
  assert.match(result.text, /live/);
  assert.match(result.text, /youtube: connecting/);
  assert.doesNotMatch(result.text, /Not connected|BOOTSTRAP|youtube: disabled/);
});

test('unavailable native status is not represented as disconnected or exposed as a raw error', async () => {
  const result = await stateProvider.get(runtime({
    getConfig: () => config,
    getState: () => undefined,
    async getStreamStatus() { throw new Error('PRIVATE-provider-token-and-response'); },
  }), {});
  assert.match(result.text, /unavailable/i);
  assert.doesNotMatch(result.text, /PRIVATE|Not connected|BOOTSTRAP|YES - LIVE/);
});

test('native capabilities expose status and scoped game selection as structured context', async () => {
  const result = await capabilitiesProvider.get(runtime({
    getConfig: () => config, isReady: () => true,
  }), {});
  assert.equal(typeof result.text, 'string');
  assert.match(result.text, /STREAM555_STREAM_STATUS/);
  assert.match(result.text, /FIVE55_GAMES_PLAY/);
  assert.match(result.text, /FIVE55_GAMES_SWITCH/);
  assert.match(result.text, /does not establish gameplay input/);
  assert.doesNotMatch(result.text, /BOOTSTRAP|STREAM_START|STREAM_STOP|GAME_INPUT|Not Yet Implemented/);
});

test('legacy cached state and status action remain available as structured context', async () => {
  delete process.env.ALICE_RUNTIME_PROFILE;
  const service = {
    getConfig: () => config, isReady: () => true,
    getState: () => ({ sessionId: 'legacy-session', active: true, jobId: 'legacy-job',
      productionState: { activeLayout: 'single', cameraOn: true, screenOn: false, micOn: true },
      platforms: {}, lastUpdate: 1, sequence: 2 }),
    async getStreamStatus() { throw new Error('Native status must not be queried'); },
  };
  const state = await stateProvider.get(runtime(service), {});
  assert.match(state.text, /legacy-session/);
  assert.match(state.text, /Layout: single/);
  assert.match(state.text, /YES - LIVE/);
  const capabilities = await capabilitiesProvider.get(runtime(service), {});
  assert.match(capabilities.text, /STREAM555_STREAM_STATUS/);
  assert.match(capabilities.text, /STREAM555_BOOTSTRAP_SESSION/);
});
