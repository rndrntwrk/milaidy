# Agentic Games Findings Research And Implementation Plan

Date: 2026-04-06

## Purpose

This document turns the five unresolved findings from the PRD review into concrete implementation tracks. Each track includes:

- current-state evidence
- target behavior
- architectural changes
- implementation sequence
- risks and open questions
- edge cases
- test and verification plan
- a proposed sub-agent workstream

## Status Summary

What is already materially resolved:

- curated game catalog cleanup is effectively complete in Milady codepaths
- persistent `AppRun` storage exists
- run refresh and reattach flows exist
- Apps has a `Running` tab and the chat rail has an active-runs widget
- Defense of the Agents now has a real operator detail surface

What is not fully resolved:

- the run model is still too thin for the PRD operator model
- steering is still session-scoped and only exposes success/error UX
- live browser or desktop proof is incomplete across the four supported apps
- app-specific operator surfaces are only partial
- recovery and stale-viewer UX is still underpowered

## Track 1: Expand The App-Run Model

### Finding

Current `AppRunSummary` cannot represent several PRD-required states. The contract still lacks first-class run-level identity and ops metadata such as:

- run-level `characterId`
- run-level `agentId`
- chat availability
- control availability
- recent events
- away summaries
- richer health facets

Evidence:

- `packages/shared/src/contracts/apps.ts`
- `packages/agent/src/services/app-manager.ts`
- `packages/agent/src/services/app-run-store.ts`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`

### Target Behavior

Every run should be operable without opening the viewer. A returning user should be able to see:

- which character and agent the run belongs to
- whether chat is available now
- whether direct controls are available now
- what happened recently
- what changed while they were away
- whether the game, wrapper, viewer, or command path is degraded

### Proposed Contract Changes

Expand `AppRunSummary` to include:

- `characterId: string | null`
- `agentId: string | null`
- `chatAvailability: "ready" | "degraded" | "unavailable"`
- `controlAvailability: "ready" | "limited" | "unavailable"`
- `recentEvents: AppRunEvent[]`
- `awaySummary: AppRunAwaySummary | null`
- `health.facets`
  - `viewer`
  - `session`
  - `runtime`
  - `control`

Add new types:

- `AppRunEvent`
  - `id`
  - `kind`
  - `summary`
  - `detail`
  - `at`
  - `severity`
- `AppRunAwaySummary`
  - `from`
  - `to`
  - `headline`
  - `items`

### Proposed Server Changes

Update `AppManager` so that:

- launch-time session state is normalized into the richer run model
- refresh hooks can return or derive structured `recentEvents`
- refreshes compute health facets instead of only a single `healthy/degraded/offline`
- runs keep a bounded event ring buffer
- away summaries are synthesized from events after a detach or long inactivity window

Update `app-run-store.ts` so persisted runs survive schema migration cleanly:

- add version bump and migration path
- backfill missing fields for existing runs
- cap stored event history per run

### Proposed UI Changes

Update the running panel and app-runs widget to show:

- character and agent identity
- chat/control readiness pills
- recent events preview
- away summary card when `updatedAt` advanced after detach
- per-facet health drilldown

### Implementation Sequence

1. Extend shared contracts and app-run store schema.
2. Update `AppManager` normalization and refresh paths.
3. Backfill per-app refresh hooks to emit richer metadata when available.
4. Update API serialization.
5. Update `RunningAppsPanel` and the chat widget.
6. Add migration tests for old stored runs.

### Risks

- some apps cannot supply all fields immediately
- rich event history can bloat persisted state unless capped
- facet health can drift if refresh hooks are inconsistent across apps

### Edge Cases

- migrated runs missing `session`
- run exists but viewer is unavailable
- chat ready while controls unavailable
- background run still healthy but viewer auth expired
- multiple runs for the same app and same character

### Test Plan

Unit:

- contract serialization and normalization
- store migration from old schema to new schema
- event ring buffer truncation
- facet-health derivation rules

Integration:

- launch creates richer run shape
- refresh updates recent events and away summary
- attach/detach preserves away-summary timing windows

UI:

- running panel renders character/agent identity
- running panel renders per-facet health and recent events
- away-summary card only appears when appropriate

### Proposed Sub-Agent Workstream

Owner scope:

- `packages/shared/src/contracts/apps.ts`
- `packages/agent/src/services/app-run-store.ts`
- `packages/agent/src/services/app-manager.ts`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/chat/widgets/plugins/agent-orchestrator.tsx`

