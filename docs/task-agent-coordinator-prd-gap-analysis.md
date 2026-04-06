# Task Agent Coordinator PRD, Gap Analysis, Research Plan, Implementation Plan, and Verification Plan

Date: 2026-04-06

## Executive Summary

Milady already has real foundations for task-agent orchestration:

- live PTY-backed task-agent spawning and supervision in `plugins/plugin-agent-orchestrator`
- workspace provisioning and scratch retention
- trajectory logging and replay-oriented observability
- Claude and Codex subscription OAuth flows
- generic room/world role assignment
- desktop screenshot and console-log hooks for developer verification

The current system is not yet a durable multi-task coordinator product.

The biggest gaps are structural:

1. The current orchestrator is session-centric, not task-thread-centric.
2. Task state is mostly in memory and recent-history JSONL, not durable archive/search/reopen state.
3. There is contract drift between the current PTY/swarm implementation and legacy `CODE_TASK` task APIs and tests.
4. Provider selection is auth-readiness based, not quota/health/failover based.
5. Deep research model support exists, but is not wired into the orchestrated task lifecycle.
6. Full transcript, artifact, screenshot, and validation capture are incomplete and split across subsystems.
7. Roles exist, but not the policy layer needed for task-agent permissions across connectors like Discord.

The recommendation is to treat this as a convergence project before feature expansion:

- define a first-class durable `TaskThread`
- make the coordinator the owner of task completion criteria and validation
- demote PTY sessions, trajectories, screenshots, and sub-agent runs to linked artifacts beneath the thread
- unify legacy `CODE_TASK` and current PTY/swarm contracts behind one task service
- add a provider budget broker and policy layer

## 1. Goal

Build a coordinator-centered task system that can manage many ongoing tasks across coding, research, planning, and execution workflows, with sub-agents underneath each task, durable history, provider failover, role-aware authorization, and strict validation before work is marked finished.

## 2. Why This Needs To Exist

The intended user experience is not “start one live coding session.” It is:

- talk to Milady about one ongoing task
- switch to another task without losing context
- let the coordinator create and manage sub-agents
- let the coordinator aggressively follow up until acceptance criteria are actually met
- retrieve status at any time
- archive completed work and reopen it later
- route work across Codex, Claude Code, PI, and cloud fallbacks based on real availability and budget

That is a task operating system, not just a PTY launcher.

## 3. Product Requirements

### 3.1 Functional Requirements

1. Milady must support multiple concurrent open tasks per user and per room/workspace.
2. Each task must be a durable thread with its own title, summary, context, acceptance criteria, status, assignee/coordinator state, artifacts, and event history.
3. Each task must support zero or more sub-agents and zero or more execution runs.
4. Users must be able to continue an existing task, switch tasks, ask for current status, archive tasks, search archived tasks, and reopen archived tasks.
5. The coordinator must define explicit finish criteria when the task is created or clarified.
6. The coordinator must review sub-agent outputs and keep following up until finish criteria are satisfied or a blocker is raised.
7. If a sub-agent needs user input, the coordinator must surface that request, wait, and resume the same task when the user responds.
8. The system must support coding, research, planning, and other long-running task types, not only code-editing.
9. The system must support deep research jobs as first-class task runs that can complete asynchronously and return reports into the task thread.
10. The system must support provider routing across Codex, Claude Code, PI, and Eliza Cloud fallback, with warnings and failover behavior when a provider is exhausted or unavailable.
11. The system must support role-based authorization for who may invoke which task abilities on which connectors and in which rooms.
12. The system must retain a complete audit trail for user messages, coordinator messages, sub-agent messages, tool actions, PTY output, trajectory links, screenshots, validation artifacts, and final decisions.
13. The UI must expose current tasks, status, blockers, pending user questions, active sub-agents, and archived task search.

### 3.2 Non-Functional Requirements

1. Durable by default. No critical task state may live only in process memory.
2. Cross-platform. Mac, Linux, Windows, and containerized remote runtimes must be supported.
3. Secure. Credentials, cookies, OAuth tokens, and role policies must be bounded and auditable.
4. Observable. Every significant coordinator decision must be inspectable after the fact.
5. Recoverable. Restarts must not lose task-thread continuity.
6. Verifiable. The coordinator cannot claim completion without validation artifacts or explicit justified exceptions.

