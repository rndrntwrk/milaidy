# Phase 4 Held-Out and Adversarial Dataset Splits (2026-02-17)

Checklist targets: `P4-006`, `P4-007`

## Implementation

Implemented deterministic dataset split builders for validation and robustness tracks:

- `src/autonomy/learning/dataset-splits.ts`
  - `buildHeldOutValidationSplit(...)`
    - deterministic holdout split using stable hash scoring (`seed` support)
    - configurable holdout ratio with train-set safety guard
  - `buildAdversarialSplit(...)`
    - risk-based adversarial selection using anomaly, drift, verification, and weak-reward signals
    - target-ratio control for adversarial cohort size
- `src/autonomy/learning/index.ts`
  - exports held-out/adversarial split APIs and option/result types

## Validation

Executed:

```bash
./node_modules/.bin/vitest run \
  src/autonomy/learning/dataset-splits.test.ts \
  src/autonomy/learning/quality-filters.test.ts \
  src/autonomy/learning/deidentification.test.ts \
  src/autonomy/learning/trace-collector.test.ts
```

Result:

- `4` test files passed
- `23` tests passed

Coverage highlights:

- held-out split determinism and ratio behavior
- non-empty train-set guard for small datasets
- adversarial split prioritization of anomaly/drift/verification risk
- reward-threshold sensitivity in adversarial selection
