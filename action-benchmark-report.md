# Action Selection Benchmark

**Selection Accuracy:** 91.3% (63/69)
**Latency:** avg 13200ms · p50 6078ms · p95 53747ms
**Planner Accuracy:** 87.0% (60/69)
**Execution Accuracy:** 76.8% (53/69)

## By tag

| Tag | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| blocking | 4 | 5 | 80.0% |
| calendar | 5 | 5 | 100.0% |
| calendly | 2 | 2 | 100.0% |
| chat | 10 | 11 | 90.9% |
| computer-use | 2 | 2 | 100.0% |
| credentials | 2 | 2 | 100.0% |
| critical | 13 | 14 | 92.9% |
| dossier | 2 | 2 | 100.0% |
| email | 4 | 4 | 100.0% |
| focus | 4 | 5 | 80.0% |
| goals | 3 | 3 | 100.0% |
| habits | 2 | 2 | 100.0% |
| health | 2 | 2 | 100.0% |
| inbox | 3 | 3 | 100.0% |
| intent-sync | 2 | 2 | 100.0% |
| messaging | 3 | 3 | 100.0% |
| negative | 10 | 11 | 90.9% |
| password | 2 | 2 | 100.0% |
| relationships | 2 | 3 | 66.7% |
| remote-desktop | 1 | 2 | 50.0% |
| scheduling | 2 | 4 | 50.0% |
| screen-time | 2 | 2 | 100.0% |
| standard | 40 | 44 | 90.9% |
| subscriptions | 4 | 4 | 100.0% |
| todos | 3 | 3 | 100.0% |
| voice | 2 | 2 | 100.0% |
| x | 3 | 3 | 100.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 62 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 6 |
| no_response | 0 |
| error | 1 |

## Failures (6)

| Case | Expected | Planned | Completed | Failure Mode | Error |
| --- | --- | --- | --- | --- | --- |
| chat-smalltalk-weather | (no action) | PROPOSE_MEETING_TIMES | PROPOSE_MEETING_TIMES | llm_chose_other_action |  |
| block-apps-games | BLOCK_APPS | BLOCK_WEBSITES | BLOCK_WEBSITES | llm_chose_other_action |  |
| rel-follow-up | RELATIONSHIP | REPLY | INBOX | llm_chose_other_action |  |
| sched-start-flow | SCHEDULING | CALENDAR_ACTION | PROPOSE_MEETING_TIMES | llm_chose_other_action |  |
| sched-propose-times | SCHEDULING | CALENDAR_ACTION | CALENDAR_ACTION | llm_chose_other_action |  |
| remote-desktop-connect-from-phone | REMOTE_DESKTOP | START_REMOTE_SESSION | START_REMOTE_SESSION | llm_chose_other_action |  |

## Execution Issues (10)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| email-send-reply | GMAIL_ACTION | GMAIL_ACTION | (none) |  |
| block-sites-focus | BLOCK_WEBSITES | BLOCK_WEBSITES | (none) |  |
| block-sites-youtube | BLOCK_WEBSITES | BLOCK_WEBSITES | REPLY |  |
| cross-send-telegram | CROSS_CHANNEL_SEND | CROSS_CHANNEL_SEND | (none) |  |
| twilio-call-dentist | CALL_EXTERNAL | CALL_EXTERNAL | (none) |  |
| twilio-call-support | CALL_EXTERNAL | CALL_EXTERNAL | (none) |  |
| subscriptions-cancel-netflix | SUBSCRIPTIONS | SUBSCRIPTIONS | (none) |  |
| subscriptions-cancel-hulu-browser | SUBSCRIPTIONS | SUBSCRIPTIONS | (none) |  |
| password-manager-lookup | PASSWORD_MANAGER | (none) | (none) | ConversationHarness.send timed out after 90000ms |
| intent-sync-mobile-routine-reminder | INTENT_SYNC | INTENT_SYNC | REPLY |  |
