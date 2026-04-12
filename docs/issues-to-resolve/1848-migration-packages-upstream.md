# #1848 — Migration: Move milady packages into eliza plugins (thin wrapper design)

**Filed:** 2026-04-12 by RemilioNubilio
**Status recommendation:** KEEP — valid but high-risk, needs phased execution plan

## Summary

Proposal to consolidate `packages/app-core` + `packages/ui` into a single `@elizaos/app-ui` upstream package, extract plugin-shaped code from in-repo plugins to `@elizaos/plugin-*`, and split `packages/agent` into upstream vs milady-specific pieces.

## Current State (verified)

- **app-core**: 1,183 files, ~310k LOC, massive React/TypeScript app framework
- **ui**: ~42 files, ~3k LOC, Radix-based component library
- **eliza submodule**: Already contains `packages/` with core, prompts, skills, etc. No `app-ui` package yet.
- **Workspaces**: Root `package.json` already declares `eliza/packages/*`, `plugins/*`, `packages/app-core`, `packages/ui`
- **All `@elizaos/*` deps**: Already `workspace:*` (local resolution)
- **plugins/**: 20+ submodules already exist (orchestrator, anthropic, discord, etc.)

## Integration Assessment

### Phase 1: Consolidate app-core + ui → @elizaos/app-ui upstream
- **Blast radius**: ~656 imports from `@miladyai/app-core`, ~63 from `@miladyai/ui` — all internal
- **Mechanical work**: Large but straightforward rename. Since `eliza` is a submodule, both sides change in one PR
- **Risk**: HIGH — 310k LOC move. Merge conflicts with any parallel work. Build system changes.
- **Estimated effort**: 2-3 weeks for one engineer, plus 1 week stabilization

### Phase 2: Extract src/plugins/* to @elizaos/plugin-*
- **Scope**: plugin-telegram-enhanced, plugin-opinion, plugin-signal, plugin-custom-rtmp
- **Risk**: MEDIUM — clean Plugin shape already, mainly packaging work
- **Estimated effort**: 1 week

### Phase 3: Split packages/agent
- **Scope**: Extract eliza-shaped primitives, keep milady orchestration
- **Risk**: HIGH — the agent package is deeply coupled to milady-specific services
- **Estimated effort**: 2-3 weeks

### Phase 4: Final rebrand + cleanup
- **Risk**: LOW — editorial
- **Estimated effort**: 1 week

## Weaknesses & Risks

1. **Parallel work conflict**: With W16 sprint actively touching the same files, starting Phase 1 now would create massive merge conflicts
2. **No rollback path**: Once app-core moves upstream, reverting requires undoing the submodule change across both repos
3. **Upstream ownership**: Moving code into elizaOS means upstream PRs for milady-specific UI changes
4. **Testing gap**: No e2e tests covering the full app-core surface — hard to validate the migration didn't break anything
5. **Build system**: tsdown + Vite pipeline needs reconfiguration for the new package layout
6. **Capacitor plugins**: 9 native plugins in `apps/app/plugins/*` depend on app-core — need careful handling

## Recommendation

Valid long-term direction, but should NOT start until W16 sprint completes and the plugin workspace architecture (Phases 1-4 in #1804-#1815) is stable. Sequence should be: finish plugin workspace → stabilize → then tackle this migration. Current priority should be desktop stability and plugin workspace, not a massive reorg.
