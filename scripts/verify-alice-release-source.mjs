import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const COMMIT = /^[a-f0-9]{40}$/;
// These files control release execution; none changes the built runtime or
// attested Worker bundles. Any other changed path requires a fresh build.
const CONTROLLER_PATHS = new Set([
  '.github/workflows/recover-alice-production-watchdog.yml',
  '.github/workflows/alice-cloudflare-container-bringup.yml',
  '.github/workflows/deploy-alice-cloudflare.yml',
  'deploy/modal/alice_cloudflare_bootstrap.mjs',
  'deploy/modal/alice_cloudflare_bootstrap.test.mjs',
  'deploy/modal/alice_cloudflare_release.mjs',
  'deploy/modal/alice_cloudflare_release.test.mjs',
  'scripts/deploy-alice-cloudflare-workflow.test.mjs',
  'scripts/verify-alice-release-source.mjs',
  'scripts/verify-alice-release-source.test.mjs',
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
