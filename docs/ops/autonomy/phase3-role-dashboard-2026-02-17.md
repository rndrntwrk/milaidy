# Phase 3 Role Dashboard Provisioning (2026-02-17)

Checklist target: `P3-036`

## Implementation

Provisioned a dedicated Grafana dashboard for role-level telemetry:

- `deploy/grafana/provisioning/dashboards/role-telemetry.json`

Panels included:

1. Role throughput over 5m.
2. Role failure rate over 10m.
3. Role latency p95 by role.

Metric inputs:

- `milaidy_autonomy_role_executions_total{role,outcome}`
- `milaidy_autonomy_role_latency_ms{role,quantile}`

## Validation

Validated dashboard JSON parses and contains the expected role metric expressions.

Command:

```bash
node -e "const fs=require('node:fs'); const p='deploy/grafana/provisioning/dashboards/role-telemetry.json'; const raw=fs.readFileSync(p,'utf8'); const d=JSON.parse(raw); const exprs=(d.panels||[]).flatMap((panel)=>panel.targets||[]).map((target)=>target.expr||''); const required=['milaidy_autonomy_role_executions_total','milaidy_autonomy_role_latency_ms']; for (const token of required) { if (!exprs.some((expr)=>expr.includes(token))) { throw new Error('missing '+token); } } console.log('dashboard-validated');"
```

Result: `dashboard-validated`
