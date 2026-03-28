import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { isInternalAgentId, resolveStream555BaseUrl } from './baseUrl.js';

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

describe('resolveStream555BaseUrl', () => {
  it('prefers the internal base URL for allow-listed internal agents', () => {
    setEnv('STREAM555_BASE_URL', 'https://stream.rndrntwrk.com');
    setEnv('STREAM555_PUBLIC_BASE_URL', 'https://stream.rndrntwrk.com');
    setEnv('STREAM555_INTERNAL_BASE_URL', 'http://control-plane:3000');

    assert.equal(resolveStream555BaseUrl('alice-bot'), 'http://control-plane:3000');
  });

  it('falls back to the public base URL for non-internal agents', () => {
    setEnv('STREAM555_BASE_URL', 'https://stream.rndrntwrk.com');
    setEnv('STREAM555_PUBLIC_BASE_URL', 'https://stream.rndrntwrk.com');
    setEnv('STREAM555_INTERNAL_BASE_URL', 'http://control-plane:3000');

    assert.equal(resolveStream555BaseUrl('guest-agent'), 'https://stream.rndrntwrk.com');
  });

  it('supports explicit internal-agent overrides from the environment', () => {
    setEnv('STREAM555_PUBLIC_BASE_URL', 'https://stream.rndrntwrk.com');
    setEnv('STREAM555_INTERNAL_BASE_URL', 'http://control-plane:3000');
    setEnv('STREAM555_INTERNAL_AGENT_IDS', 'alice-bot,operator-helper');

    assert.equal(isInternalAgentId('operator-helper'), true);
    assert.equal(resolveStream555BaseUrl('operator-helper'), 'http://control-plane:3000');
  });
});
