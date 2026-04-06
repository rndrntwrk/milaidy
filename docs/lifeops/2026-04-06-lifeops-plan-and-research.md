# LifeOps Plan And Research

Date: 2026-04-06
Status: For review before implementation
Companion docs:
- `docs/lifeops/2026-04-06-lifeops-prd-v2.md`
- `docs/lifeops/2026-04-06-lifeops-critical-assessment.md`
- `docs/lifeops/2026-04-06-lifeops-implementation-plan.md`
- `docs/lifeops/2026-04-06-lifeops-testing-plan.md`

## 1. Goal clarification

The request is not to bolt on a few habits. The request is to turn LifeOps into a reliable adaptive personal-operations system inside Milady that can:

- understand natural-language setup and follow-up through a real LLM
- seed important routines and one-off tasks
- infer when the user is active, when morning and night likely are, and when a day has actually ended
- proactively message the user on the right authorized channel
- use calendar and email as real operating context, not decorative integrations
- enforce blocker policies tied to real completion states
- eventually use screen context as another signal source
- prove all of that with seeded, end-to-end, live-LLM scenario tests

The immediate product goal is to make the first mandatory path real:

- `brush teeth`
- modeled as one routine with two daily slots, morning and night
- reminded based on inferred user activity
- tracked through completion, acknowledgement, and streak-like metrics
- verified by a real LLM talking to the actual Milady agent and asserting on backend state

The broader implementation goal is to extend that same system to:

- Invisalign
- drink water
- stretch
- vitamins with meals
- workout
- shower
- shave
- calendar and email management
- cross-channel escalation
- website unlocking tied to completion

This matters because the current codebase already has much of the backend substrate. The hard part is finishing the adaptive loop, channel loop, and proof harness so LifeOps is a working product rather than a partially surfaced capability.

## 2. Current baseline

LifeOps is not greenfield in this repository.

Already real:

- durable shared LifeOps contracts in `packages/shared/src/contracts/lifeops.ts`
- a substantial backend service in `packages/agent/src/lifeops/service.ts`
- occurrence materialization for `daily`, `weekly`, `once`, and `times_per_day` cadences in `packages/agent/src/lifeops/engine.ts`
- a recurring scheduler worker in `packages/agent/src/lifeops/runtime.ts`
- a conversational `LIFE` action in `packages/agent/src/actions/life.ts`
- activity-profile analysis and proactive planning in `packages/agent/src/activity-profile/*`
- Google Calendar and Gmail integration
- Twilio SMS and voice reminder delivery
- website blocker APIs and live tests
- app-core LifeOps UI surfaces for overview, Google connection, and tasks/calendar widgets
- smoke and live-test foundations, including trajectory routes

Important implication:

- morning/night brushing already maps cleanly onto existing `times_per_day` cadence slots
- the main missing work is not basic CRUD or scheduling
- the main missing work is adaptive sensing, stronger conversational extraction, richer reminder routing, streak/adherence product logic, blocker linkage, and live-LLM scenario verification

## 3. Constraints, dependencies, and hard requirements

## 3.1 Product constraints

- Desktop-first must work without waiting on mobile biometrics.
- The system must adapt to irregular users instead of forcing a rigid schedule.
- The assistant must be proactive, but not spammy.
- The user must be able to reduce or increase reminder frequency conversationally.
- We cannot treat mock-only tests as acceptance.
- The system must know the difference between an acknowledgement, a snooze, a skip, and a completion.

## 3.2 Codebase constraints

- We should extend the current LifeOps service rather than replace it.
- Existing `times_per_day` slot support should be reused.
- Existing Google, Gmail, Twilio, website blocker, and trajectory infrastructure should be treated as anchor systems.
- The current `LIFE` action has useful structured behavior but falls back to regex classification; that is not strong enough for the target product.
- Current activity inference is message-history and calendar heavy; it is not yet a true desktop presence model.

## 3.3 Integration dependencies

- Google Calendar and Gmail are already the primary external productivity integrations.
- Twilio is the current production reminder channel path for SMS and voice.
- Website blocking depends on `@miladyai/plugin-selfcontrol`.
- Desktop sensing depends on Milady desktop surfaces in `apps/app/electrobun`.
- Screen capture depends on Milady’s native screencapture plumbing and any future `plugin-vision` adoption.
- If we pursue Telegram as a user account rather than a bot, that is a distinct MTProto workstream and should not be confused with current bot-token paths.
- If API-managed connectors are required, `../cloud` is the relevant sibling system.

## 3.4 Delivery constraints

