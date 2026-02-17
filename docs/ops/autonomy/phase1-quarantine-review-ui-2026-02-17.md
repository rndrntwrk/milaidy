# Phase 1 Quarantine Review UI (2026-02-17)

Checklist target: `P1-038`

## Implementation

Implemented workbench quarantine review controls in the app UI:

- `apps/app/src/components/GovernancePanel.tsx`
  - added `Quarantine` subtab in Governance panel
  - loads `/api/workbench/quarantine` queue data and gate stats
  - renders pending quarantined memories with trust/source context
  - added approve/reject review actions wired to `/api/workbench/quarantine/:id/review`
  - includes refresh, loading, and error states for operational use
- `apps/app/src/api-client.ts`
  - added typed workbench quarantine client methods:
    - `getWorkbenchQuarantine()`
    - `reviewWorkbenchQuarantined(memoryId, decision)`
  - added quarantine payload interfaces for UI consumption

## Validation

Executed:

```bash
./node_modules/.bin/vitest run --config apps/app/vitest.config.ts \
  apps/app/test/app/governance-panel.test.ts \
  apps/app/test/app/workbench-quarantine-api-client.test.ts
```

Result:

- `2` test files passed
- `3` tests passed