## 4. Code-Verified Current State

### 4.1 Real Foundations

These parts are real and reusable:

- `plugins/plugin-agent-orchestrator/src/services/pty-service.ts`
  PTY-backed task-agent lifecycle, IO, event streaming, and session management are real.
- `plugins/plugin-agent-orchestrator/src/services/swarm-coordinator.ts`
  There is real coordinator logic for task registration, pending decisions, blocked states, supervision, and session event handling.
- `plugins/plugin-agent-orchestrator/src/actions/start-coding-task.ts`
  The main agent can already create task agents and provision workspaces.
- `plugins/plugin-agent-orchestrator/src/services/task-agent-frameworks.ts`
  Framework discovery exists for Claude, Codex, Gemini, Aider, and PI.
- `packages/agent/src/api/subscription-routes.ts`
  Anthropic and Codex OAuth/browser-login flows are real.
- `packages/agent/src/auth/credentials.ts`
  Subscription tokens can be applied into runtime env and Claude Code token import already exists.
- `packages/plugin-roles/src/action.ts` and `packages/plugin-roles/src/provider.ts`
  Role assignment and role context injection are real.
- `packages/agent/src/api/trajectory-routes.ts` and `docs/rest/trajectories.md`
  Trajectory inspection/export infrastructure is real.
- `docs/apps/desktop-local-development.md`
  Screenshot and console-log hooks already exist and can support verification workflows.

### 4.2 Critical Gaps

#### A. No durable task-thread model

- `SwarmCoordinator` stores task contexts in memory.
- `SwarmHistory` is a capped JSONL file with only summary events.
- `/api/coding-agents/coordinator/status` filters terminal tasks out of the normal active task view.

Result:

- no durable “ongoing task” object
- no first-class open vs closed vs archived task model
- no archive search/reopen behavior
- no durable “current task” resolution model

#### B. Session-first UI, not task-first UI

- `packages/app-core/src/components/chat/CreateTaskPopover.tsx` creates a live coding task, not a durable task thread.
- The status surfaces are mostly session-oriented.
- Recent events are buffered in memory rather than treated as canonical task history.

Result:

- the product feels like “spawn an agent” rather than “manage a task”

#### C. Legacy contract drift around `CODE_TASK`

- `packages/agent/src/services/coding-task-executor.ts` still expects a `CODE_TASK` service.
- `packages/agent/src/api/server.ts` contains a fallback that assumes `CODE_TASK` task CRUD semantics.
- `packages/agent/test/agent-orchestration.e2e.test.ts` is written around an `AgentOrchestratorService` task model with task CRUD, pause, resume, and result semantics.
- The current plugin route path is PTY/swarm-centric instead.

Result:

- there are effectively two orchestration contracts
- tests and runtime expectations do not cleanly agree
- feature work on top of this will amplify confusion

#### D. Provider selection is not budget brokering

- `task-agent-frameworks.ts` checks install state and auth readiness.
- Claude subscription detection is partly file-based and partly macOS-keychain-based.
- Codex detection is mostly local auth/OAuth based.
- `credit-detection.ts` exists, but it only detects insufficient-credit errors.
- Chat surfaces can show user-facing insufficient-credit messaging, but there is no orchestrator-level budget state machine or automatic provider failover.

Result:

- provider routing is static preference plus auth, not real-time budget/health routing

#### E. Deep research exists at model level but not task level

- `plugins/plugin-openai/typescript/models/research.ts` and `plugins/plugin-elizacloud/typescript/models/research.ts` provide real deep-research handlers.
- `packages/agent/src/services/research-task-executor.ts` still performs a simple sequential `TEXT_LARGE` decomposition and synthesis flow.

Result:

- “deep research task agents” are not yet an end-to-end product capability

#### F. Role system is generic, not orchestration-policy aware

