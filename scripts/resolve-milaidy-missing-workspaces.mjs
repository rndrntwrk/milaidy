#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.argv[2];

if (!root) {
  console.error("usage: node scripts/resolve-milaidy-missing-workspaces.mjs <repo-root>");
  process.exit(1);
}

const DEP_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const OVERRIDE_SECTIONS = [
  ["overrides"],
  ["pnpm", "overrides"],
];
const LOCAL_WORKSPACE_TAGS = new Set(["alpha", "beta", "next"]);

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const KNOWN_PINS = new Map([
  ["@elizaos/core", "2.0.0-alpha.33"],
  ["@elizaos/plugin-agent-orchestrator", "0.3.16"],
  ["@elizaos/plugin-cron", "2.0.0-alpha.7"],
  ["@elizaos/plugin-knowledge", "2.0.0-alpha.4"],
  ["@elizaos/plugin-rolodex", "2.0.0-alpha.4"],
  ["@elizaos/plugin-sql", "2.0.0-alpha.20"],
  ["@elizaos/plugin-todo", "2.0.0-alpha.4"],
  ["@elizaos/plugin-trajectory-logger", "2.0.0-alpha.4"],
  ["@elizaos/prompts", "2.0.0-alpha.33"],
]);

const versionCache = new Map();
const packagePaths = [];
const rootPackageJsonPath = join(root, "package.json");
const rootPackageJsonRaw = readFileSync(rootPackageJsonPath, "utf8");
const rootPackageJsonIndent = rootPackageJsonRaw.match(/^(\s+)"/m)?.[1] ?? "  ";
const rootPackageJson = JSON.parse(rootPackageJsonRaw);
const workspacePatterns = Array.isArray(rootPackageJson.workspaces)
  ? rootPackageJson.workspaces.map((entry) => String(entry))
  : [];

function toPosixPath(value) {
  return value.split("\\").join("/");
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function segmentMatchesPattern(segment, patternSegment) {
  const regex = new RegExp(`^${escapeRegex(patternSegment).replace(/\*/g, "[^/]*")}$`);
  return regex.test(segment);
}

function pathMatchesWorkspacePattern(relDir, pattern) {
  const relSegments = toPosixPath(relDir).split("/").filter(Boolean);
  const patternSegments = toPosixPath(normalizeWorkspacePattern(pattern)).split("/").filter(Boolean);
  if (relSegments.length !== patternSegments.length) {
    return false;
  }
  return patternSegments.every((segment, index) =>
    segmentMatchesPattern(relSegments[index] ?? "", segment),
  );
}

function isWorkspacePackage(path) {
  const relDir = toPosixPath(relative(root, dirname(path)));
  const included = workspacePatterns.some(
    (pattern) => !isNegatedWorkspacePattern(pattern) && pathMatchesWorkspacePattern(relDir, pattern),
  );
  if (!included) {
    return false;
  }
  return !workspacePatterns.some(
    (pattern) => isNegatedWorkspacePattern(pattern) && pathMatchesWorkspacePattern(relDir, pattern),
  );
}

function isExplicitWorkspaceEntry(pattern) {
  return !normalizeWorkspacePattern(pattern).includes("*");
}

function isNegatedWorkspacePattern(pattern) {
  return pattern.startsWith("!");
}

function normalizeWorkspacePattern(pattern) {
  return isNegatedWorkspacePattern(pattern) ? pattern.slice(1) : pattern;
}

function isRootPackage(path) {
  return toPosixPath(path) === toPosixPath(rootPackageJsonPath);
}

function workspaceEntryForPackage(path) {
  return toPosixPath(relative(root, dirname(path)));
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "package.json" && entry.isFile()) {
      packagePaths.push(join(dir, entry.name));
      continue;
    }
    if (!entry.isDirectory()) {
      continue;
    }
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    walk(join(dir, entry.name));
  }
}

