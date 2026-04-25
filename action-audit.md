# Action Audit

Scanned **77** actions across **103** files.
**High:** 1 · **Medium:** 1 · **Low:** 6

## Violations (5)

| Action | Severity | Rule | Detail | File |
| --- | --- | --- | --- | --- |
| `PASSWORD_MANAGER` | high | `regex-intent-inference` | Action PASSWORD_MANAGER handler calls a heuristic inferXFromText() helper — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/password-manager.ts` |
| `CALENDAR_ACTION` | medium | `regex-in-handler` | Action CALENDAR_ACTION handler uses a raw regex (/\b(propose\|suggest\|offer\|share\|send)\b[^.]*\b(\d+\|a few\|some\|several\|multiple\|three\|two\|four\|five)\b[^.]*\b(times?\|slots?\|options?\|windows?)\b/.test() — suspicious unless it's data-format validation | `eliza/apps/app-lifeops/src/actions/calendar.ts` |
| `CHAT_THREAD_CONTROL` | low | `missing-examples` | Action CHAT_THREAD_CONTROL has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/chat-thread-control.ts` |
| `CHAT_THREAD_CONTROL` | low | `missing-parameters` | Action CHAT_THREAD_CONTROL declares no parameters block | `eliza/apps/app-lifeops/src/actions/chat-thread-control.ts` |
| `CROSS_PLATFORM_GATEWAY` | low | `missing-examples` | Action CROSS_PLATFORM_GATEWAY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/cross-platform-gateway.ts` |
| `CROSS_PLATFORM_GATEWAY` | low | `missing-parameters` | Action CROSS_PLATFORM_GATEWAY declares no parameters block | `eliza/apps/app-lifeops/src/actions/cross-platform-gateway.ts` |
| `SCHEDULE_X_DM_REPLY` | low | `missing-examples` | Action SCHEDULE_X_DM_REPLY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/schedule-x-dm-reply.ts` |
| `SCHEDULE_X_DM_REPLY` | low | `missing-parameters` | Action SCHEDULE_X_DM_REPLY declares no parameters block | `eliza/apps/app-lifeops/src/actions/schedule-x-dm-reply.ts` |

## Clean (72)

