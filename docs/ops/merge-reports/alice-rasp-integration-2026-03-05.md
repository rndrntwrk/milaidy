# Alice/Rasp Integration Report (2026-03-05)

## Scope

- Repository: `milaidy`
- Target branch update: `alice`
- Imported branch: `rasp`
- Refresh source for `rasp`: `origin/main`
- History strategy: merge

## Safety and Rollback Points

- Alice safety branch: `codex/alice-pre-rasp-integration-2026-03-05`
- Alice safety snapshot commit: `f4505c4f`
- Rasp refresh merge commit: `c3cefed8`
- Integration branch: `codex/alice-merge-rasp-2026-03-05`
- Integration worktree: `/tmp/milaidy-alice-merge-rasp-2026-03-05`

## Branch Actions Performed

1. Fetched remotes and reconfirmed branch topology before integration.
2. Preserved the dirty Alice worktree on a dedicated safety branch with a WIP snapshot commit.
3. Refreshed `rasp` by merging `origin/main` and validated the result before using it as the import source.
4. Created a separate integration worktree from the Alice safety branch to avoid contaminating the original worktree.
5. Merged `rasp` into the integration branch with `--no-ff`.

## Conflict Ownership Decisions

### Alice-kept files

- `src/api/server.ts`
- `src/runtime/eliza.ts`
- `apps/app/src/AppContext.tsx`
- `apps/app/src/components/ChatView.tsx`
- `apps/app/src/components/PluginsView.tsx`
- `apps/app/src/api-client.ts`
- `scripts/release-check.ts`
- `src/services/app-manager.ts`

These were kept on the Alice side to preserve:

- canonical `ARCADE555_*` and `/api/arcade555/*` ownership
- Release B defaults and legacy alias gating
- `surface555-*` runtime naming
- pinned `@rndrntwrk/plugin-555arcade` and `@rndrntwrk/plugin-555stream`
- Alice operator UX and managed-app behavior

### Rasp-kept files

- `apps/app/src/App.tsx`
- `apps/app/src/components/Nav.tsx`
- `apps/app/src/components/AdvancedPageView.tsx`
- `apps/app/src/components/OnboardingWizard.tsx`
- `src/api/permissions-routes.ts`
- `src/config/config.ts`
- `src/services/sandbox-manager.ts`
- `apps/app/src/navigation.ts`

These were kept on the Rasp side to retain:

- autonomy/governance shell updates
- permissions and sandbox hardening
- app-shell and onboarding changes from the Rasp line

### Manual reconciliations

- `.gitignore`
  - kept Alice ignores and added Rasp ignore coverage for autonomy/electron outputs
- `package.json`
  - merged scripts, dependencies, overrides, and pinned plugin references
  - explicitly preserved immutable arcade and stream plugin refs
  - preserved Alice canonical guard and release-check flow
  - preserved Rasp autonomy and docs scripts
- `vitest.config.ts`
  - retained Rasp structure and restored the Alice Telegram stub alias
- `scripts/check-arcade555-canonical.mjs`
  - made the guard worktree-safe by scanning sibling `arcade-plugin` source when present and falling back to the installed package source
- `src/config/config.ts`
  - restored `loadMilaidyConfig` and `saveMilaidyConfig` aliases required by Alice runtime/server imports
- `apps/app/src/components/SaveCommandModal.tsx`
  - fixed broken closing tag from merge fallout
- `apps/app/src/components/ChatView.tsx`
  - guarded the quick-layer window listener for non-browser test environments
- `apps/app/src/components/CustomActionsPanel.tsx`
  - defaulted `plugins` to `[]` and guarded window usage in docked quick-layer dispatch

## Validation Performed

### Canonicalization and release gates

- `node scripts/check-arcade555-canonical.mjs`
- `npm_config_cache=/tmp/milaidy-npm-cache bun run release:check`
- direct import smoke:
  - `@rndrntwrk/plugin-555arcade`
  - `@rndrntwrk/plugin-555arcade/mastery`
  - `@rndrntwrk/plugin-555stream`

### Alice regression slice

- `bunx vitest run apps/app/test/app/chat-quick-layers.test.ts --environment jsdom`
- `bunx vitest run apps/app/test/app/startup-chat.e2e.test.ts apps/app/test/app/pages-navigation-smoke.e2e.test.ts`
- `bunx vitest run src/runtime/custom-actions.test.ts src/runtime/surface555-capability-routing.test.ts src/api/openapi/spec.test.ts src/api/__tests__/five55-mastery-routes.test.ts src/plugins/five55-games/index.test.ts`
- `bunx vitest run apps/app/test/app/plugins-view-arcade555-operator-controls.test.ts apps/app/test/app/plugins-view-stream555-operator-controls.test.ts apps/app/test/app/plugins-view-toggle-restart.test.ts apps/app/test/app/plugin-bridge.test.ts --environment jsdom`

### Rasp regression slice

- `bunx vitest run src/api/autonomy-routes.test.ts src/api/identity-routes.test.ts src/api/permissions-routes.test.ts src/api/memory-routes.test.ts src/api/agent-admin-routes.test.ts`
- `bunx vitest run src/api/__tests__/metrics-endpoint.test.ts src/api/__tests__/identity-memory-routes.test.ts src/api/__tests__/autonomy-role-health.test.ts src/api/__tests__/autonomy-execute-plan.test.ts`

## Result

- `rasp` was refreshed from `origin/main` and validated.
- The Alice integration branch now carries `rasp` plus Alice-specific canonical arcade/stream/mastery work.
- Release B canonical arcade behavior remains intact.
- No new public API was introduced by the branch integration.

## Operational Notes

- The original `/Volumes/.../milaidy` worktree should not be used for continued merge work. A failed LFS checkout left untracked files there during an earlier attempt.
- The validated integration work was completed in the dedicated worktree at `/tmp/milaidy-alice-merge-rasp-2026-03-05`.
