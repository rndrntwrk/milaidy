# Phase 0 Cardinality and Retention-Cost Validation (2026-02-17)

Checklist target: `P0-018`

## Implementation

Cardinality analysis script:

- `scripts/autonomy/check-metrics-cardinality.ts`

Retention-cost estimation script:

- `scripts/autonomy/estimate-retention-cost.ts`

Sample metrics fixture for reproducible local validation:

- `scripts/autonomy/fixtures/cardinality.sample.metrics.prom`

## Validation

Executed cardinality check:

```bash
npm run autonomy:metrics:cardinality -- --file scripts/autonomy/fixtures/cardinality.sample.metrics.prom --out /tmp/p0-018-cardinality-fixture.json
```

Observed:

- `metricsAnalyzed: 3`
- `totalSeries: 5`
- `violations: 0`

Executed retention-cost estimate (30-day retention, 15s scrape interval):

```bash
npm run autonomy:metrics:retention-cost -- --cardinality-file docs/ops/autonomy/reports/cardinality.sample.json --retention-days 30 --scrape-interval-seconds 15
```

Observed totals:

- `metricsAnalyzed: 3`
- `totalSeries: 5`
- `projectedSamples: 864000`
- `projectedBytes: 1733120`
- `projectedMiB: 1.6528`

## Notes

- Retention estimate is assumption-based and exposes all assumptions in output (`bytesPerSample`, `bytesPerSeries`, scrape interval, retention window).
- The script can be re-run with production cardinality reports to project real storage footprint.
