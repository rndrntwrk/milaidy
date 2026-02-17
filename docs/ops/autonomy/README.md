# Autonomy Ops Artifacts

This directory contains operational artifacts for Sprint 1 baseline implementation.

Contents:
- `metrics-dictionary.md`: metric definitions and intent.
- `dashboard-spec.md`: dashboard panel and query definitions.
- `alert-thresholds.md`: initial alert policy and thresholds.
- `baseline-runbook.md`: commands to generate baseline and red-team reports.
- `reports/`: generated run artifacts (`.json` and `.md` outputs).

Primary scripts:
- `npm run autonomy:baseline:run`
- `npm run autonomy:redteam:run`
- `npm run autonomy:metrics:cardinality`
- `npm run autonomy:contracts:inventory`
- `npm run autonomy:postconditions:coverage`
- `npm run autonomy:events:rebuild -- --events-file <path-to-events-json>`
- `npm run autonomy:events:verify -- --events-file <path-to-events-json>`

Workflow durability controls:
- `autonomy.workflow.defaultTimeoutMs`: default workflow execution timeout.
- `autonomy.workflowEngine.temporal.defaultTimeoutMs`: Temporal-specific timeout override.
- `autonomy.workflowEngine.temporal.deadLetterMax`: in-memory dead-letter retention limit.
- `autonomy.eventStore.retentionMs`: event-log retention window (`0` disables time eviction).
- `GET /api/agent/autonomy/workflows/dead-letters`: inspect dead-lettered workflow executions.
- `POST /api/agent/autonomy/workflows/dead-letters/clear`: clear dead-letter records.

Provisioned observability:
- Grafana dashboard: `deploy/grafana/provisioning/dashboards/operational-baseline.json`
- Prometheus rules: `deploy/prometheus/alerts.yml`
