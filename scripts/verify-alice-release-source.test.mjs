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

test('recovery and acceptance corrections can reuse an unchanged runtime build', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, '.github/workflows/recover-alice-production-watchdog.yml'), 'on: workflow_dispatch\n');
  fs.mkdirSync(path.join(f.root, 'deploy/modal'), {recursive: true});
  fs.writeFileSync(path.join(f.root, 'deploy/modal/alice_production_acceptance.ts'), 'export const phase = "running";\n');
  fs.writeFileSync(path.join(f.root, 'deploy/modal/alice_production_acceptance.test.ts'), 'test("acceptance", () => {});\n');
  fs.writeFileSync(path.join(f.root, 'deploy/modal/alice_cloudflare_continuity.mjs'), 'export const candidate = "serving";\n');
  fs.writeFileSync(path.join(f.root, 'deploy/modal/alice_cloudflare_continuity.test.mjs'), 'test("continuity", () => {});\n');
  fs.writeFileSync(path.join(f.root, 'deploy/modal/alice_cloudflare_worker_rollback.mjs'), 'export const captureStage = "worker-version";\n');
  fs.writeFileSync(path.join(f.root, 'deploy/modal/alice_cloudflare_worker_rollback.test.mjs'), 'test("readback", () => {});\n');
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

test('host-only changes can reuse the image but dependency changes cannot', t => {
  const f = fixture(t);
  const hostDirectory = path.join(f.root, 'workers/alice-access-gateway/src');
  fs.mkdirSync(hostDirectory, {recursive: true});
  fs.writeFileSync(path.join(hostDirectory, 'alice-runtime-container.ts'), 'export const interceptHttps = true;\n');
  f.git('add', '.'); f.git('commit', '-m', 'Host HTTPS correction');
  const host = f.run(f.git('rev-parse', 'HEAD'));
  assert.equal(host.status, 0, host.stderr);
  fs.writeFileSync(path.join(f.root, 'workers/alice-access-gateway/package.json'), '{"dependencies":{"@cloudflare/containers":"0.4.0"}}\n');
  f.git('add', '.'); f.git('commit', '-m', 'Unqualified SDK change');
  assert.match(f.run(f.git('rev-parse', 'HEAD')).stderr, /ALICE_RELEASE_SOURCE_REBUILD_REQUIRED/);
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


test('rollback accepts a newer verified controller for an immutable older manifest and rejects runtime drift', t => {
  const f = fixture(t);
  const releaseModule = fileURLToPath(new URL('../deploy/modal/alice_cloudflare_release.mjs', import.meta.url));
  fs.writeFileSync(path.join(f.root, '.github/workflows/recover-alice-production-watchdog.yml'), 'on: workflow_dispatch\n');
  f.git('add', '.'); f.git('commit', '-m', 'Recovery controller correction');
  const run = phase => {
    const controller = f.git('rev-parse', 'HEAD');
    const args = {sourceRoot: f.root, sourceCommit: f.source, deploymentControllerCommit: f.source, phase};
    return spawnSync(process.execPath, ['--input-type=module', '-e',
      `import {verifyAliceReleaseExecutionSource} from ${JSON.stringify(releaseModule)}; verifyAliceReleaseExecutionSource(${JSON.stringify(args)});`], {
      cwd: f.root, encoding: 'utf8',
      env: {...process.env, GITHUB_REF: 'refs/heads/release/alice-production-core-2026-08-22', GITHUB_SHA: controller},
    });
  };
  const recovery = run('rollback');
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.match(run('promote').stderr, /ALICE_RELEASE_SOURCE_INVALID/);
  fs.writeFileSync(path.join(f.root, 'runtime.js'), 'export const version = 2;\n');
  f.git('add', '.'); f.git('commit', '-m', 'Unqualified runtime change');
  const drift = run('rollback');
  assert.equal(drift.status, 1);
  assert.match(drift.stderr, /ALICE_RELEASE_SOURCE_REBUILD_REQUIRED/);
});
