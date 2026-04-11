#!/usr/bin/env node

/**
 * Disable the repo-local `eliza/` workspace for CI runs that have
 * `MILADY_SKIP_LOCAL_UPSTREAMS=1` set (Docker CI Smoke, Release
 * Workflow Contract, packaged build jobs, etc.).
 *
 * Three things have to happen for Bun to produce a clean lockfile when
 * `eliza/` is absent:
 *
 *   1. The `eliza/` directory must not exist on disk. The submodule
 *      init step already skips it in SKIP_LOCAL_UPSTREAMS mode, but if
 *      a fresh checkout DID materialize it (e.g. local repro) we also
 *      rename it out of the way here.
 *
 *   2. The root `package.json` `workspaces` array must not contain
 *      `"eliza/packages/*"`. Leaving that glob in place while the
 *      directory is absent causes Bun 1.3.x to emit a bun.lock that
 *      carries both a workspace entry AND an npm-resolved entry for
 *      `@elizaos/core`.
 *
 *   3. Every workspace package.json that still pins
 *      `"@elizaos/core": "workspace:*"` must be rewritten to the same
 *      registry version that the root `overrides` block and
 *      `deploy/cloud-agent-template` already use
 *      (`@elizaos/core@2.0.0-alpha.115` at time of writing). Without
 *      this rewrite, Bun hoists a registry-resolved `@elizaos/core`
 *      for the workspace:* callers AND a separate registry-resolved
 *      `@elizaos/core` for cloud-agent-template, emitting two
 *      top-level `"@elizaos/core"` entries in bun.lock's packages
 *      section. The next `bun pm pack --dry-run` (invoked from
 *      `scripts/release-check.ts`) then fails with:
 *
 *        error: Duplicate package path
 *            at bun.lock:XXXX:5
 *        error: failed to parse lockfile: InvalidPackageKey
 *
 *      blocking the Release Workflow Contract job.
 *
 * We patch every affected file in place (no commit, CI-only). All
 * edits are idempotent and gated on `GITHUB_ACTIONS=true` +
 * `MILADY_SKIP_LOCAL_UPSTREAMS=1`, so local runs and non-skip CI are
 * untouched.
 */

import fs from "node:fs";
import path from "node:path";

const skipLocalUpstreams =
  process.env.MILADY_SKIP_LOCAL_UPSTREAMS === "1" ||
  process.env.ELIZA_SKIP_LOCAL_UPSTREAMS === "1";

if (!skipLocalUpstreams || process.env.GITHUB_ACTIONS !== "true") {
  process.exit(0);
}

const repoRoot = process.cwd();
const elizaRoot = path.join(repoRoot, "eliza");
const disabledElizaRoot = path.join(repoRoot, ".eliza.ci-disabled");
const packageJsonPath = path.join(repoRoot, "package.json");
const ELIZA_WORKSPACE_GLOB = "eliza/packages/*";

if (fs.existsSync(elizaRoot)) {
  fs.rmSync(disabledElizaRoot, { recursive: true, force: true });
  fs.renameSync(elizaRoot, disabledElizaRoot);
  console.log(
    `[disable-local-eliza-workspace] Disabled repo-local eliza workspace at ${elizaRoot}`,
  );
} else {
  console.log(
    "[disable-local-eliza-workspace] Repo-local eliza workspace already absent",
  );
}

if (!fs.existsSync(packageJsonPath)) {
  console.log(
    "[disable-local-eliza-workspace] Root package.json not found; skipping workspace patch",
  );
  process.exit(0);
}

