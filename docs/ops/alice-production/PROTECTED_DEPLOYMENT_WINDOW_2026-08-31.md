# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-31T00:09:06Z`
- Dispatch cutoff: `2026-08-31T02:09:06Z`
- Protected base before this record: `3c38d5e495a06082b6acf83bd1c2a0cb20da19f8`
- Qualified runtime tree: `69d6e9af99a52ebe7c23cd7a927099033a23152f`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because the
exact image build `33339576238` completed after watchdog `33339535480` had
insufficient remaining runway for pre-import. Pre-import `33343512941` stopped
at its minimum-runway identity gate before image import, Worker upload, route
change, runtime start, or public traffic mutation.

Runtime code, Worker configuration, dependencies, policy, capabilities,
plugins, UI, and submodule pins are unchanged from the qualified runtime tree.
The expired watchdog, completed build, and failed pre-import are not reused
across the new protected source identity.

The successor protected push must create exactly one fresh attempt-1 recovery
watchdog and exactly one rollout-disabled exact-source build. Pre-import may
start only after that build's immutable Worker artifact, GHCR image,
provenance, and full candidate smoke are terminal GREEN with at least the
required 30-minute watchdog runway remaining.

No persistent staging infrastructure is provisioned. The pre-import workflow
may perform only its admitted exact Container registry import and inactive
Access Worker-version upload before the protected deployment. The window is
complete only after authenticated owner health, conversation, durable session
recovery, PAUSE_ALL, serving provenance, rollback, and forward restoration are
proven for the complete Companion surface.
