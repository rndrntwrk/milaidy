# Alice protected production deployment window successor

- Owner: Alice production deployment worker
- Opened: `2026-08-30T18:41:45Z`
- Dispatch cutoff: `2026-08-30T20:41:45Z`
- Protected base before this record: `d8bf96447abfb7f06129fbcdcf59738369ad8546`
- Qualified runtime tree: `868a25b29530abe467429f8bce0bdb82a278c500`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because build
`33323246441` completed successfully after watchdog `33323223881` had less
than the required 30-minute pre-import runway remaining. That watchdog and
build are not reused for deployment. Runtime code, Worker configuration,
dependencies, policy, capabilities, plugins, UI, and submodule pins are
unchanged from the qualified base above.

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
