# Phase 0 Metrics Dictionary Definition (2026-02-17)

Checklist target: `P0-019`

## Implementation

Metric definitions and formulas are documented in:

- `docs/ops/autonomy/metrics-dictionary.md`

The dictionary now anchors to the canonical code-level catalog and includes
definitions for:

- tool success
- VC
- PSD
- ICS
- Recall@N
- CFR
- MPS
- reward hacking

Canonical source of truth:

- `src/autonomy/metrics/canonical-metrics.ts`

## Validation

Executed:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('docs/ops/autonomy/metrics-dictionary.md','utf8');const required=['tool_success','vc','psd','ics','recall_at_n','cfr','mps','reward_hacking'];for(const r of required){if(!t.includes(r)) throw new Error('missing '+r);}console.log('metrics-dictionary-validation-ok');"
```

Result:

- `metrics-dictionary-validation-ok`
