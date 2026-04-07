# LifeOps PRD v2

Date: 2026-04-06
Owner: Shaw / Milady
Supersedes input PRD: `/Users/shawwalters/Downloads/milaidy_prd_v1.docx`
Companion docs:
- `docs/lifeops/2026-04-06-lifeops-critical-assessment.md`
- `docs/lifeops/2026-04-06-lifeops-implementation-plan.md`
- `docs/lifeops/2026-04-06-lifeops-testing-plan.md`

## 1. Product framing

LifeOps is Milady's personal operations layer for daily follow-through. It is not a generic task list and it is not a rigid productivity system. The product job is to translate messy human intent into adaptive support that helps a user actually do the thing at the right time, in the right channel, with the right amount of persistence.

The system should feel like a proactive private assistant that:

- understands routines, one-off tasks, goals, blockers, schedules, and outreach
- notices when the user is active, drifting, late, unavailable, asleep, or pulling an all-nighter
- adjusts reminders to the user's real behavior instead of forcing a fixed schedule
- can reach the user through the best authorized channel without being reckless or spammy
- closes the loop by knowing whether something was acknowledged, snoozed, completed, skipped, or still unresolved

## 2. Product goals

LifeOps must:

1. Help the user follow through on routine self-care and hygiene tasks.
2. Support adaptive reminder timing based on actual user activity.
3. Integrate calendar and email deeply enough that the agent can coordinate the user's day.
4. Support proactive outreach across private channels with escalation rules.
5. Track recurring tasks, streaks, cycles, and overdue states in a way that is encouraging rather than punitive.
6. Verify real behavior through end-to-end live-LLM testing, not mock-only simulations.

## 3. Product principles

- Conversational first: the user should be able to say what they want in plain language.
- Adaptive by default: morning, night, and downtime should be inferred from behavior, not hard-coded as fixed universal times.
- Private by default: LifeOps content belongs in private channels unless the user explicitly overrides that.
- Actionable over ornamental: the system should optimize for reliable support and completion, not dashboards for their own sake.
- Progressive trust: more direct outreach, browser actions, sending, and posting require clearer authorization.
- Evidence-driven: every important reminder, action, and inferred decision should be inspectable and testable.

## 4. Primary user

The primary user is highly capable but inconsistent with routines, sleep timing, and executive follow-through. They may:

- spend long stretches at a computer
- have irregular mornings and nights
- respond inconsistently across channels
- need reminders that are supportive, persistent, and adaptive
- want the agent to do coordination work around calendar, inbox, and scheduling

## 5. Scope

### 5.1 In scope

- daily routines and habits
- one-off tasks and errands
- recurring hygiene and self-care tracking
- adaptive reminder timing
- proactive messaging and escalation
- calendar read/write and calendar context retrieval
- email triage, reply drafting, and send with explicit confirmation or trusted policy
- website blocking tied to task completion states
- desktop screen capture and OCR for contextual awareness
- cross-platform identity and channel routing
- live-LLM scenario testing and trajectory verification

### 5.2 Out of scope for the first serious release

- clinical or medical advice
- aggressive coercive intervention
- fully autonomous public posting
- shared family or household coordination
- fully general Telegram user automation as a day-one dependency
- mobile biometric ingestion as a blocker for desktop-first launch

## 6. Core product concepts

LifeOps should operate on first-class durable primitives:

- `TaskDefinition`: one logical task, habit, or routine rule.
- `TaskOccurrence`: one actionable instance derived from a definition.
- `GoalDefinition`: an ongoing desired outcome with support structure.
- `ReminderPlan`: when, where, and how reminders should fire.
- `WorkflowDefinition`: scheduled or conditional automation.
- `ChannelPolicy`: what channels may be used for reminders, escalation, and actions.
- `ConnectorGrant`: external account access and capability grants.
- `AuditEvent`: why the system made a decision, delivered a reminder, or ran an action.

## 7. Routine model

### 7.1 Seeded foundational routine: brush teeth

The first seeded LifeOps activity is `brush teeth`.

This routine is the canonical end-to-end acceptance path for the product. It must be representable, remindable, completable, measurable, and testable with a real LLM through Milady.

