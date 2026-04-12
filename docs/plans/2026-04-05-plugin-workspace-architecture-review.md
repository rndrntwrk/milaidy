# Plugin Workspace Architecture Review

Date: 2026-04-05

## Recommendation

The best long-term model is:

1. Make upstream source checkouts first-class inside Milady:
   - `eliza/` for the upstream `elizaos/eliza` monorepo
   - `plugins/plugin-*` for official plugin repos
2. Treat those directories as Bun workspaces so `bun install` links local source automatically for normal dev and e2e.
3. Pin bundled `@elizaos/*` runtime dependencies to exact versions.
4. Add a release-candidate lane that tests packed artifacts, not just linked source trees.

This gives you fast local iteration, deterministic release inputs, and a path to publish back upstream without the current patch-move-publish loop.

## Why This Review Exists

The current setup is split across too many mechanisms:

- Legacy sibling checkout linking, now replaced by [scripts/setup-upstreams.mjs](../../scripts/setup-upstreams.mjs)
- Narrow hardcoded workspace overrides in [packages/agent/src/runtime/plugin-resolver.ts](../../packages/agent/src/runtime/plugin-resolver.ts)
- State-dir custom and ejected plugin loading in [packages/agent/src/runtime/plugin-resolver.ts](../../packages/agent/src/runtime/plugin-resolver.ts) and [docs/plugins/local-plugins.md](../../docs/plugins/local-plugins.md)
- Tarball repair logic in [scripts/patch-deps.mjs](../../scripts/patch-deps.mjs)
- Release packaging from resolved `node_modules` in [scripts/copy-runtime-node-modules.ts](../../scripts/copy-runtime-node-modules.ts)

That fragmentation is why plugin iteration feels bad.

## Current-State Findings

### 1. Local source linking is optional and not the default path

- `postinstall` runs [scripts/run-repo-setup.mjs](../../scripts/run-repo-setup.mjs), which does not call `setup-eliza-workspace`; it only prints a reminder if `../eliza` exists.
- The doctor command still describes local upstream development as an optional sibling checkout at `../eliza` in [packages/app-core/src/cli/doctor/checks.ts](../../packages/app-core/src/cli/doctor/checks.ts) and [docs/cli/doctor.md](../../docs/cli/doctor.md).
- In this checkout, core runtime deps like `@elizaos/core`, `@elizaos/prompts`, `@elizaos/skills`, `@elizaos/plugin-openai`, and `@elizaos/plugin-sql` currently resolve to Bun cache paths under `node_modules/.bun`, not the sibling `../eliza` checkout.

Implication: the repo is mostly developing against published tarballs plus local patches, not against first-class source checkouts.

### 2. The current workspace override path is not a general solution

- Runtime workspace overrides are limited to a small hardcoded allowlist in [packages/agent/src/runtime/plugin-resolver.ts](../../packages/agent/src/runtime/plugin-resolver.ts).
- Registry metadata discovery is more flexible and already knows how to look for repo-local `plugins/` directories and `ELIZA_WORKSPACE_ROOT` in [packages/agent/src/services/registry-client-local.ts](../../packages/agent/src/services/registry-client-local.ts).

Implication: discovery and loading are out of sync. Metadata can find local plugins more broadly than the runtime can directly load them.

### 3. There is already a plugin workspace, just not inside this repo

- A sibling `../plugins` workspace already exists.
- It already contains a large `.gitmodules` file and a `package.json` with `workspaces: ["plugin-*"]`.
- Root [package.json](../../package.json) already has a stale `publish:plugins:next` script that expects `cd plugins`, but this repo does not currently contain a `plugins/` directory.

Implication: the repo is partway toward the architecture you want, but the source-of-truth lives beside Milady instead of inside it.

### 4. Release packaging is good enough to build on

- The desktop/runtime packaging path copies runtime deps from resolved `node_modules` using [scripts/copy-runtime-node-modules.ts](../../scripts/copy-runtime-node-modules.ts).
- The bundled runtime package set is centrally derived in [packages/agent/src/runtime/release-plugin-policy.ts](../../packages/agent/src/runtime/release-plugin-policy.ts) and [scripts/runtime-package-manifest.ts](../../scripts/runtime-package-manifest.ts).

