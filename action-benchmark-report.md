# Action Selection Benchmark

**Selection Accuracy:** 100.0% (69/69)
**Latency:** avg 11042ms · p50 4927ms · p95 58545ms
**Planner Accuracy:** 98.6% (68/69)
**Execution Accuracy:** 89.9% (62/69)

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
| intent-sync | 2 | 2 | 100.0% |
| messaging | 3 | 3 | 100.0% |
| negative | 11 | 11 | 100.0% |
| password | 2 | 2 | 100.0% |
| relationships | 3 | 3 | 100.0% |
| remote-desktop | 2 | 2 | 100.0% |
| scheduling | 4 | 4 | 100.0% |
| screen-time | 2 | 2 | 100.0% |
| standard | 44 | 44 | 100.0% |
| subscriptions | 4 | 4 | 100.0% |
| todos | 3 | 3 | 100.0% |
| voice | 2 | 2 | 100.0% |
| x | 3 | 3 | 100.0% |

## By failure mode

| Mode | Count |
| --- | ---: |
| passed | 66 |
| validate_filtered | 0 |
| llm_chose_reply | 0 |
| llm_chose_other_action | 0 |
| no_response | 0 |
| error | 3 |

## Execution Issues (7)

| Case | Planned | Started | Completed | Error |
| --- | --- | --- | --- | --- |
| block-sites-focus | BLOCK_WEBSITES | (none) | (none) | ConversationHarness.send timed out after 90000ms |
| block-sites-social | BLOCK_WEBSITES | (none) | (none) | ConversationHarness.send timed out after 90000ms |
| block-sites-youtube | BLOCK_WEBSITES | (none) | (none) | ConversationHarness.send timed out after 90000ms |
| sched-propose-times | CALENDAR_ACTION | CALENDAR_ACTION | (none) |  |
| password-manager-list-logins | PASSWORD_MANAGER | PASSWORD_MANAGER | (none) |  |
| remote-desktop-start-session | REMOTE_DESKTOP | REMOTE_DESKTOP | (none) |  |
| calendly-check-availability | CALENDLY | CALENDLY | CALENDAR_ACTION |  |