| Action | File |
| --- | --- |
| `ADD_AUTOFILL_WHITELIST` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `AGENT_INBOX` | `eliza/packages/agent/src/actions/agent-inbox.ts` |
| `AGENT_SEND_MESSAGE` | `eliza/packages/agent/src/actions/send-message.ts` |
| `ANALYZE_IMAGE` | `eliza/packages/agent/src/actions/media.ts` |
| `APPROVE_REQUEST` | `eliza/apps/app-lifeops/src/actions/approval.ts` |
| `BLOCK_APPS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `BLOCK_UNTIL_TASK_COMPLETE` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/blockUntilTaskComplete.ts` |
| `BLOCK_WEBSITES` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `BOOK_TRAVEL` | `eliza/apps/app-lifeops/src/actions/book-travel.ts` |
| `BROWSER_SESSION` | `eliza/packages/agent/src/actions/browser-session.ts` |
| `CALL_EXTERNAL` | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `CALL_USER` | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `CHECK_AVAILABILITY` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `COMPUTE_TRAVEL_BUFFER` | `eliza/apps/app-lifeops/src/travel-time/action.ts` |
| `EJECT_PLUGIN` | `eliza/packages/agent/src/actions/eject-plugin.ts` |
| `EXTRACT_PAGE` | `eliza/packages/agent/src/actions/extract-page.ts` |
| `GENERATE_AUDIO` | `eliza/packages/agent/src/actions/media.ts` |
| `GENERATE_DOSSIER` | `eliza/apps/app-lifeops/src/dossier/action.ts` |
| `GENERATE_IMAGE` | `eliza/packages/agent/src/actions/media.ts` |
| `GENERATE_VIDEO` | `eliza/packages/agent/src/actions/media.ts` |
| `GET_ACTIVITY_REPORT` | `eliza/apps/app-lifeops/src/actions/activity-report.ts` |
| `GET_APP_BLOCK_STATUS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `GET_SELF_STATUS` | `eliza/packages/agent/src/actions/get-self-status.ts` |
| `GET_TIME_ON_APP` | `eliza/apps/app-lifeops/src/actions/activity-report.ts` |
| `GET_TIME_ON_SITE` | `eliza/apps/app-lifeops/src/actions/activity-report.ts` |
| `GET_WEBSITE_BLOCK_STATUS` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `GO_LIVE` | `eliza/packages/agent/src/actions/stream-control.ts` |
| `GO_OFFLINE` | `eliza/packages/agent/src/actions/stream-control.ts` |
| `HEALTH` | `eliza/apps/app-lifeops/src/actions/health.ts` |
| `INBOX_TRIAGE_GMAIL` | `eliza/apps/app-lifeops/src/actions/inbox-triage.ts` |
| `INSTALL_PLUGIN` | `eliza/packages/agent/src/actions/install-plugin.ts` |
| `LAUNCH_APP` | `eliza/packages/agent/src/actions/app-control.ts` |
| `LIFE` | `eliza/apps/app-lifeops/src/actions/life.ts` |
| `LINK_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `LIST_ACTIVE_BLOCKS` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/listActiveBlocks.ts` |
| `LIST_AUTOFILL_WHITELIST` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `LIST_EJECTED_PLUGINS` | `eliza/packages/agent/src/actions/list-ejected.ts` |
| `LIST_OVERDUE_FOLLOWUPS` | `eliza/apps/app-lifeops/src/followup/actions/listOverdueFollowups.ts` |
| `LOG_LEVEL` | `eliza/packages/agent/src/actions/log-level.ts` |
| `MARK_FOLLOWUP_DONE` | `eliza/apps/app-lifeops/src/followup/actions/markFollowupDone.ts` |
| `OWNER_RELATIONSHIP` | `eliza/apps/app-lifeops/src/actions/relationships.ts` |
| `OWNER_SCHEDULE` | `eliza/apps/app-lifeops/src/actions/owner-schedule.ts` |
| `PROPOSE_MEETING_TIMES` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `PUBLISH_DEVICE_INTENT` | `eliza/apps/app-lifeops/src/actions/device-bus.ts` |
| `READ_CHANNEL` | `eliza/packages/agent/src/actions/read-channel.ts` |
| `READ_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `READ_MESSAGES` | `eliza/packages/agent/src/actions/read-messages.ts` |
| `REINJECT_PLUGIN` | `eliza/packages/agent/src/actions/reinject-plugin.ts` |
| `REJECT_REQUEST` | `eliza/apps/app-lifeops/src/actions/approval.ts` |
| `RELEASE_BLOCK` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/releaseBlock.ts` |
| `REQUEST_FIELD_FILL` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `REQUEST_WEBSITE_BLOCKING_PERMISSION` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `RESTART_AGENT` | `eliza/packages/agent/src/actions/restart.ts` |
| `RUN_MORNING_CHECKIN` | `eliza/apps/app-lifeops/src/actions/checkin.ts` |
| `RUN_NIGHT_CHECKIN` | `eliza/apps/app-lifeops/src/actions/checkin.ts` |
| `SCHEDULING` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `SCREEN_TIME` | `eliza/apps/app-lifeops/src/actions/screen-time.ts` |
| `SEARCH_CONVERSATIONS` | `eliza/packages/agent/src/actions/search-conversations.ts` |
| `SEARCH_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `SEND_ADMIN_MESSAGE` | `eliza/packages/agent/src/actions/send-admin-message.ts` |
| `SET_FOLLOWUP_THRESHOLD` | `eliza/apps/app-lifeops/src/followup/actions/setFollowupThreshold.ts` |
| `SET_USER_NAME` | `eliza/packages/agent/src/actions/set-user-name.ts` |
| `SHELL_COMMAND` | `eliza/packages/agent/src/actions/terminal.ts` |
| `SKILL_COMMAND` | `eliza/packages/agent/src/actions/skill-command.ts` |
| `STOP_APP` | `eliza/packages/agent/src/actions/app-control.ts` |
| `SYNC_PLUGIN` | `eliza/packages/agent/src/actions/sync-plugin.ts` |
| `UNBLOCK_APPS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `UNBLOCK_WEBSITES` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `UPDATE_MEETING_PREFERENCES` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `UPDATE_OWNER_PROFILE` | `eliza/apps/app-lifeops/src/actions/update-owner-profile.ts` |
| `WEB_SEARCH` | `eliza/packages/agent/src/actions/web-search.ts` |
| `X_READ` | `eliza/apps/app-lifeops/src/actions/x-read.ts` |
