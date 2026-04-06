# LifeOps Remaining Work TODOs

Date: 2026-04-06
Owner: Shaw / Milady
Status: In progress
Purpose: Turn every currently identified LifeOps gap into an implementation queue with clear acceptance criteria, dependencies, and QA/setup requirements.

## 1. Desktop Activity Signals

Status: In progress
Priority: P0
Goal: Extend LifeOps beyond message-history inference so reminders can react to real desktop activity.

### Scope
- ingest local computer idle and active state
- ingest Milady app interaction and chat-focus signals
- ingest foreground-app or screen-engagement hints where available
- persist these signals into the activity-profile pipeline
- use them to improve morning/night inference and current-activity routing

### Implementation TODOs
- identify existing desktop/native APIs already available in Milady or Electrobun for idle/activity state
- add a normalized activity-event model that the activity-profile service can read
- update [packages/agent/src/activity-profile/service.ts](/Users/shawwalters/eliza-workspace/milady/packages/agent/src/activity-profile/service.ts) to merge desktop activity with message-derived activity
- update [packages/agent/src/activity-profile/analyzer.ts](/Users/shawwalters/eliza-workspace/milady/packages/agent/src/activity-profile/analyzer.ts) so effective-day and current-activity logic can use non-chat signals
- expose signal state to LifeOps reminder routing and proactive planning
- add integration tests proving reminders prefer real active periods over stale chat-only inference

### Acceptance Criteria
- a user with no recent chat messages but active desktop usage can still be treated as active
- a user idle at the machine is no longer treated as active solely because of old chat traffic
- morning/night inference changes when desktop activity shifts over time

### Current progress
- `packages/agent/src/activity-profile/service.ts` now merges message history, client-chat activity, calendar data, and screen-context samples.
- `packages/agent/src/activity-profile/analyzer.ts` now resolves current activity and effective-day state from both message traffic and screen-context heartbeats.
- `packages/agent/src/activity-profile/service.test.ts` and related analyzer/planner tests now cover recent in-app activity, stale client-chat sessions, and screen-context merges.
- Remaining work is the native desktop idle/foreground-app path from Electrobun RPC so activity does not rely only on Milady-visible signals.

### QA / Setup
- requires a real desktop runtime, not just API-only tests
- verify on macOS at minimum

## 2. Screen Capture And OCR Signal

Status: In progress
Priority: P1
Goal: Feed screen-awareness into LifeOps as a secondary contextual signal.

### Scope
- capture desktop screenshots through existing Milady desktop facilities
- run OCR or vision summarization through the optional vision stack
- convert results into lightweight LifeOps context hints such as work, leisure, transition, or blocked-site context

### Implementation TODOs
- identify the stable screenshot path already available in desktop dev/runtime
- add a LifeOps-facing screen-context service that can request snapshots on a bounded cadence
- integrate OCR or scene-summary extraction without making it a hard runtime dependency when vision is disabled
- store only compact derived context, not raw screenshots, in reminder decision paths
- feed resulting context into reminder relevance and downtime detection
- add tests around signal ingestion, disabled-plugin behavior, and context classification

### Current progress
- `packages/agent/src/lifeops/screen-context.ts` now provides a bounded sampler over the browser-capture frame file.
- `packages/agent/src/lifeops/screen-context.test.ts` covers disabled frames, OCR-backed classification, cadence throttling, and stale-frame handling.
- `packages/agent/test/lifeops-screen-context.live.e2e.test.ts` adds a live browser-capture smoke test gated behind explicit screen/live env flags.
- Remaining work is to wire this signal into the main activity-profile and reminder-routing loop.

### Acceptance Criteria
- LifeOps can consume a screen-context summary when vision is enabled
- reminder timing can differentiate between work-focused and leisure-focused desktop sessions
- the feature degrades cleanly when vision is unavailable

### QA / Setup
- requires `@elizaos/plugin-vision` and any native dependencies it needs
- requires desktop screenshot permissions on the host OS

