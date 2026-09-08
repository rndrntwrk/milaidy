import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildAliceHostWorkerArtifact } from './build-alice-host-worker-artifact.mjs';
import { buildAliceWorkerBundleArtifact, serializeAliceWorkerBundleArtifact } from '../deploy/modal/alice_worker_bundle_artifact.mjs';

test('rebuilds the two host modules and retains verified four-Worker and migration bytes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-host-build-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const sourceRoot = path.join(root, 'source');
  fs.mkdirSync(sourceRoot);
  const git = (...args) => execFileSync('git', args, {cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-b', 'release-test');
  git('config', 'user.name', 'Release test'); git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', '/dev/null');
  fs.writeFileSync(path.join(sourceRoot, 'runtime.js'), 'original image\n');
  git('add', '.'); git('commit', '-m', 'Image source');
  const sourceCommit = git('rev-parse', 'HEAD');
  const hostDirectory = path.join(sourceRoot, 'workers/alice-access-gateway/src');
  fs.mkdirSync(hostDirectory, {recursive: true});
  fs.writeFileSync(path.join(hostDirectory, 'alice-runtime-container.ts'), 'reviewed host\n');
  git('add', '.'); git('commit', '-m', 'Host source');
  const deploymentControllerCommit = git('rev-parse', 'HEAD');
  const baseRoot = path.join(root, 'base'); fs.mkdirSync(baseRoot);
  for (const worker of ['alice-access-gateway', 'alice-runtime-container-host', 'alice-production-control', 'alice-ai-gateway', 'alice-state-plane', 'alice-connector-plane']) {
    fs.mkdirSync(path.join(baseRoot, worker));
    fs.writeFileSync(path.join(baseRoot, worker, 'index.js'), `original ${worker}\n`);
  }
  const migrations = path.join(baseRoot, 'alice-state-plane/migrations'); fs.mkdirSync(migrations);
  for (const name of ['0001_alice_state.sql', '0002_execution_records.sql', '0003_eliza_database.sql']) fs.writeFileSync(path.join(migrations, name), `-- ${name}\n`);
  const base = buildAliceWorkerBundleArtifact({root: baseRoot, sourceCommit, wranglerVersion: '4.122.0'});
  fs.writeFileSync(path.join(baseRoot, 'alice-worker-bundles.json'), serializeAliceWorkerBundleArtifact(base));
  const wranglerBin = path.join(root, 'wrangler');
  fs.writeFileSync(wranglerBin, `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
if (process.argv[2] === '--version') { console.log('4.122.0'); process.exit(0); }
if (process.argv[2] !== 'deploy' || !process.argv.includes('--dry-run')) process.exit(9);
const out = process.argv[process.argv.indexOf('--outdir') + 1];
const config = process.argv[process.argv.indexOf('--config') + 1];
fs.writeFileSync(path.join(out, config.endsWith('wrangler.runtime-host.jsonc') ? 'runtime-host.js' : 'worker.js'), 'rebuilt reviewed host ' + path.basename(config));
`, {mode: 0o700});
  const options = {sourceRoot, sourceCommit, deploymentControllerCommit, baseRoot, wranglerBin};
  const result = buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'output')});
  assert.equal(result.sourceCommit, deploymentControllerCommit);
  for (const role of ['access', 'runtimeHost']) assert.notEqual(result.bundles[role].sha256, base.bundles[role].sha256);
  for (const role of ['control', 'aiGateway', 'statePlane', 'connectorPlane']) assert.deepEqual(result.bundles[role], base.bundles[role]);
  assert.deepEqual(result.migrations, base.migrations);
  const hostSource = path.join(hostDirectory, 'alice-runtime-container.ts');
  fs.appendFileSync(hostSource, 'uncommitted source');
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'dirty-rejected')}), /ALICE_HOST_WORKER_BUILD_INPUT_INVALID/);
  assert.equal(fs.existsSync(path.join(root, 'dirty-rejected')), false);
  fs.writeFileSync(hostSource, 'reviewed host\n');
  fs.appendFileSync(path.join(baseRoot, base.bundles.statePlane.path), 'tampered');
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'rejected')}), /ALICE_WORKER_BUNDLE_ARTIFACT_INVALID/);
  assert.equal(fs.existsSync(path.join(root, 'rejected')), false);
});
