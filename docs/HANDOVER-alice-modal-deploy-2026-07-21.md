# Alice Modal Deploy Handover (2026-07-21)

Read this to finish putting the accepted Alice release candidate live on Modal.
Companion doc: `HANDOVER-alice-continuity-2026-07-20.md` (the branch topology and
Tasks 0-9 record). This doc is the deploy leg (Task 11) and its one open blocker.

## 1. One-line status

The accepted release candidate is fully staged and proven; the deploy is one
credential away. The ONLY blocker is an R2 object-write credential on the
Cloudflare account. Everything else is committed and reproducible.

## 2. The single blocker (resolve this first)

Uploading the release artifact to R2 needs **R2 object-write**, which the
current Cloudflare authorizations do NOT carry:
- wrangler is logged into the correct account (`036df6c823669b8fa2f66cf4c16eeb29`,
  Gl4sspr1sm@gmail.com) but its OAuth has no R2 scope, and `wrangler login`'s
  scope list offers no R2 option.
- The Cloudflare MCP session (OAuth, same account) returns `10042` on every R2
  call. An OAuth grant is control-plane only; it does not include R2 data-plane
  writes. Account and bucket are correct (founder confirmed 2026-07-21); the
  grant type is the gap.
- No R2 S3 credential exists on disk (only `.example` templates), none in Modal
  secrets, none in any Railway project variable (all swept).

**Secure unblock (the only one that does not print a secret into chat):**
founder creates an R2 API token in the dashboard (R2 -> Manage R2 API Tokens ->
Create -> "Object Read & Write", all buckets) and saves the token VALUE into
`~/.sw4p-cf/r2-write-token`. A credential handed back through the MCP would print
into the transcript (violates the no-secrets rule), so it must land in a local
file directly.

Alternative that needs nothing from the founder (rejected 2026-07-21, founder
wants the Cloudflare path kept): bake the artifact into the private Modal image
with `add_local_file` and drop R2 + encryption from `alice_runtime.py` entirely.

## 3. What is committed and done

- **Recovery candidate (milaidy):** `release/alice-livestream-recovery-2026-07-18`
  @ `3294f8e11` (pushed, remote origin). Restored LifeOps routes + operator
  actions, companion public-route exemption, mobile+landscape Go Live header
  fix, accepted local visual evidence. This is what must go live.
- **Modal rail (555 ROOT repo):** branch `docs/555-community-airdrop-strategy`,
  remote `docs` (github Render-Network-OS/docs), tip `fe48a6b0a`. Contains:
  - `scripts/awsless/modal/alice_runtime.py` - runtime launcher. Reconciled:
    inline emote source patch, 4h timeout (`timeout=14400`), and
    `SCRIPTS = /build/src/555-bot/milaidy/scripts` (uses the milaidy tree's OWN
    proven build scripts; the standalone 555-bot/scripts copies had drifted up
    to 274 lines and would not reproduce the recovery build).
  - `scripts/awsless/modal/alice_capture_service.py` - scale-to-zero singleton
    capture, precomputes the companion fragment-token target.
  - `scripts/awsless/modal/build-alice-artifact.sh` - reproducible artifact
    builder (see section 5).
  - `scripts/awsless/modal/test_alice_modal_contract.py` - static contract
    tests, 5/5 (run: `~/.venvs/modal/bin/python -m pytest ...`).
  - `docs/awsless/modal-alice-runbook-2026-06-27.md` - section 9 is the
    release-candidate gate (SPA-serving mechanism + fresh-key mandate).
  - **WORKING-TREE change (uncommitted):** `alice_runtime.py` has
    `EXPECTED_SHA = "788cd34e..."`. THIS IS ORPHANED - it points at an artifact
    that was pruned (section 4). Do not commit it as-is; re-derive the sha from
    a freshly built artifact and replace it.
- **555stream sidecar:** `fix/alice-modal-livestream-2026-07-18` @ `633acf96`
  (remote `stream`). Capture hardening (auth, redaction, HTTP-only, filtergraph
  regression) + `CAPTURE_DEFAULT_TARGET_URL` fallback. Tests 43/43 + 23/23.

## 4. What is EPHEMERAL and must be regenerated (all pruned)

The scratchpad and both `/tmp/alice-*` assemblies were cleaned. Gone:
- The clean `3294f8e11` hydrated assembly.
- The 4 encrypted artifact chunks (`alice.enc.part0..3`, ~952M).
- The artifact meta with the FRESH aes key/iv and the tarball sha `788cd34e...`.

