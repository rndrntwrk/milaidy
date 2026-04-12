# W16 Runtime Sprint — Detailed Research Report

**Sprint:** Apr 13-17, 2026
**Theme:** Plugin workspace architecture + runtime polish
**Sprint goal:** Repo-local source development for @elizaos/* packages works end-to-end.

---

## #1804 — [P0] Plugin workspace Phase 1: repo-local source layout

### Summary
Add `eliza/` and `plugins/` as first-class submodules. Populate `plugins/package.json` with workspaces. Wire `bun run setup:upstreams` to do recursive init + upstream builds. Must not break `bun run clean`.

### Integration Analysis
- **Scope:** Repo layout, git submodules, build system
- **Key files:**
  - `.gitmodules` — submodule definitions
  - Root `package.json` — workspace config
  - `scripts/setup-upstreams.mjs` — upstream initialization
  - `scripts/init-submodules.mjs` — submodule init
  - `CLAUDE.md` — NODE_PATH documentation
- **DoD:** Fresh-clone test: `git clone -> submodule init -> bun install -> bun run dev` works

### Weaknesses & Risks
- **CRITICAL: Breaking change for all developers.** If submodule init is wrong, nobody can clone and build. Fresh-clone verification is mandatory.
- **HIGH: Submodule complexity.** Git submodules are notoriously finicky. Nested submodules (eliza has its own submodules) compound the problem.
- **HIGH: Build order dependency.** Upstream packages must build before downstream consumers. `bun run clean` must not delete vendored source.
- **MEDIUM: `setup:upstreams` reliability.** The script must handle partial states (already cloned, dirty worktree, missing deps).
- **LOW: Desktop track coordination.** Desktop track holds workspace changes until Wed PM; this must land first.

### Work Involved
- **Estimated:** 6 story points (XL), 2 engineers, ~3 days
- Add eliza/ and plugins/ as submodules (Day 1)
- Configure plugins/package.json workspaces (Day 1)
- Wire setup:upstreams for recursive init + builds (Day 2)
- Fix clean script to not break vendored source (Day 2)
- Fresh-clone verification on clean machine (Day 3)

### Verdict: KEEP — Foundational. Blocks Phase 2 (#1805) and all downstream runtime work.

---

## #1805 — [P0] Plugin workspace Phase 2: Bun workspaces + exact-version pins

### Summary
Extend root `package.json` workspaces to include `eliza/packages/*` and `plugins/plugin-*`. Replace all `@elizaos/*` alpha dist-tag specs with exact versions matching vendored source. Delete `WORKSPACE_PLUGIN_OVERRIDES` when normal resolution works.

### Integration Analysis
- **Scope:** Package resolution, dependency management
- **Key files:**
  - Root `package.json` — workspaces array
  - All `package.json` files with `@elizaos/*` dependencies
  - `packages/agent/src/runtime/plugin-resolver.ts` — `WORKSPACE_PLUGIN_OVERRIDES`
  - NODE_PATH setup (must keep in all 3 locations per CLAUDE.md)
- **Dependency:** Phase 1 (#1804) must land first

### Weaknesses & Risks
- **CRITICAL: Must verify Bun workspace linking.** If Bun resolves from its cache instead of vendored tree, builds silently use wrong versions.
- **HIGH: NODE_PATH interaction.** Exact-version pins + workspaces + NODE_PATH must all agree. Wrong order = runtime resolution failures.
- **HIGH: WORKSPACE_PLUGIN_OVERRIDES removal.** This is a narrow hardcoded override — removing it assumes workspace linking works perfectly. Needs a dead-code flag fallback initially.
- **MEDIUM: CI/CD impact.** Changing package resolution affects CI builds. Must verify CI stays green.

### Work Involved
- **Estimated:** 6 story points (XL), 1 engineer, ~3 days
- Extend workspaces in root package.json (Day 1)
- Replace alpha specs with exact versions (Day 1-2)
- Verify Bun workspace linking resolves to vendored tree (Day 2)
- Remove/flag WORKSPACE_PLUGIN_OVERRIDES (Day 2)
- CI verification (Day 3)

### Verdict: KEEP — Critical. Enables all downstream plugin development.

---

## #1806 — [P0] Pack-and-test scaffold (Phase 5 minimal)

### Summary
Create `scripts/pack-upstreams.mjs` and `scripts/check-upstream-drift.mjs`. Callable locally with clear green/red verdict. Close the "source passed but tarball ships" gap for at least `@elizaos/core` and `@elizaos/plugin-agent-orchestrator`.

### Integration Analysis
- **Scope:** New build verification scripts
- **Key files:**
  - `scripts/pack-upstreams.mjs` (to be created)
  - `scripts/check-upstream-drift.mjs` (to be created)
  - `docs/plugin-resolution-and-node-path.md` — documentation target
- **Dependency:** Phase 2 (#1805) exact-version pins must exist

### Weaknesses & Risks
- **MEDIUM: Source-vs-tarball divergence.** The core problem (local source passes tests but published tarball breaks) is subtle. Detection script must be thorough.
- **LOW: Local-only scope.** Not wired into CI this sprint — reduces blast radius.
- **LOW: Well-scoped.** Two scripts with clear success criteria.

### Work Involved
- **Estimated:** 4 story points (M), 1 engineer, ~2 days
- Implement pack-upstreams.mjs (Day 1)
- Implement check-upstream-drift.mjs (Day 1-2)
- Test against core + orchestrator packages (Day 2)
- Document in plugin-resolution docs

### Verdict: KEEP — Important safety net for release quality

---

## #1807 — [P0] Proof of life — one plugin + one core from vendored source

### Summary
Demonstrate end-to-end: edit vendored source for `plugins/plugin-agent-orchestrator` and `eliza/packages/core`, run `bun run dev`, change is picked up without node_modules surgery, test passes.

### Integration Analysis
- **Scope:** Verification / documentation
- **Key files:**
  - `plugins/plugin-agent-orchestrator/` — test plugin
  - `eliza/packages/core/` — test core package
  - `docs/plugin-resolution-and-node-path.md` — documentation target
- **Dependencies:** Phase 1 (#1804) and Phase 2 (#1805)

### Weaknesses & Risks
- **LOW: Verification-only.** This is a proof that Phase 1+2 work. If they don't, this issue surfaces the failure.
- **MEDIUM: Hot-reload expectations.** "Change picked up with no node_modules surgery" may require Bun workspace linking to work perfectly.

### Work Involved
- **Estimated:** 3 story points (M), 2 engineers, ~1.5 days
- Make test edit to orchestrator plugin (Day 1)
- Make test edit to core package (Day 1)
- Verify dev loop works (Day 1-2)
- Write up in docs with screen recording or step-by-step (Day 2)

### Verdict: KEEP — Validates the entire plugin workspace effort

---

## #1808 — [P1] Orchestrator consolidation — test + type coverage

### Summary
Consolidate 6 scattered orchestrator/coordinator commits from the last 14 days. Ensure integration test coverage, failover prompt sanitization tests, type surface has no unexplained `any`, and CLAUDE.md is updated.

### Integration Analysis
- **Scope:** Test + type hardening for existing code
- **Key commits to consolidate:**
  - `b8e582054` — coordinator runtime orchestration
  - `cee49af92` — orchestrator graph coordination
  - `239092877` — orchestrator failover prompt sanitization
  - `e5d408cef` — coordinator audit gaps
  - `c68b4e002` — type coordinator compatibility surface
  - `7ed528829` — coordinator channel preflight
- **Key files:** Orchestrator/coordinator code in `packages/agent/`

### Weaknesses & Risks
- **MEDIUM: Large surface area.** 6 commits across coordinator/orchestrator is significant to test.
- **LOW: No new features.** This is hardening existing code, low risk of breaking changes.
- **MEDIUM: Type surface debt.** `c68b4e002` may have `any` types that are hard to eliminate without understanding full flow.

### Work Involved
- **Estimated:** 4 story points (M), 1 engineer, ~2 days
- Integration test for coordinator happy path (Day 1)
- Failover prompt sanitization test (Day 1)
- Type audit of c68b4e002 (Day 2)
- Update CLAUDE.md Parallax section if needed (Day 2)

### Verdict: KEEP — Important test coverage for recent rapid-fire changes

---

## #1809 — [P1] Action callback streaming — optional merge metadata

### Summary
Extend `HandlerCallback` content with optional `merge?: "append" | "replace"` metadata. Default stays as today. Provide one real plugin adoption example.

### Integration Analysis
- **Scope:** Runtime API extension
- **Key files:**
  - `packages/agent/src/api/chat-routes.ts` — `HandlerCallback` and `replaceCallbackText`
  - `docs/runtime/action-callback-streaming.md` — documentation
  - One plugin to adopt the new metadata (example)
- **Follow-up #1 from** `docs/runtime/action-callback-streaming.md`

### Weaknesses & Risks
- **MEDIUM: API contract change.** Adding optional metadata to `HandlerCallback` must be backward-compatible. All existing plugins must keep working with no changes.
- **LOW: Well-scoped.** One optional field, one adoption example.

### Work Involved
- **Estimated:** 3 story points (M), 1 engineer, ~1.5 days
- Add `merge` field to HandlerCallback type (Day 1)
- Implement merge logic in chat-routes.ts (Day 1)
- Adopt in one real plugin (Day 2)
- Update docs (Day 2)

### Verdict: KEEP — Clean API improvement, enables richer plugin callbacks

---

## #1810 — [P1] Cut patch-deps.mjs by ~half

### Summary
For every package now developed from local source (per Phase 1/2), delete its patch block from `scripts/patch-deps.mjs` and move the fix upstream into the vendored repo. Target: under ~310 lines or each remaining patch has a documented reason.

### Integration Analysis
- **Scope:** Build system cleanup
- **Key files:**
  - `scripts/patch-deps.mjs` — currently ~618 lines per issue title
  - Vendored upstream packages under `eliza/`
- **Constraint:** Packages not moved to local source stay patched
- **Dependency:** Phase 1 (#1804) and Phase 2 (#1805)

### Weaknesses & Risks
- **MEDIUM: Breaking bun install.** Removing a patch that's still needed will break resolution. Each removal must be verified individually.
- **MEDIUM: Upstream fix quality.** Moving fixes "upstream" into vendored repo means those fixes must be proper (not just patch hacks).
- **LOW: Clear rollback.** Git revert is straightforward if a patch removal breaks things.

### Work Involved
- **Estimated:** 3 story points (M), 1 engineer, ~1.5 days
- Identify patches for now-local packages (Day 1)
- Move fixes to vendored source, delete patch blocks (Day 1-2)
- Verify bun install stays green after each removal (Day 2)

### Verdict: KEEP — Reduces build system complexity and patch maintenance burden

---

## #1811 — [P2] scripts/sync-upstream-versions.mjs

### Summary
Script to verify root exact dependency versions match local upstream package versions; fail loudly on drift. CI wiring is stretch; local CLI is MVP.

### Integration Analysis
- **Scope:** New build verification script
- **Key files:**
  - `scripts/sync-upstream-versions.mjs` (to be created)
  - Root `package.json` and vendored `package.json` files
- **Dependency:** Phase 2 (#1805) exact-version pins

### Weaknesses & Risks
- **LOW: Simple verification script.** Reads two sets of package.json files and compares versions. Low complexity.
- **LOW: Local-only MVP.** CI wiring is stretch, so blast radius is minimal.

### Work Involved
- **Estimated:** 2 story points (S stretch), 1 engineer, ~1 day
- Implement version comparison logic
- Clear green/red output format
- Stretch: CI integration

### Verdict: KEEP — Simple, useful, prevents version drift

---

## #1812 — [P2] Doctor + docs refresh for new repo-local workflow

### Summary
Update doctor checks, plugin-resolution docs, and local-plugins docs to describe the new repo-local workflow as default. Remove references to optional sibling `../eliza`.

### Integration Analysis
- **Scope:** Documentation + CLI doctor checks
- **Key files:**
  - `packages/app-core/src/cli/doctor/checks.ts` — doctor diagnostic checks
  - `docs/cli/doctor.md`
  - `docs/plugin-resolution-and-node-path.md`
  - `docs/plugins/local-plugins.md`
- **Dependencies:** Phase 1 (#1804), Phase 2 (#1805), and Proof of life (#1807) must land first

### Weaknesses & Risks
- **LOW: Documentation work.** Minimal code risk.
- **LOW: Doctor checks.** Small changes to diagnostic output.

### Work Involved
- **Estimated:** 2 story points (S stretch), 1 engineer, ~1 day
- Update all referenced docs
- Update doctor checks to verify new layout
- Remove sibling `../eliza` references

### Verdict: KEEP — Necessary to complete the plugin workspace story

---

## #1813 — [P2] Action callback — persistence of intermediate statuses (design spike)

### Summary
Design spike only — propose a small schema change for persisting progressive status lines so reloading a conversation doesn't lose the progressive trail.

### Integration Analysis
- **Scope:** Design document only (no implementation)
- **Key files:**
  - `docs/runtime/action-callback-streaming.md` — target for design doc (Future/roadmap section)
- **Deliverable:** Decision doc, no code

### Weaknesses & Risks
- **LOW: Design-only.** No risk to existing code.
- **MEDIUM: Design quality.** Design spike is only useful if it considers real constraints (DB schema, SSE streaming, UI rendering).

### Work Involved
- **Estimated:** 2 story points (S stretch), 1 engineer, ~1 day
- Review current streaming architecture
- Propose schema change in docs
- Consider DB storage, query, and rendering implications

### Verdict: KEEP — Low-risk stretch item, informs future #1818
