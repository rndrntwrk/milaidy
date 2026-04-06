# LifeOps Testing Plan

Date: 2026-04-06
Depends on:

- `docs/lifeops/2026-04-06-lifeops-prd-v2.md`
- `docs/lifeops/2026-04-06-lifeops-critical-assessment.md`
- `docs/lifeops/2026-04-06-lifeops-implementation-plan.md`

## 1. Testing goal

LifeOps must be tested as a real adaptive agent system, not as a bundle of mocked CRUD endpoints.

The test program must prove:

- the agent can understand natural-language requests through a real LLM
- the correct LifeOps side effects happen in Milady
- reminders and trajectories behave correctly over time
- adaptive behavior remains sane for irregular users
- calendar, email, blockers, and channels work together rather than only in isolation

## 2. Non-goals

This plan does not treat these as sufficient on their own:

- unit tests only
- mocked LLM function calls only
- "looks right in chat" without side-effect verification
- judge-model scoring without hard assertions
- single-language, single-tone prompt testing

## 3. Test pyramid for LifeOps

## 3.1 Level 0: Pure unit tests

Purpose:

- protect deterministic logic

Examples:

- occurrence materialization
- window relevance
- streak computation
- reminder timing
- quiet hours
- urgency gating
- day-boundary inference

These should stay fast and exhaustive.

## 3.2 Level 1: Integration and contract tests

Purpose:

- prove repository, service, and route behavior against seeded data

Examples:

- create definition
- process reminders
- acknowledge reminder
- calendar feed caching
- Gmail triage caching
- blocker policy evaluation

These should assert on structured JSON and persisted state.

## 3.3 Level 2: App and API end-to-end tests

Purpose:

- prove the Milady runtime and clients operate correctly

Examples:

- create seeded routines and render them in the client
- complete a routine in the app and verify overview updates
- drive blocker changes through actual completion flow
- verify packaged desktop screen-capture availability where relevant

## 3.4 Level 3: Live-LLM acceptance tests

Purpose:

- prove real conversational behavior with a real model provider

This is the level that matters most for LifeOps product acceptance.

Requirements:

- hit the real Milady agent through real chat entry points
- capture trajectories
- assert on resulting definitions, occurrences, reminders, audits, and client-visible state
- run scenario matrices across style, language, and schedule archetypes

## 4. Core testing architecture

## 4.1 Seed packs

Every major scenario should start from a deterministic seed pack.

Seed packs should define:

- owner profile archetype
- current date and timezone
- LifeOps definitions
- completion history
- activity history
- calendar fixtures
- email fixtures
- channel policies
- blocker policies

Suggested layout:

- `test/lifeops/seeds/`
- `test/lifeops/scenarios/`
- `scripts/lifeops-seed.ts`

## 4.2 Scenario runner

Create a scenario runner that:

1. resets or isolates the test environment
2. seeds the LifeOps state
3. starts Milady runtime
4. sends real user messages through the actual chat path
5. optionally advances time or injects activity signals
6. captures trajectory logs
7. verifies structured outcomes
8. records a scenario report

Suggested files:

- `scripts/lifeops-scenario-runner.ts`
- `test/lifeops/live/lifeops-scenarios.live.test.ts`

## 4.3 Verification layers

Use three layers at once:

### Hard assertions

These are authoritative.

Examples:

- correct definitions created
- correct cadence or slot structure
- correct reminder attempts
- correct blocker status
- correct audit events
- no leakage into public channels

### Semantic response checks

These validate chat quality and interpretation.

Examples:

- the assistant understood the user's request
- the clarification, if any, was appropriate
- the assistant did not invent capabilities

This can use a judge model, but only as a supplement.

### Human review sample

Sample a subset of live runs manually for:

- weird prompt styles
- cross-language requests
- escalation edge cases
- all-nighter behavior

## 5. First required acceptance scenario: brush teeth

This is the first and mandatory live-LLM end-to-end test.

## 5.1 Scenario objective

Prove that Milady can:

- interpret a brush-teeth setup request through a real LLM
- create the correct routine structure
- remind the user in the morning and at night
- record completion
- update metrics and streaks

