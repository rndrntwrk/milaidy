# Pipeline Latency Optimization Report (2026-02-17)

## Scope

Checklist item: `P2-062`  
Goal: reduce pipeline overhead in the invariant path and record before/after latency evidence.

## Optimization Implemented

`src/autonomy/workflow/execution-pipeline.ts`
- removed per-request event-store read during invariant context construction in the main execute path.
- added request-local event counting (`requestEventCount`) based on appended execution events.
- passed `eventCountHint` into `runInvariants(...)` to avoid `eventStore.getByRequestId(requestId)` on each execution.
- preserved fallback behavior in `runInvariants(...)` when no hint is provided.

## Measurement Method

Command:

```bash
npm run -s autonomy:pipeline:latency -- --iterations 180 --label <label>
```

Runs:
- before: `pipeline-latency-before-eventcount-opt`
- after: `pipeline-latency-after-eventcount-opt`

Raw artifacts (generated, gitignored):
- `docs/ops/autonomy/reports/pipeline-latency-before-eventcount-opt.pipeline-latency.json`
- `docs/ops/autonomy/reports/pipeline-latency-after-eventcount-opt.pipeline-latency.json`

## Results

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Direct avg (ms) | 1.061 | 0.961 | -0.100 |
| Pipeline avg (ms) | 7.006 | 6.700 | -0.306 |
| Overhead avg (ms) | 5.944 | 5.739 | -0.206 |
| Overhead p95 (ms) | 1 | 1 | 0 |
| Overhead p99 (ms) | 188 | 210 | +22 |

## Conclusion

The optimization reduced mean pipeline overhead by about `0.206ms` per call (~`3.5%` relative reduction in average overhead) with no functional regressions in scoped pipeline tests.  
Tail latency (`p99`) remained noisy in this sample window and should be tracked with larger-run/perf-environment benchmarks if p99 SLO tightening is required.
