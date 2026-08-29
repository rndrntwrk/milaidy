# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-29T02:26:00Z`
- Dispatch cutoff: `2026-08-29T04:26:00Z`
- Protected base before this record: `2c017a4261f463ca5924cb672e82e07737ef1bb3`
- Qualified runtime tree: `0834c246430cc6e0c570652e967d61ef2bfc8e43`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: Alice web/companion only; Discord, Telegram, Codex/terminal, public
  social, streaming, trading, funds movement, custody, and signing remain
  disabled.

This append-only record opens the bounded production window required by the
protected-push recovery watchdog. Runtime code, Worker configuration,
dependencies, policy, capabilities, and submodule pins are unchanged.

The pre-import workflow uses the existing protected branch
`ops/alice-preimport-18372c5-20260828` with its exact timeout correction
(merge `bb2f4a7720050d65051f2de2478adbda80d23ed6`). The immutable image and
Worker artifact must remain bound to the exact source/build identities passed
to the workflow.

No persistent staging infrastructure is provisioned. The workflow's Cloudflare
registry tag and any temporary provider resources are removed on terminal
success or failure. The window is complete only after exact image/import and
manifest evidence, authenticated owner health/chat/session/PAUSE/provenance
acceptance, and rollback/forward restoration are proven.
