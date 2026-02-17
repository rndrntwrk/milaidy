# Phase 3 Persistence of Invariant Decisions and Safe-Mode Transitions (2026-02-17)

Checklist target: `P3-012`

## Scope

Persisted role-kernel state transitions (including safe-mode enter/exit) into the autonomy event store, while maintaining invariant decision persistence from pipeline events.

## Implementation

- Added durable kernel transition event persistence in service wiring:
  - `src/autonomy/service.ts`
  - request stream IDs:
    - `kernel-state-transitions`
    - `kernel-safe-mode-transitions`
  - event types:
    - `kernel:state:transition`
    - `kernel:safe-mode:transition`
- Confirmed invariant decisions remain persisted as:
  - `tool:invariants:checked`
  - `tool:decision:logged`
  in pipeline event logs.
- Added service-level regression coverage:
  - `src/autonomy/service.test.ts`

## Validation Run

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/service.test.ts src/autonomy/workflow/integration-pipeline.test.ts
```

Result:

- Test files: `3` passed
- Tests: `80` passed
- Persistence verified for both:
  - safe-mode enter/exit transition events
  - invariant decision events in pipeline traces
