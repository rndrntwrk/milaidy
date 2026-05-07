# LifeOps Implementation Plan

Date: 2026-04-06
Depends on:

- `docs/lifeops/2026-04-06-lifeops-prd-v2.md`
- `docs/lifeops/2026-04-06-lifeops-critical-assessment.md`

## 1. Implementation posture

Do not rebuild LifeOps from scratch.

The implementation strategy should be:

- keep the existing LifeOps backend as the core source of truth
- extend it where the PRD demands new primitives
- build the missing product shell around it
- validate each phase with real LLM scenarios before broadening scope

The correct sequencing is:

1. make `brush teeth` real end to end
2. make adaptive presence and timing real enough to trust
3. make the client surfaces real
4. make blocker and channel loops real
5. then broaden into richer integrations and new sensing

## 2. Product and data-model changes

## 2.1 Brush-teeth slot model

Add a formal pattern for parent routines with independently tracked slots.

Target outcome:

- one parent routine definition
- two slot identities:
  - `morning`
  - `night`
- separate streaks and metrics per slot

Recommended implementation:

- keep existing `times_per_day` cadence support
- add slot-level analytics records or computed summaries keyed by `definition_id + slot_key`
- keep occurrence rows as the operational truth
- add a derived `slot_stats` view or table for streaks and adherence

## 2.2 Streaks and reinforcement

Add support for:

- current streak
- longest streak
- last completion at
- last missed date
- weekly and monthly adherence percentages

Recommended implementation:

- compute slot streaks from occurrence history
- cache results in a small summary table or materialized view when needed
- expose streak summaries in overview APIs and chat formatting

## 2.3 Reminder intensity and annoyance controls

Add a first-class reminder preference model.

Suggested enum:

- `minimal`
- `normal`
- `persistent`
- `high_priority_only`

This should influence:

- number of reminder steps
- repeat interval within a window
- escalation permission thresholds
- re-nudge behavior after ignored in-app reminders

## 2.4 Day-boundary and active-state model

Add a formal `activity_signal` ingestion layer.

Suggested data sources:

- Milady app interaction
- desktop idle state
- desktop focus or recent foreground activity where available
- completion timestamps
- calendar density
- reminder acknowledgement
- mobile wake or sleep data later

Suggested representation:

- `signal_type`
- `source`
- `observed_at`
- `confidence`
- `metadata_json`

Then compute:

- `awake_probability`
- `active_probability`
- `day_open`
- `current_phase` such as morning, daytime, evening, late_night

## 3. Engineering workstreams

## 3.1 Workstream A: Seeded routine framework

Goal:

- define reusable LifeOps seeds for the first core routines

Deliverables:

- seed catalog for `brush teeth`, `Invisalign`, `drink water`, `stretch`, `vitamins`, `workout`, `shower`, `shave`
- seed installer for a user profile
- seed defaults for reminder intensity, windows, and message copy

Recommended files:

- `packages/agent/src/lifeops/seeds.ts`
- `packages/agent/src/lifeops/seed-catalog.ts`
- `scripts/lifeops-seed.ts`

Notes:

- seeds should be editable templates, not magic hard-coded demos
- the first seed must also be the first live acceptance scenario

## 3.2 Workstream B: Adaptive sensing and day-boundary inference

Goal:

- move from chat-history-only activity inference to actual presence inference

Phase B1:

- ingest desktop idle state where available
- ingest Milady app interaction events
- emit normalized activity signals

Phase B2:

- infer likely wake and sleep boundaries
- add the greater-than-three-hour inactivity rule as the initial day-close heuristic
- explicitly handle all-nighter and night-owl scenarios

Phase B3:

- add mobile wake and sleep signals later
- optionally add screen-time and biometric proxies with explicit consent

Recommended files:

- `packages/agent/src/activity-profile/signals.ts`
- `packages/agent/src/activity-profile/ingest.ts`
- `packages/agent/src/activity-profile/day-boundary.ts`
- `apps/app/electrobun/src/native/desktop.ts`
- client telemetry hooks in app surfaces

## 3.3 Workstream C: Conversational LifeOps parser upgrade

Goal:

- keep the current `LIFE` action, but stop relying on regex fallback as the main safety net

Recommended approach:

- use structured LLM extraction for LifeOps intent and parameters
- keep regex fallback only as a last-resort guardrail
- add multilingual and style-variant examples directly into extractor prompts

Needed capabilities:

- distinguish routine versus goal versus one-off
- infer cadence when the user is imprecise
- resolve slot-specific routines like morning and night brushing
- parse changes like "remind me less"
- parse blocker policies

Recommended files:

- extend `packages/agent/src/actions/life.ts`
- add `packages/agent/src/actions/life.extractor.ts`
- add fixtures under `test/lifeops/language/`

## 3.4 Workstream D: Reminder delivery and channel routing

Goal:

- make reminder execution match the breadth of the product model

Phase D1:

- strengthen in-app, SMS, and voice
- add retry policy and connector validation at config time
- add fatigue-aware re-nudge rules

Phase D2:

- add actual reminder delivery integrations for supported private chat channels
- Discord DM
- Telegram private endpoint
- Signal
- WhatsApp
- iMessage

Phase D3:

- add owner-presence-aware routing so the assistant can prefer the currently active private platform

Recommended files:

- `packages/agent/src/lifeops/service.ts`
- `packages/agent/src/lifeops/channel-router.ts`
- `packages/agent/src/lifeops/channel-health.ts`
- connector adapters per platform

Important rule:

- every new channel must support acknowledgement semantics or a clearly documented approximation

