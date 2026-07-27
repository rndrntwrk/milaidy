# Alice — resumption handover, 2026-07-27

Read this first. It supersedes the blocker sections of
`HANDOVER-alice-modal-deploy-2026-07-21.md` (stale within the hour it was written)
and `HANDOVER-alice-continuity-2026-07-20.md` (predates the live deploy).

Binding rules for anyone acting on this doc: `555/CLAUDE.md` and `555/AGENTS.md`,
both. Never print or commit secret values — this document deliberately names
buckets, secret *names*, token *paths* and SHAs, and no key material.

---

## 1. Where Alice actually is

| | |
|---|---|
| Repo of record | `555/milaidy`, branch `release/alice-livestream-recovery-2026-07-18` |
| Worktree | `555/.worktrees/milaidy-alice-livestream-recovery-2026-07-18` |
| Last live | **2026-07-22 ~16:40 UTC**, `https://rndrntwrk--alice.modal.run` |
| Live proof | `/api/plugins` → HTTP **200**, `{"pluginCount":109}`, `@rndrntwrk/plugin-555stream` `isActive: true, enabled: true`; health `starting` → ready on scale-to-zero first boot |
| Went dark | **2026-07-23** — Modal workspace disabled by provider billing |
| Current blocker | **Modal provider billing. Founder payment action. Not an engineering task.** |

The 2026-07-23 preflight
(`555stream/evidence/awsless/2026-07-23/alice-livestream-preflight-2026-07-23.json`)
records `providerStatus.modal`: *"Workspace remains disabled by provider billing;
no renderer is available."* and `providerStatus.runpod`: *"No active pods."*
That same preflight has all four platforms (kick, pumpfun, twitch, youtube)
configured and enabled with RTMP endpoints, credentials not exposed; the local
gates it names all passed.

**Cloudflare R2 is NOT the blocker.** It was resolved 2026-07-21 19:29 by
`3c0e4574a`, which moved `alice_runtime.py` onto the private bucket `alice-xfer`
(account `036df6c823669b8fa2f66cf4c16eeb29`) via `ALICE_R2_API_TOKEN` and a pinned
`wrangler@4.113.0`. Local token lives at `~/.sw4p-cf/r2-token`.

**Redeploy is a RESTORE, not a first deploy.** Tasks 10 and 11 of the campaign
plan were in fact executed on 07-22; both older handovers predate that and say
otherwise. Keep RunPod at zero pods — it is not the fallback unless the founder
explicitly approves one.

---

## 2. Restart sequence once Modal billing is re-enabled

Run everything from the 555 repo root (`alice_capture_service.py` uses
`add_local_dir("555stream/services/capture-service", ...)`, a path relative to the
working directory — from anywhere else the build fails).

### Step 0 — decide whether you can reuse the pinned artifact

`scripts/awsless/modal/alice_runtime.py` currently pins:

```
R2_ACCOUNT_ID   = "036df6c823669b8fa2f66cf4c16eeb29"
R2_BUCKET       = "alice-xfer"
ARTIFACT_PREFIX = "alice-release-20260723-livefix"
WRANGLER_VERSION = "4.113.0"
EXPECTED_SHA    = "e7bb0b0d94bf65428241facfa40c45506af6fc2a29f8f6cbc9335fcc32eae6fe"
```

That SHA was re-derived on 2026-07-23 and replaced the orphaned `788cd34e…` the
07-21 handover warned about — **that warning is resolved**. But it carries its own
caveat:

> **Reuse `e7bb0b0d…` only if the matching artifact is still in `alice-xfer`.**
> None of the 16 local `555/.alice-tmp/alice-artifact-*/alice-artifact-meta.json`
> files carry that sha, so there is no local copy to re-upload. **Assume a rebuild
> is needed** until you have positively listed the objects.

Check first, before anything else:

```bash
cd "/Volumes/OWC Envoy Pro FX/rndrntwrk/555"
CLOUDFLARE_ACCOUNT_ID=036df6c823669b8fa2f66cf4c16eeb29 \
CLOUDFLARE_API_TOKEN="$(cat ~/.sw4p-cf/r2-token)" \
  npx --yes wrangler@4.113.0 r2 object get \
  "alice-xfer/alice-release-20260723-livefix/alice-artifact-meta.json" \
  --file=/dev/stdout --remote
```