## 3. Mobile Wake/Sleep And Biometric Proxies

Status: Not started
Priority: P2
Goal: Add optional mobile wake/sleep and health-adjacent signals after desktop-first completion.

### Scope
- collect phone wake and sleep proxies
- collect screen-time style active/inactive windows where platform APIs allow
- gate all mobile or biometric-like collection behind explicit consent

### Implementation TODOs
- audit existing Capacitor/mobile app bridges for available wake, screen-time, and health APIs
- design a consented mobile-signal record format that fits the existing activity-profile model
- implement Android and iOS signal collection only for supported signals
- sync mobile signal summaries into the agent runtime without making them required for desktop behavior
- add settings UI for consent state and current signal availability
- add tests for consent gating, missing platform APIs, and merge behavior with desktop signals

### Acceptance Criteria
- mobile signals are optional, explicit-consent-only, and additive
- activity-profile inference can incorporate wake/sleep hints when present
- desktop-only users still function normally

### QA / Setup
- needs real Android and iOS devices or emulators
- requires platform permissions and any store-entitlement work

## 4. Telegram User-Account Path

Status: Not started
Priority: P2
Goal: Support a Telegram user-account route instead of relying only on BotFather-style bot tokens.

### Scope
- evaluate and implement a local user-account execution path, ideally around `tg-cli` or an equivalent MTProto-capable tool
- preserve the current bot path as a fallback
- make channel routing aware of which Telegram path is active

### Implementation TODOs
- inspect the current Telegram connector surface and isolate the bot-only assumptions
- implement a local Telegram transport wrapper for user-account sends
- define how authentication/session material is stored locally or in cloud-managed mode
- add routing and channel-policy support so LifeOps can target Telegram through the selected transport
- add observability and error reporting for user-account transport failures
- add tests for transport selection and policy gating

### Acceptance Criteria
- LifeOps can target Telegram through a non-bot path when configured
- bot-based Telegram continues to work as fallback
- routing surfaces which transport is active

### QA / Setup
- needs Telegram credentials/session setup on a real machine
- if `tg-cli` is required, it must be installed and verified locally

## 5. Agentic Calendar Surface

Status: In progress
Priority: P1
Goal: Build a first-class calendar UI beyond the current widget surface.

### Scope
- day agenda
- week timeline or calendar view
- event detail inspection
- linked-email context
- create and edit event flows

### Implementation TODOs
- add app-core routes/components for a dedicated calendar page or panel
- wire existing LifeOps calendar APIs into a richer browsing surface
- show event metadata: attendees, location, conference link, preparation checklist, linked mail
- allow event creation and update from the UI
- keep the widget and full-page surface consistent with the same API layer
- add executed UI tests for navigation, rendering, empty states, and update flows

### Acceptance Criteria
- users can inspect today and week-level calendar state in the app
- linked email context is visible from event detail
- create/update flows hit the real LifeOps calendar APIs

### Current progress
- `packages/app-core/src/components/pages/LifeOpsWorkspaceView.tsx` adds an operational LifeOps workspace with agenda, week, and reply-needed email panes.
- `packages/app-core/src/components/pages/AppsView.tsx` now exposes that workspace inside the apps surface.
- The workspace can load calendar feeds, event detail context, create events, inspect linked mail, and draft/send email replies through the real LifeOps APIs.
- Remaining work is a fuller standalone calendar navigation model if the apps surface later needs richer routing than the current embedded workspace.

### QA / Setup
- requires a connected Google calendar account

## 6. Gmail Search And Batch Reply Workflows

Status: In progress
Priority: P1
Goal: Extend Gmail from triage into operational search and follow-up flows.

### Scope
- search mail by query
- search unreplied mail
- batch select reply-needed threads
- draft follow-ups
- optionally send with confirmation or trusted policy

### Implementation TODOs
- add Gmail search APIs to LifeOps service and routes
- support query terms, limits, and likely-unreplied filters
- add batch drafting or guided follow-up support on top of the current draft/send primitives
- add UI affordances or chat tools for “what should I reply to today” and “find all emails about X”
- add tests for ranking, invalid inputs, empty results, and send-policy gating

