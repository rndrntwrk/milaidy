# Agentic Games Unresolved Findings Research And Sub-Agent Execution Plan

Date: 2026-04-06

## Scope

This report covers the five unresolved findings from the games PRD review:

1. App-run model is still too thin for the PRD.
2. Steering is still session-scoped and lacks truthful acknowledgement semantics.
3. The verification matrix is still incomplete at browser, desktop, and live layers.
4. App-specific operator surfaces are still partial.
5. Recovery and reconnect UX is still incomplete.

This document is intentionally implementation-oriented. It identifies the current gap, the production approach, the concrete code areas to change, the edge cases to cover, and the testing plan required to claim the finding is resolved.

## What Is Already Resolved

The earlier gap analysis is no longer current in several important areas:

- The curated catalog is now effectively limited to the four supported games.
- The server now persists app runs and refreshes them through app route modules.
- The Apps view now has a `Running` tab backed by persisted runs.
- The chat rail now has a running-apps widget with active/background/attention counts.
- Defense of the Agents now has a Milady-native operator detail surface.

Those improvements matter, but they do not yet satisfy the full PRD bar.

## Master Execution Strategy

The unresolved work should be executed in this order:

1. Expand the run contract and server model.
2. Move steering and acknowledgements to run-scoped APIs.
3. Build the missing recovery actions on top of the richer run model.
4. Complete app-specific operator surfaces using the shared run semantics.
5. Close the proof gap with browser, desktop, and live verification.

Reasoning:

- Track 1 is the foundation. Tracks 2, 4, and 5 become inconsistent if the run model remains underspecified.
- Track 2 must land before the PRD's truthful steering UX can be implemented in shared or app-specific surfaces.
- Track 5 depends on richer run state and per-run action semantics.
- Track 4 can proceed in parallel once Track 1 shapes are stable.
- Track 3 should start immediately as research and harness work, but its strongest tests should validate the final Track 1-5 behavior.

## Track 1: Run Model And Operator Metadata

### Problem Statement

The current `AppRunSummary` is strong enough for persistence and basic reattachment, but it is still too thin for the PRD's operator model. The shell cannot truthfully show:

- which character is attached to a run
- which agent is attached to a run
- whether chat is available
- whether controls are available
- recent notable events
- away summaries
- multi-facet health for runtime, viewer, and control path

### Current Evidence

Relevant current code:

