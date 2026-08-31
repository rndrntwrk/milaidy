# Alice protected production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-08-31T05:41:30Z`
- Dispatch cutoff: `2026-08-31T07:41:30Z`
- Protected base before this record: `9e2463218211d922337328a48fb1b502cd0c7f9b`
- Qualified runtime tree: `69d6e9af99a52ebe7c23cd7a927099033a23152f`
- Canonical Eliza pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`
- Scope: complete Milady runtime and Companion UI with all Alice feature and
  plugin code installed. Consequential external side effects remain disabled
  or policy-gated at runtime. Discord, Telegram, public social, streaming,
  trading, funds movement, custody, and signing remain inactive for this web
  acceptance. Cloudflare Containers is the admitted always-on runtime; Modal
  and Railway are excluded from this launch path.

This append-only record opens one successor production window because deploy
`33360665215` stopped at its first identity gate before any provider mutation.
The dispatched `policy_hash` lost its final hexadecimal character and was
correctly rejected as a 63-character value. The immutable pre-import manifest
and signer both preserve the canonical value
`sha256:d91ec341a4955e0a8189c81ebe525dc3cf28f78f5da919685e66179e8adaab5a`.
Independent recovery and the push watchdog completed successfully as no-ops
because no rollback anchor or production mutation existed.

Runtime code, Worker configuration, dependencies, policy, capabilities,
plugins, UI, and submodule pins are unchanged from protected base
`9e2463218211d922337328a48fb1b502cd0c7f9b`. The successor dispatch must derive
the policy hash directly from its immutable pre-import manifest, validate the
complete `sha256:` plus 64-lowercase-hex value, and pass those bytes unchanged;
manual digest transcription is prohibited.

The protected push for this document must create exactly one fresh attempt-1
recovery watchdog. Exactly one rollout-disabled exact-source build may follow.
The previous source-bound build, pre-import, signature, and failed deploy are
not reused across the successor protected source identity.

No persistent staging infrastructure is provisioned. The pre-import workflow
may perform only its admitted exact Container registry import and inactive
Access Worker-version upload before the protected deployment. The window is
complete only after authenticated owner health, conversation, durable session
recovery, PAUSE_ALL, serving provenance, rollback, and forward restoration are
proven for the complete Companion surface.
