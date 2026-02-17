# Phase 4 Dataset Schema and Event-Log Extraction (2026-02-17)

Checklist targets: `P4-001`, `P4-002`

## Implementation

Implemented a typed dataset schema and deterministic event-log extraction path for learning traces:

- `src/autonomy/learning/dataset-schema.ts`
  - defines strict zod schemas for:
    - trace labels (`taskOutcome`, `verificationAlignment`, `policyCompliance`, `safetyRisk`, `rewardHackingSignal`)
    - per-example learning traces
    - top-level learning dataset envelope
  - exports `parseLearningTraceDataset(...)` for runtime validation
- `src/autonomy/learning/event-log-extractor.ts`
  - implements `extractLearningTraceDatasetFromEvents(...)`
  - groups events by `requestId`, maps pipeline outcomes to labels/reward, and validates output via schema parse
  - supports filtering failed examples (`includeFailed=false`) for training-only exports
- `scripts/autonomy/extract-learning-dataset.ts`
  - adds CLI extraction workflow:
    - input: event log file (`--events-file`) in JSON array, `{ events: [...] }`, or JSONL
    - normalizes event keys from `requestId/request_id` and `correlationId/correlation_id`
    - output: JSON dataset artifact + markdown extraction report
- `src/autonomy/learning/index.ts`
  - exports dataset schema and event-log extractor APIs for external integration
- `scripts/autonomy/fixtures/learning-dataset.sample.events.json`
  - adds reproducible fixture to validate extraction/report pipeline

## Validation

Executed:

```bash
./node_modules/.bin/vitest run \
  src/autonomy/learning/dataset-schema.test.ts \
  src/autonomy/learning/event-log-extractor.test.ts \
  src/autonomy/learning/dataset-splits.test.ts \
  src/autonomy/learning/quality-filters.test.ts \
  src/autonomy/learning/deidentification.test.ts \
  src/autonomy/learning/trace-collector.test.ts
```

Result:

- `6` test files passed
- `31` tests passed

Executed extraction report run:

```bash
npm run autonomy:learning:extract -- \
  --events-file scripts/autonomy/fixtures/learning-dataset.sample.events.json \
  --label p4-001-002-learning-dataset-20260217 \
  --dataset-id p4-learning-v1
```

Generated artifacts:

- `docs/ops/autonomy/reports/p4-001-002-learning-dataset-20260217.learning-dataset.json`
- `docs/ops/autonomy/reports/p4-001-002-learning-dataset-20260217.learning-dataset.md`
