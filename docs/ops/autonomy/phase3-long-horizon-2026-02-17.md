# Phase 3 Long-Horizon Comparison Run (2026-02-17)

Checklist target: `P3-038`

## Implementation

Added dedicated long-horizon runner:

- `scripts/autonomy/run-long-horizon-suite.ts`
- `npm run autonomy:long-horizon:run`

Runner behavior:

1. Replicates the full baseline scenario catalog for N cycles.
2. Measures aggregate metrics across the expanded horizon.
3. Compares against a baseline snapshot label.
4. Emits `.long-horizon.json` and `.long-horizon.md` artifacts.

## Validation Run

Executed:

```bash
npm run autonomy:long-horizon:run -- --label phase3-long-horizon-2026-02-17 --cycles 12 --compare baseline-sprint1-smoke
```

Key outputs:

- Turn count: `480`
- Scenario count: `168`
- Baseline comparison label: `baseline-sprint1-smoke`
- Overall improvement score: `0.0000`

Generated artifacts:

- `docs/ops/autonomy/reports/phase3-long-horizon-2026-02-17.long-horizon.json`
- `docs/ops/autonomy/reports/phase3-long-horizon-2026-02-17.long-horizon.md`
