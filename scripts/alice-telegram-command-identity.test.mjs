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
for (const name of ['service.ts', 'owner-pairing-service.ts', 'command-registration.ts', 'identity.ts', 'messageManager.ts']) {
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
const identity = load(path.join(telegramRoot, 'identity.ts'), { '@elizaos/core': core });
const commands = load(path.join(telegramRoot, 'command-registration.ts'), {
  '@elizaos/core': core, './identity': identity,
  '@elizaos/plugin-commands': {
    resolveCommand: async (_runtime, memory) => ({ handled: true, reply: memory.entityId }),
  },
}, '\nexports.dispatchAgentCommand = dispatchAgentCommand;');
const ownerId = 'eafda9b1-f64b-0b0a-9b1a-e6f589f42b44';
const alternateId = '20202020-2020-4020-8020-202020202020';
function runtime({ retained = false, relationship = {}, verifiedAt = 1 } = {}) {
  return {
    agentId: '10101010-1010-4010-8010-101010101010',
    getSetting: key => key === 'ELIZA_ADMIN_ENTITY_ID' ? ownerId : undefined,
    getEntityById: async id => id === ownerId ? {
      id: ownerId, metadata: { telegram: { userId: '6689469214', ownerBindVerifiedAt: 1 } },
    } : id === alternateId ? {
      id: alternateId, metadata: { telegram: { userId: '555555555', ownerBindVerifiedAt: verifiedAt } },
    } : null,
    getRelationships: async () => retained ? [{
      sourceEntityId: alternateId, targetEntityId: ownerId,
      tags: ['identity_link'],
      metadata: { status: 'confirmed', source: 'owner_pairing', connector: 'telegram' },
      ...relationship,
    }] : [],
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

test('explicitly retained owner is authorized and elevated before a world exists across bot accounts', async () => {
  const active = runtime({ retained: true });
  for (const account of ['default', 'second-bot']) {
    for (const id of [6689469214, 555555555]) {
      const auth = await commands.resolveTelegramSenderAuth(context(id), active, account);
      assert.equal(auth.isAuthorized, true);
      assert.equal(auth.isElevated, true);
      let dispatched;
      await commands.dispatchAgentCommand({ ...context(id), reply: async value => { dispatched = value; } },
        active, {}, account, { name: 'elevated' }, auth);
      assert.equal(dispatched, ownerId);
    }
  }
});

test('unconfirmed, unrelated or unverified links cannot grant owner access', async () => {
  for (const options of [
    { relationship: { metadata: { status: 'pending', source: 'owner_pairing', connector: 'telegram' } } },
    { relationship: { metadata: { status: 'confirmed', source: 'relationships.acceptMerge', connector: 'telegram' } } },
    { relationship: { metadata: { status: 'confirmed', source: 'owner_pairing', connector: 'discord' } } },
    { relationship: { targetEntityId: alternateId } },
    { relationship: { sourceEntityId: ownerId } },
    { relationship: { tags: ['contact'] } },
    { verifiedAt: 0 },
    { verifiedAt: Number.NaN },
  ]) {
    const auth = await commands.resolveTelegramSenderAuth(context(555555555), runtime({ retained: true, ...options }), 'default');
    assert.equal(auth.isAuthorized, false);
    assert.equal(auth.isElevated, false);
  }
  const stranger = await commands.resolveTelegramSenderAuth(context(666666), runtime({ retained: true }), 'default');
  assert.equal(stranger.isAuthorized, false);
  assert.equal(stranger.isElevated, false);
});

test('retained identity lookup propagates storage failure', async () => {
  const active = runtime();
  active.getRelationships = async () => { throw new Error('identity store unavailable'); };
  await assert.rejects(identity.resolveTelegramRuntimeEntityId(active, 'default', '555555555'), /identity store unavailable/);
});

// Execute the actual patched connection calls against core's adapter. This
// catches primary metadata replacement, which authorization-only mocks miss.
function methodNode(file, className, methodName) {
  const source = ts.createSourceFile(file, readFileSync(path.join(telegramRoot, file), 'utf8'), ts.ScriptTarget.Latest);
  const declaration = source.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === className);
  const method = declaration?.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(source) === methodName);
  assert.ok(method, `${className}.${methodName} exists`);
  return { source, method };
}
const { ensureConnection } = await import(pathToFileURL(path.join(sourceRoot, 'packages/core/src/connection.ts')));
const { InMemoryDatabaseAdapter } = await import(pathToFileURL(path.join(sourceRoot, 'packages/core/src/database/inMemoryAdapter.ts')));
test('message, membership and callback connections preserve primary metadata and ordinary sender identities', async () => {
  const active = runtime({ retained: true });
  const adapter = new InMemoryDatabaseAdapter();
  const primary = { id: ownerId, agentId: active.agentId, names: ['Primary'],
    metadata: { telegram: { id: '6689469214', userId: '6689469214', name: 'Primary', ownerBindVerifiedAt: 1 }, discord: { id: '777' } } };
  await adapter.createEntities([primary]);
  const before = structuredClone(primary);
  active.ensureConnection = params => ensureConnection(adapter, { ...params, agentId: active.agentId });
  for (const [file, className, methodName] of [
    ['service.ts', 'TelegramService', 'syncMessageSender'],
    ['service.ts', 'TelegramService', 'syncNewChatMember'],
    ['messageManager.ts', 'MessageManager', 'handleMessage'],
    ['messageManager.ts', 'MessageManager', 'handleCallbackQuery'],
  ]) {
    const { source, method } = methodNode(file, className, methodName);
    let call;
    const visit = node => {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'this.runtime.ensureConnection') call = node;
      ts.forEachChild(node, visit);
    };
    visit(method);
    assert.ok(call, `${methodName} ensures its connection`);
    for (const entityId of [ownerId, alternateId]) {
      const sender = { id: 555555555, username: 'Alternate', first_name: 'Alternate' };
      const context = {
        entityId, roomId: '30303030-3030-4030-8030-303030303030', worldId: '40404040-4040-4040-8040-404040404040',
        ctx: { from: sender, chat: { type: 'private', first_name: 'Alternate' } }, chat: { type: 'private', first_name: 'Alternate' },
        newMember: sender, telegramId: String(sender.id), telegramUserId: String(sender.id),
        telegramRoomid: String(sender.id), chatId: String(sender.id), channelType: 'DM', ChannelType: { GROUP: 'GROUP' },
        getTelegramChatDisplayName: () => 'Alternate', getConfiguredOwnerEntityIds: core.getConfiguredOwnerEntityIds,
      };
      const run = runInNewContext(ts.transpile(`(async function() { return await ${call.getText(source)}; })`, {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      }), context);
      await run.call({ runtime: active });
      const saved = (await adapter.getEntitiesByIds([entityId]))[0];
      if (entityId === ownerId) {
        assert.deepEqual(saved.metadata, before.metadata, methodName);
        assert.deepEqual(saved.names, before.names, methodName);
      } else {
        assert.equal(saved.metadata.telegram.id, '555555555', methodName);
        assert.ok(saved.names.includes('Alternate'), methodName);
      }
    }
  }
});

test('callback buttons resolve primary and retained senders through the same native identity path', async () => {
  const { source, method } = methodNode('messageManager.ts', 'MessageManager', 'handleCallbackQuery');
  const declaration = method.body.statements.find(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(item => item.name.getText(source) === 'entityId'));
  assert.ok(declaration);
  for (const telegramUserId of ['6689469214', '555555555']) {
    const run = runInNewContext(ts.transpile(`(async function() { ${declaration.getText(source)} return entityId; })`, {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    }), { telegramUserId, resolveTelegramRuntimeEntityId: identity.resolveTelegramRuntimeEntityId });
    assert.equal(await run.call({ runtime: runtime({ retained: true }), accountId: 'default' }), ownerId);
  }
});
