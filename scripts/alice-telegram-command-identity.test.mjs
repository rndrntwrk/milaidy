import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { applyAliceTelegramOwnerPairingPatch } from './apply-alice-eliza-runtime-patches.mjs';

const sourceRoot = process.env.ALICE_ELIZA_TEST_ROOT ?? path.resolve('eliza');
const require = createRequire(path.join(sourceRoot, 'package.json'));
const ts = require('typescript');
const roles = await import(pathToFileURL(path.join(sourceRoot, 'packages/core/src/roles.ts')));
const { createUniqueUuid } = await import(pathToFileURL(path.join(sourceRoot, 'packages/core/src/entities.ts')));
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'alice-command-identity-'));
const telegramRoot = path.join(temporaryRoot, 'plugins/plugin-telegram/src');
mkdirSync(telegramRoot, { recursive: true });
for (const name of ['service.ts', 'owner-pairing-service.ts', 'command-registration.ts']) {
  writeFileSync(path.join(telegramRoot, name), readFileSync(path.join(sourceRoot, 'plugins/plugin-telegram/src', name)));
}
const patchOptions = { elizaRoot: temporaryRoot, log() {} };
assert.equal(applyAliceTelegramOwnerPairingPatch(patchOptions), 'applied');
assert.equal(applyAliceTelegramOwnerPairingPatch(patchOptions), 'already-applied');
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
function load(file, dependencies, suffix = '') {
  const exports = {};
  runInNewContext(ts.transpile(readFileSync(file, 'utf8') + suffix, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }), { exports, require: name => dependencies[name] });
  return exports;
}
const wellFormed = await import(pathToFileURL(path.join(sourceRoot, 'packages/core/src/utils/well-formed.ts')));
const core = { ...roles, ...wellFormed, createUniqueUuid };
const identity = load(path.join(sourceRoot, 'plugins/plugin-telegram/src/identity.ts'), { '@elizaos/core': core });
const commands = load(path.join(telegramRoot, 'command-registration.ts'), {
  '@elizaos/core': core, './identity': identity,
  '@elizaos/plugin-commands': {
    resolveCommand: async (_runtime, memory) => ({ handled: true, reply: memory.entityId }),
  },
}, '\nexports.dispatchAgentCommand = dispatchAgentCommand;');
const ownerId = 'eafda9b1-f64b-0b0a-9b1a-e6f589f42b44';
function runtime() {
  return {
    agentId: '10101010-1010-4010-8010-101010101010',
    getSetting: key => key === 'ELIZA_ADMIN_ENTITY_ID' ? ownerId : undefined,
    getEntityById: async id => id === ownerId ? {
      id: ownerId, metadata: { telegram: { userId: '6689469214', ownerBindVerifiedAt: 1 } },
    } : null,
    getRoom: async () => null,
    reportError: (_where, error) => { throw error; },
  };
}
const context = id => ({ from: { id, username: 'gl4sspr1sm' }, chat: { id }, message: { text: '/elevated' } });
test('paired Telegram owner passes the real owner and elevated role checks from durable metadata', async () => {
  const auth = await commands.resolveTelegramSenderAuth(context(6689469214), runtime(), 'default');
  assert.equal(auth.isAuthorized, true);
  assert.equal(auth.isElevated, true);
});
test('an unpaired sender using the owner handle remains unauthorized', async () => {
  const auth = await commands.resolveTelegramSenderAuth(context(666666), runtime(), 'default');
  assert.equal(auth.isAuthorized, false);
  assert.equal(auth.isElevated, false);
});
test('Telegram deterministic command dispatch retains the canonical paired owner identity', async () => {
  let dispatchedEntityId;
  const ctx = { ...context(6689469214), reply: async value => { dispatchedEntityId = value; } };
  await commands.dispatchAgentCommand(ctx, runtime(), {}, 'default', { name: 'elevated' }, { isAuthorized: true, isElevated: true });
  assert.equal(dispatchedEntityId, ownerId);
});