Implication: if `node_modules` points at the right local workspaces during dev and CI, the packaged app will naturally ship those tested sources.

### 5. The upstream tarball quality problem is real

[scripts/patch-deps.mjs](../../scripts/patch-deps.mjs) currently patches or guards a large list of upstream/runtime issues, including:

- `@elizaos/core`
- `@elizaos/plugin-coding-agent`
- `@elizaos/plugin-agent-orchestrator`
- `@elizaos/plugin-pdf`
- `@elizaos/plugin-elizacloud`
- `@elizaos/plugin-discord`
- `@elizaos/plugin-sql`
- `trajectories`
- `@elizaos/plugin-local-embedding`
- `@elizaos/plugin-agent-skills`
- `@elizaos/plugin-groq`
- plus multiple non-eliza compatibility patches

Implication: a local-source-first workflow is justified. The current tarball path is not reliable enough to be the only dev loop.

### 6. Bun workspace behavior matters

I verified locally in a throwaway test workspace:

- Bun will link repo-local workspace packages when the dependency spec is an exact version or semver range that matches.
- Bun will not use a workspace package when the dependency spec is a dist-tag like `alpha`; it still tries the registry.

Implication: if Milady adopts repo-local workspaces, bundled `@elizaos/*` dependencies cannot stay on dist-tags like `alpha`. They need exact versions or semver ranges, and exact versions are better for release determinism.

## Design Goals

The architecture should satisfy all of these at once:

- Fast local iteration on core and plugin source
- Reproducible CI and packaged builds
- Clear mapping from tested source commit to released package version
- Minimal manual relinking or node_modules surgery
- Ability to publish fixes back to upstream repos cleanly
- Ability to keep public npm-based Milady releases deterministic

## Approaches

### Approach 1: Keep the current sibling checkout model and improve scripts

What it means:

- Keep `../eliza`
- Add `../plugins`
- Expand `setup-eliza-workspace` into a broader link script
- Keep mutating `node_modules` with symlinks

Pros:

- Lowest migration cost
- Reuses existing sibling checkouts
- Minimal repo churn

Cons:

- Still off-repo and non-reproducible
- Easy to drift after `bun install`
- Still requires bespoke link logic
- Still leaves release provenance murky

Verdict:

- Better than today, but still the wrong end state

### Approach 2: Use the existing state-dir eject/custom plugin system as the main workflow

What it means:

- Develop plugins via `~/.milady/plugins/ejected` or `~/.milady/plugins/custom`
- Keep Milady repo itself mostly npm-based

Pros:

- Already implemented
- Good for ad hoc local experiments

Cons:

- Not repo-owned
- Not CI-native
- Poor fit for shipping Milady
- Bad for team/shared review

Verdict:

- Keep as a user feature, not as the primary Milady engineering workflow

### Approach 3: Add repo-local source directories and manage them with scripts, not Git submodules

What it means:

- Commit a manifest of upstream repos
- Clone into `plugins/` and `eliza/` via a setup script
- Link via Bun workspaces or `file:` installs

Pros:

- Avoids Git submodule UX
- More flexible shallow/on-demand fetch behavior

Cons:

- Invents your own dependency manager
- More hidden state
- Harder Git review of pinned upstream refs
- More script logic to trust

Verdict:

- Viable if you hate submodules, but higher long-term maintenance cost

### Approach 4: Bring upstream repos directly into Milady as first-class Git submodules and Bun workspaces

What it means:

- `eliza/` is a submodule
- `plugins/plugin-*` are submodules
- Root `workspaces` includes those directories
- `bun install` links local source directly

Pros:

- Repo-local, reviewable, deterministic
- No manual relinking after install
- CI and local dev match
- Best fit for the workflow you described

Cons:

- Large `.gitmodules`
- Bigger clone/init cost
- Requires exact version discipline
- Requires better release version sync

Verdict:

- Best long-term architecture

### Approach 5: Add the existing sibling `../plugins` workspace as a nested submodule under `plugins/`

What it means:

- Milady gets `plugins/` as one submodule
- That submodule retains its own plugin submodules
- Milady also adds `eliza/` as a submodule

Pros:

- Fastest migration from what you already have
- Reuses current plugin workspace scripts
- Avoids copying hundreds of submodule entries immediately

Cons:

