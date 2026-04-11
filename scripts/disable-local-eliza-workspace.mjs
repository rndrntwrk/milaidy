#!/usr/bin/env node

/**
 * Disable the repo-local `eliza/` workspace for CI runs that have
 * `MILADY_SKIP_LOCAL_UPSTREAMS=1` set (Docker CI Smoke, Release
 * Workflow Contract, packaged build jobs, etc.).
 *
 * Two things have to happen for Bun to produce a clean lockfile when
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
 *      `@elizaos/core` (the npm one comes from
 *      `deploy/cloud-agent-template`'s pinned `2.0.0-alpha.115`). The
 *      next consumer to parse the lockfile — `bun pm pack --dry-run`,
 *      invoked from `scripts/release-check.ts` — then fails with
 *      `error: Duplicate package path` and
 *      `failed to parse lockfile: InvalidPackageKey`, blocking the
 *      Release Workflow Contract job.
 *
 * We patch `package.json` in place (no commit, CI-only). The edit is
 * scoped to the `workspaces` array and is idempotent.
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

const raw = fs.readFileSync(packageJsonPath, "utf8");
let pkg;
try {
  pkg = JSON.parse(raw);
} catch (error) {
  console.error(
    `[disable-local-eliza-workspace] Failed to parse ${packageJsonPath}: ${error.message}`,
  );
  process.exit(1);
}

if (!Array.isArray(pkg.workspaces)) {
  console.log(
    "[disable-local-eliza-workspace] Root package.json has no workspaces array; nothing to patch",
  );
  process.exit(0);
}

const originalWorkspaces = pkg.workspaces;
const filteredWorkspaces = originalWorkspaces.filter(
  (entry) => entry !== ELIZA_WORKSPACE_GLOB,
);

if (filteredWorkspaces.length === originalWorkspaces.length) {
  console.log(
    `[disable-local-eliza-workspace] Root package.json workspaces array does not include ${ELIZA_WORKSPACE_GLOB}; nothing to patch`,
  );
  process.exit(0);
}

pkg.workspaces = filteredWorkspaces;

// Preserve trailing newline style to match existing package.json.
const hasTrailingNewline = raw.endsWith("\n");
const serialized = JSON.stringify(pkg, null, 2) + (hasTrailingNewline ? "\n" : "");
fs.writeFileSync(packageJsonPath, serialized);

console.log(
  `[disable-local-eliza-workspace] Removed ${ELIZA_WORKSPACE_GLOB} from root package.json workspaces`,
);
