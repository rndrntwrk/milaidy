# Beyond-Sprint: Plugin Workspace Phases 3-6 — Issues #1814-#1817

**Priority:** Beyond current sprint
**Theme:** Plugin workspace architecture maturation
**Status recommendation:** ALL VALID — future work after W16 stabilizes

---

## #1814 — Phase 3: Remove legacy override friction

### Current State
- `WORKSPACE_PLUGIN_OVERRIDES` still exists in `packages/agent/src/runtime/plugin-resolver.ts`
- Also referenced in docs: `docs/plans/2026-04-05-plugin-workspace-architecture-review.md`, `docs/cli/environment.md`, `docs/plugins/local-plugins.md`, `test/scripts/discord-runtime-roundtrip-live.ts`
- `setup-eliza-workspace` still referenced in codebase

### Integration Work
- Replace `setup-eliza-workspace` with repo-local `setup:upstreams` path
- Remove or reduce `WORKSPACE_PLUGIN_OVERRIDES` mechanism
- Update doctor output and docs
- Keep `ELIZA_WORKSPACE_ROOT` only for special external overrides

### Estimated Effort
- 2-3 days for one engineer
- Low risk — mostly cleanup

### Dependencies
- Needs W16 P0-1 and P0-2 stable (which they are now)

---

## #1815 — Phase 4: Version and provenance controls (upstreams.lock.json)

### Current State
- No `upstreams.lock.json` exists yet
- `scripts/sync-upstream-versions.mjs` doesn't exist (related to #1811)
- `scripts/check-upstream-drift.mjs` doesn't exist

### Integration Work
- Committed manifest recording: package name, repo URL, pinned commit, version, bundle status
- Hardened `sync-upstream-versions.mjs` (beyond W16 MVP from #1811)
- CI check for vendored-source vs dependency-spec drift

### Estimated Effort
- 3-4 days for one engineer
- Medium complexity — CI integration and version resolution logic

### Risks
- Version pinning across submodules + workspace:* can get complex
- Need to handle packages that are both workspace-linked and published

---

## #1816 — Phase 5 full: Pack-and-test release gating in CI

### Current State
- No pack-and-test infrastructure exists yet (W16 #1806 creates the scaffold)
- CI workflows in `.github/workflows/`

### Integration Work
- Pack each changed upstream package from vendored checkout
- Install Milady against packed artifacts (not workspace links)
- Run e2e against packed artifacts
- Wire into CI as release gate

### Estimated Effort
- 1 week for one engineer
- High complexity — CI pipeline changes, artifact management

### Risks
- Bun workspace:* resolution may behave differently than packed tarballs
- CI time increase for every PR that touches upstream packages
- Need to handle the workspace:* → packed artifact switchover cleanly

---

## #1817 — Phase 6: Reduce patch-deps debt to zero

### Current State
- `scripts/patch-deps.mjs` is **743 lines** (issue incorrectly states 618)
- W16 #1810 targets cutting to ~310 lines
- This issue targets driving remaining to zero for locally-developed packages

### Integration Work
- For every remaining patch: move fix upstream or document why it must stay
- Patches only remain for genuinely third-party packages
- Verify clean install after each patch removal

### Estimated Effort
- 3-5 days
- Depends heavily on which patches can actually be moved upstream

### Risks
- Some patches may be for transitive dependencies not in vendored source
- Upstream repos may not accept all fixes
