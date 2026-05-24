#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const SHARED_KEYWORD_GENERATOR_RELATIVE_PATH = path.join(
  "eliza",
  "packages",
  "shared",
  "scripts",
  "generate-keywords.mjs",
);
const SHARED_WORKSPACE_RELATIVE_PATH = path.join(
  "eliza",
  "packages",
  "shared",
);
const ROOT_SIGNAL_PACKAGE_LINK_RELATIVE_PATH = path.join(
  "node_modules",
  "@elizaos",
  "plugin-signal",
);
const ALICE_SIGNAL_WORKSPACE_RELATIVE_PATH = path.join(
  "eliza",
  "plugins",
  "plugin-signal",
);
const ALICE_SIGNAL_WORKSPACE_LINK_TARGET = path.join(
  "..",
  "..",
  "eliza",
  "plugins",
  "plugin-signal",
);

export const BUNDLED_WORKSPACE_BUILDS = [
  {
    label: "@elizaos/core",
    cwd: path.join("eliza", "packages", "core"),
    manifest: path.join("eliza", "packages", "core", "package.json"),
    artifact: path.join(
      "eliza",
      "packages",
      "core",
      "dist",
      "node",
      "index.node.js",
    ),
    args: ["run", "build", "--node-only", "--skip-testing"],
  },
  {
    label: "@elizaos/plugin-agent-orchestrator",
    cwd: path.join("eliza", "plugins", "plugin-agent-orchestrator"),
    manifest: path.join(
      "eliza",
      "plugins",
      "plugin-agent-orchestrator",
      "package.json",
    ),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-agent-orchestrator",
      "dist",
      "node",
      "index.node.js",
    ),
    args: [
      "build",
      "./index.node.ts",
      "--outdir",
      "./dist/node",
      "--target",
      "node",
      "--format",
      "esm",
      "--sourcemap=linked",
      "--external",
      "node:*",
      "--external",
      "@elizaos/core",
      "--external",
      "@elizaos/app-task-coordinator",
      "--external",
      "coding-agent-adapters",
      "--external",
      "drizzle-orm",
      "--external",
      "pty-console",
      "--external",
      "pty-state-capture",
      "--external",
      "pty-manager",
      "--external",
      "git-workspace-service",
    ],
  },
  {
    label: "@elizaos/plugin-agent-skills",
    cwd: path.join("eliza", "plugins", "plugin-agent-skills"),
    manifest: path.join(
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "package.json",
    ),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-agent-skills",
      "dist",
      "index.js",
    ),
    args: [
      "build",
      "./src/index.ts",
      "--outdir",
      "./dist",
      "--target",
      "node",
      "--format",
      "esm",
      "--sourcemap=linked",
      "--external",
      "node:*",
      "--external",
      "@elizaos/core",
      "--external",
      "fflate",
    ],
  },
  {
    label: "@elizaos/plugin-form",
    cwd: path.join("eliza", "plugins", "plugin-form"),
    manifest: path.join("eliza", "plugins", "plugin-form", "package.json"),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-form",
      "dist",
      "index.js",
    ),
    args: [
      "build",
      "./src/index.ts",
      "--outdir",
      "./dist",
      "--target",
      "node",
      "--format",
      "esm",
      "--sourcemap=linked",
      "--external",
      "node:*",
      "--external",
      "@elizaos/core",
    ],
  },
  {
    label: "@elizaos/plugin-local-embedding",
    cwd: path.join("eliza", "plugins", "plugin-local-embedding"),
    manifest: path.join(
      "eliza",
      "plugins",
      "plugin-local-embedding",
      "package.json",
    ),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-local-embedding",
      "dist",
      "index.js",
    ),
    args: [
      "build",
      "./src/index.ts",
      "--outdir",
      "./dist",
      "--target",
      "node",
      "--format",
      "esm",
      "--sourcemap=linked",
      "--external",
      "node:*",
      "--external",
      "@elizaos/core",
      "--external",
      "zod",
      "--external",
      "node-llama-cpp",
      "--external",
      "onnxruntime-node",
      "--external",
      "@huggingface/transformers",
    ],
  },
  {
    label: "@elizaos/plugin-shell",
    cwd: path.join("eliza", "plugins", "plugin-shell"),
    manifest: path.join("eliza", "plugins", "plugin-shell", "package.json"),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-shell",
      "dist",
      "index.js",
    ),
    args: [
      "build",
      "./index.ts",
      "--outdir",
      "./dist",
      "--target",
      "node",
      "--format",
      "esm",
      "--sourcemap=linked",
      "--external",
      "node:*",
      "--external",
      "@elizaos/core",
      "--external",
      "cross-spawn",
      "--external",
      "zod",
    ],
  },
  {
    label: "@elizaos/plugin-signal",
    cwd: path.join("eliza", "plugins", "plugin-signal"),
    manifest: path.join("eliza", "plugins", "plugin-signal", "package.json"),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-signal",
      "dist",
      "index.js",
    ),
    args: [
      "build",
      "./src/index.ts",
      "--outdir",
      "./dist",
      "--target",
      "node",
      "--format",
      "esm",
      "--sourcemap=linked",
      "--external",
      "node:*",
      "--external",
      "@elizaos/core",
      "--external",
      "@elizaos/signal-native",
      "--external",
      "qrcode",
      "--external",
      "zod",
    ],
  },
  {
    label: "@elizaos/plugin-sql",
    cwd: path.join("eliza", "plugins", "plugin-sql"),
    manifest: path.join("eliza", "plugins", "plugin-sql", "package.json"),
    artifact: path.join(
      "eliza",
      "plugins",
      "plugin-sql",
      "src",
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

async function ensureSharedKeywordData(
  repoRoot,
  {
    commandRunner = runCommand,
    pathExists = existsSync,
    log = console.log,
  } = {},
) {
  const generatorPath = path.join(repoRoot, SHARED_KEYWORD_GENERATOR_RELATIVE_PATH);
  if (!pathExists(generatorPath)) {
    return;
  }

  log("[ensure-bundled-workspaces] Generating shared keyword data");
  await commandRunner("node", ["scripts/generate-keywords.mjs"], {
    cwd: path.join(repoRoot, SHARED_WORKSPACE_RELATIVE_PATH),
    label:
      "node scripts/generate-keywords.mjs (@elizaos/shared keyword data)",
  });
}

function ensureAliceSignalWorkspaceLink(
  repoRoot,
  {
    pathExists = existsSync,
    lstat = lstatSync,
    readlink = readlinkSync,
    mkdir = mkdirSync,
    rm = rmSync,
    symlink = symlinkSync,
    log = console.log,
  } = {},
) {
  const aliceSignalManifest = path.join(
    repoRoot,
    ALICE_SIGNAL_WORKSPACE_RELATIVE_PATH,
    "package.json",
  );
  if (!pathExists(aliceSignalManifest)) {
    return;
  }

  const linkPath = path.join(repoRoot, ROOT_SIGNAL_PACKAGE_LINK_RELATIVE_PATH);
  const linkParent = path.dirname(linkPath);
  mkdir(linkParent, { recursive: true });

  if (pathExists(linkPath)) {
    try {
      const linkState = lstat(linkPath);
      if (
        linkState.isSymbolicLink() &&
        readlink(linkPath) === ALICE_SIGNAL_WORKSPACE_LINK_TARGET
      ) {
        return;
      }
    } catch {
      // Replace unreadable generated node_modules entries below.
    }

    rm(linkPath, { recursive: true, force: true });
  }

  symlink(ALICE_SIGNAL_WORKSPACE_LINK_TARGET, linkPath, "dir");
  log(
    `[ensure-bundled-workspaces] Linked @elizaos/plugin-signal to ${ALICE_SIGNAL_WORKSPACE_RELATIVE_PATH}`,
  );
}

function ensureAliceSignalRuntimeManifest(
  repoRoot,
  {
    pathExists = existsSync,
    readFile = readFileSync,
    writeFile = writeFileSync,
    log = console.log,
  } = {},
) {
  const manifestPath = path.join(
    repoRoot,
    ALICE_SIGNAL_WORKSPACE_RELATIVE_PATH,
    "package.json",
  );
  const runtimeEntry = "./dist/index.js";
  const sourceEntry = "./src/index.ts";

  if (
    !pathExists(manifestPath) ||
    !pathExists(
      path.join(repoRoot, ALICE_SIGNAL_WORKSPACE_RELATIVE_PATH, "dist", "index.js"),
    )
  ) {
    return;
  }

  const manifest = JSON.parse(readFile(manifestPath, "utf8"));
  const currentRootExport =
    manifest.exports &&
    typeof manifest.exports === "object" &&
    !Array.isArray(manifest.exports) &&
    manifest.exports["."] &&
    typeof manifest.exports["."] === "object"
      ? manifest.exports["."]
      : {};

  const nextManifest = {
    ...manifest,
    main: runtimeEntry,
    module: runtimeEntry,
    exports: {
      ...(manifest.exports &&
      typeof manifest.exports === "object" &&
      !Array.isArray(manifest.exports)
        ? manifest.exports
        : {}),
      ".": {
        ...currentRootExport,
        types: currentRootExport.types ?? sourceEntry,
        bun: currentRootExport.bun ?? sourceEntry,
        import: runtimeEntry,
        default: runtimeEntry,
      },
    },
  };

  const current = JSON.stringify(manifest, null, 2) + "\n";
  const next = JSON.stringify(nextManifest, null, 2) + "\n";
  if (next !== current) {
    writeFile(manifestPath, next, "utf8");
    log(
      "[ensure-bundled-workspaces] Pointed @elizaos/plugin-signal Node exports at dist/index.js",
    );
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
  await ensureSharedKeywordData(repoRoot, {
    commandRunner,
    pathExists,
    log,
  });

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

  ensureAliceSignalRuntimeManifest(repoRoot, {
    pathExists,
    log,
  });

  ensureAliceSignalWorkspaceLink(repoRoot, {
    pathExists,
    log,
  });
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
