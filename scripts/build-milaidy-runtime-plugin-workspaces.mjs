#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2];

if (!root) {
  console.error("usage: node scripts/build-milaidy-runtime-plugin-workspaces.mjs <repo-root>");
  process.exit(1);
}

const RUNTIME_PLUGIN_PACKAGES = new Set([
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-anthropic",
  "@elizaos/plugin-commands",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-elizacloud",
  "@elizaos/plugin-experience",
  "@elizaos/plugin-form",
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
]);

const SEARCH_ROOT = join(root, "plugins");
const SKIP_DIRS = new Set([".git", "dist", "node_modules"]);

function readPackageJson(packageDir) {
  const packageJsonPath = join(packageDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch {
    return null;
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
  if (typeof packageJson.module === "string") {
    candidates.add(packageJson.module);
  }

  const rootExport =
    packageJson.exports && typeof packageJson.exports === "object" && "." in packageJson.exports
      ? packageJson.exports["."]
      : packageJson.exports;
  for (const exportPath of collectExportPaths(rootExport)) {
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

function walk(dir, depth = 0) {
  const packageDirs = [];
  const packageJson = readPackageJson(dir);
  if (packageJson?.name && RUNTIME_PLUGIN_PACKAGES.has(packageJson.name)) {
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

if (!existsSync(SEARCH_ROOT)) {
  console.log("no Milaidy plugins directory found; skipping runtime plugin builds");
  process.exit(0);
}

let buildCount = 0;
for (const [packageDir, packageJson] of walk(SEARCH_ROOT)) {
  if (hasRuntimeEntry(packageDir, packageJson)) {
    continue;
  }
  if (!packageJson.scripts || typeof packageJson.scripts.build !== "string") {
    console.warn(`runtime plugin ${packageJson.name} has no build script; missing runtime entry remains`);
    continue;
  }

  const label = `${packageJson.name} (${relative(root, packageDir)})`;
  console.log(`building runtime plugin ${label}`);
  const result = spawnSync("bun", ["run", "build"], {
    cwd: packageDir,
    env: { ...process.env, SKIP_PYTHON_BUILD: "1" },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    if (hasRuntimeEntry(packageDir, packageJson)) {
      console.warn(`runtime plugin ${label} build exited ${result.status}, but runtime JS entry exists; continuing`);
    } else {
      console.error(`runtime plugin ${label} build exited ${result.status} and no runtime JS entry was produced`);
      process.exit(result.status ?? 1);
    }
  }
  buildCount += 1;
}

console.log(`built ${buildCount} Milaidy runtime plugin workspace(s)`);
