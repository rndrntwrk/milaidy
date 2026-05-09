# Alice Upstream Sync And Deploy Workbook

This workbook keeps Alice-specific runtime integrity explicit while pulling new
work from `milady-ai/develop` and the nested Eliza source.

## Branch And Ownership Model

- `milaidy:alice` owns Alice runtime code and Alice-owned patches applied to the
  nested Eliza source.
- `555-bot:alice` owns the bot deploy trigger and shell/config only.
- `555stream:staging` owns staging deploy orchestration, ops visibility, and
  deploy-time assertions.
- Corpus ingest work is parked and must not be part of Alice runtime promotion.

## Sync Loop

1. Fetch `upstream/develop`, `origin/alice`, and the Eliza submodule branch.
2. Rebase or merge upstream into an isolated Alice reconciliation branch.
3. Run `node scripts/run-repo-setup.mjs`; this applies tracked Alice Eliza
   runtime patches from `scripts/apply-alice-eliza-runtime-patches.mjs`.
4. Inspect the Eliza submodule status. Do not commit a Milady gitlink that points
   to a local-only Eliza commit; Alice patches must be either upstreamed to a
   reachable Eliza branch or represented by a tracked Milady patch hook.
5. Review Alice-only surfaces before merging:
   - operator action routes
   - companion and stage routes
   - coding-agent fallback
   - Telegram account-auth service
   - LifeOps/plugin surfaces
   - startup health and startup log contract
6. Run focused contract tests before opening or merging the PR.

## Drift Gates

- `scripts/apply-alice-eliza-runtime-patches.test.ts` verifies tracked Alice
  patches against upstream Eliza source anchors.
- `packages/agent/src/api/lifeops-agent-subpaths.test.ts` verifies LifeOps
  imports do not require missing root `@elizaos/agent` subpaths.
- Relationships graph tests verify LifeOps graph resolver and cluster memory
  helper exports remain present on the materialized root `@elizaos/agent`
  package.
- AppCore native bridge tests verify LifeOps imports do not require missing root
  `@elizaos/app-core/bridge/native-plugins` exports.
- Staging deploy must assert the materialized runtime image includes the same
  exports and source files the runtime imports at startup.
- Any new `Cannot find module`, package `exports`, or staged `.runtime-imports`
  failure is a source topology drift until proven otherwise.

## Current Recovery Invariants

- Root `@elizaos/agent` exports must include:
  - `./actions/grounded-action-reply`
  - `./api/conversation-metadata`
  - `./cloud/cloud-api-key`
- Root `@elizaos/agent/services/relationships-graph` must expose the graph
  resolver and cluster-aware memory helpers used by LifeOps.
- Staged app plugin imports must patch
  `@elizaos/plugin-telegram/account-auth-service` before importing LifeOps.
- Root `@elizaos/app-core/bridge/native-plugins` must expose the AppBlocker
  bridge used by LifeOps.
- LifeOps umbrella actions must not shadow child actions they include in
  `subActions`; the calendar umbrella aliases the inner Google Calendar
  `CALENDAR_ACTION` as `googleCalendarAction` to avoid module-initialization
  self-reference.
- Startup acceptance requires `[milady][startup] start-eliza:done` and rejects
  LifeOps load failures, optional LifeOps skips, PGlite lock errors, and runtime
  boot errors.
- `555stream` may assert runtime surfaces exist, but runtime behavior fixes must
  remain in `milaidy` or tracked Milady-owned Eliza patch hooks.

## Deployment Evidence

Staging and production acceptance require ops-visible webhook runs, not manual
diagnostic SSM sessions.

Record for each deploy:

- webhook delivery ID
- ops deployment run ID
- repo/ref/SHA allowlist decision
- `555stream`, `555-bot`, `milaidy`, and Eliza SHAs
- image tag and digest
- rollout status and pod readiness
- startup log contract result
- smoke result for `/health`, `/agents`, `/api/status`, operator action,
  companion/stage routes, coding-agent fallback, Telegram preflight, companion
  assets, and stream start/stop

## Promotion Rule

Promote only the exact staging-accepted runtime. If a later upstream sync is
needed, it starts a new reconciliation branch and repeats this workbook from the
top.
