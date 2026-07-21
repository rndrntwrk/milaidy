# Alice Modal Deploy Handover (2026-07-21)

Read this to finish putting the accepted Alice release candidate live on Modal.
Companion doc: `HANDOVER-alice-continuity-2026-07-20.md` (the branch topology and
Tasks 0-9 record). This doc is the deploy leg (Task 11) and its one open blocker.

## 1. One-line status

The accepted release candidate is build-proven locally. The ONLY provider
blocker is that the Cloudflare account is not entitled to R2; every available
Cloudflare token authenticates, but R2 returns `10042` before authorization is
evaluated. A fresh source assembly completed the full runtime plus SPA build on
2026-07-21; the raw networked `bun install` retry remains an explicit deploy
gate because its dependency resolution stalled locally.

## 2. The single blocker (resolve this first)

Uploading the release artifact to R2 is blocked by **account entitlement**, not
by a missing bearer token. On 2026-07-21, the DNS, bucket, stream, and developer
tokens all authenticated to account `036df6c823669b8fa2f66cf4c16eeb29`, while
both the bucket and developer tokens received `10042` from the actual R2 bucket
endpoint. Cloudflare defines `10042` as `NotEntitled`: enable an R2 subscription
before attempting object access.

The local `555-bot/.env` R2 key, endpoint, bucket, and public URL fields are
empty commented placeholders. The available Cloudflare credentials are stored
only in the gitignored, owner-only `555stream/.secrets/alice-cloudflare.env`.
Never print or commit them.

**Secure unblock:** founder resolves Cloudflare R2 payment acceptance and enables
R2 for this account. Then run `wrangler r2 bucket info` with the locally stored
bucket token. If it is not authorized after entitlement is active, create a
least-privilege bearer token with `Workers R2 Storage Read` and `Workers R2
Storage Write` for the Wrangler upload path. Do not create an R2 `Object Read &
Write` credential for this command: those credentials are an S3 Access Key ID and
Secret Access Key pair and do not authorize the Cloudflare REST API used by
Wrangler.

Alternative that needs no R2 subscription: bake the artifact into the private
Modal image with `add_local_file` and drop R2 plus encryption from
`alice_runtime.py`. This changes the source-transfer contract and remains
uninvoked without founder approval.

## 3. What is committed and done

- **Recovery candidate (milaidy):** `release/alice-livestream-recovery-2026-07-18`
  @ `33bec701c` (local, not pushed). It contains accepted candidate `3294f8e11`
  plus the TypeScript 6 Capacitor compatibility commit. The recovery work
  restores LifeOps routes + operator actions, companion public-route exemption,
  mobile+landscape Go Live header fix, and accepted local visual evidence.
  `33bec701c` adds `rootDir: "./src"` to the nine Capacitor plugin tsconfigs
  that TypeScript 6 requires: agent, camera, canvas, desktop, location,
  mobile-signals, screencapture, swabble, and websiteblocker.
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
    tests, previously 5/5; rerun against the exact hydrated assembly before a
    deploy.
  - `docs/awsless/modal-alice-runbook-2026-06-27.md` - section 9 is the
    release-candidate gate (SPA-serving mechanism + fresh-key mandate).
  - **WORKING-TREE change (uncommitted):** `alice_runtime.py` has
    `EXPECTED_SHA = "788cd34e..."`. THIS IS ORPHANED - it points at an artifact
    that was pruned (section 4). Do not commit it as-is; re-derive the sha from
    a freshly built artifact and replace it.
- **555stream sidecar:** `fix/alice-modal-livestream-2026-07-18` @ `633acf96`
  (remote `stream`). Capture hardening (auth, redaction, HTTP-only, filtergraph
  regression) + `CAPTURE_DEFAULT_TARGET_URL` fallback. The 43 capture, browser,
  and security tests were rerun green on 2026-07-21; keep the unrelated
  GameStreamController module-link failure separate from this release gate.

## 4. What is EPHEMERAL and must be regenerated (all pruned)

