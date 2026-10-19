import assert from 'node:assert/strict';
import { afterEach, it } from 'node:test';
import { stateProvider } from './stateProvider.js';
import { capabilitiesProvider } from './capabilitiesProvider.js';
import type { IAgentRuntime } from '../types/index.js';

const keys = ['ALICE_RUNTIME_AUTHORITY_MODE', 'ALICE_RUNTIME_PROFILE'];
const saved = new Map(keys.map(key => [key, process.env[key]]));
afterEach(() => { for (const [key, value] of saved) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
} });

it('gives the planner native read guidance in the elizaOS provider result shape', async () => {
  process.env.ALICE_RUNTIME_AUTHORITY_MODE = 'proposer-only';
  process.env.ALICE_RUNTIME_PROFILE = 'full-gated';
  let ready = true;
  const runtime = { getService: () => ({ isReady: () => ready,
    getState: () => { throw new Error('legacy state must not be read'); } }) } as unknown as IAgentRuntime;
  for (const provider of [stateProvider, capabilitiesProvider]) {
    const result = await provider.get(runtime, {});
    assert.equal(typeof result.text, 'string');
    assert.match(result.text, /STREAM555_STREAM_STATUS/);
    assert.match(result.text, /STREAM555_CHAT_READ/);
    assert.doesNotMatch(result.text, /BOOTSTRAP_SESSION|STREAM_START/);
  }
  ready = false;
  assert.match((await stateProvider.get(runtime, {})).text, /not connected/);
  assert.match((await capabilitiesProvider.get(runtime, {})).text, /unavailable/);
});

it('keeps the existing non-Alice instructions inside a canonical provider text result', async () => {
  delete process.env.ALICE_RUNTIME_PROFILE;
  const runtime = { getService: () => ({ getState: () => null, getConfig: () => null }) } as unknown as IAgentRuntime;
  assert.match((await stateProvider.get(runtime, {})).text, /STREAM555_BOOTSTRAP_SESSION/);
});
