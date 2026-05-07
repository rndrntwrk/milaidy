# Agentic Games Unresolved Findings Research And Implementation Plan

Date: 2026-04-06

## Purpose

This document turns the five unresolved findings from the PRD review into
concrete implementation tracks. It is intentionally code-grounded. Each track
includes:

- current evidence
- what is still missing
- the proposed architecture
- an implementation sequence
- test and verification requirements
- ownership notes for delegated sub-agents

The scope here is the unresolved gap after the recent control-plane work:

1. Run model still too thin for the promised operator UX
2. Steering still session-scoped with binary success/error UX
3. Browser, desktop, and live verification matrix still incomplete
4. App-specific operator surfaces still partial
5. Recovery and stale-viewer UX still incomplete

## Current Baseline

The following are already materially improved and should be treated as the new
starting point rather than open problems:

- curated four-game catalog in the Apps view
- persistent app runs on disk via `runs.v1.json`
- run refresh and re-verification in the app manager
- `Running` subtab in Apps
- chat-rail active-runs widget
- Defense of the Agents detail extension
- route-level refresh hooks for Hyperscape, Babylon, and 2004scape

Key current files:

- `packages/shared/src/contracts/apps.ts`
- `packages/agent/src/services/app-manager.ts`
- `packages/agent/src/api/apps-routes.ts`
- `packages/agent/src/services/app-run-store.ts`
- `packages/app-core/src/components/pages/AppsView.tsx`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/apps/GameView.tsx`
- `packages/app-core/src/components/apps/BabylonTerminal.tsx`
- `packages/app-core/src/components/apps/extensions/DefenseAgentsDetailExtension.tsx`
- `packages/app-core/src/components/apps/extensions/registry.ts`

## Track 1: Expand The Run Model Into A Real Operator Contract

### Finding

The current `AppRunSummary` contract still cannot express several PRD-level
operator flows. It does not first-class model:

- top-level `characterId`
- top-level `agentId`
- chat availability
- control availability
- recent events
- away summaries
- richer run health dimensions

Current evidence:

- `packages/shared/src/contracts/apps.ts:76`
- `packages/shared/src/contracts/apps.ts:48`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx:129`

### Why This Matters

Without those fields, the shell cannot truthfully support:

- "which character is attached to this run?"
- "what happened while I was away?"
- "is chat unavailable but the run is still healthy?"
- "is the game healthy but the agent bridge degraded?"
- "what recent operator-visible event should I inspect next?"

This means the PRD's returning-user and background-ops journeys are only
partially represented in code.

### Proposed Contract Changes

Add the following shared structures in `packages/shared/src/contracts/apps.ts`:

- `AppRunAvailabilityState = "available" | "limited" | "unavailable"`
- `AppRunEventKind = "status" | "operator" | "agent" | "system" | "warning" | "error"`
- `AppRunEvent`
  - `id`
  - `kind`
  - `title`
  - `detail`
  - `at`
  - `severity`
- `AppRunAvailability`
  - `chat`
  - `controls`
  - `viewer`
- `AppRunAwaySummary`
  - `generatedAt`
  - `since`
  - `headline`
  - `bullets`

Extend `AppRunSummary` with:

- `characterId: string | null`
- `agentId: string | null`
- `availability: AppRunAvailability`
- `recentEvents: AppRunEvent[]`
- `awaySummary: AppRunAwaySummary | null`

Do not overload `session` for these shell-level fields. `session` should remain
the app-specific live session surface. The shell needs stable, generic
operator-facing data even when the session is unavailable.

### Server-Side Changes

Update:

- `packages/agent/src/services/app-manager.ts`
- `packages/agent/src/services/app-run-store.ts`

Implementation details:

1. Normalize generic shell metadata during launch.
2. Preserve it on disk in `runs.v1.json`.
3. Update it during `refreshRunSession`.
4. Generate `recentEvents` whenever:
   - a run is launched
   - a viewer attaches/detaches
   - a run becomes degraded/offline
   - the route refresher returns meaningful summary changes
5. Generate `awaySummary` lazily during refresh:
   - compare the last seen `updatedAt` / `lastHeartbeatAt`
   - summarize the highest-signal recent events since that time

Avoid mixing app-specific telemetry directly into `recentEvents`; instead add a
small app-to-shell summarization step:

- Hyperscape: movement, goal changes, combat, follow target changes
- Babylon: team coordination, trade activity, notable market action
- 2004scape: login state, current task, recent bot actions
- Defense: lane pressure changes, strategy updates, hero risk events

### UI Changes

Update:

- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/chat/widgets/plugins/agent-orchestrator.tsx`
- `packages/app-core/src/components/pages/AppsView.tsx`

Surface:

- character label
- agent label
- availability chips for viewer/chat/controls
- recent-events list
- "since you were away" card when `awaySummary` is present

### Sequence

1. Extend shared types
2. Extend run-store read/write normalization
3. Teach app-manager to populate the new fields
4. Add UI rendering
5. Add tests

### Edge Cases

- Run exists but session is null
- Session exists but viewer is unavailable
- Character ID changes after auth refresh
- Old run-store files missing the new fields
- `recentEvents` grows without bound
- Away summary is stale because no operator has viewed the run recently

### Tests

Unit:

- contract serialization and backwards-compatible run-store normalization
- app-manager launch populates `characterId`, `agentId`, `availability`
- app-manager refresh appends recent events on status transitions
- away summary generation for idle vs eventful runs

UI/component:

- running panel shows character and availability chips
- running panel renders away summary only when present
- chat widget counts still work when richer metadata is present

Integration:

- launch -> detach -> refresh -> reattach preserves operator metadata
- degraded/offline transitions add shell-visible recent events

### Suggested Sub-Agent Ownership

Track owner should own:

- `packages/shared/src/contracts/apps.ts`
- `packages/agent/src/services/app-run-store.ts`
- `packages/agent/src/services/app-manager.ts`
- related tests in `packages/agent/test/services/app-manager.test.ts`

## Track 2: Make Steering Run-Scoped And Truthful

### Finding

Steering currently runs through app-specific session routes and the UI only
surfaces success/error notices.

Current evidence:

- `packages/app-core/src/components/apps/GameView.tsx:594`
- `packages/app-core/src/components/apps/GameView.tsx:681`
- `packages/agent/src/api/apps-routes.ts:115`

### Why This Matters

The PRD requires visible causality and explicit acknowledgement states:

- accepted
- queued
- rejected
- unsupported

The current shape cannot distinguish:

- "command accepted but not yet acted on"
- "viewer attached but command channel unavailable"
- "app is read-only"
- "control unsupported for this app"

It also routes by `appName + sessionId`, not by `runId`, which weakens the
shared multi-run abstraction.

### Proposed API And Contract Changes

Add shared response types in `packages/shared/src/contracts/apps.ts`:

- `AppRunOperatorAckState = "accepted" | "queued" | "rejected" | "unsupported"`
- `AppRunOperatorAck`
  - `state`
  - `message`
  - `runId`
  - `sessionId`
  - `appliedAt`
  - `reasonCode`
  - `session`

Add server routes in `packages/agent/src/api/apps-routes.ts`:

- `POST /api/apps/runs/:runId/message`
- `POST /api/apps/runs/:runId/control`

Server behavior:

1. Resolve the run first
2. Resolve the app route slug from `run.appName`
3. Use the run's latest `session.sessionId`
4. Translate app-specific route responses into the shared ack model

### UI Changes

Update:

- `packages/app-core/src/api/client-skills.ts`
- `packages/app-core/src/components/apps/GameView.tsx`

Behavior:

- `GameView` should send messages and controls by `runId`
- the UI should render ack state, not generic success
- unsupported responses should use neutral/warning tone, not success
- queued responses should remain visible until session refresh confirms change

Add a compact "last operator action" row in the logs side panel:

- text
- ack state
- timestamp

### App-Specific Mapping Rules

- Hyperscape:
  - message route returns `accepted` when agent bridge receives the message
  - control route can return `accepted` or `unsupported`
- Babylon:
  - team/agent chat can return `accepted`
  - delayed market or team coordination work may return `queued`
- 2004scape:
  - bot task reroute may return `queued`
- Defense:
  - unsupported pause/resume must map to `unsupported`, not generic failure

### Sequence

1. Add shared ack types
2. Add run-scoped server routes
3. Add client methods
4. Update `GameView`
5. Update tests

### Edge Cases

- run exists but session has expired
- run route exists but app route module does not expose message/control paths
- message accepted but no session delta yet
- unsupported control returned from remote wrapper
- run was refreshed and session ID changed before the message call

### Tests

Unit:

- route mapping from app response to shared ack states
- unsupported control maps to warning state
- stale session returns explicit rejection

Component:

- `GameView` shows queued vs accepted vs unsupported
- command notices do not use success styling for unsupported

Integration:

- attach run -> send message by `runId` -> ack visible -> session refresh updates
- run refresh after control action updates the displayed state

### Suggested Sub-Agent Ownership

Track owner should own:

- `packages/agent/src/api/apps-routes.ts`
- `packages/app-core/src/api/client-skills.ts`
- `packages/app-core/src/components/apps/GameView.tsx`
- route and component tests for these flows

## Track 3: Build The Real Verification Matrix

### Finding

The automated proof is still uneven:

- strong unit and route coverage
- one Hyperscape UI smoke
- 2004scape launch/auth E2E
- no equivalent browser smoke for Babylon or Defense
- no real-desktop proof for Defense overlay behavior
- no live proof of 2004scape autonomous play after detaching

Current evidence:

- `apps/app/test/ui-smoke/apps-session.spec.ts:731`
- `packages/agent/test/apps-e2e.e2e.test.ts:665`
- `packages/agent/test/apps-e2e.e2e.test.ts:820`
- plugin route tests in sibling repos

### Test Matrix By App

#### Hyperscape

Current:

- route tests
- app-manager fixture launch tests
- UI smoke fixture flow
- heavy E2E launch/auth metadata

Missing:

- real deployment login and attach
- real entity-follow verification
- reattach after navigation in browser and desktop

#### Babylon

Current:

- route tests
- app-manager fixture launch test

Missing:

- UI smoke or component coverage for the real operator dashboard
- browser proof for SSE + chat + team updates
- desktop or browser recovery proofs

#### 2004scape

Current:

- route tests
- heavy E2E launch/auth against live remote server

Missing:

- browser proof that auto-login reaches a live playing state
- proof of ongoing autonomous activity after viewer detach
- proof of operator steering affecting bot state

#### Defense Of The Agents

Current:

- route tests
- launch integration tests
- wrapper strategy tests

Missing:

- browser or desktop proof that the Milady-hosted shell is usable
- proof that remote login/overlay issues are gone in the target runtime
- proof that operator commands change live behavior in the viewer flow

### Proposed Test Architecture

1. Contract tests
   - run metadata
   - steering ack states
   - run refresh transitions

2. Component tests
   - running panel
   - away summaries
   - Babylon dashboard sections
   - GameView steering states

3. UI smoke Playwright
   - Hyperscape fixture flow
   - Babylon fixture dashboard flow
   - 2004scape fixture or staging auto-login flow
   - Defense spectator shell flow

4. E2E Vitest server flows
   - launch/attach/detach/refresh per app
   - 2004scape remote reachability and telemetry checks
   - Babylon authenticated SSE/session refresh behavior

5. Desktop smoke
   - overlay attach
   - stale viewer recovery
   - Defense shell behavior

### Sequence

1. Lock the shared run/ack contracts first
2. Add deterministic fixture servers for Babylon and Defense browser smoke
3. Expand Playwright suite to one spec per app
4. Add desktop flows where iframe/window behavior matters
5. Add live or nightly staging jobs only after deterministic fixture coverage exists

### Edge Cases

- viewer loads but session is stale
- auth payload missing
- app route returns degraded state
- SSE disconnects and reconnects
- 2004scape login page loads but bot is not actually active
- Defense viewer shell loads while the remote page still fails

### Tests

This track is the test plan. The main rule is:

- do not call an app "done" until it has route coverage, component or UI
  coverage for its operator surface, and at least one browser-visible happy
  path plus failure-state path

### Suggested Sub-Agent Ownership

Track owner should own:

- `packages/agent/test/apps-e2e.e2e.test.ts`
- `apps/app/test/ui-smoke/*`
- any new fixture helpers required for Babylon and Defense

## Track 4: Finish App-Specific Operator Surfaces

### Finding

Only Defense has a catalog/running-detail extension today.

Current evidence:

- `packages/app-core/src/components/apps/extensions/registry.ts:5`
- `packages/app-core/src/components/apps/BabylonTerminal.tsx:930`
- `packages/app-core/src/components/pages/AppsView.test.tsx:417`

### Current Surface Map

#### Hyperscape

Current UX:

- best experience lives inside the embedded Hyperscape `agent-control` viewer
- Milady app detail is still generic

What is missing:

- richer pre-launch detail state in the catalog/running panel
- explicit attach errors in the app detail surface

#### Babylon

Current UX:

- rich operator dashboard exists in `BabylonTerminal`
- only visible after entering `GameView` and opening the terminal

What is missing:

- first-class Babylon detail panel in catalog/running surfaces
- direct "inspect dashboard" entry from `RunningAppsPanel`
- dedicated tests for the dashboard component itself

#### 2004scape

Current UX:

- mostly generic app detail and game view

What is missing:

- Milady-native run detail surface for:
  - auto-login state
  - bot runtime state
  - current task
  - recent actions
  - plugin/runtime activity

### Proposed UI Architecture

#### Hyperscape

- keep the embedded native control surface as the primary viewer
- add a small Milady detail extension focused on:
  - auth state
  - follow target
  - last attach result
  - reattach / open viewer actions
- do not duplicate Hyperscape's in-view logs, memories, or runs surface

#### Babylon

- split `BabylonTerminal` into reusable sub-panels:
  - `BabylonOverviewPanel`
  - `BabylonActivityPanel`
  - `BabylonTeamPanel`
  - `BabylonWalletPanel`
  - `BabylonLogsPanel`
- reuse those in:
  - `GameView` terminal area
  - a new Babylon detail extension for the app catalog / running panel
- the detail extension should show:
  - team summary
  - market snapshot
  - last notable coordination
  - operator chat entry point

#### 2004scape

- add a 2004scape detail extension showing:
  - login state
  - bot task
  - last action
  - runtime heartbeat
  - operator prompts
- keep the viewer generic, but make the Milady detail panel the persistent
  operator surface when detached

### Sequence

1. Add extension IDs to app metadata for Babylon and 2004scape
2. Create Babylon and 2004scape detail extensions
3. Factor shared detail cards if needed
4. Add entry points from `RunningAppsPanel`
5. Add direct component tests

### Edge Cases

- detail extension renders before runs hydrate
- active run exists but has no viewer
- viewer exists but session is degraded
- Babylon dashboard SSE not connected yet
- 2004scape has a viewer but no login confirmation yet

### Tests

Component:

- Babylon detail extension empty/loading/live states
- 2004scape detail extension empty/loading/live states
- app detail pane renders each extension in compact and desktop layouts

Integration:

- `AppsView` can open into the right detail panel for Babylon and 2004scape
- `RunningAppsPanel` can pivot into those operator surfaces

### Suggested Sub-Agent Ownership

Track owner should own:

- `packages/app-core/src/components/apps/extensions/*`
- `packages/app-core/src/components/apps/AppDetailPane.tsx`
- Babylon terminal decomposition work

## Track 5: Add Recovery And Stale-Viewer UX

### Finding

The running panel still only exposes open, detach, and stop. Recovery flows are
partial.

Current evidence:

- `packages/app-core/src/components/apps/RunningAppsPanel.tsx:150`
- `packages/agent/src/services/app-manager.ts` refresh/degraded behavior
- `packages/agent/src/services/app-manager.ts:1461` Hyperscape "no live session"

### Why This Matters

The PRD explicitly calls out:

- viewer stale
- run alive but viewer unavailable
- reconnect
- restart
- operator-visible recovery actions

Today the backend can detect some degraded/offline states, but the UI does not
offer enough explicit actions.

### Proposed Recovery Model

Extend run state with shell-level recovery semantics:

- `recoveryActions: Array<"reattach" | "reconnect" | "restart-viewer" | "restart-run">`
- `viewerStateDetail`
  - `attached`
  - `detached`
  - `stale`
  - `auth-failed`
  - `unavailable`

Server responsibilities:

- derive recovery actions from run state and app capabilities
- mark stale viewer vs offline run separately

UI responsibilities:

- show recovery CTA buttons in `RunningAppsPanel`
- show stale-viewer banner in `GameView`
- allow retrying viewer attachment without stopping the run

### Sequence

1. Add viewer-state detail + recovery-actions metadata
2. Update app-manager refresh logic to classify stale viewers
3. Add server endpoints if restart-viewer needs a distinct action
4. Add UI actions and banners
5. Add tests

### Edge Cases

- attached viewer origin mismatch after auth refresh
- reattach succeeds but postMessage auth is missing
- run is healthy but viewer sandbox prevents use
- restart-viewer should not destroy a background run
- app does not support reconnect and should only offer relaunch

### Tests

Unit:

- stale viewer classification
- recovery action derivation by app capability

Component:

- running panel shows reconnect/retry buttons when applicable
- `GameView` shows stale-viewer banner with non-destructive retry

Integration:

- detach viewer -> stale viewer -> reattach without restarting run
- degraded run offers recovery but not false success

### Suggested Sub-Agent Ownership

Track owner should own:

- `packages/agent/src/services/app-manager.ts`
- `packages/app-core/src/components/apps/RunningAppsPanel.tsx`
- `packages/app-core/src/components/apps/GameView.tsx`

## Cross-Track Dependencies

These tracks should not be implemented in random order.

Recommended sequence:

1. Track 1 first
   - it defines the run metadata other tracks need
2. Track 2 second
   - it defines truthful steering semantics
3. Track 5 third
   - it depends on richer run state
4. Track 4 fourth
   - app-specific surfaces should render the new run semantics
5. Track 3 continuously
   - add tests alongside each implementation track, then finish with the
     browser and desktop matrix

## Recommended Execution Model

Parallelize only where write ownership is clean:

- worker A: Track 1
- worker B: Track 2
- worker C: Track 3
- worker D: Track 4
- worker E: Track 5

But merge in this order:

1. Track 1
2. Track 2
3. Track 5
4. Track 4
5. Track 3 test expansions that depend on the final merged UX

## Done Criteria

The unresolved findings can be considered closed only when:

- the shared run model exposes the required operator metadata
- run-scoped steering has truthful ack states
- Babylon and 2004scape have first-class operator surfaces
- stale-viewer and reconnect flows are explicit and tested
- all four apps have browser-visible or desktop-visible proofs for the paths
  Milady claims to support