- Objects present and the meta sha equals `e7bb0b0d…` → **skip to Step 3**.
- Absent or mismatched → **do Steps 1-2** (rebuild + republish).

### Step 1 — hydrate a clean assembly and run the FULL production build

Rebuild only if Step 0 said so. Runbook section 9 explains why a tarball swap
alone is not enough: the Modal image build runs the tsdown *backend* build only
and never the Vite SPA build (24 GB OOM on Modal builders), so the SPA that Modal
serves is whatever `apps/app/dist` the **source tarball** already contains.

```bash
# clean assembly from the accepted revision — NOT a dirty working tree,
# its sha would not reproduce
#   accepted visual-evidence revision: 3294f8e11
#   branch tip at the time of the live deploy: 98b74f3b5
node scripts/run-production-build.mjs
```

Verify before packaging (the packager checks these too, but fail fast):
`dist/entry.js`, `apps/app/dist/index.html` (~133 MB tree with hashed assets),
`milady.mjs`, `eliza/packages/vault/`, and
`scripts/{resolve-milaidy-missing-workspaces,pin-alice-release-runtime-deps,build-milaidy-runtime-plugin-workspaces}.mjs`.

> **Known obstacle, read section 4 first.** A network-fresh `bun install` is not
> currently possible: `bun.lock` cannot satisfy `--frozen-lockfile`. Resolve that
> before budgeting time for this step.

### Step 2 — package, encrypt, upload, rotate the secret

```bash
scripts/awsless/modal/build-alice-artifact.sh <hydrated-milaidy-root> <out-dir>
```

The script stages the tree under `555-bot/milaidy/` (the layout the launcher
requires: `/build/src/555-bot/milaidy` == `MILAIDY`), excludes `node_modules`,
`.git`, `.bun-cache`, `.turbo`, caches, logs and macOS `._*` metadata, tars with
`COPYFILE_DISABLE=1`, **mints fresh aes-256-cbc key material every run**, splits
into `ALICE_ARTIFACT_CHUNKS` (default 4) parts `alice.enc.part0..N`, and writes
`alice-artifact-meta.json` with mode 600.

That meta file **contains secret key material. It is gitignored. Never commit it,
never print it, never paste it into a doc or a commit message.** The June key/iv
are RETIRED (exposed 2026-07-20) and must not be reused.

Then, in order:

1. Upload `alice.enc.part*` to `alice-xfer/<new-ARTIFACT_PREFIX>/`.
2. Rotate the Modal secret `alice-build-release-20260723-livefix` to the new
   keyHex/ivHex (or create a new secret and update the name in the launcher).
3. Update `ARTIFACT_PREFIX` and `EXPECTED_SHA` in `alice_runtime.py` **in the same
   commit** as the artifact swap. The image build must keep verifying the sha
   before decrypt.

Steps 2.1-2.2 are outward-facing infra and are founder-gated together with the
staging window.

### Step 3 — preflight (contract tests + window declaration)

```bash
cd "/Volumes/OWC Envoy Pro FX/rndrntwrk/555"
python3 -m py_compile scripts/awsless/modal/alice_runtime.py \
                      scripts/awsless/modal/alice_capture_service.py
~/.venvs/modal/bin/python -m pytest scripts/awsless/modal/test_alice_modal_contract.py -q
```

Expect **22 passed**. Verified 2026-07-27 (see section 3). If the venv is missing
after a cache purge: `python3 -m venv ~/.venvs/modal && ~/.venvs/modal/bin/pip
install pytest` — the suite needs nothing else.

Then declare the window BEFORE opening it: owner, start time, expiry (**max 4h**),
teardown command, evidence path. Stop after 15 minutes with no active testing.

### Step 4 — deploy

```bash
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_runtime.py
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_capture_service.py
```

**Env-only change gotcha:** `RUNTIME_ENV` is applied inside `alice_web()` at
container start. If the image hash is unchanged, a plain redeploy keeps the
running container and the new env does NOT take effect. Force a fresh container:

```bash
~/.venvs/modal/bin/modal app stop alice-runtime --yes   # --yes REQUIRED, no TTY
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_runtime.py
```

