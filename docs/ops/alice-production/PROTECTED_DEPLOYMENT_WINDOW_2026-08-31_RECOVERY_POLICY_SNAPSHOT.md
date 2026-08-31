# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-31T13:32:00Z`
- Dispatch cutoff: `2026-08-31T15:32:00Z`
- Protected base before this record: `b067edda9ef7c8c2029cb02f674a5288c2ee148a`
- Qualified runtime tree: `0c28c1d25345ac09b5baf51c14ce39fc2cc550b9`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because watchdog
`33390341904` began before the refreshed Cloudflare recovery-policy variables
were installed in the GitHub recovery environment. GitHub correctly preserved
the job-start snapshot, so the watchdog rejected that stale policy with
`ALICE_RECOVERY_CREDENTIAL_BINDING_INVALID` when deploy `33397165759` appeared.
The deploy stopped at its first identity gate before rollback anchoring, Worker
or Container promotion, route changes, runtime start, or public traffic
mutation. Independent recovery completed as a no-op because no mutation had
occurred.

The existing recovery token is active with the exact reviewed provider policy,
and both authoritative recovery-policy variables were refreshed before this
record. Runtime code, Worker configuration, dependencies, policy, capabilities,
plugins, UI, and submodule pins are unchanged from the qualified runtime tree.
The stale-snapshot watchdog, source-bound build, pre-import, ProgramEnvelope,
and failed deploy are not reused across the successor protected source
identity.

The protected push for this document must create exactly one fresh attempt-1
recovery watchdog after the corrected environment binding. Its recovery
credential/provider readback must complete before exactly one rollout-disabled
exact-source build is dispatched. Pre-import must use only that fresh watchdog
and build, and the ProgramEnvelope must be signed only for the resulting exact
manifest.

No persistent staging infrastructure is provisioned. The pre-import workflow
may perform only its admitted exact Container registry import and inactive
continuity preprovisioning before the protected deployment. The window is
complete only after authenticated owner health, conversation, durable session
recovery, PAUSE_ALL, serving provenance, rollback, and forward restoration are
proven for the complete Companion surface.
