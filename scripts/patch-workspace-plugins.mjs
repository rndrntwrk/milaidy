#!/usr/bin/env node
/**
 * Apply compatibility patches to workspace plugin submodules.
 *
 * These patches fix type errors introduced by @elizaos/core API changes that
 * haven't been merged upstream yet. Each patch is stored under
 * scripts/workspace-plugin-patches/ and applied idempotently via
 * `git apply --check` / `git apply`.
 *
 * Patches are skipped gracefully when:
 * - The submodule directory does not exist (not initialised yet)
 * - The patch has already been applied (git apply --check fails with "already applied")
 * - The upstream repo has fixed the issue (patch doesn't apply to current code)
 *
 * Remove a patch file once the corresponding elizaos-plugins PR is merged and
 * the milady submodule pointer is bumped past it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
const patchDir = resolve(__dirname, "workspace-plugin-patches");

/**
 * Mapping from patch filename prefix → plugin submodule path (relative to repo root).
 * Convention: patch file is named `<plugin-name>-<description>.patch`.
 */
export const PLUGIN_PATCH_DIRS = {
  "plugin-anthropic": "plugins/plugin-anthropic",
  "plugin-google-genai": "plugins/plugin-google-genai",
  "plugin-personality": "plugins/plugin-personality",
  "plugin-plugin-manager": "plugins/plugin-plugin-manager",
  "plugin-agent-skills": "plugins/plugin-agent-skills",
  "plugin-sql": "eliza",
};

export function resolvePluginDir(patchFile, { rootDir = root } = {}) {
  for (const [prefix, submodulePath] of Object.entries(PLUGIN_PATCH_DIRS)) {
    if (patchFile.startsWith(`${prefix}-`)) {
      return resolve(rootDir, submodulePath);
    }
  }
  return null;
}

