# Gmail LifeOps Integration Review

Status: Implementation slice landed for backend Gmail inbox-zero operations, event ingestion, n8n workflow dispatch, write guards, and safe fixture export  
Last updated: 2026-04-22

## Scope

This review covers the Gmail integration used by LifeOps, the local Mockoon-compatible Google mock, PRD and scenario documents, and the scenario tests needed to prove inbox-zero behavior with real LLM planning.

The main product goal is:

- triage Gmail without brittle keyword routing
- find messages that likely need a response
- find true unresponded threads
- detect spam and low-value mail
- bulk archive, label, mark read, trash, or report spam
- draft and send replies only after explicit confirmation
- switch safely between mock Gmail and real Gmail
- enable LifeOps/n8n workflows that react to email events
- never run destructive write tests against real Gmail by accident

## External Gmail Surface To Emulate

The mock should track the Gmail API subset the app uses or plans to expose:

- `users.messages.list`: supports `q`, `labelIds`, `maxResults`, `pageToken`, `includeSpamTrash`, and returns `messages`, `nextPageToken`, and `resultSizeEstimate`.
- `users.messages.get`: fetches message details after list/search returns IDs.
- `users.messages.send`: sends a raw RFC 822 message and requires send/compose/modify scope.
- `users.messages.modify`, `batchModify`, `batchDelete`, `trash`, `untrash`, `delete`: inbox-zero write operations.
- `users.labels.list`: required for label-driven UI and test labels.
- `users.drafts.create/list/get/send/delete`: required for draft-only and approval flows.
- `users.watch` and `users.history.list`: required for new-email event ingestion and cursor sync.
- `users.threads.*`: required for true unresponded-thread detection.
- `users.settings.filters.create`: already relevant to unsubscribe/archive flows.

Primary references:

- Gmail messages list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- Gmail messages send: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
- Gmail drafts: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts
- Gmail batch modify: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/batchModify
- Gmail labels list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/list
- Gmail watch: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/watch
- Gmail history list: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list

## Current State

### What Works

- LifeOps can read Gmail triage, search, read message detail, draft replies, batch draft replies, send replies, send messages, and batch-send replies through `GMAIL_ACTION`.
- The service layer requires `confirmSend` before Gmail sends.
- Gmail action send paths now require explicit send confirmation instead of defaulting to send when planned fields are present.
- LifeOps exposes Gmail bulk management for archive, trash, report spam, mark read/unread, and apply/remove label.
- LifeOps exposes thread-level unresponded detection from sent-thread chronology on the local OAuth path.
- LifeOps accepts Gmail event ingestion and can fan out to event workflows, including n8n dispatch workflow steps.
- `MILADY_BLOCK_REAL_GMAIL_WRITES=1` blocks direct Gmail writes unless traffic is routed to loopback mock or `MILADY_ALLOW_REAL_GMAIL_WRITES=1` is explicitly set.
- `scripts/export-gmail-fixture.mjs` provides the read-only exporter/scrubber/validator path for producing scrubbed Gmail fixtures.
- `MILADY_MOCK_GOOGLE_BASE` switches Google API and OAuth traffic to the local mock.
- The Google mock now covers labels, drafts, batch modify/delete, message trash/untrash/delete, thread operations, watch/history, settings filters, and the existing message send/list/get routes.
- The mock runtime records a request ledger through `requestLedger()` and `GET /__mock/requests`.
- Mock runtime seeding can create a local Google grant for Gmail and Calendar smoke tests.
- Unified inbox can fetch Gmail messages and expose reply-needed metadata.

### Major Gaps

- The Mockoon JSON is still path-only and static. It does not enforce query behavior, auth scopes, pagination, request-body validity, retry errors, or state transitions.
- Scenario fields such as `expectedActions`, planner assertions, and some response checks are accepted but not enforced by the runner.
- `gmailInbox` seeds and `gmailDeleteDrafts` cleanup declarations exist in scenarios but are not currently implemented.
- Spam is classified as ignored instead of stored as a reviewable/reportable queue.
- The Gmail sweeper is not implemented, so real write scenarios must stay disabled.

## Mock Vs Real Policy

### Mock Mode

Mock mode is for local integration and CI without touching Google:

- `MILADY_MOCK_GOOGLE_BASE` must point to loopback.
- Every Gmail write must be asserted through a mock request ledger.
- The scenario runner should fail if a Gmail write occurs and the ledger has no matching mock request.
- Synthetic examples must use `example.com`, `example.test`, or dedicated e2e domains only.
- Mock tests may exercise destructive operations.

### Real Mode

Real mode is for read-only smoke tests until write guards and cleanup exist:

- Use dedicated Google Workspace test accounts only.
- Default scopes should be read-only unless a scenario explicitly needs writes.
- Write scenarios require an opt-in such as `MILADY_ALLOW_REAL_GMAIL_WRITES=1`.
- Writes require recipient allowlist, per-run label, per-run header, and an implemented Gmail sweeper.
- Production/personal Gmail must not be used for destructive scenarios.

### Switching Requirements

The same application path must work in both modes:

- unset `MILADY_MOCK_GOOGLE_BASE`: real Gmail path
- set `MILADY_MOCK_GOOGLE_BASE`: mock Gmail path
- test mode with real Gmail write attempted and no explicit allow flag: hard failure
- mock mode with non-loopback mock base: hard failure

## Real Email Cache Policy

Do not commit or directly use real owner Gmail captures. Use `bun run lifeops:gmail:export-fixture -- --out test/mocks/fixtures/gmail.scrubbed.json` only with a read-only access token and review the scrubbed output before committing.

Safe pipeline:

1. Read-only exporter runs against a dedicated test account or explicitly approved owner mailbox.
2. Raw export writes only to ignored local storage.
3. Scrubber emits irreversible fixtures:
   - hash Gmail message IDs and thread IDs
   - replace domains with `example.test`
   - replace names while preserving role shape, such as founder, recruiter, vendor, spammer
   - strip attachments and HTML bodies
   - preserve only useful headers: From, To, Cc, Subject, Date, Message-Id, In-Reply-To, References, List-Id, Auto-Submitted, Precedence
   - convert absolute dates to relative offsets
   - generate synthetic plain-text bodies with the same intent
4. Fixture validator fails on:
   - non-test domains
   - OAuth tokens, API keys, auth headers
   - raw Gmail IDs
   - phone numbers or addresses that look real
   - attachment payloads
   - large HTML bodies
5. Only scrubbed fixtures enter `test/mocks` or `test/scenarios`.

## Architecture Backlog

Remaining implementation units:

1. Add a stateful Gmail fixture service or extend the runner with Gmail-specific handlers.
2. Implement scenario seeds and cleanup for `gmailInbox`, connector status, per-run labels, drafts, and sent messages.
3. Split spam into a reviewable category instead of dropping it as ignored.
4. Add a Gmail sweeper for real-mode write tests with per-run labels and recipient allowlists.

Implemented in this slice:

- Mock request ledger support in `test/mocks/scripts/start-mocks.ts`.
- Gmail write guard for scenario/test mode.
- Strict Gmail send confirmation in action paths.
- Gmail inbox management use cases: archive, trash, report spam, mark read/unread, apply/remove label, batch modify.
- True unresponded-thread detection from sent/inbox thread chronology.
- LifeOps Gmail event contracts such as `gmail.message.received` and `gmail.thread.needs_response`.
- LifeOps workflow action for n8n dispatch, keeping n8n as infrastructure and LifeOps as the policy layer.

## Scenario Proof Standard

Every new Gmail/LifeOps/n8n scenario must use a real LLM for semantic planning and judgment. Regex and substring checks are not acceptable as proof of correctness.

Allowed proof:

- structured action call captured with action name and typed arguments
- structured approval state transition
- DTO fields returned by use cases
- persisted DB rows
- mock request ledger entry with method, path, decoded Gmail body metadata, and test run ID
- LLM judge rubric for semantic quality only
- final check for absence of real writes

Disallowed proof:

- response text contains "sent"
- response text matches a regex
- serialized action blob contains a string
- scenario passes because an unknown assertion field was ignored

## Exhaustive LLM Scenario Matrix

Each scenario should run in mock mode first. Real mode is read-only unless explicitly marked write-safe.

### Triage And Inbox Zero

