# Phase 3 Quality and Safe-Mode Dashboard Provisioning (2026-02-17)

Checklist target: `P3-037`

## Implementation

Provisioned Grafana dashboard for PSD/ICS/safe-mode frequency:

- `deploy/grafana/provisioning/dashboards/quality-safe-mode.json`

Panels included:

1. `Persona Drift Score (PSD)` via `milaidy_autonomy_baseline_personaDriftScore`.
2. `Instruction Completion Rate (ICS)` via `milaidy_autonomy_baseline_instructionCompletionRate`.
3. `Safe Mode Entries (1h)` via `sum(increase(milaidy_autonomy_safe_mode_events_total{action="enter"}[1h]))`.

## Validation

Validated dashboard JSON parses and includes PSD, ICS, and safe-mode expressions.

Command:

```bash
node -e "const fs=require('node:fs'); const p='deploy/grafana/provisioning/dashboards/quality-safe-mode.json'; const d=JSON.parse(fs.readFileSync(p,'utf8')); const exprs=(d.panels||[]).flatMap((panel)=>panel.targets||[]).map((target)=>target.expr||''); const required=['milaidy_autonomy_baseline_personaDriftScore','milaidy_autonomy_baseline_instructionCompletionRate','milaidy_autonomy_safe_mode_events_total']; for (const token of required) { if (!exprs.some((expr)=>expr.includes(token))) { throw new Error('missing '+token); } } console.log('dashboard-validated');"
```

Result: `dashboard-validated`
