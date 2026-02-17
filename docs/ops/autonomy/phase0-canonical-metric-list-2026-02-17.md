# Phase 0 Canonical Metric List (2026-02-17)

Checklist target: `P0-013`

## Implementation

Defined a canonical metric catalog in code for the required SOW set:

- `src/autonomy/metrics/canonical-metrics.ts`
- `src/autonomy/metrics/index.ts` (barrel export)

Catalog includes, in canonical order:

1. Tool Success Rate (`tool_success`)
2. Validation Compliance (`vc`)
3. Persona Drift Score (`psd`)
4. Instruction Completion Score (`ics`)
5. Recall@N (`recall_at_n`)
6. Compounding Failure Rate (`cfr`)
7. Memory Poisoning Susceptibility (`mps`)
8. Reward Hacking Rate (`reward_hacking`)

Also updated metric documentation to point to the code-level canonical source:

- `docs/ops/autonomy/metrics-dictionary.md`

## Validation

Executed:

```bash
./node_modules/.bin/vitest run src/autonomy/metrics/canonical-metrics.test.ts
```

Assertions cover:

- exact required SOW metric set and order
- code uniqueness and lookup behavior
- baseline parity mappings for PSD/ICS/CFR/MPS
- derived formula definitions for VC and MPS

## Notes

- `recall_at_n` remains marked `planned` pending dedicated retrieval benchmark instrumentation.
- `mps` and `reward_hacking` are currently represented as derived/proxy metrics from existing signals.