### Acceptance Criteria
- search and unreplied-thread retrieval work through LifeOps routes
- the user can draft and send follow-ups from real search results
- sends remain gated by confirmation or trusted policy

### Current progress
- `packages/agent/src/lifeops/service.ts`, `packages/agent/src/api/lifeops-routes.ts`, and `packages/shared/src/contracts/lifeops.ts` now expose Gmail search and batch reply draft/send flows.
- `packages/agent/test/lifeops-gmail.e2e.test.ts` exercises search filters, reply-needed retrieval, batch draft generation, invalid inputs, and send gating.
- Remaining work is wiring the new search endpoint into the workspace surface instead of filtering only the loaded triage feed locally.

### QA / Setup
- requires a connected Gmail account with send capability if send QA is desired

## 7. Opportunistic Downtime Nudges

Status: Substantially complete
Priority: P1
Goal: Suggest one-off tasks when the user appears to have downtime.

### Scope
- identify likely downtime windows
- rank available one-off tasks by urgency and relevance
- avoid nudging during overloaded or busy periods

### Implementation TODOs
- define downtime heuristics using activity-profile and calendar state
- add one-off task ranking to proactive-planner
- bias toward deadline-bearing or long-stale one-offs
- avoid sending opportunistic nudges if the user already has active urgent reminders
- add tests for busy-day suppression, real downtime selection, and stale-task prioritization

### Acceptance Criteria
- one-off tasks can be suggested during open space without conflicting with urgent obligations
- downtime nudges are suppressed during active meeting blocks or overloaded reminder states

### Current progress
- `packages/agent/src/activity-profile/proactive-planner.ts` now plans downtime nudges for one-off tasks.
- Planner coverage now includes busy-day suppression, urgent-reminder suppression, screen-busy suppression, and prioritization of the most urgent one-off task.
- Remaining work is mostly tuning with live data rather than missing implementation.

### QA / Setup
- easiest to QA with seeded tasks plus a connected calendar

## 8. Rolodex-Driven Channel Routing

Status: In progress
Priority: P1
Goal: Replace the current mostly `ownerContacts` and channel-policy routing with a fuller owner identity graph.

### Scope
- use the rolodex/contact graph as the source for owner reachability
- map one person across Discord, Telegram, phone, email, and app identity
- persist response history and preferred fallback behavior

### Implementation TODOs
- inspect current rolodex plugin/service capabilities and integrate them into LifeOps routing
- define how channel policies and rolodex records combine without conflicting
- update reminder escalation to prefer rolodex-backed identities over static config
- track response and escalation history per owner endpoint
- add tests proving fallback order across multiple connected endpoints

### Acceptance Criteria
- LifeOps can route through a unified owner identity graph
- static `ownerContacts` config is no longer the only routing source
- escalation decisions can explain which identity record and history led to the selected channel

### Current progress
- `packages/agent/src/config/owner-contacts.ts` now loads rolodex-backed routing hints and platform identities on top of static owner contact config.
- `packages/agent/src/services/escalation.ts` and `packages/agent/src/lifeops/service.ts` now use those hints when resolving fallback routing.
- Remaining work is deeper endpoint history persistence and broader channel coverage beyond the currently connected sources.

### QA / Setup
- requires connected private channels and rolodex population

## 9. Reminder Intensity Model Alignment

Status: Complete
Priority: P2
Goal: Align the implementation with the PRD reminder-intensity semantics.

### Scope
- reconcile current enum values with PRD language
- preserve existing functionality while making the behavior/product meaning clear

### Implementation TODOs
- decide whether to rename the enum or document a translation layer
- update action parsing, service logic, API contracts, and UI labels consistently
- verify global and per-definition preference handling still works
- add migration or compatibility handling for any persisted values if enum names change

### Acceptance Criteria
- the code and PRD use the same reminder-intensity language
- chat phrases map cleanly to the configured behavior