Deliverable:

- richer run model wired end to end, plus migration and UI coverage

## Track 2: Make Steering Run-Scoped And Truthful

### Finding

Operator messaging is still keyed by `appName + sessionId`, and UI feedback is effectively success/error only. The PRD requires explicit operator outcomes:

- accepted
- queued
- rejected
- unsupported

Evidence:

- `packages/agent/src/api/apps-routes.ts`
- `packages/app-core/src/api/client-skills.ts`
- `packages/app-core/src/components/apps/GameView.tsx`

### Target Behavior

The operator talks to a run, not an arbitrary session slug. Milady should show:

- what run received the message
- whether the request was accepted, queued, rejected, or unsupported
- what control surface handled it
- whether the app supports suggestions, direct commands, or read-only observation

### Proposed API Changes

Add run-scoped endpoints:

- `POST /api/apps/runs/:runId/message`
- `POST /api/apps/runs/:runId/control`
- `GET /api/apps/runs/:runId/capabilities`

Add typed action result:

- `status: "accepted" | "queued" | "rejected" | "unsupported"`
- `message`
- `run`
- `session`
- `reasonCode`
- `appliedAt`

### Proposed Server Changes

`AppManager` should:

- resolve run -> app route module -> current session
- reject message sends when the run is stale or detached from a live session
- map app-specific route results into a shared acknowledgement contract
- keep the last operator message and last acknowledgement on the run

Per-app route modules should explicitly declare support levels:

- suggestion-only
- command-like
- read-only

### Proposed UI Changes

Update `GameView` and the running panel to:

- send to run ID, not only `appName + sessionId`
- render acknowledgement badges and timestamps
- show unsupported or queued responses without pretending they succeeded
- expose read-only mode when a run cannot be steered

### Implementation Sequence

1. Add shared acknowledgement types.
2. Add run-scoped APIs and client methods.
3. Update `AppManager` with run-message routing.
4. Add per-app capability mapping.
5. Update `GameView` and running/detail surfaces.
6. Add regression tests for unsupported and queued outcomes.

### Risks

- some wrappers only expose text messages with no typed response
- queued versus accepted may be app-specific and require adapter logic
- stale-session behavior must not drop messages silently

### Edge Cases

- message sent to an offline run
- run exists but session ID changed underneath it
- app supports chat explanations but not controls
- duplicate operator submits while the first is still queued
- unsupported pause/resume for Defense

### Test Plan

Unit:

- run-message routing and stale-run rejection
- acknowledgement mapping for each result state

Integration:

- run-scoped message endpoint routes correctly
- unsupported control yields `unsupported`
- queued message updates run acknowledgement fields

UI:

- success, queued, rejected, unsupported badges
- read-only mode copy
- stale run error copy

### Proposed Sub-Agent Workstream

Owner scope:

- `packages/agent/src/api/apps-routes.ts`
- `packages/app-core/src/api/client-skills.ts`
- `packages/app-core/src/components/apps/GameView.tsx`
- related route and UI tests

Deliverable:

- run-scoped operator messaging with typed acknowledgements and truthful UX

## Track 3: Complete The Verification Matrix

### Finding

The current proof surface is uneven:

- strong fixture and route coverage
- decent control-plane unit coverage
- one real browser UI smoke for Hyperscape fixture mode
- heavy E2E for 2004scape launch/auth and Hyperscape auth metadata
- no equivalent browser or desktop proof for Babylon or Defense
- no live proof of 2004scape autonomous play after viewer detach

Evidence:

- `packages/agent/test/apps-e2e.e2e.test.ts`
- `apps/app/test/ui-smoke/apps-session.spec.ts`
- `packages/agent/test/services/app-manager.test.ts`
- `packages/agent/test/api/app-defense-of-the-agents-routes.test.ts`
- sibling app route tests in `../plugins`

