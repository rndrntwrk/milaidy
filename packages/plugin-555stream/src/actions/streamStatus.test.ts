import assert from 'node:assert/strict';
import { it } from 'node:test';
import { streamStatusAction } from './streamStatus.js';
import type { IAgentRuntime, StreamStatus } from '../types/index.js';

it('preserves native recovery and platform states without inventing disabled destinations', async () => {
  const status = { sessionId: 'alice-session', active: false, status: 'reconnecting',
    serverFallbackActive: false, platforms: { youtube: { status: 'pending' } } } as StreamStatus;
  const runtime = { getService: () => ({ getConfig: () => ({ defaultSessionId: 'alice-session' }),
    getBoundSessionId: () => null, getStreamStatus: async () => status }) } as unknown as IAgentRuntime;
  let text = '';
  assert.equal(await streamStatusAction.handler(runtime, {}, undefined, undefined,
    result => { text = result.text; }), true);
  assert.match(text, /RECONNECTING/);
  assert.match(text, /youtube: pending/);
  assert.doesNotMatch(text, /OFFLINE|disabled/);
});
