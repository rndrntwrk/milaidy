# Retrieval Quality Validation Report

- Label: `p1-036-retrieval-quality-20260217`
- Created at: `2026-02-17T22:40:18.129Z`
- Top N: `2`
- Tasks: `2`
- Trust-aware average Recall@N: `1.0000`
- Baseline average Recall@N: `0.0000`
- Delta vs baseline: `+1.0000`

| Task | Trust-Aware Recall@N | Baseline Recall@N | Delta |
|---|---:|---:|---:|
| rq-001-trust-filtering | 1.0000 | 0.0000 | +1.0000 |
| rq-002-preference-grounding | 1.0000 | 0.0000 | +1.0000 |

## Task Details

### rq-001-trust-filtering

- Description: Relevant high-trust memories should outrank low-trust near-duplicate distractors.
- Relevant IDs: `rq1-rel-1, rq1-rel-2`
- Trust-aware top IDs: `rq1-rel-1, rq1-rel-2`
- Baseline top IDs: `rq1-irr-1, rq1-irr-2`

### rq-002-preference-grounding

- Description: Preference memories with proven trust should remain in top-N over noisy but highly similar text.
- Relevant IDs: `rq2-rel-1, rq2-rel-2`
- Trust-aware top IDs: `rq2-rel-2, rq2-rel-1`
- Baseline top IDs: `rq2-irr-1, rq2-irr-2`

