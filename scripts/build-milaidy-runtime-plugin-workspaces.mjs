#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

const rootArgument = process.argv[2];

if (!rootArgument) {
  console.error("usage: node scripts/build-milaidy-runtime-plugin-workspaces.mjs <repo-root>");
  process.exit(1);
}
const root = resolve(rootArgument);

const RUNTIME_PLUGIN_PACKAGES = [
  // Keep shared app code ahead of the packages that consume it. A clean
  // assembly cannot rely on filesystem traversal order for workspace builds.
  "@elizaos/shared",
  "@elizaos/skills",
  "@elizaos/vault",
  "@elizaos/agent",
  "@elizaos/plugin-browser",
  "@elizaos/plugin-discord",
  "@elizaos/plugin-elizacloud",
  "@elizaos/app-task-coordinator",
  "@elizaos/app-lifeops",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-anthropic",
  "@elizaos/plugin-app-control",
  "@elizaos/plugin-commands",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-edge-tts",
  "@elizaos/plugin-experience",
  "@elizaos/plugin-form",
  "@elizaos/plugin-google",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-ollama",
  "@elizaos/plugin-openai",
  "@elizaos/plugin-pdf",
  "@elizaos/plugin-personality",
  "@elizaos/plugin-plugin-manager",
  "@elizaos/plugin-secrets-manager",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-sql",
  "@elizaos/plugin-trust",
  "@elizaos/plugin-video",
];
const RUNTIME_PLUGIN_PACKAGE_NAMES = new Set(RUNTIME_PLUGIN_PACKAGES);
const RUNTIME_PLUGIN_PACKAGE_PRIORITY = new Map(
  RUNTIME_PLUGIN_PACKAGES.map((packageName, index) => [packageName, index]),
);

const SEARCH_ROOTS = [join(root, "plugins"), join(root, "eliza", "plugins")];
const CORE_PACKAGE_DIR = join(root, "eliza", "packages", "core");
const AGENT_PACKAGE_DIR = join(root, "eliza", "packages", "agent");
const UPSTREAM_RUNTIME_PACKAGE_DIRS = [
  join(root, "eliza", "packages", "shared"),
  join(root, "eliza", "packages", "skills"),
  join(root, "eliza", "packages", "vault"),
];
const ROOT_NODE_MODULES = join(root, "node_modules");
const bunBin = process.env.ALICE_BUN_BIN || "bun";
const SKIP_DIRS = new Set([".git", "dist", "node_modules"]);
const REQUIRED_RUNTIME_OUTPUTS = new Map([
  ["@elizaos/shared", ["dist/index.js"]],
  ["@elizaos/skills", ["dist/index.js"]],
  ["@elizaos/vault", ["dist/index.js"]],
  ["@elizaos/plugin-browser", ["dist/index.js"]],
  ["@elizaos/plugin-discord", ["dist/index.js"]],
  ["@elizaos/plugin-elizacloud", ["dist/node/lifeops-cloud.mjs"]],
  [
    "@elizaos/agent",
    [
      "dist/node/lifeops-runtime.mjs",
      "dist/api/connector-account-routes.js",
      "dist/diagnostics/integration-observability.js",
    ],
  ],
  [
    "@elizaos/app-lifeops",
    ["dist/index.js", "dist/plugin.js", "dist/public.js", "dist/routes/plugin.js"],
  ],
]);
const ALWAYS_BUILD_PACKAGES = new Set(["@elizaos/app-lifeops"]);

