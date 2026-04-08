# Agentic Games Apps PRD And Gap Analysis

Date: 2026-04-06

## Executive Summary

Milady already has the beginnings of an app-store and game session shell, but the current implementation is not yet a production-grade "watch, chat, steer" system. The product goal is not "launch a game in an iframe." The goal is:

1. A user creates or selects a character.
2. The user launches one or more game apps for that character.
3. The agent runs in the game continuously, even when the user is not actively watching.
4. The user can attach a viewer at any time, watch the live session, talk to the agent about what it is doing, and influence behavior without taking direct control.
5. The app view acts as an operations layer for long-running agent-driven worlds, not just a launcher.

The four supported games are:

- `@elizaos/app-2004scape`
- `@hyperscape/plugin-hyperscape`
- `@elizaos/app-babylon`
- `@elizaos/app-defense-of-the-agents`

Apps we do not want in the user-facing game catalog are already hidden in the curated Apps view, but they are not fully removed from the codebase yet:

- `@elizaos/app-dungeons`
- `@elizaos/app-agent-town`

## Product Thesis

This product is a new kind of game interaction:

- The user is not directly piloting the avatar.
- The user is not passively consuming a stream either.
- The user is operating as an always-available advisor, manager, and conscience for an autonomous in-game agent.

The core loop is:

1. Observe the agent.
2. Talk to the agent.
3. Influence the agent.
4. See the result in the world.
5. Leave and return later without losing continuity.

That requires three surfaces to work at once:

- Live world view
- Live agent conversation
- Live operational state and telemetry

## Product Principles

- Agent-first: the agent is the player, not a cosmetic wrapper around a human-controlled game.
- Continuous: launches create durable runs, not disposable one-off viewers.
- Attached and detachable: the viewer is an attachment to a running agent session, not the session itself.
- Conversational steering: user messages can influence goals, priorities, and tactics without requiring hard-coded command syntax.
- Explainable behavior: the system should expose enough state that a user can understand why the agent is acting as it is.
- Multi-app: multiple apps can remain running at the same time.
- Clean shell: the app view should feel minimal and purposeful, not like a verbose debug console.

## In Scope

- Curated app catalog containing only the four supported games.
- Character-driven launch flow.
- Background-running app sessions.
- App-specific viewer and control surfaces.
- Re-attachable live viewing.
- Operator chat with the live agent.
- App health, status, and "currently running" visibility.
- Testing and validation for login, agent connection, and live play.

## Out Of Scope

- Purely aesthetic redesigns.
- Shipping a fake "agentic" shell that does not prove real game connection.
- Treating a raw iframe as a complete product.
- Claiming support for games that are only mocked, partially wired, or missing continuous runtime behavior.

## Primary User Journeys

### 1. First-Time User Journey

1. User opens Milady and creates or selects a character.
2. User customizes the character enough to feel ownership over the in-game agent.
3. User enters Apps and sees only the supported game catalog.
4. User launches a game.
5. Milady starts or attaches the game-specific runtime for that character.
6. Milady shows a clear staged launch status:
   - preparing credentials
   - connecting runtime
   - attaching viewer
   - connected
7. User sees the world and the agent state.
8. User sends a natural-language message such as "Focus on defense for the next few minutes" or "Check in with your team before buying."
9. User sees the agent acknowledge or otherwise reflect the steering input.
10. User observes the effect in the game.

Success criteria:

- The user understands the agent is alive in the world.
- The user can see what the agent is doing.
- The user can talk to the agent immediately.
- The user can influence behavior without leaving the game context.

### 2. Returning User With Running Apps

1. User comes back later.
2. Milady shows which apps are currently running and which character is attached to each run.
3. User can:
   - re-open the live viewer
   - jump into the chat/control panel
   - inspect recent activity
   - stop or pause autonomy where supported
4. If the agent kept playing while the user was away, Milady shows a concise "since you were away" summary.

Success criteria:

- The user does not need to relaunch or reauthenticate just to resume watching.
- The agent run is durable across app navigation and viewer detachment.

### 3. Live Steering Journey

1. User watches the game.
2. User notices behavior they want to influence.
3. User sends a suggestion, question, or instruction.
4. Milady routes the instruction to the active app run.
5. The UI shows whether the message was:
   - accepted
   - queued
   - rejected
   - unsupported
6. The agent updates behavior, plan, or explanation.

Success criteria:

