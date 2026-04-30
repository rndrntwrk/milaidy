# Drift and Quarantine Troubleshooting Runbook

Checklist target: `P1-041`

## Scope

Use this runbook when:

- persona drift alerts fire repeatedly
- quarantine backlog grows and does not drain
- memory-gate reject/quarantine rates spike unexpectedly

## Primary Signals

- `milaidy_autonomy_drift_score`
- `milaidy_autonomy_drift_alerts_total{severity}`
- `milaidy_autonomy_memory_gate_decisions_total{decision}`
- `milaidy_autonomy_quarantine_size`
- `milaidy_autonomy_approval_queue_size`

Dashboards:

- `deploy/grafana/provisioning/dashboards/operational-baseline.json`
- `deploy/grafana/provisioning/dashboards/quality-safe-mode.json`

Alerts:

- `HighDriftScore`
- `QuarantineBacklog`
- `BaselinePersonaDriftHigh`

## Triage Procedure

1. Confirm current health:
   - `GET /api/agent/autonomy/roles/health`
   - `GET /api/agent/autonomy/roles/readiness`
2. Inspect drift baseline and current thresholds:
   - `docs/ops/autonomy/alert-thresholds.md`
   - `docs/ops/autonomy/phase3-threshold-tuning-2026-02-17.md`
3. Inspect quarantine inventory and pending review depth:
   - `GET /api/workbench/quarantine`
4. Inspect latest identity update activity:
   - `GET /api/agent/identity`
   - `GET /api/agent/identity/history`

## Mitigations

Drift spike:

1. Verify no recent unsafe identity update:
   - check `autonomy:identity:updated` event stream
2. Compare current PSD against baseline reports:
   - `docs/ops/autonomy/reports/*.baseline.md`
   - `docs/ops/autonomy/reports/*.long-horizon.md`
3. If drift persists, enter safe mode and restrict risky execution paths.

Quarantine backlog:

1. Review top quarantined records:
   - `GET /api/workbench/quarantine`
2. Drain with explicit decisions:
   - `POST /api/workbench/quarantine/:id/review` with `{"decision":"approve"}` or `{"decision":"reject"}`
3. Verify queue reduction:
   - `milaidy_autonomy_quarantine_size`
   - `pendingReview` from API response

## Verification After Mitigation

1. Confirm drift alert rate drops below threshold window.
2. Confirm quarantine size trends back to steady-state.
3. Re-run baseline checks:
   - `npm run autonomy:baseline:run -- --label post-mitigation-check`
4. Re-run red-team memory poisoning check if quarantine tuning changed:
   - `npm run autonomy:redteam:run -- --label post-mitigation-redteam`

## Escalation

- If `P1` drift/quarantine alerts persist for `> 30m`, escalate to incident handling.
- If identity integrity failures occur, treat as fail-closed incident and block high-risk operations.
