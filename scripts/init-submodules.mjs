#!/usr/bin/env node
/**
 * Post-install script to initialize git submodules if they haven't been.
 * This ensures tracked submodules from .gitmodules are initialized when
 * cloning the repo or installing dependencies.
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/init-submodules.mjs
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getElizaosPackageSpecifier,
  isLocalElizaDisabled,
} from "./lib/eliza-package-mode.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const __dirname = dirname(scriptFile);
const root = resolve(__dirname, "..");
const skipLocalUpstreams = isLocalElizaDisabled();
const skipCloudSubmodule =
  process.env.MILADY_SKIP_CLOUD_SUBMODULE === "1" ||
  process.env.ELIZA_SKIP_CLOUD_SUBMODULE === "1";
const SUBMODULE_READINESS_MARKERS = {
  cloud: ["package.json"],
  eliza: ["package.json", "packages/typescript/package.json"],
  "plugins/plugin-agent-orchestrator": ["package.json"],
  "steward-fi": ["package.json", "packages/api/package.json"],
  "test/contracts/lib/openzeppelin-contracts": [
    "package.json",
    "contracts/package.json",
  ],
};

// plugin-openrouter contains PGlite :memory:<UUID> paths committed under
// typescript/ that Windows git rejects as invalid filenames. Skip checkout
// until elizaos-plugins/plugin-openrouter#25 is merged; the package is
// available via npm in the meantime.
//
// elizaOS/cloud and elizaOS/clone-your-crush are optional upstream repos that
// are private or moved. They are not required for the Milady/Alice runtime
// image, so deploy builds must not fail when GitHub returns 404 for them.
const SKIP_SUBMODULES = new Set([
  "plugins/plugin-openrouter",
  "cloud",
  "examples/clone-your-crush",
]);

function getSubmoduleSkipReason(
  submodulePath,
  { skipLocal = skipLocalUpstreams, skipCloud = skipCloudSubmodule } = {},
) {
  if (SKIP_SUBMODULES.has(submodulePath)) {
    return "it is in the explicit skip list";
  }
  if (skipLocal && submodulePath === "eliza") {
    return "local upstreams are disabled";
  }
  if (
    skipCloud &&
    (submodulePath === "cloud" || submodulePath === "eliza/cloud")
  ) {
    return "cloud submodule is disabled";
  }
  if (skipCloud && SKIPPED_CLOUD_COUPLED_SUBMODULE_PATHS.has(submodulePath)) {
    return "cloud-coupled plugin workspace is disabled";
  }
  return null;
}

export function shouldSkipSubmoduleInit(
  submodulePath,
  { skipLocal = skipLocalUpstreams, skipCloud = skipCloudSubmodule } = {},
) {
  return (
    getSubmoduleSkipReason(submodulePath, { skipLocal, skipCloud }) !== null
  );
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function getPackageWorkspaces(pkg) {
  if (isStringArray(pkg.workspaces)) {
    return pkg.workspaces;
  }
  if (
    pkg.workspaces &&
    typeof pkg.workspaces === "object" &&
    isStringArray(pkg.workspaces.packages)
  ) {
    return pkg.workspaces.packages;
  }
  return null;
}

function setPackageWorkspaces(pkg, workspaces) {
  if (Array.isArray(pkg.workspaces)) {
    pkg.workspaces = workspaces;
    return;
  }
  pkg.workspaces.packages = workspaces;
}

function rewriteSkippedCloudDependencies(pkg, { env = process.env } = {}) {
  let changed = false;
  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object" || Array.isArray(deps)) {
      continue;
    }
    for (const [name, version] of Object.entries(
      getSkippedCloudDependencyFallbacks(env),
    )) {
      if (deps[name] === "workspace:*") {
        deps[name] = version;
        changed = true;
      }
    }
  }
  return changed;
}

export function pruneSkippedCloudWorkspace({
  rootDir = root,
  exists = existsSync,
  readFile = readFileSync,
  writeFile = writeFileSync,
  remove = rmSync,
  log = console.log,
  skipCloud = skipCloudSubmodule,
} = {}) {
  if (!skipCloud) {
    return [];
  }

  if (exists(resolve(rootDir, "eliza/cloud/packages/sdk/package.json"))) {
    return [];
  }

  const changed = [];
  for (const entry of SKIPPED_CLOUD_WORKSPACE_ENTRIES) {
    const packageJsonPath = resolve(rootDir, entry.packageJson);
    if (!exists(packageJsonPath)) {
      continue;
    }

    const raw = readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    const workspaces = getPackageWorkspaces(pkg);
    let packageChanged = false;

    if (workspaces) {
      const nextWorkspaces = workspaces.filter(
        (workspaceEntry) => !entry.workspaces.includes(workspaceEntry),
      );
      if (nextWorkspaces.length !== workspaces.length) {
        setPackageWorkspaces(pkg, nextWorkspaces);
        packageChanged = true;
      }
    }

    if (rewriteSkippedCloudDependencies(pkg)) {
      packageChanged = true;
    }

    if (!packageChanged) {
      continue;
    }

    const indent = raw.match(/^(\s+)"/m)?.[1] ?? "  ";
    writeFile(packageJsonPath, `${JSON.stringify(pkg, null, indent)}\n`);
    changed.push(entry.packageJson);
    log(
      `[init-submodules] Applied skipped cloud workspace fallbacks to ${entry.packageJson}`,
    );
  }

  if (changed.length > 0) {
    for (const lockfile of SKIPPED_CLOUD_LOCKFILES) {
      const lockfilePath = resolve(rootDir, lockfile);
      if (!exists(lockfilePath)) {
        continue;
      }
      remove(lockfilePath, { force: true });
      log(
        `[init-submodules] Removed ${lockfile} so Bun regenerates without skipped cloud workspaces`,
      );
    }
  }

  return changed;
}

export function pruneDuplicateLegacyElizaPluginWorkspaces({
  rootDir = root,
  exists = existsSync,
  readFile = readFileSync,
  writeFile = writeFileSync,
  log = console.log,
} = {}) {
  const packageJsonPath = resolve(rootDir, "eliza", "package.json");
  if (!exists(packageJsonPath)) {
    return [];
  }

  const raw = readFile(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  const workspaces = getPackageWorkspaces(pkg);
  if (!workspaces) {
    return [];
  }

  const duplicateLegacyEntries = LEGACY_ELIZA_PLUGIN_WORKSPACE_ENTRIES.filter(
    ({ canonicalEntry, legacyEntry }) => {
      return (
        workspaces.includes(legacyEntry) &&
        exists(resolve(rootDir, "eliza", canonicalEntry, "package.json")) &&
        exists(resolve(rootDir, "eliza", legacyEntry, "package.json"))
      );
    },
  ).map(({ legacyEntry }) => legacyEntry);

  if (duplicateLegacyEntries.length === 0) {
    return [];
  }

  setPackageWorkspaces(
    pkg,
    workspaces.filter(
      (workspaceEntry) => !duplicateLegacyEntries.includes(workspaceEntry),
    ),
  );
  const indent = raw.match(/^(\s+)"/m)?.[1] ?? "  ";
  writeFile(packageJsonPath, `${JSON.stringify(pkg, null, indent)}\n`);
  log(
    `[init-submodules] Removed duplicate legacy eliza plugin workspace entries (${duplicateLegacyEntries.join(", ")})`,
  );

  return duplicateLegacyEntries;
}

export function parseTrackedSubmodules(configOutput) {
  if (!configOutput.trim()) return [];

  return configOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawKey, path] = line.split(/\s+/, 2);
      const name = rawKey.replace(/^submodule\./, "").replace(/\.path$/, "");
      return { name, path };
    });
}

export function loadTrackedSubmodules({ exec = execSync, cwd = root } = {}) {
  try {
    const output = exec(
      'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"',
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return parseTrackedSubmodules(output);
  } catch {
    return [];
  }
}

export function getSubmoduleReadinessMarkerPaths(
  submodulePath,
  { rootDir = root } = {},
) {
  const markers = SUBMODULE_READINESS_MARKERS[submodulePath] ?? [];
  return markers.map((marker) => resolve(rootDir, submodulePath, marker));
}

export function isSubmoduleCheckoutReady(
  submodulePath,
  { rootDir = root, exists = existsSync } = {},
) {
  const markerPaths = getSubmoduleReadinessMarkerPaths(submodulePath, {
    rootDir,
  });

  if (markerPaths.length === 0) {
    return true;
  }

  return markerPaths.every((markerPath) => exists(markerPath));
}

export function runInitSubmodules({
  rootDir = root,
  exists = existsSync,
  exec = execSync,
  log = console.log,
  logError = console.error,
  shouldSkipSubmodule = shouldSkipSubmoduleInit,
} = {}) {
  // Check if we're in a git repository
  const gitDir = resolve(rootDir, ".git");
  if (!exists(gitDir)) {
    log("[init-submodules] Not a git repository — skipping");
    return emptyInitSubmodulesResult();
  }

  const gitmodulesPath = resolve(rootDir, ".gitmodules");
  if (!exists(gitmodulesPath)) {
    log("[init-submodules] No .gitmodules found — skipping");
    return emptyInitSubmodulesResult();
  }

  const submodules = loadTrackedSubmodules({ exec, cwd: rootDir });
  if (submodules.length === 0) {
    log("[init-submodules] No tracked submodules found — skipping");
    return emptyInitSubmodulesResult();
  }

  let initialized = 0;
  let alreadyInitialized = 0;
  let failed = 0;

  logInitSubmodulesSummary({ ...result, log, logError });
  pruneSkippedCloudWorkspace({
    rootDir,
    exists,
    log,
  });
  pruneDuplicateLegacyElizaPluginWorkspaces({
    rootDir,
    exists,
    log,
  });

    const checkoutReady = isSubmoduleCheckoutReady(submodule.path, {
      rootDir,
      exists,
    });
    let needsInit = !checkoutReady;
    let initReason = checkoutReady ? "" : "checkout is incomplete";

    try {
      const status = exec(`git submodule status -- "${submodule.path}"`, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (status.startsWith("-")) {
        needsInit = true;
        initReason = "submodule is not initialized";
      } else if (status.startsWith("+")) {
        // Submodule HEAD differs from the commit recorded in the parent
        // index — local commits or a branch checkout exist.
        log(
          `[init-submodules] ⚠ ${submodule.name} (${submodule.path}) has commits not recorded in the parent repo`,
        );
      }
      // Warn about uncommitted changes in initialized submodules.
      if (!status.startsWith("-")) {
        try {
          const smRoot = resolve(rootDir, submodule.path);
          const dirty = exec("git status --porcelain", {
            cwd: smRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim();
          if (dirty) {
            log(
              `[init-submodules] ⚠ ${submodule.name} (${submodule.path}) has uncommitted local changes`,
            );
          }
        } catch {
          // Cannot check — not critical, just skip the warning.
        }
      }
    } catch {
      // If status lookup fails, attempt initialization directly.
      needsInit = true;
      if (!initReason) {
        initReason = "status check failed";
      }
    }

    if (!needsInit) {
      alreadyInitialized++;
      continue;
    }

    log(
      `[init-submodules] Initializing ${submodule.name} (${submodule.path})${
        initReason ? ` because ${initReason}` : ""
      }...`,
    );
    try {
      exec(`git submodule update --init --recursive "${submodule.path}"`, {
        cwd: rootDir,
        stdio: "inherit",
      });
      if (
        !isSubmoduleCheckoutReady(submodule.path, {
          rootDir,
          exists,
        })
      ) {
        throw new Error(
          `submodule checkout is still incomplete after update: ${submodule.path}`,
        );
      }
      initialized++;
      log(`[init-submodules] ${submodule.name} initialized successfully`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      logError(
        `[init-submodules] Failed to initialize ${submodule.name} (${submodule.path}): ${message}`,
      );
    }
  }

  if (failed > 0) {
    logError(
      `[init-submodules] Initialized ${initialized}, already ready ${alreadyInitialized}, failed ${failed}.`,
    );
  } else if (initialized === 0) {
    log("[init-submodules] All submodules already initialized");
  } else {
    log(
      `[init-submodules] Initialized ${initialized} submodule(s); ${alreadyInitialized} already ready.`,
    );
  }

  return { initialized, alreadyInitialized, failed, submodules };
}

const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(scriptFile);

if (isDirectRun) {
  const result = runInitSubmodules();
  if (process.env.CI === "true" && result.failed > 0) {
    process.exit(1);
  }
}
