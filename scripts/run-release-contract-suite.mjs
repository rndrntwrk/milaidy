#!/usr/bin/env node
/**
 * Release contract suite — alice's flow.
 *
 * Runs alice's release-contract test list, the milaidy startup contract,
 * then a production build + release:check verification. This script is
 * invoked from CI.
 *
 * Upstream's helpers (mode-switching, eliza-worktree cleanup, legacy
 * electrobun compat-dir handling, etc.) are exported below for callers
 * that need them, but alice's release flow stays simple and explicit.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(scriptDir, "..");
const repoRoot = ROOT;
const appCoreRoot = path.resolve(repoRoot, "eliza", "packages", "app-core");
const legacyElectrobunDir = path.join(repoRoot, "apps", "app", "electrobun");
const canonicalElectrobunDir = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "platforms",
  "electrobun",
);

// ── alice's release-contract test list ──────────────────────────────────
// These are the tests alice's CI runs as the release-readiness gate.
// Distinct from upstream's `rootReleaseContractTests` (alice has different
// release surface concerns, e.g. asset-cdn, docker, chrome-extension,
// whisper-build-script).
const aliceReleaseContractTests = [
  "scripts/asset-cdn.test.ts",
  "scripts/docker-contract.test.ts",
  "scripts/chrome-extension-release-surface.test.ts",
  "scripts/electrobun-release-workflow-drift.test.ts",
  "scripts/electrobun-test-workflow-drift.test.ts",
  "scripts/whisper-build-script-drift.test.ts",
  "scripts/release-check.test.ts",
  "scripts/static-asset-manifest.test.ts",
];

function runCmd(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
    },
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// ── alice's release flow ────────────────────────────────────────────────
runCmd("bunx", ["vitest", "run", ...aliceReleaseContractTests]);
runCmd("bun", ["run", "test:startup:contract"]);

runCmd("bunx", ["tsdown"]);
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "dist", "package.json"),
  '{"type":"module"}\n',
);
runCmd("node", ["--import", "tsx", "scripts/write-build-info.ts"]);
// Regenerate static asset manifest from the CI build output so hashes
// match what release:check will validate.
runCmd("node", ["scripts/generate-static-asset-manifest.mjs"]);
runCmd("bun", ["run", "release:check"]);

// ── upstream helpers exported for callers that want the new infra ──────
// These exist so other scripts can opt into upstream's release-contract
// utilities (mode-switching, eliza-worktree restore, electrobun compat-dir)
// without duplicating the logic. Alice's release flow above does NOT use
// them — alice's contract is the simpler list above.

const rootReleaseContractTests = [
  "scripts/electrobun-runtime-root-contract.test.ts",
  "scripts/release-workflow-contract.test.mjs",
];
const appCoreReleaseContractTests = [
  "eliza/packages/app-core/scripts/electrobun-release-workflow-drift.test.ts",
  "eliza/packages/app-core/scripts/release-check.test.ts",
  "eliza/packages/app-core/scripts/static-asset-manifest.test.ts",
];
export const releaseContractTests = [
  ...rootReleaseContractTests,
  ...appCoreReleaseContractTests,
];

export function hasLocalElizaAppCore(root = repoRoot) {
  return fs.existsSync(path.join(root, "eliza", "packages", "app-core"));
}

export function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? "1",
    },
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status ?? 1}: ${command} ${args.join(" ")}`,
    );
  }
}

export function isElizaWorktreeClean(root = repoRoot) {
  const result = spawnSync("git", ["-C", "eliza", "status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return result.status === 0 && result.stdout.trim().length === 0;
}

export function listElizaUntrackedFiles(root = repoRoot) {
  const result = spawnSync(
    "git",
    ["-C", "eliza", "ls-files", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function restoreGeneratedElizaChanges(
  shouldRestore,
  root = repoRoot,
  initialUntrackedFiles = [],
) {
  if (!shouldRestore) {
    return false;
  }

  let restored = false;
  const diff = spawnSync("git", ["-C", "eliza", "diff", "--binary"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (diff.status === 0 && diff.stdout.trim().length > 0) {
    const apply = spawnSync("git", ["-C", "eliza", "apply", "-R", "-"], {
      cwd: root,
      encoding: "utf8",
      input: diff.stdout,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (apply.status !== 0) {
      const stderr = apply.stderr.trim();
      throw new Error(
        stderr || "failed to restore generated eliza release-contract changes",
      );
    }
    restored = true;
  }

  const initialUntracked = new Set(initialUntrackedFiles);
  for (const relativePath of listElizaUntrackedFiles(root)) {
    if (initialUntracked.has(relativePath)) {
      continue;
    }
    fs.rmSync(path.join(root, "eliza", relativePath), {
      force: true,
      recursive: true,
    });
    restored = true;
  }

  return restored;
}

export function symlinkOrCopy(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  if (sourceStat.isDirectory()) {
    fs.symlinkSync(
      path.relative(path.dirname(targetPath), sourcePath),
      targetPath,
      process.platform === "win32" ? "junction" : "dir",
    );
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

export function assertReleaseContractTestsExist(
  tests = releaseContractTests,
  root = repoRoot,
) {
  const missing = tests.filter(
    (testPath) => !fs.existsSync(path.join(root, testPath)),
  );

  if (missing.length > 0) {
    throw new Error(
      `Release contract suite references missing test files:\n${missing
        .map((testPath) => `- ${testPath}`)
        .join("\n")}`,
    );
  }
}

export function loadTrackedLegacyElectrobunPaths(root = repoRoot) {
  const result = spawnSync(
    "git",
    ["ls-files", "--", path.relative(root, legacyElectrobunDir)],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );

  if (result.status !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export {
  aliceReleaseContractTests,
  appCoreRoot,
  canonicalElectrobunDir,
  legacyElectrobunDir,
  repoRoot,
};
