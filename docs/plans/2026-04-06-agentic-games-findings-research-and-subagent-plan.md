# Agentic Games Findings Research And Implementation Plan

Date: 2026-04-06

## Purpose

This document turns the remaining unresolved findings from the agentic-games PRD review into concrete implementation tracks. Each track includes:

- current-state evidence
- exact gap relative to the PRD
- production implementation plan
- edge cases
- testing and verification plan
- sub-agent ownership

The five unresolved tracks are:

1. Shared app-run semantics are still too thin for the promised operator model.
2. Steering is still session-scoped and acknowledgement semantics are too weak.
3. Browser, desktop, and live verification coverage is still incomplete.
4. App-specific operator surfaces are still partial outside Defense of the Agents.
5. Recovery and reconnect UX is still incomplete for stale viewers and degraded runs.

## Current Baseline

What is already real:

- persistent app runs are stored via `packages/agent/src/services/app-run-store.ts`
- app runs are refreshed through route modules in `packages/agent/src/services/app-manager.ts`
- the Apps view now has `browse`, `running`, and `games` sub-tabs in `packages/app-core/src/components/pages/AppsView.tsx`
- the chat sidebar has a running-apps widget in `packages/app-core/src/components/chat/widgets/plugins/agent-orchestrator.tsx`
- Defense of the Agents has a dedicated app detail extension in `packages/app-core/src/components/apps/extensions/DefenseAgentsDetailExtension.tsx`
- Dungeons and Agent Town references are removed from active Milady codepaths outside the historical PRD doc

What is still structurally missing:

- top-level run identity for character and agent
- run-scoped operator messaging and typed acknowledgements
- browser-level proof for Babylon and Defense
- live-deployment proof for Hyperscape
- autonomous-play proof for 2004scape after viewer detachment
- reconnect and stale-viewer recovery actions in the running control plane

## Track 1: Shared App-Run Semantics

### Finding

The current run contract is still too thin for the PRD. `AppRunSummary` has `runId`, app identity, viewer, session, summary, heartbeat, background support, viewer attachment, and health, but it does not model first-class character identity, agent identity, chat availability, control availability, recent events, or an away summary.

Evidence:

- `packages/shared/src/contracts/apps.ts`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/agent/src/services/app-run-store.ts`
- `packages/agent/src/services/app-manager.ts`

### Why This Still Matters

Without these fields:

- the shell cannot honestly show which character is attached to a run
- the shell cannot show what happened while the user was away
- apps cannot expose a consistent "needs attention" reason beyond a single health message
- the running panel cannot show recent notable actions in a shared way

### Proposed Contract Changes

Expand `AppRunSummary` with:

- `characterId: string | null`
- `agentId: string | null`
- `chatAvailability: "live" | "fallback" | "unavailable"`
- `controlAvailability: "full" | "limited" | "read-only" | "unavailable"`
- `lastOperatorMessageAt: string | null`
- `lastAgentAcknowledgementAt: string | null`
- `recentEvents: AppRunEvent[]`
- `awaySummary: AppRunAwaySummary | null`
- `failureState: AppRunFailureState | null`

Add supporting types:

- `AppRunEvent`
- `AppRunAwaySummary`
- `AppRunFailureState`
- `AppRunAvailabilityReason`

Keep `session` for app-specific live data, but move shared shell-facing metadata to the run level.

### Server Changes

`packages/agent/src/services/app-manager.ts`

- populate run-level `characterId` and `agentId` during launch and refresh
- derive `chatAvailability` and `controlAvailability` from route module capabilities and current session state
- record `recentEvents` from refresh transitions, launch diagnostics, detach/attach operations, and control actions
- compute `awaySummary` when a run is refreshed after a meaningful period or after notable event accumulation
- persist the new fields in `packages/agent/src/services/app-run-store.ts`

`packages/agent/src/services/app-package-modules.ts`

- optionally allow route modules to return shared run metadata alongside session refresh data

### UI Changes

`packages/app-core/src/components/apps/RunningAppsPanel.tsx`

- show character identity and agent identity
- show chat/control availability chips separately from health
- show recent notable events
- show away summary when present
- show more specific needs-attention reasons

`packages/app-core/src/components/chat/widgets/plugins/agent-orchestrator.tsx`

- derive counts from new `failureState` and availability fields, not only health state
- show the most recent notable event for each run

### Sequencing

1. Extend shared contracts and serialization.
2. Populate new fields in `AppManager`.
3. Backfill the running panel and widget UI.
4. Add app-specific metadata wiring where route modules can provide richer identities or event feeds.

### Edge Cases

- run restored from disk with missing new fields
- route module refresh returns session but no character identity
- one character has multiple runs in different apps
- `recentEvents` grows unbounded and needs trimming
- app is read-only but still healthy
- run is healthy but viewer is unavailable

### Test Plan

Contract and store:

- read old persisted store files without crashing
- write and reload enriched run records
- preserve sort order and event trimming

App manager:

- launch populates character and agent identity when known
- refresh updates availability and events
- away summary appears only after threshold conditions
- degraded and offline runs record explicit failure states

UI:

- running panel renders identity, away summary, and recent events
- widget counts use the new shared availability model
- missing fields degrade gracefully instead of crashing

### Sub-Agent Track

Owner: `track-1-run-model`

Expected output:

- exact contract diff proposal
- exact app-manager/store integration plan
- migration and compatibility notes

## Track 2: Run-Scoped Steering And Acknowledgements

### Finding

Steering is still routed by `appName + sessionId`, not `runId`, and the UI only presents success or failure. The PRD explicitly requires visible acknowledgement states like accepted, queued, rejected, and unsupported.

Evidence:

- `packages/app-core/src/components/apps/GameView.tsx`
- `packages/app-core/src/api/client-skills.ts`
- `packages/agent/src/api/apps-routes.ts`
- app package route handlers under `plugins/app-*`

### Why This Still Matters

Without run-scoped steering:

- the control plane cannot treat a run as the primary user-facing unit
- multi-run steering is harder to reason about
- unsupported control paths are too easy to present as fake success
- queued or asynchronous steering cannot be explained clearly

### Proposed Contract Changes

Add:

- `AppRunOperatorMessageRequest`
- `AppRunOperatorMessageResult`
- `AppRunOperatorAckState = "accepted" | "queued" | "rejected" | "unsupported"`
- `AppRunOperatorCapability`

`AppRunOperatorMessageResult` should include:

- `success`
- `ackState`
- `message`
- `run`
- `session`
- `acknowledgedAt`
- `reasonCode`
- `suggestedFallback`

### API Changes

Add run-scoped endpoints under `packages/agent/src/api/apps-routes.ts`:

- `POST /api/apps/runs/:runId/message`
- `POST /api/apps/runs/:runId/control`
- `GET /api/apps/runs/:runId/operator-status`

Server routing:

- resolve the run first
- map from run to app route module and session
- if the run has no command path, return `ackState = "unsupported"` instead of generic success
- if the route module accepts but will process asynchronously, return `ackState = "queued"`

### Route Module Changes

App route modules should expose an optional run-aware command bridge:

- `sendRunMessage(ctx, content)`
- `controlRun(ctx, action)`
- `getOperatorStatus(ctx)`

App-specific expected behavior:

- Hyperscape: likely `accepted` for live agent chat when active
- Babylon: likely `accepted` or `queued` depending on backend processing
- 2004scape: may initially be `queued` if commands enter a bot loop
- Defense: may be `accepted` for strategy suggestions, `unsupported` for controls the remote wrapper does not expose

### UI Changes

`packages/app-core/src/components/apps/GameView.tsx`

- switch message/control actions to run-scoped client methods
- render acknowledgement chips or banners:
  - accepted
  - queued
  - rejected
  - unsupported
- if unsupported, do not show a green success notice
- if queued, show explicit "queued for the live loop" language

`packages/app-core/src/components/apps/RunningAppsPanel.tsx`

- show whether the run currently supports live steering

### Sequencing

1. Add new shared ack/result types.
2. Add run-scoped server routes and client methods.
3. Bridge run-scoped operations to each app route module.
4. Update `GameView` and related tests.

### Edge Cases

- run exists but `sessionId` is gone
- run is healthy but command bridge is unavailable
- multiple messages are sent rapidly and queue ordering matters
- user sends control action while run is reconnecting
- app exposes suggestions but not hard control actions

### Test Plan

Contracts and routes:

- run-scoped message route resolves the correct run
- unsupported app returns `ackState = "unsupported"` with 200 or 409, not false success
- queued action returns `ackState = "queued"`
- missing run returns 404

UI:

- `GameView` renders each acknowledgement state correctly
- rejected and unsupported states do not use success tone
- queued states survive refresh and do not drop operator context

App integration:

- Defense pause/resume still reports unsupported explicitly
- 2004scape message path is verifiably queued or accepted
- Babylon chat path shows real operator acknowledgement

### Sub-Agent Track

Owner: `track-2-steering-acks`

Expected output:

- exact run-scoped route design
- ack semantics table by app
- UI feedback design and migration plan

## Track 3: Verification Matrix And Live Proof

### Finding

The verification matrix is still incomplete. Existing coverage is meaningful, but it does not prove the full PRD across all four apps and all major failure modes.

Evidence:

- `packages/agent/test/apps-e2e.e2e.test.ts`
- `apps/app/test/ui-smoke/apps-session.spec.ts`
- `packages/agent/test/services/app-manager.test.ts`
- `packages/agent/test/api/app-defense-of-the-agents-routes.test.ts`
- plugin route tests in sibling app repos

### What Is Covered Today

- run persistence, refresh, attach, detach, stop
- Hyperscape fixture-based UI smoke
- 2004scape launch/auth metadata and remote reachability
- Babylon route-layer auth/session mapping
- Defense wrapper session and spectator shell routing

### What Is Still Missing

- Babylon browser-level dashboard proof
- Defense browser-level viewer and login usability proof
- Hyperscape against a real deployment rather than only fixtures
- 2004scape proof of autonomous play after detaching the viewer
- desktop-level attach and stale-viewer recovery across multiple apps

### Recommended Test Architecture

Contract tests:

- shared run-state transitions
- operator acknowledgement transitions
- stale-viewer vs dead-run distinctions

Unit/component tests:

- running panel enriched metadata and recovery UI
- Babylon operator dashboard sections
- 2004scape status panel
- acknowledgement-state rendering in `GameView`

Browser UI smoke:

- one spec per app
- run-aware launch
- visible live status
- operator chat/control path
- failure-state rendering

Desktop smoke:

- native window attach for embedded/non-embedded viewers
- detach and reattach after tab navigation
- stale-viewer recovery banner
- multi-run switching while one viewer stays pinned

Live or staging smoke:

- Hyperscape real attach and agent follow
- Babylon live SSE and chat roundtrip
- 2004scape live auto-login and autonomous action observation
- Defense live viewer/login diagnosis in the real target environment

### Sequencing

1. Finish contract changes from Tracks 1, 2, and 5.
2. Add missing component tests for new UI.
3. Add browser specs for Babylon, 2004scape, and Defense.
4. Add desktop smoke for reattach and stale-viewer recovery.
5. Add live/staging nightly coverage where infrastructure exists.

### Edge Cases

- API healthy but agent unavailable
- viewer authenticated but no live entity
- command bridge degraded while viewer still works
- two concurrent runs for one app
- detached viewer resumes against stale auth

### Test Plan

Require an explicit per-app matrix:

- launch/login proof
- live session proof
- operator message proof
- detach/reattach proof
- degraded/offline recovery proof

### Sub-Agent Track

Owner: `track-3-verification-matrix`

Expected output:

- complete coverage map
- missing suite inventory
- recommended browser, desktop, and live test matrix

## Track 4: App-Specific Operator Surfaces

### Finding

App-specific surfaces are still incomplete. Defense has a real detail extension. Babylon has a substantial in-session terminal. Hyperscape relies on its embedded native UI. 2004scape still lacks a Milady-native status and control surface in the catalog/running experience.

Evidence:

- `packages/app-core/src/components/apps/extensions/registry.ts`
- `packages/app-core/src/components/apps/extensions/DefenseAgentsDetailExtension.tsx`
- `packages/app-core/src/components/apps/BabylonTerminal.tsx`
- `packages/app-core/src/components/apps/AppDetailPane.tsx`

### Desired Surface Model

- Hyperscape: embedded native `agent-control` remains primary
- Babylon: Milady-native dashboard accessible from run detail and in-session view
- 2004scape: Milady-native run detail panel plus viewer
- Defense: existing extension remains and should be enriched by Tracks 1 and 5

### Proposed Changes

`packages/app-core/src/components/apps/extensions/registry.ts`

- register:
  - `babylon-operator-dashboard`
  - `runescape-2004-control`
  - optional `hyperscape-run-detail`

Babylon:

- extract reusable sections from `BabylonTerminal`
- expose a run-detail dashboard in `AppDetailPane` and `RunningAppsPanel` drill-in
- add dedicated tests for overview, activity, team, wallet, logs, and operator chat states

2004scape:

- add a dedicated run-detail extension showing:
  - login state
  - runtime/bot state
  - current task
  - recent actions
  - plugin/runtime telemetry
  - steering status

Hyperscape:

- keep the embedded native UI as primary
- add a smaller run-detail summary panel to explain attach state, followed entity, and recovery steps when embedded attach fails

### Sequencing

1. Add new detail panel identifiers in registry metadata.
2. Implement Babylon and 2004scape detail extensions.
3. Add a lightweight Hyperscape run-detail summary.
4. Wire app-detail and running-panel navigation into those surfaces.

### Edge Cases

- app has no live run yet
- app has a run but no viewer
- run is detached and detail surface must become read-mostly
- app returns partial telemetry only

### Test Plan

Component tests:

- Babylon dashboard sections under loading, empty, live, and error states
- 2004scape detail panel under login pending, running, detached, and offline states
- Hyperscape run-detail summary under no-entity and stale-viewer states

Apps view integration:

- selecting an app with an extension renders the correct detail panel
- compact/mobile layouts still show the extension
- active run state is reflected in the extension

### Sub-Agent Track

Owner: `track-4-app-surfaces`

Expected output:

- per-app surface architecture
- UI decomposition plan
- component and integration test plan

## Track 5: Recovery, Reconnect, And Stale Viewer UX

### Finding

The running apps control plane still lacks recovery actions for stale viewers, degraded runs, and explicit reconnect flows. The panel can open, detach, and stop, but not reconnect or restart, and it does not distinguish enough recovery states for the operator.

Evidence:

- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/apps/GameView.tsx`
- `packages/agent/src/services/app-manager.ts`