- `packages/shared/src/contracts/apps.ts`
- `packages/agent/src/services/app-manager.ts`
- `packages/agent/src/services/app-run-store.ts`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/chat/widgets/plugins/agent-orchestrator.tsx`

Observed limitations in the current implementation:

- `AppSessionState` already has optional `agentId` and `characterId`, but they only live under `session`, which forces every UI to inspect app-specific session data instead of relying on first-class run metadata.
- `app-run-store.ts` still persists a `v1` store shape and silently drops richer run semantics because they do not exist in the contract yet.
- `AppManager` still computes health and summary at a coarse level; it does not model auth, runtime, viewer, and control-path health separately.
- The running panel and app-runs widget can only render coarse run state because the richer operator data does not exist at the shared contract layer.

Current `AppRunSummary` includes:

- `runId`
- `appName`
- `displayName`
- `pluginName`
- `launchType`
- `launchUrl`
- `viewer`
- `session`
- `status`
- `summary`
- `startedAt`
- `updatedAt`
- `lastHeartbeatAt`
- `supportsBackground`
- `viewerAttachment`
- `health`

This is useful, but it still forces the UI to infer too much from generic `session` and `health` blobs.

### Production Design

#### Contract Changes

Extend `AppRunSummary` with first-class run metadata:

- `characterId: string | null`
- `agentId: string | null`
- `characterLabel: string | null`
- `viewerStatus: "attached" | "detached" | "unavailable" | "stale" | "auth-failed"`
- `chatAvailability: "available" | "reconnecting" | "unavailable" | "unsupported" | "unknown"`
- `controlAvailability: "available" | "partial" | "reconnecting" | "unavailable" | "unsupported" | "unknown"`
- `backgroundStatus: "running" | "paused" | "unsupported" | "unknown"`
- `supportsViewerDetach: boolean`
- `recentEvents: AppRunEvent[]`
- `awaySummary: AppRunAwaySummary | null`
- `healthDetails: AppRunHealthDetails`

Add supporting types:

- `AppRunEvent`
  - `id`
  - `kind`
  - `summary`
  - `details`
  - `timestamp`
  - `severity`
- `AppRunAwaySummary`
  - `generatedAt`
  - `since`
  - `headline`
  - `bullets`
- `AppRunHealthDetails`
  - `runtime`
  - `viewer`
  - `control`
  - `telemetry`
  - `auth`

Keep the existing top-level `health` field as a summary badge for list UIs.

#### Server Changes

Update `AppManager` so run construction and refresh derive these fields from:

- launch-time auth and viewer metadata
- session refresh hooks
- app-specific telemetry
- control-path capabilities

Required changes:

- expand run normalization and persistence in `app-run-store.ts`
- bump persisted store version to `v2`
- add migration from `runs.v1.json` into the richer run shape
- compute richer per-run metadata in `app-manager.ts`
- introduce centralized helpers for:
  - run identity derivation
  - capability derivation
  - subsystem health derivation
  - recent-event normalization
  - away-summary generation
- update refresh hooks for app packages to return enough session data to derive the new fields consistently

#### UI Changes

Update shared surfaces:

- `RunningAppsPanel`
  - show character and agent identity
  - show viewer status separately from run status
  - show recent event headline
  - show away summary if present
  - show chat/control availability badges
  - show attention reasons when health is degraded or offline
- chat widget
  - show latest notable event per run
  - surface viewer-stale and control-unavailable as separate reasons for attention

### Edge Cases

- run has a valid session but no character identity
- character identity changes between launches
- control path is down but telemetry still updates
- viewer is stale but runtime is healthy
- no recent events yet
- away summary is missing because the run was never detached
- app package only exposes partial telemetry

### Test Plan

#### Unit

- `app-run-store.ts`
  - persists and reloads new run fields
  - rejects corrupt unknown values safely
- `app-manager.ts`
  - derives character and agent identity correctly
  - computes viewer/chat/control availability correctly
  - computes away summary and recent events

#### Component

- `RunningAppsPanel`
  - renders new badges and metadata
  - handles stale viewer and partial control states
- orchestrator widget
  - counts attention states using richer health details

#### Integration

- route refresh updates recent events and health facets without dropping run identity
- reloaded app manager reconstructs full run metadata after process restart

### Risks

- telemetry shape differs across apps, so normalization must be explicit per app
- away summaries are meaningless if they are only derived from one-line summaries
- if event history grows unbounded, persistence cost rises quickly
- legacy `v1` run stores must hydrate safely without forcing users to clear local state

### Recommended Implementation Slice

1. Add new shared types and normalization.
2. Bump the store to `v2` and add backward-compatible migration from `v1`.
3. Populate the richer shape in `AppManager`.
4. Update app refresh hooks or app-manager mappers where needed.
5. Update the Running panel and chat widget.
6. Add unit, route, and component coverage before moving on.

### Sub-Agent Assignment

- Track owner: `Leibniz`
- Responsibility: research and concrete execution brief for run-model expansion

## Track 2: Run-Scoped Steering And Truthful Acknowledgements

### Problem Statement

The current UX still routes operator messages by app name plus session ID. That is too thin for a multi-run product and does not satisfy the PRD's requirement to show whether a steering message was:

- accepted
- queued
- rejected
- unsupported

Today, non-throwing responses are treated as success, which creates false confidence.

### Current Evidence

Relevant current code:

- `packages/app-core/src/components/apps/GameView.tsx`
- `packages/app-core/src/api/client-skills.ts`
- `packages/agent/src/api/apps-routes.ts`
- app package routes under `plugins/app-*`

Current gaps:

- no run-scoped message endpoint under `/api/apps/runs/:runId/...`
- no shared acknowledgement type
- no queue-state UX
- no honest unsupported-state UX in shared surfaces
- no run-targeted control API beyond attach, detach, stop, and health

### Production Design

#### Contract Changes

Add:

- `AppRunMessageAck = "accepted" | "queued" | "rejected" | "unsupported"`
- `AppRunMessageResult`
  - `success`
  - `ack`
  - `message`
  - `run`
  - `session`
- `AppRunControlResult`
  - same shape for pause, resume, restart-viewer, reconnect, etc.

#### Server Changes

Add run-scoped routes:

- `POST /api/apps/runs/:runId/message`
- `POST /api/apps/runs/:runId/control`

`AppManager` should resolve the run, then dispatch through:

- app-specific run handler if present
- session handler when the run has a live session
- truthful `unsupported` when the app does not provide that capability

App route modules should optionally expose:

- `sendRunMessage(ctx)`
- `controlRun(ctx)`

These should be separate from plain session APIs because the run outlives viewer/session attachment details.

#### UI Changes

Update shared send/control flows:

- `GameView`
  - send via run ID when available
  - surface `accepted`, `queued`, `rejected`, `unsupported` distinctly
- running panel
  - allow steering from detached states where supported
- future chat widget hooks
  - route suggested prompts to the active run, not only the active session

### Edge Cases

- run exists but no active session is attached
- session exists but command channel is temporarily unavailable
- app supports suggestions but not direct commands
- duplicate operator messages while a prior one is queued
- stale viewer but healthy run
- control action supported for one app but not another

### Test Plan

#### Unit

- `AppManager`
  - routes by run ID
  - maps unsupported apps correctly
  - preserves queue and rejection semantics

#### Route

- `/api/apps/runs/:runId/message`
  - returns `accepted`
  - returns `queued`
  - returns `unsupported`
  - returns 404 for missing run
- `/api/apps/runs/:runId/control`
  - same matrix

#### Component

- `GameView`
  - success badge for accepted
  - informative notice for queued
  - explicit warning/error for rejected and unsupported

#### Cross-App

- Hyperscape: accepted path
- Babylon: accepted or queued path
- Defense: unsupported pause/resume remains explicit
- 2004scape: steering path truthful to actual capability

### Risks

- the apps do not all share the same command semantics
- queued acknowledgement may require backend buffering, not just frontend messaging
- some apps may need thin adapters before they can speak the shared run control language

### Recommended Implementation Slice

1. Add shared result types.
2. Add run-scoped routes and client methods.
3. Add `AppManager` dispatch logic.
4. Update `GameView` and any prompt buttons.
5. Add route and component tests.

### Sub-Agent Assignment

- Track owner: `Arendt`
- Responsibility: research and concrete execution brief for run-scoped steering and acknowledgements

## Track 3: Verification Matrix And Live Proof

### Problem Statement

The codebase now has strong unit and route coverage for run plumbing, but the product claim is still ahead of the proof. The PRD requires real evidence for:

- login
- live viewer attachment
- agent connection
- steering effects
- detached/background continuity

That evidence is still uneven across the four games.

### Current Evidence

Verified today:

- focused unit and route suites in Milady
- Hyperscape UI smoke with fixture iframe auth and session controls
- 2004scape heavy E2E for launch/auth payload and remote reachability
- Hyperscape, Babylon, and 2004scape plugin route tests

Missing or incomplete:

- Babylon browser-level dashboard/chat proof
- Defense browser-level viewer usability proof inside Milady
- real Hyperscape deployment attach proof from Milady
- 2004scape autonomous play proof after viewer detaches
- desktop overlay and stale-viewer proof for the multi-run control plane

### Production Test Matrix

#### Layer 1: Contract And Unit

Own the shared run semantics:

- run persistence
- refresh
- attach/detach
- message acknowledgements
- recovery state transitions

#### Layer 2: App Route Integration

Per app:

- launch session mapping
- refresh mapping
- message/control routing
- unsupported-control behavior

#### Layer 3: Browser UI Smoke

Add Playwright smoke per app:

- Hyperscape
  - embedded agent-control launch
  - message
  - pause/resume
- Babylon
  - dashboard loads
  - SSE or polling updates visible
  - operator chat path works
- 2004scape
  - viewer auto-auth loads
  - runtime status visible
  - detached run remains listed
- Defense
  - spectator shell loads
  - telemetry visible
  - operator chat/control behavior truthful

#### Layer 4: Desktop UI Smoke

Electrobun flows:

- overlay attach/detach
- native window survival
- stale viewer recovery
- multiple running apps visible from the shell

#### Layer 5: Live Or Staging Proof

Nightly or gated pre-release:

- real Hyperscape environment
- real or staging Babylon backend
- real 2004scape remote server
- Defense target environment with the actual overlay constraints

### Edge Cases

- launch succeeds, viewer auth fails
- viewer loads, no live entity found
- runtime healthy, control path unavailable
- viewer detached and reattached later
- two runs active at once
- background run degraded while user is away

### Test Harness Recommendations

- keep fast fixture-backed Playwright for deterministic shared UX tests
- add a second staged suite for live integrations
- separate live smoke from blocking PR tests unless staging reliability is high
- use run IDs, not app names, in future UI test fixtures

### Recommended Implementation Slice

1. Freeze the shared run/control semantics.
2. Add missing fixture-backed Playwright specs for Babylon, Defense, and 2004scape.
3. Add desktop multi-run smoke.
4. Add live staging harness definitions and CI entry points.

### Sub-Agent Assignment

- Track owner: `Averroes`
- Responsibility: research and concrete execution brief for the missing verification matrix

## Track 4: App-Specific Operator Surfaces

### Problem Statement

The PRD explicitly rejected a one-size-fits-all generic game shell. The current state is better than before, but only Defense has a real catalog/running detail extension. Babylon, Hyperscape, and 2004scape still need clearer app-specific surface decisions.

### Current Evidence

- Hyperscape
  - strongest experience lives in the embedded native `agent-control` viewer
- Babylon
  - `BabylonTerminal` is rich, but it only appears through the generic `GameView`
- 2004scape
  - no dedicated app detail extension or detached operator dashboard yet
- Defense
  - dedicated detail extension exists

Relevant current code:

- `packages/app-core/src/components/apps/GameView.tsx`
- `packages/app-core/src/components/apps/BabylonTerminal.tsx`
- `packages/app-core/src/components/apps/extensions/registry.ts`
- `packages/app-core/src/components/apps/extensions/DefenseAgentsDetailExtension.tsx`
- `packages/app-core/src/components/apps/AppDetailPane.tsx`

### Production Design

#### Hyperscape

Primary surface:

- keep embedded Hyperscape `agent-control` as the live viewer

Milady-native additions:

- catalog detail card that explains attach prerequisites and current run status
- running detail summary for reattach, current entity, and last event

#### Babylon

Primary surface:

- Milady-native operator dashboard

Recommended approach:

- promote the Babylon dashboard into an app detail extension and running detail surface
- keep `GameView` integration for full live view when needed
- structure the dashboard as reusable panels instead of a single large terminal-only component

#### 2004scape

Primary surface:

- Milady-native run dashboard plus viewer

Needed additions:

- runtime status panel
- credentials/login state
- current bot task
- recent actions/plugin output
- steering entry point when detached

#### Defense

Primary surface:

- current Milady-native operator extension plus stable spectator shell

Needed additions:

- integrate future recovery actions and richer run-status fields once Tracks 1 and 5 land

### Edge Cases

- app has no viewer but still has a healthy run
- app has viewer but no app-specific detail extension
- live viewer is correct but the detached dashboard lags
- mixed capabilities across apps confuse the shared Apps view

### Test Plan

#### Component

- Babylon dashboard panels and tab states
- 2004scape detail extension states
- Hyperscape detail summary states
- Defense extension with richer run fields

#### Integration

- Apps catalog detail pane chooses the correct extension
- running panel opens the correct app-specific surface
- GameView and app-specific detail surfaces stay consistent for the same run

### Risks

- `BabylonTerminal` is large; refactoring it into reusable panels can be invasive
- 2004scape may need new runtime endpoints before a real dashboard is possible
- Hyperscape ownership crosses repos

### Recommended Implementation Slice

1. Factor Babylon panels for reuse.
2. Add Babylon detail extension and tests.
3. Add 2004scape detail extension and tests.
4. Add lightweight Hyperscape run-detail extension and tests.
5. Integrate all surfaces with the shared run model from Track 1.

### Sub-Agent Assignment

- Track owner: `Banach`
- Responsibility: research and concrete execution brief for app-specific operator surfaces

## Track 5: Recovery, Reconnect, And Stale-Viewer UX

### Problem Statement

The running panel is still too passive. It supports open, detach, and stop, but the PRD requires explicit recovery flows for:

- viewer stale
- viewer unavailable while run is healthy
- control path down
- degraded runtime
- reconnect and relaunch actions

### Current Evidence

Relevant current code:

- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/chat/widgets/plugins/agent-orchestrator.tsx`
- `packages/agent/src/services/app-manager.ts`
- `packages/app-core/src/components/apps/GameView.tsx`