#### Modeling decision

`brush teeth` should be modeled as:

- one parent routine definition
- two independently tracked daily slots:
  - `morning_brush_teeth`
  - `night_brush_teeth`

This is the right compromise between user meaning and system structure:

- it behaves like two separate daily obligations
- it preserves separate completion, overdue, and streak logic for morning and night
- it keeps related analytics under one parent routine instead of creating two unrelated habits

#### Requirements

- Morning brushing and night brushing must be tracked independently.
- Each slot must have its own completion state and streak value.
- The system must know when the morning slot becomes due and when it is no longer relevant.
- The system must know when the night slot becomes due and when it is no longer relevant.
- The system must use user activity to decide when morning and night likely are.
- The system must proactively remind the user when they are active during the relevant window.
- The system must surface completion in metrics and streaks.
- The system must support snooze, skip, acknowledge, and complete.
- The system must support encouraging feedback on completion.

### 7.2 Other seeded routines and recurring activities

The first seeded package after `brush teeth` should include:

- Invisalign reminder during the day
- drink water multiple times per day
- stretch breaks once or twice per day
- vitamins with breakfast and or dinner
- daily afternoon workout
- shower three times per week
- shave two times per week

### 7.3 Frequency and inference behavior

If the user does not specify an exact cadence, the system may make a reasonable starting guess and confirm it conversationally.

Examples:

- drink water: default to four reminders per day unless the user changes it
- stretch: default to one or two reminders per day depending on activity window length
- Invisalign: default to periodic daytime reminders with slightly elevated persistence
- vitamins: tie to inferred breakfast and dinner windows rather than arbitrary clock times

## 8. Adaptive activity model

LifeOps must infer user rhythm from signals instead of relying on the user to manually define a strict schedule.

### 8.1 Signals to use

Desktop-first signals:

- chat activity inside Milady
- app interaction and motion inside the app
- local computer activity and idle state
- foreground usage patterns where available
- calendar event timing and density
- reminder acknowledgement timing
- completion timing history

Later mobile and biometric signals:

- phone screen-time and wake-state data on Android and iOS
- sleep and wake proxies from system APIs where permitted
- biometric or health-adjacent signals only with explicit user consent

### 8.2 Morning and night inference

The system must infer:

- likely first active window of the day
- likely last active window of the day
- likely meal windows
- likely workout window
- whether the user is currently in a morning, daytime, evening, or late-night state

### 8.3 Day boundary logic

The day should not be considered finished merely because the clock crossed midnight.

The system must treat a day as ongoing unless there is a sustained inactivity gap that plausibly indicates sleep or a real end-of-day break.

Initial rule:

- require more than 3 hours of sustained inactivity before closing the prior day by default

The system must handle:

- night owls
- early birds
- users with inconsistent schedules
- users who stay up unusually late
- users who pull all-nighters
- users with split sleep or fragmented sleep

## 9. Proactive reminders and escalation

### 9.1 Reminder philosophy

LifeOps should be supportive and persistent, not timid. It should also avoid harassing the user.

Reminder behavior should depend on:

- task importance
- time sensitivity
- whether the user is currently active
- whether the user has acknowledged prior messages
- how many reminders were already sent
- the user's configured reminder frequency preference
- the user's recent annoyance or responsiveness signals

### 9.2 Reminder intensity control

The user must be able to say things like:

- remind me less
- send fewer reminders
- stop reminding me so much
- remind me more
- be more persistent

The system should store this as a reminder intensity setting, modeled as an enum such as:

- `minimal`
- `normal`
- `persistent`
- `high_priority_only`

This setting should influence:

- number of nudges per window
- escalation thresholds
- follow-up cadence
- quiet-hour behavior

### 9.3 Escalation model

The assistant must track the user's reachable channels and escalate carefully.

Initial escalation ordering:

- in-app chat
- private DM on a connected chat platform
- SMS
- voice call

Escalation must only happen on channels that are explicitly authorized.

Escalation decisions must account for:

- urgency
- acknowledgement state
- user presence on other platforms
- recent ignored reminders
- channel privacy class
- time of day and quiet hours

