#!/usr/bin/env node
/**
 * Production build orchestrator.
 *
 * Upstream provides the mode-switching baseline:
 *   - packages mode (isLocalElizaDisabled === true) → delegate to
 *     scripts/run-eliza-app-core-script.mjs which runs the standard
 *     elizaOS production build.
 *   - local mode (default for alice's AWS deploy) → run the inline
 *     local-mode flow with the elizaOS patch scripts + tsdown + vite.
 *
 * Alice layer on top of the local-mode flow:
 *   - Capacitor plugin-build (apps/app/scripts/plugin-build.mjs) runs
 *     in parallel with tsdown for build speed.
 *   - Milady asset-CDN handling: resolveMiladyAssetBaseUrls() supplies
 *     VITE_ASSET_BASE_URL so the vite build emits CDN-anchored asset
 *     paths; prune-cdn-local-assets.mjs prunes the local copies after
 *     the CDN upload step.
 *   - The pinned Bun runtime is required for clean-checkout Eliza package
 *     builds and write-build-info, keeping deployment builds reproducible.
 *   - resolveNodeExec() handles the case where this script is invoked
 *     via `bun run`, where process.execPath is bun, not node — needed
 *     because tsdown + vite CLIs require real node.
 */

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveMiladyAssetBaseUrls } from "./lib/asset-cdn.mjs";
import { isLocalElizaDisabled } from "./lib/eliza-package-mode.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const appDir = path.join(repoRoot, "apps", "app");
const requiredBunVersion = "1.3.13";
const isAliceFullGatedBuild = process.env.ALICE_RUNTIME_PROFILE === "full-gated";

if (isAliceFullGatedBuild && (process.env.ELIZA_SKIP_PLUGINS ?? "").trim()) {
  throw new Error("ALICE_PRODUCTION_BUILD_STUB_FORBIDDEN");
}

// ── alice: real Node binary even when started via `bun run` ────────────────
function resolveNodeExec() {
  if (!process.versions.bun) {
    return process.execPath;
  }
  const probe = spawnSync(
    "node",
    ["-e", "process.stdout.write(process.execPath)"],
    { encoding: "utf8" },
  );
  const out = probe.stdout?.trim();
  if (probe.status === 0 && out) {
    return out;
  }
  throw new Error(
    "Node.js is required to run this build (tsx + Vite CLI). Install Node 22+ or run: node scripts/run-production-build.mjs",
  );
}

function resolveBunForScripts() {
  if (process.versions.bun) {
    return process.versions.bun === requiredBunVersion
      ? process.execPath
      : null;
  }
  const probe = spawnSync("bun", ["--version"], { encoding: "utf8" });
  return probe.status === 0 && probe.stdout?.trim() === requiredBunVersion
    ? "bun"
    : null;
}

const node = resolveNodeExec();
const { appAssetBaseUrl } = resolveMiladyAssetBaseUrls();

function run(command, args, cwd = repoRoot) {
  const env = {
    ...process.env,
    ...(appAssetBaseUrl
      ? {
          VITE_ASSET_BASE_URL:
            process.env.VITE_ASSET_BASE_URL ??
            process.env.MILADY_ASSET_BASE_URL ??
            appAssetBaseUrl,
        }
      : {}),
  };
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", (error) => {
      reject(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

if (isLocalElizaDisabled()) {
  // Upstream: packages-mode path — delegate to the elizaOS app-core script
  await run(node, [
    "scripts/run-eliza-app-core-script.mjs",
    "run-production-build.mjs",
  ]);
} else {
  // Local-mode (alice's deploy): upstream's patch+build flow + alice layer
  const tsdownCli = require.resolve("tsdown/run");
  const vitePackageRoot = path.dirname(require.resolve("vite/package.json"));
  const viteCli = path.join(vitePackageRoot, "bin", "vite.js");
  const pluginBuildScript = path.join(appDir, "scripts", "plugin-build.mjs");
  const writeBuildInfoScript = path.join(
    repoRoot,
    "scripts",
    "write-build-info.ts",
  );
  const pruneCdnAssetsScript = path.join(
    repoRoot,
    "scripts",
    "prune-cdn-local-assets.mjs",
  );
  const bunForScripts = resolveBunForScripts();

  if (!bunForScripts) {
    throw new Error(
      `Bun ${requiredBunVersion} is required for the local Eliza production build.`,
    );
  }

  // Upstream: elizaOS patch scripts that prepare the workspace for build
  if (!isAliceFullGatedBuild) {
    await run(node, ["scripts/ensure-elizaos-optional-app-stubs.mjs"]);
  }
  await run(node, ["scripts/patch-elizaos-package-styles.mjs"]);
  if (!isAliceFullGatedBuild) {
    await run(node, ["scripts/patch-elizaos-plugin-browser-bridge-package.mjs"]);
  }

  // Current official Eliza exports UI and app-core browser entrypoints from
  // dist/. A clean Alice checkout must build those pinned workspace packages
  // before Vite resolves their exports; relying on ignored artifacts makes the
  // production build checkout-dependent.
  await Promise.all([
    run(
      bunForScripts,
      ["run", "build"],
      path.join(repoRoot, "eliza", "packages", "shared"),
    ),
    run(
      bunForScripts,
      ["run", "build"],
      path.join(repoRoot, "eliza", "packages", "ui"),
    ),
    run(
      bunForScripts,
      ["run", "build"],
      path.join(repoRoot, "eliza", "packages", "app-core"),
    ),
  ]);

  // Alice + upstream: tsdown ∥ Capacitor plugin-build (parallel)
  await Promise.all([
    run(node, [
      tsdownCli,
      "--config-loader",
      "native",
      "--fail-on-warn",
      "false",
    ]),
    run(node, [pluginBuildScript], appDir),
  ]);

  // Upstream: post-tsdown patch for native browser package
  await run(node, [
    "scripts/patch-elizaos-app-core-native-browser-package.mjs",
  ]);

  // Vite SPA build
  await run(node, [viteCli, "build"], appDir);

  // Alice: write-build-info — prefer bun if available
  await run(bunForScripts, [writeBuildInfoScript], repoRoot);

  // Alice: CDN asset pruning (only when MILADY_ASSET_BASE_URL is set)
  if (appAssetBaseUrl) {
    await run(node, [pruneCdnAssetsScript], repoRoot);
  }
}
