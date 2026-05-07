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
  if (!fs.existsSync(linkPath)) return;
  fs.rmSync(linkPath, { recursive: true, force: true });
}

function linkElizaPackage(scopedPackageName, sourcePath) {
  if (!fs.existsSync(path.join(sourcePath, "package.json"))) return;

  const [scopeName, packageName] = scopedPackageName.split("/");
  if (scopeName !== "@elizaos" || !packageName) {
    throw new Error(`Unsupported elizaOS package link: ${scopedPackageName}`);
  }

  const scopeDir = path.join(repoRoot, "eliza", "node_modules", scopeName);
  const linkPath = path.join(scopeDir, packageName);
  fs.mkdirSync(scopeDir, { recursive: true });
  removeExistingLink(linkPath);
  try {
    fs.symlinkSync(
      sourcePath,
      linkPath,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch {
    fs.cpSync(sourcePath, linkPath, { recursive: true });
  }
}

run(
  ["add", "--no-save", "--dev", "--ignore-scripts", "@playwright/test@1.59.1"],
  {
    cwd: path.join(repoRoot, "apps/app"),
  },
);

const elizaRoot = path.join(repoRoot, "eliza");
if (fs.existsSync(path.join(elizaRoot, "package.json"))) {
  linkElizaPackage(
    "@elizaos/cloud-sdk",
    path.join(elizaRoot, "cloud", "packages", "sdk"),
  );
  linkElizaPackage(
    "@elizaos/plugin-elizacloud",
    path.join(elizaRoot, "plugins", "plugin-elizacloud"),
  );
}
