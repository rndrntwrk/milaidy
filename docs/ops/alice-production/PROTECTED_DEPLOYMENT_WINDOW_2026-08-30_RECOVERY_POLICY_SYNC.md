# Alice protected production deployment window after recovery-policy sync

- Owner: Alice production deployment worker
- Opened: `2026-08-30T22:31:54Z`
- Dispatch cutoff: `2026-08-31T00:31:54Z`
- Protected base before this record: `a6e7a6516418e7ca92c150bd82b3204abc2234b7`
- Qualified runtime tree: `69d6e9af99a52ebe7c23cd7a927099033a23152f`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because
watchdog `33334639177` rejected the stale recovery-provider policy fingerprint
after the existing recovery token was renewed in place. The token identity,
permissions, resources, secret binding, and active status are unchanged. The
provider-policy fingerprint and its enclosing GitHub recovery-policy digest
were refreshed to the exact post-renewal provider state before this record.

Deploy `33338905802` stopped at its source/build identity gate because the
watchdog had already failed. It crossed no mutation cutoff and changed no
Worker, Container, route, production traffic, or runtime state. The
independent recovery job completed as a verified no-op.

Runtime code, Worker configuration, dependencies, policy, capabilities,
plugins, UI, and submodule pins are unchanged from the qualified base above.
No prior terminal watchdog, build, pre-import artifact, ProgramEnvelope, or
failed deployment is reused across a different protected source identity.

The successor protected push must create exactly one fresh attempt-1 recovery
watchdog and exactly one rollout-disabled exact-source build. After recovery
readiness and that build are GREEN, this window admits one exact
pre-import/materialization, one matching ProgramEnvelope installation, and one
protected deployment. No persistent staging infrastructure is provisioned.

The window is complete only after authenticated owner health, conversation,
durable session recovery, PAUSE_ALL, serving provenance, rollback, and forward
restoration are proven for the complete Companion surface.
