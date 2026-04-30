# Phase 1 Preference Source/Scope UI (2026-02-17)

Checklist target: `P1-039`

## Implementation

Implemented source/scope visibility for identity soft preferences in the app UI:

- `apps/app/src/components/IdentityPanel.tsx`
  - normalizes soft-preference entries for display
  - supports structured preference metadata (`value`, `source`, `scope`, provenance-derived source/scope)
  - displays source and scope columns for each preference row
  - applies explicit defaults when metadata is absent:
    - source: `identity-config`
    - scope: `global`

## Validation

Executed:

```bash
./node_modules/.bin/vitest run --config apps/app/vitest.config.ts \
  apps/app/test/app/identity-panel.test.ts \
  apps/app/test/app/governance-panel.test.ts \
  apps/app/test/app/workbench-quarantine-api-client.test.ts
```

Result:

- `3` test files passed
- `5` tests passed