Consequence: the staged `EXPECTED_SHA=788cd34e...` no longer matches any
artifact (tar+gzip is not byte-reproducible and keys are minted per run). The
next session must rebuild the artifact and take the NEW sha from the new meta.

## 5. Full deploy sequence (once `~/.sw4p-cf/r2-write-token` exists)

Repo root: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555`. Toolchain:
Node 22.22.0 (`nvm use 22.22.0`), isolated bun 1.3.10, Modal authed as
`rndrntwrk` (there is currently NO alice app deployed - clean deploy).

1. **Hydrate clean `3294f8e11`** into a fresh assembly (Task 1 Step 5 recipe;
   the prior run used a scratchpad script `hydrate-clean-3294f8e11.sh` -
   re-create it: git worktree add --detach the tip, archive the eliza pin
   `17930c97b9` into `eliza/`, then resolve-missing-workspaces -> pin-runtime-deps
   -> bun install --ignore-scripts --linker=hoisted -> apply patches ->
   ensure-generated-types -> patch-bun-compat -> build-workspaces ->
   `node scripts/run-production-build.mjs`). Verify BOTH `dist/entry.js` and
   `apps/app/dist/index.html` exist (the SPA is the whole point).
2. **Build the artifact:** `bash scripts/awsless/modal/build-alice-artifact.sh
   <assembly-root> <out-dir>`. Produces `alice.enc.part0..3` + a gitignored
   `alice-artifact-meta.json` holding the new sha256 + fresh keyHex/ivHex.
3. **Pin the sha:** set `EXPECTED_SHA` in `alice_runtime.py` to the meta's new
   sha256 (replace the orphaned `788cd34e...`).
4. **Rotate the Modal build secret** to the new keys (values into env from the
   meta file, never echoed):
   `~/.venvs/modal/bin/modal secret create alice-build ALICE_KEY_HEX=... ALICE_IV_HEX=... --force`
5. **Upload to R2** (object keys `alice.enc.part0..3` on bucket
   `pub-322696b8cb0e447abd9d87725628383a`):
   `CLOUDFLARE_API_TOKEN=$(cat ~/.sw4p-cf/r2-write-token) wrangler r2 object put pub-322696b8cb0e447abd9d87725628383a/alice.enc.part<N> --file <path> --remote`
   Then HEAD-verify each object is publicly retrievable at
   `https://pub-322696b8cb0e447abd9d87725628383a.r2.dev/alice.enc.part<N>` with
   the right size.
6. **Commit** the `alice_runtime.py` sha change (path-scoped) on the `docs`
   branch (identity `rndrntwrk <dev@rndrntwrk.com>`, NO AI attribution, no em
   dashes) and push to `docs`. Re-run the contract suite first.
7. **Deploy:** `~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_runtime.py`
   from repo root. If it fails on a spend/billing limit, that IS a genuine
   founder gate - stop and report precisely.
8. **Verify the runtime:** `curl https://rndrntwrk--alice.modal.run/api/health`
   (ready:true); `/api/emotes` (41); `/api/connectors/google/accounts` reaches a
   handler not 404 (LifeOps restored); load
   `/companion#token=<token>` (token from `555stream/.secrets/alice-api-token.txt`
   or the `alice-api-token` Modal secret; never in a query string or log) and
   confirm the fresh SPA renders the VRM stage.

## 6. Founder-gated (after runtime verification)

The live Twitch emote proof (capture -> RTMP) stays gated. Platform RTMP keys
ARE available at `555stream/.secrets/production-secrets.runtime.json` ->
`/stream/production/platform-outputs` (TWITCH_*, KICK_*, YOUTUBE_*, X_*,
PUMPFUN_*). Before opening any paid capture window, declare owner + start +
expiry (<= 4h) + teardown command + evidence path, per runbook. RunPod/AWS off.

## 7. How to work this (operating model, founder 2026-07-20)

The orchestrator delegates substantive work to ONE Fable agent at a time (never
two). A Fable agent may fan out to Sonnet 5 (light) or Opus (complex)
sub-agents, NEVER another Fable, and acts as the adviser when it orchestrates.
The MCP caveat: the authenticated Cloudflare MCP lives in the MAIN session only;
a Fable subagent likely cannot use it, so credential/MCP steps belong in the
main thread while the mechanical upload/deploy is delegable via the token file.
