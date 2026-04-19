# Action Selection Benchmark

**Selection Accuracy:** 95.7% (66/69)
**Latency:** avg 12313ms · p50 6074ms · p95 35621ms
**Planner Accuracy:** 95.7% (66/69)
**Execution Accuracy:** 87.0% (60/69)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| blocking | 5 | 5 | 100.0% |
| calendar | 5 | 5 | 100.0% |
| calendly | 2 | 2 | 100.0% |
| chat | 11 | 11 | 100.0% |
| computer-use | 2 | 2 | 100.0% |
| credentials | 2 | 2 | 100.0% |
| critical | 14 | 14 | 100.0% |
| dossier | 2 | 2 | 100.0% |
| email | 4 | 4 | 100.0% |
| focus | 5 | 5 | 100.0% |
| goals | 3 | 3 | 100.0% |
| habits | 2 | 2 | 100.0% |
| health | 2 | 2 | 100.0% |
| inbox | 3 | 3 | 100.0% |
| intent-sync | 1 | 2 | 50.0% |
| messaging | 2 | 3 | 66.7% |
| negative | 11 | 11 | 100.0% |
| password | 2 | 2 | 100.0% |
| relationships | 2 | 3 | 66.7% |
| remote-desktop | 2 | 2 | 100.0% |
| scheduling | 4 | 4 | 100.0% |
| screen-time | 2 | 2 | 100.0% |
| standard | 41 | 44 | 93.2% |
| subscriptions | 4 | 4 | 100.0% |
| todos | 3 | 3 | 100.0% |
| voice | 2 | 2 | 100.0% |
| x | 3 | 3 | 100.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 64 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 3 |
| no_response | 0 |
| error | 2 |

## Failures (3)

| Case | Expected | Planned | Completed | Failure Mode | Error |
| --- | --- | --- | --- | --- | --- |
| rel-days-since | RELATIONSHIP | RELATIONSHIPS | (none) | llm_chose_other_action |  |
| cross-send-discord | CROSS_CHANNEL_SEND | SCHEDULING | SCHEDULING | llm_chose_other_action |  |
| intent-sync-mobile-routine-reminder | INTENT_SYNC | CROSS_CHANNEL_SEND | (none) | llm_chose_other_action |  |

## Execution Issues (6)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| email-draft-reply | GMAIL_ACTION | GMAIL_ACTION | (none) |  |
| block-sites-focus | BLOCK_WEBSITES | (none) | (none) | ConversationHarness.send timed out after 90000ms |
| block-sites-youtube | BLOCK_WEBSITES | (none) | (none) | ConversationHarness.send timed out after 90000ms |
| cross-send-telegram | CROSS_CHANNEL_SEND | CROSS_CHANNEL_SEND | (none) |  |
| subscriptions-cancel-netflix | SUBSCRIPTIONS | SUBSCRIPTIONS | (none) |  |
| subscriptions-cancel-hulu-browser | SUBSCRIPTIONS | SUBSCRIPTIONS | (none) |  |