The original scratchpad and both `/tmp/alice-*` assemblies were cleaned. Gone:
- The clean `3294f8e11` hydrated assembly.
- The 4 encrypted artifact chunks (`alice.enc.part0..3`, ~952M).
- The artifact meta with the FRESH aes key/iv and the tarball sha `788cd34e...`.

Consequence: the staged `EXPECTED_SHA=788cd34e...` no longer matches any
artifact (tar+gzip is not byte-reproducible and keys are minted per run). The
next session must rebuild the artifact and take the NEW sha from the new meta.

Two older local assemblies exist under `.alice-tmp`, but neither is an exact
candidate input: the closer assembly differs in 13 tracked source/package files
and is missing the release evidence; the other differs in 21 files. They can
provide dependency-cache evidence only.

A new exact source assembly is currently available at
`.alice-tmp/alice-release-assembly.33bec-verify.DopMWS`. It is an archive of
`33bec701c` with Eliza pinned to `17930c97b97cedb8fe64124e327c023cd526cc8b`.
It completed the strict patch chain, 25 Milaidy runtime workspace builds, all
11 Capacitor plugin builds, the server bundle, and the Vite SPA build. The
result contains `apps/app/dist/index.html`, `dist/entry.js`,
`eliza/packages/agent/dist/node/lifeops-runtime.mjs`,
`eliza/plugins/plugin-elizacloud/dist/node/lifeops-cloud.mjs`, and the
generated agent Capacitor plugin. Treat this directory as disposable build
evidence, not a deploy artifact or source of truth.

## 5. Full deploy sequence (once R2 entitlement and upload authorization exist)

Repo root: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555`. Toolchain:
Node 22.22.0 (`nvm use 22.22.0`), Bun 1.3.14 locally, Modal authed as
`rndrntwrk` (there is currently NO Alice app deployed - clean deploy).

1. **Hydrate clean `33bec701c`** into a fresh assembly. Archive that commit,
   archive Eliza pin `17930c97b9` into `eliza/`, then run in this order:
   `resolve-milaidy-missing-workspaces` -> `pin-alice-release-runtime-deps` ->
   `bun install --ignore-scripts --linker=hoisted` ->
   `MILAIDY_PATCH_STRICT=1 node scripts/apply-alice-eliza-runtime-patches.mjs`
   -> `build-milaidy-runtime-plugin-workspaces` ->
   `node scripts/run-production-build.mjs`. The patch step must precede the
   workspace build because it generates the LifeOps runtime facade. Verify BOTH
   `dist/entry.js` and `apps/app/dist/index.html` exist (the SPA is the whole
   point). The current full-build evidence used a seeded dependency tree after
   the networked Bun resolver produced no progress locally; do not claim a
   network-fresh install pass until this step completes in the deploy runtime.
2. **Build the artifact:** `bash scripts/awsless/modal/build-alice-artifact.sh
   <assembly-root> <out-dir>`. Produces `alice.enc.part0..3` + a gitignored
   `alice-artifact-meta.json` holding the new sha256 + fresh keyHex/ivHex.
3. **Pin the sha:** set `EXPECTED_SHA` in `alice_runtime.py` to the meta's new
   sha256 (replace the orphaned `788cd34e...`).
4. **Rotate the Modal build secret** to the new keys (values into env from the
   meta file, never echoed):
   `~/.venvs/modal/bin/modal secret create alice-build ALICE_KEY_HEX=... ALICE_IV_HEX=... --force`
5. **Prove and upload to R2** (object keys `alice.enc.part0..3` on bucket
   `pub-322696b8cb0e447abd9d87725628383a`):
   first perform a timestamped write/read/delete probe using the locally stored
   bearer token. Then upload each part with
   `wrangler r2 object put pub-322696b8cb0e447abd9d87725628383a/alice.enc.part<N> --file <path> --remote`
   using that token from the gitignored secret file, never from shell history or
   a transcript. HEAD-verify each object is publicly retrievable at
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