- The user sees causality between steering input and game behavior.
- Failures are explicit instead of silent.

### 4. Background Operation Journey

1. User launches multiple apps.
2. User leaves the Apps tab or closes the viewer.
3. The agent runs continue in the background where supported.
4. Milady surfaces lightweight status in the main shell:
   - currently running
   - unhealthy
   - awaiting attention
   - recent notable event
5. User can reattach to any run from the dashboard or chat widgets.

Success criteria:

- Viewer detachment does not kill the run.
- Users can manage multiple runs from one place.

## Shared UX Requirements Across All Games

### Shared Launch Experience

- Launch from a clean Apps catalog with only supported titles.
- Character selection must happen before launch when required by the target app.
- Launch must expose a reliable progress state and explicit errors.
- If credentials are auto-provisioned, Milady must surface whether they were generated, reused, or missing.

### Shared Runtime Model

Every game launch should create a first-class `AppRun`, not just a viewer URL.

Minimum run attributes:

- `runId`
- `appName`
- `characterId`
- `agentId`
- `status`
- `startedAt`
- `lastHeartbeatAt`
- `supportsBackground`
- `viewerAttachmentState`
- `chatAvailability`
- `controlAvailability`
- `health`
- `recentEvents`

### Shared Viewer Model

- Viewer can attach to an existing run.
- Viewer can detach without stopping the run.
- Viewer can be reopened later.
- Viewer must expose connection status separately from run status.

### Shared Chat And Steering Model

- User can chat with the live run from the game surface.
- Chat supports free-form suggestions, not just fixed commands.
- The agent should be able to explain what it is doing and why.
- If an app only supports command-like control today, Milady must present that honestly instead of pretending natural steering works.

### Shared Ops Model

- User can see all running apps in one place.
- User can inspect health and last activity for each run.
- User can stop, relaunch, reconnect, or resume viewing each run.
- The chat shell should be able to show app widgets such as:
  - currently playing
  - active runs
  - needs attention
  - recent notable actions

### Shared Failure Handling

- Login failure
- Agent runtime missing
- Viewer auth failure
- Viewer connected but no live agent found
- App API unavailable
- Background run crashed
- User reopened a stale viewer

All of these need explicit UI states and operator actions.

## App-Specific PRD

### Hyperscape

#### Product Intent

Hyperscape should be the cleanest embodiment of the core thesis. The preferred experience is the existing embedded Hyperscape agent-control surface, not a separate generic Milady side panel bolted onto a raw spectator iframe.

#### Desired User Experience

- User launches Hyperscape from Milady.
- Milady authenticates the agent and opens Hyperscape in embedded spectator mode.
- The embedded surface shows:
  - live game viewport
  - agent status
  - command/chat area
  - logs
  - timeline
  - runs
  - memories
- User can send natural instructions from inside the Hyperscape UI.
- User can see the agent and follow the correct in-world entity.

#### What The User Sees

- The agent in-world
- A live status badge
- A bottom or side chat/control surface
- Agent thought/log context
- Goal and quick action visibility

#### What The Agent Sees

- In-world entity state
- Follow target / character identity
- Messages from the operator
- Goal updates and quick actions

#### Required Capabilities

- Reliable wallet auth or agent auth handoff
- Character-to-entity mapping
- Embedded `agent-control` viewer attachment
- Chat to agent from the embedded UI
- Goal/status visibility
- Recovery when no live session is found

#### Acceptance Criteria

- Login works end to end.
- Embedded viewer loads the real `agent-control` experience.
- Correct entity is followed.
- Operator chat reaches the agent.
- Agent status and telemetry are visible.
- Reattach works after leaving the page.

### Babylon

#### Product Intent

Babylon should be a Milady-hosted operator dashboard for team-based autonomous market play, with optional click-through into the Babylon world. The main value is understanding and steering the team's decisions, coordination, and market behavior.

#### Desired User Experience

- User launches Babylon.
- Milady opens a live dashboard and optionally a viewer.
- User can see:
  - what the agent is doing
  - what the team is doing
  - who is coordinating with whom
  - what is being bought and sold
  - what is not being bought
  - current predictions
  - current market conditions
  - recent reasoning and conversations
- User can chat with the agent or the team from the dashboard.
- User can click through to the Babylon game surface when needed.

#### What The User Sees

- A live team dashboard
- Team roster and agent statuses
- Activity feed
- Wallet and portfolio data
- Current market and prediction context
- Team chat and conversations
- Agent autonomy toggles and recent decisions