Cached image redeploy ≈5s; cold start of a fresh container ≈45s.

### Step 5 — verify

```bash
curl -s https://rndrntwrk--alice.modal.run/api/health      # ready:true
curl -s https://rndrntwrk--alice.modal.run/api/plugins     # HTTP 200 + pluginCount
curl -s https://rndrntwrk--capture.modal.run/healthz       # ok + display stats
```

**The acceptance bar is the 07-22 state: `/api/plugins` HTTP `200` with
`pluginCount` 109 and `@rndrntwrk/plugin-555stream` `isActive: true`.** On 07-22
this returned `401` nine times before the dual-alias secret fixed the public auth
boundary — if you see 401s, that is the auth boundary, not a dead runtime.

Then load `https://rndrntwrk--alice.modal.run/companion#token=<token>` (fragment,
never `?token=`; token from `555stream/.secrets/alice-api-token.txt`) and expect
the VRM avatar canvas plus emote overlay and no 401 on `/api/*`.

Record the exact Modal revision (`~/.venvs/modal/bin/modal app list`) into the
staging evidence, and tear down immediately after acceptance:

```bash
~/.venvs/modal/bin/modal app stop alice-runtime --yes
~/.venvs/modal/bin/modal app stop alice-capture-service --yes
```

### Step 6 — then Tasks 10 → 12

Task 10 (preflight + declare window) and Task 11 (deploy) are covered by Steps 3-5
above and were substantively executed on 07-22.

**Task 12 is the real remaining work, and Step 6 of it is the one piece of
evidence this campaign has never produced:** the PiP-composition screenshots
`operator-game-pip.png` and `twitch-game-pip.png` (campaign plan, Task 12 Step 6).
A search of the whole `555/` tree for `*pip*.png` returns nothing. They cannot be
produced locally — they need a live paid Twitch staging window with real RTMP
playback, i.e. the same founder gate as everything else. This is founder-gated,
not forgotten.

Note the distinction: the *PiP operator contract* (a Vitest test asserting the
screen-share and game-launch paths both emit `avatarIdentity: "alice"` +
`sceneId: "active-pip"`) is **done and green** — that is Task 6, carrier commit
`6fdeb1276`, re-verified 9/9 on 2026-07-27. What is missing is the *visual proof*
of that composition on a real stream.

---

## 3. What this session verified (2026-07-27)

**Modal contract suite — 22/22, first recorded run.**

```
$ cd 555 && ~/.venvs/modal/bin/python -m pytest \
    scripts/awsless/modal/test_alice_modal_contract.py -q
22 passed in 0.26s
```

pytest 9.1.1, Python 3.13.14, `~/.venvs/modal`. **22 collected / 22 passed /
0 skipped / 0 failed**, run twice with identical results. Until today its green
state was only *inferred* from a `.pyc` file size — now it is recorded.

The suite is pure-static; this was confirmed by reading it before running it.
Every assertion is a substring or AST check over `alice_runtime.py`,
`alice_capture_service.py` and `build-alice-artifact.sh`; the two tests that
`exec()` the `ALICE_SOURCE_PATCH` string do so against a
`tempfile.TemporaryDirectory()`. **No test performs network I/O and none contacts
Modal or R2**, so no test needed skipping on those grounds. The one
conditionally-skippable test
(`test_runtime_emote_patch_accepts_exact_release_assembly_when_present`) did run,
because the release assembly is present locally.

**Companion operator contracts — 9/9.** Re-run in the hydrated release assembly
`555/.alice-tmp/alice-release-assembly.33bec-verify.DopMWS` (vitest 4.1.10):
`packages/app-companion/src/components/operator/CompanionGoLiveModal.test.tsx` and
`useCompanionStageOperator.test.tsx` → 2 files, 9 tests, all passed.

**Campaign plan Tasks 7, 8, 9 ticked** with evidence pointers, and the plan's
status/blocker section rewritten. One checkbox deliberately left open — Task 7
Step 1, see below.

---

## 4. Open defects this session found (read before Step 1)

### 4.1 `bun.lock` cannot satisfy `--frozen-lockfile` — PARTIALLY fixed

