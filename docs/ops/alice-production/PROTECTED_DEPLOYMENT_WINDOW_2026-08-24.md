# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-24T16:45:44Z`
- Dispatch cutoff: `2026-08-24T18:15:44Z`
- Protected base before this record: `ef1eb4eec7a96857c1a28fcd20ddba73239e1656`
- Qualified runtime tree: `8bafb6473d920ae746321521fd11cc6e0cadba56`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`

This record opens the bounded production window required by the protected-push
recovery watchdog. It changes no runtime code, Worker configuration,
dependency, policy, capability, or submodule pin. Alice web core is the only
live activation in scope; Discord, Telegram, Codex/terminal, public social,
streaming, trading, funds movement, custody, and signing remain disabled.

No staging infrastructure is provisioned. GitHub owns the ephemeral build and
smoke runners; their workflow cleanup removes candidate containers and local
artifacts. Each independent recovery job has a 240-minute total hard timeout,
including setup and up to 360 15-second parent-selection attempts (about 90
minutes). Only the remaining job time is available after selection. Dispatch
after the recorded cutoff is invalid and requires a new protected production
window.

The window is complete only when the exact protected source has one immutable
image and Worker-bundle build, the signed release binds the effective Worker
and provider configuration fingerprints, the authenticated owner
health/chat/session/recovery/pause/provenance canary is terminal, and the
rollback/forward exercise has been proven. A merged pull request, build, or
submitted deployment alone is not completion evidence.
