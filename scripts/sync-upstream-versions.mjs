#!/usr/bin/env node

/**
 * scripts/sync-upstream-versions.mjs
 *
 * Reads vendored @elizaos/* package versions and updates any explicitly pinned
 * dependency specs in the root package.json to match. Also regenerates
 * upstreams.lock.json with the current state.
 *
 * Usage:
 *   node scripts/sync-upstream-versions.mjs          # sync + report
 *   node scripts/sync-upstream-versions.mjs --check   # same as check-upstream-drift
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getElizaPackageLinks,
  getPluginPackageLinks,
  getPublishedElizaPackageSpecs,
} from "./setup-upstreams.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

if (process.argv.includes("--check")) {
  // Delegate to drift checker
  await import("./check-upstream-drift.mjs");
  process.exit(0);
}

function readPackageJson(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function syncVersions() {
  const rootPkgPath = path.join(ROOT, "package.json");
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  const pinnedDeps = getPublishedElizaPackageSpecs(ROOT);

  // Build vendored map
  const vendored = new Map();
  for (const link of [
    ...getElizaPackageLinks(ROOT),
    ...getPluginPackageLinks(ROOT),
  ]) {
    const pkg = readPackageJson(link.targetPath);
    if (pkg?.name) {
      vendored.set(pkg.name, {
        dir: link.targetPath,
        version: pkg.version,
      });
    }
  }

  let updated = 0;
  for (const [packageName, specVersion] of pinnedDeps) {
    const local = vendored.get(packageName);
    if (!local || local.version === specVersion) continue;

    // Update in dependencies or devDependencies
    for (const section of ["dependencies", "devDependencies"]) {
      if (rootPkg[section]?.[packageName] === specVersion) {
        rootPkg[section][packageName] = local.version;
        console.log(
          `[sync] ${packageName}: ${specVersion} → ${local.version} (in ${section})`,
        );
        updated++;
      }
    }
  }

  if (updated > 0) {
    writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`);
    console.log(
      `\n[sync] Updated ${updated} dependency spec(s) in package.json`,
    );
  } else {
    console.log("[sync] All pinned specs already match vendored versions.");
  }
}

function regenerateLockfile() {
  const lockPath = path.join(ROOT, "upstreams.lock.json");
  let elizaCommit = "unknown";
  try {
    elizaCommit = execSync("git -C eliza rev-parse HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {}

  const entries = [];

  // Core packages
  const pkgsDir = path.join(ROOT, "eliza", "packages");
  if (existsSync(pkgsDir)) {
    for (const dir of require("node:fs").readdirSync(pkgsDir)) {
      const pkg = readPackageJson(path.join(pkgsDir, dir));
      if (!pkg?.name) continue;
      entries.push({
        packageName: pkg.name,
        version: pkg.version,
        sourcePath: `eliza/packages/${dir}`,
        sourceType: "core",
        repoUrl: "https://github.com/elizaos/eliza.git",
        pinnedCommit: elizaCommit.slice(0, 12),
      });
    }
  }

  // Plugin packages
  const pluginsDir = path.join(ROOT, "eliza", "plugins");
  if (existsSync(pluginsDir)) {
    for (const dir of require("node:fs")
      .readdirSync(pluginsDir)
      .filter((d) => d.startsWith("plugin-"))) {
      const tsPath = path.join(pluginsDir, dir, "typescript", "package.json");
      const plainPath = path.join(pluginsDir, dir, "package.json");
      const pkgPath = existsSync(tsPath)
        ? path.join(pluginsDir, dir, "typescript")
        : existsSync(plainPath)
          ? path.join(pluginsDir, dir)
          : null;
      if (!pkgPath) continue;
      const pkg = readPackageJson(pkgPath);
      if (!pkg?.name) continue;
      let commit = "unknown";
      try {
        commit = execSync(
          `git -C eliza/plugins/${dir} rev-parse --short HEAD`,
          {
            cwd: ROOT,
            encoding: "utf8",
          },
        ).trim();
      } catch {}
      entries.push({
        packageName: pkg.name,
        version: pkg.version,
        sourcePath: path.relative(ROOT, pkgPath),
        sourceType: "plugin",
        repoUrl: `https://github.com/elizaos-plugins/${dir}.git`,
        pinnedCommit: commit,
      });
    }
  }

  const rootPkg = JSON.parse(
    readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const bundled = new Set(rootPkg.bundleDependencies || []);
  for (const e of entries) e.bundledAtRelease = bundled.has(e.packageName);
  entries.sort((a, b) => a.packageName.localeCompare(b.packageName));

  const lockfile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    elizaCommit: elizaCommit.slice(0, 12),
    elizaBranch: "develop",
    upstreams: entries,
  };

  writeFileSync(lockPath, `${JSON.stringify(lockfile, null, 2)}\n`);
  console.log(
    `[sync] Regenerated upstreams.lock.json (${entries.length} entries)`,
  );
}

syncVersions();
regenerateLockfile();
