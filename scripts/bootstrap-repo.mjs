#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function runCommand(
  command,
  args,
  { cwd = DEFAULT_REPO_ROOT, env = process.env, label } = {},
) {
  const printable = label ?? `${command} ${args.join(" ")}`;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(
        new Error(
          `${printable} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${printable} exited due to signal ${signal}`));
        return;
      }

      if ((code ?? 1) !== 0) {
        reject(new Error(`${printable} exited with code ${code ?? 1}`));
        return;
      }

      resolve();
    });
  });
}

export function getBootstrapInstallArgs() {
  return ["install", "--ignore-scripts"];
}

export async function bootstrapRepo(
  repoRoot = DEFAULT_REPO_ROOT,
  {
    env = process.env,
    pathExists = existsSync,
    runCommandImpl = runCommand,
  } = {},
) {
  const repoSetupScript = path.join(
    repoRoot,
    "eliza",
    "packages",
    "app-core",
    "scripts",
    "run-repo-setup.mjs",
  );
  const relativeRepoSetupScript = path.relative(repoRoot, repoSetupScript);

  await runCommandImpl("node", ["scripts/init-submodules.mjs"], {
    cwd: repoRoot,
    env,
    label: "node scripts/init-submodules.mjs",
  });

  await runCommandImpl("bun", getBootstrapInstallArgs(), {
    cwd: repoRoot,
    env,
    label: "bun install --ignore-scripts (repo bootstrap)",
  });

  if (!pathExists(repoSetupScript)) {
    throw new Error(
      `Expected repo setup entrypoint at ${relativeRepoSetupScript}, but it was missing after bootstrap install.`,
    );
  }

  await runCommandImpl("node", [relativeRepoSetupScript], {
    cwd: repoRoot,
    env,
    label: `node ${relativeRepoSetupScript}`,
  });
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);

if (isMain) {
  bootstrapRepo().catch((error) => {
    console.error(
      `[bootstrap-repo] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