### Target Behavior

Each supported app must have:

- contract and route tests
- browser smoke tests
- desktop smoke tests where desktop-specific behavior matters
- live or staging proof for the claims we make in the product

### Proposed Test Matrix

Hyperscape:

- fixture browser smoke for embedded `agent-control`
- staging smoke against a real deployment
- desktop attach smoke for overlay/native-window behavior

Babylon:

- component and route tests for dashboard panels
- browser smoke for dashboard loading, SSE updates, and operator chat
- staging smoke for team dashboard and market state

2004scape:

- browser smoke for auto-login and viewer auth
- live smoke for observed bot actions after launch
- detach/reattach smoke proving continued activity

Defense:

- route and wrapper tests
- browser smoke for spectator shell plus command flow
- owner-tagged staging test for remote overlay/login usability

### Required Harness Work

- reusable fixture servers for Babylon and Defense browser tests
- desktop runner coverage for attach/detach and stale viewer recovery
- live test gating via env vars for external dependencies
- clear owner tagging for upstream-blocked failures

### Implementation Sequence

1. Add per-app browser smoke fixtures.
2. Add desktop smoke coverage for attach and recovery.
3. Add live/staging jobs for the apps with external dependencies.
4. Gate external tests so CI remains deterministic.
5. Add release blocking rules tied to the matrix.

### Risks

- live external systems may be flaky
- some tests require secrets or staging env coordination
- Defense depends on a remote closed-source surface outside this repo

### Edge Cases

- fixture viewer loads but session never heartbeats
- viewer auth succeeds but the followed entity is missing
- SSE connects but team dashboard is stale
- bot login succeeds but no autonomous actions occur
- remote Defense site is up but unusable in embedded mode

### Test Plan

Treat this track as the test plan. Every app needs:

- contract
- route
- browser
- desktop if applicable
- live or staging proof for the product claims we advertise

### Proposed Sub-Agent Workstream

Owner scope:

- `packages/agent/test`
- `apps/app/test/ui-smoke`
- `apps/app/test/electrobun-packaged`
- sibling app test directories under `../plugins`

Deliverable:

- a complete verification matrix and the missing suites prioritized into shippable order

## Track 4: Finish App-Specific Operator Surfaces

### Finding

Only Defense has a detail extension in the app catalog. Babylon has a rich terminal, but it only appears inside the generic `GameView`. 2004scape has no dedicated Milady detail surface. Hyperscape primarily relies on the embedded app UI, which is appropriate, but the catalog and running views do not present a tailored Hyperscape status surface.

Evidence:

- `packages/app-core/src/components/apps/extensions/registry.ts`
- `packages/app-core/src/components/apps/BabylonTerminal.tsx`
- `packages/app-core/src/components/apps/AppDetailPane.tsx`
- `packages/app-core/src/components/apps/GameView.tsx`

### Target Behavior

- Hyperscape: the embedded `agent-control` surface remains primary, but the catalog/running surfaces should show concise live session metadata.
- Babylon: a Milady-native operator dashboard should be reachable before and after opening the viewer.
- 2004scape: a Milady-native status and bot-runtime panel should exist without requiring the generic logs panel.
- Defense: keep and harden the current operator surface.

### Proposed UI Architecture

Add detail extensions for:

- `hyperscape-session-summary`
- `babylon-operator-dashboard`
- `runescape-bot-control`

Keep BabylonTerminal as an inner view, but split reusable data panels out of it so they can render in:

- app detail pane
- running-run detail pane
- full `GameView`

### Implementation Sequence

1. Factor shared Babylon panels out of `BabylonTerminal`.
2. Add Babylon detail extension and running-view module.
3. Add 2004scape detail extension with login/runtime/task telemetry.
4. Add lightweight Hyperscape summary extension.
5. Wire `uiExtension.detailPanelId` metadata for each app.
6. Add component tests for each extension.

### Risks

- BabylonTerminal is currently a large monolith and will need extraction
- 2004scape telemetry may require upstream bot/plugin changes
- Hyperscape must avoid duplicating the embedded UI rather than complementing it

### Edge Cases

