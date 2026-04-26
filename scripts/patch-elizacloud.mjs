#!/usr/bin/env node
/**
 * Bridge patch — apply Milady-local fixes to @elizaos/plugin-elizacloud
 * dist files in node_modules. These patches are also being upstreamed
 * (see https://github.com/elizaos-plugins/plugin-elizacloud/pull/15).
 * Once that PR merges and a new alpha is published, delete this script,
 * the patches/elizacloud/ directory, and the postinstall hook entry.
 *
 * Pinned to @elizaos/plugin-elizacloud@2.0.0-alpha.8 — refuses to apply
 * to other versions because the patch context lines may have shifted.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PINNED_VERSION = "2.0.0-alpha.8";
const PATCH_REL_PATH = "patches/elizacloud/0001-json-output-enforcement-and-fence-strip.patch";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");
const patchPath = path.join(repoRoot, PATCH_REL_PATH);
const pluginLink = path.join(repoRoot, "node_modules", "@elizaos", "plugin-elizacloud");

function log(msg) {
  console.log(`[patch-elizacloud] ${msg}`);
}

function fail(msg) {
  console.error(`[patch-elizacloud] ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(patchPath)) {
    fail(`patch file missing: ${path.relative(repoRoot, patchPath)}`);
  }

  if (!fs.existsSync(pluginLink)) {
    log("@elizaos/plugin-elizacloud not installed — skipping (will retry on next install)");
    return;
  }

  // node_modules entry is typically a symlink to the workspace package.
  // Resolve it so git apply can work against a real path.
  const pluginRoot = fs.realpathSync(pluginLink);

  const pkgJsonPath = path.join(pluginRoot, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    fail(`plugin package.json missing at ${pkgJsonPath}`);
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  if (pkg.version !== PINNED_VERSION) {
    fail(
      `version mismatch — patch was authored against @elizaos/plugin-elizacloud@${PINNED_VERSION}, ` +
      `but installed version is ${pkg.version}. Regenerate the patch against the new version, ` +
      `or update PINNED_VERSION in this script if the patch still applies cleanly.`,
    );
  }

  // Reverse-check first: if patches are already applied, exit cleanly.
  const reverseCheck = spawnSync("git", [
    "apply",
    "--reverse",
    "--check",
    "--unsafe-paths",
    `--directory=${pluginRoot}`,
    patchPath,
  ], { encoding: "utf8" });

  if (reverseCheck.status === 0) {
    log("patches already applied");
    return;
  }

  // Forward-check
  const forwardCheck = spawnSync("git", [
    "apply",
    "--check",
    "--unsafe-paths",
    `--directory=${pluginRoot}`,
    patchPath,
  ], { encoding: "utf8" });

  if (forwardCheck.status !== 0) {
    fail(`patch no longer applies cleanly:\n${forwardCheck.stderr.trim()}`);
  }

  // Apply
  const apply = spawnSync("git", [
    "apply",
    "--unsafe-paths",
    `--directory=${pluginRoot}`,
    patchPath,
  ], { encoding: "utf8" });

  if (apply.status !== 0) {
    fail(`apply failed:\n${apply.stderr.trim()}`);
  }

  log("applied 2 patches across 2 files");
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