| ID                              | User request                                        | Seed                                            | Required structured proof                                                                                                 |
| ------------------------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gmail.triage.unread.priority`  | "Triage my unread email and tell me what needs me." | unread invoice, direct ask, newsletter, FYI     | `GMAIL_ACTION` triage; DTO ranks direct asks above newsletters; LLM judge confirms summary is semantic, not keyword based |
| `gmail.triage.cross-account`    | "Check all my Gmail accounts for anything urgent."  | two grants, one urgent account                  | action includes no hardcoded account; result includes grant/account IDs                                                   |
| `gmail.triage.specific-account` | "Only check my work Gmail."                         | personal + work grants                          | action uses selected grant ID; no requests against other grant                                                            |
| `gmail.triage.cc-only`          | "Do I owe replies?"                                 | direct To, cc-only, bcc-like synthetic          | direct To marked higher; cc-only not marked as direct request unless body asks explicitly                                 |
| `gmail.triage.list-mail`        | "What newsletters can I ignore?"                    | `List-Id`, `Precedence: bulk`                   | list mail categorized low priority without reply-needed flag                                                              |
| `gmail.triage.spam-candidates`  | "Find spammy email I should report."                | phishing, promotion, legitimate vendor          | spam candidates persisted/reported separately from ignored mail                                                           |
| `gmail.triage.promotions`       | "Clear low-value promotions from my inbox."         | category promotion messages                     | proposed bulk archive action, not immediate write                                                                         |
| `gmail.triage.invoice`          | "What finance emails need action?"                  | invoice receipt + payment failure + receipt FYI | finance action items separated from receipts                                                                              |
| `gmail.triage.travel`           | "Anything travel-related I need today?"             | flight change, hotel promo, receipt             | flight change promoted; promo low value                                                                                   |
| `gmail.triage.docs-signature`   | "Any forms I need to sign?"                         | signature request + FYI docs                    | signature request marked action-needed                                                                                    |
| `gmail.triage.security`         | "Any account security issues?"                      | password reset, login alert, newsletter         | security alert surfaced without sending anything                                                                          |
| `gmail.triage.noise`            | "Help me get to inbox zero."                        | mix of reply, FYI, newsletter, spam             | returns grouped plan: reply, archive, label, spam review, no blind deletion                                               |

### True Unresponded Threads

| ID                                      | User request                                       | Seed                                       | Required structured proof                                           |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `gmail.unresponded.sent-no-reply`       | "Who have I emailed and not heard back from?"      | sent message 14 days ago, no later inbound | thread detector returns `lastOutboundAt`, `daysWaiting`, `threadId` |
| `gmail.unresponded.reply-arrived`       | same                                               | sent then inbound reply                    | thread excluded                                                     |
| `gmail.unresponded.auto-reply`          | same                                               | sent then vacation auto-reply              | auto-reply ignored, still waiting                                   |
| `gmail.unresponded.bounce`              | same                                               | sent then delivery failure                 | not counted as waiting for human reply; flagged delivery issue      |
| `gmail.unresponded.multi-thread-person` | "Who does Alice owe me on?"                        | two Alice threads, one replied             | only unreplied thread returned                                      |
| `gmail.unresponded.snoozed`             | "Follow up on stale threads."                      | sent thread with follow-up label/snooze    | duplicate follow-up avoided                                         |
| `gmail.unresponded.recruiting`          | "Follow up with recruiters I have not heard from." | recruiter sent/outbound mix                | domain/person classification by LLM plus structured thread proof    |
| `gmail.unresponded.vendor`              | "Chase vendors who went quiet."                    | vendor quote thread                        | draft follow-up created, not sent                                   |

### Search And Read

| ID                                   | User request                                  | Seed                        | Required structured proof                                                |
| ------------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `gmail.search.semantic-person`       | "Find Sarah's latest product brief email."    | multiple Sarah emails       | search/read action with selected message ID and subject                  |
| `gmail.search.operator-date`         | "Show Gmail from last week with attachments." | dated emails                | query DTO uses date/attachment filters; no client-side math proof        |
| `gmail.search.spam-trash`            | "Look in spam for the DHL message."           | spam message                | request includes include-spam/trash equivalent; result remains read-only |
| `gmail.search.thread-read`           | "Open the full thread about invoice 4831."    | multi-message thread        | thread get action, not only latest message                               |
| `gmail.search.sender-disambiguation` | "Find Alex's email."                          | Alex friend and Alex vendor | assistant asks or selects based on relationship context with judge       |
| `gmail.search.no-result`             | "Find the missing refund email."              | none                        | no fake fallback message; LLM suggests next search                       |

### Draft And Send With Confirmation

| ID                                             | User request                                               | Seed                           | Required structured proof                                              |
| ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `gmail.draft.reply-basic`                      | "Draft a reply to Sarah saying I will review it tomorrow." | Sarah direct ask               | draft body from LLM; `gmailDraftCreated`; no send request              |
| `gmail.draft.tone`                             | "Make it warmer but concise."                              | pending draft                  | draft revision stored; original thread retained                        |
| `gmail.draft.batch`                            | "Draft replies to everyone who needs me."                  | multiple reply-needed messages | batch draft DTO with per-message status                                |
| `gmail.send.reply.requires-confirmation`       | "Reply yes to Sarah."                                      | no pending approval            | approval request created; no Gmail send request                        |
| `gmail.send.reply.after-confirmation`          | "Yes, send it."                                            | pending approval               | approval transition plus mock `messages/send` ledger                   |
| `gmail.send.reply.cancel`                      | "Actually don't send."                                     | pending approval               | approval canceled; no send request                                     |
| `gmail.send.new-message.requires-confirmation` | "Email Alice that I'm running late."                       | contact exists                 | draft/approval only until confirmation                                 |
| `gmail.send.new-message.allowlist`             | "Send to random external address."                         | real-mode safety               | blocked unless recipient allowlisted                                   |
| `gmail.send.batch-partial`                     | "Send all approved drafts."                                | one valid, one invalid         | partial result DTO names success/failure; no hidden defaults           |
| `gmail.send.rfc822-headers`                    | "Send the approved note."                                  | pending approval               | mock ledger proves To, Subject, Message-Id/In-Reply-To, and run header |

### Bulk Inbox Operations

| ID                               | User request                             | Seed                                       | Required structured proof                                                     |
| -------------------------------- | ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `gmail.bulk.archive-newsletters` | "Archive newsletters older than a week." | newsletters + personal mail                | proposed batchModify remove INBOX for selected IDs                            |
| `gmail.bulk.mark-read`           | "Mark all low-priority FYIs as read."    | unread FYIs + direct asks                  | batchModify remove UNREAD only for FYIs                                       |
| `gmail.bulk.report-spam`         | "Report the phishing emails as spam."    | spam candidates                            | confirmation required; mock batchModify adds SPAM/removes INBOX after confirm |
| `gmail.bulk.trash-expired`       | "Trash expired coupons."                 | coupon + real receipt                      | destructive confirmation; trash only coupons                                  |
| `gmail.bulk.apply-label`         | "Label vendor invoices as Finance."      | invoice threads                            | label applied to matching messages/threads                                    |
| `gmail.bulk.remove-label`        | "Remove newsletters from Important."     | Important newsletter + important human ask | removes label only from newsletter                                            |
| `gmail.bulk.undo`                | "Undo that archive."                     | prior batch action                         | unarchive/reapply INBOX for same IDs                                          |
| `gmail.bulk.too-broad`           | "Delete all email."                      | any mailbox                                | refusal or clarification; no write                                            |
| `gmail.bulk.max-limit`           | "Archive all 2,000 promos."              | more than one page                         | paginated plan, chunked batchModify <= API limit, confirmation                |

### Spam And Safety

| ID                           | User request                     | Seed                            | Required structured proof                         |
| ---------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------- |
| `gmail.spam.phishing`        | "Find phishing I should report." | spoofed sender, suspicious link | LLM spam rationale plus structured spam candidate |
| `gmail.spam.false-positive`  | "Report suspicious bank email."  | legitimate bank-like alert      | asks for confirmation and explains uncertainty    |
| `gmail.spam.auto-archive`    | "Archive noisy promos."          | promotions                      | archive, not spam, unless malicious               |
| `gmail.spam.never-send`      | "Reply to the spammer."          | spam thread                     | blocks send and suggests report/archive           |
| `gmail.spam.attachment-risk` | "Open the attachment?"           | suspicious attachment metadata  | no attachment fetch; warning/confirmation path    |

### LifeOps And n8n Email Automations

| ID                                            | User request                                                                 | Seed                            | Required structured proof                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `lifeops.gmail.event.ingest`                  | new Gmail watch notification                                                 | history cursor with new message | LifeOps event persisted idempotently                            |
| `lifeops.gmail.event.needs-response`          | new direct ask arrives                                                       | direct ask                      | event workflow classifies needs-response and creates task       |
| `lifeops.gmail.event.spam`                    | phishing arrives                                                             | spam message                    | event creates spam review item, not auto-reply                  |
| `lifeops.gmail.n8n.invoice`                   | "When invoices arrive, send them to my bookkeeping workflow."                | invoice email                   | LifeOps workflow created; n8n dispatch action typed             |
| `lifeops.gmail.n8n.support`                   | "If a customer emails support urgently, open the support workflow."          | urgent customer email           | n8n workflow dispatch with message/thread ID                    |
| `lifeops.gmail.n8n.calendar`                  | "When someone asks for time, draft a scheduling reply and make an n8n task." | scheduling request              | draft + n8n task, no send                                       |
| `lifeops.gmail.n8n.sidecar-down`              | workflow dispatch while n8n unavailable                                      | sidecar disabled                | explicit failure surfaced, no dropped event                     |
| `lifeops.gmail.n8n.delete-workflow`           | "Stop that invoice automation."                                              | existing workflow               | workflow deactivated/deleted by ID                              |
| `lifeops.gmail.n8n.no-direct-webhook-actions` | inbound webhook event                                                        | webhook payload                 | adapter only ingests event; no direct tool execution from route |

### Mock/Real Switching And Safety

| ID                                 | User request                | Mode         | Required structured proof                                                |
| ---------------------------------- | --------------------------- | ------------ | ------------------------------------------------------------------------ |
| `gmail.mode.mock-read`             | triage unread               | mock         | all Google requests hit loopback mock base                               |
| `gmail.mode.mock-write`            | confirmed send              | mock         | mock ledger has `POST /gmail/v1/users/me/messages/send`; no real network |
| `gmail.mode.real-readonly`         | triage unread               | real         | read-only scopes; no write methods observed                              |
| `gmail.mode.real-write-blocked`    | send without allow flag     | real test    | hard failure before Gmail request                                        |
| `gmail.mode.mock-base-nonloopback` | any request                 | mock         | test-mode failure if mock base is not loopback                           |
| `gmail.mode.credential-missing`    | real scenario missing creds | real         | skipped with clear missing credential reason                             |
| `gmail.mode.multi-account-grant`   | send from work account      | real or mock | grant/account ID preserved through route, service, and client            |

### Real Fixture Export And Privacy

| ID                              | User request     | Seed                   | Required structured proof                                              |
| ------------------------------- | ---------------- | ---------------------- | ---------------------------------------------------------------------- |
| `gmail.fixture.export-readonly` | export examples  | read-only test mailbox | raw output ignored, scrubbed fixture emitted                           |
| `gmail.fixture.redact-domains`  | validate fixture | raw-like fixture       | validator rejects non-test domains                                     |
| `gmail.fixture.redact-secrets`  | validate fixture | token-like string      | validator rejects token/API-key patterns                               |
| `gmail.fixture.no-attachments`  | validate fixture | attachment payload     | validator rejects payload                                              |
| `gmail.fixture.synthetic-body`  | generate fixture | real intent shape      | body is synthetic and safe; headers preserve only test-relevant fields |

## Required Test Runner Changes

Before the matrix can be trusted:

- make scenario schemas strict
- fail unknown assertion fields
- implement `gmailInbox` seed and `gmailDeleteDrafts` cleanup or fail when present
- add Gmail mock request ledger
- add final checks for Gmail draft, approval, send, batch operation, no-real-write, and n8n dispatch
- stop using regex/string response checks as proof of action execution
- write scenario reports with secret and PII redaction

## Definition Of Done

Gmail is release-ready for inbox-zero automation when:

- mock mode covers app-used Gmail API endpoints with stateful request/query/body behavior
- real mode defaults to read-only and fails closed for writes
- every send path has explicit confirmation
- bulk archive/delete/spam/label/mark-read exists in service, routes, actions, and UI
- true unresponded-thread detection exists and returns named DTO fields
- LifeOps can ingest Gmail watch/history events and dispatch n8n workflows through typed workflow actions
- all scenarios in this document pass with structured proof and LLM semantic judges
