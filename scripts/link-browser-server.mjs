#!/usr/bin/env node
/**
 * Post-install setup for @elizaos/plugin-browser:
 *
 * 1. Symlinks the installed package's `dist/server` to the workspace's
 *    stagehand-server source (the npm package doesn't ship the server).
 *
 * 2. Copies the workspace's patched process-manager.js over the npm
 *    package's version (adds probe/reuse, port management, removes Docker
 *    env defaults).
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/link-browser-server.mjs
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const milaidyRoot = resolve(__dirname, "..");
const workspaceRoot = resolve(milaidyRoot, "..");

// ── Resolve plugin-browser package ───────────────────────────────────────────

let pluginRoot = null;
try {
  const req = createRequire(join(milaidyRoot, "package.json"));
  const pkgJson = req.resolve("@elizaos/plugin-browser/package.json");
  pluginRoot = dirname(pkgJson);
} catch {
  console.log(
    "[link-browser-server] @elizaos/plugin-browser not installed — skipping",
  );
}

// ── 1. Symlink stagehand-server ──────────────────────────────────────────────

const stagehandDir = join(
  workspaceRoot,
  "plugins",
  "plugin-browser",
  "stagehand-server",
);
const stagehandIndex = join(stagehandDir, "dist", "index.js");

if (pluginRoot) {
  if (existsSync(stagehandIndex)) {
    const serverLink = join(pluginRoot, "dist", "server");

    let needsLink = true;
    if (existsSync(serverLink)) {
      try {
        const target = readlinkSync(serverLink);
        if (target === stagehandDir) {
          console.log("[link-browser-server] Symlink already up to date");
          needsLink = false;
        } else {
          // Stale symlink — remove and recreate
          unlinkSync(serverLink);
        }
      } catch {
        // Not a symlink (real directory) — leave it alone
        console.log(
          "[link-browser-server] dist/server already exists as a directory — skipping symlink",
        );
        needsLink = false;
      }
    }

    if (needsLink) {
      try {
        symlinkSync(stagehandDir, serverLink, "dir");
        console.log(
          `[link-browser-server] Linked: ${serverLink} -> ${stagehandDir}`,
        );
      } catch (err) {
        console.error(`[link-browser-server] Failed to create symlink: ${err}`);
      }
    }
  } else {
    console.log(
      `[link-browser-server] Stagehand server not found at ${stagehandDir} — skipping symlink`,
    );
  }

  // ── 2. Copy patched process-manager.js ─────────────────────────────────────
  // The workspace has a fixed process-manager that adds port probing/reuse,
  // removes Docker env defaults, and handles EADDRINUSE properly.

  const patchedPm = join(
    workspaceRoot,
    "plugins",
    "plugin-browser",
    "typescript",
    "src",
    "services",
    "process-manager.patched.js",
  );
  const targetPm = join(pluginRoot, "dist", "services", "process-manager.js");

  if (existsSync(patchedPm) && existsSync(targetPm)) {
    try {
      copyFileSync(patchedPm, targetPm);
      console.log("[link-browser-server] Copied patched process-manager.js");
    } catch (err) {
      console.error(
        `[link-browser-server] Failed to copy process-manager.js: ${err}`,
      );
    }
  } else {
    console.log(
      "[link-browser-server] No patched process-manager.js found — skipping",
    );
  }
}

// ── 3. Patch known @elizaos/plugin-github spec-name mismatches ──────────────
// Some published plugin-github builds reference legacy action/provider IDs
// (e.g. CREATE_BRANCH) while shipping generated specs with new IDs
// (e.g. CREATE_GITHUB_BRANCH). That crashes plugin load at import time.
//
// We apply a deterministic rewrite so runtime can load the plugin consistently.

const githubPluginDist = join(
  milaidyRoot,
  "node_modules",
  "@elizaos",
  "plugin-github",
  "dist",
  "index.js",
);

const githubCompatRewrites = [
  [
    'requireActionSpec("CREATE_BRANCH")',
    'requireActionSpec("CREATE_GITHUB_BRANCH")',
  ],
  [
    'requireActionSpec("CREATE_COMMENT")',
    'requireActionSpec("CREATE_GITHUB_COMMENT")',
  ],
  [
    'requireActionSpec("CREATE_ISSUE")',
    'requireActionSpec("CREATE_GITHUB_ISSUE")',
  ],
  [
    'requireActionSpec("CREATE_PULL_REQUEST")',
    'requireActionSpec("CREATE_GITHUB_PULL_REQUEST")',
  ],
  [
    'requireActionSpec("MERGE_PULL_REQUEST")',
    'requireActionSpec("MERGE_GITHUB_PULL_REQUEST")',
  ],
  ['requireActionSpec("PUSH_CODE")', 'requireActionSpec("PUSH_GITHUB_CODE")'],
  [
    'requireActionSpec("REVIEW_PULL_REQUEST")',
    'requireActionSpec("REVIEW_GITHUB_PULL_REQUEST")',
  ],
  [
    'requireProviderSpec("issueContext")',
    'requireProviderSpec("GITHUB_ISSUE_CONTEXT")',
  ],
  [
    'requireProviderSpec("repositoryState")',
    'requireProviderSpec("GITHUB_REPOSITORY_STATE")',
  ],
];

if (!existsSync(githubPluginDist)) {
  console.log(
    "[link-browser-server] @elizaos/plugin-github dist not found — skipping compat patch",
  );
  process.exit(0);
}

try {
  const original = readFileSync(githubPluginDist, "utf8");
  let patched = original;
  let appliedCount = 0;

  for (const [from, to] of githubCompatRewrites) {
    if (!patched.includes(from)) continue;
    patched = patched.split(from).join(to);
    appliedCount += 1;
  }

  if (appliedCount === 0) {
    console.log(
      "[link-browser-server] plugin-github compat patch already applied (or not needed)",
    );
  } else {
    writeFileSync(githubPluginDist, patched, "utf8");
    console.log(
      `[link-browser-server] Patched plugin-github compatibility rewrites: ${appliedCount}`,
    );
  }
} catch (err) {
  console.error(
    `[link-browser-server] Failed plugin-github compat patch: ${err}`,
  );
}
