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

Runtime-inclusive inventory (includes discovered runtime/custom actions):

```bash
npm run autonomy:contracts:inventory -- --label contracts-runtime --out-dir docs/ops/autonomy/reports
```

## 1.1) Post-Condition Coverage

Built-in scope (default):

```bash
npm run autonomy:postconditions:coverage
```

Runtime/custom-action scope:

```bash
npm run autonomy:postconditions:coverage -- --include-runtime=true
```

Output:
- `docs/ops/autonomy/reports/*.postconditions.json`
- `docs/ops/autonomy/reports/*.postconditions.md`

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

## 5) Long-Horizon Comparison Run (Phase 3)

```bash
npm run autonomy:long-horizon:run -- --cycles 12 --compare baseline-sprint1-smoke
```

Output:
- `docs/ops/autonomy/reports/*.long-horizon.json`
- `docs/ops/autonomy/reports/*.long-horizon.md`
- `docs/ops/autonomy/reports/state/baseline-snapshots.json`

## 6) Phase 3 Reduction Demonstration

```bash
npm run autonomy:phase3:reductions -- --baseline baseline-sprint1-smoke --current phase3-long-horizon-2026-02-17
```

Output:
- `docs/ops/autonomy/reports/*.phase3-reduction.json`
- `docs/ops/autonomy/reports/*.phase3-reduction.md`

## Acceptance Attachments (Phase 0)

Attach to checklist evidence:
- Dashboard configuration/export
- Alert threshold policy
- Baseline suite report
- Red-team report
- Cardinality report