### Desired Recovery Model

Shared states:

- running
- reconnecting
- degraded
- offline
- viewer-stale
- viewer-unavailable
- operator-unsupported

Shared actions:

- reattach viewer
- refresh viewer auth
- reconnect run bridge
- restart run
- stop run
- open external fallback when embedded viewing is impossible

### Proposed Changes

Contracts:

- add `failureState`
- add `recommendedActions`
- add explicit viewer-health state separate from run-health state

Server:

- distinguish stale viewer auth from dead run
- expose recommended recovery actions per run
- preserve the last recoverable run state when refresh fails transiently

UI:

- running panel renders recovery actions based on `recommendedActions`
- `GameView` shows recovery banners instead of only disconnected session state
- overlay surfaces should not silently hold stale viewers

### Sequencing

1. Add failure and recovery metadata to the shared run model.
2. Teach `AppManager` to derive recommended recovery actions.
3. Update running panel and game view banners.
4. Add desktop/browser recovery tests.

### Edge Cases

- viewer URL still loads but auth payload is stale
- run still exists but no entity is attached
- embedded viewer is blocked while external URL still works
- run flips between degraded and healthy during polling
- user retries recover repeatedly while refresh is already in flight

### Test Plan

Server:

- refresh failure marks viewer stale without deleting the run
- recommended recovery actions differ between stale viewer and offline run
- transient refresh errors do not destroy last known good metadata