- No stubs should be introduced as a fake completion path for requested core features.
- We need phased delivery because some requested items are materially different in difficulty:
  - seeded routines and streaks are tractable now
  - desktop activity inference is tractable now
  - richer channel routing is moderate
  - Telegram MTProto user control is high risk
  - mobile biometric ingestion is later-phase
  - production-grade screen-aware LifeOps inference is later-phase

## 4. Edge cases that must shape the implementation

- users with routine schedules
- night owls
- early birds
- frequent all-nighters
- users with fragmented sleep
- users with long active periods after midnight
- users who do not respond on one channel but do on another
- users who acknowledge reminders without completing the task
- users who complete tasks late but within the same effective day
- tasks whose timing depends on inferred meal windows rather than fixed clock times
- blocker policies that should unlock for a limited window, not indefinitely
- users who ask in terse language, verbose language, slang, older/formal language, or non-English phrasing
- Gmail and calendar connectors present for only the owner, only the agent, or both
- channel connectors present but unhealthy or unauthorized

## 5. Existing patterns, APIs, and libraries to use

## 5.1 Existing internal patterns

Use these as the default implementation pattern instead of inventing parallel systems:

- `packages/agent/src/lifeops/service.ts`
  - source of truth for LifeOps operations and connector-aware behavior
- `packages/agent/src/lifeops/engine.ts`
  - occurrence materialization and cadence handling
- `packages/agent/src/lifeops/runtime.ts`
  - recurring scheduler execution
- `packages/agent/src/actions/life.ts`
  - current conversational bridge that should be upgraded, not replaced blindly
- `packages/agent/src/activity-profile/analyzer.ts`
  - deterministic profile derivation pattern
- `packages/agent/src/activity-profile/proactive-planner.ts`
  - pure planning function pattern for nudges and proactive messaging
- `packages/agent/src/api/lifeops-routes.ts`
  - API surface and contract boundary
- `packages/app-core/src/components/chat/widgets/plugins/lifeops-overview.tsx`
  - current client overview surface
- `packages/app-core/src/components/settings/LifeOpsSettingsSection.tsx`
  - current connector setup pattern

## 5.2 Existing external integrations already in use

- Google OAuth plus Calendar/Gmail access
- Twilio for SMS and voice
- `@miladyai/plugin-selfcontrol` for blocking
- trajectory capture routes for auditability

## 5.3 External references relevant to the requested roadmap