#### What The Agent Sees

- Team messages
- Market state
- Portfolio and position state
- User steering messages
- Team coordination context

#### Required Capabilities

- Real-time SSE or equivalent updates
- Team dashboard aggregation
- Team chat
- Activity and trade history
- Market and prediction visibility
- Ability to explain recent actions

#### Acceptance Criteria

- Dashboard shows live team and market state.
- Chat can influence the agent or team.
- Team coordination is observable.
- Autonomy state is visible and controllable.
- User can detach and later reattach without losing continuity.

### 2004scape

#### Product Intent

2004scape should feel like launching a persistent autonomous bot character into a retro MMO world. The user should not have to babysit login or manually reattach a viewer just to know whether the bot is alive.

#### Desired User Experience

- User launches 2004scape.
- Milady provisions or reuses bot credentials.
- Milady logs the bot in automatically.
- The game viewer opens already authenticated.
- Milady shows:
  - bot login status
  - bot runtime status
  - current task or intent
  - recent actions and plugin activity
- The bot remains active as a continuously running service.
- User can chat with the bot and steer goals while it keeps playing.

#### What The User Sees

- Successful auto-login
- Current bot status
- Live viewer
- Recent actions and plugin output
- Background run state when detached

#### What The Agent Sees

- MMO world state
- Bot task queue or action loop
- User steering messages
- Runtime/plugin state

#### Required Capabilities

- Reliable auto-login
- Durable bot process independent of viewer lifecycle
- Status and telemetry exposed to Milady
- Command or steering path back into the bot runtime

#### Acceptance Criteria

- Launch auto-logs in without manual form entry.
- Bot continues playing after the viewer is closed.
- Milady can prove the bot is still connected.
- User can observe and influence behavior from Milady.

### Defense Of The Agents

#### Product Intent

Defense of the Agents is a remote, closed-source game connected through a Milady wrapper. The product requirement is still the same: watch, chat, steer, and verify that the agent is actually playing. The main constraint is that Milady does not own the game client.

#### Desired User Experience

- User launches Defense of the Agents.
- Milady registers or reuses API credentials as needed.
- Milady opens the viewer and attaches the wrapper session.
- The agent wakes up and starts its autoplay loop.
- The user can:
  - watch the game
  - talk to the agent
  - inspect strategy state
  - see recent activity
  - influence behavior with commands and strategy suggestions

#### What The User Sees

- Viewer
- Agent strategy and lane status
- HP, level, lane pressure, strategy version
- Recent activity feed
- Chat/control box

#### What The Agent Sees

- Wrapper-accessible game state
- Strategy settings
- Operator commands

#### Required Capabilities

- Reliable registration and credential persistence
- Viewer attachment
- Session polling
- Command and strategy updates
- Telemetry rendering
- Explicit unsupported-control handling

#### Acceptance Criteria

- Launch connects to the wrapper and remote game.
- Autoplay starts and remains active.
- User commands change agent behavior.
- Telemetry reflects live play.
- Login and overlay behavior are either fixed or diagnosed to a specific owner.

## Background And Multi-App Product Requirements

This is the most important shared requirement and the current architecture does not satisfy it.

### Required Product Behavior

- Multiple apps can remain running simultaneously.
- The user can leave the Apps tab and return later.
- The user can see all active runs from the shell.
- A run is not identical to an open viewer.
- A run can outlive the current page, overlay, or iframe.

### Required Shell Surfaces

- Apps dashboard "Running now" section
- Main chat widget showing active runs
- Status badges for:
  - running
  - reconnecting
  - unhealthy
  - waiting for login
  - detached
- Reattach buttons
- Stop and restart controls

### Future-Proof Application Abstraction

Milady should distinguish:

- Plugin: code that adds capabilities to the agent runtime
- App: user-facing launchable experience
- App run: one live instance of an app for a given character/agent
- Viewer: an attachable surface for an app run
- Control surface: chat, commands, status, telemetry

This abstraction should support future apps where:

- the agent runs headlessly
- the user only occasionally attaches
- the viewer is optional
- there may be multiple runs per app or per character

## Edge Cases And User Stories

### User leaves and comes back tomorrow

- Run still exists.
- Milady shows whether it is healthy.
- User sees a summary of what happened while away.

### Viewer attaches but the game session is gone