Current behavior:

- health is a single badge
- viewer attachment is shown, but viewer failure mode is not
- there are no reconnect or relaunch actions from the running panel
- there is no explicit stale-viewer state

### Production Design

#### State Model

Add:

- `viewerStatus`
  - `attached`
  - `detached`
  - `stale`
  - `auth-failed`
  - `unavailable`
- `recoveryActions`
  - `reattachViewer`
  - `retryViewer`
  - `reconnectRuntime`
  - `restartRun`
  - `openExternal`

This can be explicit or derived from run health and app capabilities, but the UI should not guess.

#### Server Changes

Extend `AppManager` with explicit recovery operations where ownership is clear:

- reattach viewer
- refresh and verify viewer
- reconnect runtime if app route module exposes it
- restart run where supported

Add API routes:

- `POST /api/apps/runs/:runId/recover`
- or a generalized `POST /api/apps/runs/:runId/control` with recovery actions

#### UI Changes

Update `RunningAppsPanel`:

- show recovery badges separately from general health
- render action buttons based on supported recovery actions
- show "viewer stale" distinctly from "run offline"

Update the chat widget:

- count stale viewer as needs-attention
- expose quick reattach or retry actions

### Edge Cases

- viewer stale but relaunch would kill an otherwise healthy run
- run unhealthy but viewer still attached
- recover action succeeds for runtime but viewer remains stale
- app supports external open but not embedded recovery
- user triggers multiple recovery actions rapidly

