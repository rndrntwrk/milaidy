# Phase 3 Role Call Resilience (2026-02-17)

Checklist target: `P3-009`

## Scope

Implemented role-boundary resilience for orchestrated role calls:

- Retries with bounded backoff.
- Per-call timeouts.
- Per-role circuit breakers with cooldown reset.
- Configurable policy via autonomy config.

## Implementation

- Orchestrator resilience policy + enforcement:
  - `src/autonomy/roles/orchestrator.ts`
  - Added `RoleCallPolicy` defaults, constructor sanitization, and resilient wrapper for planner/executor/verifier/memory-writer/auditor role calls.
- Config surface and validation:
  - `src/autonomy/config.ts`
  - Added `roles.orchestrator` fields (`timeoutMs`, `maxRetries`, `backoffMs`, `circuitBreakerThreshold`, `circuitBreakerResetMs`) plus validation guards.
- Service wiring:
  - `src/autonomy/service.ts`
  - Passed resolved `config.roles.orchestrator` policy into `KernelOrchestrator`.
- Test coverage:
  - `src/autonomy/roles/orchestrator.test.ts`
    - retries recover from transient executor failures
    - timeout fail-fast behavior
    - circuit breaker opens and blocks subsequent calls
  - `src/autonomy/config.test.ts`
    - default role-call resilience values
    - invalid resilience config validation

## Validation Run

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/config.test.ts src/autonomy/service.test.ts src/autonomy/roles/orchestrator.test.ts src/autonomy/roles/orchestrator-authz.test.ts src/autonomy/roles/orchestrator-concurrency.test.ts src/autonomy/roles/lifecycle-integration.test.ts
```

Result:

- Test files: `6` passed
- Tests: `97` passed
- Resilience scenarios validated: retry success path, timeout fail-fast, circuit-open blocking.
