# Milaidy BRD v1 — Gap Assessment & Implementation Plan

## Executive Summary

The LifeOps backend is **real, production-grade infrastructure** — not LARP. There are ~12,000 lines of working TypeScript with real SQL persistence, real Google Calendar/Gmail sync, real Twilio SMS/voice delivery, a real occurrence materialization engine with timezone math, and comprehensive E2E tests. The architecture is solid.

**Correction (2026-04-05):** The initial assessment below overstated gaps. Deeper exploration revealed:

- **Conversational bridge already exists**: `manageLifeOpsAction` (`packages/agent/src/actions/lifeops.ts`) handles create/update definitions, goals, complete/snooze/skip occurrences, and goal reviews — all registered in `eliza-plugin.ts`.
- **Reminder daemon already exists**: `packages/agent/src/lifeops/runtime.ts` registers a 60-second recurring task worker (`LIFEOPS_SCHEDULER`) that calls `processScheduledWork()` automatically.
- **Snooze presets fully implemented in backend**: `computeSnoozedUntil()` supports 15m/30m/1h/tonight/tomorrow_morning with timezone-aware resolution.
- **Escalation already works**: Multi-step reminder plans fire each step based on time offsets from the occurrence anchor. Deduplication prevents re-delivery.
- **Context provider exists**: `lifeOpsProvider` injects LifeOps overview into agent context.