### Test Plan

#### Unit

- recovery action derivation in `AppManager`
- state transitions for stale and recovered runs

#### Component

- running panel action rendering by run state
- needs-attention counts for stale viewer versus offline runtime

#### Integration

- reattach after detach
- retry after stale viewer
- unsupported recovery action returns truthful message

### Risks

- not every app can support runtime reconnect without deeper app-specific work
- restart semantics may differ from stop plus launch
- stale-viewer detection must avoid flapping

### Recommended Implementation Slice

1. Add viewer/recovery states to the run model.
2. Add backend recovery actions.
3. Add running panel and widget actions.
4. Add component and integration coverage.

### Sub-Agent Assignment

- Track owner: `Volta`
- Responsibility: research and concrete execution brief for recovery and reconnect UX

## Cross-Track Testing Standard

No finding should be considered resolved until all of the following are true for its scope:

- the shared contract is explicit
- unit and route coverage exist
- the relevant UI renders the success and failure states
- at least one browser-level proof exists when the finding is user-visible
- unsupported paths are surfaced honestly

## Expected Deliverables From Sub-Agents

Each sub-agent should return:

1. a file-backed research memo
2. an implementation sequence
3. a risk list
4. a test matrix
5. any recommended code ownership boundaries

Once those are in, the next step is to convert Tracks 1, 2, 4, and 5 into implementation workers and let Track 3 define the PR-gating verification matrix.
