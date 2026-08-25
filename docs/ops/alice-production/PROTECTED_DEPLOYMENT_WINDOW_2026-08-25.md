# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-25T06:45:36Z`
- Dispatch cutoff: `2026-08-25T08:15:36Z`
- Expires: `2026-08-25T10:45:36Z`
- Protected base before this record: `52093d513e4ebe936c57cf021143b196d94e4874`
- Qualified runtime tree: `8183672ec2438fb8eccbf63cf30a151549e30efc`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`

This append-only record opens the bounded production window required by the
protected-push recovery watchdog. It changes no runtime code, checked-in
runtime or Worker configuration, dependency, policy, capability, or submodule
pin. The previously authorized owner-identity environment correction is not
encoded in this source tree.

Alice web core is the only live activation in scope. Discord, Telegram,
ChatGPT/Codex account login, Codex terminal or workspace access, public social,
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
