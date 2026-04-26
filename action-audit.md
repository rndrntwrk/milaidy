# Action Audit

Scanned **105** actions across **103** files.
**High:** 10 · **Medium:** 6 · **Low:** 16

## Violations (23)

| Action | Severity | Rule | Detail | File |
| --- | --- | --- | --- | --- |
| `CALENDLY` | high | `regex-intent-inference` | Action CALENDLY file defines and uses heuristic helper inferSubactionFromIntent — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/calendly.ts` |
| `CALENDLY` | medium | `param-format-coercion` | Action CALENDLY file defines and uses parseLooseParameterString — accepts stringly-typed planner params; prefer enforcing structured JSON in the planner schema | `eliza/apps/app-lifeops/src/actions/calendly.ts` |
| `CALL_EXTERNAL` | high | `regex-intent-inference` | Action CALL_EXTERNAL file defines and uses heuristic helper looksLikeStandingCallPolicy — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `CALL_USER` | high | `regex-intent-inference` | Action CALL_USER file defines and uses heuristic helper looksLikeStandingCallPolicy — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `INTENT_SYNC` | high | `regex-intent-inference` | Action INTENT_SYNC file defines and uses heuristic helper looksLikeBroadcastPayload — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/intent-sync.ts` |
| `LIFE` | high | `regex-intent-inference` | Action LIFE file defines and uses heuristic helper extractLifeTimeZoneFromText — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/life.ts` |
| `LIFEOPS_COMPUTER_USE` | high | `regex-intent-inference` | Action LIFEOPS_COMPUTER_USE file defines and uses heuristic helper inferSurface — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/computer-use.ts` |
| `MANAGE_TASKS` | low | `missing-examples` | Action MANAGE_TASKS has no examples — planner will only see description/similes | `eliza/packages/agent/src/actions/manage-tasks.ts` |
| `MANAGE_TASKS` | low | `missing-parameters` | Action MANAGE_TASKS declares no parameters block | `eliza/packages/agent/src/actions/manage-tasks.ts` |
| `MANAGE_TASKS` | high | `regex-intent-inference` | Action MANAGE_TASKS file defines and uses heuristic helper looksLikeListTaskIntent — LLM should extract all params | `eliza/packages/agent/src/actions/manage-tasks.ts` |
| `OWNER_CALENDAR` | high | `regex-intent-inference` | Action OWNER_CALENDAR file defines and uses heuristic helper looksLikeNonRequestPreface — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/owner-calendar.ts` |
| `REMOTE_DESKTOP` | high | `regex-intent-inference` | Action REMOTE_DESKTOP file defines and uses heuristic helper inferSubactionFromText — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/remote-desktop.ts` |
| `REMOTE_DESKTOP` | medium | `param-format-coercion` | Action REMOTE_DESKTOP file defines and uses parseLooseParameterString — accepts stringly-typed planner params; prefer enforcing structured JSON in the planner schema | `eliza/apps/app-lifeops/src/actions/remote-desktop.ts` |
| `TWILIO_VOICE_CALL` | high | `regex-intent-inference` | Action TWILIO_VOICE_CALL file defines and uses heuristic helper looksLikeStandingCallPolicy — LLM should extract all params | `eliza/apps/app-lifeops/src/actions/twilio-call.ts` |
| `CALENDAR_ACTION` | medium | `regex-in-handler` | Action CALENDAR_ACTION handler uses a raw regex (/\b(propose\|suggest\|offer\|share\|send)\b[^.]*\b(\d+\|a few\|some\|several\|multiple\|three\|two\|four\|five)\b[^.]*\b(times?\|slots?\|options?\|windows?)\b/.test() — suspicious unless it's data-format validation | `eliza/apps/app-lifeops/src/actions/calendar.ts` |
| `LIST_REMOTE_SESSIONS` | medium | `thin-description` | Action LIST_REMOTE_SESSIONS description is only ~46 chars (min 60) — small models will mis-classify | `eliza/apps/app-lifeops/src/actions/list-remote-sessions.ts` |
| `PASSWORD_MANAGER` | medium | `param-format-coercion` | Action PASSWORD_MANAGER file defines and uses parseLooseParameterString — accepts stringly-typed planner params; prefer enforcing structured JSON in the planner schema | `eliza/apps/app-lifeops/src/actions/password-manager.ts` |
| `REVOKE_REMOTE_SESSION` | medium | `thin-description` | Action REVOKE_REMOTE_SESSION description is only ~46 chars (min 60) — small models will mis-classify | `eliza/apps/app-lifeops/src/actions/revoke-remote-session.ts` |
| `CHAT_THREAD_CONTROL` | low | `missing-examples` | Action CHAT_THREAD_CONTROL has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/chat-thread-control.ts` |
| `CHAT_THREAD_CONTROL` | low | `missing-parameters` | Action CHAT_THREAD_CONTROL declares no parameters block | `eliza/apps/app-lifeops/src/actions/chat-thread-control.ts` |
| `CROSS_PLATFORM_GATEWAY` | low | `missing-examples` | Action CROSS_PLATFORM_GATEWAY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/cross-platform-gateway.ts` |
| `CROSS_PLATFORM_GATEWAY` | low | `missing-parameters` | Action CROSS_PLATFORM_GATEWAY declares no parameters block | `eliza/apps/app-lifeops/src/actions/cross-platform-gateway.ts` |
| `EMAIL_UNSUBSCRIBE` | low | `missing-parameters` | Action EMAIL_UNSUBSCRIBE declares no parameters block | `eliza/apps/app-lifeops/src/actions/email-unsubscribe.ts` |
| `FETCH_BROWSER_ACTIVITY` | low | `missing-examples` | Action FETCH_BROWSER_ACTIVITY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `FETCH_BROWSER_ACTIVITY` | low | `missing-parameters` | Action FETCH_BROWSER_ACTIVITY declares no parameters block | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `PAYMENTS` | low | `missing-parameters` | Action PAYMENTS declares no parameters block | `eliza/apps/app-lifeops/src/actions/payments.ts` |
| `REGISTER_BROWSER_SESSION` | low | `missing-examples` | Action REGISTER_BROWSER_SESSION has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `REGISTER_BROWSER_SESSION` | low | `missing-parameters` | Action REGISTER_BROWSER_SESSION declares no parameters block | `eliza/apps/app-lifeops/src/actions/browser-extension.ts` |
| `SCHEDULE_X_DM_REPLY` | low | `missing-examples` | Action SCHEDULE_X_DM_REPLY has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/schedule-x-dm-reply.ts` |
| `SCHEDULE_X_DM_REPLY` | low | `missing-parameters` | Action SCHEDULE_X_DM_REPLY declares no parameters block | `eliza/apps/app-lifeops/src/actions/schedule-x-dm-reply.ts` |
| `SEARCH_ACROSS_CHANNELS` | low | `missing-examples` | Action SEARCH_ACROSS_CHANNELS has no examples — planner will only see description/similes | `eliza/apps/app-lifeops/src/actions/search-across-channels.ts` |
| `SUBSCRIPTIONS` | low | `missing-parameters` | Action SUBSCRIPTIONS declares no parameters block | `eliza/apps/app-lifeops/src/actions/subscriptions.ts` |

## Clean (82)

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
| `CHECK_AVAILABILITY` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `COMPUTE_TRAVEL_BUFFER` | `eliza/apps/app-lifeops/src/travel-time/action.ts` |
| `DOSSIER` | `eliza/apps/app-lifeops/src/actions/dossier.ts` |
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
| `GMAIL_ACTION` | `eliza/apps/app-lifeops/src/actions/gmail.ts` |
| `GO_LIVE` | `eliza/packages/agent/src/actions/stream-control.ts` |
| `GO_OFFLINE` | `eliza/packages/agent/src/actions/stream-control.ts` |
| `HEALTH` | `eliza/apps/app-lifeops/src/actions/health.ts` |
| `INBOX` | `eliza/apps/app-lifeops/src/actions/inbox.ts` |
| `INBOX_TRIAGE_GMAIL` | `eliza/apps/app-lifeops/src/actions/inbox-triage.ts` |
| `INSTALL_PLUGIN` | `eliza/packages/agent/src/actions/install-plugin.ts` |
| `LAUNCH_APP` | `eliza/packages/agent/src/actions/app-control.ts` |
| `LIFEOPS_CONNECTOR` | `eliza/apps/app-lifeops/src/actions/lifeops-connector.ts` |
| `LIFEOPS_MUTATE` | `eliza/apps/app-lifeops/src/actions/lifeops-mutate.ts` |
| `LINK_ENTITY` | `eliza/packages/agent/src/actions/entity-actions.ts` |
| `LIST_ACTIVE_BLOCKS` | `eliza/apps/app-lifeops/src/website-blocker/chat-integration/actions/listActiveBlocks.ts` |
| `LIST_AUTOFILL_WHITELIST` | `eliza/apps/app-lifeops/src/actions/autofill.ts` |
| `LIST_EJECTED_PLUGINS` | `eliza/packages/agent/src/actions/list-ejected.ts` |
| `LIST_OVERDUE_FOLLOWUPS` | `eliza/apps/app-lifeops/src/followup/actions/listOverdueFollowups.ts` |
| `LOG_LEVEL` | `eliza/packages/agent/src/actions/log-level.ts` |
| `MARK_FOLLOWUP_DONE` | `eliza/apps/app-lifeops/src/followup/actions/markFollowupDone.ts` |
| `OWNER_APP_BLOCK` | `eliza/apps/app-lifeops/src/actions/owner-app-block.ts` |
| `OWNER_INBOX` | `eliza/apps/app-lifeops/src/actions/owner-inbox.ts` |
| `OWNER_RELATIONSHIP` | `eliza/apps/app-lifeops/src/actions/relationships.ts` |
| `OWNER_REMOTE_DESKTOP` | `eliza/apps/app-lifeops/src/actions/owner-remote-desktop.ts` |
| `OWNER_SCHEDULE` | `eliza/apps/app-lifeops/src/actions/owner-schedule.ts` |
| `OWNER_SCREEN_TIME` | `eliza/apps/app-lifeops/src/actions/owner-screen-time.ts` |
| `OWNER_SEND_MESSAGE` | `eliza/apps/app-lifeops/src/actions/cross-channel-send.ts` |
| `OWNER_WEBSITE_BLOCK` | `eliza/apps/app-lifeops/src/actions/owner-website-block.ts` |
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
| `START_REMOTE_SESSION` | `eliza/apps/app-lifeops/src/actions/start-remote-session.ts` |
| `STOP_APP` | `eliza/packages/agent/src/actions/app-control.ts` |
| `SYNC_PLUGIN` | `eliza/packages/agent/src/actions/sync-plugin.ts` |
| `TOGGLE_LIFEOPS_FEATURE` | `eliza/apps/app-lifeops/src/actions/feature-toggle.ts` |
| `UNBLOCK_APPS` | `eliza/apps/app-lifeops/src/actions/app-blocker.ts` |
| `UNBLOCK_WEBSITES` | `eliza/apps/app-lifeops/src/actions/website-blocker.ts` |
| `UPDATE_MEETING_PREFERENCES` | `eliza/apps/app-lifeops/src/actions/scheduling.ts` |
| `UPDATE_OWNER_PROFILE` | `eliza/apps/app-lifeops/src/actions/update-owner-profile.ts` |
| `WEB_SEARCH` | `eliza/packages/agent/src/actions/web-search.ts` |
| `X_READ` | `eliza/apps/app-lifeops/src/actions/x-read.ts` |
