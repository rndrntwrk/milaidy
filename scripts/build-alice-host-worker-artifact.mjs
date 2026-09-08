import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAliceReleaseSource } from './verify-alice-release-source.mjs';
import { verifyAliceWorkerDryRunDirectory } from '../deploy/modal/alice_cloudflare_release.mjs';
import {
  buildAliceWorkerBundleArtifact,
  serializeAliceWorkerBundleArtifact,
  verifyAliceWorkerBundleArtifact,
} from '../deploy/modal/alice_worker_bundle_artifact.mjs';

// Control and both container host Workers may change. Compile all six to prove
// shared-source changes preserve the other three Workers and migrations.
export function buildAliceHostWorkerArtifact({
  sourceRoot, sourceCommit, deploymentControllerCommit, baseRoot, outputRoot,
  wranglerBin,
}) {
  verifyAliceReleaseSource({ sourceRoot, sourceCommit, deploymentControllerCommit });
  if (![sourceRoot, baseRoot, outputRoot, wranglerBin].every(value => typeof value === 'string' && path.isAbsolute(value)) ||
      fs.existsSync(outputRoot) ||
      execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim() !== deploymentControllerCommit) {
    throw new Error('ALICE_HOST_WORKER_BUILD_INPUT_INVALID');
  }
  if (execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim() !== '') throw new Error('ALICE_HOST_WORKER_BUILD_INPUT_INVALID');
  const base = verifyAliceWorkerBundleArtifact(
    fs.readFileSync(path.join(baseRoot, 'alice-worker-bundles.json'), 'utf8'),
    { root: baseRoot, expectedSourceCommit: sourceCommit },
  );
  const version = execFileSync(wranglerBin, ['--version'], { cwd: sourceRoot, encoding: 'utf8' });
  if (!/^4\.122\.0$/m.test(version.trim())) throw new Error('ALICE_HOST_WORKER_TOOL_INVALID');
  fs.mkdirSync(outputRoot, { recursive: false });
  for (const member of [...Object.values(base.bundles), ...base.migrations]) {
    const destination = path.join(outputRoot, member.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(baseRoot, member.path), destination, fs.constants.COPYFILE_EXCL);
  }
  for (const role of ['aiGateway', 'statePlane', 'connectorPlane']) {
    const relative = `${base.bundles[role].path}.map`;
    const sourceMap = path.join(baseRoot, relative);
    if (!fs.existsSync(sourceMap)) continue;
    if (!fs.lstatSync(sourceMap).isFile()) throw new Error('ALICE_HOST_WORKER_SOURCE_MAP_INVALID');
    fs.copyFileSync(sourceMap, path.join(outputRoot, relative), fs.constants.COPYFILE_EXCL);
  }
  for (const [role, configName, emittedName] of [
    ['access', 'alice-access-gateway/wrangler.jsonc', 'worker.js'],
    ['runtimeHost', 'alice-access-gateway/wrangler.runtime-host.jsonc', 'runtime-host.js'],
    ['control', 'alice-production-control/wrangler.jsonc', 'index.js'],
    ['aiGateway', 'alice-ai-gateway/wrangler.jsonc', 'index.js'],
    ['statePlane', 'alice-state-plane/wrangler.jsonc', 'index.js'],
    ['connectorPlane', 'alice-connector-plane/wrangler.jsonc', 'index.js'],
  ]) {
    const destination = path.join(outputRoot, base.bundles[role].path);
    execFileSync(wranglerBin, [
      'deploy', '--dry-run', '--outdir', path.dirname(destination),
      '--config', path.join(sourceRoot, 'workers', configName),
    ], { cwd: sourceRoot, stdio: 'inherit' });
    fs.renameSync(path.join(path.dirname(destination), emittedName), destination);
  }
  const artifact = buildAliceWorkerBundleArtifact({
    root: outputRoot, sourceCommit: deploymentControllerCommit, wranglerVersion: '4.122.0',
  });
  if (['aiGateway', 'statePlane', 'connectorPlane'].some(role =>
    artifact.bundles[role].sha256 !== base.bundles[role].sha256) ||
    JSON.stringify(artifact.migrations) !== JSON.stringify(base.migrations)) {
    throw new Error('ALICE_HOST_WORKER_BASE_DRIFT');
  }
  // Exercise the same no-bundle upload path before attestation or provider writes.
  // Source maps remain sidecars; executable bytes must still match exactly.
  const dryRunRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-host-upload-check-'));
  try {
    for (const [role, config] of [
      ['control', 'alice-production-control/wrangler.jsonc'],
      ['aiGateway', 'alice-ai-gateway/wrangler.jsonc'],
      ['statePlane', 'alice-state-plane/wrangler.jsonc'],
      ['connectorPlane', 'alice-connector-plane/wrangler.jsonc'],
      ['runtimeHost', 'alice-access-gateway/wrangler.runtime-host.jsonc'],
      ['access', 'alice-access-gateway/wrangler.jsonc'],
    ]) {
      const signedBundlePath = path.join(outputRoot, artifact.bundles[role].path);
      const outdir = path.join(dryRunRoot, role);
      execFileSync(wranglerBin, [
        'versions', 'upload', signedBundlePath,
        '--config', path.join(sourceRoot, 'workers', config),
        '--no-bundle', '--dry-run', '--outdir', outdir,
      ], { cwd: sourceRoot, stdio: 'inherit' });
      verifyAliceWorkerDryRunDirectory({ signedBundlePath, outdir,
        expectedSha256: artifact.bundles[role].sha256 });
    }
  } finally {
    fs.rmSync(dryRunRoot, { recursive: true, force: true });
  }
  fs.writeFileSync(path.join(outputRoot, 'alice-worker-bundles.json'),
    serializeAliceWorkerBundleArtifact(artifact), { flag: 'wx', mode: 0o444 });
  return artifact;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAliceHostWorkerArtifact({
    sourceRoot: process.cwd(),
    sourceCommit: process.env.ALICE_SOURCE_COMMIT,
    deploymentControllerCommit: process.env.ALICE_DEPLOYMENT_CONTROLLER_COMMIT,
    baseRoot: process.env.ALICE_BASE_WORKER_BUNDLE_ROOT,
    outputRoot: process.env.ALICE_WORKER_BUNDLE_ROOT,
    wranglerBin: process.env.ALICE_WRANGLER_BIN,
  });
}