- Viewer shows "run alive, viewer unavailable" or "viewer stale."
- User can retry attachment without restarting the app run if possible.

### User message is incompatible with the app

- Milady should not pretend unsupported steering worked.
- The UI should explain whether the app supports suggestions, direct commands, or only read-only observation.

### Login succeeds but no live agent is visible

- Distinguish auth success from live entity attachment.
- Expose "viewer authenticated, no active entity found" as a separate state.

### App API is healthy but agent runtime is not

- Show separate health for:
  - game/client
  - wrapper/plugin
  - agent runtime
  - chat/control path

### Multiple apps for the same character

- Supported as long as the runtime and game integrations can isolate runs.
- The shell must show which app each run belongs to and whether they share the same character identity.

## Current-State Assessment

### Key Evidence Reviewed

- Curated game allowlist and session labels:
  - `packages/app-core/src/components/apps/helpers.ts`
- Apps launch shell and single-session UI state:
  - `packages/app-core/src/components/pages/AppsView.tsx`
  - `packages/app-core/src/components/apps/GameView.tsx`
  - `packages/app-core/src/components/apps/GameViewOverlay.tsx`
  - `packages/app-core/src/state/types.ts`
  - `packages/app-core/src/state/useMiscUiState.ts`
- Local app overrides and stale hidden-game metadata:
  - `packages/app-core/src/services/registry-client-app-meta.ts`
  - `packages/agent/src/services/registry-client-app-meta.ts`
- Server-side launch/session plumbing and in-memory active session tracking:
  - `packages/agent/src/services/app-manager.ts`
  - `packages/shared/src/contracts/apps.ts`
- Babylon wrapper and client surface:
  - `plugins/app-babylon/src/routes.ts`
  - `packages/app-core/src/components/apps/BabylonTerminal.tsx`
  - `packages/app-core/src/api/client-skills.ts`
- Defense wrapper:
  - `plugins/app-defense-of-the-agents/src/routes.ts`
- Existing Milady tests:
  - `apps/app/test/ui-smoke/apps-session.spec.ts`
  - `packages/agent/test/apps-e2e.e2e.test.ts`
  - `packages/agent/test/services/app-manager.test.ts`
  - `packages/agent/test/services/app-defense-of-the-agents-launch.test.ts`
- Cross-repo Hyperscape UX and attach path:
  - `../hyperscape/packages/client/src/screens/EmbeddedAgentControlScreen.tsx`
  - `../hyperscape/packages/client/src/lib/embedded-entry.ts`
  - `../hyperscape/packages/client/src/lib/embeddedAuth.ts`
- Cross-repo 2004scape auth path:
  - `../eliza-2004scape/webclient/src/client/Client.ts`
  - `../eliza-2004scape/engine/view/bot.ejs`

### 1. What Is Already Real

- The user-facing Apps catalog already curates to the four desired games via `packages/app-core/src/components/apps/helpers.ts`.
- Milady has a generic app launch flow and a generic `GameView`.
- Hyperscape launch metadata already targets embedded spectator mode with `surface=agent-control` in tests and launch logic.
- Babylon has a real wrapper plugin in this repo with a large route surface and SSE proxy.
- Defense of the Agents has a substantial wrapper plugin with session state, command handling, strategy mutation, telemetry, and autoplay.
- 2004scape auto-login paths exist in the sibling game code through URL params and `RS_2004SCAPE_AUTH`.

### 2. What Is Missing Or Structurally Weak

#### Single Active Game Architecture

The UI and state model only track one active game at a time:

- `activeGameApp`
- `activeGameViewerUrl`
- `activeGameSession`
- one overlay
- `appsSubTab` of `browse` or `games`

This blocks the required "many launched apps are running" product.

#### In-Memory Session Tracking Is Too Thin

Server-side app-manager state is only an in-memory map keyed by app name, with fields like:

- app name
- plugin name
- launch URL
- viewer URL
- started time

That is not a real run registry. It cannot support:

- multiple concurrent runs of the same app
- durable run recovery
- per-run health
- reattachment semantics
- viewer detachment semantics

#### Session Contracts Are Too Generic

`packages/shared/src/contracts/apps.ts` only supports a minimal generic session shape. There is no first-class model for:

- background runs
- health
- viewer attachment state
- operator chat availability
- acknowledgements
- run summaries
- typed telemetry channels

#### No Running Apps Control Plane In The UI

There is no first-class "running apps" dashboard or widget. The chat widget rail exists generically, but there is no app-run widget yet.

