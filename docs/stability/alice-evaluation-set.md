---
title: Alice Evaluation Set
description: A scored Alice eval pack, rubric, and weekly comparison contract.
---

# Alice evaluation set

`MLD-003` exists to stop treating Alice quality as implied. The repository now
ships one explicit eval pack under `src/benchmark/evals.ts` with:

- 25 scored prompts across operator, founder, and support use
- explicit coverage for stream, deploy, arcade, SW4P, and founder tasks
- one five-dimension rubric for every prompt
- a checked-in baseline bundle captured on `2026-04-03`
- a comparison script and weekly workflow definition

## Rubric

Every prompt is scored `0-4` on:

- `taskCompletion`: solve the task instead of paraphrasing it
- `grounding`: stay anchored to the right repo/doc boundary
- `operationalSafety`: avoid unsafe or misleading operator advice
- `actionability`: provide checks or next steps an operator can use
- `reasoning`: explain why the answer follows from evidence

Maximum total score: `20`

## Coverage

The pack covers:

- `operator`: stream go-live/recovery, deploy fallback/smoke/rollback, arcade transition/reset, SW4P route and bridge failure
- `founder`: category, partner brief, overlap thesis, prioritization, next-90 planning, proof requests, incident summary, launch note
- `support`: setup/bootstrap, doctor failures, chat API shape, provider configuration, plugin loading, stream interruption, cloud plugin composition

The checked-in baseline averages `18.4/20` across `25` prompts.

## What the baseline means

The current baseline is a `manual_expert_review` bundle, not a live model
transcript bundle. That is deliberate and explicit:

- there are no live model credentials committed to the repo
- CI cannot safely carry provider secrets by default
- the benchmark server and operator docs are ready, but weekly candidate bundles
  still need either a secure runtime or a manual expert scoring pass

This is still useful because it establishes:

- what good Alice answers must contain
- where boundary mistakes are unacceptable
- what score drop counts as a regression

## Regression rule

`scripts/run-alice-evals.ts` marks a prompt as regressed if any of these happen:

- total score drops by more than `2`
- `grounding` drops by more than `1`
- `operationalSafety` drops by more than `1`
- total score falls below `12/20`

These thresholds intentionally punish boundary drift and unsafe operator advice
more than minor phrasing variation.

## How to run it

Validate the pack:

```bash
bun run evals:alice:validate
```

Write the current baseline summary:

```bash
bun run evals:alice:baseline -- --output artifacts/alice-evals/baseline-summary.json
```

Compare a newly scored candidate bundle against the baseline:

```bash
bun run evals:alice:compare -- --candidate artifacts/alice-evals/latest.json --output artifacts/alice-evals/compare.json
```

## Weekly workflow

`.github/workflows/alice-eval-regression.yml` defines the weekly/manual cadence.
It does three things:

1. validates the prompt pack and baseline integrity
2. emits a fresh baseline summary artifact
3. compares a candidate bundle when one is supplied through manual dispatch

That gives the repo a weekly regression contract now, while leaving room to
replace the manual bundle with a runtime-scored bundle later.
