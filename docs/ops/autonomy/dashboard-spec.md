# Autonomy Dashboard Spec

Initial panel spec for Phase 0 baseline operations dashboard.

## Dashboard A: Kernel Health

1. `Kernel Up`
- Query: `autonomy_kernel_up`
- Type: Stat
- Alert: `< 1 for 2m`

2. `Current State`
- Query: `autonomy_current_state`
- Type: Table or State timeline

3. `Consecutive Errors`
- Query: `autonomy_consecutive_errors`
- Type: Stat + time-series
- Alert: `> 2 for 5m`

4. `Safe Mode Events`
- Query: `sum by (action) (increase(autonomy_safe_mode_events_total[1h]))`
- Type: Bar chart

## Dashboard B: Pipeline Reliability

5. `Pipeline Throughput`
- Query: `sum(increase(autonomy_pipeline_executions_total[5m]))`
- Type: Time-series

6. `Pipeline Failure Rate`
- Query: `sum(increase(autonomy_pipeline_executions_total{outcome=\"failure\"}[5m])) / clamp_min(sum(increase(autonomy_pipeline_executions_total[5m])), 1)`
- Type: Time-series
- Alert: `> 0.01 for 10m`

7. `Pipeline Latency P95`
- Query: `autonomy_pipeline_latency_ms{quantile=\"0.95\"}`
- Type: Time-series
- Alert: `> 1500 for 10m`

8. `Invariant Failures`
- Query: `sum(increase(autonomy_invariant_checks_total{result=\"fail\"}[10m]))`
- Type: Time-series
- Alert: `> 0 for 10m`

## Dashboard C: Memory and Trust

9. `Memory Gate Decisions`
- Query: `sum by (decision) (increase(autonomy_memory_gate_decisions_total[15m]))`
- Type: Stacked bar

10. `Quarantine Size`
- Query: `autonomy_quarantine_size`
- Type: Time-series
- Alert: `> 100 for 30m`

11. `Trust Score P50/P90`
- Query: `autonomy_trust_score{quantile=\"0.5\"}` and `autonomy_trust_score{quantile=\"0.9\"}`
- Type: Time-series

12. `Drift Score P95`
- Query: `autonomy_drift_score{quantile=\"0.95\"}`
- Type: Time-series
- Alert: `> 0.15 for 15m`

## Dashboard D: Approval and Governance

13. `Approval Request Rate`
- Query: `sum(increase(autonomy_approval_requests_total[15m]))`
- Type: Time-series

14. `Approval Denial Rate`
- Query: `sum(increase(autonomy_approval_decisions_total{decision=\"denied\"}[15m])) / clamp_min(sum(increase(autonomy_approval_decisions_total[15m])), 1)`
- Type: Time-series

15. `Event Store Size`
- Query: `autonomy_event_store_size`
- Type: Time-series
- Alert: `> 50000 for 1h`

## Notes

- All panels assume Prometheus scrape from `GET /metrics`.
- Configure dashboard variables for environment, agent ID, and instance.
- Use this spec as the seed for Grafana dashboard JSON provisioning.