## 5.2 Scenario seed

Seed:

- owner profile with timezone
- empty LifeOps routine state
- activity history sufficient to infer a morning and evening window
- reminder intensity `normal`

## 5.3 Live conversation

Use a real message such as:

- "Help me brush my teeth in the morning and at night."

Then verify:

- a parent routine exists
- two independent slots exist or can be derived
- reminders are configured
- overview reflects the routine

## 5.4 Morning activation step

Inject or simulate:

- recent user activity in the inferred morning window

Then verify:

- reminder planning fires
- a reminder attempt is created or sent through the chosen channel
- the reminder can be acknowledged or snoozed

## 5.5 Completion step

Send a real follow-up like:

- "I brushed my teeth."

Then verify:

- the morning occurrence completes
- the night occurrence remains pending if still due later
- streak and adherence fields update
- chat response acknowledges completion without hallucinating state

## 5.6 Night activation step

Advance time or inject activity into the inferred night window.

Then verify:

- the night reminder fires
- completion closes the second slot
- same-day metrics are correct

## 5.7 Failure conditions

This scenario fails if:

- the wrong object type is created
- only one brushing slot is created
- morning and night are not independently tracked
- reminder timing is not tied to inferred activity
- metrics do not reflect completion
- the model says the setup worked but the backend state disagrees

## 6. Scenario matrix

## 6.1 User rhythm archetypes

Each major routine scenario should run across these archetypes:

- routine early bird
- routine night owl
- irregular schedule
- frequent all-nighter
- long-work-session user with fragmented sleep

## 6.2 Language and voice-style variants

Each critical scenario should run across:

- terse English
- verbose English
- younger or slangy phrasing
- older or more formal phrasing
- Spanish
- Chinese or code-switched multilingual phrasing where supported

Examples:

- terse: "set teeth am/pm"
- verbose: "I really need help remembering to brush my teeth when I wake up and before I go to bed"
- older style: "Please remind me to brush my teeth in the morning and again at bedtime"
- younger style: "make sure I actually brush my teeth when I wake up and before sleep lol"
- Spanish: "recuérdame cepillarme los dientes por la mañana y por la noche"

## 6.3 Feature scenario families

Required scenario families:

- routine creation
- completion, snooze, skip, and acknowledge
- day-boundary inference
- reminder intensity changes
- blocker gating
- calendar next-context
- email triage and draft flow
- cross-channel escalation
- screen-context relevance
- privacy and leakage prevention

## 7. Structured checks per scenario

Every live scenario should verify these buckets when relevant:

- `chat_outcome`
- `definition_state`
- `occurrence_state`
- `reminder_attempts`
- `audit_events`
- `calendar_state`
- `email_state`
- `channel_state`
- `blocker_state`
- `trajectory_quality`

Suggested report shape:

```json
{
  "scenarioId": "brush-teeth-basic",
  "provider": "anthropic",
  "model": "claude-...",
  "status": "pass",
  "checks": {
    "definition_state": "pass",
    "occurrence_state": "pass",
    "reminder_attempts": "pass",
    "trajectory_quality": "warn"
  }
}
```

## 8. Use trajectory logging as a first-class artifact

Milady already has trajectory infrastructure. Use it directly.

For each live scenario, capture:

- user messages
- LLM calls
- tool or provider accesses
- action selections
- timestamps

Then use trajectory inspection to answer:

- did the model choose the right action
- did it ask unnecessary clarification
- did it hallucinate unsupported channels
- did it thrash between actions
- did provider calls line up with the intended outcome

The trajectory artifact should be stored with scenario output for later regression triage.

## 9. Real-LMM test execution policy

## 9.1 Run modes

Use three explicit modes:

- `unit`
- `integration`
- `live`

Suggested env gating:

- reuse `LIVE=1`
- reuse `MILADY_LIVE_TEST=1`
- add `MILADY_LIFEOPS_LIVE=1` for LifeOps-specific runs

## 9.2 Provider matrix

Run live scenarios against at least:

- primary production provider
- one alternate provider
- Eliza Cloud-backed model path when connector or gateway behavior matters

This prevents LifeOps behavior from overfitting one model family.

## 9.3 Cost control

To keep live tests affordable:

- run the brush-teeth seed on every live pass
- run the full matrix on scheduled or manual validation
- use smaller scenario sets for PR gating
- store seed snapshots so reruns are reproducible

## 9.4 Operator checklist

Before running live LifeOps suites, confirm:

- `MILADY_LIVE_TEST=1` or `ELIZA_LIVE_TEST=1`
- `MILADY_LIVE_CHAT_TEST=1` for chat-trajectory scenarios
- `MILADY_LIVE_SCREEN_TEST=1` for browser-capture scenarios
- at least one real provider key from `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY`
- Chrome is installed at the browser-capture path reported by `packages/agent/src/services/browser-capture.ts`
- Google account credentials are present for calendar/mail scenarios
- SMS or voice credentials are present for transport-backed escalation scenarios

Expected skips should be explicit:

- no live provider key means the LLM suite skips
- no Chrome means the screen-capture suite skips
- no Google account means calendar and Gmail suites skip
- no transport credentials means SMS and voice coverage skips

## 10. Privacy and safety tests

Required negative tests:

- personal reminders must not route to public channels
- escalation must stop when channel policy forbids it
- reminders must respect quiet hours where configured
- email send must require explicit confirmation unless trusted policy exists
- X posting must not occur without confirmation or trusted policy
- blocker release must not trigger on partial or unverified completion

## 11. Screen-capture validation plan

Because screen capture is a known weak point, test it in layers.

### Layer 1: plugin-local

- verify `plugin-vision` screen capture and OCR when the built plugin is available
- if the plugin is not built, verify the browser-capture frame path and LifeOps screen-context heuristics instead

### Layer 2: Milady desktop runtime

- verify packaged and dev desktop paths expose working capture
- verify OCR signal quality on realistic screens

### Layer 3: LifeOps integration

- verify screen context changes reminder relevance only when supported by actual signal quality

Do not promote screen context into core reminder timing until Layer 2 is stable.

## 12. Telegram validation plan

Test Telegram in two tracks:

### Track A: current bot path

- DM delivery
- acknowledgement
- privacy boundaries

### Track B: experimental user-account path

- only in isolated manual or research environments
- validate account safety, session persistence, and policy risk
- do not mix it into default CI until architecture is approved

## 13. Recommended files and scripts

Suggested additions:

- `scripts/lifeops-seed.ts`
- `scripts/lifeops-scenario-runner.ts`
- `test/lifeops/seeds/*.json`
- `test/lifeops/scenarios/*.json`
- `test/lifeops/live/*.live.test.ts`
- `test/lifeops/e2e/*.test.ts`
- `test/lifeops/judges/*.ts`

Suggested scenario IDs:

- `brush-teeth-basic`
- `brush-teeth-night-owl`
- `brush-teeth-all-nighter`
- `invisalign-daytime`
- `water-default-frequency`
- `stretch-breaks`
- `vitamins-with-meals`
- `workout-blocker-gate`
- `calendar-next-context`
- `email-reply-needed`
- `cross-channel-escalation`
- `privacy-no-public-leak`

## 14. Release gates

LifeOps should not be considered ready unless all of the following are true:

1. deterministic logic has unit coverage
2. seeded integration tests pass
3. the brush-teeth live scenario passes with a real LLM
4. at least one irregular-schedule scenario passes
5. calendar and email scenarios pass on real connector state
6. no privacy-leak negative test fails
7. scenario reports and trajectories are available for triage

## 15. Immediate testing priorities

1. Build the brush-teeth seed and live scenario first.
2. Add hard assertions for slot creation, reminder attempts, and metrics.
3. Reuse trajectory logging as the canonical debugging artifact.
4. Add style and language variation before broadening feature scope.
5. Only after that, expand to blockers, cross-channel escalation, and screen-context scenarios.

This keeps testing aligned with product truth: one real daily-support loop, fully verified, before chasing breadth.