- [plugin-vision](https://github.com/elizaOS-plugins/plugin-vision)
  - relevant for future screen-aware OCR/vision signal ingestion
  - current repository state indicates useful direction, but not a proven LifeOps-ready desktop signal path
- [tg-cli](https://github.com/miolamio/tg-cli)
  - relevant if the product truly requires Telegram user-account automation without BotFather
  - this is materially different from the current Telegram bot plugin path

## 5.4 Architectural pattern choice

The right pattern is:

- durable operational state in LifeOps tables and contracts
- deterministic planners for cadence, day-boundary, and reminder routing
- LLM used for interpretation, summarization, and conversational formatting
- hard policy code for permissions, blockers, escalation limits, quiet hours, and side effects

We should not let the LLM become the policy engine.

## 6. Proposed architecture

## 6.1 Core subsystems

The full implementation should be organized into these subsystems:

1. LifeOps domain and scheduling
2. Activity signal ingestion and day-boundary inference
3. Conversational extraction and command resolution
4. Reminder routing and acknowledgement tracking
5. Calendar and email operational context
6. Blocker policy and unlock windows
7. Client surfaces and settings
8. Live-LLM scenario testing and trajectory verification

## 6.2 Domain model direction

Keep the current definition/occurrence model.

Add or derive:

- seeded routine templates
- slot-level summaries for `times_per_day` definitions
- streak and adherence summaries
- reminder intensity preference
- activity signal records
- inferred current phase for the user day
- blocker requirement mappings
- richer acknowledgement state and channel provenance where needed

Preferred shape:

- occurrence rows remain the operational truth
- summary/stateful views derive:
  - current streak
  - longest streak
  - completion rate
  - overdue state
  - current active phase
  - unlock eligibility

## 6.3 Data flow

High-level flow:

1. User expresses a need in chat.
2. Conversational extractor resolves the request into LifeOps intent plus parameters.
3. LifeOps service creates or updates definitions, reminder plans, channel policies, or workflows.
4. Scheduler materializes occurrences and processes reminder windows.
5. Activity-signal ingestion updates current presence, wake likelihood, and day-phase inference.
6. Reminder router selects the best authorized channel based on:
   - user activity
   - platform responsiveness
   - configured intensity
   - urgency
   - quiet hours
7. Reminder attempts, acknowledgements, snoozes, and completions feed back into LifeOps state and analytics.
8. Calendar and Gmail sync enrich next-action context and proactive messaging.
9. Blocker policies query LifeOps state to decide whether sites stay blocked or unlock.
10. Live-LLM tests replay seeded scenarios through the real chat path and assert on the resulting state transitions.

## 6.4 Channel architecture

Separate:

- channel capability
- channel health
- channel preference
- channel availability right now
- escalation policy

Do not hard-code a single preferred platform.

Routing inputs should include:

- connector status
- last active platform
- recent acknowledgement history
- reminder intensity enum
- urgency class
- allowed hours
- max attempts per window

## 6.5 Activity inference architecture

Current profile code should evolve into a signal-aggregation model.

Needed layers:

- raw signals
  - Milady chat activity
  - app interaction events
  - desktop idle and wake signals
  - calendar event timing
  - reminder acknowledgement and completion timing
- normalized signal store
  - timestamp
  - source
  - signal type
  - confidence
  - metadata
- inference layer
  - awake probability
  - active probability
  - likely morning start
  - likely night start
  - effective day boundary
  - meal windows
  - workout window
- planner layer
  - which reminders are relevant now
  - whether the user should be nudged now or later

## 6.6 Testing architecture

The testing system needs four layers:

- deterministic unit tests for planners and inference
- service and API integration tests against seeded state
- client and runtime end-to-end tests
- live-LLM acceptance tests with trajectory capture and hard assertions

This should reuse:

- `test/test-env.ts`
- trajectory routes
- current smoke patterns
- runtime bootstrapping and existing live-test conventions

## 7. Detailed implementation workstreams

## 7.1 Workstream A: Seeded routine catalog

Build a formal seed catalog for:

- brush teeth
- Invisalign
- drink water
- stretch
- vitamins
- workout
- shower
- shave

Requirements:

- editable seed definitions, not demo hacks
- support owner-specific timezone and preferences
- support default cadence guesses when user intent is underspecified
- support per-routine message copy and reminder intensity defaults

First acceptance slice:

- brush teeth as one `times_per_day` definition with morning and night slots

## 7.2 Workstream B: Streaks, adherence, and encouragement

Add:

- slot-level streak computation
- longest streak
- adherence percentages
- overdue heuristics for weekly hygiene items
- lightweight reinforcement response formatting

Important rule:

- encouragement must be grounded in real computed state
- no congratulatory hallucinations

## 7.3 Workstream C: Activity signal ingestion and day-boundary inference

This is the most important systems work after seeded routines.

Needed implementation:

- desktop idle or recent input signal ingestion
- app interaction telemetry hooks
- normalized signal persistence
- effective-day boundary logic with the requested `> 3 hours` inactivity heuristic as the initial default
- special-case handling for all-nighters and prolonged wake periods

Acceptance bar:

- the system should stop treating midnight as an automatic reset
- morning and night reminders should be based on inferred user state, not only static slots

## 7.4 Workstream D: Conversational extraction upgrade

Replace regex-first behavior with extractor-first behavior.

Needed capabilities:

- create routines and one-offs from loose language
- interpret slot-specific requests
- infer reasonable defaults
- recognize reminder intensity changes
- recognize blocker policies
- recognize acknowledgements versus completions

Implementation note:

- keep regex fallback only as a narrow guardrail
- do not remove structured parameter handling that already works

## 7.5 Workstream E: Reminder router and escalation

Needed work:

- formal reminder intensity enum and storage
- per-window attempt caps
- acknowledgement semantics
- fatigue-aware re-nudging
- channel health checks
- platform preference based on current activity

First production scope should likely be:

- in-app
- SMS
- voice

Second scope:

- currently connected private chat channels that can support acknowledgement semantics cleanly

## 7.6 Workstream F: Calendar and email operationalization

The product requirement here is stronger than just syncing data.

Calendar work:

- reliable event search and ranking
- cached upcoming-event context
- widget and chat visibility
- event-aware proactive reminders
- clean event create/update flows

Email work:

- triage for likely replies needed
- list of messages awaiting response
- draft generation
- send with confirmation or trusted policy
- thread-oriented closeout state
- searchable message context in chat

Implementation principle:

- keep read paths highly reliable
- keep write/send paths explicit and auditable

## 7.7 Workstream G: Blockers tied to real completion

Needed work:

- requirement policies linked to LifeOps definitions or slot keys
- unlock windows after completion
- visible reason strings in the client
- combined requirements such as:
  - morning brush teeth before social feeds
  - workout before feeds

We should not hide blocker reasons behind generic errors.

## 7.8 Workstream H: Client surfaces

Current app-core surfaces exist, but the product shell is incomplete.

Needed UI expansion:

- seeded routine install and edit flow
- richer overview with streak/adherence
- explanation view for why a reminder fired
- acknowledgement, snooze, skip, and complete controls
- channel and intensity settings
- blocker-policy explanation and state
- clearer calendar and inbox operational panes

## 7.9 Workstream I: Screen context

This should be treated as an advanced signal workstream, not phase-one critical path.

Needed eventually:

- reliable screen capture plumbing on target platforms
- OCR extraction
- privacy and permission handling
- patch-based or region-based analysis if needed
- signal normalization into activity/profile systems

Important constraint:

- current plugin and desktop capture paths are not enough evidence to make this a release blocker for brush-teeth and routine support

## 7.10 Workstream J: Telegram user path

Treat this as a separate decision gate.

There are two very different options:

- current bot/plugin style integration
- true user-account MTProto integration

If the requirement is explicitly "do not use BotFather," then this becomes a dedicated MTProto project with security, session, and operational consequences. It should not be silently folded into the ordinary reminder-channel workstream.

## 8. Recommended sequencing

Phase 0: plan approval

- lock product decisions listed in section 11

Phase 1: prove the first vertical slice

- seeded `brush teeth`
- slot-aware overview
- streak/adherence computation
- live-LLM acceptance scenario for setup, reminder, completion, and metrics

Phase 2: make adaptive timing credible

- activity signal ingestion
- day-boundary inference
- morning/night window calibration
- reminder intensity controls

Phase 3: broaden daily support

- Invisalign
- drink water
- stretch
- vitamins
- workout
- blocker-policy linkage

Phase 4: operational integrations

- deeper calendar actions and search
- email triage/draft/send loop
- richer cross-channel routing

Phase 5: advanced channels and context

- Telegram user path if approved
- screen-aware signals
- mobile wake/sleep ingestion

## 9. Risks and weaknesses

## 9.1 Product risks

- Proactivity can become annoying if routing and intensity are not tuned.
- If day-boundary inference is wrong, reminders will feel stupid fast.
- If acknowledgements and completions blur together, blocker and streak logic will be untrustworthy.
- If send authority for email is too loose, the product will be unsafe.

## 9.2 Technical risks

- The current `LIFE` action fallback is too brittle for multilingual and style-variant requests.
- Desktop idle signal quality may vary by platform and permissions.
- Reminder routing across multiple private platforms can become fragmented without a unified acknowledgement model.
- Telegram MTProto support could consume disproportionate engineering time.
- Screen-aware inference can become expensive, invasive, and noisy if introduced too early.

## 9.3 Testing risks

- Live-LLM tests can drift if prompts and model behavior change.
- Judge-model-only validation is insufficient.
- Time-dependent tests can become flaky without deterministic seeding and controlled clocks.
- Channel integration tests can become brittle if they rely on live third-party services for every CI run.

## 10. Unknowns that must be resolved during implementation

- Best desktop-level idle/activity signal source for each supported platform
- whether activity signals should be persisted as a new LifeOps table or attached to existing audit/event storage
- exact unlock-window semantics for blocked sites
- whether “I did it” should complete the most relevant visible occurrence only or ever complete multiple occurrences
- whether vitamins should be modeled as one meal-aware definition or separate breakfast/dinner slots
- how to represent “annoying enough but not too annoying” in concrete routing policy defaults
- whether the first release should include any non-Twilio outbound path beyond in-app chat

## 11. Clarifying decisions needed from product

These are the main decisions that should be answered before implementation starts in earnest:

1. For `brush teeth`, should morning and night remain one definition with two slots, or do you want two separately editable routines that also roll up together in analytics?
2. For blocker unlocks, do you want:
   - a fixed unlock duration after completion
   - unlocked for the rest of the effective day
   - or both, depending on the routine?
3. For email send authority, should the default be:
   - draft only
   - explicit per-send confirmation
   - or trusted auto-send for approved categories?
4. For the first reminder-channel milestone, is success:
   - in-app plus SMS plus voice
   - or must Telegram user-account messaging be in the first implementation wave?
5. Should mobile wake/sleep and biometric proxies be treated as required for v1, or explicitly deferred behind desktop-first completion?

## 12. Recommended next step

Approve this plan, answer the product decisions in section 11, and then implementation should begin with the first end-to-end slice:

- seeded `brush teeth`
- streak and metrics support
- adaptive reminder timing using current profile plus new desktop activity signals
- live-LLM acceptance runner that proves the setup and completion path against real Milady state

That path gives the fastest route to a real product proof while keeping the rest of the roadmap structurally aligned.
