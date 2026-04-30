# Phase 3 Threshold Tuning (2026-02-17)

Checklist target: `P3-039`

## Empirical Basis

Source run:

- `phase3-long-horizon-2026-02-17` (`480` turns, `168` scenarios)
- Artifact: `docs/ops/autonomy/reports/phase3-long-horizon-2026-02-17.long-horizon.json`

Observed baseline metrics:

- `personaDriftScore = 0.1952`
- `instructionCompletionRate = 0.6667`

## Tuned Threshold Changes

Applied threshold updates:

1. Runtime drift alert raised from `0.15` to `0.22` to reduce persistent false-positive noise relative to observed baseline.
2. Added role failure-rate alert at `> 2%` over `10m` per role.
3. Added baseline PSD alert: `avg(...) > 0.22` for `1h`.
4. Added baseline ICS alert: `avg(...) < 0.65` for `1h`.

Files updated:

- `deploy/prometheus/alerts.yml`
- `docs/ops/autonomy/alert-thresholds.md`
- `docs/ops/autonomy/dashboard-spec.md`
- `deploy/grafana/provisioning/dashboards/quality-safe-mode.json`

## Validation

Validated the tuned dashboard JSON and alert expressions are present.

Commands:

```bash
node -e "const fs=require('node:fs'); const p='deploy/grafana/provisioning/dashboards/quality-safe-mode.json'; const d=JSON.parse(fs.readFileSync(p,'utf8')); const t=d.panels.flatMap((x)=>x.targets||[]).map((x)=>x.expr||'').join('\\n'); if(!t.includes('milaidy_autonomy_baseline_personaDriftScore')) throw new Error('missing PSD'); if(!t.includes('milaidy_autonomy_baseline_instructionCompletionRate')) throw new Error('missing ICS'); console.log('dashboard-validated');"
rg -n "RoleFailureRateHigh|BaselinePersonaDriftHigh|BaselineInstructionCompletionLow|> 0.22|< 0.65" deploy/prometheus/alerts.yml
```
