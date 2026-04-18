# Action Selection Benchmark

**Selection Accuracy:** 0.0% (0/1)
**Latency:** avg 11519ms · p50 11519ms · p95 11519ms
**Planner Accuracy:** 0.0% (0/1)
**Execution Accuracy:** 0.0% (0/1)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| relationships | 0 | 1 | 0.0% |
| standard | 0 | 1 | 0.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 0 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 1 |
| no_response | 0 |
| error | 0 |

## Failures (1)

| Case | Expected | Planned | Completed | Failure Mode | Error |
| --- | --- | --- | --- | --- | --- |
| rel-follow-up | RELATIONSHIP | UPDATE_ENTITY | SCHEDULING | llm_chose_other_action |  |
