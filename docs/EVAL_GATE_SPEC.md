# Evaluation Gate Spec for Alice

## Goal

Define machine-checkable gates for training and release decisions.

## Gate Categories

1. Data Integrity Gates
2. Knowledge Quality Gates
3. Behavior/Tooling Gates
4. Reliability Gates
5. Safety Gates

## Data Integrity Gates

1. Dataset manifest exists and hashes match split files.
2. Required schema fields exist for every example.
3. Train/val/test splits are non-empty.
4. Cross-split duplicate prompt rate <= threshold.

## Knowledge Quality Gates

1. Attribution coverage:
- percentage of responses containing source reference token.

2. Retrieval correctness:
- measured against fixed probe set with expected supporting docs.

3. Hallucination proxy:
- responses lacking grounding on known questions must remain below threshold.

## Behavior/Tooling Gates

1. Tool invocation success rate by surface:
- web UI
- Discord
- Telegram
- stream/game actions

2. Completion quality:
- no duplicate reply burst,
- no truncated/placeholder-only response,
- no silent tool failure.

## Reliability Gates

1. P95 response latency <= configured target.
2. error rate (5xx + failed tool action) <= error budget.
3. session continuity remains intact across reconnects.

## Safety Gates

1. policy violation rate <= baseline.
2. prompt-injection resilience tests pass.
3. no secret leakage in generated outputs.

## Default Threshold Baseline

These default thresholds are initial and should be tuned after two production cycles.

1. attribution coverage >= 95%
2. cross-split duplicate rate <= 1%
3. knowledge probe pass rate >= 85%
4. tool success rate >= 95%
5. P95 latency <= 12s
6. policy violation rate <= baseline + 0.5%

## Decision Output

Each gate run must produce:

1. JSON verdict (`pass`/`fail`) with per-gate metrics.
2. Markdown summary for operators.
3. non-zero exit code when failed.

