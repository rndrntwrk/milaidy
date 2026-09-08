import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const COMMIT = /^[a-f0-9]{40}$/;
// Runtime image inputs remain frozen. Control and both host modules are rebuilt
// and attested; the other three Worker bytes must match the original build.
const CONTROLLER_PATHS = new Set([
  '.github/workflows/recover-alice-production-watchdog.yml',
  '.github/workflows/alice-cloudflare-container-bringup.yml',
  '.github/workflows/deploy-alice-cloudflare.yml',
  'deploy/modal/alice_cloudflare_bootstrap.mjs',
  'deploy/modal/alice_cloudflare_bootstrap.test.mjs',
  'deploy/modal/alice_cloudflare_config.mjs',
  'deploy/modal/alice_cloudflare_config.test.mjs',
  'deploy/modal/alice_cloudflare_continuity.mjs',
  'deploy/modal/alice_cloudflare_continuity.test.mjs',
  'deploy/modal/alice_cloudflare_live_readback.mjs',
  'deploy/modal/alice_cloudflare_live_readback.test.mjs',
  'deploy/modal/alice_cloudflare_worker_rollback.mjs',
  'deploy/modal/alice_cloudflare_worker_rollback.test.mjs',
  'deploy/modal/alice_workflow_binding_canary.mjs',
  'deploy/modal/alice_workflow_binding_canary.test.mjs',
  'deploy/modal/alice_cloudflare_release.mjs',
  'deploy/modal/alice_cloudflare_release.test.mjs',
  'deploy/modal/alice_cloudflare_provider_readback.mjs',
  'deploy/modal/alice_cloudflare_provider_readback.test.mjs',
  'deploy/modal/alice_production_acceptance.ts',
  'deploy/modal/alice_production_acceptance.test.ts',
  'deploy/modal/alice_reaccept_qualified_candidate.ts',
  'deploy/modal/alice_reaccept_qualified_candidate.test.ts',
  'deploy/modal/alice_release_pause.mjs',
  'deploy/modal/alice_release_deadline.mjs',
  'deploy/modal/alice_release_deadline.test.mjs',
  'scripts/deploy-alice-cloudflare-workflow.test.mjs',
  'scripts/verify-alice-release-source.mjs',
  'scripts/verify-alice-release-source.test.mjs',
  'scripts/build-alice-host-worker-artifact.mjs',
  'scripts/build-alice-host-worker-artifact.test.mjs',
  'deploy/modal/alice_worker_bundle_artifact.mjs',
  'deploy/modal/alice_worker_bundle_artifact.test.mjs',
  'deploy/modal/alice_deployment_manifest.mjs',
  'deploy/modal/alice_deployment_manifest.test.mjs',
  'workers/alice-access-gateway/src/alice-runtime-container.ts',
  'workers/alice-access-gateway/src/alice-runtime-host.ts',
  'workers/alice-access-gateway/test/runtime-container.test.ts',
  'workers/alice-access-gateway/test/runtime-https.test.ts',
  'workers/alice-access-gateway/test/index.test.ts',
  'workers/alice-ai-gateway/src/index.test.mjs',
  'workers/alice-production-control/test/runtime-config.test.ts',
  'workers/alice-production-control/src/authority.ts',
  'workers/alice-production-control/src/durable.ts',
  'workers/alice-production-control/src/runtime-config.ts',
  'workers/alice-production-control/manifests/policy.v1.json',
  'workers/alice-production-control/wrangler.jsonc',
  'workers/alice-production-control/test/authority.test.ts',
  'workers/alice-production-control/test/policy-contract.test.ts',
  'workers/alice-effective-config.js',
]);

export function verifyAliceReleaseSource({sourceRoot, sourceCommit, deploymentControllerCommit}) {
  if (!COMMIT.test(sourceCommit ?? '') || !COMMIT.test(deploymentControllerCommit ?? '')) {
    throw new Error('ALICE_RELEASE_SOURCE_IDENTITY_INVALID');
  }
  const git = args => execFileSync('git', args, {
    cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    git(['merge-base', '--is-ancestor', sourceCommit, deploymentControllerCommit]);
  } catch {
    throw new Error('ALICE_RELEASE_SOURCE_ANCESTRY_INVALID');
  }
  const changed = git(['diff', '--no-renames', '--name-only', '-z', sourceCommit, deploymentControllerCommit]).split('\0').filter(Boolean);
  if (changed.some(file => !CONTROLLER_PATHS.has(file))) {
    throw new Error('ALICE_RELEASE_SOURCE_REBUILD_REQUIRED');
  }
  return {sourceCommit, deploymentControllerCommit};
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 4) throw new Error('ALICE_RELEASE_SOURCE_IDENTITY_INVALID');
    const identity = verifyAliceReleaseSource({
      sourceRoot: process.cwd(), sourceCommit: process.argv[2], deploymentControllerCommit: process.argv[3],
    });
    process.stdout.write(`${JSON.stringify(identity)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
