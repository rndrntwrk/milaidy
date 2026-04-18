# Action Selection Benchmark

**Selection Accuracy:** 100.0% (1/1)
**Latency:** avg 10325ms · p50 10325ms · p95 10325ms
**Planner Accuracy:** 100.0% (1/1)
**Execution Accuracy:** 0.0% (0/1)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| relationships | 1 | 1 | 100.0% |
| standard | 1 | 1 | 100.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 0 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 0 |
| no_response | 0 |
| error | 1 |

## Execution Issues (1)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| rel-follow-up | SCHEDULE_FOLLOW_UP | (none) | (none) | Contact not found in relationships. Please add them first. |
