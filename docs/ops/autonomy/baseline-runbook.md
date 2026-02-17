# Baseline Measurement Runbook

This runbook executes Sprint 1 baseline tasks and writes artifacts into `docs/ops/autonomy/reports`.

## Prerequisites

- Start the server if you want live `/metrics` cardinality checks.
- Ensure repository dependencies are installed.

## 1) Tool Contract Inventory

```bash
npm run autonomy:contracts:inventory
```

Output:
- `docs/ops/autonomy/reports/*.tool-contracts.json`
- `docs/ops/autonomy/reports/*.tool-contracts.md`

## 2) Baseline Suite Report

```bash
npm run autonomy:baseline:run
```

Optional compare run:

```bash
npm run autonomy:baseline:run -- --compare baseline-2026-02-17T00-00-00-000Z
```

Output:
- `docs/ops/autonomy/reports/*.baseline.json`
- `docs/ops/autonomy/reports/*.baseline.md`
- `docs/ops/autonomy/reports/state/baseline-snapshots.json`

## 3) Red-Team Baseline Report (Memory Poisoning)

```bash
npm run autonomy:redteam:run
```

Output:
- `docs/ops/autonomy/reports/*.redteam.json`
- `docs/ops/autonomy/reports/*.redteam.md`

## 4) Metrics Cardinality Check

Run against live endpoint:

```bash
npm run autonomy:metrics:cardinality
```

Run against saved metrics text:

```bash
npm run autonomy:metrics:cardinality -- --file /tmp/metrics.txt --out docs/ops/autonomy/reports/cardinality.json
```

Non-zero exit means cardinality threshold violations were detected.

## Acceptance Attachments (Phase 0)

Attach to checklist evidence:
- Dashboard configuration/export
- Alert threshold policy
- Baseline suite report
- Red-team report
- Cardinality report
