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

// In disable-local-eliza-workspace mode the eliza/ tree is restored *after*
// `bun install` ran against the root only, so eliza/packages/app-core/
// has no node_modules. Both the upstream copy-runtime script and Vite's
// CSS resolver expect packages to be reachable from
// eliza/packages/app-core/node_modules. Populate it with per-entry
// symlinks rather than a single bulk symlink so that:
//   - enhanced-resolve walking up from src/styles/ finds tailwindcss et al.
//   - copy-runtime-node-modules can stat .bun and per-package dirs directly.
function ensureAppCoreNodeModules() {
  if (
    !fs.existsSync(miladyRootNodeModules) ||
    !fs.existsSync(elizaAppCoreDir)
  ) {
    return;
  }

  const stat = fs.lstatSync(elizaAppCoreNodeModules, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    fs.unlinkSync(elizaAppCoreNodeModules);
  } else if (stat?.isDirectory()) {
    return;
  }

  fs.mkdirSync(elizaAppCoreNodeModules, { recursive: true });

  const entries = fs.readdirSync(miladyRootNodeModules, { withFileTypes: true });
  let scopedCount = 0;
  let directCount = 0;
  for (const entry of entries) {
    if (entry.name.startsWith("@")) {
      const scopeSrc = path.join(miladyRootNodeModules, entry.name);
      const scopeDest = path.join(elizaAppCoreNodeModules, entry.name);
      fs.mkdirSync(scopeDest, { recursive: true });
      const scopeEntries = fs.readdirSync(scopeSrc, { withFileTypes: true });
      for (const sub of scopeEntries) {
        const subDest = path.join(scopeDest, sub.name);
        if (fs.existsSync(subDest)) continue;
        try {
          fs.symlinkSync(path.join(scopeSrc, sub.name), subDest, "dir");
          scopedCount += 1;
        } catch {
          // entry already exists or perms; skip silently
        }
      }
    } else {
      const dest = path.join(elizaAppCoreNodeModules, entry.name);
      if (fs.existsSync(dest)) continue;
      try {
        fs.symlinkSync(path.join(miladyRootNodeModules, entry.name), dest, "dir");
        directCount += 1;
      } catch {
        // entry already exists or perms; skip silently
      }
    }
  }
  console.log(
    `[copy-runtime-node-modules wrapper] populated ${elizaAppCoreNodeModules} with ${directCount} top-level + ${scopedCount} scoped symlinks from ${miladyRootNodeModules}`,
  );
}

ensureAppCoreNodeModules();

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
