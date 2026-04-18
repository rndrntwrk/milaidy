# Action Selection Benchmark

**Selection Accuracy:** 84.6% (11/13)
**Latency:** avg 8020ms · p50 4914ms · p95 30608ms
**Planner Accuracy:** 76.9% (10/13)
**Execution Accuracy:** 69.2% (9/13)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| calendar | 1 | 1 | 100.0% |
| chat | 2 | 4 | 50.0% |
| critical | 4 | 4 | 100.0% |
| email | 1 | 1 | 100.0% |
| intent-sync | 2 | 2 | 100.0% |
| negative | 2 | 4 | 50.0% |
| relationships | 2 | 2 | 100.0% |
| scheduling | 1 | 1 | 100.0% |
| standard | 5 | 5 | 100.0% |
| voice | 2 | 2 | 100.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 10 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 2 |
| no_response | 0 |
| error | 1 |

## Failures (2)

| Case | Expected | Planned | Completed | Failure Mode | Error |
| --- | --- | --- | --- | --- | --- |
| neg-calendar-chatter | (no action) | CALENDAR_ACTION | CALENDAR_ACTION | llm_chose_other_action |  |
| neg-goal-advice | (no action) | LIFE | LIFE | llm_chose_other_action |  |

## Execution Issues (2)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| rel-follow-up | SCHEDULE_FOLLOW_UP | (none) | (none) | Could not extract follow-up information |
| neg-email-chatter | REPLY | GMAIL_ACTION | GMAIL_ACTION |  |
