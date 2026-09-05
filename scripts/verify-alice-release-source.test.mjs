import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const verifier = fileURLToPath(new URL('./verify-alice-release-source.mjs', import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-source-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-b', 'release-test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Release test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  fs.mkdirSync(path.join(root, '.github/workflows'), {recursive: true});
  fs.writeFileSync(path.join(root, '.github/workflows/recover-alice-production-watchdog.yml'), 'on: push\n');
  fs.writeFileSync(path.join(root, 'runtime.js'), 'export const version = 1;\n');
  git('add', '.'); git('commit', '-m', 'Runtime source');
  const source = git('rev-parse', 'HEAD');
  return {root, git, source, run: controller => spawnSync(process.execPath, [verifier, source, controller], {cwd: root, encoding: 'utf8'})};
}

test('recovery renewal can reuse an ancestor build without changing its runtime', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, '.github/workflows/recover-alice-production-watchdog.yml'), 'on: workflow_dispatch\n');
  f.git('add', '.'); f.git('commit', '-m', 'Renew recovery');
  const controller = f.git('rev-parse', 'HEAD');
  const result = f.run(controller);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {sourceCommit: f.source, deploymentControllerCommit: controller});
});

test('runtime changes require a new build even when recovery also changes', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'runtime.js'), 'export const version = 2;\n');
  f.git('add', '.'); f.git('commit', '-m', 'Changed runtime');
  const result = f.run(f.git('rev-parse', 'HEAD'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ALICE_RELEASE_SOURCE_REBUILD_REQUIRED/);
});

test('an unrelated source cannot be admitted as a reused build', t => {
  const f = fixture(t);
  f.git('checkout', '--orphan', 'unrelated-controller');
  f.git('commit', '-m', 'Unrelated history');
  const result = f.run(f.git('rev-parse', 'HEAD'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ALICE_RELEASE_SOURCE_ANCESTRY_INVALID/);
});

test('renaming runtime code into a controller path still requires a rebuild', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'scripts'));
  f.git('mv', 'runtime.js', 'scripts/verify-alice-release-source.mjs');
  f.git('commit', '-m', 'Moved runtime code');
  const result = f.run(f.git('rev-parse', 'HEAD'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ALICE_RELEASE_SOURCE_REBUILD_REQUIRED/);
});