### 9.4 Acknowledgement and closure

For every reminder, LifeOps must track whether it was:

- delivered
- seen if the platform supports that signal
- acknowledged
- snoozed
- completed
- skipped
- still unresolved

This is necessary for both reminder quality and testing.

## 10. Calendar requirements

Calendar is a core LifeOps dependency, not an optional add-on.

The product must support:

- upcoming events for today
- event context retrieval
- natural-language questions about the calendar
- calendar event creation and updates
- relevant-event search and ranking
- caching of upcoming and recently relevant events
- a compact widget view for today
- a fuller agentic calendar surface that the user and agent can inspect and manipulate together

Calendar context should include:

- time
- attendees
- location
- conference link
- preparation checklist
- relevant linked emails
- urgency and reminder plan

## 11. Email requirements

Email is a core LifeOps dependency because the user wants the assistant to prevent dropped threads and help with follow-through.

The system must support:

- surfacing emails that likely need a response
- surfacing important new mail
- reply drafting
- reply sending with explicit confirmation or trusted automation policy
- searching mail
- identifying unresponded threads
- generating follow-up suggestions
- piping important email state into the main private chat or widget surface

The product must also support the user conceptually having:

- their own email
- an agent-associated email identity or alias for assistant workflows

The assistant should help with:

- what should I reply to today
- draft this reply
- send this email
- find all emails about a topic
- find all emails I have not responded to

## 12. One-off tasks and opportunistic nudges

LifeOps must support non-recurring tasks that can be done:

- at a specific time
- before a deadline
- whenever downtime appears

Examples:

- buy replacement OneBlade razor blades
- book a cavity filling appointment

The system should detect likely downtime and occasionally suggest one of these tasks when the user has open space.

## 13. Blockers and behavior-linked access

LifeOps must support action-linked blockers, especially for distracting websites.

Initial blocker requirement:

- keep selected distracting sites blocked until the user completes required obligations

Initial sites:

- X
- Twitter
- Google News
- Hacker News
- Y Combinator
- Facebook
- Instagram

Initial unblock logic:

- morning brush teeth can temporarily unlock selected sites
- workout completion can temporarily unlock selected sites

The blocker system must support:

- policies tied to LifeOps task state
- temporary unblocks
- clear explanation of why something is blocked
- per-requirement mapping such as `brush_teeth_morning` and `daily_workout`

## 14. Weekly hygiene and encouragement

The system must support weekly cadence tracking for things like:

- shower three times per week
- shave two times per week

It must understand overdue logic such as:

- it has been more than three days since the last shave

It must allow simple conversational completion, for example:

- I showered
- I shaved

It should respond with encouraging reinforcement and streak-aware phrasing when appropriate.

## 15. Cross-platform identity and rolodex

LifeOps must understand the owner as one person reachable across multiple connected platforms.

The product should maintain a private owner contact graph or rolodex that includes:

- app identity
- Discord identity
- Telegram identity
- phone number
- email address
- any other connected private endpoints

This rolodex must support:

- preferred channel selection
- fallback channel selection
- escalation history
- response history

## 16. Screen capture and contextual awareness

LifeOps should use desktop screen capture first.

Initial scope:

- capture screen state
- run OCR
- reason over tiles or patches when needed
- identify high-level contextual cues relevant to reminders and workflow timing

Initial use cases:

- know whether the user is on the computer
- detect whether the current context suggests work, leisure, or transition
- improve relevance for reminder timing

World camera capture is not a day-one dependency for LifeOps.

## 17. Telegram requirements

Telegram support matters for proactive outreach, but the desired model is not a simple bot-only flow.

Preferred direction:

- user-account or MTProto-style access on the user's Mac, if feasible and safe

Fallback:

- bot-based Telegram integration

BotFather should not be the preferred long-term architecture for the personal-assistant use case if a user-level Telegram path is feasible.

## 18. Cloud requirements

When APIs and long-lived connector flows are needed, LifeOps should integrate with Eliza Cloud in `../cloud`.

Cloud responsibilities may include:

