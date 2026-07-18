#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DEP_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const OVERRIDE_SECTIONS = [["overrides"], ["pnpm", "overrides"]];

export const ALICE_RELEASE_RUNTIME_PINS = new Map([
  ["@elizaos/plugin-openrouter", "2.0.0-alpha.13"],
  ["@elizaos/plugin-shell", "2.0.0-alpha.10"],
  ["@elizaos/plugin-sql", "2.0.0-alpha.20"],
]);

const PINNED_WORKSPACE_EXCLUDES = new Map([
  [
    "@elizaos/plugin-sql",
    {
      exactEntries: new Set([
        "eliza/plugins/plugin-sql",
        "eliza/plugins/plugin-sql/typescript",
      ]),
      wildcardEntry: "eliza/plugins/*",
      wildcardExclude: "!eliza/plugins/plugin-sql",
    },
  ],
  [
    "@elizaos/plugin-shell",
    {
      exactEntries: new Set(["eliza/plugins/plugin-shell"]),
      wildcardEntry: "eliza/plugins/*",
      wildcardExclude: "!eliza/plugins/plugin-shell",
    },
  ],
  [
    "@elizaos/plugin-openrouter",
    {
      exactEntries: new Set(["eliza/plugins/plugin-openrouter"]),
      wildcardEntry: "eliza/plugins/*",
      wildcardExclude: "!eliza/plugins/plugin-openrouter",
    },
  ],
]);

const RUNTIME_WORKSPACE_SELECTIONS = [
  {
    packageName: "@elizaos/plugin-signal",
    requiredEntry: "eliza/plugins/plugin-signal",
    requiredWildcard: "eliza/plugins/*",
    removeEntries: new Set([
      "!eliza/plugins/plugin-signal",
      "plugins/plugin-signal/typescript",
    ]),
    excludeAfterWildcard: {
      wildcardEntry: "plugins/plugin-*/typescript",
      excludeEntry: "!plugins/plugin-signal/typescript",
    },
  },
];

const RELEASE_WORKSPACE_DEPENDENCIES = new Map([
  ["@elizaos/app-companion", new Map([["@elizaos/agent", "workspace:*"]])],
  ["@elizaos/app-lifeops", new Map([["@elizaos/agent", "workspace:*"]])],
]);

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function collectPackageJsonPaths(dir, paths = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "package.json" && entry.isFile()) {
      paths.push(join(dir, entry.name));
      continue;
    }
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) {
      continue;
    }
    collectPackageJsonPaths(join(dir, entry.name), paths);
  }
  return paths;
}

function packageLabel(root, packageJsonPath) {
  const rel = toPosixPath(relative(root, packageJsonPath));
  return rel === "package.json" ? "" : `${rel} `;
}

function getNestedObject(target, pathSegments) {
  let current = target;
  for (const segment of pathSegments) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = current[segment];
  }
  return current && typeof current === "object" ? current : null;
}

function pinPackageSection(pkg, section, packageName, version) {
  const deps = pkg[section];
  if (!deps || typeof deps !== "object") {
    return false;
  }
  if (deps[packageName] === undefined || deps[packageName] === version) {
    return false;
  }
  deps[packageName] = version;
  return true;
}

function pinOverrideSection(pkg, sectionPath, packageName, version) {
  const overrides = getNestedObject(pkg, sectionPath);
  if (!overrides || overrides[packageName] === undefined || overrides[packageName] === version) {
    return false;
  }
  overrides[packageName] = version;
  return true;
}

function updateWorkspaceEntries(pkg, packageName) {
  const rule = PINNED_WORKSPACE_EXCLUDES.get(packageName);
  if (!rule || !Array.isArray(pkg.workspaces)) {
    return false;
  }

  const original = pkg.workspaces.map((entry) => String(entry));
  const filtered = original.filter((entry) => !rule.exactEntries.has(entry));

  if (
    filtered.includes(rule.wildcardEntry) &&
    !filtered.includes(rule.wildcardExclude)
  ) {
    const wildcardIndex = filtered.lastIndexOf(rule.wildcardEntry);
    filtered.splice(wildcardIndex + 1, 0, rule.wildcardExclude);
  }

  const changed =
    filtered.length !== original.length ||
    filtered.some((entry, index) => entry !== original[index]);
  if (changed) {
    pkg.workspaces = filtered;
  }
  return changed;
}

function packageHasDependency(pkg, packageName) {
  return DEP_SECTIONS.some(
    (section) => pkg[section] && typeof pkg[section] === "object" && pkg[section][packageName] !== undefined,
  );
}