- `plugin-roles` supports role assignment and prompt context.
- It does not define policies like:
  - who may invoke coding agents in Discord
  - who may spend Claude/Codex subscription budget
  - who may use remote execution, Git operations, or cloud fallback

Result:

- authorization groundwork exists, but orchestration authorization does not

#### G. Transcript capture is incomplete

- trajectories capture model calls
- PTY output capture exists
- recent activity buffers exist
- scratch retention exists

But there is no single durable joined record that contains:

- the user conversation
- coordinator reasoning decisions
- sub-agent prompts/messages
- full PTY/tool actions
- screenshots
- validation artifacts
- final acceptance signoff

#### H. End-to-end provider support is uneven

- Backend framework discovery knows about `pi`.
- The current `CreateTaskPopover` UI only exposes `claude`, `gemini`, `codex`, and `aider`.

Result:

- “supported by the backend” and “available to the user end to end” are not the same thing

### 4.3 What Is Real, Partial, and LARP/Misleading

#### Real

- PTY sub-agent execution
- coordinator supervision and blocked/pending decisions
- workspace provisioning
- trajectory logging
- OAuth login flows for Anthropic and Codex
- desktop screenshot and console hooks

#### Partial

- multi-agent work inside one live task launch
- role assignment
- provider preference selection
- research execution
- task status UI

#### LARP or misleading today

These are the areas that look more complete than they are:

1. “Task management” is mostly live-session management, not durable task-thread management.
2. “Archive/history” is a capped recent summary log, not a searchable task archive.
3. “Provider switching” is mostly setup/auth routing, not budget-aware failover.
4. “Research tasks” are not yet deep-research task runs.
5. “Current status of a task” only works well for currently loaded active sessions, not for durable open/closed/archived tasks.
6. The old `CODE_TASK` model still shapes tests and some fallback API behavior even though the main runtime path has moved elsewhere.

## 5. External Pattern Review

