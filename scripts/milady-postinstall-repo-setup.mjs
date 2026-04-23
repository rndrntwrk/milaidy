#!/usr/bin/env node
/**
 * Runs eliza `run-repo-setup` after install. When `eliza/` is already a full
 * checkout (e.g. after `preinstall` or CI `init-submodules`), the duplicate
 * `scripts/init-submodules.mjs` step is omitted so submodule work runs once.
 * If `eliza/` is not ready yet, the full eliza step list is used (e.g. manual
 * `bun run postinstall` after `bun install --ignore-scripts`).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isSubmoduleCheckoutReady } from "./init-submodules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const setupPath = path.join(
  repoRoot,
  "eliza/packages/app-core/scripts/run-repo-setup.mjs",
);

const setupHref = pathToFileURL(setupPath).href;
const setup = await import(setupHref);
const { runRepoSetup, repoSetupSteps } = setup;

const skip = "scripts/init-submodules.mjs";
if (isSubmoduleCheckoutReady("eliza", { rootDir: repoRoot })) {
  let removed = 0;
  for (let i = repoSetupSteps.length - 1; i >= 0; i--) {
    if (repoSetupSteps[i] === skip) {
      repoSetupSteps.splice(i, 1);
      removed++;
    }
  }
  if (removed === 0) {
    console.warn(
      "[milady-postinstall] eliza checkout looks ready but scripts/init-submodules.mjs was not in repoSetupSteps; continuing.",
    );
  }
}

await runRepoSetup();