- secret handling
- long-lived Google OAuth and refresh flows
- webhook or callback handling
- gateway delivery
- agent-owned identities or managed connectors
- Telegram or other external service bridging

The product must still preserve a local-first experience wherever possible.

## 19. UX requirements

### 19.1 Main chat

Main chat is the primary control surface.

The user must be able to:

- create routines, tasks, and goals
- ask what is due
- complete or snooze items
- inspect reminders
- query calendar and email
- configure reminder frequency and escalation

### 19.2 Right-side surfaces

The product should expose:

- today's tasks and active reminders
- today's calendar items
- important emails needing attention
- blocker status
- next due hygiene and self-care items

### 19.3 Agentic calendar view

LifeOps should add a fuller calendar experience beyond a small widget:

- day agenda
- week view or timeline
- event detail and relevant emails
- editable and searchable through both UI and chat

### 19.4 Reminder explainability

The UI must allow the user to inspect why something fired:

- why this reminder
- why this channel
- why now
- why escalation happened

## 20. Metrics

Key product metrics:

- successful creation of seeded routines
- completion rate by routine and slot
- streak stability
- overdue rate
- reminder acknowledgement latency
- reminder-to-completion conversion
- escalation effectiveness
- calendar-event preparedness
- email reply completion rate
- blocker compliance and unblock conversion

## 21. Acceptance criteria

### 21.1 Seeded brush-teeth acceptance path

AC-1: The user can say a natural-language request equivalent to "help me brush my teeth in the morning and at night" and the agent creates the routine.

AC-2: The created routine has two separate daily slots, one for morning and one for night.

AC-3: Morning and night have independent completion state and independent streak metrics.

AC-4: When the system infers the user is active during the morning window, the assistant proactively reminds them.

AC-5: If the user snoozes the morning reminder, it reappears reliably.

AC-6: When the user completes brushing, the occurrence closes, metrics update, and the chat can acknowledge the streak or completion state.

AC-7: When the system infers the user is nearing bedtime, the assistant proactively reminds them about the night slot.

AC-8: The full trajectory is verifiable with a real LLM run through Milady.

### 21.2 Additional routine acceptance

AC-9: Invisalign reminders fire during active daytime periods and can be acknowledged.

AC-10: Water reminders default to a reasonable daily count when the user did not specify one.

AC-11: Stretch reminders support at least one or two per day based on policy.

AC-12: Vitamins can be tied to inferred breakfast and dinner windows.

AC-13: Shower and shave routines support weekly cadence and overdue detection.

### 21.3 Calendar and email acceptance

AC-14: The user can ask what is on their calendar today and get a correct answer.

AC-15: The assistant can identify the next relevant event and show linked email context.

AC-16: The assistant can answer what emails need a response today.

AC-17: The assistant can draft a reply and send only with explicit confirmation or trusted send policy.

### 21.4 Blocker acceptance

AC-18: Selected distracting sites remain blocked until required obligations are completed.

AC-19: Completing morning brush teeth or workout can temporarily unblock configured sites.

### 21.5 Escalation acceptance

AC-20: The assistant can escalate reminders across authorized channels when appropriate.

AC-21: The assistant respects reminder intensity settings and quiet hours.

## 22. Release phases

- Phase 0: brush teeth seed, two-slot routine model, basic metrics, live-LLM acceptance path
- Phase 1: daytime routines, blocker linkage, adaptive morning/night inference
- Phase 2: calendar and email as first-class LifeOps surfaces
- Phase 3: multi-channel escalation and rolodex routing
- Phase 4: screen capture awareness and richer context inference
- Phase 5: Telegram user-path exploration and mobile wake/sleep signals

## 23. Product decisions captured in v2

- `brush teeth` is modeled as one routine with two independently tracked daily slots.
- Reminder timing must adapt to user behavior rather than fixed universal schedule assumptions.
- A day should not end until there is a meaningful inactivity break, defaulting to more than three hours.
- Calendar and email are core LifeOps systems, not add-on connectors.
- Website blocking tied to LifeOps completion is a first-class requirement.
- Live-LLM trajectory validation is part of product acceptance, not optional QA garnish.
