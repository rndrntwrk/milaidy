# Coordinator Scenario Eval PRD

This document defines the production contract for coordinator scenario testing in Milady.

## Goal

Prove that the coordinator can execute real multi-turn user requests through Milady, across app chat and connector-origin traffic, using live providers where available, while producing durable evidence in Milady itself.

## Non-goals

- Judging whether the model wrote the best possible code
- Cosmetic UI redesign
- Replacing existing trajectory or task-thread systems

## Product Requirements

1. Scenario runs must enter Milady through the same chat or connector semantics used by real users.
2. Scenario conversations must support nuanced follow-ups, interruptions, pause and resume, history questions, preview requests, and connector-specific responses.
3. Every run must emit durable evidence:
   - conversation transcript
   - task thread or threads
   - PTY transcript where applicable
   - trajectory records and export bundle
   - artifact manifest
   - changed-file summary
   - machine-readable verdict
4. Scenario and batch identifiers must flow through trajectory storage so runs can be grouped and exported later.
5. History answers such as "what did we do yesterday" must come from durable lookup primitives, not raw context stuffing.
6. Preview and remote sharing must be capability-driven. The agent should inspect available transports instead of assuming one hardcoded path.
7. Connector parity matters. The same scenario framework must work for app chat and for enabled inbound connectors.

## Start, Middle, End

### Start

- A user or connector-origin message arrives.
- The coordinator either responds directly or creates or continues a task thread.
- The run is tagged with `scenarioId`, `batchId`, channel, and conversation identifiers.

### Middle

- The agent may clarify, create files, run task agents, ask for approval, pause, resume, or stop.
- Follow-up turns continue the same work unless the user clearly starts a new task.
- History and reporting questions query persisted state instead of replaying raw context.

### End

- The scenario reaches a terminal outcome:
  - done
  - waiting on user
  - blocked
  - interrupted
  - failed
- The run bundle is written.
- Milady can surface the resulting trajectories, task-thread details, artifacts, and changed files.

## Evidence Pass Bar

A scenario passes when Milady can prove execution with durable state:

- DB state reflects the expected task-thread and trajectory changes
- trajectory logging exists and is queryable
- artifacts or changed files exist when the scenario requires produced work
- the final task state matches the scenario intent

## Scenario Inventory

The executable catalog lives in:

- [packages/agent/src/evals/coordinator-scenarios.ts](/Users/shawwalters/eliza-workspace/milady/packages/agent/src/evals/coordinator-scenarios.ts)

The inventory covers:

- build and edit flows
- continuation and implicit approval
- preview and remote sharing
- pause, resume, and stop
- task history and reporting
- research and planning
- connector behavior
- failover and recovery
- task management
- visibility and audit

## Implementation Requirements

1. Persist `scenarioId` and `batchId` in trajectory storage and filtering.
2. Add task-history query primitives with time-window and topical search.
3. Add coordinator control actions for pause, resume, stop, archive, reopen, and continue.
4. Add coordinator share actions that inspect available preview and share paths.
5. Build a live preflight that verifies:
   - task-agent framework availability
   - subscription auth availability
   - connector configuration and readiness
   - trajectory logging availability
   - coordinator service availability
   - share capability discovery
6. Build a live runner that can target app chat and connector-mode ingress.
7. Export a run bundle that includes trajectories, task-thread state, artifacts, and changed files.

## Risks

- Live provider and connector tests are quota-sensitive.
- Not every configured connector can be exercised by an external network roundtrip in all environments, so the runner must distinguish between connector-ingress parity and full external transport parity.
- Remote sharing may be unavailable in some environments. The system must detect that cleanly and report it explicitly.
