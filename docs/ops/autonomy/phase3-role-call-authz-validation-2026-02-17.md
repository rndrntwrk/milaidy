# Phase 3 Role Call Auth and Validation Enforcement (2026-02-17)

Checklist target: `P3-008`

## Scope

Enforced role-call auth and boundary validation for every orchestrator role invocation.

- Auth enforcement: role calls are denied when caller source is not allowlisted or caller trust is below configured floor.
- Validation enforcement: role-boundary request/response parsers remain fail-closed on every call path.

## Implementation

- Orchestrator role-call auth guard:
  - `src/autonomy/roles/orchestrator.ts`
  - Added `RoleCallAuthzPolicy` and `assertRoleCallAuthorized(...)`.
  - Applied auth checks in `callRoleWithResilience(...)`, which is used by all planner/executor/verifier/memory-writer/auditor calls.
- Config + validation for auth policy:
  - `src/autonomy/config.ts`
  - Added `roles.orchestrator.minSourceTrust` and `roles.orchestrator.allowedSources`.
  - Added config validation for trust range and allowed source values.
- Service wiring:
  - `src/autonomy/service.ts`
  - Passed resolved auth policy into orchestrator construction.
- Test coverage:
  - `src/autonomy/roles/orchestrator.test.ts`
    - deny low-trust caller path
    - deny disallowed source path
  - `src/autonomy/config.test.ts`
    - default auth-policy values
    - invalid auth-policy validation failures

## Validation Run

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/config.test.ts src/autonomy/service.test.ts src/autonomy/roles/orchestrator.test.ts src/autonomy/roles/orchestrator-authz.test.ts src/autonomy/roles/orchestrator-concurrency.test.ts src/autonomy/roles/lifecycle-integration.test.ts
```

Result:

- Test files: `6` passed
- Tests: `99` passed
- New role-call deny scenarios: fail-closed behavior validated for low trust and disallowed sources.