- Nested submodules are more confusing
- Two levels of pinning
- Worse DX than direct first-class submodules

Verdict:

- Good transitional step, not the cleanest final state

### Approach 6: Vendor everything with Git subtree or plain copies

What it means:

- Pull all upstream repos directly into Milady without submodule boundaries

Pros:

- Easiest clone experience
- No submodule commands

Cons:

- Huge repo growth
- Awkward upstream sync and publish-back story
- Easy to blur repo ownership boundaries

Verdict:

- Not recommended

### Approach 7: Stay npm-first and rely on more patches and local tarballs

What it means:

- Keep root deps pointing at npm
- Patch broken tarballs more aggressively
- Maybe test local `npm pack` outputs before publish

Pros:

- Least structural change
- Keeps public release model simple

Cons:

- Does not solve the day-to-day iteration problem
- Keeps you hostage to upstream tarball quality
- More patch debt

Verdict:

- Not sufficient

## Recommended Architecture

### Source Layout

Use repo-local upstream sources:

- `eliza/`
- `plugins/package.json`
- `plugins/plugin-*`
- `plugins/app-*` if you want to carry official apps too

I would keep `eliza/` at the repo root, not under `plugins/`, because it is a different upstream with a different release cadence and package graph.

### Dependency Model

Root Milady dependencies for bundled `@elizaos/*` packages should be exact versions, not dist-tags.

Reasons:

- Exact versions are compatible with Bun workspace linking when the local package version matches.
- Exact versions make public releases deterministic.
- Exact versions align with the existing `release-check` philosophy already used for especially brittle packages.

### Build and Runtime Model

Normal dev and CI:

- `git submodule update --init --recursive`
- `bun install` at Milady root
- Bun links repo-local workspace packages into `node_modules`
- Milady builds and tests against those linked sources

Runtime loading:

- Prefer normal package resolution from linked `node_modules`
- Delete the narrow hardcoded workspace override path once workspaces are authoritative
- Keep state-dir ejected/custom plugins as a user-facing feature, not part of the core dev loop

Packaging:

- Keep [scripts/copy-runtime-node-modules.ts](../../scripts/copy-runtime-node-modules.ts)
- It will copy the tested workspace-linked packages automatically

### Release Model

You need two release modes:

1. Packaged-app release mode
2. Public npm Milady release mode

For packaged apps:

- It is acceptable to ship workspace-linked upstream sources directly, because the build embeds the tested runtime tree.

For public npm Milady releases:

- Every bundled `@elizaos/*` dependency must point at a published exact version.
- The source checkout commit used in testing must map to that published version.

### Artifact Fidelity Rule

Do not trust source-only e2e as the final gate for public release.

Recommended gate:

1. Pack each changed upstream package from the vendored checkout
2. Install Milady against those packed artifacts
3. Run e2e against the packed artifacts
4. Publish those same package commits
5. Sync Milady exact dependency versions
6. Run release checks

That closes the gap between "the source tree passed" and "the published tarball is what shipped."

## Concrete Implementation Plan

### Phase 1: Establish the repo-local source layout

- Add `eliza/` as a submodule pinned to a known upstream commit
- Add `plugins/` and either:
  - direct plugin submodules as the final model, or
  - the existing plugin workspace as a transitional nested submodule
- Add `plugins/package.json` if direct submodules are used
- Replace the stale `publish:plugins:next` assumption with a real repo-local `plugins/` directory

### Phase 2: Make Bun workspaces authoritative

- Extend root [package.json](../../package.json) `workspaces` to include:
  - `eliza/packages/*`
  - `eliza/plugins/*` if upstream monorepo still contains plugin packages you use
  - `plugins/plugin-*`
  - `plugins/app-*` if needed
- Normalize bundled `@elizaos/*` dependency specs:
  - remove dist-tags like `alpha`
  - prefer exact versions for shipped runtime deps
- Add a `setup:upstreams` script that runs recursive submodule init and upstream installs/builds

### Phase 3: Remove legacy override friction

- Replace `setup-eliza-workspace` with a repo-local `setup:upstreams` path
- Update doctor output and docs to point at repo-local upstreams, not `../eliza`
- Remove or sharply reduce the hardcoded `WORKSPACE_PLUGIN_OVERRIDES` mechanism
- Keep `ELIZA_WORKSPACE_ROOT` support only for special external overrides and tests

