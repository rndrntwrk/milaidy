# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-31T00:49:29Z`
- Dispatch cutoff: `2026-08-31T02:49:29Z`
- Protected base before this record: `6295d055df85fcfb561bf52544501f2e23f8032c`
- Qualified runtime tree: `69d6e9af99a52ebe7c23cd7a927099033a23152f`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because watchdog
`33343841032` stopped before deployment at its read-only Cloudflare recovery
credential gate. The recovery token remained active; its separate policy-reader
token had expired. A persistent replacement policy-reader with exactly User API
Tokens Read is now active and bound only to the recovery environment. No Alice
Worker, Container, route, runtime, or traffic mutation occurred.

Runtime code, Worker configuration, dependencies, policy, capabilities,
plugins, UI, and submodule pins are unchanged from the qualified runtime tree.
The failed watchdog and in-flight source-bound build `33343868136` are not
reused across the successor protected source identity.

The successor protected push must create exactly one fresh attempt-1 recovery
watchdog. Its Cloudflare recovery credential/readback gate must complete before
exactly one rollout-disabled exact-source build is dispatched. Pre-import may
start only after that build's immutable Worker artifact, GHCR image,
provenance, and full candidate smoke are terminal GREEN with at least the
required 30-minute watchdog runway remaining.

No persistent staging infrastructure is provisioned. The pre-import workflow
may perform only its admitted exact Container registry import and inactive
Access Worker-version upload before the protected deployment. The window is
complete only after authenticated owner health, conversation, durable session
recovery, PAUSE_ALL, serving provenance, rollback, and forward restoration are
proven for the complete Companion surface.
