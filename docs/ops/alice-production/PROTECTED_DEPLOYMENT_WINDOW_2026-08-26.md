# Alice protected deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-26T02:32:00Z`
- Dispatch cutoff: `2026-08-26T04:02:00Z`
- Expires: `2026-08-26T06:32:00Z`
- Protected base before this record: `0fa90af78306af4965f8c87effefbaed355f4f6a`
- Qualified protected tree before this record: `854d1ccf28dbe4f42555dc10b0afd14d818bd030`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`
- Prior exact build: `32916884657` attempt `1`
- Prior Worker artifact digest: `sha256:0c491d0a4542c0baa4109bf08413caa03ce58adc54616b696630de808f7b2c82`
- Prior runtime image: `ghcr.io/rndrntwrk/milaidy-agent@sha256:5de66a3f903b529b813a3fc2b4d064c87e4cd7b471de86ec8aeb01fe72b7d4ad`
- Preserved manifest digest: `sha256:6bb4da57fff173a1eca7609cd098c567501e12441325d4a459efda247ddbbc30`
- Preserved provider readback digest: `sha256:de0fad2dc3e8f8d325826254b3343cf871333417a05df0ab0c6ad806f2c65b36`

This append-only record opens one bounded production window after recovery
watchdog `32916836587` exhausted its parent-selection window before a deployment
was dispatched. The failed watchdog produced no readiness artifact and no
provider mutation. Its expiry requires one fresh protected-push attempt-1
watchdog and one exact-source rollout-disabled build before deployment.

This record changes no runtime code, checked-in runtime or Worker
configuration, dependency, policy, capability, secret, provider resource, or
Eliza pin. The protected source identity advances only because GitHub does not
emit a new push watchdog for an unchanged commit. The prior manifest and
provider readback are preserved as evidence; the new source/build tuple must be
freshly materialized and signed before deployment.

Alice web core is the only live activation in scope. Discord, Telegram,
ChatGPT/Codex account login, Codex terminal or workspace access, public social,
streaming, trading, funds movement, custody, and economic signing remain
disabled.

No staging infrastructure is provisioned. GitHub owns the ephemeral build and
smoke runners; workflow cleanup removes candidate containers and local
artifacts. Dispatch after the cutoff is invalid and requires an explicit new
window rather than an extension.

The window is complete only when the exact protected source has one immutable
image and Worker-bundle build, the installed ProgramEnvelope binds the exact
fresh deployment-manifest digest, the protected deployment is terminal, and
authenticated owner health/chat/session/PAUSE_ALL/provenance acceptance plus
rollback and forward restoration are proven. A merged pull request, build,
signed envelope, or submitted deployment alone is not completion evidence.
