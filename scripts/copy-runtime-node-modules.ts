#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const target = path.resolve(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "copy-runtime-node-modules.ts",
);

const elizaAppCoreDir = path.resolve(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
);
const elizaAppCoreNodeModules = path.join(elizaAppCoreDir, "node_modules");
const miladyRootNodeModules = path.join(repoRoot, "node_modules");

if (
  !fs.existsSync(elizaAppCoreNodeModules) &&
  fs.existsSync(miladyRootNodeModules) &&
  fs.existsSync(elizaAppCoreDir)
) {
  fs.symlinkSync(miladyRootNodeModules, elizaAppCoreNodeModules, "dir");
  console.log(
    `[copy-runtime-node-modules wrapper] linked ${elizaAppCoreNodeModules} -> ${miladyRootNodeModules}`,
  );
}

const cwd = process.cwd();
const pathFlags = new Set(["--scan-dir", "--target-dist"]);
const args: string[] = [];
const incoming = process.argv.slice(2);
for (let i = 0; i < incoming.length; i += 1) {
  const arg = incoming[i];
  const eqIdx = arg.indexOf("=");
  if (eqIdx !== -1) {
    const flag = arg.slice(0, eqIdx);
    const value = arg.slice(eqIdx + 1);
    if (pathFlags.has(flag)) {
      args.push(`${flag}=${path.resolve(cwd, value)}`);
      continue;
    }
    args.push(arg);
    continue;
  }
  if (pathFlags.has(arg) && i + 1 < incoming.length) {
    args.push(arg);
    args.push(path.resolve(cwd, incoming[i + 1]));
    i += 1;
    continue;
  }
  args.push(arg);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", target, ...args],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
