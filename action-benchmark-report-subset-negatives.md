# Action Selection Benchmark

**Selection Accuracy:** 50.0% (2/4)
**Latency:** avg 9348ms · p50 4870ms · p95 21050ms
**Planner Accuracy:** 25.0% (1/4)
**Execution Accuracy:** 50.0% (2/4)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| chat | 2 | 4 | 50.0% |
| negative | 2 | 4 | 50.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 2 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 2 |
| no_response | 0 |
| error | 0 |

## Failures (2)

| Case | Expected | Planned | Completed | Failure Mode | Error |
| --- | --- | --- | --- | --- | --- |
| neg-email-chatter | (no action) | CROSS_CHANNEL_SEND | CROSS_CHANNEL_SEND | llm_chose_other_action |  |
| neg-screentime-chatter | (no action) | GET_TIME_ON_SITE | GET_TIME_ON_SITE | llm_chose_other_action |  |
