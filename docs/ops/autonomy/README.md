# Autonomy Ops Artifacts

This directory contains operational artifacts for Sprint 1 baseline implementation.

Contents:
- `metrics-dictionary.md`: metric definitions and intent.
- `dashboard-spec.md`: dashboard panel and query definitions.
- `alert-thresholds.md`: initial alert policy and thresholds.
- `invariant-catalog.md`: invariant ownership and severity catalog.
- `baseline-runbook.md`: commands to generate baseline and red-team reports.
- `pipeline-latency-optimization-2026-02-17.md`: `P2-062` before/after bottleneck optimization report.
- `phase2-acceptance-gate-2026-02-17.md`: `P2-063/P2-064` test evidence for reversible success and irreversible authorization controls.
- `phase2-acceptance-report-2026-02-17.md`: `P2-065` Phase 2 acceptance publication and sign-off record.
- `phase3-executor-role-2026-02-17.md`: `P3-024` Executor role implementation and wiring evidence.
- `phase3-role-dataflow-2026-02-17.md`: `P3-030` role dataflow integration evidence across planner/executor/verifier/memory/auditor.
- `phase3-role-service-modules-2026-02-17.md`: `P3-006` role-specific module lifecycle implementation and validation evidence.
- `phase3-role-authz-guards-2026-02-17.md`: `P3-034` validation that orchestrated roles cannot bypass contract/approval guards.
- `phase3-role-boundary-contracts-2026-02-17.md`: `P3-001/P3-002` role responsibility boundary definitions and request/response schema enforcement.
- `phase3-role-transport-adapters-2026-02-17.md`: `P3-007` explicit in-process role transport adapter implementation and wiring evidence.
- `phase3-role-call-authz-validation-2026-02-17.md`: `P3-008` role-call auth + boundary validation enforcement on every orchestrator role call.
- `phase3-role-call-resilience-2026-02-17.md`: `P3-009` role-call retries/timeouts/circuit-breaker policy and validation.
- `phase3-role-health-readiness-2026-02-17.md`: `P3-010` per-role health/readiness endpoint implementation and validation.
- `phase3-state-transition-persistence-2026-02-17.md`: `P3-012` persistence evidence for invariant decisions and safe-mode transitions.
- `phase3-state-recovery-replay-2026-02-17.md`: `P3-011/P3-015` persistent state restoration and replay validation evidence.
- `phase3-lifecycle-validation-2026-02-17.md`: `P3-031/P3-032/P3-033` lifecycle and safe-mode integration validation.
- `phase3-concurrency-consistency-2026-02-17.md`: `P3-035` concurrency consistency validation for orchestrated lifecycle execution.
- `phase3-role-telemetry-2026-02-17.md`: `P3-028` role-level telemetry implementation and validation.
- `phase3-role-dashboard-2026-02-17.md`: `P3-036` role throughput/error/latency dashboard provisioning evidence.
- `phase3-quality-safe-mode-dashboard-2026-02-17.md`: `P3-037` PSD/ICS/safe-mode dashboard provisioning evidence.
- `phase3-long-horizon-2026-02-17.md`: `P3-038` long-horizon scenario comparison run and baseline delta evidence.
- `phase3-threshold-tuning-2026-02-17.md`: `P3-039` empirical threshold tuning and alert-rule updates.
- `phase3-reduction-demonstration-2026-02-17.md`: `P3-040` PSD/identity-violation reduction demonstration artifact.
- `phase3-safe-mode-incident-demo-2026-02-17.md`: `P3-041` induced-incident safe-mode demonstration evidence.
- `phase3-safe-mode-tool-restrictions-2026-02-17.md`: `P3-017` safe-mode tool-class restriction policy + enforcement evidence.
- `phase3-acceptance-report-2026-02-17.md`: `P3-042` Phase 3 gate report and sign-off decision.
- `reports/`: generated run artifacts (`.json` and `.md` outputs).

