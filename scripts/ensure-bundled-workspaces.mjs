#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

function pluginEntry(name, { cwd, artifact, args = ["run", "build"] } = {}) {
  const base = cwd ?? path.join("plugins", name, "typescript");
  return {
    label: `@elizaos/${name}`,
    cwd: base,
    manifest: path.join(base, "package.json"),
    artifact: path.join(base, artifact ?? path.join("dist", "index.d.ts")),
    args,
  };
}

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
  // Workspace plugin submodules that need dist/ built for TypeScript resolution.
  // These are all workspace:* dependencies in packages/agent and packages/app-core.
  // When MILADY_SKIP_LOCAL_UPSTREAMS=1 (CI), setup-upstreams skips building these,
  // so we build them here instead.
  pluginEntry("plugin-agent-skills", {
    cwd: path.join("plugins", "plugin-agent-skills", "typescript"),
    artifact: path.join("dist", "index.js"),
  }),
  pluginEntry("plugin-anthropic"),
  pluginEntry("plugin-cron"),
  pluginEntry("plugin-edge-tts"),
  pluginEntry("plugin-experience"),
  pluginEntry("plugin-local-embedding"),
  pluginEntry("plugin-ollama"),
  pluginEntry("plugin-openai"),
  pluginEntry("plugin-personality"),
  pluginEntry("plugin-plugin-manager"),
  pluginEntry("plugin-shell"),
  pluginEntry("plugin-sql"),
  pluginEntry("plugin-trust"),
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

/**
 * Check if the source (package.json as proxy for "last submodule update")
 * is newer than the built artifact. This catches the case where the
 * submodule was updated with new source but the stale dist from a prior
 * version still exists on disk.
 */
function isArtifactStale(
  manifestPath,
  artifactPath,
  { pathExists = existsSync, stat = statSync } = {},
) {
  if (!pathExists(artifactPath)) return true;
  try {
    const srcMtime = stat(manifestPath).mtimeMs;
    const artMtime = stat(artifactPath).mtimeMs;
    return srcMtime > artMtime;
  } catch {
    // If stat fails, rebuild to be safe
    return true;
  }
}

export async function ensureBundledWorkspaceBuilds(
  repoRoot = DEFAULT_REPO_ROOT,
  {
    commandRunner = runCommand,
    pathExists = existsSync,
    stat = statSync,
    log = console.log,
  } = {},
) {
  for (const workspace of BUNDLED_WORKSPACE_BUILDS) {
    const manifestPath = path.join(repoRoot, workspace.manifest);
    const artifactPath = path.join(repoRoot, workspace.artifact);

    if (!pathExists(manifestPath)) {
      continue;
    }

    const stale = isArtifactStale(manifestPath, artifactPath, {
      pathExists,
      stat,
    });
    if (!stale) {
      continue;
    }

    const reason = !pathExists(artifactPath)
      ? `${workspace.artifact} is missing`
      : `${workspace.artifact} is older than ${workspace.manifest}`;
    log(
      `[ensure-bundled-workspaces] Building ${workspace.label} because ${reason}`,
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