The remaining gaps (now addressed) were:
1. No calendar/email query action (agent couldn't answer "what's on my calendar?" in chat) — **FIXED**: `queryLifeOpsAction` added
2. Provider didn't include calendar/email context — **FIXED**: enhanced `lifeOpsProvider`
3. UI snooze hardcoded to 15m — **FIXED**: dropdown with all presets
4. No phone/escalation config via chat — **FIXED**: `capture_phone` and `configure_reminder_plan` operations added

---

## Part 1: What's Real vs. What's LARP

### Tier 1: Fully Implemented & Working

| BRD Requirement | Implementation | Evidence |
|----------------|---------------|----------|
| Task definitions with recurrence | `engine.ts` materializes occurrences for `once`, `daily`, `weekly`, `times_per_day` cadences | Real date math, timezone-aware, 420 LOC engine |
| Morning/night time windows | `defaults.ts` defines morning (5am-12pm), afternoon, evening, night windows; occurrences scoped to windows | Visibility lead/lag minutes, relevance windows |
| Snooze (backend) | `snoozedUntil` field on occurrences, state transitions to "snoozed", UI buttons for 30m snooze | `resolveOccurrenceState()` in engine.ts checks snooze |
| Progressive routines | `LifeOpsProgressionRule` with `linear_increment` kind, `deriveTarget()` computes next target from completion count | `start + completedCountBefore * step` formula |
| Google Calendar sync | Full v3 API integration with event normalization, attendees, conference links | `google-calendar.ts`, 287 LOC |
| Gmail triage | Smart scoring (unread, important, direct, reply-needed), automated sender detection | `google-gmail.ts`, 427 LOC |
| Google OAuth (desktop + web) | PKCE flow, token refresh, file-based storage with 0o600 permissions | `google-oauth.ts`, 656 LOC |
| Event context summarization | Links upcoming events with relevant emails by attendee overlap | `getNextCalendarEventContext()` in service.ts |
| Twilio SMS & voice | Direct API calls, 12s timeout, error classification | `twilio.ts` |
| Reminder plans & steps | Multi-step escalation ladder (in_app -> SMS -> voice) with offset minutes | Full `LifeOpsReminderPlan` CRUD |
| Channel policies | Per-channel privacy class, allowReminders, allowEscalation, allowPosts | `LifeOpsChannelPolicy` with private/shared/public |
| Quiet hours | Timezone-aware silence windows, per-channel overrides | `isWithinQuietHours()` in service.ts |
| Urgency gating | Channel blocked if urgency too low (e.g. voice only for high/critical) | `isReminderChannelAllowedForUrgency()` |
| Audit trail | 23+ event types recorded for every decision | `LifeOpsAuditEvent` with full outcome logging |
| Browser session model | Status tracking (awaiting_confirmation/navigating/done), action-level confirmation | `LifeOpsBrowserSession` with action audit |
| X/Twitter posting | OAuth 1.0a signing, tweet creation API | `x-poster.ts`, ~100 LOC |
| Goal definitions | Full CRUD with support strategy, success criteria, review state | `LifeOpsGoalDefinition` in repository |
| Phone consent capture | Dual SMS/voice consent, privacy class, explicit opt-in | `CaptureLifeOpsPhoneConsentRequest` |
| Connector grants | Multi-provider OAuth, capabilities, token vault | `LifeOpsConnectorGrant` with refresh tracking |
| Task occurrence states | pending, visible, snoozed, completed, skipped, expired, muted | Full state machine in engine.ts |
| Reminder dispatch | End-to-end: check policy -> quiet hours -> urgency -> deliver -> audit | `dispatchReminderAttempt()`, 170 LOC |
| Workflow definitions | Action plans with permission policies | `LifeOpsWorkflowDefinition` stored and retrievable |
| Calendar UI widget | Right panel shows events, next-event card, attendees, prep checklist | `TasksEventsPanel.tsx` LifeOps section |
| Gmail UI widget | Right panel shows triaged messages with importance/reply badges | `GmailMessageRow` in TasksEventsPanel |
| Occurrence action buttons | Done, 30m Snooze, Skip buttons on occurrence rows | Conditional rendering in TasksEventsPanel |
| Google connector card | Connect/disconnect, capability display | In TasksEventsPanel |

### Tier 2: Backend Exists, No Conversational Bridge (THE CRITICAL GAP)

| BRD Requirement | What Exists | What's Missing |
|----------------|-------------|----------------|
| **"Remind me to brush my teeth twice a day"** | LifeOps can store a `times_per_day` definition with morning/night windows | **No elizaOS action/evaluator to parse this from chat and create the definition via API** |
| **"I want to call my mom every week"** | LifeOps can store a goal with weekly cadence and support strategy | **No agent action to detect goal intent and call `createGoal()`** |
| **"Add one pushup every day"** | Engine supports `linear_increment` progression rules perfectly | **No NLP to extract progression params (start, step, metric) from chat** |
| **"What's on my calendar today?"** | `/api/lifeops/calendar/feed` returns real events | **No agent action wired to answer this conversationally** |
| **"Do I have any important emails?"** | `/api/lifeops/gmail/triage` returns scored inbox | **No agent action to surface this in chat** |
| **"Text me if I ignore this"** | Reminder plans support SMS escalation steps | **No conversational way to configure escalation** |
| **Proactive onboarding** | Onboarding wizard exists for provider/connector setup | **No "what can I help you with today?" conversational opener for LifeOps** |

**This is the single biggest gap.** The LifeOps backend is a Ferrari engine with no steering wheel. All the power is accessible only through raw HTTP API calls. The user cannot interact with any of it through the chat interface that the BRD describes as the primary control surface.

### Tier 3: Partially Implemented / Brittle

| BRD Requirement | Current State | Risk |
|----------------|--------------|------|
| **Escalation auto-progression** | Code *checks* if escalation is allowed, but doesn't auto-step to next channel if previous was ignored | Medium: reminder fires on one channel only; doesn't automatically try SMS after in_app is ignored |
| **Reminder scheduling daemon** | `processReminders()` exists but is **HTTP-triggered only** (`POST /api/lifeops/reminders/process`) | High: no cron/timer calls this automatically — reminders only fire if something polls this endpoint |
| **Phone number validation** | `CaptureLifeOpsPhoneConsentRequest` accepts raw string | Medium: no E.164 normalization, no verification SMS, duplicates possible |
| **DM vs. public auto-detection** | Channel policies require manual `privacyClass` config | Medium: user could accidentally set group chat as private, sending personal reminders to groups |
| **Twilio delivery resilience** | Single attempt, no retry | Medium: transient network failure = lost reminder |
| **Workflow execution** | Workflow definitions stored, but action execution partially stubbed | High: some action types (browser, summarize) need implementation |
| **plugin-todo vs. LifeOps duality** | Two separate task systems (`plugin-todo` with basic NLP and `LifeOps` with full model) | High: confusing, feature split, plugin-todo has no window/progression support |
| **Default escalation chain** | Only `[{ channel: "in_app", offsetMinutes: 0 }]` | Medium: users get zero escalation by default |
| **Email reply formatting** | Plain text only in `sendGoogleGmailReply()` | Low: no HTML formatting support |

### Tier 4: Not Implemented At All

| BRD Requirement | Status | BRD Section |
|----------------|--------|-------------|
| **Dedicated calendar view** (month/week grid, day timeline) | API exists, no UI | 5.6, 6.2 |
| **Goal tracking UI** (progress, milestones, review) | Only count displayed ("3 goals active") | 5.4, 6.2 |
| **Habit streak tracking** | No completion history, no streak counter | 5.3 |
| **Browser session visibility UI** | `browser/` component directory is empty | 5.11 |
| **Email compose/full inbox UI** | Only triage preview (3 messages) | 5.7 |
| **Snooze presets** (15m, 30m, 1h, tonight, tomorrow morning) | Only 30m hardcoded | 6.4 |
| **Goal review view** (separate from task list) | Not implemented | 5.4 |
| **Workflow inspection/editing UI** | Not implemented | 5.9 |
| **X/Twitter read integration** (timeline, news, discussion) | Only posting capability exists | 5.10 |
| **Connector-aware onboarding** (detect connected providers, explain capabilities) | Provider setup exists, but no capability explanation flow for LifeOps | 5.1 |
| **Multi-channel outreach UI** (configure escalation visually) | No UI — API only | 5.8 |
| **Task creation form** (optional, alongside conversational) | No form UI for tasks | 6.1 |
| **Completion/skip/defer history** (collapsed by default) | No history display | 6.3 |
| **Auditability UI** (why a reminder fired, what channel, why escalation) | Audit events stored but no UI to inspect | 7.3 |
| **Observability/failure UI** (failed actions, pending permissions) | Not implemented | 9.4 |
| **Responsive reminder timing** (based on user responsiveness history) | Not implemented | 5.5 |
| **Signal/WhatsApp/iMessage connectors** | Channel types defined, no connector implementation | 5.8 |

---

## Part 2: Brittleness & Hard-Coded Concerns

### Critical Brittleness

1. **No reminder daemon** — `processReminders()` is never called automatically. It requires an external cron job or polling client to `POST /api/lifeops/reminders/process`. If nothing calls it, **no reminders ever fire**. This is the most dangerous gap because it's invisible — everything looks wired up but nothing triggers.

2. **plugin-todo vs. LifeOps split** — Two competing task systems exist:
   - `plugin-todo`: Has LLM-based NLP parsing, creates basic todos through chat, BUT has no time windows, no progression, no escalation, no snooze (only 3 types: daily/one-off/aspirational)
   - `LifeOps`: Has the full model (windows, progression, escalation, goals), BUT has no conversational bridge
   - Users interacting through chat hit `plugin-todo`. The rich LifeOps system sits unused.

3. **Snooze is 30 minutes only** — The UI hardcodes a 30-minute snooze. The BRD calls for 15m, 30m, 1h, tonight, tomorrow morning presets. The backend supports arbitrary `snoozedUntil` timestamps, but the UI doesn't expose the flexibility.

4. **Gmail triage scoring is regex-based** — `fetchGoogleGmailTriageMessages()` uses pattern matching for automated sender detection:
   - `/(^|[\s<])no[_-]?reply@/i` — misses corporate patterns like `notifications@`, `alerts@`
   - `/(^|[\s<])do[_-]?not[_-]?reply@/i` — misses `noreply-` prefix variants
   - `List-Id` header check is good, but `Precedence: bulk/list` misses `Precedence: auto-reply`
   - Direct-to-user scoring (+15) is too low compared to Important label (+35)

5. **Calendar event caching is time-blind** — 5-minute TTL means a user asking "what's on my calendar?" gets stale data if they just added an event. `forceSync` exists but isn't exposed in the conversational flow.

6. **Default time windows are American-centric** — Morning starts at 5am, Night at 10pm. Users with irregular schedules (BRD section 12.1 explicitly flags this) have no way to customize through chat. The backend supports custom windows, but there's no UI or conversational path to set them.

7. **X poster has no read capability** — `x-poster.ts` only posts tweets. The BRD requires timeline reading, news summarization, and discussion surfacing (section 5.10). The current `twitter-verify.ts` only validates wallet verification tweets via FxTwitter API — it's not a general timeline reader.

### Medium Brittleness

8. **Occurrence materialization is O(definitions * days * windows)** — For each `processReminders()` call, every definition rematerializes all occurrences across the lookback+lookahead window (default 9 days). With 50 definitions each having 2 windows, that's 900 occurrence computations per cycle. No caching or dirty-flagging.

9. **Google OAuth token storage is file-based** — Tokens stored at `~/.eliza/state/lifeops/google/` with 0o600 permissions. On multi-user systems or cloud deployments, this is fragile. No encryption at rest.

10. **Channel policy has no connector validation** — You can create an SMS channel policy without Twilio credentials configured. The failure only surfaces at delivery time, not at configuration time.

11. **Quiet hours ignore in_app channel** — In-app notifications bypass quiet hours entirely. If the user is sleeping and their phone is on, they'll still get in-app alerts.

12. **Workflow action types are partially stubbed** — The `LifeOpsWorkflowDefinition` can store action plans, but only some action types (`get_calendar_feed`, `get_gmail_triage`) are implemented. Browser actions, email sending, and summarization actions need implementation.

---

## Part 3: Detailed Implementation Plans

### Plan 1: Conversational Bridge — Agent Actions for LifeOps

**Priority: P0 — This unblocks every BRD acceptance criterion**

**Problem:** The user cannot interact with LifeOps through conversation. All the backend power (tasks, habits, goals, escalation, calendar, email) is only accessible via HTTP API.

**Approach: Create a LifeOps elizaOS plugin with actions, evaluators, and providers**

#### Research Document

**Option A: Monolithic LifeOps Plugin**
Create a single `@miladyai/plugin-lifeops` with all actions:
- `createLifeOpsItem` — LLM classifies intent (task/habit/goal/reminder) and calls appropriate service method
- `queryLifeOps` — Handles "what's on my calendar?", "any important emails?", "what are my goals?"
- `modifyLifeOps` — Handles snooze, complete, skip, reschedule, update
- `configureEscalation` — Handles "text me if I ignore this", "call me before important events"
- Provider: injects upcoming occurrences, calendar, and goals into agent context

*Pros:* Single plugin, unified LLM context, one import
*Cons:* Large plugin, complex action routing, hard to test individual actions

**Option B: Thin Bridge Actions in Existing Agent Package**
Add actions directly in `packages/agent/src/lifeops/actions/`:
- Reuse existing service layer directly (no HTTP hop)
- Each action is a focused file: `create-item.ts`, `query-overview.ts`, `manage-occurrence.ts`, `configure-channels.ts`

*Pros:* Direct service access, no plugin overhead, co-located with service code
*Cons:* Not reusable outside Milady agent, tighter coupling

**Option C: Hybrid — Plugin shell with service delegation**
Create `@miladyai/plugin-lifeops` that registers actions, but each action delegates to the existing `LifeOpsService` instance via runtime context.

*Pros:* Clean plugin boundary, reusable, testable, uses existing service
*Cons:* Need to ensure service is available in runtime context

**Recommendation: Option C (Hybrid)**
- Actions are registered as proper elizaOS plugin actions
- Service is instantiated at runtime and stored in `runtime.services`
- Each action delegates to service methods
- Provider injects relevant context (upcoming items, goals, calendar summary)
- Evaluator detects when user message likely relates to LifeOps (intent classification)

#### Implementation Steps

1. **Create `packages/plugin-lifeops/` plugin scaffold**
   - Register with elizaOS plugin system
   - Instantiate LifeOpsService on plugin start

2. **Intent Classification Evaluator**
   - LLM-based: given user message, classify as task_create / task_manage / calendar_query / email_query / goal_create / escalation_config / other
   - Trigger appropriate action based on classification

3. **Create Item Action** (`create-item.ts`)
   - LLM prompt extracts: title, description, cadence (once/daily/weekly/times_per_day), windows (morning/night/custom), progression rule (metric/start/step), goal vs. task distinction
   - Maps to `CreateLifeOpsDefinitionRequest` or `CreateLifeOpsGoalRequest`
   - Confirms with user before creating
   - Stores `originalIntent` for future reinterpretation

4. **Query Action** (`query-overview.ts`)
   - Routes to calendar feed, gmail triage, or overview based on intent
   - Formats results for chat display
   - Supports follow-up questions

5. **Manage Occurrence Action** (`manage-occurrence.ts`)
   - Handles: complete, snooze (with duration), skip, reschedule
   - Identifies target occurrence from context

6. **Configure Channels Action** (`configure-channels.ts`)
   - Handles phone capture with consent
   - Sets up escalation ladder
   - Configures quiet hours

7. **Context Provider** (`lifeops-provider.ts`)
   - Injects into agent context: next 3 upcoming occurrences, next calendar event, active goal count
   - Enables proactive agent behavior

---

### Plan 2: Reminder Scheduling Daemon

**Priority: P0 — Without this, reminders never fire**

**Problem:** `processReminders()` is HTTP-triggered only. Nothing calls it automatically.

#### Research Document

**Option A: elizaOS Trigger (cron-based)**
Register a trigger in the LifeOps plugin:
```typescript
{ type: "cron", cronExpression: "*/1 * * * *", handler: () => service.processReminders() }
```

*Pros:* Uses existing trigger system, timezone-aware, survives restart via trigger persistence
*Cons:* 1-minute granularity may be too coarse for time-sensitive reminders

**Option B: setInterval in Service**
Start a `setInterval(processReminders, 30_000)` when service initializes.

*Pros:* Simple, 30-second granularity, no dependencies
*Cons:* Doesn't survive restart cleanly, no backpressure, could overlap

**Option C: elizaOS Task Worker**
Register a recurring task via the task scheduler that calls `processReminders()`.

*Pros:* Built-in backoff, failure tracking, auto-pause on repeated failures
*Cons:* Task scheduler adds overhead, harder to debug

**Recommendation: Option A (elizaOS Trigger)**
- Use cron trigger with `*/1 * * * *` (every minute)
- Add a debounce lock to prevent overlapping processing
- Log processing metrics (occurrences checked, reminders dispatched)
- Add health check endpoint to verify daemon is running

#### Implementation Steps

1. Register cron trigger in plugin-lifeops initialization
2. Add processing mutex (in-memory lock) to prevent overlap
3. Add `/api/lifeops/reminders/health` endpoint returning last-run time and status
4. Add telemetry span for each processing cycle
5. Make interval configurable via `MILADY_REMINDER_INTERVAL_CRON`

---

### Plan 3: Unify plugin-todo and LifeOps

**Priority: P1 — Eliminates user confusion and feature fragmentation**

**Problem:** Two competing task systems. `plugin-todo` has chat NLP but weak model. LifeOps has rich model but no chat interface.

#### Research Document

**Option A: Deprecate plugin-todo, move NLP to plugin-lifeops**
- Remove plugin-todo's actions
- Port its LLM-based extraction logic into plugin-lifeops actions
- All tasks flow through LifeOps definitions/occurrences

*Pros:* Single source of truth, users get full LifeOps power, no confusion
*Cons:* Breaking change for existing plugin-todo users, migration needed

**Option B: Make plugin-todo a thin frontend for LifeOps**
- plugin-todo's `createTodo` action calls LifeOps `createDefinition()` instead of its own DB
- plugin-todo's reminder service delegates to LifeOps reminder processing
- Gradual migration, plugin-todo becomes an alias

*Pros:* Backwards compatible, gradual migration
*Cons:* Two codepaths to maintain during transition, complexity

**Option C: Parallel operation with sync**
- Both systems run independently
- A bridge syncs plugin-todo items to LifeOps definitions
- Already partially implemented via `plugin-bridge.ts`

*Pros:* No breaking changes, existing behavior preserved
*Cons:* Permanent complexity tax, sync bugs, divergent state

**Recommendation: Option A (Full migration)**
- The plugin-bridge.ts already syncs in one direction. Better to fully commit.
- Port the LLM extraction template from plugin-todo's `createTodo.ts` into plugin-lifeops
- Enhance the template to extract LifeOps-specific fields (cadence, windows, progression)
- Disable plugin-todo actions when plugin-lifeops is active
- Keep plugin-todo data service for backward-compatible reads during transition

---

### Plan 4: Escalation Auto-Progression

**Priority: P1 — Required for AC-6**

**Problem:** Reminder dispatch tries one channel per step. If the user ignores it, nothing escalates to the next channel. The steps exist in the plan but aren't auto-progressed.

#### Research Document

**Option A: Time-based escalation in processReminders()**
- When processing reminders, check if previous step was delivered but not acknowledged within its offset window
- If so, advance to next step in the plan
- Track `currentStepIndex` per reminder plan instance

*Pros:* Simple, uses existing processing cycle
*Cons:* 1-minute granularity means escalation has minimum 1-minute delay

**Option B: Dedicated escalation service**
- Separate `EscalationService` that watches for unacknowledged reminders
- Runs on its own schedule, evaluates escalation policies
- Can factor in user responsiveness history

*Pros:* Clean separation, can be sophisticated
*Cons:* Another service to maintain, more complexity

**Recommendation: Option A**
- Simpler, leverages existing infrastructure
- Add `lastAttemptStepIndex` and `lastAttemptAt` to reminder tracking
- In each processing cycle: if step N was delivered > offsetMinutes ago and not acknowledged, dispatch step N+1
- Add configurable max escalation attempts

#### Implementation Steps

1. Add `currentEscalationStep` tracking per occurrence-reminderPlan pair
2. In `processReminders()`, after checking existing attempts, determine if escalation is due
3. Factor in step offset: step[1].offsetMinutes is relative to occurrence scheduled time
4. Dispatch next-step reminder, record as new attempt
5. Stop escalation once acknowledged or max step reached
6. Add audit events for escalation transitions

---

### Plan 5: Snooze Presets & Context-Aware Timing

**Priority: P1 — UX quality for daily interaction**

**Problem:** Only 30-minute snooze hardcoded in UI. BRD requires contextual presets.

#### Implementation Plan

1. **Backend already supports arbitrary snooze** — `snoozedUntil` accepts any ISO timestamp
2. **Add snooze preset resolver** in TasksEventsPanel:
   - 15 minutes
   - 30 minutes
   - 1 hour
   - "Tonight" → next occurrence of evening window start (17:00 local)
   - "Tomorrow morning" → next occurrence of morning window start (5:00 local)
   - Custom time picker
3. **Context-aware presets**: If current time is evening, don't show "tonight" — show "before bed" (night window start)
4. **Snooze via chat**: Add to the Manage Occurrence action — "snooze that for an hour"

---

### Plan 6: Calendar & Goal Dedicated Views

**Priority: P2 — Enhanced UX beyond widget**

**Problem:** Calendar shows 3-4 events in a right panel. No full calendar view, no goal review page.

#### Implementation Plan

**Calendar View:**
1. New route/page `CalendarView.tsx` with day/week views
2. Fetch from `/api/lifeops/calendar/feed` with wider time window
3. Show events with full details (description, attendees, location, conference link)
4. Allow drill-down into event context (linked emails, prep checklist)
5. Wire to "Create event" action through chat or inline form

**Goal Review View:**
1. New route/page `GoalReviewView.tsx`
2. List all goals with status (active/paused/completed)
3. Show linked task definitions per goal
4. Show recent occurrence completions related to each goal
5. Support strategy display and edit
6. "Review" action — agent summarizes goal progress and suggests adjustments

---

### Plan 7: Browser Session Visibility UI

**Priority: P2**

**Problem:** `apps/app/src/components/browser/` directory is empty. Backend tracks sessions but UI shows nothing.

#### Implementation Plan

1. Create `BrowserSessionPanel.tsx` component
2. Show active sessions with status badges (awaiting_confirmation, navigating, done)
3. Display current action being executed with URL/selector info
4. Confirmation dialog for `accountAffecting` actions
5. Action history with timestamps and outcomes
6. Wire to LifeOps workflow system for automated browser tasks

---

### Plan 8: X/Twitter Read Integration

**Priority: P3**

**Problem:** Only tweet posting exists. No timeline reading, news surfacing, or discussion summarization.

#### Research Document

**Option A: Official Twitter API v2 (Expensive)**
- Requires paid API access ($100+/month for Basic tier)
- Rate limited, but comprehensive
- Supports timeline, search, user lookup

**Option B: Scraping via browser automation**
- Use browser session system to navigate X.com
- Extract content from rendered page
- No API costs

*Pros:* Free, no rate limits
*Cons:* Fragile, TOS violation risk, maintenance burden

**Option C: Third-party aggregation (FxTwitter, Nitter)**
- FxTwitter already used for verification
- Can extract individual tweets and threads
- Limited to specific URLs, not timeline browsing

**Recommendation: Option A for search/read, with Option C as fallback**
- Use Twitter API v2 for timeline and search endpoints
- Fall back to FxTwitter for individual tweet/thread rendering
- Cache results aggressively (5-minute TTL for timeline, 1-hour for search)
- Agent action: "What's going on on X?" triggers timeline fetch + LLM summarization

---

### Plan 9: Responsive Reminder Timing

**Priority: P3**

**Problem:** No tracking of user responsiveness patterns. BRD requires considering "user responsiveness history" before escalating.

#### Implementation Plan

1. Track response latency per reminder attempt (time from delivery to acknowledgment)
2. Aggregate per-channel: average response time for in_app, SMS, voice
3. Compute "responsiveness score" per time-of-day bucket
4. Use score to adjust escalation timing:
   - Fast responder on SMS (avg < 5min) → wait longer before voice escalation
   - Slow responder on in_app (avg > 30min) → escalate to SMS sooner
5. Store in channel policy metadata as learned preferences

---

## Part 4: Priority Ordering

| Priority | Plan | Effort | Unblocks |
|----------|------|--------|----------|
| **P0** | Plan 1: Conversational Bridge | Large (2-3 weeks) | AC-1, AC-2, AC-3, AC-4, AC-5, AC-7 |
| **P0** | Plan 2: Reminder Daemon | Small (2 days) | AC-6, all reminder functionality |
| **P0** | Plan 3: Unify plugin-todo/LifeOps | Medium (1 week) | Eliminates confusion, single path |
| **P1** | Plan 4: Escalation Auto-Progression | Medium (3-5 days) | AC-6 |
| **P1** | Plan 5: Snooze Presets | Small (2-3 days) | AC-2 |
| **P2** | Plan 6: Calendar & Goal Views | Medium (1-2 weeks) | Enhanced UX |
| **P2** | Plan 7: Browser Session UI | Medium (1 week) | AC-8 |
| **P3** | Plan 8: X/Twitter Read | Large (2 weeks) | Section 5.10 |
| **P3** | Plan 9: Responsive Timing | Small (3-5 days) | Section 5.5 |

---

## Part 5: BRD Acceptance Criteria Status

| ID | Scenario | Status | Blocker |
|----|----------|--------|---------|
| AC-1 | "I need help brushing my teeth twice a day" | **WORKS** | `manageLifeOpsAction` creates times_per_day definitions with morning/night windows via LLM parameter extraction. |
| AC-2 | Snooze brushing for 30 minutes | **WORKS** | Backend: all presets (15m/30m/1h/tonight/tomorrow). UI: dropdown with all presets. Chat: snooze via `manageLifeOpsAction`. |
| AC-3 | "Add one push-up and sit-up every day" | **WORKS** | `manageLifeOpsAction` supports `progressionRule: { kind: "linear_increment", metric, start, step }`. Engine computes targets. |
| AC-4 | "I want to call my mom every week" | **WORKS** | `manageLifeOpsAction` creates goals with weekly cadence and support strategy. |
| AC-5 | User connects Google Calendar | **WORKS** | Full OAuth flow, events appear in widget. `queryLifeOpsAction` answers calendar questions in chat. |
| AC-6 | Escalation chain fires on ignored reminders | **WORKS** | 60-second scheduler daemon + multi-step reminder plans with time-offset escalation. `configure_reminder_plan` configures steps via chat. |
| AC-7 | "Do I have any important emails?" | **WORKS** | `queryLifeOpsAction` with `email_triage` operation. Formats triage scores, importance, reply-needed indicators. |
| AC-8 | Browser automation visible to user | **BLOCKED** | No UI (Plan 7). Backend tracks sessions. `browser/` component directory still empty. |
