# Phase 4 Experiment Tracking and Checkpoint Rollback Strategy (2026-02-17)

Checklist targets: `P4-014`, `P4-015`

## Implementation

Implemented persistent experiment tracking, artifact registry, and checkpoint rollback selection:

- `src/autonomy/learning/training/experiment-registry.ts`
  - defines typed experiment run + artifact schemas
  - implements in-memory and file-backed experiment registry
  - supports run lifecycle transitions, metric updates, artifact attachment, and best-run lookup
- `src/autonomy/learning/training/checkpoint-registry.ts`
  - defines typed model checkpoint schema
  - implements in-memory and file-backed checkpoint registry
  - adds rollback-candidate selection against current metrics
  - adds rollback-plan generation with explicit restore steps
- `scripts/autonomy/run-training-job.ts`
  - now records each training run into:
    - experiment registry (`training-experiments.registry.json`)
    - checkpoint registry (`training-checkpoints.registry.json`)
  - writes per-run checkpoint artifact (`ckpt-<job-id>.checkpoint.json`)
  - emits report metadata with registry paths and rollback recommendation (when available)
- `src/autonomy/learning/index.ts`
  - exports experiment/checkpoint registry APIs for integration use

## Validation

Executed:

```bash
./node_modules/.bin/vitest run \
  src/autonomy/learning/training/dataset.test.ts \
  src/autonomy/learning/training/environment.test.ts \
  src/autonomy/learning/training/job-orchestrator.test.ts \
  src/autonomy/learning/training/rlvr-loop.test.ts \
  src/autonomy/learning/training/hyperparam-tuner.test.ts \
  src/autonomy/learning/training/experiment-registry.test.ts \
  src/autonomy/learning/training/checkpoint-registry.test.ts
```

Result:

- `7` test files passed
- `27` tests passed

Executed registry-backed training run:

```bash
npm run autonomy:training:run -- \
  --dataset-file docs/ops/autonomy/reports/p4-001-002-learning-dataset-20260217.learning-dataset.json \
  --label p4-012-013-training-job-20260217 \
  --seed p4-012
```

Generated registry artifacts:

- `docs/ops/autonomy/reports/training-experiments.registry.json`
- `docs/ops/autonomy/reports/training-checkpoints.registry.json`
- `docs/ops/autonomy/reports/ckpt-train-299ca557a555.checkpoint.json`