function parsePackageJson(path) {
  const raw = readFileSync(path, "utf8");
  return {
    path,
    raw,
    indent: raw.match(/^(\s+)"/m)?.[1] ?? "  ",
    json: JSON.parse(raw),
  };
}

let workspaceEntryPruned = false;

for (let index = workspacePatterns.length - 1; index >= 0; index -= 1) {
  const workspaceEntry = workspacePatterns[index];
  if (!isExplicitWorkspaceEntry(workspaceEntry)) {
    continue;
  }

  const workspacePackageJsonPath = join(
    root,
    normalizeWorkspacePattern(workspaceEntry),
    "package.json",
  );
  if (existsSync(workspacePackageJsonPath)) {
    continue;
  }

  workspacePatterns.splice(index, 1);
  workspaceEntryPruned = true;
  console.log(`removed invalid workspace entry ${workspaceEntry} (missing package.json)`);
}

if (workspaceEntryPruned) {
  rootPackageJson.workspaces = [...workspacePatterns];
  writeFileSync(rootPackageJsonPath, `${JSON.stringify(rootPackageJson, null, rootPackageJsonIndent)}\n`);
}

function pickVersionFromTags(pkgName, tags) {
  if (KNOWN_PINS.has(pkgName)) {
    return KNOWN_PINS.get(pkgName);
  }
  if (!tags || typeof tags !== "object") {
    return null;
  }
  for (const key of ["alpha", "next", "beta", "latest"]) {
    if (typeof tags[key] === "string" && tags[key].trim()) {
      return tags[key].trim();
    }
  }
  return null;
}

function npmViewJson(pkgName, field) {
  try {
    const raw = execFileSync("npm", ["view", pkgName, field, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function npmViewText(pkgName, field) {
  try {
    return execFileSync("npm", ["view", pkgName, field], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .trim()
      .split("\n")
      .pop()
      ?.trim();
  } catch {
    return null;
  }
}

function resolveVersion(pkgName) {
  if (versionCache.has(pkgName)) {
    return versionCache.get(pkgName);
  }

  let resolved = KNOWN_PINS.get(pkgName) ?? null;
  if (!resolved) {
    const tags = npmViewJson(pkgName, "dist-tags");
    resolved = pickVersionFromTags(pkgName, tags);
  }
  if (!resolved) {
    resolved = npmViewText(pkgName, "version");
  }

  versionCache.set(pkgName, resolved ?? null);
  return resolved ?? null;
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

walk(root);

const packages = packagePaths.map(parsePackageJson);
const packagePathsByName = new Map();
for (const entry of packages) {
  if (typeof entry.json.name !== "string" || !entry.json.name.trim()) {
    continue;
  }
  const existing = packagePathsByName.get(entry.json.name) ?? [];
  existing.push(entry.path);
  packagePathsByName.set(entry.json.name, existing);
}

function collectPresentPackages() {
  const presentPackages = new Map();
  for (const entry of packages) {
    if (!isWorkspacePackage(entry.path)) {
      continue;
    }
    if (typeof entry.json.name === "string" && entry.json.name.trim()) {
      presentPackages.set(entry.json.name, entry.path);
    }
  }
  return presentPackages;
}

let workspaceEntryAdded = false;
let presentPackages = collectPresentPackages();
let rewriteCount = 0;

while (true) {
  let changed = false;

  for (const entry of packages) {
    if (!isRootPackage(entry.path) && !isWorkspacePackage(entry.path)) {
      continue;
    }

    for (const section of DEP_SECTIONS) {
      const deps = entry.json[section];
      if (!deps || typeof deps !== "object") {
        continue;
      }

      for (const [depName, depVersion] of Object.entries(deps)) {
        if (typeof depVersion !== "string" || !depVersion.startsWith("workspace:")) {
          continue;
        }
        if (presentPackages.has(depName)) {
          continue;
        }

        const candidates = (packagePathsByName.get(depName) ?? []).filter((candidatePath) => {
          return !isRootPackage(candidatePath);
        });
        if (candidates.length !== 1) {
          continue;
        }

        const workspaceEntry = workspaceEntryForPackage(candidates[0]);
        if (workspacePatterns.includes(workspaceEntry)) {
          continue;
        }

        workspacePatterns.push(workspaceEntry);
        workspaceEntryAdded = true;
        changed = true;
        console.log(`added workspace entry ${workspaceEntry} for local package ${depName}`);
      }
    }
  }

  if (!changed) {
    break;
  }

  presentPackages = collectPresentPackages();
}

if (workspaceEntryAdded) {
  rootPackageJson.workspaces = workspacePatterns;
  const rootEntry = packages.find((entry) => isRootPackage(entry.path));
  if (rootEntry) {
    rootEntry.json.workspaces = [...workspacePatterns];
  }
  writeFileSync(rootPackageJsonPath, `${JSON.stringify(rootPackageJson, null, rootPackageJsonIndent)}\n`);
}

const unresolved = [];

for (const entry of packages) {
  if (!isRootPackage(entry.path) && !isWorkspacePackage(entry.path)) {
    continue;
  }
  let changed = false;

  for (const section of DEP_SECTIONS) {
    const deps = entry.json[section];
    if (!deps || typeof deps !== "object") {
      continue;
    }

    for (const [depName, depVersion] of Object.entries(deps)) {
      if (
        typeof depVersion === "string" &&
        LOCAL_WORKSPACE_TAGS.has(depVersion) &&
        presentPackages.has(depName)
      ) {
        entry.json[section][depName] = "workspace:*";
        rewriteCount += 1;
        changed = true;
        console.log(
          `resolved local workspace ${depName} in ${entry.path} ${section}: ${depVersion} -> workspace:*`,
        );
        continue;
      }

      if (typeof depVersion !== "string" || !depVersion.startsWith("workspace:")) {
        continue;
      }
      if (presentPackages.has(depName)) {
        continue;
      }

      const resolved = resolveVersion(depName);
      if (!resolved) {
        unresolved.push(`${entry.path} ${section}.${depName}`);
        continue;
      }

      entry.json[section][depName] = resolved;
      rewriteCount += 1;
      changed = true;
      console.log(
        `resolved missing workspace ${depName} in ${entry.path} ${section}: ${depVersion} -> ${resolved}`,
      );
    }
  }

  for (const sectionPath of OVERRIDE_SECTIONS) {
    const overrides = getNestedObject(entry.json, sectionPath);
    if (!overrides) {
      continue;
    }

    for (const [overrideName, overrideVersion] of Object.entries(overrides)) {
      if (
        typeof overrideVersion === "string" &&
        LOCAL_WORKSPACE_TAGS.has(overrideVersion) &&
        presentPackages.has(overrideName)
      ) {
        overrides[overrideName] = "workspace:*";
        rewriteCount += 1;
        changed = true;
        console.log(
          `resolved local workspace ${overrideName} in ${entry.path} ${sectionPath.join(".")}: ${overrideVersion} -> workspace:*`,
        );
        continue;
      }

      if (typeof overrideVersion !== "string" || !overrideVersion.startsWith("workspace:")) {
        continue;
      }
      if (presentPackages.has(overrideName)) {
        continue;
      }

      const resolved = resolveVersion(overrideName);
      if (!resolved) {
        unresolved.push(`${entry.path} ${sectionPath.join(".")}.${overrideName}`);
        continue;
      }

      overrides[overrideName] = resolved;
      rewriteCount += 1;
      changed = true;
      console.log(
        `resolved missing workspace ${overrideName} in ${entry.path} ${sectionPath.join(".")}: ${overrideVersion} -> ${resolved}`,
      );
    }
  }

  if (changed) {
    writeFileSync(entry.path, `${JSON.stringify(entry.json, null, entry.indent)}\n`);
  }
}

if (unresolved.length > 0) {
  console.error("unresolved missing workspace dependencies:");
  for (const item of unresolved) {
    console.error(`  ${item}`);
  }
  process.exit(1);
}

const normalizedRuntime = workspaceEntryPruned || workspaceEntryAdded || rewriteCount > 0;
if (normalizedRuntime) {
  for (const lockfileName of ["bun.lock", "bun.lockb"]) {
    const lockfilePath = join(root, lockfileName);
    if (!existsSync(lockfilePath)) {
      continue;
    }
    rmSync(lockfilePath, { force: true });
    console.log(`removed stale lockfile ${lockfilePath} after workspace normalization`);
  }
}

console.log(`resolved ${rewriteCount} missing workspace dependency reference(s)`);
