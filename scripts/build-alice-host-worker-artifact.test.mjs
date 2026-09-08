import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildAliceHostWorkerArtifact } from './build-alice-host-worker-artifact.mjs';
import { buildAliceWorkerBundleArtifact, serializeAliceWorkerBundleArtifact } from '../deploy/modal/alice_worker_bundle_artifact.mjs';

test('rebuilds Control and both hosts while proving the other three Workers and migrations unchanged', t => {
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
    fs.writeFileSync(path.join(baseRoot, worker, 'index.js'), `original ${worker}\n//# sourceMappingURL=index.js.map\n`);
    fs.writeFileSync(path.join(baseRoot, worker, 'index.js.map'), JSON.stringify({version: 3, sources: [`${worker}.ts`], mappings: ''}));
  }
  const migrations = path.join(baseRoot, 'alice-state-plane/migrations'); fs.mkdirSync(migrations);
  for (const name of ['0001_alice_state.sql', '0002_execution_records.sql', '0003_eliza_database.sql']) fs.writeFileSync(path.join(migrations, name), `-- ${name}\n`);
  const base = buildAliceWorkerBundleArtifact({root: baseRoot, sourceCommit, wranglerVersion: '4.122.0'});
  fs.writeFileSync(path.join(baseRoot, 'alice-worker-bundles.json'), serializeAliceWorkerBundleArtifact(base));
  const wranglerBin = path.join(root, 'wrangler');
  fs.writeFileSync(wranglerBin, `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
if (process.argv[2] === '--version') { console.log('4.122.0'); process.exit(0); }
if (!process.argv.includes('--dry-run')) process.exit(9);
const out = process.argv[process.argv.indexOf('--outdir') + 1];
const config = process.argv[process.argv.indexOf('--config') + 1];
if (process.argv[2] === 'versions' && process.argv[3] === 'upload') {
  if (!process.argv.includes('--no-bundle')) process.exit(10);
  const source = process.argv[4];
  const content = fs.readFileSync(source, 'utf8');
  if (content.includes('sourceMappingURL=index.js.map') && !fs.existsSync(source + '.map')) process.exit(11);
  fs.mkdirSync(out, {recursive: true});
  fs.copyFileSync(source, path.join(out, 'index.js'));
  process.exit(0);
}
if (process.argv[2] !== 'deploy') process.exit(9);
const worker = path.basename(path.dirname(config));
const unchanged = ['alice-ai-gateway', 'alice-state-plane', 'alice-connector-plane'].includes(worker);
const emitted = worker === 'alice-access-gateway' ? (config.endsWith('wrangler.runtime-host.jsonc') ? 'runtime-host.js' : 'worker.js') : 'index.js';
const content = unchanged ? 'original ' + worker + '\\n//# sourceMappingURL=index.js.map\\n' : 'rebuilt reviewed ' + worker + path.basename(config);
fs.writeFileSync(path.join(out, emitted), content);
`, {mode: 0o700});
  const options = {sourceRoot, sourceCommit, deploymentControllerCommit, baseRoot, wranglerBin};
  const result = buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'output')});
  assert.equal(result.sourceCommit, deploymentControllerCommit);
  for (const role of ['control', 'access', 'runtimeHost']) assert.notEqual(result.bundles[role].sha256, base.bundles[role].sha256);
  for (const role of ['aiGateway', 'statePlane', 'connectorPlane']) {
    assert.deepEqual(result.bundles[role], base.bundles[role]);
    const relative = `${base.bundles[role].path}.map`;
    assert.deepEqual(fs.readFileSync(path.join(root, 'output', relative)), fs.readFileSync(path.join(baseRoot, relative)));
  }
  assert.deepEqual(result.migrations, base.migrations);
  const wranglerSource = fs.readFileSync(wranglerBin, 'utf8');
  fs.writeFileSync(wranglerBin, wranglerSource.replace("fs.writeFileSync(path.join(out, emitted), content);", "if (worker !== 'alice-ai-gateway') fs.writeFileSync(path.join(out, emitted), content);"));
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'missing-emission-rejected')}), /ENOENT/);
  fs.writeFileSync(wranglerBin, wranglerSource.replace("unchanged ? 'original '", "unchanged ? 'changed '"));
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'peer-drift-rejected')}), /ALICE_HOST_WORKER_BASE_DRIFT/);
  fs.writeFileSync(wranglerBin, wranglerSource);
  const controlMap = path.join(baseRoot, `${base.bundles.aiGateway.path}.map`);
  const mapBytes = fs.readFileSync(controlMap);
  fs.unlinkSync(controlMap);
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'missing-map-rejected')}));
  assert.equal(fs.existsSync(path.join(root, 'missing-map-rejected/alice-worker-bundles.json')), false);
  fs.writeFileSync(controlMap, mapBytes);
  const hostSource = path.join(hostDirectory, 'alice-runtime-container.ts');
  fs.appendFileSync(hostSource, 'uncommitted source');
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'dirty-rejected')}), /ALICE_HOST_WORKER_BUILD_INPUT_INVALID/);
  assert.equal(fs.existsSync(path.join(root, 'dirty-rejected')), false);
  fs.writeFileSync(hostSource, 'reviewed host\n');
  fs.appendFileSync(path.join(baseRoot, base.bundles.statePlane.path), 'tampered');
  assert.throws(() => buildAliceHostWorkerArtifact({...options, outputRoot: path.join(root, 'rejected')}), /ALICE_WORKER_BUNDLE_ARTIFACT_INVALID/);
  assert.equal(fs.existsSync(path.join(root, 'rejected')), false);
});
