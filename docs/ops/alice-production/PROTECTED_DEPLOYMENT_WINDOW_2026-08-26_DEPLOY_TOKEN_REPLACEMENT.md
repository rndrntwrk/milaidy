# Alice protected deploy-token replacement window

- Owner: Alice production deployment worker
- Opened: `2026-08-26T04:09:15Z`
- Dispatch cutoff: `2026-08-26T05:39:15Z`
- Expires: `2026-08-26T08:09:15Z`
- Protected base before this record: `22bc5e30801258679549e878067111c8b68ea9d7`
- Qualified protected tree before this record: `5911df16efd71dda75e1961f962ee9943e510537`
- Qualified runtime tree: `854d1ccf28dbe4f42555dc10b0afd14d818bd030`
- Canonical Eliza pin: `a21d401bf7429bc8c794698b20832512b5315187`

This append-only record opens one bounded production re-entry window after
deployment `32927478958` stopped before provider mutation because the exact
Alice production Cloudflare deploy credential had expired. The expired token
was replaced under the same bounded account, zone, and permission contract;
the `alice-production/CLOUDFLARE_API_TOKEN` secret metadata advanced at
`2026-08-26T04:05:17Z`; and the expired provider row was removed. No bearer is
stored in this record or in the source tree.

A new attempt-1 push watchdog, one exact-source immutable build, fresh provider
materialization, one matching ProgramEnvelope signature/install, and one
protected deployment are required. No prior watchdog readiness, build,
materialization, signature, or failed deployment is reused.

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
