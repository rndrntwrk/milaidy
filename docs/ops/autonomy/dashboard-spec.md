# Autonomy Dashboard Spec

Initial panel spec for Phase 0 baseline operations dashboard.

## Dashboard A: Kernel Health

1. `Kernel Up`
- Query: `milaidy_autonomy_kernel_up`
- Type: Stat
- Alert: `< 1 for 2m`

2. `Current State`
- Query: `milaidy_autonomy_current_state`
- Type: Table or State timeline

3. `Consecutive Errors`
- Query: `milaidy_autonomy_consecutive_errors`
- Type: Stat + time-series
- Alert: `> 2 for 5m`

4. `Safe Mode Events`
- Query: `sum by (action) (increase(milaidy_autonomy_safe_mode_events_total[1h]))`
- Type: Bar chart

## Dashboard B: Pipeline Reliability

5. `Pipeline Throughput`
- Query: `sum(increase(milaidy_autonomy_pipeline_executions_total[5m]))`
- Type: Time-series

6. `Pipeline Failure Rate`
- Query: `sum(increase(milaidy_autonomy_pipeline_executions_total{outcome=\"failure\"}[5m])) / clamp_min(sum(increase(milaidy_autonomy_pipeline_executions_total[5m])), 1)`
- Type: Time-series
- Alert: `> 0.01 for 10m`

7. `Pipeline Latency P95`
- Query: `milaidy_autonomy_pipeline_latency_ms{quantile=\"0.95\"}`
- Type: Time-series
- Alert: `> 1500 for 10m`

8. `Invariant Failures`
- Query: `sum(increase(milaidy_autonomy_invariant_checks_total{result=\"fail\"}[10m]))`
- Type: Time-series
- Alert: `> 0 for 10m`

## Dashboard C: Memory and Trust

9. `Memory Gate Decisions`
- Query: `sum by (decision) (increase(milaidy_autonomy_memory_gate_decisions_total[15m]))`
- Type: Stacked bar

10. `Quarantine Size`
- Query: `milaidy_autonomy_quarantine_size`
- Type: Time-series
- Alert: `> 100 for 30m`

11. `Trust Score P50/P90`
- Query: `milaidy_autonomy_trust_score{quantile=\"0.5\"}` and `milaidy_autonomy_trust_score{quantile=\"0.9\"}`
- Type: Time-series

12. `Drift Score P95`
- Query: `milaidy_autonomy_drift_score{quantile=\"0.95\"}`
- Type: Time-series
- Alert: `> 0.15 for 15m`

## Dashboard D: Approval and Governance

13. `Approval Request Rate`
- Query: `sum(increase(milaidy_autonomy_approval_requests_total[15m]))`
- Type: Time-series

14. `Approval Denial Rate`
- Query: `sum(increase(milaidy_autonomy_approval_decisions_total{decision=\"denied\"}[15m])) / clamp_min(sum(increase(milaidy_autonomy_approval_decisions_total[15m])), 1)`
- Type: Time-series

15. `Event Store Size`
- Query: `milaidy_autonomy_event_store_size`
- Type: Time-series
- Alert: `> 50000 for 1h`

## Dashboard E: Role Telemetry

16. `Role Throughput`
- Query: `sum by (role) (increase(milaidy_autonomy_role_executions_total[5m]))`
- Type: Time-series

17. `Role Failure Rate`
- Query: `sum by (role) (increase(milaidy_autonomy_role_executions_total{outcome=\"failure\"}[10m])) / clamp_min(sum by (role) (increase(milaidy_autonomy_role_executions_total[10m])), 1)`
- Type: Time-series
- Alert: `> 0.02 for 10m`

18. `Role Latency P95`
- Query: `milaidy_autonomy_role_latency_ms{quantile=\"0.95\"}`
- Type: Time-series

## Notes

- All panels assume Prometheus scrape from `GET /metrics`.
- Configure dashboard variables for environment, agent ID, and instance.
- Use this spec as the seed for Grafana dashboard JSON provisioning.