### 3. Current Removal Status For Unwanted Games

Current state:

- `Dungeons` and `Agent Town` are hidden from the curated Apps view.
- Local overrides for both still exist in:
  - `packages/app-core/src/services/registry-client-app-meta.ts`
  - `packages/agent/src/services/registry-client-app-meta.ts`
- Tests still reference `Dungeons`.

Conclusion:

- User-facing hiding is present.
- Full removal is not complete.

### 4. Per-App Assessment

#### Hyperscape

What is real:

- Launch metadata and tests indicate Milady targets `embedded=true`, `mode=spectator`, `surface=agent-control`, and `followEntity`.
- The sibling Hyperscape repo contains a real `EmbeddedAgentControlScreen` with viewport, command panel, logs, timeline, runs, and memories.
- Milady has route and API support for Hyperscape embedded-agent endpoints.

What is missing or unverified:

- The end-to-end login and live attach path is not proven against a real running Hyperscape deployment from Milady.
- Existing Milady UI smoke coverage uses fixtures and mocked viewers, not live Hyperscape.
- Milady depends on wrapper metadata and behavior that are not owned in this repo.
- The app shell is still fundamentally a generic single-session wrapper around the embedded surface.

LARPs and false confidence:

- "We have a Hyperscape integration" is only partly true if the claim means live, reliable, end-to-end attach, chat, and observe.
- Current tests mostly prove launch metadata, auth message handoff, and fixture-level session behavior.

#### Babylon

What is real:

- Babylon has a wrapper plugin in this repo.
- Babylon routes expose agent status, activity, logs, wallet, team, team chat, SSE, team dashboard, recent trades, and market endpoints.
- `BabylonTerminal` renders activity, team, wallet, logs, and a command input.

What is missing or unverified:

- The current Babylon UI does not yet satisfy the desired "see everything the agent and team are doing" dashboard.
- `BabylonTerminal` does not surface the richer available APIs for team dashboard, conversations, predictions, market state, and recent trade reasoning.
- There are effectively no dedicated tests for `BabylonTerminal`.
- There are no end-to-end Milady tests proving that a real Babylon session shows live, trustworthy team coordination and market behavior.

LARPs and false confidence:

- "Babylon dashboard exists" is currently true only in a narrow terminal sense, not in the richer operator-dashboard sense the product needs.

#### 2004scape

What is real:

- Milady auto-provisions credentials when possible.
- Milady launch includes a viewer URL and postMessage auth.
- The sibling 2004scape client supports both URL-param auto-login and `RS_2004SCAPE_AUTH`.
- E2E tests verify remote server reachability and launch payload contents.

What is missing or unverified:

- There is no real Milady-owned 2004scape session surface with runtime telemetry and operator chat.
- Registry/test fixtures do not model a meaningful 2004scape session contract.
- Current tests do not prove successful in-game login from Milady in a real browser run.
- Current tests do not prove continuous autonomous runtime after launch.
- Current tests do not prove user steering changes live behavior.

LARPs and false confidence:

- "2004scape works" currently mostly means "we can build a URL and auth payload."
- That is not the same as proving autonomous play, stable login, or persistent attachment.

#### Defense Of The Agents

What is real:

- The wrapper plugin is substantial.
- Launch resolves session state and starts autoplay.
- Commands can toggle autoplay, review strategy, update strategy, and send parsed deployment actions.
- Telemetry is surfaced in Milady's generic logs panel.

What is missing or unverified:

- Pause/resume is explicitly unsupported.
- The real viewer/login/overlay issue described by the user is not covered by tests in this repo.
- Because the game is closed-source and remote, part of the experience may be outside Milady's control.
- There is no proof yet that the actual public viewer reliably works inside Milady's iframe/window model.

LARPs and false confidence:

- "Defense is integrated" is true at the wrapper/session layer.
- It is not yet true at the full user-experience layer if login/viewer/overlay problems block actual use.

### 5. Testing Gaps

Current tests are strongest in these areas:

- app launch metadata
- catalog filtering
- mocked session control
- fixture-based iframe auth

Current tests are weak or absent in these areas:

- real login success in a real browser for each game
- long-running background sessions
- run recovery after navigation
- multi-app simultaneous operation
- operator chat causing observable in-game behavior
- Babylon dashboard correctness
- Defense viewer usability inside Milady

## Recommended Production Approach

