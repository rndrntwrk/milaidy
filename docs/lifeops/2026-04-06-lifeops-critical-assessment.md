# LifeOps Critical Assessment

Date: 2026-04-06
Scope reviewed:

- current LifeOps contracts, repository, service, runtime worker, and routes
- current `LIFE` conversational action and tests
- activity-profile and proactive worker
- desktop activity and screen-capture surfaces
- local plugin inventory, including vision and Telegram
- adjacent `../cloud` connector capabilities

## 1. Bottom line

Milady already has a real LifeOps backend. This is not a greenfield idea and it is not pure mock theater.

What is real today:

- durable LifeOps contracts and persistence
- task definitions and occurrence materialization
- goals, workflows, reminder plans, channel policies, browser sessions
- Google Calendar and Gmail sync
- Twilio SMS and voice delivery
- X posting
- runtime scheduling for reminders and workflows
- a conversational `LIFE` action
- proactive activity profiling based on message history and calendar data
- smoke tests and trajectory infrastructure

What is not yet real enough for the requested product:

- robust adaptive sensing beyond chat plus calendar
- production-quality multilingual natural-language capture for LifeOps
- streaks and encouragement loops
- real LifeOps UI surfaces in the current app clients
- cross-channel reminder delivery beyond in-app, SMS, and voice
- user-account Telegram or MTProto support
- a dependable screen-capture signal path that has been validated end to end in Milady desktop for LifeOps use
- live-LLM scenario testing that proves behavior across the required edge cases

The correct assessment is:

- the backend is ahead of the product shell
- the current gap is not "LifeOps does not exist"
- the current gap is "LifeOps exists, but the adaptive product loop, UI surface, and proof harness are incomplete"

## 2. What exists and is usable today

### 2.1 LifeOps domain model and persistence

The shared contract and service layer are substantial and coherent.

Implemented primitives include:

- task, habit, and routine definitions
- occurrences with lifecycle state
- goals and goal reviews
- workflows and workflow runs
- reminder plans and reminder attempts
- channel policies
- browser sessions
- Google and X connector status models
- audit events

Evidence:

- `packages/shared/src/contracts/lifeops.ts`
- `packages/agent/src/lifeops/repository.ts`
- `packages/agent/src/lifeops/service.ts`

### 2.2 Scheduling and reminder processing

LifeOps reminders and workflows are actually scheduled by runtime.

The scheduler worker:

- registers a recurring task named `LIFEOPS_SCHEDULER`
- runs every 60 seconds
- calls `processScheduledWork()`

Evidence:

- `packages/agent/src/lifeops/runtime.ts`

This matters because older planning assumptions that reminders were HTTP-only are now outdated.

### 2.3 Conversational bridge

There is a real `LIFE` action today.

It can:

- create definitions
- create goals
- update and delete items
- complete, snooze, and skip occurrences
- query calendar
- query email triage
- capture phone consent
- configure reminder steps
- query overview

Evidence:

- `packages/agent/src/actions/life.ts`
- `packages/agent/src/actions/life.test.ts`
- `packages/agent/src/actions/life-smoke.test.ts`

### 2.4 Google Calendar and Gmail integration

The Google path is not hypothetical.

Implemented:

- connector status and grants
- calendar sync with caching
- next-event context
- Gmail triage sync with caching
- Gmail reply drafting
- Gmail reply sending with explicit confirmation

Evidence:

- `packages/agent/src/lifeops/google-oauth.ts`
- `packages/agent/src/lifeops/google-calendar.ts`
- `packages/agent/src/lifeops/google-gmail.ts`
- `packages/agent/src/lifeops/service.ts`
- `packages/agent/src/api/lifeops-routes.ts`

### 2.5 Reminder channels and escalation primitives

Reminder plans and channel policies are real.

Implemented:

- in-app reminders
- SMS reminders via Twilio
- voice reminders via Twilio
- quiet-hour gating
- urgency gating
- reminder acknowledgement
- reminder inspection and audit

Evidence:

- `packages/agent/src/lifeops/service.ts`
- `packages/agent/src/lifeops/twilio.ts`

### 2.6 Activity-profile and proactive messaging foundations

Milady already has a user-activity inference path.

Implemented:

- activity profiling from message history
- calendar enrichment
- inferred active-hour buckets
- GM, GN, and pre-activity nudge planning
- proactive worker that sends messages to target platforms

Evidence:

- `packages/agent/src/activity-profile/analyzer.ts`
- `packages/agent/src/activity-profile/service.ts`
- `packages/agent/src/activity-profile/proactive-planner.ts`
- `packages/agent/src/activity-profile/proactive-worker.ts`
- `packages/agent/src/providers/activity-profile.ts`

### 2.7 Test and observability foundations

The repo already contains useful building blocks for the testing plan you want.

Implemented foundations:

- live-test env gating in `test/test-env.ts`
- trajectory logging routes in `packages/agent/src/api/trajectory-routes.ts`
- LifeOps smoke checks in `scripts/smoke-lifeops.mjs`
- activity-profile unit tests
- `LIFE` action smoke tests
- deploy smoke runbook

