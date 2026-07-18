#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, symlinkSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];

if (!root) {
  console.error("usage: node scripts/build-milaidy-runtime-plugin-workspaces.mjs <repo-root>");
  process.exit(1);
}

const RUNTIME_PLUGIN_PACKAGES = [
  // Keep shared app code ahead of the packages that consume it. A clean
  // assembly cannot rely on filesystem traversal order for workspace builds.
  "@elizaos/app-task-coordinator",
  "@elizaos/app-lifeops",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-anthropic",
  "@elizaos/plugin-app-control",
  "@elizaos/plugin-commands",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-edge-tts",
  "@elizaos/plugin-elizacloud",
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
const ROOT_NODE_MODULES = join(root, "node_modules");
const bunBin = process.env.ALICE_BUN_BIN || "bun";
const SKIP_DIRS = new Set([".git", "dist", "node_modules"]);

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

const searchRoots = SEARCH_ROOTS.filter((searchRoot) => existsSync(searchRoot));
if (searchRoots.length === 0) {
  console.log("no runtime plugin source directories found; skipping runtime plugin builds");
  process.exit(0);
}

let buildCount = 0;
const corePackageJson = readPackageJson(CORE_PACKAGE_DIR);
const runtimePackages = [
  ...(corePackageJson?.name === "@elizaos/core"
    ? [[CORE_PACKAGE_DIR, corePackageJson]]
    : []),
  ...searchRoots.flatMap((searchRoot) => walk(searchRoot)),
].sort(([, packageA], [, packageB]) => {
  if (packageA.name === "@elizaos/core") return -1;
  if (packageB.name === "@elizaos/core") return 1;
  return (
    (RUNTIME_PLUGIN_PACKAGE_PRIORITY.get(packageA.name) ?? Number.MAX_SAFE_INTEGER) -
    (RUNTIME_PLUGIN_PACKAGE_PRIORITY.get(packageB.name) ?? Number.MAX_SAFE_INTEGER)
  );
});
for (const [packageDir, packageJson] of runtimePackages) {
  if (hasRuntimeEntry(packageDir, packageJson)) {
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
  if (!hasRuntimeEntry(packageDir, packageJson)) {
    console.error(`runtime plugin ${label} build succeeded but no runtime JS entry was produced`);
    process.exit(1);
  }
  buildCount += 1;
}

console.log(`built ${buildCount} Milaidy runtime workspace(s)`);