### Approach A: Keep The Generic GameView As The Main Experience

Pros:

- Fastest to implement
- Reuses existing Milady shell

Cons:

- Produces a lowest-common-denominator experience
- Wastes richer app-native UIs like Hyperscape's `agent-control`
- Makes agentic behavior feel bolted on

Verdict:

- Not recommended as the primary long-term model

### Approach B: Use App-Native Control Surfaces Where They Exist, And Milady Dashboards Where They Do Not

What this means:

- Hyperscape uses the embedded Hyperscape `agent-control` UI as the primary experience.
- Babylon uses a Milady-native dashboard built on Babylon APIs.
- Defense uses Milady's wrapper-driven control panel because the game itself is closed-source.
- 2004scape gets a Milady-native status/control panel plus the game viewer.

Pros:

- Best product fit for each app
- Preserves rich native experiences where available
- Avoids forcing everything into one generic shell

Cons:

- More per-app work
- Requires a real shared run-control plane under the hood

Verdict:

- Recommended

### Approach C: Make Everything A Detached External Window And Minimize In-App Ops

Pros:

- Avoids some iframe issues

Cons:

- Loses the unified "watch, chat, steer" product
- Makes background operations harder to understand

Verdict:

- Not aligned with the product goal

## Recommended Architecture

### 1. Introduce First-Class App Runs

Implement a persistent run model with:

- run identity
- app identity
- character identity
- agent identity
- run state
- viewer state
- health state
- last activity
- recent events

### 2. Separate Runtime From Viewer

- Launch should start or attach the run.
- Viewer should attach to the run.
- Closing the viewer should not imply stopping the run.

### 3. Add A Running Apps Dashboard

The Apps tab should have:

- Browse
- Running
- Per-run detail

The chat shell should gain:

- active runs widget
- needs-attention widget

### 4. Support App-Specific Surfaces

- Hyperscape: embedded native control surface
- Babylon: Milady dashboard
- 2004scape: Milady status + viewer
- Defense: Milady wrapper dashboard + viewer

### 5. Add Health And Observability

Each app run should expose:

- auth status
- runtime status
- viewer status
- last successful heartbeat
- last operator message
- last agent acknowledgement
- recent errors

## Detailed Implementation Plan

### Phase 0: Catalog And Scope Cleanup

- Remove `Agent Town` and `Dungeons` from remaining app override metadata.
- Remove stale tests and docs that present them as supported game apps.
- Keep the curated four as the explicit supported set.

### Phase 1: Core App-Run Control Plane

- Add persistent app-run records instead of single active game state.
- Add APIs for:
  - list runs
  - get run
  - attach viewer
  - detach viewer
  - stop run
  - send operator message
  - get health
- Update app-manager so active runs are keyed by run ID, not app name.
- Persist runs beyond the current page lifecycle.

### Phase 2: Shell UX For Running Apps

- Replace single `activeGame*` state with a run-aware model.
- Add Apps "Running" subtab.
- Add main chat widgets for active runs.
- Add run status chips and reattach actions.
- Add "since you were away" summaries.

### Phase 3: Hyperscape Completion

- Validate live launch against a real Hyperscape environment, not just fixtures.
- Confirm wallet auth, character mapping, follow target, and embedded UI attach.
- If the embedded `agent-control` UI is stable, use it as the default viewer.
- Add explicit failure states for:
  - auth missing
  - viewer authenticated but no live entity
  - runtime bridge inactive

### Phase 4: Babylon Completion

- Expand Milady's Babylon dashboard beyond `BabylonTerminal`.
- Use available Babylon APIs for:
  - team dashboard
  - team conversations
  - recent trades
  - prediction markets
  - market context
  - portfolio state
- Add stronger reasoning and coordination surfaces.
- Add dedicated component tests and live integration tests.

### Phase 5: 2004scape Completion

- Add a real Milady-side run/session surface for 2004scape.
- Verify automatic login in a real browser session.
- Add runtime health and task telemetry from the bot/plugin layer.
- Prove the bot continues autonomously when detached.
- Add operator chat or steering path to the bot runtime.

### Phase 6: Defense Completion

- Diagnose the login/overlay issue in the real target environment.
- Determine whether the failure is:
  - remote game UI
  - iframe sandboxing
  - Electrobun window behavior
  - overlay stacking inside Milady
- Fix Milady-owned issues or document upstream dependency issues explicitly.
- Keep the wrapper telemetry and command loop, but harden the viewer path.