The user explicitly pointed at [CodexBar](https://github.com/steipete/CodexBar). Its README shows a useful architectural lesson: quota and reset visibility can be gathered from a mix of local CLI state, browser cookies, OAuth, and local logs, and exposed through a dedicated usage surface instead of burying provider detection inside the main orchestration loop. It is primarily a macOS menu bar app, but it also ships a Linux CLI path. Inference: Milady should introduce a provider budget broker with pluggable provider-specific adapters rather than hard-coding budget checks into the coordinator or UI.

## 6. Proposed Product Model

### 6.1 Core Domain Objects

#### `TaskThread`

The durable unit the user thinks they are working on.

Fields:

- `id`
- `title`
- `kind` (`coding`, `research`, `planning`, `ops`, `mixed`)
- `status` (`open`, `active`, `waiting_on_user`, `blocked`, `validating`, `done`, `failed`, `archived`)
- `summary`
- `acceptanceCriteria`
- `currentPlan`
- `roomId`, `worldId`, `workspaceId`
- `createdBy`, `owner`, `coordinatorAgentId`
- `openedAt`, `updatedAt`, `closedAt`, `archivedAt`
- `lastUserTurnAt`, `lastCoordinatorTurnAt`
- `searchText`

#### `TaskRun`

One coordinator-directed attempt or execution wave for a task.

Fields:

- `id`
- `taskThreadId`
- `type` (`execution`, `validation`, `research`, `resume`, `retry`)
- `status`
- `providerStrategy`
- `startedAt`, `endedAt`
- `outcomeSummary`

#### `AgentSession`

One spawned sub-agent or runtime session attached to a task run.

Fields:

- `id`
- `taskRunId`
- `framework` (`claude`, `codex`, `pi`, `gemini`, `aider`, `elizacloud`)
- `providerSource` (`subscription`, `api-key`, `cloud-fallback`)
- `ptySessionId`
- `status`
- `workdir`
- `costEstimate`
- `quotaSnapshot`

#### `TaskArtifact`

Durable outputs attached to the task.

Kinds:

- transcript
- trajectory link
- screenshot
- validation report
- research report
- patch summary
- test result
- database query result
- replay bundle

#### `TaskJournalEvent`

The canonical append-only event stream.

Kinds:

- user_message
- coordinator_message
- task_created
- task_context_updated
- acceptance_criteria_set
- subagent_spawned
- subagent_message
- tool_event
- pty_output_chunk
- pending_user_input
- user_answer_received
- validation_started
- validation_passed
- validation_failed
- archived
- reopened

### 6.2 Current Task Resolution

The system must answer “what task are we talking about?” deterministically.

Resolution order:

1. Explicit task reference by ID, title, or recent selector.
2. If the user is answering a pending question, route to that blocked task.
3. If the room has a pinned active task, route there.
4. If exactly one open task was touched recently in the room, route there.
5. Otherwise ask the user which task to continue.

This must be durable and queryable, not inferred only from live session memory.

### 6.3 Completion Semantics

The coordinator cannot mark a task finished just because a sub-agent says it is finished.

A task only moves to `done` when:

1. acceptance criteria are defined
2. required validations have run
3. validation artifacts are attached or an explicit waiver is recorded
4. the coordinator writes a completion summary tied to evidence

If any of those are missing, the task stays `active`, `blocked`, or `validating`.

## 7. Proposed Architecture

### 7.1 Services

#### A. `TaskRegistryService`

Responsibilities:

- durable CRUD for task threads, runs, journal events, and artifacts
- open/closed/archived indexing
- full-text search for archived tasks
- current-task resolution helpers

Recommendation:

- back this with the main Milady database, not JSONL files

#### B. `CoordinatorService`

Responsibilities:

- create tasks
- define or refine acceptance criteria
- select provider strategy
- spawn/monitor sub-agents
- review outputs
- request user clarification
- decide when to continue, retry, validate, finish, or archive

This becomes the source of truth for task state transitions.

#### C. `ExecutionBroker`

Responsibilities:

- abstract current PTY session spawning, command transport, output capture, and teardown
- normalize Claude, Codex, PI, Gemini, Aider, and cloud-backed runs into one session/run contract

This should reuse the real PTY and workspace infrastructure already in `plugin-agent-orchestrator`.

#### D. `ProviderBudgetBroker`

Responsibilities:

- discover credential state
- discover usable quota or health where possible
- record last-success and last-failure state
- classify failures into:
  - auth
  - quota exhausted
  - rate limited
  - transient transport
  - policy denied
- choose failover order
- notify the user when provider budget is exhausted or degraded

#### E. `ValidationEngine`

Responsibilities:

- run required checks based on task type
- capture screenshots
- attach DB assertions, trajectory links, test results, and logs
- support LLM-as-judge only when deterministic checks are not available

#### F. `TaskPolicyService`

Responsibilities:

- evaluate whether the current user may:
  - create tasks
  - run coding tasks
  - use GitHub actions
  - spend provider budgets
  - access certain connectors

This should build on `plugin-roles`, not replace it.

### 7.2 Data Flow

1. User creates or continues a task.
2. Coordinator resolves the task thread or creates a new one.
3. Coordinator sets or refines acceptance criteria and plan.
4. Coordinator asks `ProviderBudgetBroker` for execution strategy.
5. Coordinator starts a `TaskRun`.
6. Coordinator spawns one or more `AgentSession`s through `ExecutionBroker`.
7. All messages, PTY output, tool actions, trajectories, and screenshots stream into `TaskJournalEvent` and `TaskArtifact`.
8. If a sub-agent needs user input, coordinator records `pending_user_input` and the task moves to `waiting_on_user`.
9. When execution claims completion, coordinator triggers `ValidationEngine`.
10. Validation passes or fails.
11. Coordinator either reopens execution, marks done, or records blocker state.
12. User archives the task or coordinator suggests archive after completion.

### 7.3 Migration/Convergence Call

Do not build this on top of both `CODE_TASK` and PTY/swarm paths.

Recommendation:

1. Make `TaskThread` the new source of truth.
2. Keep PTY/swarm as the execution substrate.
3. Provide a compatibility adapter so old `CODE_TASK` callers read/write through the new task registry until old code is removed.
4. Rewrite orchestration E2E tests around the new task-thread contract.

## 8. Research Plan Before Implementation

This is the research plan that should be completed before shipping code, even if some of it overlaps with the work already done for this document.

### 8.1 Contract Inventory

Deliverables:

- full map of existing APIs, services, UI components, tests, and docs touching coding agents, workbench tasks, trajectories, roles, subscriptions, and screenshots
- list of conflicting contracts and owners

Key files:

- `plugins/plugin-agent-orchestrator/**`
- `packages/agent/src/api/server.ts`
- `packages/agent/src/services/*task*`
- `packages/app-core/src/components/chat/**`
- `packages/plugin-roles/**`

### 8.2 Durable State Audit

Deliverables:

- identify every orchestration datum that currently lives only in memory, PTY buffers, or recent JSONL
- define what must move into the database

Questions:

- what existing tables can be reused
- whether task events should be normalized or stored as JSONB-like envelopes

### 8.3 Provider/Budget Research

Deliverables:

- provider adapter spec for Codex, Claude Code, PI, and Eliza Cloud
- per-provider auth sources
- per-provider quota/health detection methods
- failover rules and user notification rules

Specific areas:

- local auth file imports
- browser-login flows
- remote/container compatibility
- cross-platform behavior

### 8.4 Connector and Role Policy Research

Deliverables:

- policy matrix for Discord, desktop chat, CLI, and future connectors
- role-to-ability mapping
- escalation and audit requirements

### 8.5 Transcript and Artifact Research

Deliverables:

- canonical event schema for task journals
- strategy for linking trajectories, PTY output, screenshots, test logs, and DB assertions
- retention and archive policy

### 8.6 Validation Research

Deliverables:

- per-task-type validation recipes
- deterministic checks first
- LLM-as-judge policy for the remainder
- screenshot validation strategy

### 8.7 UI/UX Research

Deliverables:

- task list and task detail flows
- current-task switch rules
- pending-question UX
- archive/reopen UX
- provider budget warnings and login/repair flows

## 9. Detailed Implementation Plan

### Phase 0: Architecture Freeze

Outputs:

- ADR defining `TaskThread`, `TaskRun`, `AgentSession`, `TaskArtifact`, `TaskJournalEvent`
- migration plan for `CODE_TASK`
- provider broker interface
- role policy interface

Exit criteria:

- no unresolved ownership ambiguity between PTY/swarm path and task-thread path

### Phase 1: Durable Task Registry

Build:

- database schema for tasks, runs, sessions, artifacts, and journal events
- service layer for CRUD, archive, reopen, and search
- indexing for recent/open/archive queries

Migrate:

- add adapter that can materialize live coordinator sessions into task threads
- add compatibility shims for old callers

Exit criteria:

- restart-safe open tasks
- archive/reopen/search working via API

### Phase 2: Coordinator State Machine

Build:

- explicit coordinator task lifecycle
- acceptance criteria capture/update
- current-task resolution
- pending-user-input handling
- completion gating

Exit criteria:

- a task can pause on user input, resume, validate, and complete with evidence

### Phase 3: Execution Broker and PTY Convergence

Build:

- task-run attachment to PTY sessions
- normalized sub-agent session model
- unified session/run event ingestion into task journal

Refactor:

- replace ad hoc in-memory-only task context dependencies where possible
- reduce direct frontend dependence on raw PTY sessions

Exit criteria:

- PTY sub-agents are children of task runs, not the task system itself

### Phase 4: Provider Budget Broker

Build:

- provider adapter interface
- current auth state loader
- budget/health state cache
- failure classification and backoff
- failover policy:
  - preferred provider first
  - fail to alternative provider when exhausted or unavailable
  - optional Eliza Cloud final fallback

UX:

- user warnings for exhausted budget
- login/repair links or instructions
- visible provider selection per run

Exit criteria:

- a failed run due to provider exhaustion can switch or stop cleanly with evidence

### Phase 5: Deep Research Integration

Build:

- task-run type for deep research
- background/asynchronous research jobs
- research report artifact type
- citation/annotation preservation

Refactor:

- stop treating research tasks as only `TEXT_LARGE` decomposition

Exit criteria:

- a task thread can dispatch a deep research run and receive a durable report back

### Phase 6: Role and Policy Enforcement

Build:

- orchestration policy matrix
- connector-aware permission checks
- per-room/per-world allowed capabilities
- budget-spend policy

Exit criteria:

- Discord or room-scoped coding permissions can be restricted to owners/admins or explicit assignees

### Phase 7: Task-Centric UI

Build:

- task inbox/open list
- active task detail panel
- archive search and reopen
- task status, blockers, pending questions
- provider budget/status indicators
- sub-agent transcript and artifact views

Refactor:

- evolve “Create Coding Task” into “Create Task”
- keep coding-specific shortcuts where useful, but make them task-thread aware

Exit criteria:

- user can manage 10 to 20 active tasks without depending on session IDs

### Phase 8: Validation and Artifact Pipeline

Build:

- attach tests, logs, screenshots, DB assertions, and trajectory links to task artifacts
- validation recipes by task kind
- coordinator completion checklist

Exit criteria:

- every completed task has auditable finish evidence

### Phase 9: Legacy Cleanup

Remove or converge:

- legacy `CODE_TASK` assumptions
- stale fallback behavior that conflicts with the new task model
- tests that assert obsolete APIs
- session-only UI assumptions

Exit criteria:

- one orchestration contract, not two

## 10. Testing, Validation, and Verification Plan

### 10.1 Testing Principles

1. Test the real system, not just mocks.
2. Verify both behavior and recorded evidence.
3. Assert database state, API state, UI state, trajectory state, and artifact state together.
4. Use deterministic checks first.
5. Use LLM-as-judge only where deterministic validation is impossible or too brittle.

### 10.2 Test Layers

#### Unit Tests

Cover:

- task lifecycle transitions
- current-task resolution
- provider failover decision logic
- quota error classification
- role policy decisions
- archive/reopen/search filters
- acceptance criteria completeness checks

#### Service/Integration Tests

Cover:

- task registry persistence
- coordinator to execution broker interactions
- provider broker auth/quota transitions
- task journal ingestion
- artifact linking
- pending-user-input resume flow

#### API Tests

Cover:

- create/update/archive/reopen/search task endpoints
- status endpoints
- provider budget endpoints
- task artifact retrieval
- validation endpoints

#### E2E Orchestration Tests

Cover:

- real task creation
- sub-agent spawn
- run status updates
- user clarification handoff
- validation retry loop
- archive/reopen flows
- concurrent task handling

#### UI E2E Tests

Cover:

- task creation from chat
- task switching
- archived-task search and reopen
- pending-question display
- status refresh
- sub-agent transcript and artifact viewing

### 10.3 Required Scenario Matrix

These scenarios should exist as full scripts and full E2E cases.

1. Coding task in Discord by authorized owner.
2. Coding task in Discord by unauthorized user, correctly denied.
3. Two active tasks in one room, user switches between them without losing context.
4. Task archived, searched, reopened, and resumed.
5. Claude exhausted mid-run, system warns and fails over to Codex.
6. Codex exhausted mid-run, system warns and fails over to Claude.
7. Both local subscriptions exhausted, system offers or uses Eliza Cloud final fallback according to policy.
8. Sub-agent requests user clarification, coordinator pauses, user replies, run resumes.
9. Deep research task launches, completes asynchronously, returns a cited report into the task thread.
10. Coordinator receives “done” from sub-agent but validation fails, coordinator reopens execution.
11. Tail-call CLI workflow where the agent chains actions until the scenario actually completes.
12. Desktop/UI scenario where screenshots, logs, DB rows, and trajectories all agree on the final state.

### 10.4 Screenshot Validation Plan

Screenshots must be first-class verification artifacts.

Capture points:

- task list after create
- task detail during active execution
- pending-user-input state
- completed task with attached evidence
- archived task search and reopen flows

Sources:

- Playwright screenshots for renderer-level assertions
- desktop screenshot endpoint for full-screen/native verification when relevant

Validation steps:

1. Capture screenshot.
2. Record timestamp, task ID, route/view, and source.
3. Validate expected DOM state where available.
4. Optionally OCR or inspect screenshot content for key text/state.
5. Link screenshot to task artifact record.
6. Cross-check screenshot timestamp against journal events and DB state.

LLM-as-judge usage:

- allowed for semantic UI verification such as “does this screenshot show the pending-question banner and the active task title”
- not allowed as the only validation for deterministic UI state like wrong badge text, missing task, or wrong status count

### 10.5 Database Verification Plan

For every major E2E flow, assert:

- task thread row exists and status matches expectation
- task journal contains the required event sequence
- task run/session rows are linked correctly
- artifact rows exist for screenshots, logs, reports, and validations
- archive/reopen transitions are durable across restart

### 10.6 Trajectory and Transcript Verification Plan

For every agent-involved scenario, assert:

- coordinator trajectory IDs are recorded
- sub-agent trajectory IDs are recorded where applicable
- PTY output or session transcript is attached
- the joined task transcript contains:
  - user request
  - coordinator instructions
  - sub-agent outputs
  - validation summary

### 10.7 Provider Failover Verification Plan

Simulate and verify:

- missing auth
- expired auth
- insufficient credits
- rate limit
- transient network failure
- provider binary missing

Expected assertions:

- user receives clear warning
- provider budget state changes are recorded
- failover occurs or a clean blocker is raised
- the run does not silently disappear

### 10.8 Cross-Platform Verification Plan

Minimum matrix:

- macOS local desktop
- Linux local/containerized
- Windows local
- remote/container orchestrator with browser-login initiated elsewhere

Verify:

- credential detection behavior
- login flow behavior
- provider binary discovery
- screenshot strategy availability
- path handling and workspace behavior

### 10.9 Chaos and Recovery Tests

Scenarios:

- runtime restart during active task
- PTY session crash
- provider exhaustion during validation
- database reconnect/restart
- archived task reopened after long idle period

Expected behavior:

- task thread survives
- coordinator can recover or surface a precise blocker

## 11. Acceptance Criteria for This Product

The product is done when all of the following are true:

1. A user can maintain multiple active tasks and switch between them reliably.
2. A task is durable across restart and reconnect.
3. A task can be archived, searched, reopened, and resumed.
4. Sub-agents are fully attached to a task thread with complete audit history.
5. The coordinator defines finish criteria and enforces validation before completion.
6. Provider failover and exhaustion handling are explicit, visible, and tested.
7. Role-based task permissions work across at least the desktop and Discord entry points.
8. Deep research runs are first-class task runs with durable outputs.
9. Screenshots, DB state, trajectories, and logs can all be used as verification artifacts.
10. Legacy `CODE_TASK` drift no longer causes contract ambiguity.

## 12. Risks and Unknowns

1. There may be hidden coupling between current frontend polling behavior and the legacy fallback task model.
2. Provider quota detection may vary by platform and by login method.
3. Cross-machine login handoff UX may need provider-specific treatment.
4. Full transcript retention may create privacy, storage, or performance pressure.
5. Deep research jobs may need their own timeout, cancellation, and cost controls.
6. Discord and other connector permission semantics may not line up cleanly with current room/world role assumptions.

## 13. Open Questions Requiring Product Decisions

1. Should task threads be global per user, scoped per room, or support both with explicit sharing semantics?
2. What is the exact failover order: preferred local subscription first, then alternate local subscription, then Eliza Cloud, or should cloud fallback require explicit approval?
3. Should archived tasks remain searchable in normal chat context, or only through an explicit archive surface?
4. How much coordinator reasoning should be exposed to end users versus stored only for audit/admin inspection?
5. What is the retention policy for full PTY transcripts, screenshots, and trajectory links?
6. Do we want one unified task UI across coding/research/planning, or a generic task model with specialized views per task kind?
7. Does “only I can code on Discord” mean world owner only, connector-specific allowlists, or both?

## 14. Recommendation

Approve this as a convergence-first program, not a feature patch.

The highest leverage sequence is:

1. durable task registry
2. coordinator state machine and completion semantics
3. PTY/swarm convergence under that model
4. provider budget broker
5. validation/artifact pipeline
6. UI expansion

Anything else risks adding more surface area on top of a split contract that is already starting to drift.
