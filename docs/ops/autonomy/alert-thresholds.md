# Autonomy Alert Thresholds (Initial)

These thresholds are baseline defaults for Phase 0/Phase 1 operations.
Tune after first full baseline window.

## Severity Model

- `P1`: Immediate operator response.
- `P2`: Response during business-hours or on-call window.
- `P3`: Investigate in routine review.

## Proposed Alerts

1. `kernel_down` (`P1`)
- Condition: `autonomy_kernel_up < 1` for `2m`.
- Action: page on-call.

2. `safe_mode_entered` (`P1`)
- Condition: `increase(autonomy_safe_mode_events_total{action="enter"}[5m]) > 0`.
- Action: page on-call and freeze high-risk automation.

3. `pipeline_failure_rate_high` (`P1`)
- Condition: failure rate `> 1%` for `10m`.
- Query:
`sum(increase(autonomy_pipeline_executions_total{outcome="failure"}[10m])) / clamp_min(sum(increase(autonomy_pipeline_executions_total[10m])), 1) > 0.01`

4. `invariant_failures_present` (`P1`)
- Condition: `increase(autonomy_invariant_checks_total{result="fail"}[10m]) > 0`.
- Action: stop risky workflows and inspect latest execution traces.

5. `drift_score_high` (`P2`)
- Condition: `autonomy_drift_score{quantile="0.95"} > 0.15` for `15m`.
- Action: inspect drift report and consider safe-mode.

6. `quarantine_backlog` (`P2`)
- Condition: `autonomy_quarantine_size > 100` for `30m`.
- Action: trigger review queue processing.

7. `approval_denial_spike` (`P3`)
- Condition: denial rate `> 20%` over `30m`.
- Action: inspect policy drift and false positives.

8. `event_store_growth_unbounded` (`P3`)
- Condition: `autonomy_event_store_size > 50000` for `1h`.
- Action: verify retention and archiving jobs.

## Escalation Rules

- Two `P1` events in `30m`: open incident and assign incident commander.
- Repeated `P2` for `> 24h`: promote to `P1`.
- Any alert tied to unauthorized irreversible action: immediate incident.

## Review Cadence

- Weekly threshold review until baseline stabilizes.
- Monthly review after stabilization.

