# Baseline Measurement Specification

## Overview

The autonomy kernel baseline measurement system captures quantitative metrics
across all kernel subsystems to establish performance, safety, and reliability
benchmarks.

## Metrics Collected

### Trust Metrics
- **trustAccuracy**: Correct trust decisions / total trust evaluations
- **trustCalibration**: Deviation between predicted and actual trust outcomes

### Memory Metrics
- **memoryGateAccuracy**: Correct gate decisions / total memory writes
- **memoryPoisoningResistance**: Rejection rate of adversarial memory injections

### Safety Metrics
- **safetyViolationRate**: Violations per 1000 interactions
- **injectionResistance**: Resistance to prompt injection attacks

### Drift Metrics
- **driftScore**: Persona drift magnitude (0 = no drift, 1 = complete drift)
- **correctionLatency**: Time to detect and correct drift (ms)

### Performance Metrics
- **pipelineLatency**: p50/p95/p99 execution pipeline latency (ms)
- **throughput**: Requests per second under load

## Measurement Protocol

1. Load standard evaluation scenario set
2. Run each scenario through the full execution pipeline
3. Collect per-scenario metrics via `ScenarioEvaluator`
4. Aggregate into `BaselineMetrics` via `FileBaselineHarness`
5. Persist results with label and timestamp

## Acceptance Criteria

| Metric | Threshold | Source |
|--------|-----------|--------|
| trustAccuracy | ≥ 0.85 | SOW §4.1 |
| memoryGateAccuracy | ≥ 0.90 | SOW §4.2 |
| injectionResistance | ≥ 0.95 | SOW §4.3 |
| driftScore | ≤ 0.10 | SOW §4.4 |
| pipelineLatency (p95) | ≤ 500ms | SOW §4.5 |

## Automation

Baseline measurements can be scheduled via `BaselineScheduler` with
configurable interval (`metrics.autoMeasureIntervalMs`). Results are
exported to Prometheus via the `/metrics` endpoint.
