# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-29T04:40:57Z`
- Dispatch cutoff: `2026-08-29T06:40:57Z`
- Protected base before this record: `584a0b61fd0e79502ab2928bef70cbaa6d3638f5`
- Qualified runtime tree: `0834c246430cc6e0c570652e967d61ef2bfc8e43`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: Alice web/companion only; Discord, Telegram, Codex/terminal, public
  social, streaming, trading, funds movement, custody, and signing remain
  disabled.

This append-only record opens the bounded production window required by the
protected-push recovery watchdog after the previous watchdog reached its
terminal cutoff. Runtime code, Worker configuration, dependencies, policy,
capabilities, and submodule pins are unchanged.

The pre-import workflow uses the existing protected branch
`ops/alice-preimport-18372c5-20260828` at merge
`5d703eb609dbbee540199592129971ab3ce796f6`. Its read-only provider steps use
the persistent account-owned Alice credential while production mutation keeps
the independently bound deployment credential.

No persistent staging infrastructure is provisioned. The workflow's Cloudflare
registry tag and any temporary provider resources are removed on terminal
success or failure. The window is complete only after exact image/import and
manifest evidence, authenticated owner health/chat/session/PAUSE/provenance
acceptance, and rollback/forward restoration are proven.
