# Action Selection Benchmark

**Selection Accuracy:** 100.0% (6/6)
**Latency:** avg 4721ms · p50 4769ms · p95 5865ms
**Planner Accuracy:** 100.0% (6/6)
**Execution Accuracy:** 100.0% (6/6)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| chat | 6 | 6 | 100.0% |
| negative | 6 | 6 | 100.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 5 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 0 |
| no_response | 0 |
| error | 1 |

## Execution Issues (1)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| neg-screentime-chatter | REPLY | (none) | (none) | [app-blocker] AppBlocker Capacitor plugin is not available. App blocking is mobile-only. |