Primary scripts:
- `npm run autonomy:baseline:run`
- `npm run autonomy:long-horizon:run`
- `npm run autonomy:phase3:reductions`
- `npm run autonomy:redteam:run`
- `npm run autonomy:metrics:cardinality`
- `npm run autonomy:contracts:inventory`
- `npm run autonomy:postconditions:coverage`
- `npm run autonomy:compensation:coverage`
- `npm run autonomy:pipeline:latency`
- `npm run autonomy:events:rebuild -- --events-file <path-to-events-json>`
- `npm run autonomy:events:verify -- --events-file <path-to-events-json>`

Workflow durability controls:
- `autonomy.workflow.defaultTimeoutMs`: default workflow execution timeout.
- `autonomy.workflowEngine.temporal.defaultTimeoutMs`: Temporal-specific timeout override.
- `autonomy.workflowEngine.temporal.deadLetterMax`: in-memory dead-letter retention limit.
- `autonomy.eventStore.retentionMs`: event-log retention window (`0` disables time eviction).
- `GET /api/agent/autonomy/workflows/dead-letters`: inspect dead-lettered workflow executions.
- `POST /api/agent/autonomy/workflows/dead-letters/clear`: clear dead-letter records.
- `GET /api/agent/autonomy/audit/summary`: compliance summary for retained audit records.
- `GET /api/agent/autonomy/audit/export`: export retained audit records in JSONL.
- `POST /api/agent/autonomy/audit/export-expired`: export expired records and optionally evict.
- `GET /api/agent/autonomy/roles/health`: per-role health status snapshot.
- `GET /api/agent/autonomy/roles/readiness`: readiness gate for role boundary availability.
- `autonomy.roles.orchestrator.timeoutMs`: per-role-call timeout used by orchestrator boundary resilience.
- `autonomy.roles.orchestrator.maxRetries`: retry budget after initial role call attempt.
- `autonomy.roles.orchestrator.backoffMs`: linear retry backoff base.
- `autonomy.roles.orchestrator.circuitBreakerThreshold`: failures before a role circuit opens.
- `autonomy.roles.orchestrator.circuitBreakerResetMs`: cooldown before role circuit resets.
- `autonomy.roles.orchestrator.minSourceTrust`: minimum caller trust required for all orchestrator role calls.
- `autonomy.roles.orchestrator.allowedSources`: caller source allowlist for orchestrator role calls.

Provisioned observability:
- Grafana dashboard: `deploy/grafana/provisioning/dashboards/operational-baseline.json`
- Grafana dashboard: `deploy/grafana/provisioning/dashboards/role-telemetry.json`
- Grafana dashboard: `deploy/grafana/provisioning/dashboards/quality-safe-mode.json`
- Prometheus rules: `deploy/prometheus/alerts.yml`
- Event bus: `autonomy:decision:logged` emits normalized validation/approval/verification/invariant outcomes per pipeline execution.
- Event bus: `autonomy:tool:postcondition:checked` includes `failureTaxonomy` (`check_failed`, `check_error`, `timeout`) for verification analytics.
- Event bus: `autonomy:safe-mode:entered`, `autonomy:safe-mode:exited`, and `autonomy:safe-mode:exit-denied` emit safe-mode lifecycle notifications.
- Event bus: `autonomy:safe-mode:tool-blocked` emits denied execution attempts for blocked tool classes during safe mode.
- Event bus: `autonomy:state:transition` emits every kernel FSM transition with trigger metadata.
- Event store: `kernel-state-transitions` and `kernel-safe-mode-transitions` persist kernel and safe-mode transition history.
- Metric: `autonomy_invariant_checks_total{result=pass|fail|error}` increments on every invariant check run.
- Metric: `autonomy_role_executions_total{role,outcome}` tracks role-level success/failure outcomes.
- Metric: `autonomy_role_latency_ms{role}` tracks planner/executor/verifier/memory_writer/auditor/orchestrator latencies.