const rawRootPkg = fs.readFileSync(packageJsonPath, "utf8");
let rootPkg;
try {
  rootPkg = JSON.parse(rawRootPkg);
} catch (error) {
  console.error(
    `[disable-local-eliza-workspace] Failed to parse ${packageJsonPath}: ${error.message}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 1: strip eliza/packages/* from root workspaces
// ---------------------------------------------------------------------------

if (Array.isArray(rootPkg.workspaces)) {
  const originalWorkspaces = rootPkg.workspaces;
  const filteredWorkspaces = originalWorkspaces.filter(
    (entry) => entry !== ELIZA_WORKSPACE_GLOB,
  );

  if (filteredWorkspaces.length === originalWorkspaces.length) {
    console.log(
      `[disable-local-eliza-workspace] Root package.json workspaces array does not include ${ELIZA_WORKSPACE_GLOB}; nothing to patch`,
    );
  } else {
    rootPkg.workspaces = filteredWorkspaces;
    console.log(
      `[disable-local-eliza-workspace] Removed ${ELIZA_WORKSPACE_GLOB} from root package.json workspaces`,
    );
  }
}

// ---------------------------------------------------------------------------
// Step 2: determine the pinned `@elizaos/core` registry version. Prefer
// the root `overrides` block (authoritative for this codebase); fall
// back to `deploy/cloud-agent-template` which pins the same thing.
// ---------------------------------------------------------------------------

const ELIZAOS_CORE_NAME = "@elizaos/core";

function isExactRegistryVersion(specifier) {
  return typeof specifier === "string" && /^\d+\.\d+\.\d+/.test(specifier);
}

function resolvePinnedCoreVersion() {
  const fromOverrides = rootPkg?.overrides?.[ELIZAOS_CORE_NAME];
  if (isExactRegistryVersion(fromOverrides)) {
    return fromOverrides;
  }

  const templatePath = path.join(
    repoRoot,
    "deploy",
    "cloud-agent-template",
    "package.json",
  );
  if (fs.existsSync(templatePath)) {
    try {
      const templatePkg = JSON.parse(fs.readFileSync(templatePath, "utf8"));
      const fromTemplate = templatePkg?.dependencies?.[ELIZAOS_CORE_NAME];
      if (isExactRegistryVersion(fromTemplate)) {
        return fromTemplate;
      }
    } catch {
      // fall through
    }
  }

  return null;
}

const pinnedCoreVersion = resolvePinnedCoreVersion();

// Persist root package.json mutations before touching sub-packages so
// the workspaces patch is written even if the core-rewrite step bails.
function writePackageJson(filePath, originalRaw, pkg) {
  const hasTrailingNewline = originalRaw.endsWith("\n");
  const serialized =
    JSON.stringify(pkg, null, 2) + (hasTrailingNewline ? "\n" : "");
  if (serialized === originalRaw) {
    return false;
  }
  fs.writeFileSync(filePath, serialized);
  return true;
}

writePackageJson(packageJsonPath, rawRootPkg, rootPkg);

if (!pinnedCoreVersion) {
  console.warn(
    "[disable-local-eliza-workspace] Could not resolve a pinned @elizaos/core version from overrides or cloud-agent-template; leaving workspace:* specifiers in place",
  );
  process.exit(0);
}

console.log(
  `[disable-local-eliza-workspace] Rewriting @elizaos/core workspace:* → ${pinnedCoreVersion}`,
);

// ---------------------------------------------------------------------------
// Step 3: walk every workspace package and rewrite
// `"@elizaos/core": "workspace:*"` → the pinned registry version. We
// enumerate via the (now-patched) root workspaces array so we don't
// miss packages outside `packages/*`.
// ---------------------------------------------------------------------------

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

function rewriteWorkspaceCore(pkg) {
  let mutated = false;
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg?.[field];
    if (!deps || typeof deps !== "object") continue;
    if (deps[ELIZAOS_CORE_NAME] === "workspace:*") {
      deps[ELIZAOS_CORE_NAME] = pinnedCoreVersion;
      mutated = true;
    }
  }
  return mutated;
}

function expandGlob(glob) {
  if (!glob.includes("*")) {
    return [glob];
  }
  const parts = glob.split("/");
  const starIndex = parts.findIndex((segment) => segment.includes("*"));
  if (starIndex === -1) {
    return [glob];
  }
  const baseSegments = parts.slice(0, starIndex);
  const base = baseSegments.length
    ? path.join(repoRoot, ...baseSegments)
    : repoRoot;
  if (!fs.existsSync(base)) {
    return [];
  }

  const segmentPattern = parts[starIndex];
  const tail = parts.slice(starIndex + 1);

  let entries;
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }

  const regex = new RegExp(
    "^" +
      segmentPattern
        .split("*")
        .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      "$",
  );

  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!regex.test(entry.name)) continue;
    const base = path.join(...baseSegments, entry.name);
    matches.push(tail.length ? path.join(base, ...tail) : base);
  }

  if (tail.length === 0) {
    return matches;
  }

  const resolved = [];
  for (const match of matches) {
    const absolute = path.join(repoRoot, match);
    if (fs.existsSync(absolute)) {
      resolved.push(match);
    }
  }
  return resolved;
}

const seen = new Set();
const pendingWorkspaceDirs = [];

for (const entry of rootPkg.workspaces ?? []) {
  const expanded = expandGlob(entry);
  for (const match of expanded) {
    if (!seen.has(match)) {
      seen.add(match);
      pendingWorkspaceDirs.push(match);
    }
  }
}

// Also include the root package itself.
let rewrites = 0;
if (rewriteWorkspaceCore(rootPkg)) {
  writePackageJson(packageJsonPath, rawRootPkg, rootPkg);
  rewrites++;
  console.log("[disable-local-eliza-workspace]   patched .");
}

for (const workspaceRel of pendingWorkspaceDirs) {
  const pkgPath = path.join(repoRoot, workspaceRel, "package.json");
  if (!fs.existsSync(pkgPath)) continue;

  let originalRaw;
  let pkg;
  try {
    originalRaw = fs.readFileSync(pkgPath, "utf8");
    pkg = JSON.parse(originalRaw);
  } catch (error) {
    console.warn(
      `[disable-local-eliza-workspace]   skipped ${workspaceRel}: ${error.message}`,
    );
    continue;
  }

  if (!rewriteWorkspaceCore(pkg)) continue;
  if (writePackageJson(pkgPath, originalRaw, pkg)) {
    rewrites++;
    console.log(`[disable-local-eliza-workspace]   patched ${workspaceRel}`);
  }
}

if (rewrites === 0) {
  console.log(
    "[disable-local-eliza-workspace] No @elizaos/core workspace:* specifiers found; nothing rewritten",
  );
} else {
  console.log(
    `[disable-local-eliza-workspace] Rewrote @elizaos/core workspace:* specifiers in ${rewrites} package.json file(s)`,
  );
}
