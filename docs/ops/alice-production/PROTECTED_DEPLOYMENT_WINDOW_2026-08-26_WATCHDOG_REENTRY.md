# Alice protected watchdog-reentry deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-26T02:30:10Z`
- Dispatch cutoff: `2026-08-26T04:00:10Z`
- Expires: `2026-08-26T06:30:10Z`
- Protected base before this record: `0fa90af78306af4965f8c87effefbaed355f4f6a`
- Qualified protected tree before this record: `854d1ccf28dbe4f42555dc10b0afd14d818bd030`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`

This append-only record opens one bounded production re-entry window after the
preceding attempt-1 recovery watchdog reached its terminal timeout without an
eligible parent deployment. The prior deployment was never dispatched. A new
attempt-1 push watchdog, exact-source immutable build, fresh provider
materialization, matching ProgramEnvelope, and one protected deployment are
required; prior watchdog readiness and prior materialization are not reused.

This record changes no runtime code, checked-in runtime or Worker
configuration, dependency, policy, capability, submodule pin, or qualified
runtime bytes. Alice web core is the only live activation in scope. Discord,
Telegram, ChatGPT/Codex account login, Codex terminal or workspace access,
public social, streaming, trading, funds movement, custody, and economic
signing remain disabled.

No staging infrastructure is provisioned. GitHub owns the ephemeral build and
smoke runners; workflow cleanup removes candidate containers and local
artifacts. Exactly one immutable build and one protected deployment may be
dispatched for this protected source. Dispatch after the cutoff is invalid.

The window is complete only when the exact protected source has one immutable
image and Worker-bundle build, fresh provider materialization succeeds, the
installed ProgramEnvelope binds the exact deployment-manifest digest, the
protected deployment is terminal, and authenticated owner
health/chat/session/pause/provenance acceptance plus rollback/forward recovery
are proven. A merge, build, signature, or submitted deployment is not
completion evidence.
