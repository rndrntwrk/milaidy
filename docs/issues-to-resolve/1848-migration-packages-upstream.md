# #1848 — Migration: Move milady packages into eliza plugins (thin wrapper design)

**Filed:** 2026-04-12 by RemilioNubilio
**Status recommendation:** KEEP — valid but high-risk, needs phased execution plan

## Summary

Proposal to consolidate `packages/app-core` + `packages/ui` into a single `@elizaos/app-ui` upstream package, extract plugin-shaped code from in-repo plugins to `@elizaos/plugin-*`, and split `packages/agent` into upstream vs milady-specific pieces.

## Current State (verified)

- **app-core**: 1,183 files, ~310k LOC, massive React/TypeScript app framework. 69 named exports.
- **ui**: 232 files, ~19k LOC, Radix-based component library. Zero `@miladyai` imports (no circular deps).
- **agent**: 576 files, ~231k LOC. 1,001+ imports across the monorepo — most heavily used package.
- **eliza submodule**: Contains `packages/` with core, prompts, skills, etc. **No `app-ui` package exists upstream yet** — this would be a new creation.
- **Workspaces**: Root `package.json` already declares `eliza/packages/*`, `plugins/*`, `packages/app-core`, `packages/ui`
- **All `@elizaos/*` deps**: Already `workspace:*` (local resolution)
- **plugins/**: 20+ submodules already exist (orchestrator, anthropic, discord, etc.)
- **Capacitor plugins**: 11 native plugins in `apps/app/plugins/` (agent, camera, canvas, desktop, gateway, location, mobile-signals, screencapture, swabble, talkmode, websiteblocker)
- **Thin-wrapper pattern already exists**: `packages/agent` is published as both `@miladyai/agent` and `@elizaos/agent` — migration can follow this pattern

## Integration Assessment

### Phase 1: Consolidate app-core + ui → @elizaos/app-ui upstream
- **Blast radius**: ~312 direct `from "@miladyai/app-core"` imports + ~194 `from "@miladyai/ui"` imports (506 total)
- **Combined size**: 1,415 files, ~329k LOC to move
- **Mechanical work**: Large but straightforward rename. Since `eliza` is a submodule, both sides change in one PR
- **Risk**: HIGH — 329k LOC move. Merge conflicts with any parallel work. Build system changes.
- **Estimated effort**: 2-3 weeks for one engineer, plus 1 week stabilization

### Phase 2: Extract src/plugins/* to @elizaos/plugin-*
- **Scope**: plugin-custom-rtmp (in `packages/agent/src/plugins/`), discord-voice-capability
- **Note**: plugin-telegram-enhanced and plugin-opinion are NOT in `src/plugins/` as the issue claims — they may be upstream or not exist
- **Risk**: LOW-MEDIUM — limited scope
- **Estimated effort**: 3-5 days

### Phase 3: Split packages/agent
- **Scope**: Extract eliza-shaped primitives, keep milady orchestration. 1,001+ imports to audit.
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
6. **Capacitor plugins**: 11 native plugins in `apps/app/plugins/*` depend on app-core — need careful handling
7. **CRITICAL BLOCKER — `character-catalog.ts`**: Cross-package filesystem import directly reads from `apps/app/characters/` — breaks encapsulation, must be refactored before migration
8. **14 Milady-specific code patterns**: `docs/ui-migration-audit.md` (2026-03-22) identifies HIGH PRIORITY items that must be extracted first: window global injection, client monkey-patches, branding aliases
9. **Issue inaccuracies**: References `packages/autonomous/` (doesn't exist — it's `packages/agent/`), claims `src/plugins/` contains telegram-enhanced and opinion (they don't), says 9 Capacitor plugins (there are 11)

## Preconditions (must complete before starting)

1. Complete W16 sprint and stabilize plugin workspace (#1804-#1815)
2. Address HIGH PRIORITY items from `docs/ui-migration-audit.md`:
   - Extract window global injection system
   - Remove client monkey-patches
   - Abstract 14 Milady-specific code patterns in app-core
3. Refactor `character-catalog.ts` cross-package filesystem import
4. Establish e2e test coverage for app-core surface (currently missing)

## Recommendation

Valid long-term direction, but should NOT start until preconditions are met. The issue body contains several inaccuracies about current codebase state that suggest it was written from an older snapshot. Sequence should be: finish W16 → address ui-migration-audit items → then execute this migration as a dedicated 6-8 week effort.
