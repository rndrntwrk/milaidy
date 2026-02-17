# Phase 3 Safe-Mode Tool-Class Restrictions (2026-02-17)

Checklist target: `P3-017`

## Scope

Implemented explicit safe-mode restrictions by tool risk class in runtime:

- `read-only`: allowed while remaining in `safe_mode`.
- `reversible`: blocked with `safe_mode_restricted`.
- `irreversible`: blocked with `safe_mode_restricted`.
- unknown risk class: blocked fail-closed.

## Implementation

- Policy definition:
  - `src/autonomy/roles/safe-mode-policy.ts`
- Runtime enforcement:
  - `src/autonomy/workflow/execution-pipeline.ts`
  - Emits `autonomy:safe-mode:tool-blocked` on denied calls.
- Unit coverage:
  - `src/autonomy/roles/safe-mode-policy.test.ts`
  - `src/autonomy/workflow/execution-pipeline.test.ts` (`safe mode restrictions` block)

## Validation Run

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/roles/safe-mode-policy.test.ts src/autonomy/workflow/execution-pipeline.test.ts
```

Result:

- Test files: `2` passed
- Tests: `28` passed
- Safe-mode enforcement: non-read-only calls denied before execution, read-only calls allowed while state remains `safe_mode`