### Current progress
- The contracts and action parsing now use `minimal`, `normal`, `persistent`, and `high_priority_only`.
- Existing reminder controls remain functional while the user-facing phrasing matches the PRD language.

### QA / Setup
- verify old stored values still read correctly if migration is required

## 10. Dedicated Email And Calendar App Surfaces

Status: In progress
Priority: P2
Goal: Move beyond widgets into fuller operational surfaces for LifeOps inbox and calendar.

### Scope
- email list/detail view
- reply-needed list
- draft/send flow
- calendar agenda/week/detail view

### Implementation TODOs
- create app-core navigation entry points for LifeOps operational surfaces
- reuse existing widget/API data models instead of duplicating service logic
- add empty/loading/error states
- add tests for route rendering and primary actions

### Acceptance Criteria
- the user can manage the day’s calendar and inbox without relying only on sidebar widgets or chat

### Current progress
- `LifeOpsWorkspaceView` now covers the combined agenda/week/email surface inside the apps area.
- Remaining work is mostly refinement if the product needs a separately branded inbox/calendar app beyond the current unified workspace.

### QA / Setup
- requires Google connector setup

## 11. Real-Dependency Live Verification Harness

Status: In progress
Priority: P1
Goal: Move remaining externally gated flows into a clear runnable QA matrix.

### Scope
- live LLM chat scenarios
- real Google account validation
- real SMS/voice delivery validation
- real private-channel validation

### Implementation TODOs
- expand the live-run docs into an operator checklist with required env vars and setup order
- add any missing scenario coverage for brush teeth, vitamins, blocker unlocks, and escalation
- separate “provider-backed”, “Google-backed”, and “transport-backed” suites if needed
- ensure skipped-live tests print enough setup context to be actionable

### Acceptance Criteria
- a human operator can run the full live matrix from docs without hunting through code
- remaining skips are environmental, not ambiguous

### Current progress
- `docs/lifeops/2026-04-06-lifeops-testing-plan.md` now contains an explicit operator checklist for live provider, screen, Google, and transport-backed runs.
- `packages/agent/test/lifeops-chat.live.e2e.test.ts` and `packages/agent/test/lifeops-screen-context.live.e2e.test.ts` now skip with clearer setup expectations.
- Remaining work is still the actual live execution with real credentials and devices.

### QA / Setup
- requires real keys, connected accounts, and a reachable device for SMS/voice

## 12. Missing UI Test Coverage

Status: Complete
Priority: P2
Goal: Close gaps where real UI code exists but executed test coverage is thin.

### Scope
- WebsiteBlocker settings card
- any new calendar/inbox full surfaces
- any new mobile consent/settings surfaces

### Implementation TODOs
- add executed tests for [packages/app-core/src/components/settings/WebsiteBlockerSettingsCard.tsx](/Users/shawwalters/eliza-workspace/milady/packages/app-core/src/components/settings/WebsiteBlockerSettingsCard.tsx)
- keep new LifeOps UI surfaces covered from the start

### Acceptance Criteria
- every shipped LifeOps UI surface has executed tests on the normal test path

### Current progress
- `packages/app-core/src/components/settings/WebsiteBlockerSettingsCard.test.tsx` now covers permission requests, validation, timed blocks, and stop-block flows.
- `packages/app-core/src/components/pages/LifeOpsWorkspaceView.test.tsx` covers the new workspace render and action flows.

## Execution Order

1. Desktop Activity Signals
2. Screen Capture And OCR Signal
3. Opportunistic Downtime Nudges
4. Rolodex-Driven Channel Routing
5. Gmail Search And Batch Reply Workflows
6. Agentic Calendar Surface
7. Reminder Intensity Model Alignment
8. Real-Dependency Live Verification Harness
9. Telegram User-Account Path
10. Mobile Wake/Sleep And Biometric Proxies
11. Dedicated Email And Calendar App Surfaces
12. Missing UI Test Coverage
