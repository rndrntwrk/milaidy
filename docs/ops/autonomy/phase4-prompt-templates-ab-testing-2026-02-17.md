# Phase 4 Prompt Templates, Guardrails, and A/B Testing (2026-02-17)

Checklist targets: `P4-008`, `P4-009`, `P4-010`, `P4-011`

## Implementation

Implemented role-specific prompt templates and deterministic held-out A/B evaluation:

- `src/autonomy/learning/prompt-builder.ts`
  - adds explicit role templates for:
    - planner
    - executor
    - verifier
  - adds explicit prompt variants:
    - `baseline`
    - `truth-first` (stronger anti-sycophancy constraints)
    - `tool-safety-first` (stronger tool-use guardrails)
  - adds explicit sections for:
    - `Truthfulness`
    - `Anti-Sycophancy Constraints`
    - `Tool Usage`
    - `Tool Reasoning Guardrails`
  - exposes `buildRoleTemplate(...)` and `buildRoleTemplates(...)`
- `src/autonomy/learning/prompt-variant-evaluator.ts`
  - deterministic held-out scenario selector (`selectHeldOutScenarios(...)`)
  - prompt-coverage A/B scoring harness over held-out scenarios
  - winner selection from variant scorecards
- `scripts/autonomy/ab-test-prompt-variants.ts`
  - CLI workflow to run held-out prompt A/B evaluation and emit report artifacts
- `src/autonomy/learning/types.ts`
  - extends prompt options with `variant` selection
- `src/autonomy/learning/index.ts`
  - exports prompt role/variant and evaluator APIs

## Validation

Executed:

```bash
./node_modules/.bin/vitest run \
  src/autonomy/learning/prompt-builder.test.ts \
  src/autonomy/learning/prompt-variant-evaluator.test.ts \
  src/autonomy/learning/llm-judge-evaluator.test.ts
```

Result:

- `3` test files passed
- `31` tests passed

Executed held-out A/B run:

```bash
npm run autonomy:prompt:ab-test -- \
  --label p4-008-011-prompt-ab-20260217 \
  --holdout-ratio 0.35 \
  --seed p4-011
```

Observed winner:

- `tool-safety-first` variant (overall score `0.9350` on held-out set)

Generated artifacts:

- `docs/ops/autonomy/reports/p4-008-011-prompt-ab-20260217.prompt-ab.json`
- `docs/ops/autonomy/reports/p4-008-011-prompt-ab-20260217.prompt-ab.md`