This is enough to build a serious live-LLM acceptance harness without inventing a parallel test universe.

## 3. Major gaps against the requested product

## 3.1 Adaptive sensing is still too narrow

Current activity inference is based primarily on:

- message history
- room source
- calendar event timing

Missing:

- real desktop idle state wired into LifeOps
- foreground-app activity
- app motion or interaction telemetry wired into the profile
- phone wake and sleep state
- mobile screen-time data
- biometric or health-adjacent sleep signals
- day-boundary logic based on sustained absence greater than three hours

Important nuance:

- the desktop app exposes `getPowerState()`
- it currently returns battery status, but `idleState` is effectively `unknown`
- that signal is not wired into `ActivityProfile`

Evidence:

- `apps/app/electrobun/src/native/desktop.ts`
- `packages/agent/src/activity-profile/service.ts`
- `packages/agent/src/activity-profile/types.ts`

Impact:

- Milady can approximate morning and night
- it cannot yet robustly infer true wake versus sleep boundaries for irregular users

## 3.2 Streaks do not exist yet

The requested product explicitly wants:

- streaks for brush teeth
- streak-like reinforcement for shower and shave
- encouragement like "that's your fifth time in a row"

Current state:

- completions exist
- recent completion history can be derived for goals
- there is no first-class streak model or streak computation in LifeOps

Evidence:

- no `streak` references in `packages/agent/src/lifeops`
- no encouragement logic in the LifeOps action layer

Impact:

- the system can record completion
- it cannot yet deliver the motivational loop the PRD calls for

## 3.3 Current natural-language capture is still brittle

The `LIFE` action is useful but not robust enough to be the final conversational layer.

Current behavior:

- explicit action parameters work well when the LLM structured call is good
- fallback behavior uses a regex-based intent classifier

Evidence:

- `classifyIntent()` in `packages/agent/src/actions/life.ts`
- fallback tests in `packages/agent/src/actions/life-smoke.test.ts`

Why this matters:

- your testing plan requires older and younger voice styles
- sparse and verbose phrasing
- multilingual inputs
- messy real user language

Regex fallback is not enough for:

- code-switching
- indirect phrasing
- multilingual requests
- colloquial or highly compressed language
- ambiguous requests that require deeper semantic extraction

Impact:

- the current `LIFE` action is good enough as a bridge
- it is not good enough to be the final authoritative parser for LifeOps

## 3.4 Cross-channel delivery is mostly modeled, not implemented

The contracts enumerate many reminder channels:

- telegram
- discord
- signal
- whatsapp
- imessage

Current runtime delivery implementation supports:

- `in_app`
- `sms`
- `voice`

Other reminder channels currently fall through to `unsupported_channel`.

Evidence:

- `packages/shared/src/contracts/lifeops.ts`
- `dispatchReminderAttempt()` in `packages/agent/src/lifeops/service.ts`

Impact:

- the product can talk about multi-channel escalation
- the actual channel execution layer is still narrow today

## 3.5 Telegram is bot-oriented, not user-account oriented

The existing Telegram plugin is a bot plugin that expects bot tokens and webhook or polling setup.

Evidence:

- `../plugins/plugin-telegram/typescript/src/service.ts`
- `../plugins/plugin-telegram/package.json`

This is not the same as:

- user-account MTProto access
- "use Telegram on my Mac"
- `tg-cli`-style user automation

Impact:

- Telegram bot integration exists
- the requested "do not use BotFather if possible" direction is still net-new

## 3.6 Screen capture is promising but not yet a dependable LifeOps signal

What exists:

- `plugin-vision` has a TypeScript implementation that advertises screen capture and OCR
- the plugin README marks TypeScript as production-ready and Rust as in development
- the Milady desktop app exposes screen-capture RPC methods

But:

- parts of the desktop screen-capture path are still graceful stubs
- the Rust vision service still contains placeholder methods
- the LifeOps layer is not yet consuming screen-capture context as an activity signal

Evidence:

- `../plugins/plugin-vision/README.md`
- `../plugins/plugin-vision/rust/src/service.rs`
- `apps/app/electrobun/src/rpc-schema.ts`

Impact:

- screen capture is a realistic near-term dependency
- it should not be treated as solved until validated on the actual Milady desktop runtime path

## 3.7 No real LifeOps UI exists in current app code

Current search result:

- zero `LifeOps` references in `apps/web/src`
- zero `LifeOps` references in `apps/app/src`
- zero `LifeOps` references in `apps/app/electrobun/src` outside backend plumbing and generic RPC surfaces

Impact:

- the backend exists
- the user-facing product surfaces for routines, reminders, blockers, goal review, calendar agent view, and email queue do not yet exist in the current clients

This is one of the biggest product gaps.

## 3.8 Calendar support is strong, but calendar search and ranking are still shallow

Implemented:

- feed retrieval
- cache
- next-context
- linked email lookup for next event

Missing or shallow:

