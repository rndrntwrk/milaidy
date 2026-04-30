# Workflow Engine Decision Record

Date: 2026-02-17
Owner: Autonomy Architecture
Status: Accepted

## Decision

Use a dual-provider workflow engine:
- Default provider: `local` in-process workflow engine.
- Optional provider: `temporal` for durable, externally orchestrated workflows.

`TemporalWorkflowEngine` is enabled via configuration and automatically falls
back to `LocalWorkflowEngine` when Temporal dependencies or connectivity are
not available.

## Context

Phase 2 requires durable multi-step plan execution with restart survival,
idempotency, and operational traceability. The runtime must also remain usable
in local/dev and offline environments where external orchestration is not
available.

## Options Evaluated

1. Local-only engine
- Pros: zero external infra, low latency, easy onboarding.
- Cons: weak durability and restart guarantees.

2. Temporal-only engine
- Pros: strong durability, retries, task queue semantics.
- Cons: requires additional infra and runtime dependencies in every environment.

3. Dual-provider engine (selected)
- Pros: durable path available in production while preserving local/dev UX.
- Cons: added complexity from provider abstraction and fallback behavior.

## Acceptance Criteria

The selected approach must satisfy:
- Deterministic API for start/status/cancel across providers.
- Config-based provider selection (`local` or `temporal`).
- Safe fallback from Temporal to local when unavailable.
- Worker bootstrap and task-queue configuration for Temporal path.

## Consequences

- Production deployments can adopt Temporal incrementally without breaking local
  operation.
- Restart durability verification must be executed specifically against the
  Temporal provider.
- Monitoring must distinguish local vs Temporal execution paths.

## Follow-on Work

- Implement and validate workflow templates for multi-step plan execution.
- Ship Temporal worker runtime and queue configuration.
- Add restart-survival and idempotency tests on Temporal path.
