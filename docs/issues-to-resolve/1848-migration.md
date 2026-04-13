# #1848 — Migration: Move milady packages into eliza plugins

## Summary

**New direction (from Shaw):** Consolidate `@elizaos/app-core` + `@elizaos/app-core` into a single `@elizaos/app-ui` package and move it upstream into `elizaOS/eliza`. This reverses the earlier "stay in milady" path. Since eliza is a git submodule of milady, both sides of the rename are controlled in lockstep.

## Proposed Phases

1. **Phase 1 (most disruptive):** Merge `packages/app-core` + `packages/ui` into `@elizaos/app-ui` upstream. Every later phase consumes from the new upstream package.
2. **Phase 2:** Extract plugin-shaped code from `src/plugins/*` (opinion, telegram-enhanced, signal, custom-rtmp) to `@elizaos/plugin-*` upstream.
3. **Phase 3:** Split `packages/autonomous` into eliza services. Eliza-shaped pieces go upstream; milady-specific pieces (wallet, training, dashboard API, gateway bridge) concentrate into a thinner residual.
4. **Phase 4:** Final rebrand, shim cleanup, package.json overrides dropped, docs + install script updated, cut release.

## Integration Analysis

### Current Package Landscape
- `packages/app-core/` — Main application package (runtime source of truth). ~500+ files spanning CLI, runtime, API, config, connectors, services, components.
- `packages/ui/` — Shared UI component library. Design primitives.
- `packages/agent/` — Upstream elizaOS agent with core plugins.
- `packages/shared/` — Shared utilities.
- `packages/plugin-wechat/` — WeChat connector plugin.

### Key Dependencies
- Milady already consumes 40+ `@elizaos/plugin-*` deps
- `@elizaos/core` is the runtime foundation
- `@elizaos/plugin-agent-orchestrator` is bundled via submodule
- `eliza.ts` runtime bridge in `packages/app-core/src/runtime/eliza.ts`

## Weaknesses & Risks

### CRITICAL RISKS
1. **Phase 1 is massively disruptive.** `packages/app-core` is the heart of the application — it contains CLI, runtime, API, config, connectors, services, AND UI components. Merging this with `packages/ui` into a single upstream package is a major reorganization that touches nearly every import path.
2. **Upstream merge conflicts.** Moving packages into `elizaOS/eliza` means milady patches to `app-core` now become PRs to upstream. This slows iteration speed significantly for app-specific changes.
3. **Boundary definition.** The line between "generic elizaOS app-ui" and "milady-specific UI" is not clearly defined. Components like `CompanionHeader`, `VrmViewer`, `BabylonTerminal` are milady-specific — do they move upstream?

### HIGH RISKS
4. **Phase 3 `packages/autonomous` split.** This package likely has tight coupling between "eliza-shaped" and "milady-specific" code. Splitting requires understanding every dependency edge.
5. **Build system complexity.** Moving packages upstream while maintaining the submodule workflow means builds now span two repos with synchronized versions.
6. **Import path churn.** Every file that imports from `@elizaos/app-core` or `@elizaos/app-core` needs updating. This is hundreds of files.

### MEDIUM RISKS
7. **Plugin extraction (Phase 2).** Plugin-shaped code in `src/plugins/*` may have milady-specific assumptions (config paths, env vars, API endpoints) that don't generalize.
8. **Release coordination.** Cutting a release now requires synchronized versions across milady and eliza repos.

## Work Involved

| Phase | Estimated Effort | Risk Level |
|-------|-----------------|------------|
| Phase 1 (app-core + ui merge) | XXL (15-20 pts, 1-2 weeks) | Critical |
| Phase 2 (plugin extraction) | L (6-8 pts, 3-4 days) | Medium |
| Phase 3 (autonomous split) | XL (8-12 pts, 1 week) | High |
| Phase 4 (rebrand + cleanup) | M (4-5 pts, 2-3 days) | Low |
| **Total** | **~35-45 pts, 3-5 weeks** | |

## Recommendation

**KEEP but with strong caveats:**

1. **Do NOT start Phase 1 during W16.** The plugin workspace work (#1804-#1807) must stabilize first. Starting a major package reorganization while the workspace architecture is still being built is a recipe for catastrophic merge conflicts.

2. **Phase 1 needs a detailed migration plan** with:
   - Exact list of what moves upstream vs stays in milady
   - Import path migration script (automated, not manual)
   - Backward-compatibility shim strategy for transition period
   - CI verification at each step

3. **Consider whether Phase 1 is truly necessary.** The benefit (upstream contribution, shared app-ui) must outweigh the cost (weeks of churn, slower milady-specific iteration). An alternative: keep app-core in milady but extract only genuinely generic components to upstream.

4. **This conflicts with the W16 plugin workspace track.** Issues #1804-#1807 assume `packages/app-core` stays in milady. If #1848 reverses that, much of the W16 workspace work would need to be rethought.

## Verdict: KEEP — Valid architectural direction. Must be sequenced after W16 plugin workspace stabilizes. Needs detailed migration plan before any implementation begins.