### Phase 7: Background And Recovery Hardening

- Resume runs after app navigation.
- Reattach after viewer close.
- Detect dead runs.
- Surface operator-visible recovery actions.

## Risks And Uncertainties

### Closed-Source Game Risk

Defense of the Agents may have viewer/login issues that Milady cannot fully fix without upstream cooperation.

### Cross-Repo Ownership Risk

Hyperscape and 2004scape rely on code outside this repo. Milady can only be production-ready if cross-repo contracts are tested continuously, not assumed.

### False Positive Testing Risk

Fixture and mock-heavy tests can create confidence without proving live behavior. This is already happening for parts of the system.

### Persistence Risk

If app runs remain in-memory only, background operation and recovery will keep failing in subtle ways.

### UX Drift Risk

If each app invents its own session semantics without a shared run model, the shell will become inconsistent and hard to reason about.

## Testing And Verification Plan

### Test Layers

#### 1. Contract Tests

Verify shared app-run contracts:

- run creation
- run persistence
- viewer attach/detach
- chat delivery
- health status transitions

#### 2. App Wrapper Integration Tests

Per app, verify:

- launch diagnostics
- credential provisioning
- session state mapping
- telemetry mapping
- control routing

#### 3. Browser E2E Tests

Use Playwright to prove:

- launch from Apps
- viewer loads
- login succeeds
- operator chat is usable
- live status is visible

These must use real or staging integrations where possible, not only fixtures.

#### 4. Desktop E2E Tests

Use Electrobun flows for:

- native window attach
- overlay behavior
- reattach after navigation
- multi-app running states

#### 5. Live Staging Smoke Tests

Nightly or pre-release, run real-game smoke suites against staging or dev deployments for all four supported apps.

### Per-App Verification Matrix

#### Hyperscape

Login works:

- wallet auth succeeds
- character ID resolves
- embedded viewer loads
- correct entity is followed

Game plays:

- viewport shows a live moving entity
- timeline/logs update over time
- goal changes or quick actions are reflected

Agent connects:

- session state is `running`
- agent status is visible
- operator message reaches `/api/agents/:id/message`

#### Babylon

Login works:

- Babylon credentials are valid
- viewer or dashboard can authenticate

Game plays:

- activity feed updates
- team status updates
- recent trades and market state update

Agent connects:

- agent status endpoint resolves
- team chat works
- SSE stream stays alive

#### 2004scape

Login works:

- viewer auto-login completes in a real browser
- no manual input required

Game plays:

- bot is observed performing actions after launch
- bot remains connected over time

Agent connects:

- Milady can read bot/runtime status
- operator steering reaches the bot runtime

#### Defense Of The Agents

Login works:

- viewer loads in Milady without blocking overlays
- wrapper credentials/register flow succeeds

Game plays:

- autoplay starts
- telemetry changes over time
- recent activity feed advances

Agent connects:

- session polling returns live strategy/hero state
- operator commands produce observable state changes

### Required Proof For "Done"

We should not call an app "working" until all of the following are true:

- Login is proven in a real browser or desktop run.
- The viewer shows a real live session, not just a loaded page.
- The agent is proven connected and active.
- User chat or steering produces an observable effect.
- The app run survives viewer detachment where the product claims background support.
- Failures are surfaced explicitly and recoverably.

## Recommended Immediate Priorities

1. Finish the run-control plane so the product can support multiple persistent apps.
2. Complete and live-verify Hyperscape using the embedded native control surface.
3. Turn Babylon from a terminal panel into a real operator dashboard.
4. Add real 2004scape runtime visibility and autonomous-run verification.
5. Diagnose the Defense viewer/login issue in the real target environment.
6. Remove stale `Dungeons` and `Agent Town` support metadata and references.

## Bottom Line

Milady already has meaningful pieces of the product:

- curated app selection
- a generic app shell
- real wrapper logic for Babylon and Defense
- a promising Hyperscape embedded path
- 2004scape auto-auth plumbing

But the current system is still below the bar for the product you described. The biggest gaps are not cosmetic. They are structural:

- no real multi-run model
- too much mocked confidence
- inconsistent app-specific surfaces
- insufficient proof of live login, connection, and autonomous play

The right production path is:

- first-class persistent app runs
- app-specific operator surfaces
- truthful testing against real integrations
- explicit health, status, and recovery for long-running autonomous agents