The `2f0b698cd` upstream-develop merge concatenated two `packages` blocks into one
object literal. bun 1.3.14 rejected the entire file
(`InvalidPackageKey: failed to parse lockfile`), so `--frozen-lockfile` could never
succeed and every install silently resolved from the network instead.

Fixed on this branch (commit `fix(deps): remove duplicate package keys from
bun.lock`): 20 duplicate keys removed, each survivor chosen from evidence inside
the lockfile rather than a "prefer newer" guess, plus `@elizaos/plugin-browser-bridge`
rewritten from a registry tarball to the `workspace:` form its 143 siblings use.

**Still broken, and not fixable textually:** `@rollup/plugin-node-resolve` is
declared a devDependency by **13 workspaces** and has **no `packages` entry at
all**. Repairing that means inventing a version and an integrity hash — i.e.
fabrication. It needs a deliberate lockfile regeneration, which *will* drift
dependency versions. Evidence of how far it would drift: the hydrated assembly was
network-installed without a lockfile and resolved biome 2.5.4 (lockfile: 2.4.13),
discord.js 14.27.0 (14.18.0), `@ai-sdk/openai` 3.0.86 (3.0.54).

**Consequence:** the campaign's Task 7 Step 1 (network-fresh install + build) is
not just unproven, it is currently *impossible*. It is left unticked in the plan
on purpose. Regenerating the lockfile is a decision for the founder or the next
session, not a side effect of some other task.

### 4.2 `apps/app/vitest.config.ts` had three duplicated keys — fixed

Same merge, same failure mode: `include`, `exclude` and `setupFiles` were each
defined twice in one object literal. JavaScript keeps the last, so upstream's
`include: ["test/**/*.test.{ts,tsx}"]` silently overwrote Alice's fork block and
**every test under `packages/app-core/test/` has been undiscoverable** since that
merge — `vitest run` on any of them answered "No test files found". That is why
the 07-23 Go Live modal test could not be executed.

Fixed on this branch (commit `fix(test): merge the duplicated vitest `test` keys
in apps/app`). Measured with `vitest list --filesOnly` before and after:
**123 test files added to discovery, 0 removed.**

Those 123 files have been dark since the merge and have rotted. A full run reports
**23 failed files / 100 passed (123)** and **58 failed tests / 818 passed (876)**.
Those failures are pre-existing, not caused by the config fix. Their provenance is
**not confirmed**: the run was done in the hydrated assembly, whose deps are newer
than the repo would pin (react 19.2.7), and some failures have a React-version
shape (`companion-scene-host` failing inside `react-test-renderer`). Confirming
them needs a working lockfile — see 4.1. **Triage is deliberate follow-up work.**

### 4.3 The 07-23 Go Live modal change is RED — not committed

Still uncommitted in the `555/milaidy` working tree, on branch
`deploy/alice-companion-render`:

- `packages/app-core/src/components/operator/CompanionGoLiveModal.tsx`
- `packages/app-core/test/app/companion-go-live-modal.test.tsx`

The production change makes the modal refresh read-only runtime state once per
open cycle and de-duplicates concurrent refreshes. With the change applied, the
test file runs 8 tests: **7 pass, 1 fails** — the change's own new test:

```
FAIL  packages/app-core/test/app/companion-go-live-modal.test.tsx >
      CompanionGoLiveModal > refreshes read-only runtime state once per open
      cycle and deduplicates concurrent refreshes
Error: Button "Refresh status" not found
 ❯ Module.findButtonByText test/helpers/react-test.ts:46:11
 ❯ packages/app-core/test/app/companion-go-live-modal.test.tsx:209:7
```

Baseline without the change: **7/7 green**. So the regression is entirely in the
new test.

**Diagnosis for whoever picks this up:** the earlier assertion
(`expect(readOnlyRefresh).toHaveBeenCalledTimes(4)`, line ~203) *passes* — the
once-per-open refresh works as designed. What is unreachable is the dedup half:
the "Refresh status" button renders only inside the `step === "setup-required"`
branch, and the test builds its fixture with `createReadyPlugin()`, which does not
put the modal in that step. The test was authored on 07-23 and **never executed**
(Vitest could not start — see 4.2), so it asserts against a state the component
does not produce. Fix the test's fixture or drive the modal into
`setup-required`; the production change itself looks sound but is not yet proven.

