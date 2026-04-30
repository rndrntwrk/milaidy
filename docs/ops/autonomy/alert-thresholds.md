# Autonomy Alert Thresholds (Tuned)

These thresholds were tuned using the Phase 3 long-horizon run
(`phase3-long-horizon-2026-02-17`, 480 turns).

## Severity Model

- `P1`: Immediate operator response.
- `P2`: Response during business-hours or on-call window.
- `P3`: Investigate in routine review.

## Proposed Alerts

1. `kernel_down` (`P1`)
- Condition: `milaidy_autonomy_kernel_up < 1` for `2m`.
- Action: page on-call.

2. `safe_mode_entered` (`P1`)
- Condition: `increase(milaidy_autonomy_safe_mode_events_total{action="enter"}[5m]) > 0`.
- Action: page on-call and freeze high-risk automation.

3. `pipeline_failure_rate_high` (`P1`)
- Condition: failure rate `> 1%` for `10m`.
- Query:
`sum(increase(milaidy_autonomy_pipeline_executions_total{outcome="failure"}[10m])) / clamp_min(sum(increase(milaidy_autonomy_pipeline_executions_total[10m])), 1) > 0.01`

4. `invariant_failures_present` (`P1`)
- Condition: `increase(milaidy_autonomy_invariant_checks_total{result="fail"}[10m]) > 0`.
- Action: stop risky workflows and inspect latest execution traces.

5. `drift_score_high` (`P2`)
- Condition: `milaidy_autonomy_drift_score{quantile="0.95"} > 0.22` for `15m`.
- Action: inspect drift report and consider safe-mode.

6. `quarantine_backlog` (`P2`)
- Condition: `milaidy_autonomy_quarantine_size > 100` for `30m`.
- Action: trigger review queue processing.

7. `approval_denial_spike` (`P3`)
- Condition: denial rate `> 20%` over `30m`.
- Action: inspect policy drift and false positives.

8. `event_store_growth_unbounded` (`P3`)
- Condition: `milaidy_autonomy_event_store_size > 50000` for `1h`.
- Action: verify retention and archiving jobs.

9. `role_failure_rate_high` (`P2`)
- Condition: any role failure rate `> 2%` over `10m`.
- Query:
`sum by (role) (increase(milaidy_autonomy_role_executions_total{outcome="failure"}[10m])) / clamp_min(sum by (role) (increase(milaidy_autonomy_role_executions_total[10m])), 1) > 0.02`
- Action: inspect failing role path and recent orchestration traces.

10. `baseline_psd_high` (`P2`)
- Condition: `avg(milaidy_autonomy_baseline_personaDriftScore) > 0.22` for `1h`.
- Action: compare latest long-horizon reports and inspect drift-correction prompts.

11. `baseline_ics_low` (`P2`)
- Condition: `avg(milaidy_autonomy_baseline_instructionCompletionRate) < 0.65` for `1h`.
- Action: inspect completion failures and planner/executor regression traces.

## Escalation Rules

- Two `P1` events in `30m`: open incident and assign incident commander.
- Repeated `P2` for `> 24h`: promote to `P1`.
- Any alert tied to unauthorized irreversible action: immediate incident.

## Review Cadence

- Weekly threshold review until baseline stabilizes.
- Monthly review after stabilization.
