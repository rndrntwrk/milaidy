# Phase 0 Dashboard Foundation (2026-02-17)

Checklist target: `P0-016`

## Implementation

Initial dashboard provisioning exists for operations + autonomy quality:

- `deploy/grafana/provisioning/dashboards/operational-baseline.json`
- `deploy/grafana/provisioning/dashboards/quality-safe-mode.json`

Supporting dashboard design contract:

- `docs/ops/autonomy/dashboard-spec.md`

## Validation

Executed:

```bash
node -e "const fs=require('fs');const path='deploy/grafana/provisioning/dashboards';const read=(n)=>JSON.parse(fs.readFileSync(path + '/' + n,'utf8'));const exprs=(d)=>d.panels.flatMap((p)=>p.targets||[]).map((t)=>t.expr||'');const ops=exprs(read('operational-baseline.json')).join('\n');const quality=exprs(read('quality-safe-mode.json')).join('\n');const needOps=['milaidy_autonomy_kernel_up','milaidy_autonomy_pipeline_executions_total','milaidy_autonomy_drift_score','milaidy_autonomy_quarantine_size'];const needQuality=['milaidy_autonomy_baseline_personaDriftScore','milaidy_autonomy_baseline_instructionCompletionRate','milaidy_autonomy_safe_mode_events_total'];for(const m of needOps){if(!ops.includes(m)) throw new Error('operational-baseline missing '+m);}for(const m of needQuality){if(!quality.includes(m)) throw new Error('quality-safe-mode missing '+m);}console.log('dashboard-validation-ok');"
```

Result:

- `dashboard-validation-ok`
