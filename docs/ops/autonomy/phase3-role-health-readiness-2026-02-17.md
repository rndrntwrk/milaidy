# Phase 3 Role Health and Readiness Endpoints (2026-02-17)

Checklist target: `P3-010`

## Scope

Implemented per-role health checks and readiness endpoints for the autonomy role boundary:

- `GET /api/agent/autonomy/roles/health`
  - Returns role-level availability/method-health snapshot.
- `GET /api/agent/autonomy/roles/readiness`
  - Returns readiness gate (`200` when ready, `503` when not ready).

## Implementation

- Service role-health model and inspection:
  - `src/autonomy/service.ts`
  - `getRoleHealth()` returns role-by-role health + readiness summary.
- API route wiring:
  - `src/api/server.ts`
- OpenAPI surface:
  - `src/api/openapi/spec.ts`
  - `src/api/openapi/spec.test.ts`
- Runtime/API test coverage:
  - `src/autonomy/service.test.ts`
  - `src/api/__tests__/autonomy-role-health.test.ts`

## Validation Run

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/service.test.ts src/api/openapi/spec.test.ts src/api/__tests__/autonomy-role-health.test.ts
```

Result:

- Test files: `3` passed
- Tests: `53` passed
- Endpoints verified: role health (`200`), readiness (`200`/`503`) behavior