### Phase 4: Add version and provenance controls

- Add a committed manifest, for example `upstreams.lock.json`, that records:
  - package name
  - repo URL
  - pinned commit
  - package version
  - whether Milady bundles it at release
- Add `scripts/sync-upstream-versions.mjs` to verify root exact dependency versions match local upstream package versions
- Add `scripts/check-upstream-drift.mjs` to fail CI if vendored source versions and Milady dependency specs disagree

### Phase 5: Add pack-and-test release gating

- Add `scripts/pack-upstreams.mjs` or equivalent
- Install packed artifacts into a temporary Milady release workspace
- Run the existing e2e and release checks there
- Only after that:
  - publish upstream packages
  - update any remaining exact versions if publication changed them
  - cut Milady release artifacts

### Phase 6: Reduce patch debt intentionally

- For packages now developed from local source, stop relying on `patch-deps` where possible
- Move fixes upstream into the vendored source repos first
- Keep `patch-deps` only for third-party packages or as short-lived release shims

## Files Likely to Change

Core repo wiring:

- [package.json](../../package.json)
- [.gitmodules](../../.gitmodules)
- [scripts/run-repo-setup.mjs](../../scripts/run-repo-setup.mjs)
- [scripts/setup-upstreams.mjs](../../scripts/setup-upstreams.mjs)
- new `scripts/sync-upstream-versions.mjs`
- new `scripts/check-upstream-drift.mjs`
- new `upstreams.lock.json`

Runtime and docs:

- [packages/agent/src/runtime/plugin-resolver.ts](../../packages/agent/src/runtime/plugin-resolver.ts)
- [packages/app-core/src/cli/doctor/checks.ts](../../packages/app-core/src/cli/doctor/checks.ts)
- [docs/cli/doctor.md](../../docs/cli/doctor.md)
- [docs/plugin-resolution-and-node-path.md](../../docs/plugin-resolution-and-node-path.md)
- [docs/plugins/local-plugins.md](../../docs/plugins/local-plugins.md)

Optional release tooling:

- [scripts/copy-runtime-node-modules.ts](../../scripts/copy-runtime-node-modules.ts)
- [scripts/runtime-package-manifest.ts](../../scripts/runtime-package-manifest.ts)
- [scripts/release-check.ts](../../scripts/release-check.ts)

## Risks and Mitigations

Risk: clone and bootstrap become heavy

Mitigation:

- Support `setup:upstreams --minimal` for only shipped or actively-developed packages
- Keep full recursive init for CI/release

Risk: version mismatches between local source and public npm release

Mitigation:

- Exact version pins
- `upstreams.lock.json`
- pack-and-test release lane

Risk: nested submodule pain if you reuse the existing plugin workspace directly

Mitigation:

- Treat nested workspace as transitional only
- Flatten to direct submodules once the repo-local model is stable

Risk: Bun workspace linking surprises

Mitigation:

- Ban dist-tag specs for bundled upstream packages
- Verify versions with a script in CI

Risk: public npm release still installs untested tarballs

Mitigation:

- Do not release from source-only green builds
- Require artifact-level pack-and-test gating

## What I Would Do

If I were executing this for Milady, I would do it in this order:

1. Create repo-local `plugins/` and `eliza/`
2. Make Bun workspaces authoritative
3. Pin bundled `@elizaos/*` runtime deps exactly
4. Add drift-check scripts
5. Run e2e against linked workspace sources
6. Add pack-and-test gating
7. Flatten away the old sibling-checkout assumptions

If you want the shortest migration path:

1. Bring the existing sibling `../plugins` workspace into this repo at `plugins/`
2. Add `eliza/` as a repo-local submodule
3. Wire workspaces and exact versions
4. Defer submodule flattening until after the workflow is stable

## Bottom Line

Your instinct is correct.

Milady should stop treating upstream plugin/core development as an external side path and instead make those repos first-class, repo-local inputs to the normal build, test, and package flow.

The key addition I would insist on is this:

- local-source workspaces for dev speed
- exact versions for deterministic releases
- pack-and-test for artifact fidelity

Without that third piece, you still have a gap between "what passed locally" and "what shipped."
