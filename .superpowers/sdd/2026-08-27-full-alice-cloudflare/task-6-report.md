# Task 6 — Connectors and Companion Durable Surface Report

## Source boundary

- Base: `a52122848bb9eb0e74c60b2a3fc8e9678cf210db`
- Branch: `feature/alice-connectors-companion-2026-08-27`
- Source-only: no provider mutation, message, token operation, deployment, push,
  or pull request.
- Existing Companion, Alice 9 VRM, PiP, emote, Go Live, broadcast, and plugin
  source is preserved. This slice adds durable state and private activation
  boundaries; it does not replace those surfaces.

## Implemented contract

1. Companion and `/broadcast/alice-cam` read the same stage record from the
   private Task 3 state-plane boundary. Authenticated stage writes persist
   before their WebSocket broadcast. Cloud configuration is fail-closed;
   local development retains the existing file fallback.
2. A private, unrouted `alice-connector-plane` Worker holds the existing
   provider credential names `DISCORD_API_TOKEN`, `DISCORD_APPLICATION_ID`,
   and `TELEGRAM_BOT_TOKEN`. The Milady Container never receives the bot
   tokens through this design.
3. Discord and Telegram activate only with provider-shaped credentials and one
   exact private destination each. A wrong destination or public Telegram
   channel/group identifier is rejected before authorization and transport.
4. Connector bot identity, inbound cursor, and inbound/outbound receipts are
   canonical Task 3 records. Inbound identity/cursor/receipt writes are one
   explicit atomic group and the Task 3 per-owner/session Durable Object cursor
   is advanced after the canonical commit.
5. Outbound provider egress requires an exact `social.message` intent whose
   target and argument hash match the channel, private destination, operation
   ID, and message. The private Worker delegates the decision to the Task 5
   control-plane service; anything other than exact
   `CAPABILITY_AUTHORIZED` remains inert.
6. A per-owner/channel Durable Object records the outbound claim before any
   provider request. Completed replays do not resend; pending replays remain
   fail-closed as uncertain; different-digest operation-ID reuse is rejected.

## TDD evidence

- RED: Companion remote store module absent; durable route injection absent.
- RED: connector core/Worker/config absent (`0 pass`, `2 fail`, `1 import
  error`).
- RED: repeated stage writes reused one Task 3 idempotency key; fixed by
  binding the claim to timestamp plus payload.
- RED: wrong configured bot identity was admitted; fixed by exact Discord
  application-ID / Telegram token-ID binding.
- GREEN: Companion store/route focused suite `6 pass`, `0 fail`, `23
  assertions`; Companion/UI/security adjacent suite `31 pass`, `0 fail`, `142
  assertions`.
- GREEN: Connector focused suite `10 pass`, `0 fail`, `44 assertions`.
- GREEN: Connector TypeScript strict typecheck.
- GREEN: Wrangler dry run, private service bindings and Durable Object resolved;
  `23.84 KiB` upload / `5.47 KiB` gzip, no deploy.

## Residual live gates

- Task 5 must expose and independently qualify the private
  `/control/internal/v1/connectors/authorize` grant-consumption boundary. The
  current connector Worker calls it and fails closed while it is absent.
- Integration must map the Milady Container's internal Companion/connector
  clients to the state/connector service bindings without exposing bot or
  service tokens. The root integration owns the full Eliza state bridge.
- Production must provision the three existing provider credential names, two
  exact private destination IDs, private service tokens, D1/DO bindings, and
  run one allowlisted inbound/outbound E2E per channel. No live credential or
  destination was exercised here.
- Custom VRM/background blob externalization belongs to the full Task 3 R2
  state bridge; this slice makes the shared Companion/broadcast camera stage
  durable and does not claim custom filesystem assets survive replacement.