- detail extension renders before runs hydrate
- active run exists but telemetry is partial
- multiple runs exist for the same app
- viewer unavailable but operator dashboard still usable

### Test Plan

Component:

- extension fallback with no active run
- extension render with active run telemetry
- multiple runs choose the newest or selected run deterministically

Integration:

- AppsView and Running panel route to the correct extension
- Babylon dashboard panels and 2004scape status panel refresh correctly

### Proposed Sub-Agent Workstream

Owner scope:

- `packages/app-core/src/components/apps/extensions`
- `packages/app-core/src/components/apps/BabylonTerminal.tsx`
- `packages/app-core/src/components/apps/AppDetailPane.tsx`
- related metadata overrides and tests

Deliverable:

- per-app operator surfaces that match the PRD instead of only the generic shell

## Track 5: Recovery, Reconnect, And Stale-Viewer UX

### Finding

The running panel still has a thin action model. It can open, detach, and stop runs, but it does not expose richer recovery actions for:

- run alive but viewer unavailable
- viewer stale
- run degraded but reconnectable
- restart or relaunch paths
- explicit recovery guidance by failure type

Evidence:

- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/apps/GameView.tsx`
- `packages/agent/src/services/app-manager.ts`

### Target Behavior

Each failure state should have a clear operator action:

- viewer stale -> reattach viewer
- viewer unavailable, run healthy -> reopen externally or refresh embed
- control path degraded -> retry control bridge
- run offline -> restart or relaunch
- unsupported recovery -> explain owner and next step

### Proposed State Model

Add explicit recovery state:

- `recoveryActions: AppRunRecoveryAction[]`
- `viewerState: "attached" | "detached" | "stale" | "unavailable"`
- `reconnectHint`
- `restartable`

Generate recovery actions from health facets plus app capabilities.

### Proposed UI Changes

Running panel:

- `Reattach`
- `Reconnect`
- `Open external viewer`
- `Restart run`
- `Relaunch app`

GameView:

- viewer-stale banner
- run-healthy/viewer-unavailable banner
- retry buttons with explicit outcome copy

### Implementation Sequence

1. Expand run state with recovery actions and viewer state.
2. Teach `AppManager` to derive recovery actions.
3. Update running panel and GameView banners.
4. Add per-app overrides for unsupported actions.
5. Add stale-viewer and degraded-health tests.

### Risks

- some recovery actions are app-specific and may not map cleanly
- restart versus relaunch semantics differ across apps
- repeated retries can spam external services unless throttled

### Edge Cases

- attach returns success but viewer still cannot load
- run flips between degraded and healthy during polling
- detached run becomes offline while user is on another tab
- Defense remains remote-upstream blocked and cannot offer a true reconnect

### Test Plan

Unit:

- recovery action derivation from run state
- viewer-state transitions

Integration:

- attach on stale viewer
- degraded run becomes healthy after refresh
- restartable versus non-restartable action sets

UI:

- running panel recovery buttons by state
- GameView banners for stale/unavailable viewers

### Proposed Sub-Agent Workstream

Owner scope:

- `packages/agent/src/services/app-manager.ts`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/apps/GameView.tsx`
- related tests

Deliverable:

- explicit recovery UX and action paths for stale or degraded runs

## Cross-Track Dependencies

Recommended order:

1. Track 1 first. The richer run model is foundational.
2. Track 2 second. Run-scoped steering depends on stable run semantics.
3. Track 5 third. Recovery UX depends on the richer run and steering state.
4. Track 4 in parallel where possible after Track 1 contracts are stable.
5. Track 3 runs continuously, but its missing suites should be authored after the affected tracks land.

## Immediate Execution Recommendation

If we want to minimize merge risk:

- let one implementation owner land Track 1 first
- then split Track 2 and Track 5
- let UI-heavy Track 4 proceed after the Track 1 contract settles
- let Track 3 author failing or skipped coverage first, then flip to required once features land

If we want to maximize parallelism:

- Track 3 can proceed immediately because it is mostly test-inventory and harness work
- Track 4 can start by extracting Babylon panels without waiting on all run-model changes
- Track 5 can prototype banners and recovery actions behind existing state while Track 1 expands the contract
