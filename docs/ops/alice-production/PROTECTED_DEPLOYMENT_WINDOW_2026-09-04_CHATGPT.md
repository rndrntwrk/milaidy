# Alice ChatGPT production deployment window

- Owner: Alice production deployment worker
- Opened: `2026-09-04T19:30:00Z`
- Dispatch cutoff: `2026-09-04T21:30:00Z`, subject to the earlier live watchdog cutoff
- Protected base: `63ece25054cba7010c6eed7e6df739676975eaef`
- Qualified source tree: `8b45182f476435a6f4a957462dc068b15dd5c82d`
- Canonical reviewed elizaOS pin: `aa5f9c05c585cbc03bb72f9509e504d544531f3a`
- Target: complete Milady Companion with Alice ChatGPT subscription login,
  encrypted durable authentication, Luna for everyday responses, and Sol for
  planning and complex work, with maximum reasoning for both.

Build `33891347196` passed image provenance and candidate smoke at
`2026-09-04T16:25:06Z`. Its operator handoff did not start pre-import before
watchdog `33891170876` expired at `2026-09-04T17:53:41Z`. The build itself was
successful. No deployment was dispatched for that window.

The existing release contract requires a protected push, an attempt-1 active
watchdog, and identical build/deployment source commits. This documentation-only
successor opens that established window. Runtime code, Worker configuration,
dependencies, policy, capabilities, plugins, UI, and submodule pins remain
unchanged. The prior source-bound build and expired watchdog cannot be reused.

The protected merge must start one watchdog and be followed by exactly one
rollout-disabled build. After image, Worker artifact, attestations, and candidate
smoke pass, dispatch one pre-import while at least 30 minutes of watchdog runway
remain. Materialize the final manifest before signing its matching ProgramEnvelope,
then dispatch one protected deployment. Preserve the independent recovery path.

Completion requires authenticated Companion access, ChatGPT owner login, a real
Luna response and Sol planning response, persistent login/session after a cold
restart, and the existing health, pause, provenance, rollback, and forward-restore
acceptance. No new staging baseline is provisioned. Modal, Railway, channels,
public posting, trading, custody, and funds movement remain outside this change.
