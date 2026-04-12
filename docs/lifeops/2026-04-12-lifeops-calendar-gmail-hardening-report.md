# LifeOps Calendar/Gmail Hardening Report

Date: 2026-04-12
Owner: Codex
Scope: `packages/agent/src/actions/{calendar,gmail,life}.ts`, `packages/agent/src/lifeops/*`, managed Google cloud routes/connectors, and focused regression coverage.

## Ticket Summary

This pass closed the open review findings from the calendar/Gmail/LifeOps audit and finished the cloud-managed Google calendar write parity work that was still incomplete. It also caught and fixed one additional blocking defect during verification: the new timezone normalization helper in the current tree referenced an undefined alias regex and broke Life create flows under test.

## Findings And Resolution

| ID | Area | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Calendar action | `delete_event` could delete the first fuzzy title match when multiple events collided. | Fixed. Delete now returns a clarification reply with candidate previews unless the user explicitly asked to delete all matches. |
| 2 | Calendar action | `update_event` could update the first fuzzy title match when multiple events collided. | Fixed. Update now returns a clarification reply with candidate previews instead of silently choosing `candidates[0]`. |
| 3 | Calendar action | Reminder phrasing could still force calendar subactions because `reminder` was in the forced-subaction regex. | Fixed. Reminder/todo wording is no longer treated as a calendar noun, and reminder-like requests are reply-only/no-op in calendar. |
| 4 | Gmail action | `draft_reply` natural-language flows were advertised, but the handler still required a concrete `messageId` or silently used the first search hit. | Fixed. `draft_reply` now resolves from Gmail search queries and clarifies on ambiguous results instead of picking the first message. |
| 5 | Gmail action | `read`/`send_reply` had the same first-match ambiguity risk as `draft_reply`. | Fixed. Shared Gmail target resolution now disambiguates before `read`, `draft_reply`, or `send_reply` proceed. |
| 6 | Life action | Explicit month/day reminders without a year could schedule into the past. | Fixed. One-off reminders roll into the next year when the explicit month/day has already passed and no year was supplied. |
| 7 | Managed Google service | Cloud-managed calendar `update` and `delete` still hard-failed with `501`, even though the action surface exposed them. | Fixed. Agent service, managed client, cloud connector, and cloud routes now support managed calendar update/delete end to end. |
| 8 | Timezone extraction | `timezone-normalization.ts` referenced `ALIAS_TIME_ZONE_PATTERN` without defining it, breaking Life create flows in tests. | Fixed. Added the missing alias regex and revalidated Life create/seed flows. |

## Implementation Notes

### Agent-side behavior

- `packages/agent/src/actions/calendar.ts`
  - Added shared calendar-event disambiguation fallback text.
  - Removed `reminder` from forced calendar create/update/delete regexes.
  - Added reminder/todo reply-only escape hatch before action execution.
  - Added natural service-error fallback for raw calendar validation/provider errors.

- `packages/agent/src/actions/gmail.ts`
  - Added shared Gmail target-resolution flow that can return `resolved`, `ambiguous`, or `missing`.
  - `read`, `draft_reply`, and `send_reply` now use the same resolution path.
  - Ambiguous Gmail matches now produce a clarification reply using formatted search results.

- `packages/agent/src/actions/life.ts`
  - Explicit month/day one-off reminders now roll to next year when appropriate.
  - Reminder-timezone handling stays grounded and no longer leaks raw service validator text.

- `packages/agent/src/actions/timezone-normalization.ts`
  - Added the missing alias regex used by explicit timezone extraction.

### Managed Google calendar parity

- `packages/agent/src/lifeops/google-managed-client.ts`
  - Added `updateCalendarEvent(...)` and `deleteCalendarEvent(...)`.

- `packages/agent/src/lifeops/service.ts`
  - Removed the cloud-managed `501` stubs for calendar update/delete.
  - Cloud-managed updates now call the managed client; local mode keeps the existing direct Google patch semantics.
  - Cloud-managed deletes now clear the cached local event mirror after upstream delete succeeds.

- `cloud/packages/lib/services/milady-google-connector.ts`
  - Added managed calendar event fetch helper for update context.
  - Added managed calendar update with duration/timezone preservation when only one bound changes.
  - Added managed calendar delete.

- `cloud/app/api/v1/milady/google/calendar/events/[eventId]/route.ts`
  - New PATCH/DELETE route for managed calendar event updates and deletes.

- `cloud/packages/lib/services/milady-google-route-deps.ts`
  - Exported the new managed calendar update/delete dependencies.

## Tests Added Or Extended

- `packages/agent/src/actions/life.test.ts`
  - Added regression for month/day-without-year rollover.

- `packages/agent/src/actions/calendar.test.ts`
  - Added update ambiguity clarification coverage.
  - Added delete ambiguity clarification coverage.

- `packages/agent/src/actions/gmail.test.ts`
  - Added `draft_reply` query-based target resolution coverage.
  - Added Gmail ambiguity clarification coverage for `draft_reply`.
  - Added Gmail ambiguity clarification coverage for `read`.

- `packages/agent/src/actions/timezone-normalization.test.ts`
  - Existing suite now passes again with alias extraction repaired.

- `packages/agent/src/lifeops/google-managed-client.test.ts`
  - Added managed calendar update endpoint coverage.
  - Added managed calendar delete endpoint coverage.

- `packages/agent/test/lifeops-google-managed.e2e.test.ts`
  - Added managed calendar update/delete parity coverage through the agent service stack.

- `cloud/packages/tests/unit/milady-google-connector.test.ts`
  - Added partial managed calendar update coverage preserving timezone/duration.
  - Added managed calendar delete coverage.

- `cloud/packages/tests/unit/milady-google-routes.test.ts`
  - Added PATCH managed calendar route coverage.
  - Added DELETE managed calendar route coverage.

## Verification

### Agent unit tests

Command:

```bash
bunx vitest run \
  packages/agent/src/actions/timezone-normalization.test.ts \
  packages/agent/src/actions/life.test.ts \
  packages/agent/src/actions/calendar.test.ts \
  packages/agent/src/actions/gmail.test.ts \
  packages/agent/src/lifeops/google-managed-client.test.ts
```

Result: `279/279` passing

### Cloud unit tests

Command:

```bash
bun test \
  packages/tests/unit/milady-google-connector.test.ts \
  packages/tests/unit/milady-google-routes.test.ts
```

Result: `27/27` passing

### Agent e2e tests

Command:

```bash
bunx vitest run --config vitest.e2e.config.ts \
  packages/agent/test/lifeops-calendar-chat.e2e.test.ts \
  packages/agent/test/lifeops-gmail-chat.e2e.test.ts \
  packages/agent/test/lifeops-life-chat.e2e.test.ts \
  packages/agent/test/lifeops-google-managed.e2e.test.ts
```

Result: `31/31` passing

### Static checks

- Agent-side Biome check passed on all changed agent files.
- Cloud-side Biome check passed on all changed cloud files.

## Remaining Risk

- Managed calendar update parity is now implemented for create/update/delete, but there is still no standalone managed single-event read route; partial update context is handled inside the connector service itself. That is acceptable for current action/service needs, but if external clients need event-by-id reads later, the connector already has the internal helper and can expose it cleanly.
