# Phase 1 Identity Update Policy and Approval Rules (2026-02-17)

Checklist target: `P1-004`

## Implementation

Defined and enforced sanctioned identity mutation policy with explicit approval rules:

- `src/autonomy/identity/update-policy.ts`
  - policy evaluator for identity updates with actor/source attribution
  - high-risk mutation class (`name`, `coreValues`, `hardBoundaries`) requiring independent approval + reason on API/CLI sources
  - direct mutation blocklist for kernel-managed fields (`identityVersion`, `identityHash`)
- `src/autonomy/service.ts`
  - enforces policy before applying any identity update
  - rejects policy violations with clear errors
  - emits policy metadata in `autonomy:identity:updated` audit payload (`source`, `actor`, `risk`, `approvalRequired`, `approvedBy`, `reason`)
- `src/api/server.ts`
  - forwards identity update governance context from headers:
    - `x-autonomy-actor`
    - `x-autonomy-approved-by`
    - `x-autonomy-change-reason`
- `src/api/openapi/spec.ts`
  - documents identity governance headers on `PUT /api/agent/identity`

## Validation

Executed:

```bash
./node_modules/.bin/vitest run \
  src/autonomy/identity/update-policy.test.ts \
  src/autonomy/service.test.ts \
  src/api/__tests__/identity-memory-routes.test.ts \
  src/api/openapi/spec.test.ts
```

Result:

- `4` test files passed
- `65` tests passed