function readPackageJson(packageDir) {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid package.json at ${packageJsonPath}: ${message}`);
  }
}

function collectExportPaths(value, paths = new Set()) {
  if (!value) {
    return paths;
  }
  if (typeof value === "string") {
    paths.add(value);
    return paths;
  }
  if (typeof value !== "object") {
    return paths;
  }
  for (const child of Object.values(value)) {
    collectExportPaths(child, paths);
  }
  return paths;
}

function normalizeExportPath(value) {
  return value.replace(/^\.\//, "");
}

function runtimeEntryCandidates(packageJson) {
  const candidates = new Set();
  if (typeof packageJson.main === "string") {
    candidates.add(packageJson.main);
  }

  const rootExport =
    packageJson.exports && typeof packageJson.exports === "object" && "." in packageJson.exports
      ? packageJson.exports["."]
      : packageJson.exports;
  const runtimeExport =
    rootExport && typeof rootExport === "object"
      ? { node: rootExport.node, default: rootExport.default }
      : rootExport;
  for (const exportPath of collectExportPaths(runtimeExport)) {
    candidates.add(exportPath);
  }

  candidates.add("dist/node/index.node.js");
  candidates.add("dist/index.js");
  candidates.add("typescript/dist/index.js");

  return Array.from(candidates).map(normalizeExportPath).filter((candidate) => candidate.endsWith(".js"));
}

function hasRuntimeEntry(packageDir, packageJson) {
  return runtimeEntryCandidates(packageJson).some((candidate) => existsSync(join(packageDir, candidate)));
}

function missingRequiredRuntimeOutputs(packageDir, packageJson) {
  const requiredOutputs = REQUIRED_RUNTIME_OUTPUTS.get(packageJson.name);
  if (!requiredOutputs) {
    return hasRuntimeEntry(packageDir, packageJson) ? [] : ["a server JavaScript entry"];
  }
  return requiredOutputs.filter((outputPath) => !existsSync(join(packageDir, outputPath)));
}

function linkHoistedToolchain(packageDir) {
  const packageNodeModules = join(packageDir, "node_modules");
  if (!existsSync(ROOT_NODE_MODULES) || existsSync(packageNodeModules)) {
    return;
  }
  symlinkSync(
    ROOT_NODE_MODULES,
    packageNodeModules,
    process.platform === "win32" ? "junction" : "dir",
  );
}

function normalizeElizaAgentDist(packageDir) {
  const compiledSourceDir = join(packageDir, "dist", "packages", "agent", "src");
  const distDir = join(packageDir, "dist");
  if (!existsSync(compiledSourceDir)) {
    throw new Error(
      `Eliza agent TypeScript build did not produce ${relative(root, compiledSourceDir)}`,
    );
  }
  mkdirSync(distDir, { recursive: true });
  for (const entry of readdirSync(compiledSourceDir, { withFileTypes: true })) {
    cpSync(join(compiledSourceDir, entry.name), join(distDir, entry.name), {
      recursive: true,
      force: true,
    });
  }
}

function buildElizaAgentLifeOpsBundle(packageDir) {
  const args = [
    "x",
    "tsdown",
    join(packageDir, "src", "lifeops-runtime.ts"),
    "--config",
    join(root, "scripts", "alice-eliza-agent-tsdown.config.mjs"),
    "--format",
    "esm",
    "--platform",
    "node",
    "--target",
    "node22",
    "--out-dir",
    join(packageDir, "dist", "node"),
  ];
  return spawnSync(bunBin, args, {
    cwd: packageDir,
    env: { ...process.env, SKIP_PYTHON_BUILD: "1" },
    stdio: "inherit",
  });
}

function buildElizaCloudLifeOpsBundle(packageDir) {
  return spawnSync(
    bunBin,
    [
      "x",
      "tsdown",
      join(packageDir, "src", "lifeops-cloud.ts"),
      "--config",
      join(root, "scripts", "alice-eliza-agent-tsdown.config.mjs"),
      "--format",
      "esm",
      "--platform",
      "node",
      "--target",
      "node22",
      "--out-dir",
      join(packageDir, "dist", "node"),
      "--no-clean",
    ],
    {
      cwd: packageDir,
      env: { ...process.env, SKIP_PYTHON_BUILD: "1" },
      stdio: "inherit",
    },
  );
}

function walk(dir, depth = 0) {
  const packageDirs = [];
  const packageJson = readPackageJson(dir);
  if (packageJson?.name && RUNTIME_PLUGIN_PACKAGE_NAMES.has(packageJson.name)) {
    packageDirs.push([dir, packageJson]);
  }

  if (depth >= 3 || !existsSync(dir)) {
    return packageDirs;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
      continue;
    }
    packageDirs.push(...walk(join(dir, entry.name), depth + 1));
  }

  return packageDirs;
}

let buildCount = 0;
const searchRoots = SEARCH_ROOTS.filter((searchRoot) => existsSync(searchRoot));
const corePackageJson = readPackageJson(CORE_PACKAGE_DIR);
const agentPackageJson = readPackageJson(AGENT_PACKAGE_DIR);
const upstreamRuntimePackages = UPSTREAM_RUNTIME_PACKAGE_DIRS.flatMap(
  (packageDir) => {
    const packageJson = readPackageJson(packageDir);
    return packageJson?.name && RUNTIME_PLUGIN_PACKAGE_NAMES.has(packageJson.name)
      ? [[packageDir, packageJson]]
      : [];
  },
);
const runtimePackages = [
  ...(corePackageJson?.name === "@elizaos/core"
    ? [[CORE_PACKAGE_DIR, corePackageJson]]
    : []),
  ...(agentPackageJson?.name === "@elizaos/agent"
    ? [[AGENT_PACKAGE_DIR, agentPackageJson]]
    : []),
  ...upstreamRuntimePackages,
  ...searchRoots.flatMap((searchRoot) => walk(searchRoot)),
].sort(([, packageA], [, packageB]) => {
  if (packageA.name === "@elizaos/core") return -1;
  if (packageB.name === "@elizaos/core") return 1;
  return (
    (RUNTIME_PLUGIN_PACKAGE_PRIORITY.get(packageA.name) ?? Number.MAX_SAFE_INTEGER) -
    (RUNTIME_PLUGIN_PACKAGE_PRIORITY.get(packageB.name) ?? Number.MAX_SAFE_INTEGER)
  );
});
if (runtimePackages.length === 0) {
  console.log("no runtime plugin source directories found; skipping runtime plugin builds");
  process.exit(0);
}
for (const [packageDir, packageJson] of runtimePackages) {
  if (
    !ALWAYS_BUILD_PACKAGES.has(packageJson.name) &&
    missingRequiredRuntimeOutputs(packageDir, packageJson).length === 0
  ) {
    continue;
  }
  if (!packageJson.scripts || typeof packageJson.scripts.build !== "string") {
    console.error(`runtime plugin ${packageJson.name} has no build script; missing runtime entry remains`);
    process.exit(1);
  }

  const label = `${packageJson.name} (${relative(root, packageDir)})`;
  console.log(`building runtime plugin ${label}`);
  linkHoistedToolchain(packageDir);
  const result = spawnSync(bunBin, ["run", "build"], {
    cwd: packageDir,
    env: { ...process.env, SKIP_PYTHON_BUILD: "1" },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`runtime plugin ${label} build exited ${result.status ?? "without status"}`);
    process.exit(result.status ?? 1);
  }
  if (packageJson.name === "@elizaos/agent") {
    try {
      normalizeElizaAgentDist(packageDir);
    } catch (error) {
      console.error(
        `runtime plugin ${label} build normalization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exit(1);
    }
    const bundleResult = buildElizaAgentLifeOpsBundle(packageDir);
    if (bundleResult.status !== 0) {
      console.error(
        `runtime plugin ${label} LifeOps bundle exited ${bundleResult.status ?? "without status"}`,
      );
      process.exit(bundleResult.status ?? 1);
    }
  }
  if (packageJson.name === "@elizaos/plugin-elizacloud") {
    const bundleResult = buildElizaCloudLifeOpsBundle(packageDir);
    if (bundleResult.status !== 0) {
      console.error(
        `runtime plugin ${label} LifeOps cloud bundle exited ${bundleResult.status ?? "without status"}`,
      );
      process.exit(bundleResult.status ?? 1);
    }
  }
  const missingOutputs = missingRequiredRuntimeOutputs(packageDir, packageJson);
  if (missingOutputs.length > 0) {
    if (!REQUIRED_RUNTIME_OUTPUTS.has(packageJson.name)) {
      console.error(
        `runtime plugin ${label} build succeeded but no runtime JS entry was produced`,
      );
    } else {
      console.error(
        `runtime plugin ${label} build succeeded but missing required runtime output: ${missingOutputs.join(
          ", ",
        )}`,
      );
    }
    process.exit(1);
  }
  buildCount += 1;
}

console.log(`built ${buildCount} Milaidy runtime workspace(s)`);