UI:

- running panel shows reconnect/retry actions only when appropriate
- game view banners distinguish stale viewer from dead run
- retry action updates state after a successful refresh

Desktop and browser:

- detach, navigate away, and reattach
- stale viewer auth after long inactivity
- open external fallback when embedded view is unrecoverable

### Sub-Agent Track

Owner: `track-5-recovery-ux`

Expected output:

- recovery-state model
- recommended-actions design
- UI behavior and tests for stale/degraded/offline transitions

## Cross-Track Sequencing

Some tracks are dependent:

1. Track 1 defines the richer shared run model.
2. Track 2 depends on Track 1 for richer run metadata and may add operator result types.
3. Track 5 depends on Track 1 for shared run failure metadata.
4. Track 4 depends on Tracks 1 and 5 for richer data feeding app-specific panels.
5. Track 3 should be updated after Tracks 1, 2, 4, and 5 land so its browser and live suites target the final behavior.

Recommended execution order:

1. Track 1
2. Track 2
3. Track 5
4. Track 4
5. Track 3

## Deliverable Standard

A track is not done until:

- the implementation exists in production code
- the shared contract is truthful
- the UI exposes the state honestly
- failure paths are explicit
- tests cover the happy path and the documented edge cases
- browser or desktop proof exists where the PRD makes user-visible claims

## Dispatch Status

- `track-1-run-model`: dispatched to sub-agent `Leibniz`
- `track-2-steering-acks`: dispatched to sub-agent `Arendt`
- `track-3-verification-matrix`: dispatched to sub-agent `Averroes`
- `track-4-app-surfaces`: dispatched to sub-agent `Banach`
- `track-5-recovery-ux`: dispatched to the recovery/reconnect sub-agent workstream
