# Alice protected edge-pause-v2 deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-25T21:27:47Z`
- Dispatch cutoff: `2026-08-25T22:57:47Z`
- Expires: `2026-08-26T01:27:47Z`
- Protected base before this record: `e4f15c5bf424f01290d4c20696642f3f4eeebe8a`
- Qualified protected tree before this record: `05e743f9357f44a818d4c97b294d0bb3911caec6`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`

This append-only record opens one bounded production window after the
edge-serving PAUSE barrier repair was merged and qualified. The approved
same-day, read-only Cloudflare materialization token was created and verified
before this window opened so the human confirmation boundary cannot consume
the protected-push watchdog selection window.

This record changes no runtime code, checked-in runtime or Worker
configuration, dependency, policy, capability, submodule pin, or qualified
runtime bytes. Alice web core is the only live activation in scope. Discord,
Telegram, ChatGPT/Codex account login, Codex terminal or workspace access,
public social, streaming, trading, funds movement, custody, and signing remain
disabled.

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
