# Alice protected ProgramEnvelope deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-25T11:45:00Z`
- Dispatch cutoff: `2026-08-25T13:15:00Z`
- Expires: `2026-08-25T15:45:00Z`
- Protected base before this record: `bbc98d2d27711afd112e1ffb83b568fc7a6101ce`
- Qualified protected tree before this record: `ec8ac3fed0bcb8f7d37a7791bc260e67a3fc4912`
- Qualified runtime baseline: `52093d513e4ebe936c57cf021143b196d94e4874`
- Qualified runtime tree: `8183672ec2438fb8eccbf63cf30a151549e30efc`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`

This append-only record opens one bounded production window required to obtain
a fresh protected-push recovery watchdog after deployment run `32832436695`
stopped before provider promotion. Its only purpose is to execute the corrected
release-input order: build the exact protected source, materialize the signed
deployment manifest, sign and install the ProgramEnvelope for that exact
manifest digest, verify equality, and dispatch one protected deployment.

This record changes no runtime code, checked-in runtime or Worker
configuration, dependency, policy, capability, submodule pin, or qualified
runtime bytes. The previously authorized owner-identity environment correction
is not encoded in this source tree.

Alice web core is the only live activation in scope. Discord, Telegram,
ChatGPT/Codex account login, Codex terminal or workspace access, public social,
streaming, trading, funds movement, custody, and signing remain disabled.

No staging infrastructure is provisioned. GitHub owns the ephemeral build and
smoke runners; workflow cleanup removes candidate containers and local
artifacts. Dispatch after the cutoff is invalid and requires an explicit new
authorization rather than extending this window.

The window is complete only when the exact protected source has one immutable
image and Worker-bundle build, the installed ProgramEnvelope binds the exact
materialized deployment-manifest digest, the protected deployment is terminal,
and the authenticated owner health/chat/session/pause/provenance canary plus
rollback/forward exercise are proven. A merged pull request, build, signed
envelope, or submitted deployment alone is not completion evidence.
