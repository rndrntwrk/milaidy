# Phase 1 Goal and Gate Observability (2026-02-17)

Checklist targets: `P1-018`, `P1-028`

## Implementation

Goal transition event logging:

- `src/autonomy/goals/manager.ts`
  - emits goal-status transition metric on create and status transitions

Gate observability wiring (decision counters, queue size, latency):

- `src/autonomy/approval/approval-gate.ts`
- `src/autonomy/approval/persistent-approval-gate.ts`
- `src/autonomy/memory/gate.ts`
- `src/autonomy/metrics/prometheus-metrics.ts`

Metric coverage now includes:

- `milaidy_autonomy_goal_transitions_total{status}`
- `milaidy_autonomy_approval_requests_total{risk_class}`
- `milaidy_autonomy_approval_queue_size`
- `milaidy_autonomy_approval_decisions_total{decision}`
- `milaidy_autonomy_approval_turnaround_ms`
- `milaidy_autonomy_memory_gate_decisions_total{decision}`
- `milaidy_autonomy_quarantine_size`

## Validation

Executed:

```bash
./node_modules/.bin/vitest run \
  src/autonomy/approval/approval-gate.test.ts \
  src/autonomy/approval/persistent-approval-gate.test.ts \
  src/autonomy/memory/gate.test.ts \
  src/autonomy/goals/manager.test.ts \
  src/autonomy/metrics/prometheus-metrics.test.ts
```

Result:

- `5` test files passed
- `94` tests passed
