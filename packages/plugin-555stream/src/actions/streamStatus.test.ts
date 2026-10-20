import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IAgentRuntime, StreamStatus } from '../types/index.js';
import { streamStatusAction } from './streamStatus.js';

function runtime(getStreamStatus: () => Promise<StreamStatus>): IAgentRuntime {
  return { getService: <T>() => ({
    getBoundSessionId: () => 'alice-session',
    getStreamStatus,
  }) as T };
}

test('status is returned to the planner even without a transcript callback', async () => {
  const status: StreamStatus = {
    sessionId: 'alice-session', active: true, jobId: 'current-dispatch',
    serverFallbackActive: false, platforms: {},
  };
  const result = await streamStatusAction.handler(runtime(async () => status), {});
  assert.equal(typeof result, 'object');
  if (typeof result === 'boolean') assert.fail('Status payload was discarded');
  assert.equal(result.success, true);
  assert.match(result.text ?? '', /LIVE/);
  assert.deepEqual(result.data, status);
});

test('a failed status read returns a failure result instead of live state', async () => {
  const result = await streamStatusAction.handler(runtime(async () => {
    throw new Error('Native status unavailable');
  }), {});
  assert.equal(typeof result, 'object');
  if (typeof result === 'boolean') assert.fail('Status failure was discarded');
  assert.equal(result.success, false);
  assert.equal(result.error, 'Native status unavailable');
  assert.equal(result.data, undefined);
});