function exec(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function commandMessage(error) {
  return String(error.stderr || error.stdout || error.message || error);
}

function isBrokenGitMetadata(error) {
  const msg = commandMessage(error);
  return (
    msg.includes("not a git repository") ||
    msg.includes(".git/modules") ||
    msg.includes("Invalid gitfile format")
  );
}

function gitApply(args, cwd, { allowNoIndexFallback = false } = {}) {
  try {
    return exec("git", ["apply", ...args], cwd);
  } catch (error) {
    if (!allowNoIndexFallback || !isBrokenGitMetadata(error)) {
      throw error;
    }
    return exec("git", ["apply", "--no-index", ...args], cwd);
  }
}

function replaceOnce(source, before, after, patchName) {
  if (!source.includes(before)) {
    throw new Error(`${patchName}: expected source segment was not found`);
  }
  return source.replace(before, after);
}

export function applyPluginSqlPgliteContainerPidPatch(pluginDir) {
  const patchName = "plugin-sql-pglite-container-pid-reuse.patch";
  const managerPath = resolve(
    pluginDir,
    "plugins/plugin-sql/typescript/pglite/manager.ts",
  );

  if (!existsSync(managerPath)) {
    return null;
  }

  let source = readFileSync(managerPath, "utf8");
  if (
    source.includes("interface PgliteLockState") &&
    source.includes("private isLockFromPreviousProcess") &&
    source.includes("private isPidFileFromPreviousProcess")
  ) {
    return "already-applied";
  }

  source = replaceOnce(
    source,
    `  openSync,
  readFileSync,
  unlinkSync,
`,
    `  openSync,
  readFileSync,
  statSync,
  unlinkSync,
`,
    patchName,
  );

  source = replaceOnce(
    source,
    `type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

export class PGliteClientManager implements IDatabaseClientManager<PGlite> {
`,
    `type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

interface PgliteLockState {
  pid: number | null;
  createdAtMs: number | null;
}

export class PGliteClientManager implements IDatabaseClientManager<PGlite> {
`,
    patchName,
  );

  source = replaceOnce(
    source,
    `  private getLockPid(lockPath: string): number | null {
    try {
      const raw = readFileSync(lockPath, "utf-8");
      const parsed = JSON.parse(raw) as { pid?: unknown };
      return typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : null;
    } catch {
      return null;
    }
  }
`,
    `  private getLockState(lockPath: string): PgliteLockState {
    try {
      const raw = readFileSync(lockPath, "utf-8");
      const parsed = JSON.parse(raw) as { pid?: unknown; createdAt?: unknown };
      const pid =
        typeof parsed.pid === "number" && parsed.pid > 0 ? parsed.pid : null;
      const createdAtMs =
        typeof parsed.createdAt === "string"
          ? Date.parse(parsed.createdAt)
          : NaN;
      return {
        pid,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : null,
      };
    } catch {
      return { pid: null, createdAtMs: null };
    }
  }
`,
    patchName,
  );

  source = replaceOnce(
    source,
    `  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }

  private acquireDataDirLockIfNeeded(): void {
`,
    `  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code !== "ESRCH";
    }
  }

  private isLockFromPreviousProcess(lockState: PgliteLockState): boolean {
    if (lockState.pid !== process.pid || !lockState.createdAtMs) {
      return false;
    }

    const currentProcessStartedAtMs = Date.now() - process.uptime() * 1000;
    return lockState.createdAtMs + 1000 < currentProcessStartedAtMs;
  }

  private isPidFileFromPreviousProcess(pidPath: string, pid: number): boolean {
    if (pid !== process.pid) {
      return false;
    }

    const currentProcessStartedAtMs = Date.now() - process.uptime() * 1000;
    return statSync(pidPath).mtimeMs + 1000 < currentProcessStartedAtMs;
  }

  private acquireDataDirLockIfNeeded(): void {
`,
    patchName,
  );

  source = replaceOnce(
    source,
    `        const pid = this.getLockPid(lockPath);
        if (pid && this.isPidRunning(pid)) {
          throw this.createActiveLockError(
            dataDir,
            new Error(\`PGlite lock file is held by running process \${pid}\`)
          );
        }

        try {
          unlinkSync(lockPath);
          logger.info(
            { src: "plugin:sql", dataDir, lockPath, pid },
            "Removed stale PGlite lock file"
          );
        } catch (unlinkErr) {
          throw this.createActiveLockError(dataDir, unlinkErr);
        }
`,
    `        const lockState = this.getLockState(lockPath);
        if (this.isLockFromPreviousProcess(lockState)) {
          try {
            unlinkSync(lockPath);
            logger.info(
              { src: "plugin:sql", dataDir, lockPath, pid: lockState.pid },
              "Removed stale PGlite lock file from prior container process"
            );
            continue;
          } catch (unlinkErr) {
            throw this.createActiveLockError(dataDir, unlinkErr);
          }
        }

        const pid = lockState.pid;
        if (pid && pid !== process.pid && this.isPidRunning(pid)) {
          throw this.createActiveLockError(
            dataDir,
            new Error(\`PGlite lock file is held by running process \${pid}\`)
          );
        }

        try {
          unlinkSync(lockPath);
          logger.info(
            { src: "plugin:sql", dataDir, lockPath, pid },
            "Removed stale PGlite lock file"
          );
        } catch (unlinkErr) {
          throw this.createActiveLockError(dataDir, unlinkErr);
        }
`,
    patchName,
  );

  source = replaceOnce(
    source,
    `      try {
        process.kill(pid, 0);
        logger.warn(
`,
    `      if (this.isPidFileFromPreviousProcess(pidPath, pid)) {
        unlinkSync(pidPath);
        logger.info(
          { src: "plugin:sql", dataDir, pid },
          "Removed stale PGlite postmaster.pid from prior container process"
        );
        return "cleared-stale";
      }

      try {
        process.kill(pid, 0);
        logger.warn(
`,
    patchName,
  );

  writeFileSync(managerPath, source);
  return "applied";
}

function applyDirectPatchForBrokenGitMetadata(patchName, pluginDir, error) {
  if (
    patchName !== "plugin-sql-pglite-container-pid-reuse.patch" ||
    !isBrokenGitMetadata(error)
  ) {
    return null;
  }

  return applyPluginSqlPgliteContainerPidPatch(pluginDir);
}

function applyPatch(patchPath, pluginDir) {
  const patchName = patchPath.split(/[\\/]/).pop();

  if (!existsSync(pluginDir)) {
    console.log(
      `[patch-workspace-plugins] Skipping ${patchName}: submodule not initialised`,
    );
    return "skipped";
  }

  // Check if patch is already applied
  try {
    gitApply(["--check", "--reverse", patchPath], pluginDir, {
      allowNoIndexFallback: true,
    });
    console.log(
      `[patch-workspace-plugins] ${patchName}: already applied, skipping`,
    );
    return "already-applied";
  } catch {
    // Not yet applied — proceed
  }

  // Check if patch applies cleanly
  try {
    gitApply(["--check", patchPath], pluginDir, {
      allowNoIndexFallback: true,
    });
  } catch (checkErr) {
    const directResult = applyDirectPatchForBrokenGitMetadata(
      patchName,
      pluginDir,
      checkErr,
    );
    if (directResult === "applied") {
      console.log(
        `[patch-workspace-plugins] ${patchName}: applied successfully without git metadata`,
      );
      return "applied";
    }
    if (directResult === "already-applied") {
      console.log(
        `[patch-workspace-plugins] ${patchName}: already applied, skipping`,
      );
      return "already-applied";
    }

    const msg = commandMessage(checkErr);
    console.warn(
      `[patch-workspace-plugins] ${patchName}: does not apply cleanly (upstream may have fixed it): ${msg.trim().slice(0, 200)}`,
    );
    return "inapplicable";
  }

  // Apply the patch
  try {
    gitApply([patchPath], pluginDir, { allowNoIndexFallback: true });
    console.log(`[patch-workspace-plugins] ${patchName}: applied successfully`);
    return "applied";
  } catch (applyErr) {
    const msg = commandMessage(applyErr);
    console.error(
      `[patch-workspace-plugins] ERROR: failed to apply ${patchName}: ${msg.trim().slice(0, 400)}`,
    );
    return "failed";
  }
}

function run() {
  if (!existsSync(patchDir)) {
    console.log(
      "[patch-workspace-plugins] No patches directory found, skipping",
    );
    return;
  }

  let patches;
  try {
    patches = readdirSync(patchDir)
      .filter((f) => f.endsWith(".patch"))
      .sort();
  } catch {
    patches = [];
  }

  if (patches.length === 0) {
    console.log("[patch-workspace-plugins] No patch files found, skipping");
    return;
  }

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const patchFile of patches) {
    const pluginDir = resolvePluginDir(patchFile);
    if (!pluginDir) {
      console.warn(
        `[patch-workspace-plugins] Cannot resolve plugin dir for ${patchFile}, skipping`,
      );
      skipped++;
      continue;
    }

    const patchPath = resolve(patchDir, patchFile);
    const result = applyPatch(patchPath, pluginDir);
    if (result === "applied") applied++;
    else if (result === "failed") failed++;
    else skipped++;
  }

  if (failed > 0) {
    console.error(
      `[patch-workspace-plugins] ${applied} applied, ${skipped} skipped, ${failed} FAILED`,
    );
    process.exit(1);
  } else {
    console.log(
      `[patch-workspace-plugins] ${applied} applied, ${skipped} skipped`,
    );
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);

if (isMain) {
  run();
}
