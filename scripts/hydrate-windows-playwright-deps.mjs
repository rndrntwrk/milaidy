#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function run(args, options = {}) {
  const result = spawnSync("bun", args, {
    cwd: options.cwd ?? repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removeExistingLink(linkPath) {
  fs.rmSync(linkPath, { recursive: true, force: true });
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function copyPackage(sourcePath, destinationPath) {
  fs.cpSync(sourcePath, destinationPath, {
    recursive: true,
    filter: (candidatePath) => {
      const relative = path.relative(sourcePath, candidatePath);
      const parts = relative.split(path.sep);
      return !parts.includes("node_modules") && !parts.includes(".git");
    },
  });
}

function assertPathExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected hydrated Windows dependency path: ${filePath}`);
  }
}

function linkScopedPackage(
  nodeModulesRoot,
  scopedPackageName,
  sourcePath,
  options = {},
) {
  const sourceManifestPath = path.join(sourcePath, "package.json");
  if (!fs.existsSync(sourceManifestPath)) {
    throw new Error(
      `Cannot hydrate ${scopedPackageName}; package manifest is missing at ${sourceManifestPath}`,
    );
  }

  const [scopeName, packageName] = scopedPackageName.split("/");
  if (scopeName !== "@elizaos" || !packageName) {
    throw new Error(`Unsupported elizaOS package link: ${scopedPackageName}`);
  }

  const scopeDir = path.join(nodeModulesRoot, scopeName);
  const linkPath = path.join(scopeDir, packageName);
  fs.mkdirSync(scopeDir, { recursive: true });
  removeExistingLink(linkPath);
  let mode = "linked";
  if (options.copy) {
    copyPackage(sourcePath, linkPath);
    mode = "copied";
  } else {
    try {
      fs.symlinkSync(
        sourcePath,
        linkPath,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(
        `[hydrate-windows-playwright-deps] symlink failed for ${scopedPackageName}; copying instead: ${reason}`,
      );
      copyPackage(sourcePath, linkPath);
      mode = "copied";
    }
  }
  console.log(
    `[hydrate-windows-playwright-deps] ${mode} ${scopedPackageName} at ${relativePath(
      linkPath,
    )}`,
  );
  return linkPath;
}

function linkElizaPackage(scopedPackageName, sourcePath, options = {}) {
  return linkScopedPackage(
    path.join(repoRoot, "eliza", "node_modules"),
    scopedPackageName,
    sourcePath,
    options,
  );
}

function coreEntryPath(nodeModulesRoot) {
  return path.join(
    nodeModulesRoot,
    "@elizaos",
    "core",
    "dist",
    "index.node.js",
  );
}

function assertElizaPackageEntry(scopedPackageName, relativeEntryPath) {
  const [, packageName] = scopedPackageName.split("/");
  assertPathExists(
    path.join(
      repoRoot,
      "eliza",
      "node_modules",
      "@elizaos",
      packageName,
      ...relativeEntryPath,
    ),
  );
}

run(
  ["add", "--no-save", "--dev", "--ignore-scripts", "@playwright/test@1.59.1"],
  {
    cwd: path.join(repoRoot, "apps/app"),
  },
);

const elizaRoot = path.join(repoRoot, "eliza");
if (fs.existsSync(path.join(elizaRoot, "package.json"))) {
  const corePath = path.join(elizaRoot, "packages", "core");
  const sharedPath = path.join(elizaRoot, "packages", "shared");
  const sqlPluginPath = path.join(elizaRoot, "plugins", "plugin-sql");
  const sqlPluginTypescriptPath = path.join(sqlPluginPath, "typescript");
  const elizaCloudPluginPath = path.join(
    elizaRoot,
    "plugins",
    "plugin-elizacloud",
  );

  linkElizaPackage("@elizaos/core", corePath);
  linkElizaPackage(
    "@elizaos/cloud-sdk",
    path.join(elizaRoot, "cloud", "packages", "sdk"),
  );
  linkElizaPackage("@elizaos/shared", sharedPath);
  linkElizaPackage("@elizaos/plugin-elizacloud", elizaCloudPluginPath);
  linkElizaPackage("@elizaos/plugin-sql", sqlPluginTypescriptPath);
  linkScopedPackage(
    path.join(sqlPluginPath, "node_modules"),
    "@elizaos/core",
    corePath,
    { copy: true },
  );
  linkScopedPackage(
    path.join(sqlPluginTypescriptPath, "node_modules"),
    "@elizaos/core",
    corePath,
    { copy: true },
  );
  assertElizaPackageEntry("@elizaos/core", ["dist", "index.node.js"]);
  assertElizaPackageEntry("@elizaos/plugin-sql", [
    "dist",
    "node",
    "index.node.js",
  ]);
  assertElizaPackageEntry("@elizaos/plugin-elizacloud", [
    "dist",
    "node",
    "index.node.js",
  ]);
  assertPathExists(coreEntryPath(path.join(sqlPluginPath, "node_modules")));
  assertPathExists(
    coreEntryPath(path.join(sqlPluginTypescriptPath, "node_modules")),
  );
}
