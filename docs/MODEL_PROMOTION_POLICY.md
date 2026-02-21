# Model Promotion Policy for Alice

## Purpose

Define how a model moves from training artifact to active runtime model, with rollback safety and measurable gates.

## Promotion Stages

1. `candidate`
- training completed.
- artifact registered with dataset/manifests.

2. `evaluated`
- full eval suite executed.
- required metrics and safety gates pass.

3. `canary`
- activated for limited traffic/surface.
- regression monitor active.

4. `active`
- promoted to default runtime model.

5. `rolled_back`
- previous stable model restored due to regression.

## Entry Criteria

Candidate model must have:

1. dataset manifest and reproducible training config.
2. benchmark output attached.
3. eval report with pass/fail summary.

## Required Evaluation Gates

1. knowledge retrieval correctness at or above baseline.
2. tool-use success rate at or above baseline.
3. no increase in policy/safety violations.
4. latency and cost within configured SLO/SLI envelope.
5. duplicate/partial response regression not observed.

## Activation Rules

1. activation must be explicit; never implicit on train completion.
2. canary is required before full activation.
3. activation record must include:
- model id,
- source dataset id,
- operator,
- timestamp,
- rollback target model.

## Rollback Rules

Rollback is mandatory when:

1. critical reliability regressions are detected.
2. safety/policy violations rise above threshold.
3. message delivery/tool execution fails beyond error budget.

Rollback must:

1. restore prior stable model id,
2. preserve audit logs,
3. mark failed model as non-promotable until re-evaluated.

## Auditability

Every promotion decision must emit:

1. model card pointer,
2. eval report pointer,
3. gate status snapshot,
4. operator decision rationale.

