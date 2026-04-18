# Action Selection Benchmark

**Selection Accuracy:** 84.6% (11/13)
**Latency:** avg 7965ms · p50 4252ms · p95 35411ms
**Planner Accuracy:** 76.9% (10/13)
**Execution Accuracy:** 46.2% (6/13)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| calendar | 1 | 1 | 100.0% |
| chat | 4 | 4 | 100.0% |
| critical | 2 | 4 | 50.0% |
| email | 1 | 1 | 100.0% |
| intent-sync | 2 | 2 | 100.0% |
| negative | 4 | 4 | 100.0% |
| relationships | 2 | 2 | 100.0% |
| scheduling | 0 | 1 | 0.0% |
| standard | 5 | 5 | 100.0% |
| voice | 1 | 2 | 50.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 11 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 2 |
| no_response | 0 |
| error | 0 |

## Failures (2)

| Case | Expected | Planned | Completed | Failure Mode | Error |
| --- | --- | --- | --- | --- | --- |
| sched-propose-times | SCHEDULING | CALENDAR_ACTION | CALENDAR_ACTION | llm_chose_other_action |  |
| twilio-call-dentist | CALL_EXTERNAL | CALENDAR_ACTION | CALENDAR_ACTION | llm_chose_other_action |  |

## Execution Issues (5)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| rel-follow-up | REPLY | RELATIONSHIP | REPLY |  |
| rel-days-since | RELATIONSHIP | RELATIONSHIP | (none) |  |
| twilio-call-support | CALL_EXTERNAL | CALL_EXTERNAL | (none) |  |
| intent-sync-broadcast-reminder | PUBLISH_DEVICE_INTENT | PUBLISH_DEVICE_INTENT | (none) |  |
| intent-sync-mobile-routine-reminder | PUBLISH_DEVICE_INTENT | PUBLISH_DEVICE_INTENT | (none) |  |