## 3.5 Workstream E: Blockers tied to LifeOps

Goal:

- block distracting sites until required obligations are met

Needed model:

- `requirement_policy`
- `unlock_policy`
- `blocked_site_set`
- `reason_renderer`

Initial requirement mappings:

- `morning_brush_teeth`
- `daily_workout`

Recommended files:

- `packages/agent/src/lifeops/blocker-policy.ts`
- `packages/agent/src/api/website-blocker-routes.ts`
- app surfaces showing why a site is blocked

Behavior:

- if `morning_brush_teeth` is incomplete, selected sites remain blocked
- completion opens a temporary unlock window
- workout completion can open another unlock window

## 3.6 Workstream F: Calendar agent view and event search

Goal:

- turn calendar from raw connector data into an operating surface

Phase F1:

- compact widget for today
- next-event detail
- preparation checklist
- linked emails

Phase F2:

- fuller day agenda and week view
- natural-language event search and ranking
- cached event retrieval by topic and relevance

Recommended files:

- new web or app LifeOps calendar components under client code
- extend `packages/agent/src/lifeops/service.ts` search and ranking surfaces

## 3.7 Workstream G: Email operating surface

Goal:

- make email triage actionable inside LifeOps

Phase G1:

- inbox queue for reply-needed messages
- follow-up suggestions
- draft and send flow

Phase G2:

- search by topic, person, and unresolved state
- agent-owned email or alias strategy
- piping important email state into LifeOps dashboard and chat

Recommended files:

- email queue components in client code
- richer search methods in LifeOps service

## 3.8 Workstream H: Screen capture and context inference

Goal:

- make screen capture a real contextual signal for LifeOps

Approach:

- prefer the TypeScript `plugin-vision` path
- validate on the real Milady desktop runtime, not only plugin-local tests
- use OCR and screen-state summaries as secondary context signals, not primary truth

Phase H1:

- prove capture availability and OCR reliability on Milady desktop
- log signal quality

Phase H2:

- feed coarse context into activity inference
- for example work context versus leisure context

Important boundary:

- LifeOps should not depend on fragile pixel inference to know basic wake-state
- screen context should refine reminder relevance, not define the whole schedule model

## 3.9 Workstream I: Telegram direction

Goal:

- support Telegram as a private assistant channel without locking the product into bot-only assumptions

Recommended approach:

- short term: use existing Telegram bot connector as a fallback
- medium term: evaluate a user-account path on Mac using an MTProto-style tool such as `tg-cli`
- keep this behind an experimental boundary until security, policy, and reliability are clear

Cloud dependency:

- if user-account bridging requires secrets, sessions, or long-lived service management, use `../cloud`

## 3.10 Workstream J: Client surfaces

Goal:

- make LifeOps visible and controllable in the actual Milady clients

Minimum required surfaces:

- Today panel
- routine cards
- reminder inspection
- streak and adherence badges
- blocker status
- calendar widget
- email queue
- channel preferences

Suggested directory:

- `apps/web/src/lifeops/` or equivalent app package path

Important point:

- current app code effectively has no LifeOps UI surface
- this work is not polish, it is product completion

## 4. Phase plan

## Phase 0: Brush teeth end to end

Goal:

- prove the product loop on the smallest meaningful routine

Includes:

- parent routine plus morning and night slots
- streak support
- reminder intensity baseline
- active-window reminders
- completion metrics
- first live-LLM scenario

Exit criteria:

- user can create the routine through chat with a real model
- morning reminder fires when user is active
- completion updates streaks and metrics
- night reminder fires later in the same inferred day

## Phase 1: Daily routine pack and blocker linkage

Includes:

- Invisalign
- drink water
- stretch
- vitamins
- workout
- blocker gating tied to brushing and workout

Exit criteria:

- all seeds install cleanly
- blocker logic explains itself
- live scenarios pass across routine, sparse, and irregular users

## Phase 2: Adaptive activity inference

Includes:

- desktop idle and app-interaction signal ingestion
- day-boundary inference
- all-nighter handling

Exit criteria:

- morning and night timing adapt based on real recent signals
- day closure requires a meaningful inactivity gap

## Phase 3: Calendar and email as operating surfaces

Includes:

- calendar view
- event search and ranking
- reply-needed email queue
- draft and send flow

Exit criteria:

- user can operate day planning and inbox follow-through from Milady

## Phase 4: Cross-channel escalation

Includes:

- richer channel execution
- response-aware routing
- reminder intensity controls

Exit criteria:

- the assistant can escalate through private channels without feeling spammy

## Phase 5: Screen context, mobile signals, and Telegram user path

Includes:

- screen-capture context integration
- mobile wake and sleep signals
- experimental MTProto Telegram path

Exit criteria:

- contextual awareness is clearly improving reminder quality
- optional advanced channel paths are gated and safe

## 5. Cloud plan

Use `../cloud` selectively.

Keep local:

- routine state
- occurrence state
- local-first reminders when possible
- desktop sensing

Use cloud for:

- managed OAuth callbacks and refresh handling
- webhook-style connectors
- durable external gateway delivery
- secret brokering
- experimental Telegram bridging if needed
- agent-owned email identity if adopted

## 6. Recommended immediate next actions

1. Implement the slot-plus-streak model for `brush teeth`.
2. Add a seed installer for the brush-teeth routine.
3. Build the first live scenario runner around that seed.
4. Wire real desktop activity signals into the activity profile.
5. Add the first minimal client surface for Today, reminder inspection, and streak display.

That sequence keeps the project honest: one real daily-support loop, fully instrumented, before broadening scope.
