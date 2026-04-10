#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

export const BUNDLED_WORKSPACE_BUILDS = [
  {
    label: "@elizaos/plugin-agent-orchestrator",
    cwd: path.join("plugins", "plugin-agent-orchestrator"),
    manifest: path.join("plugins", "plugin-agent-orchestrator", "package.json"),
    artifact: path.join(
      "plugins",
      "plugin-agent-orchestrator",
      "dist",
      "index.js",
    ),
    args: ["run", "build"],
  },
  {
    label: "@elizaos/plugin-agent-skills",
    cwd: path.join("plugins", "plugin-agent-skills", "typescript"),
    manifest: path.join(
      "plugins",
      "plugin-agent-skills",
      "typescript",
      "package.json",
    ),
    artifact: path.join(
      "plugins",
      "plugin-agent-skills",
      "typescript",
      "dist",
      "index.js",
    ),
    args: ["run", "build"],
  },
];

function runCommand(command, args, { cwd, env = process.env, label } = {}) {
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
          `${printable} failed: ${error instanceof Error ? error.message : String(error)}`,
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

export async function ensureBundledWorkspaceBuilds(
  repoRoot = DEFAULT_REPO_ROOT,
  {
    commandRunner = runCommand,
    pathExists = existsSync,
    log = console.log,
  } = {},
) {
  for (const workspace of BUNDLED_WORKSPACE_BUILDS) {
    const manifestPath = path.join(repoRoot, workspace.manifest);
    const artifactPath = path.join(repoRoot, workspace.artifact);

    if (!pathExists(manifestPath) || pathExists(artifactPath)) {
      continue;
    }

    log(
      `[ensure-bundled-workspaces] Building ${workspace.label} because ${workspace.artifact} is missing in this checkout`,
    );
    await commandRunner("bun", workspace.args, {
      cwd: path.join(repoRoot, workspace.cwd),
      label: `bun ${workspace.args.join(" ")} (${workspace.label})`,
    });
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  ensureBundledWorkspaceBuilds().catch((error) => {
    console.error(
      `[ensure-bundled-workspaces] Failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
