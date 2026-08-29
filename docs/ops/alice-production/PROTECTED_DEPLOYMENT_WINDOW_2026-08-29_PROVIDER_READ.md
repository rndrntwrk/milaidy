# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-29T06:31:15Z`
- Dispatch cutoff: `2026-08-29T08:31:15Z`
- Protected base before this record: `10e24d761dfb24ca18d31f13307fd5bec71406dc`
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
`caff8ad2c310a5e02630a39cc2c810a4d776964e`. Its read-only provider boundary
emits sanitized operation, HTTP status, and Cloudflare error-code evidence,
retries only a schema-valid Cloudflare HTTP 503 envelope without a numeric
provider code, and otherwise fails closed before mutation.

No persistent staging infrastructure is provisioned. The workflow's Cloudflare
registry tag and temporary environment policies are removed on terminal
success or failure. The window is complete only after exact image/import and
manifest evidence, authenticated owner health/chat/session/PAUSE/provenance
acceptance, and rollback/forward restoration are proven.