- general keyword search across events
- ranked event retrieval beyond "next relevant event"
- conversational event search for vaguely described future events
- richer cached retrieval by topic or intent

Impact:

- the system is strong for "what is next" and "what is on my calendar today"
- it is weaker for broader semantic retrieval against the user's calendar corpus

## 3.9 Gmail drafting is deterministic, not LLM-native

Gmail reply drafting exists, but it is built through deterministic service logic rather than a live LLM drafting pipeline.

Evidence:

- `buildGmailReplyDraft()` in `packages/agent/src/lifeops/service.ts`

Impact:

- predictable drafts are useful
- the product goal of "agent helps me draft responses" is only partially met until drafting quality is evaluated with real models and real inbox scenarios

## 3.10 Website blocking is not yet driven by LifeOps completion state

What exists:

- website blocker routes
- platform website-blocker plugin

Missing:

- first-class policy linking blocker release to completion of `morning_brush_teeth`
- first-class policy linking blocker release to completion of `daily_workout`
- unblock duration policies tied to LifeOps outcomes
- explainability from blocker to unmet LifeOps requirement

Evidence:

- `packages/agent/src/api/website-blocker-routes.ts`

Impact:

- the blocker capability exists
- the behavior-linked enforcement loop you want is still unbuilt

## 3.11 Workflow confirmation is incomplete

There is a known limitation in scheduled browser workflows.

Current behavior:

- a workflow can create a browser session
- if confirmation is required, the workflow records that fact and moves on
- it does not suspend and resume when confirmation arrives

Evidence:

- explicit known-limitation comment in `packages/agent/src/lifeops/service.ts`

Impact:

- browser workflows exist
- they are not yet a dependable orchestration primitive for human-in-the-loop pauses

## 4. Risks and weak points

## 4.1 Product-level risks

- Over-reminding before adaptive sensing is good enough will make the assistant feel annoying rather than intelligent.
- Shipping channel escalation before acknowledgement and fatigue controls are solid will damage trust.
- Shipping blockers before completion recognition is reliable will feel punitive and arbitrary.
- Treating calendar and email as "connectors" rather than core LifeOps substrate will lead to fragmented UX.

## 4.2 Technical risks

- Regex-heavy fallback behavior will break under multilingual and style-varied live tests.
- Enumerated reminder channels create a false sense of readiness when execution only supports three channels.
- Screen-capture assumptions may pass plugin-local tests but fail on the packaged desktop runtime.
- A hybrid local/cloud connector architecture can drift if grant state, token state, and delivery routing are not made explicit.
- MTProto or user-account Telegram work introduces significant security, reliability, and platform-policy risk.

## 4.3 Testing risks

- Mock-only tests will overstate readiness for adaptive behavior and conversational robustness.
- LLM-judge-only evaluation will overstate correctness unless grounded by structured side-effect assertions.
- Live tests without seeded archetypes will under-cover irregular sleep and all-nighter behavior.
- A single language and tone will hide failures in terse, slangy, or older-style phrasing.

## 5. What currently works for the first seed and what does not

### 5.1 Brush teeth

What works now:

- model a daily or times-per-day routine
- store occurrences
- snooze, complete, skip
- remind and acknowledge

What does not yet fully work:

- explicit two-slot parent-plus-streak model for morning and night
- streak analytics
- polished user-facing product surface
- live-LLM acceptance path proving adaptive morning and bedtime inference

### 5.2 Invisalign, water, stretch, vitamins

What works now:

- recurring definitions can model them
- reminders can fire

What does not yet fully work:

- frequency inference quality
- adaptive meal-window linkage
- message fatigue controls
- verified live scenarios for sparse and ambiguous instructions

### 5.3 Workout plus blocker gating

What works now:

- workout routines
- website blocker capability

What does not yet work:

- LifeOps-to-blocker gating
- temporary unlock policy
- explainability around blocked sites

### 5.4 Calendar and email

What works now:

- connector status
- fetch, cache, next-context, triage, draft, send

What does not yet fully work:

- product-grade UI
- broader search and ranking
- guaranteed high-quality LLM drafting behavior
- email queue or "needs reply" operating surface in the app

### 5.5 Proactive multi-channel outreach

What works now:

- basic in-app proactive messages
- SMS and voice reminder dispatch

What does not yet work:

- real channel orchestration across Discord, Telegram, Signal, WhatsApp, and iMessage
- unified owner routing logic across all connected platforms
- robust acknowledgement and fatigue feedback loop

## 6. Assessment summary

LifeOps should be treated as:

- a serious backend foundation already present in Milady
- a partial conversational layer
- an incomplete adaptive-sensing and client-surface product

The next work should not rebuild the backend from scratch.

The next work should:

1. lock the product model around the seeded brush-teeth path
2. wire adaptive sensing to real device activity
3. build the real client surfaces
4. extend channel execution beyond the current narrow set
5. add first-class streaks and reinforcement
6. build a live-LLM scenario harness that proves the system under realistic language, schedule, and channel conditions