Per instruction, **nothing of this change was committed**. It is left in place,
untouched, in `555/milaidy` — that tree also holds a sibling agent's in-flight work
(`plugin-discovery-helpers`, `plugins-compat-routes`, four untracked scripts), so
do not `checkout`, `stash` or `switch` in it.

### 4.4 Where to run Vitest at all

`555/milaidy/node_modules` is **empty** and cannot be populated (4.1). The working
runner is the hydrated assembly:

```bash
A="/Volumes/OWC Envoy Pro FX/rndrntwrk/555/.alice-tmp/alice-release-assembly.33bec-verify.DopMWS"
cd "$A" && ./node_modules/.bin/vitest run \
  --config "$A/apps/app/vitest.config.ts" --root "$A/apps/app" \
  packages/app-core/test/app/companion-go-live-modal.test.tsx
```

Two things make this work and are easy to miss:

- **cwd must be the repo root, `--root` must be `apps/app`.** Some tests read CSS
  via `resolve(process.cwd(), "packages/app-core/src/styles/...")`; running with
  cwd = `apps/app` fails them with ENOENT.
- **`apps/app/node_modules/react` must exist.** The config aliases `react` to
  `path.join(here, "node_modules/react")`, but the assembly hoisted everything to
  the root, so symlink it:
  `ln -sfn ../../../node_modules/react apps/app/node_modules/react` (same for
  `react-dom`).

The assembly also needs `apps/app/vitest.config.ts` patched per 4.2 — or just copy
the fixed file over from this branch.

For the `packages/app-companion` operator contracts, use that package's own config:

```bash
cd "$A/packages/app-companion" && ../../node_modules/.bin/vitest run \
  --config ./vitest.config.ts \
  src/components/operator/CompanionGoLiveModal.test.tsx \
  src/components/operator/useCompanionStageOperator.test.tsx
```

### 4.5 Two diverged copies of the same modal

`packages/app-companion/src/components/operator/CompanionGoLiveModal.tsx` and
`packages/app-core/src/components/operator/CompanionGoLiveModal.tsx` are **different
files** (~280 diff lines) with different test suites and different runners. The
07-23 change touched only the app-core copy. Do not assume a fix to one lands in
the other.

---

## 5. Task numbering, settled

The two older handovers disagree; the campaign plan is authoritative.

| Task | Meaning | State |
|---|---|---|
| 7 | Local build / runtime / **visual** gates | DONE except Step 1 (see 4.1) |
| 8 | 555stream capture + simulcast consolidation | DONE |
| 9 | Scale-to-zero Modal launchers + runbook | DONE, 22/22 recorded |
| 10 | Preflight + declare window | Executed 07-22; redo per Step 3 |
| 11 | Deploy to direct Modal URLs | **Executed 07-22 — restore, not first deploy** |
| 12 | Twitch emote + game/PiP proof | **OPEN.** Step 6 needs the paid window |
| 13-15 | Promote, tear down, Eliza fold | Not started |

Do not restart at Task 9 as if it were unstarted. That has already happened once.

---

## 6. Pointers

- Campaign plan: `docs/superpowers/plans/2026-07-18-alice-application-livestream-recovery.md`
- Modal runbook: `555/docs/awsless/modal-alice-runbook-2026-06-27.md` — section 0
  (four commands), 0.1 (contract tests), 5 (deploy + verify), **9 (release-candidate gate)**
- Forensic reconstruction: `_synthesis-2026-07-27/555_REMAINING_WORK.md`, section
  "Alice local test history (pip test + evidence) — 2026-07-27 forensics"
- Visual evidence: `evidence/alice-livestream/2026-07-18/local/` (manifest,
  browser observations, 10 screenshots), committed `3294f8e11`
- 555stream sidecar: `555/.worktrees/stream-alice-modal-livestream-2026-07-18`,
  branch `fix/alice-modal-livestream-2026-07-18` @ `633acf96`

One metadata warning worth carrying forward: the mtimes on
`555/.alice-tmp/alice-release-assembly*` and `555/.worktrees/*` are all from the
2026-07-26/27 consolidation copy into `rndrntwrk/`, **not** from build activity.
Date those trees by their inner build outputs, not their containers.
