# W16 Runtime Parallel Sprint — Issues #1804-#1813

**Sprint:** W16 (Apr 13-17, 2026)
**Theme:** Plugin workspace architecture + runtime stabilization
**Status recommendation:** CLOSE #1804 and #1805 (already done); rest VALID

---

## #1804 — Plugin workspace Phase 1: repo-local source layout (P0, 6pts)

### RECOMMEND: CLOSE — Already completed

### Evidence
- `eliza/` submodule exists: `f1968a4edd` (v2.0.0-alpha.82 + 250 commits)
- `plugins/` directory has 20+ plugin submodules (agent-orchestrator, anthropic, discord, coding-agent, etc.)
- Root `package.json` workspaces already include `eliza/packages/*` and `plugins/*`
- `scripts/setup-upstreams.mjs` referenced in CLAUDE.md as operational
- Fresh-clone workflow documented

---

## #1805 — Plugin workspace Phase 2: Bun workspaces + exact-version pins (P0, 6pts)

### RECOMMEND: CLOSE — Already completed

### Evidence
- All 35 `@elizaos/*` dependencies in root `package.json` use `workspace:*` (not alpha dist-tags)
- `eliza/packages/*` in workspaces means Bun resolves to vendored source
- Remaining alpha dist-tags: only `@elizaos/prompts: 2.0.0-alpha.115` and `@elizaos/skills: 2.0.0-alpha.115` (these packages may not be in the vendored tree)
- `WORKSPACE_PLUGIN_OVERRIDES` still exists in `packages/agent/src/runtime/plugin-resolver.ts` — but the workspace:* approach supersedes it

### Partial gap
- `WORKSPACE_PLUGIN_OVERRIDES` should be removed (was a DoD item). Could be a quick follow-up.

---

## #1806 — Pack-and-test scaffold (P0, 4pts)

### Current State
- **scripts/pack-upstreams.mjs** does NOT exist yet
- **scripts/check-upstream-drift.mjs** does NOT exist yet
- These are the key deliverables for this issue

### Integration Work
- Create `scripts/pack-upstreams.mjs` — pack each changed upstream package from vendored checkout
- Create `scripts/check-upstream-drift.mjs` — fail if vendored versions != dependency specs
- Target at least `@elizaos/core` and `@elizaos/plugin-agent-orchestrator`
- Document in `docs/plugin-resolution-and-node-path.md`

### Risks
- Bun pack behavior may differ from npm pack — need careful testing
- May need to handle workspace:* → version resolution

---

## #1807 — Proof of life: one plugin + one core package from vendored source (P0, 3pts)

### Current State
- `plugins/plugin-agent-orchestrator` already exists as submodule
- `eliza/packages/typescript` (core) exists in vendored tree
- Workspace:* links should already make edits pick up without node_modules surgery

### Integration Work
- Demonstrate: edit source → `bun run dev` → change picked up → test passes
- Document in `docs/plugin-resolution-and-node-path.md`
- Screen-recording or step-by-step in PR

### Risks
- LOW — may already work, just needs verification and documentation

---

## #1808 — Orchestrator consolidation: test + type coverage (P1, 4pts)

### Current State
- 6 scattered orchestrator/coordinator commits over last 14 days
- Code in `packages/agent/src/runtime/` for orchestrator
- Plugin at `plugins/plugin-agent-orchestrator`

### Integration Work
- Integration test for coordinator runtime orchestration happy path
- Failover prompt sanitization explicit test coverage
- Audit type surface — no `any` without explanation
- Update CLAUDE.md if invariants changed

### Risks
- MEDIUM — scattered commits may have conflicting assumptions
- Orchestrator touches multiple runtime entry points

---

## #1809 — Action callback streaming: optional merge metadata (P1, 3pts)

### Current State
- `docs/runtime/action-callback-streaming.md` documents current behavior
- `replaceCallbackText` and `preCallbackText` implemented in `chat-routes.ts`
- Roadmap section mentions optional metadata for "append" vs "replace" — not yet implemented

### Integration Work
- Extend `HandlerCallback` content with `merge?: "append" | "replace"` metadata
- Default stays as today (status = replace, tokens = append)
- One real plugin adoption example

### Risks
- LOW — additive, backwards-compatible
- Plugin contract explicitly states no Milady-specific APIs — this may violate that

---

## #1810 — Cut patch-deps.mjs by ~half (P1, 3pts)

### Current State
- **`scripts/patch-deps.mjs` is 743 lines** (issue says 618 → ~310, but it's grown)
- Target: under ~310 lines or each remaining patch documented
- For each locally-developed package, delete its patch block and move fix upstream

### Integration Work
- Audit each patch block — which packages are now workspace:* resolved?
- Move fixes upstream into vendored repos
- Delete corresponding patch blocks
- Verify `bun install` stays green

### Risks
- MEDIUM — removing patches without verifying upstream fix could break installs
- Some patches may be for packages not yet in vendored source

---

## #1811 — scripts/sync-upstream-versions.mjs (P2 stretch, 2pts)

### Current State
- Script does NOT exist yet
- Depends on #1805 (exact-version pins) — which is done via workspace:*

### Integration Work
- Create script to verify root dep versions match local upstream package.json versions
- CI wiring is stretch; local CLI is MVP

### Risks
- LOW — tooling only, no runtime impact

---

## #1812 — Doctor + docs refresh for new repo-local workflow (P2 stretch, 2pts)

### Current State
- `packages/app-core/src/cli/doctor/checks.ts` exists with tests
- `docs/plugin-resolution-and-node-path.md` is comprehensive but references old workflow
- `docs/plugins/local-plugins.md` may reference sibling `../eliza`

### Integration Work
- Update doctor checks for new repo-local workflow
- Update docs to describe workspace:* as default
- Remove references to optional sibling `../eliza`

### Risks
- LOW — documentation + diagnostics only

---

## #1813 — Action callback persistence design spike (P2 stretch, 2pts)

### Current State
- `docs/runtime/action-callback-streaming.md` § Future/roadmap lists persistence as follow-up #2
- Currently only final text persists; intermediate statuses lost on reload

### Integration Work
- Design spike only — propose schema change
- Append decision doc to the streaming doc
- No implementation

### Risks
- LOW — design only, no code changes