function applyRuntimeWorkspaceSelection(pkg, rule) {
  if (!Array.isArray(pkg.workspaces) || !packageHasDependency(pkg, rule.packageName)) {
    return false;
  }

  const original = pkg.workspaces.map((entry) => String(entry));
  let selected = original.filter((entry) => !rule.removeEntries.has(entry));

  if (
    rule.excludeAfterWildcard &&
    selected.includes(rule.excludeAfterWildcard.wildcardEntry) &&
    !selected.includes(rule.excludeAfterWildcard.excludeEntry)
  ) {
    const wildcardIndex = selected.lastIndexOf(rule.excludeAfterWildcard.wildcardEntry);
    selected.splice(wildcardIndex + 1, 0, rule.excludeAfterWildcard.excludeEntry);
  }

  if (
    !selected.includes(rule.requiredWildcard) &&
    !selected.includes(rule.requiredEntry)
  ) {
    selected.push(rule.requiredEntry);
  }

  const changed =
    selected.length !== original.length ||
    selected.some((entry, index) => entry !== original[index]);
  if (changed) {
    pkg.workspaces = selected;
  }
  return changed;
}

function removeLockfiles(root) {
  let removed = 0;
  for (const name of ["bun.lock", "bun.lockb"]) {
    const lockPath = join(root, name);
    if (!existsSync(lockPath)) {
      continue;
    }
    rmSync(lockPath, { force: true });
    removed += 1;
  }
  return removed;
}

export function pinAliceReleaseRuntimeDeps(root, { log = console.log } = {}) {
  const packageJsonPath = join(root, "package.json");
  const changes = [];
  const packageEntries = collectPackageJsonPaths(root).map((path) => {
    const raw = readFileSync(path, "utf8");
    return {
      path,
      raw,
      indent: raw.match(/^(\s+)"/m)?.[1] ?? "  ",
      pkg: JSON.parse(raw),
    };
  });
  const rootEntry = packageEntries.find((entry) => entry.path === packageJsonPath);

  if (!rootEntry) {
    throw new Error(`missing root package.json at ${packageJsonPath}`);
  }

  for (const [packageName, version] of ALICE_RELEASE_RUNTIME_PINS) {
    for (const entry of packageEntries) {
      const label = packageLabel(root, entry.path);
      let changed = false;

      for (const section of DEP_SECTIONS) {
        if (pinPackageSection(entry.pkg, section, packageName, version)) {
          changes.push(`${label}${section}.${packageName} -> ${version}`);
          changed = true;
        }
      }
      for (const sectionPath of OVERRIDE_SECTIONS) {
        if (pinOverrideSection(entry.pkg, sectionPath, packageName, version)) {
          changes.push(`${label}${sectionPath.join(".")}.${packageName} -> ${version}`);
          changed = true;
        }
      }

      if (changed) {
        writeFileSync(entry.path, `${JSON.stringify(entry.pkg, null, entry.indent)}\n`);
      }
    }

    if (updateWorkspaceEntries(rootEntry.pkg, packageName)) {
      changes.push(`workspaces exclude ${packageName}`);
      writeFileSync(rootEntry.path, `${JSON.stringify(rootEntry.pkg, null, rootEntry.indent)}\n`);
    }
  }

  for (const rule of RUNTIME_WORKSPACE_SELECTIONS) {
    if (applyRuntimeWorkspaceSelection(rootEntry.pkg, rule)) {
      changes.push(`workspaces select ${rule.packageName}`);
      writeFileSync(rootEntry.path, `${JSON.stringify(rootEntry.pkg, null, rootEntry.indent)}\n`);
    }
  }

  for (const entry of packageEntries) {
    const workspaceDependencies = RELEASE_WORKSPACE_DEPENDENCIES.get(
      entry.pkg.name,
    );
    if (!workspaceDependencies) continue;

    let changed = false;
    for (const [packageName, version] of workspaceDependencies) {
      if (entry.pkg.dependencies?.[packageName] === version) continue;
      entry.pkg.dependencies ??= {};
      entry.pkg.dependencies[packageName] = version;
      changes.push(
        `${packageLabel(root, entry.path)}dependencies.${packageName} -> ${version}`,
      );
      changed = true;
    }
    if (changed) {
      writeFileSync(
        entry.path,
        `${JSON.stringify(entry.pkg, null, entry.indent)}\n`,
      );
    }
  }

  if (changes.length === 0) {
    log("[pin-alice-release-runtime-deps] no release runtime pins changed");
    return { changed: false, changes, removedLockfiles: 0 };
  }

  const removedLockfiles = removeLockfiles(root);

  for (const change of changes) {
    log(`[pin-alice-release-runtime-deps] ${change}`);
  }
  if (removedLockfiles > 0) {
    log(
      `[pin-alice-release-runtime-deps] removed ${removedLockfiles} stale Bun lockfile(s)`,
    );
  }

  return { changed: true, changes, removedLockfiles };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.argv[2];
  if (!root) {
    console.error("usage: node scripts/pin-alice-release-runtime-deps.mjs <repo-root>");
    process.exit(1);
  }
  pinAliceReleaseRuntimeDeps(root);
}
