import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAliceReleaseSource } from './verify-alice-release-source.mjs';
import {
  buildAliceWorkerBundleArtifact,
  serializeAliceWorkerBundleArtifact,
  verifyAliceWorkerBundleArtifact,
} from '../deploy/modal/alice_worker_bundle_artifact.mjs';

// Only the two Workers containing the container host are rebuilt. Preserve
// the other four Workers and migrations from the verified original build.
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
  for (const [role, configName, emittedName] of [
    ['access', 'wrangler.jsonc', 'worker.js'],
    ['runtimeHost', 'wrangler.runtime-host.jsonc', 'runtime-host.js'],
  ]) {
    const destination = path.join(outputRoot, base.bundles[role].path);
    execFileSync(wranglerBin, [
      'deploy', '--dry-run', '--outdir', path.dirname(destination),
      '--config', path.join(sourceRoot, 'workers/alice-access-gateway', configName),
    ], { cwd: sourceRoot, stdio: 'inherit' });
    fs.renameSync(path.join(path.dirname(destination), emittedName), destination);
  }
  const artifact = buildAliceWorkerBundleArtifact({
    root: outputRoot, sourceCommit: deploymentControllerCommit, wranglerVersion: '4.122.0',
  });
  if (['control', 'aiGateway', 'statePlane', 'connectorPlane'].some(role =>
    artifact.bundles[role].sha256 !== base.bundles[role].sha256) ||
    JSON.stringify(artifact.migrations) !== JSON.stringify(base.migrations)) {
    throw new Error('ALICE_HOST_WORKER_BASE_DRIFT');
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
