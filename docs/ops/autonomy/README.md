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

