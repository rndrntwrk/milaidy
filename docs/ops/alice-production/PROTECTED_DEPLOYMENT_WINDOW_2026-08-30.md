# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-30T08:42:37Z`
- Dispatch cutoff: `2026-08-30T10:42:37Z`
- Protected base before this record: `d95b90143912fe4bf93b87d2922f3f86dbfe38b0`
- Qualified runtime tree: `fd904c3f1c2149355490b73673490bd75aefaf17`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because the
previous attempt-1 watchdog's required 30-minute pre-import runway elapsed
while its exact immutable image build was still in progress. The expired
watchdog and its build are not reused for deployment. Runtime code, Worker
configuration, dependencies, policy, capabilities, plugins, UI, and submodule
pins are unchanged.

The successor protected push must create exactly one fresh attempt-1 recovery
watchdog and exactly one rollout-disabled exact-source build. Pre-import may
start only after that build's immutable Worker artifact, GHCR image,
provenance, and full candidate smoke are terminal GREEN.

No persistent staging infrastructure is provisioned. The pre-import workflow
may perform only its admitted exact Container registry import and inactive
Access Worker-version upload before the protected deployment. The window is
complete only after authenticated owner health, conversation, durable session
recovery, PAUSE_ALL, serving provenance, rollback, and forward restoration are
proven for the complete Companion surface.
