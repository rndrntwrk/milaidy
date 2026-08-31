# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-31T02:33:00Z`
- Dispatch cutoff: `2026-08-31T04:33:00Z`
- Protected base before this record: `86af1e8a27e439c013c273f4da4bb18dd7a6209b`
- Qualified runtime tree: `69d6e9af99a52ebe7c23cd7a927099033a23152f`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because watchdog
`33345798979` no longer had the required 30-minute recovery reserve after the
exact-source build `33346381393` completed. That build's immutable image,
provenance, and full-gated Companion/chat smoke were terminal GREEN. During the
same window, the previously absent owner-acceptance authorization was renewed
through the admitted Cloudflare Access One-time PIN flow on the enrolled WARP
device, validated against the exact owner/audience contract, and installed in
the Cloudflare recovery acceptance environment. No Alice Worker, Container,
route, runtime, or traffic mutation occurred.

Runtime code, Worker configuration, dependencies, policy, capabilities,
plugins, UI, and submodule pins are unchanged from the qualified runtime tree.
The expired-reserve watchdog and its source-bound build are not reused across
the successor protected source identity.

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
