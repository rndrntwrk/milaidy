# Alice Application and Livestream Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the current Alice application with the reviewed Milady updates and every protected companion behavior, then prove Alice actions/emotes and a game or application source on a real livestream before promoting the exact accepted release candidate.

**Architecture:** Build from the clean Alice deploy branch, selectively replay reviewed Milady commits, vendor `@elizaos/app-companion` as first-party Alice source, and keep only the Eliza UI/client half of the old mixed companion patch at the pinned runtime. Consolidate Modal and 555stream changes in their owning repositories, then pass sequential source, build, local, direct-Modal, platform-playback, production, and teardown gates.

**Tech Stack:** Node.js 22.22.0, Bun 1.3.10, TypeScript, React, Vite, Vitest, Playwright, Milady, ElizaOS pinned at `17930c97b97cedb8fe64124e327c023cd526cc8b`, 555stream, Python 3, Modal, Chromium, FFmpeg, Twitch RTMPS.

## Global Constraints

- Work from `release/alice-livestream-recovery-2026-07-18`, based on `deploy/alice-companion-render` at `e855a9bb16e9b19809e4ac0d8f93fb5effb672d0`.
- Preserve design commit `66aaf48b7` and `docs/superpowers/specs/2026-07-18-alice-livestream-recovery-design.md`.
- Keep Eliza pinned at `17930c97b97cedb8fe64124e327c023cd526cc8b`. The current Eliza upstream fold is a separate project.
- Do not wholesale merge PR #207, `integration/alice-eliza-fold-2026-07-09`, `alice-runtime-boundary-browser-entry`, or the broad `bf244e0c` frontier commit.
- Preserve Milady #9, its thumbnail/assets, action pill/drawer, avatar actions, action bubbles, bottom chat bar, Go Live Setup/Channels/Mode/Review flow, camera, and screen share/game with Alice PiP.
- Screen share/game makes the selected source primary and Alice PiP. It must not start a second Alice instance.
- Preserve the modal's bounded shell, independently scrolling body, fixed footer, and short-viewport overflow behavior. Change UI only for a failing test, accessibility issue, screenshot discrepancy, console error, or broken workflow.
- Never print, commit, screenshot, or persist secret values. Evidence may show names, presence, and one-way fingerprints only.
- Modal staging is on-demand: record owner, start, expiry no more than four hours later, teardown, and evidence path before starting. Stop after 15 minutes without active testing.
- RunPod and AWS remain off unless Modal is proven blocked and the user explicitly approves fallback.
- Build, runtime, capture, RTMP, and visible platform playback are separate evidence states.
- Promotion routes production to the exact accepted Modal revision without rebuild. 555stream and 555-bot retain their established host-side/manual production rails.
- Stop on sustained 401/429 loops, wrong Alice model, missing avatar actions, duplicate capture avatar, or playback that does not reflect operator actions.

## Repository Map

- Milady worktree: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-alice-livestream-recovery-2026-07-18`
- 555stream source: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555stream`
- 555stream worktree: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/stream-alice-modal-livestream-2026-07-18`
- Modal operations root: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555`
- Evidence root: `evidence/alice-livestream/2026-07-18/`
- Previous proof: `555stream/evidence/awsless/2026-06-27/alice-live-emote-twitch-proof-20260627T071325Z.json`

---

### Task 0: Make clean-source hydration deterministic

**Files:**
- Create: `scripts/resolve-milaidy-missing-workspaces.mjs`
- Create: `scripts/resolve-milaidy-missing-workspaces.test.mjs`
- Create: `scripts/pin-alice-release-runtime-deps.mjs`
- Create: `scripts/pin-alice-release-runtime-deps.test.mjs`
- Create: `scripts/build-milaidy-runtime-plugin-workspaces.mjs`
- Create: `scripts/build-milaidy-runtime-plugin-workspaces.test.mjs`

**Interfaces:**
- Consumes: only the three build scripts from `09c38abc555c8b4c770943f34d5c5d9dd02471e4` and the exact local workspace versions recorded by the base `bun.lock`.
- Produces: a strict release normalizer that never resolves a moving npm dist-tag and can hydrate a clean checkout whose optional plugin submodules are absent.

- [x] **Step 1: Materialize only the reviewed build scripts**

```bash
git checkout 09c38abc -- \
  scripts/resolve-milaidy-missing-workspaces.mjs \
  scripts/pin-alice-release-runtime-deps.mjs \
  scripts/build-milaidy-runtime-plugin-workspaces.mjs
if git diff --name-only | rg -q 'seed-knowledge'; then
  echo "unrelated seed script entered the release" >&2
  exit 1
fi
```

- [x] **Step 2: Add and run a failing strict-pin regression**

Create `scripts/resolve-milaidy-missing-workspaces.test.mjs` with a fixture whose
root dependencies use `alpha` for the base release's absent optional plugins.
Run the resolver with `ALICE_RELEASE_STRICT_PINS=1` and assert the exact versions
from the base lock: cron `2.0.0-alpha.8`, EVM `2.0.0-alpha.8`, experience
`2.0.0-alpha.11`, personality `2.0.0-alpha.9`, pi-ai `1.7.3-alpha.4`, plugin
manager `2.0.0-alpha.8`, scratchpad `2.0.0-alpha.7`, secrets manager
`2.0.0-alpha.10`, trust `2.0.0-alpha.7`, and Solana `2.0.0-alpha.6`.

```bash
node --test scripts/resolve-milaidy-missing-workspaces.test.mjs
```

Expected RED: at least one dependency remains `alpha`. The failure must be an
assertion failure, not a syntax or fixture error.

- [x] **Step 3: Implement strict deterministic resolution**

Extend `KNOWN_PINS` with the exact base-lock versions above. When a dependency
or override uses `alpha`, `beta`, or `next` and no matching workspace package is
present, resolve it through `KNOWN_PINS`. Under
`ALICE_RELEASE_STRICT_PINS=1`, an absent known pin is an error; the script must
not call `npm view` or accept a moving dist-tag.

- [x] **Step 4: Verify red-green and existing pin behavior**

```bash
node --test scripts/resolve-milaidy-missing-workspaces.test.mjs
node --test scripts/pin-alice-release-runtime-deps.test.mjs
node --test scripts/build-milaidy-runtime-plugin-workspaces.test.mjs
```

Expected GREEN: strict known tags become exact versions, an unknown strict
dependency fails atomically without touching manifests or lockfiles, valid
hydrated workspaces still resolve locally, release runtime pins remain
unchanged, and required runtime-plugin builds fail closed unless a successful
build produces a runtime entry. The builder discovers both `plugins/` and
`eliza/plugins/`, builds `@elizaos/core` before plugin declarations, and uses
the exact `ALICE_BUN_BIN` with the hoisted install made available to each source
workspace.

- [ ] **Step 5: Commit the deterministic build input**

```bash
git add scripts/resolve-milaidy-missing-workspaces.mjs scripts/resolve-milaidy-missing-workspaces.test.mjs scripts/pin-alice-release-runtime-deps.mjs scripts/pin-alice-release-runtime-deps.test.mjs scripts/build-milaidy-runtime-plugin-workspaces.mjs scripts/build-milaidy-runtime-plugin-workspaces.test.mjs
git commit -m "fix(alice): make release hydration deterministic"
```

---

### Task 1: Re-establish and record the exact release baseline

**Files:**
- Create: `docs/alice/release/alice-livestream-recovery-2026-07-18.json`
- Test: `scripts/apply-alice-eliza-runtime-patches.test.ts`

**Interfaces:**
- Consumes: Milady base `e855a9bb16e9b19809e4ac0d8f93fb5effb672d0`, design `66aaf48b7`, and Eliza pin `17930c97b97cedb8fe64124e327c023cd526cc8b`.
- Produces: immutable input manifest and baseline build/type counts.

- [x] **Step 1: Verify the volume, worktree, branch, and design commit**

```bash
test -d "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555"
git status --short --branch
git rev-parse HEAD
git show --stat --oneline 66aaf48b7
```

Run in the Milady worktree. Expected: the release branch is active, `66aaf48b7` is reachable, and no unexpected tracked changes appear. If the drive is unmounted, stop; do not repair it.

- [x] **Step 2: Read every source checkout before reconciling dirty work**

```bash
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555" status --short --branch
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555stream" status --short --branch
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555-bot" status --short --branch
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy" status --short --branch
```

Expected: all user changes are inventoried and none are reverted, reset, or blindly stashed.

- [x] **Step 3: Create the immutable release manifest with `apply_patch`**

```bash
mkdir -p docs/alice/release
```

```json
{
  "release": "alice-livestream-recovery-2026-07-18",
  "miladyBase": "e855a9bb16e9b19809e4ac0d8f93fb5effb672d0",
  "designCommit": "66aaf48b7",
  "elizaRuntimePin": "17930c97b97cedb8fe64124e327c023cd526cc8b",
  "miladyPullRequest": 207,
  "companionVendorCommit": "d747565d1b3d01f8c141597e9bdc61ad69190eda",
  "runtimeBoundaryCommits": ["afe853a8", "f79b821d", "801ab2cb"],
  "buildOrchestrationSource": "09c38abc555c8b4c770943f34d5c5d9dd02471e4",
  "strictReleasePins": true,
  "streamMediaCommits": ["0d00fc75", "04bffeb6", "acfb6e4a", "4e4b6cd1"],
  "promotionPolicy": "promote-exact-accepted-modal-revision",
  "elizaUpstreamFoldIncluded": false
}
```

- [x] **Step 4: Use repository-pinned Node and Bun**

```bash
source ~/.nvm/nvm.sh
nvm use
node --version
ALICE_BUN_BIN="${ALICE_BUN_BIN:-$(command -v bun)}"
"$ALICE_BUN_BIN" --version
test "$("$ALICE_BUN_BIN" --version)" = "1.3.10"
export PATH="$(dirname "$ALICE_BUN_BIN"):$PATH"
```

Expected: Node `v22.22.0`, Bun `1.3.10`. If the machine-wide Bun differs,
download or select an isolated `1.3.10` binary and set `ALICE_BUN_BIN`; do not
mutate the global installation or weaken the version check.

- [x] **Step 5: Hydrate and capture baseline gates in a disposable worktree**

```bash
baseline_root=$(mktemp -d /tmp/alice-release-baseline.XXXXXX)
release_root="$PWD"
git worktree add --detach "$baseline_root" e855a9bb16e9b19809e4ac0d8f93fb5effb672d0
eliza_source="/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/eliza"
test "$(git -C "$eliza_source" rev-parse HEAD)" = "17930c97b97cedb8fe64124e327c023cd526cc8b"
git -C "$eliza_source" archive 17930c97b97cedb8fe64124e327c023cd526cc8b | tar -x -C "$baseline_root/eliza"

(
  cd "$baseline_root"
  ALICE_RELEASE_STRICT_PINS=1 node "$release_root/scripts/resolve-milaidy-missing-workspaces.mjs" "$baseline_root"
  node "$release_root/scripts/pin-alice-release-runtime-deps.mjs" "$baseline_root"
  "$ALICE_BUN_BIN" install --ignore-scripts --linker=hoisted
  node scripts/apply-alice-eliza-runtime-patches.mjs
  node scripts/ensure-eliza-generated-types.mjs
  node scripts/patch-eliza-bun-compat.mjs
  ALICE_BUN_BIN="$ALICE_BUN_BIN" node "$release_root/scripts/build-milaidy-runtime-plugin-workspaces.mjs" "$baseline_root"
  (
    cd packages/agent
    ../../node_modules/.bin/vitest run --config vitest.config.ts src/providers/workspace.test.ts
  )
  node scripts/run-production-build.mjs
)

git worktree remove --force "$baseline_root"
```

The deterministic build-orchestration scripts are committed by Task 0 and run
against the disposable base worktree. Every script receives the disposable
root argument required by its CLI, and strict mode prohibits moving npm
dist-tags. The sequence intentionally does not run the repository `postinstall`,
which can reinitialize submodules inside an already hydrated Alice tree. It
does run the tracked Alice runtime patch driver because `postinstall` normally
invokes it through `run-repo-setup.mjs`; omitting it would not reproduce the
deploy build contract. It then runs only the safe generated-type and Bun-compat
steps that the host-hydrated deploy context normally provides. Expected: the
non-string runtime-directory regression and production build pass.
`resolveDefaultAgentWorkspaceDir` must fall back safely when `cwd()` returns a
non-string value; `dir.replace is not a function` cannot recur. Record the
artifact hashes in the release manifest. Root patch tests and the TypeScript
error count run after the reviewed `dbe07bf4` Vitest/TypeScript baseline repair
in Task 2; before that repair, the root suite fails before test import on the
missing `@miladyai/app-core` bridge alias. The release worktree must remain
unchanged except for the manifest.

- [x] **Step 6: Commit the manifest**

```bash
git add docs/alice/release/alice-livestream-recovery-2026-07-18.json
git commit -m "docs(alice): pin livestream recovery inputs"
```

---

### Task 2: Port reviewed Milady July work by commit allowlist

**Files:**
- Modify: files touched by the admitted commits
- Review: `PROTECTED_DIVERGENCES.md`

**Interfaces:**
- Consumes: PR #207 head `3191bb1a788074b617c903fc111058246b1c7845`.
- Produces: reviewed Milady improvements without replacing Alice-protected behavior.

- [x] **Step 1: Fetch and verify the commit graph**

```bash
git fetch origin integration/alice-upstream-2026-07-07
git log --reverse --format='%H %s' e855a9bb16e9b19809e4ac0d8f93fb5effb672d0..origin/integration/alice-upstream-2026-07-07
```

Expected: `218d936f`, `dbe07bf4`, `35d26977`, `5158b9f5`, `a0d04422`, `245aa0e6`, `982057bc`, and `5bbbfa4b` exist. `218d936f` is mixed documentation: only `PROTECTED_DIVERGENCES.md` is admitted, while its superseded July 7 plan is excluded. Other planning-only commits are not admitted.

- [x] **Step 2: Admit registry/baseline repairs and test**

```bash
git checkout 218d936f -- PROTECTED_DIVERGENCES.md
git cherry-pick -n dbe07bf4
git diff --stat
bunx vitest run --environment node scripts/apply-alice-eliza-runtime-patches.test.ts
bunx tsc --noEmit --pretty false 2>&1 | tee /tmp/alice-reviewed-baseline-tsc.txt
test "$(rg -c 'error TS[0-9]+' /tmp/alice-reviewed-baseline-tsc.txt)" -le 468
git add PROTECTED_DIVERGENCES.md docs/upstream-integration-evidence/WP0-baseline-record.md tsconfig.json vitest.config.ts
git commit -m "chore(alice): establish reviewed Milady baseline"
```

The historical July 9 environment recorded 466 errors. The fresh July 18
dependency tree identified by the release manifest's normalized `bun.lock`
hash records 468: 437 in `packages/app-core`, 30 in `packages/agent`, and one
in `packages/plugin-selfcontrol`. The refreshed 468 measurement is the release
ceiling; every admitted commit must keep the total at or below it and keep its
new or modified files clean.

- [x] **Step 3: Admit browser hardening and test the production consumer**

```bash
git cherry-pick -n 35d26977
node scripts/run-production-build.mjs
git add -A
git commit -m "fix(app): retain reviewed browser bundle hardening"
```

- [x] **Step 4: Admit secure-store modules and their tests**

```bash
git cherry-pick -n 5158b9f5
bunx vitest run --environment node apps/app/test/secure-store/secure-store.test.ts apps/app/test/security/update-verifier.test.ts apps/app/test/security/vision-consent.test.ts
git add -A
git commit -m "feat(app): port reviewed secure storage support"
```

- [x] **Step 5: Admit stub hygiene and VoicePill scaffolding**

```bash
git cherry-pick -n a0d04422
git cherry-pick -n 245aa0e6
node scripts/run-production-build.mjs
git add -A
git commit -m "feat(app): port reviewed voice and stub updates"
```

- [x] **Step 6: Admit mobile boot, Milady mark, and strict patch mode**

```bash
git cherry-pick -n 982057bc
git cherry-pick -n 5bbbfa4b
bunx vitest run --environment node scripts/apply-alice-eliza-runtime-patches.test.ts
node scripts/run-production-build.mjs
bunx tsc --noEmit --pretty false 2>&1 | tee /tmp/alice-reviewed-mobile-tsc.txt
test "$(rg -c 'error TS[0-9]+' /tmp/alice-reviewed-mobile-tsc.txt)" -le 468
git add -A
git commit -m "feat(app): port reviewed mobile boot and strict patch checks"
```

Evidence: 38 patch assertions passed, the production Vite consumer built 25,367
modules in 51.04 seconds, and TypeScript remained at the 468-error admitted
ceiling with no diagnostics in the files introduced or modified by this step.

- [x] **Step 7: Audit the final admitted range**

```bash
git log --format='%h %s' e855a9bb16e9b19809e4ac0d8f93fb5effb672d0..HEAD
git diff --name-status e855a9bb16e9b19809e4ac0d8f93fb5effb672d0..HEAD
```

Expected: only allowlisted implementation changes and release documents; Alice companion, model, chat, and stream contracts are not deleted.

Evidence: the admitted range contains 11 review commits and 44 changed paths.
There are no deleted or renamed paths, and the only existing Alice-surface path
touched is `packages/app-core/src/api/client-chat.ts` from the reviewed baseline
repair. Companion, VRM/model, avatar-action, and livestream source are preserved
for the explicit first-party restoration tasks below.

---

### Task 3: Vendor the companion as first-party Alice source

**Files:**
- Create: `packages/app-companion/**`
- Modify: `package.json`, `apps/app/tsconfig.json`, `apps/app/vite.config.ts`
- Modify: `deploy/Dockerfile.ci`, `scripts/templates/tsconfig.local-mode.json`
- Modify: `apps/app/test/app/vite-config.test.ts`
- Create: `scripts/app-companion-source-ownership.test.mjs`
- Create: `docs/alice/release/alice-companion-assets.json`

**Interfaces:**
- Consumes: `d747565d1b3d01f8c141597e9bdc61ad69190eda`.
- Produces: workspace `@elizaos/app-companion` resolved from `packages/app-companion`, not `eliza/plugins/app-companion`.

- [x] **Step 1: Apply the vendoring commit without committing**

```bash
git fetch origin integration/alice-eliza-fold-2026-07-09
git cherry-pick -n d747565d1b3d01f8c141597e9bdc61ad69190eda
git diff --stat
git diff --name-only
```

Expected: approximately 77 files limited to the companion package and app workspace wiring.

Evidence: `d747565d1` applied as exactly 77 paths: 74 first-party companion
paths and three workspace/app wiring paths, with no deletions or unrelated
source changes.

- [x] **Step 2: Create the asset contract from the existing Alice roster**

The vendored branch and `packages/app-companion/src/vrm-assets.test.ts` define these exact paths and cache key:

```json
{
  "defaultAvatarIndex": 9,
  "identity": "alice",
  "requiredVrm": "apps/app/public/vrms/milady-9.vrm.gz",
  "requiredSourceVrm": "apps/app/public_src/vrms/milady-9.vrm",
  "requiredPreview": "/vrms/previews/milady-9.png?v=20260413-alice-capture",
  "requiredBackground": "/vrms/backgrounds/milady-9.png?v=20260413-alice-capture",
  "binaryAssetsCommittedHere": false,
  "provisioningRule": "fail before build when either verified file is absent"
}
```

- [x] **Step 3: Add a fail-closed asset identity test**

Extend `packages/app-companion/src/vrm-assets.test.ts` using its existing exports:

```ts
it("keeps Alice on the verified Milady 9 asset pair", () => {
  configureMiladyRoster();
  expect(DEFAULT_VISUAL_AVATAR_INDEX).toBe(9);
  expect(vrmAssets.getVrmUrl(9)).toBe("/vrms/milady-9.vrm.gz");
  expect(vrmAssets.getVrmPreviewUrl(9)).toBe(
    "/vrms/previews/milady-9.png?v=20260413-alice-capture",
  );
  expect(vrmAssets.getVrmBackgroundUrl(9)).toBe(
    "/vrms/backgrounds/milady-9.png?v=20260413-alice-capture",
  );
  expect(vrmAssets.getVrmTitle(9)).toBe("Alice");
});
```

- [x] **Step 4: Add a workspace-precedence test**

In `apps/app/test/app/vite-config.test.ts`, reuse its existing Vite loader and `APP_DIR` constant:

```ts
it("resolves companion from the first-party workspace", async () => {
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "test" },
    CONFIG_PATH,
    APP_DIR,
  );
  expect(loaded?.config.resolve?.alias).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        replacement: path.join(
          APP_DIR,
          "..",
          "..",
          "packages",
          "app-companion",
          "src",
          "index.ts",
        ),
      }),
    ]),
  );
});
```

- [x] **Step 5: Run package tests and prove upstream-source independence**

```bash
node ../../node_modules/vitest/vitest.mjs run --config ./vitest.config.ts
../../node_modules/@biomejs/biome/bin/biome check src/
node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json \
  > /tmp/alice-companion-tsc.txt 2>&1 || true
test -z "$(rg '^packages/app-companion/.*error TS[0-9]+' \
  /tmp/alice-companion-tsc.txt)"
set -e
upstream="eliza/plugins/app-companion"
hidden="eliza/plugins/app-companion.__alice_vendor_test__"
trap 'test ! -e "$hidden" || mv "$hidden" "$upstream"' EXIT
mv "$upstream" "$hidden"
node scripts/run-production-build.mjs
mv "$hidden" "$upstream"
trap - EXIT
```

Expected: package-local tests and lint pass, no TypeScript diagnostic originates
in `packages/app-companion`, and the build succeeds while generated upstream
companion source is hidden before restoring that directory. The package-local
TypeScript traversal is not expected to make the inherited Eliza graph
repository-clean.

Evidence: 14 package assertions and six Vite alias assertions passed; Biome
checked 66 files without diagnostics. The raw package TypeScript traversal
reported inherited Eliza diagnostics but zero first-party companion diagnostics.
The upstream-hidden production build completed in 49.61 seconds and restored
the hidden source. A release-faithful Bun 1.3.10 install with
`--linker=hoisted` preserved the admitted global TypeScript ceiling at 468;
omitting that linker was separately reproduced as a dependency-hoisting change,
not accepted as release evidence.

- [x] **Step 6: Prove every code consumer uses first-party source**

Update `deploy/Dockerfile.ci` and `scripts/templates/tsconfig.local-mode.json` so
their companion code paths resolve `packages/app-companion`. Create
`scripts/app-companion-source-ownership.test.mjs` to scan Vite, TypeScript,
Docker, and template consumers. Code imports or copies from
`eliza/apps/app-companion` or `eliza/plugins/app-companion` fail the test. The
existing asset-provisioning path may continue reading static public assets from
`eliza/plugins/app-companion/public`; that exception is data-only and must be
named explicitly in the test.

```bash
node --test scripts/app-companion-source-ownership.test.mjs
```

Evidence: both static ownership assertions pass. Vite, application TypeScript,
the CI container, and local-mode TypeScript consume `packages/app-companion`;
the only permitted generated-upstream references are explicitly data-only
public asset provisioning paths.

- [x] **Step 7: Commit vendoring**

```bash
git add package.json apps/app/tsconfig.json apps/app/vite.config.ts apps/app/test/app/vite-config.test.ts deploy/Dockerfile.ci scripts/templates/tsconfig.local-mode.json scripts/app-companion-source-ownership.test.mjs packages/app-companion docs/alice/release/alice-companion-assets.json
git commit -m "feat(alice): vendor companion as first-party source"
```

---

### Task 4: Split the mixed companion patch by ownership

**Files:**
- Create: `scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch`
- Delete: `scripts/alice-eliza-runtime-patches/alice-companion-operator.patch`
- Modify: `scripts/apply-alice-eliza-runtime-patches.mjs`
- Modify: `scripts/apply-alice-eliza-runtime-patches.test.ts`

**Interfaces:**
- Consumes: first-party companion and nine required Eliza UI/client hunks.
- Produces: `applyAliceCompanionUiCompatPatch({ rootDir, elizaRoot, log })`, which never patches `plugins/app-companion`.

- [x] **Step 1: Write failing ownership tests**

```ts
it("retains UI compatibility without patching upstream companion", () => {
  const patch = readFileSync(
    path.join(repoRoot, "scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch"),
    "utf8",
  );
  expect(patch).toContain("packages/ui/src/api/client-types-alice.ts");
  expect(patch).toContain("packages/ui/src/components/chat/MessageContent.tsx");
  expect(patch).not.toContain("plugins/app-companion/");
});

it("removes the mixed operator patch", () => {
  expect(existsSync(path.join(
    repoRoot,
    "scripts/alice-eliza-runtime-patches/alice-companion-operator.patch",
  ))).toBe(false);
});
```

- [x] **Step 2: Run and observe the expected failure**

```bash
bunx vitest run scripts/apply-alice-eliza-runtime-patches.test.ts
```

Expected: UI-only patch absent and old mixed patch present.

Evidence: the focused suite failed exactly two new assertions: the UI-only
patch did not exist and the mixed operator patch still existed; the other 38
assertions passed.

- [x] **Step 3: Retain exactly these nine patch targets**

```text
packages/ui/src/api/client-agent.ts
packages/ui/src/api/client-chat.ts
packages/ui/src/api/client-types-alice.ts
packages/ui/src/api/client-types-chat.ts
packages/ui/src/api/client-types.ts
packages/ui/src/components/chat/MessageContent.tsx
packages/ui/src/state/AppContext.tsx
packages/ui/src/state/types.ts
packages/ui/src/state/useChatSend.ts
```

Extract only complete `packages/ui` diff blocks, then validate the result against the pinned Eliza checkout:

```bash
awk '
  /^diff --git / {
    keep = ($3 ~ /^a\/packages\/ui\// && $4 ~ /^b\/packages\/ui\//)
  }
  keep { print }
' scripts/alice-eliza-runtime-patches/alice-companion-operator.patch \
  > scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch
git -C eliza apply --check --reverse ../scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch
rg '^diff --git' scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch
```

Expected: exactly the nine paths above and no `plugins/app-companion/` target.

Evidence: the extracted patch contains exactly nine `packages/ui` diff blocks,
zero `plugins/app-companion` paths, and passes `git apply --check --reverse`
against pinned Eliza `17930c97b97cedb8fe64124e327c023cd526cc8b`.

- [x] **Step 4: Rename the patch driver and preserve strong sentinels**

```js
export const aliceCompanionUiCompatPatchRelativePath =
  "scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch";

export function isAliceCompanionUiCompatPatched(elizaRoot) {
  const requiredFiles = [
    "packages/ui/src/api/client-types-alice.ts",
    "packages/ui/src/api/client-agent.ts",
    "packages/ui/src/api/client-chat.ts",
    "packages/ui/src/components/chat/MessageContent.tsx",
  ].map((relativePath) => path.join(elizaRoot, relativePath));
  if (requiredFiles.some((filePath) => !existsSync(filePath))) return false;

  const clientAgent = readFileSync(requiredFiles[1], "utf8");
  const clientChat = readFileSync(requiredFiles[2], "utf8");
  const messageContent = readFileSync(requiredFiles[3], "utf8");
  return (
    clientAgent.includes("executeAliceOperatorPlan") &&
    clientAgent.includes("getEmotes") &&
    clientChat.includes("logConversationOperatorAction") &&
    messageContent.includes("action-pill")
  );
}
```

Rename the apply function and result-list call to `applyAliceCompanionUiCompatPatch`.

- [x] **Step 5: Prove strictness and idempotency**

```bash
bunx vitest run scripts/apply-alice-eliza-runtime-patches.test.ts
node scripts/apply-alice-eliza-runtime-patches.mjs
node scripts/apply-alice-eliza-runtime-patches.mjs
git -C eliza diff --check
if git -C eliza diff --name-only | rg -q '^plugins/app-companion/'; then
  echo "unexpected upstream companion patch target" >&2
  exit 1
fi
```

Expected: tests pass; second application is already-applied; no generated upstream companion file changes.

Evidence: all 40 patch-contract assertions pass. The focused UI compatibility
driver returned `already-applied` twice on a clean pinned Eliza worktree with
zero changed paths. The full strict patch driver also passed twice in the
hydrated release assembly; the upstream companion tree hash was identical
before and after (`dc03be29394f4861a6baa9706fc94cac97c3d97ce5419e7a7a47a6831b99a1f6`).

- [x] **Step 6: Commit ownership split**

```bash
git add scripts/apply-alice-eliza-runtime-patches.mjs scripts/apply-alice-eliza-runtime-patches.test.ts scripts/alice-eliza-runtime-patches/alice-companion-ui-compat.patch
git rm scripts/alice-eliza-runtime-patches/alice-companion-operator.patch
git commit -m "refactor(alice): move companion ownership into Milady"
```

---

### Task 5: Replay proven browser/server runtime-boundary fixes

**Files:**
- Modify: `apps/app/vite.config.ts`
- Modify: `packages/app-core/src/index.ts`
- Modify: `packages/app-core/src/registry/index.ts`
- Create: `packages/app-core/src/registry/index.test.ts`
- Create: `packages/app-core/src/app-core-runtime-hook-surface.test.ts`
- Modify: `scripts/apply-alice-eliza-runtime-patches.mjs`
- Modify: `scripts/apply-alice-eliza-runtime-patches.test.ts`
- Create or modify: `scripts/resolve-milaidy-missing-workspaces.mjs`
- Create or modify: `scripts/pin-alice-release-runtime-deps.mjs`
- Create or modify: `scripts/build-milaidy-runtime-plugin-workspaces.mjs`

**Interfaces:**
- Consumes: `afe853a8`, `f79b821d`, `801ab2cb`, and Task 0's reviewed deterministic build scripts from `09c38abc`.
- Produces: UI-free server barrel, source browser barrel, build-variant exports, tolerant registry loading, reproducible build hydration.

- [ ] **Step 1: Apply reviewed commits without committing**

```bash
git fetch origin alice-runtime-boundary-browser-entry
git cherry-pick -n afe853a8
git cherry-pick -n f79b821d
git cherry-pick -n 801ab2cb
git diff --stat
```

Resolve overlap by preserving Task 4's UI-only patch names and the browser/server boundary.

- [ ] **Step 2: Check whether `f2b8e4f4` is subsumed**

```bash
git diff f2b8e4f4^ f2b8e4f4 -- apps/app/vite.config.ts
rg -n 'index\.browser|@elizaos/app-core' apps/app/vite.config.ts scripts/apply-alice-eliza-runtime-patches.mjs
```

Expected: do not cherry-pick `f2b8e4f4` if `afe853a8` already provides first-match browser aliasing. Admit only a test-proven missing hunk.

- [ ] **Step 3: Verify Task 0 kept the build-script allowlist**

```bash
git diff --name-only 09c38abc -- scripts/resolve-milaidy-missing-workspaces.mjs scripts/pin-alice-release-runtime-deps.mjs scripts/build-milaidy-runtime-plugin-workspaces.mjs
if git ls-files | rg -q 'scripts/seed-knowledge'; then
  echo "unrelated seed script entered the release" >&2
  exit 1
fi
node --test scripts/resolve-milaidy-missing-workspaces.test.mjs scripts/pin-alice-release-runtime-deps.test.mjs scripts/build-milaidy-runtime-plugin-workspaces.test.mjs
```

Expected: diffs are limited to the reviewed strict-pin hardening and tests from
Task 0; no unrelated build or knowledge-seeding source enters the release.

- [ ] **Step 4: Run boundary tests**

The test suite must retain these assertions:

```ts
expect(serverIndexSource).not.toContain('export * from "@elizaos/ui"');
expect(serverIndexSource).not.toContain('export * from "./ui-compat"');
expect(browserIndexSource).toContain('export * from "@elizaos/ui"');
expect(browserIndexSource).toContain('export * from "./ui-compat"');
```

Run:

```bash
bunx vitest run scripts/apply-alice-eliza-runtime-patches.test.ts
bunx vitest run apps/app/test/app/vite-config.test.ts
bunx vitest run packages/app-core/src/app-core-runtime-hook-surface.test.ts
```

- [ ] **Step 5: Add a malformed-registry regression**

Extract the file-reading loop in `packages/app-core/src/registry/index.ts` into an exported helper used by `loadRegistry`:

```ts
export function readRegistryRawEntries(
  rootDir: string = entriesDir,
): Array<{ file: string; data: unknown }> {
  const raws: Array<{ file: string; data: unknown }> = [];
  for (const kind of ["apps", "plugins", "connectors"] as const) {
    const kindDir = join(rootDir, kind);
    let entries: string[];
    try {
      entries = readdirSync(kindDir);
    } catch {
      console.warn(`[registry] ${kind} directory missing: ${kindDir}`);
      continue;
    }
    for (const filename of entries) {
      if (!filename.endsWith(".json")) continue;
      const file = join(kindDir, filename);
      let raw: string;
      try {
        raw = readFileSync(file, "utf-8");
      } catch (error) {
        console.warn(
          `[registry] skipping unreadable entry ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      try {
        raws.push({ file, data: JSON.parse(raw) });
      } catch (error) {
        console.warn(
          `[registry] skipping invalid JSON entry ${file} (${raw.length} bytes): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  return raws;
}
```

Replace the original loop in `loadRegistry()` with `const raws = readRegistryRawEntries();`.

Create `packages/app-core/src/registry/index.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readRegistryRawEntries } from "./index";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

it("skips one invalid JSON entry without losing valid entries", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "alice-registry-"));
  roots.push(root);
  for (const kind of ["apps", "plugins", "connectors"]) {
    mkdirSync(path.join(root, kind), { recursive: true });
  }
  writeFileSync(path.join(root, "apps", "valid.json"), '{"id":"valid"}');
  writeFileSync(path.join(root, "apps", "invalid.json"), "not-json");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  expect(readRegistryRawEntries(root)).toEqual([
    {
      file: path.join(root, "apps", "valid.json"),
      data: { id: "valid" },
    },
  ]);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("invalid.json"));
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("not-json"));
});
```

Run:

```bash
bunx vitest run packages/app-core/src/registry/index.test.ts
```

- [ ] **Step 6: Run both build consumers in a disposable assembly**

```bash
release_root="$PWD"
assembly_root=$(mktemp -d /tmp/alice-release-assembly.XXXXXX)
git archive HEAD | tar -x -C "$assembly_root"
mkdir -p "$assembly_root/eliza"
eliza_source="/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/eliza"
test "$(git -C "$eliza_source" rev-parse HEAD)" = "17930c97b97cedb8fe64124e327c023cd526cc8b"
git -C "$eliza_source" archive 17930c97b97cedb8fe64124e327c023cd526cc8b | tar -x -C "$assembly_root/eliza"
(
  cd "$assembly_root"
  ALICE_RELEASE_STRICT_PINS=1 node "$release_root/scripts/resolve-milaidy-missing-workspaces.mjs" "$assembly_root"
  node "$release_root/scripts/pin-alice-release-runtime-deps.mjs" "$assembly_root"
  "$ALICE_BUN_BIN" install --ignore-scripts --linker=hoisted
  node scripts/ensure-eliza-generated-types.mjs
  node scripts/patch-eliza-bun-compat.mjs
  ALICE_BUN_BIN="$ALICE_BUN_BIN" node "$release_root/scripts/build-milaidy-runtime-plugin-workspaces.mjs" "$assembly_root"
  node scripts/run-production-build.mjs
  shasum -a 256 package.json bun.lock > /tmp/alice-release-normalized-inputs.sha256
)
```

Expected: no React server leakage, `isStoreBuild` failure, missing export, or
unresolved module. The release worktree remains clean; the normalized
`package.json` and `bun.lock` hashes enter the evidence manifest so the accepted
artifact is tied to the exact generated inputs rather than uncommitted source.

- [ ] **Step 7: Commit boundary fixes**

```bash
git add apps/app/vite.config.ts packages/app-core/src/index.ts packages/app-core/src/app-core-runtime-hook-surface.test.ts packages/app-core/src/registry/index.ts packages/app-core/src/registry/index.test.ts scripts/apply-alice-eliza-runtime-patches.mjs scripts/apply-alice-eliza-runtime-patches.test.ts
git commit -m "fix(alice): preserve browser server runtime boundary"
```

---

### Task 6: Lock companion workflow, accessibility, and source modes with tests

**Files:**
- Create: `packages/app-companion/src/components/operator/CompanionGoLiveModal.test.tsx`
- Modify: `packages/app-companion/src/components/operator/useCompanionStageOperator.test.tsx`
- Modify only on proven failure: `packages/app-companion/src/components/operator/CompanionGoLiveModal.tsx`
- Modify only on proven failure: `packages/app-core/src/styles/alice-companion.css`

**Interfaces:**
- Consumes: modal props `open`, `onOpenChange`, `preferredMode`, `onPreferredModeChange`, `operator`; operator call `performGuidedGoLive({ channels, launchMode, selectedGameId })`.
- Produces: test-proven step navigation, cancel safety, alert focus, camera launch, screen-share PiP, game source, and responsive scrolling.

- [ ] **Step 1: Create a typed modal harness**

Mock `useApp()` with one ready 555stream Twitch destination. Use non-secret sentinel values only:

```ts
const streamPlugin = {
  id: "@rndrntwrk/plugin-555stream",
  parameters: [
    { key: "STREAM555_AGENT_TOKEN", currentValue: "configured", isSet: true },
    { key: "STREAM555_DEST_TWITCH_ENABLED", currentValue: "true", isSet: true },
    { key: "STREAM555_DEST_TWITCH_RTMP_URL", currentValue: "rtmps://example.invalid/live", isSet: true },
    { key: "STREAM555_DEST_TWITCH_STREAM_KEY", currentValue: "configured", isSet: true },
  ],
};
```

Use `ReturnType<typeof useCompanionStageOperator>` for the operator fixture. Give `stream` its real `refreshStatus` and `refreshDestinations` no-ops, `arcade` one selected game with ID `game-1`, and:

```ts
performGuidedGoLive: vi.fn(async () => ({
  state: "success",
  tone: "success",
  message: "Alice is live.",
})),
refreshRuntimeStatus: vi.fn(async () => undefined),
```

Fill every required field explicitly; do not cast the fixture through `unknown`.

- [ ] **Step 2: Prove Cancel closes without launching**

```ts
it("closes without launching when Cancel is pressed", async () => {
  const onOpenChange = vi.fn();
  renderModal({ operator, onOpenChange });
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(operator.performGuidedGoLive).not.toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
```

- [ ] **Step 3: Prove Setup/Channels/Mode/Review launches the selected contract**

```ts
it("launches the reviewed channel and camera mode", async () => {
  renderModal({ operator, preferredMode: "camera" });
  expect(screen.getByLabelText("Twitch")).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByLabelText("Camera")).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Launch now" }));
  expect(operator.performGuidedGoLive).toHaveBeenCalledWith({
    channels: ["twitch"],
    launchMode: "camera",
    selectedGameId: "game-1",
  });
});
```

Because setup is complete, the modal opens on Channels. Assert `aria-current="step"` on Channels before the first click.

- [ ] **Step 4: Prove invalid progress is announced and focused**

```ts
it("focuses an actionable alert when no channel is selected", async () => {
  renderModal({ operator });
  await user.click(screen.getByLabelText("Twitch"));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(/select at least one ready channel/i);
  expect(alert).toHaveFocus();
  expect(operator.performGuidedGoLive).not.toHaveBeenCalled();
});
```

Make the minimal accessibility fix by adding `state: "blocked"` to the no-channel inline notice. This uses the existing `InlineNoticeCard` rule that blocked notices receive `role="alert"` and focus.

- [ ] **Step 5: Preserve screen-share and game PiP operator contracts**

Keep the existing screen-share assertion:

```ts
expect(mockExecuteAliceOperatorPlan).toHaveBeenCalledWith({
  stopOnFailure: false,
  steps: expect.arrayContaining([
    expect.objectContaining({
      action: "STREAM555_SCREEN_SHARE",
      params: expect.objectContaining({
        avatarIdentity: "alice",
        sceneId: "active-pip",
      }),
    }),
  ]),
});
```

Add this game assertion, which initially fails because the vendored hook currently sends only `gameId` and `mode`:

```ts
expect(mockExecuteAliceOperatorPlan).toHaveBeenCalledWith(
  expect.objectContaining({
    steps: expect.arrayContaining([
      expect.objectContaining({
        action: "FIVE55_GAMES_GO_LIVE_PLAY",
        params: expect.objectContaining({
          gameId: "game-1",
          mode: "agent",
          avatarIdentity: "alice",
          sceneId: "active-pip",
        }),
      }),
    ]),
  }),
);
```

Make the minimal hook change in the `play-games` branch:

```ts
{
  id: "go-live-play",
  action: "FIVE55_GAMES_GO_LIVE_PLAY",
  params: {
    gameId,
    mode: "agent",
    avatarIdentity: "alice",
    sceneId: "active-pip",
  },
}
```

- [ ] **Step 6: Prove the Alice avatar-action catalog reaches the operator**

Hoist `mockGetEmotes` in `useCompanionStageOperator.test.tsx`, return a deterministic catalog, mount with `selectedVrmIndex: 9`, and assert the pinned action is exposed:

```ts
mockGetEmotes.mockResolvedValue({
  emotes: [
    { id: "wave", name: "Wave", category: "greeting" },
    { id: "dance-happy", name: "Dance Happy", category: "dance" },
  ],
});

expect(operatorRef.current?.emotes.error).toBeNull();
expect(operatorRef.current?.emotes.pinned.map((emote) => emote.id)).toEqual([
  "wave",
  "dance-happy",
]);
```

Expected: the catalog is not suppressed as unauthorized and the action drawer receives non-empty pinned actions.

- [ ] **Step 7: Add a static modal overflow contract**

Read `alice-companion.css` and assert:

```ts
expect(css).toMatch(/\.go-live-modal__shell\s*{[^}]*overflow:\s*hidden/s);
expect(css).toMatch(/\.go-live-modal__body\s*{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
expect(css).toMatch(/\.go-live-modal__footer\s*{[^}]*flex:\s*0 0 auto/s);
expect(css).toMatch(/@media \(max-height: 680px\)[\s\S]*overflow-x:\s*auto/);
```

- [ ] **Step 8: Run focused tests and make only test-driven fixes**

```bash
bunx vitest run --config packages/app-companion/vitest.config.ts packages/app-companion/src/components/operator/CompanionGoLiveModal.test.tsx packages/app-companion/src/components/operator/useCompanionStageOperator.test.tsx
bun --cwd packages/app-companion run typecheck
```

Expected: pass. Preserve the current shell/body/footer design unless a test demonstrates failure.

- [ ] **Step 9: Commit workflow contracts**

```bash
git add packages/app-companion/src/components/operator/CompanionGoLiveModal.test.tsx packages/app-companion/src/components/operator/useCompanionStageOperator.test.tsx packages/app-companion/src/components/operator/CompanionGoLiveModal.tsx packages/app-core/src/styles/alice-companion.css
git commit -m "test(alice): lock companion live workflow contracts"
```

---

### Task 7: Complete local build, runtime, and visual gates

**Files:**
- Create: `evidence/alice-livestream/2026-07-18/local/manifest.json`
- Create: `evidence/alice-livestream/2026-07-18/local/screenshots/**`
- Create: `evidence/alice-livestream/2026-07-18/local/browser-observations.json`

**Interfaces:**
- Consumes: Tasks 1-6.
- Produces: source/assets, build/test, and local runtime/UI acceptance.

- [ ] **Step 1: Run release-source tests and build**

```bash
mkdir -p evidence/alice-livestream/2026-07-18/local/screenshots
bunx vitest run scripts/apply-alice-eliza-runtime-patches.test.ts
bunx vitest run apps/app/test/app/vite-config.test.ts
bunx vitest run packages/agent/src/providers/workspace.test.ts
bun --cwd packages/app-companion run test
bun --cwd packages/app-companion run typecheck
bun --cwd packages/app-companion run lint
node scripts/run-production-build.mjs
bunx tsc --noEmit --pretty false 2>&1 | tee /tmp/alice-release-tsc.txt
rg -c 'error TS[0-9]+' /tmp/alice-release-tsc.txt
```

Expected: focused suites/build pass and TypeScript error count does not exceed Task 1. Do not call the repository type-clean if the baseline remains nonzero.

- [ ] **Step 2: Start a faithful local or disposable-container runtime**

```bash
ELIZA_DISABLE_LOCAL_EMBEDDINGS=1 bun run start
```

Expected: server-running marker and health response. If native embeddings terminate the laptop process before boot, use the existing built container with the same source and state paths; do not change unrelated plugin code.

- [ ] **Step 3: Verify health, auth, and companion stage**

```bash
curl --fail --silent --show-error http://127.0.0.1:3100/api/health
curl --fail --silent --show-error -H "Authorization: Bearer ${ALICE_API_TOKEN}" http://127.0.0.1:3100/api/agents
curl --fail --silent --show-error -H "Authorization: Bearer ${ALICE_API_TOKEN}" http://127.0.0.1:3100/api/companion/stage
```

Expected: 200 responses; saved logs contain no token.

- [ ] **Step 4: Capture the required local viewports with Playwright**

```text
1440x900 companion and expanded actions
1440x640 each Go Live step
390x844 companion, actions, and Go Live
844x390 Go Live body and footer simultaneously visible
```

At every viewport assert Go Live, bottom chat textbox, Alice model identity/index 9, and non-empty action drawer. At short height, scroll body to its end and assert footer controls remain visible.

- [ ] **Step 5: Fail on black screen, module error, or request storm**

Observe 60 seconds after authentication and route navigation. Fail on uncaught `TypeError`/`SyntaxError`, missing ESM export, blank root, more than two repeated 401s for one route after auth, more than two repeated 429s for one polling route, or duplicate intervals after navigation.

- [ ] **Step 6: Save the local manifest**

Include release SHA, Eliza pin, command exit codes, baseline/release type counts, screenshot paths/hashes, console count, repeated 401/429 counts, and `accepted`. Exclude cookies, tokens, session URLs, and stream keys.

---

### Task 8: Consolidate 555stream capture and simulcast fixes in an isolated worktree

**Files:**
- Modify: `services/capture-service/src/browser/controller.js`
- Modify: `services/capture-service/src/capture/ffmpegCapture.js`
- Modify: `services/capture-service/src/index.js`
- Create: `services/capture-service/src/api/security.js`
- Create: `services/capture-service/src/api/security.test.js`

**Interfaces:**
- Consumes: current dirty stream work plus `0d00fc75`, `04bffeb6`, `acfb6e4a`, `4e4b6cd1`.
- Produces: authenticated single-scene capture, cold-start retry, surfaced FFmpeg failures, and valid audio filter graph.

- [ ] **Step 1: Inspect and preserve the dirty source checkout**

```bash
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555stream" status --short --branch
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555stream" diff -- services/capture-service/src/browser/controller.js services/capture-service/src/capture/ffmpegCapture.js services/capture-service/src/index.js services/capture-service/src/api/security.js services/capture-service/src/api/security.test.js
```

Expected: every hunk is understood. Do not overwrite or stash the source checkout.

- [ ] **Step 2: Create the clean stream worktree**

```bash
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555stream" fetch origin
git -C "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/555stream" worktree add "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/stream-alice-modal-livestream-2026-07-18" -b fix/alice-modal-livestream-2026-07-18 origin/fix/alice-eliza-submodule-archive
```

- [ ] **Step 3: Verify or admit the four media fixes**

```bash
for commit in 0d00fc75 04bffeb6 acfb6e4a 4e4b6cd1; do
  git merge-base --is-ancestor "$commit" HEAD || git cherry-pick "$commit"
done
```

Expected: current remote branch already contains these commits through `4e4b6cd1`, so no duplicate cherry-pick occurs. If a future base lacks one, only that missing commit is admitted. No historical AWS capture-lane work enters.

- [ ] **Step 4: Reapply reviewed dirty changes with `apply_patch`**

Retain this API contract, using the repository's existing constant-time token helper:

```js
export function requireCaptureAuth(req, res, next) {
  const expected = process.env.CAPTURE_SERVICE_TOKEN;
  const supplied = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || !timingSafeEqualToken(supplied, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}
```

The browser controller must build `` `${runtimeBaseUrl}/companion#token=${encodeURIComponent(token)}` ``, never append `?token=`, and reuse the one active scene.

- [ ] **Step 5: Run capture tests**

Use the package's declared test runner. Required assertions:

```js
expect(unauthorized.status).toBe(401);
expect(authorized.status).not.toBe(401);
expect(capturedUrl).toContain("/companion#token=");
expect(capturedUrl).not.toContain("?token=");
expect(ffmpegArgs.join(" ")).toContain("[1:a]");
expect(ffmpegArgs.join(" ")).not.toContain("[1:a?]");
```

- [ ] **Step 6: Commit stream changes**

```bash
git add services/capture-service/src/browser/controller.js services/capture-service/src/capture/ffmpegCapture.js services/capture-service/src/index.js services/capture-service/src/api/security.js services/capture-service/src/api/security.test.js
git commit -m "fix(capture): harden Alice Modal livestream delivery"
```

---

### Task 9: Consolidate scale-to-zero Modal launchers and runbook

**Files:**
- Modify: `scripts/awsless/modal/alice_runtime.py`
- Create: `scripts/awsless/modal/alice_capture_service.py`
- Create: `scripts/awsless/modal/test_alice_modal_contract.py`
- Modify: `docs/awsless/modal-alice-runbook-2026-06-27.md`

**Interfaces:**
- Consumes: accepted Milady and 555stream sources.
- Produces: `alice-runtime` and singleton `alice-capture-service` direct release-candidate apps.

- [ ] **Step 1: Write failing static launcher tests**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_runtime_scales_to_zero():
    source = (ROOT / "scripts/awsless/modal/alice_runtime.py").read_text()
    assert "min_containers=0" in source
    assert "alice-runtime" in source


def test_capture_is_singleton_and_uses_fragment_auth():
    source = (ROOT / "scripts/awsless/modal/alice_capture_service.py").read_text()
    assert "min_containers=0" in source
    assert "max_containers=1" in source
    assert "/companion#token=" in source
    assert "/companion?token=" not in source
```

- [ ] **Step 2: Run the test to expose missing reconciliation**

```bash
python3 -m pytest scripts/awsless/modal/test_alice_modal_contract.py -q
```

- [ ] **Step 3: Reconcile existing uncommitted launcher changes**

The runtime function must use `min_containers=0` and a four-hour maximum timeout. Capture must additionally use `max_containers=1`. Construct the companion URL without logging it:

```python
companion_url = f"{runtime_base_url.rstrip('/')}/companion#token={quote(token, safe='')}"
```

- [ ] **Step 4: Run syntax and contract tests**

```bash
python3 -m py_compile scripts/awsless/modal/alice_runtime.py scripts/awsless/modal/alice_capture_service.py
python3 -m pytest scripts/awsless/modal/test_alice_modal_contract.py -q
```

Expected: both exit 0.

- [ ] **Step 5: Record exact deploy/stop commands in the runbook**

```bash
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_runtime.py
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_capture_service.py
~/.venvs/modal/bin/modal app stop alice-runtime --yes
~/.venvs/modal/bin/modal app stop alice-capture-service --yes
~/.venvs/modal/bin/modal app list
```

The runbook must name `https://rndrntwrk--alice.modal.run` and `https://rndrntwrk--capture.modal.run`, require auth, fragment token delivery, `min_containers=0`, revision evidence, and immediate teardown.

- [ ] **Step 6: Commit operations files in their owning repository**

```bash
git add scripts/awsless/modal/alice_runtime.py scripts/awsless/modal/alice_capture_service.py scripts/awsless/modal/test_alice_modal_contract.py docs/awsless/modal-alice-runbook-2026-06-27.md
git commit -m "feat(alice): define scale-to-zero Modal release rail"
```

---

### Task 10: Preflight secure configuration and declare the test window

**Files:**
- Create: `evidence/alice-livestream/2026-07-18/staging/config-preflight.json`
- Create: `evidence/alice-livestream/2026-07-18/staging/window.json`

**Interfaces:**
- Consumes: Modal auth, Alice API token, capture token, ready Twitch destination, enabled 555stream plugin.
- Produces: no-secret preflight and expiring test authorization.

- [ ] **Step 1: Verify authenticated CLIs without echoing credentials**

```bash
mkdir -p evidence/alice-livestream/2026-07-18/staging
~/.venvs/modal/bin/modal profile current
~/.venvs/modal/bin/modal app list
~/.venvs/modal/bin/modal secret list
gh auth status
```

Expected: correct accounts and required secret object names. Record names only.

- [ ] **Step 2: Run a redacted runtime configuration probe**

Output exactly this schema, calculating fingerprints inside the secret-bearing process:

```json
{
  "aliceApiToken": { "present": true, "fingerprintMatches": "^[a-f0-9]{12}$" },
  "captureServiceToken": { "present": true, "fingerprintMatches": "^[a-f0-9]{12}$" },
  "twitchDestination": { "present": true, "ready": true },
  "stream555Plugin": { "present": true, "enabled": true },
  "allRequired": true
}
```

Any missing requirement sets `allRequired` false and blocks deployment.

- [ ] **Step 3: Write the window manifest before starting Modal**

Generate the exact UTC values first:

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
date -u -v+4H '+%Y-%m-%dT%H:%M:%SZ'
```

Use `apply_patch` to create `window.json` with the two command outputs as `startedAt` and `expiresAt`, plus owner `rndrntwrk`, purpose `Alice companion, livestream emote, and game PiP acceptance`, `idleStopMinutes: 15`, evidence directory `evidence/alice-livestream/2026-07-18/staging`, status `authorized`, and the three exact teardown commands in this task's interface.

- [ ] **Step 4: Enforce the start gate**

Expected: `allRequired` true, expiry within four hours, evidence directory writable, teardown recorded. Otherwise do not deploy.

---

### Task 11: Deploy the exact release candidate to direct Modal URLs

**Files:**
- Create: `evidence/alice-livestream/2026-07-18/staging/deploy.json`
- Create: `evidence/alice-livestream/2026-07-18/staging/runtime-smoke.json`
- Create: `evidence/alice-livestream/2026-07-18/staging/screenshots/**`

**Interfaces:**
- Consumes: accepted local Milady SHA, stream SHA, launcher SHA, and authorized window.
- Produces: direct-Modal revision evidence and authenticated companion acceptance.

- [ ] **Step 1: Deploy runtime and capture from reviewed sources**

```bash
mkdir -p evidence/alice-livestream/2026-07-18/staging/screenshots
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_runtime.py
~/.venvs/modal/bin/modal deploy scripts/awsless/modal/alice_capture_service.py
```

Expected: both commands succeed. Record Milady SHA, stream SHA, launcher SHA, Modal app/revision IDs, and image digest in `deploy.json`.

- [ ] **Step 2: Verify public and authenticated boundaries**

```bash
curl --fail --silent --show-error https://rndrntwrk--alice.modal.run/api/health
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' https://rndrntwrk--alice.modal.run/api/agents
curl --fail --silent --show-error -H "Authorization: Bearer ${ALICE_API_TOKEN}" https://rndrntwrk--alice.modal.run/api/agents
```

Expected: health 200, protected route 401 without auth, protected route 200 with auth. Never save the bearer value.

- [ ] **Step 3: Accept the companion before starting paid capture work**

Open `https://rndrntwrk--alice.modal.run/companion` through the authorized browser session. Screenshot and assert:

```text
Milady #9 and matching verified identity/assets
bottom chat bar
left action pill and expanded action drawer
populated avatar actions without Unauthorized
Go Live button
Setup, Channels, Mode, Review
camera, screen share, and game/application source options
```

- [ ] **Step 4: Observe request behavior for 60 seconds**

Fail on the Task 7 module/black-screen criteria or repeated same-route 401/429 loops. One explicit unauthenticated probe is allowed and labeled.

- [ ] **Step 5: Verify chat and one reversible avatar action**

Send one staging message, trigger one catalog emote, and capture request acceptance plus visible operator-side response. Capture service remains stopped until the platform playback observer is ready.

- [ ] **Step 6: Enforce idle stop**

If more than 15 minutes pass before Task 12:

```bash
~/.venvs/modal/bin/modal app stop alice-capture-service --yes
```

Redeploy capture immediately before the platform proof; runtime remains scale-to-zero.

---

### Task 12: Prove Alice emotes and a game/application source on Twitch playback

**Files:**
- Create: `evidence/alice-livestream/2026-07-18/platform/twitch-emote-proof.json`
- Create: `evidence/alice-livestream/2026-07-18/platform/twitch-game-pip-proof.json`
- Create: `evidence/alice-livestream/2026-07-18/platform/screenshots/**`
- Create: sanitized capture log under `evidence/alice-livestream/2026-07-18/platform/`

**Interfaces:**
- Consumes: direct Modal candidate and ready Twitch destination.
- Produces: operator-to-capture-to-Twitch proof, including game/application primary plus Alice PiP.

- [ ] **Step 1: Start capture only when operator and Twitch observers are ready**

```bash
mkdir -p evidence/alice-livestream/2026-07-18/platform/screenshots
```

Open both views first, then invoke the authenticated capture start endpoint. Do not put the token or stream key in shell history/evidence. Expected capture status:

```json
{
  "running": true,
  "ffmpegAlive": true,
  "frameCountGreaterThan": 0,
  "destination": "twitch"
}
```

- [ ] **Step 2: Establish actual player playback before actions**

Wait for Twitch's player to display the live program; static page HTML 200 is not proof. Save `operator-before.png`, `twitch-before.png`, and a redacted capture status. Expected: same Alice state in both views.

- [ ] **Step 3: Trigger a deterministic Alice emote**

Use a proven catalog emote such as `wave` or `dance-happy`. Record its catalog ID and operator request timestamp.

- [ ] **Step 4: Capture synchronized emote after-state**

Within the emote duration save:

```text
operator-after-emote.png
twitch-after-emote.png
capture-status-after-emote.json
```

Expected: same pose in operator and Twitch, advancing frame count, no second Alice instance.

- [ ] **Step 5: Switch to a deterministic game/application source with Alice PiP**

Choose one real ready catalog entry and launch through the operator so the plan carries:

```json
{
  "selectedGameId": "operator.arcade.selectedGameId",
  "avatarIdentity": "alice",
  "sceneId": "active-pip"
}
```

The evidence manifest replaces `operator.arcade.selectedGameId` with the ID returned by the live catalog before launch.

Expected: selected source fills primary canvas and Alice remains visible in PiP.

- [ ] **Step 6: Prove the composition and one PiP emote on Twitch**

Save `operator-game-pip.png`, `twitch-game-pip.png`, and redacted status. Trigger one Alice emote while PiP is active. Expected: both views show the same primary source, Alice PiP, and action response.

- [ ] **Step 7: End Live and verify clean stop**

Use the operator End Live action. Expected:

```json
{
  "running": false,
  "ffmpegAlive": false
}
```

Confirm Twitch leaves live state and no capture task remains.

- [ ] **Step 8: Finalize proof manifests**

Include release SHA, Modal revision, platform, timestamps, screenshot hashes, status snapshots, emote ID, source ID, and synchronization result. Exclude tokens, cookies, ingest URLs, and stream keys.

---

### Task 13: Promote the exact accepted revision and smoke production

**Files:**
- Create: `evidence/alice-livestream/2026-07-18/production/promotion.json`
- Create: `evidence/alice-livestream/2026-07-18/production/smoke.json`

**Interfaces:**
- Consumes: accepted source, build, local, Modal, and platform manifests.
- Produces: production routing to the same artifact and explicit rollback metadata.

- [ ] **Step 1: Verify artifact identity without rebuilding**

```bash
mkdir -p evidence/alice-livestream/2026-07-18/production
```

Compare Milady SHA, stream SHA, launcher SHA, Modal revision, and image digest with `staging/deploy.json`. Any mismatch blocks promotion and requires new staging acceptance.

- [ ] **Step 2: Promote on established rails**

Route production Alice to the accepted Modal revision. If 555stream or 555-bot changes require promotion, use their host-side/manual deployers and verify deploy-host checkout plus live state. Do not add GitHub Actions.

- [ ] **Step 3: Run minimal production smoke**

Verify health 200, protected route 401 without auth and 200 with auth, Milady #9, chat, populated action drawer, Go Live open/scroll, and capture stopped. A second public stream is unnecessary unless production routing changes media bytes or staging proof is stale.

- [ ] **Step 4: Record rollback**

Read the immediately previous Modal revision from deployment state before changing routing. Use `apply_patch` to record that exact revision with Milady rollback `e855a9bb16e9b19809e4ac0d8f93fb5effb672d0`, Eliza runtime `17930c97b97cedb8fe64124e327c023cd526cc8b`, and rollback condition `health, auth, identity, actions, capture, or playback regression`.

---

### Task 14: Tear down staging and publish a redacted evidence index

**Files:**
- Create: `evidence/alice-livestream/2026-07-18/README.md`
- Modify: `evidence/alice-livestream/2026-07-18/staging/window.json`

**Interfaces:**
- Consumes: all final evidence.
- Produces: zero-idle staging and a navigable acceptance packet.

- [ ] **Step 1: Stop both Modal apps**

```bash
~/.venvs/modal/bin/modal app stop alice-runtime --yes
~/.venvs/modal/bin/modal app stop alice-capture-service --yes
~/.venvs/modal/bin/modal app list
```

Expected: no active Alice runtime/capture tasks.

- [ ] **Step 2: Close the window manifest**

Set status to `torn-down`, add `stoppedAt`, and record redacted `modal app list` readback. If a task remains, status is `teardown-failed` and completion is blocked.

- [ ] **Step 3: Build the evidence index**

Link release SHAs, assets, build/tests, local screenshots and browser observations, Modal revisions, auth/chat/action smoke, Twitch emote proof, Twitch game/application plus Alice PiP proof, production readback, teardown, and rollback.

- [ ] **Step 4: Scan for secrets**

Run the repository scanner plus targeted checks for bearer values, URL-fragment tokens, RTMP URLs, Twitch keys, cookies, and private keys. Expected: zero findings. Do not commit a tracked binary that once contained a secret.

- [ ] **Step 5: Commit only policy-allowed evidence**

Store large screenshots/logs according to existing evidence policy; Git records stable links and content hashes when binaries belong in object storage.

---

### Task 15: Scope the current-Eliza fold as a separate follow-up

**Files:**
- Create: `docs/superpowers/specs/alice-current-eliza-fold-follow-up.md`

**Interfaces:**
- Consumes: protected divergence registry and accepted recovery release.
- Produces: a separate upstream project; no current-Eliza code enters this branch.

- [ ] **Step 1: Define follow-up parity gates**

Require current upstream inventory/commit range, protected divergence matrix, first-party companion, Milady #9/assets, chat/actions/pills/bubbles/Go Live, camera, source plus PiP, synchronized operator/capture state, and the same local/Modal/platform proof gates.

- [ ] **Step 2: State the exclusion explicitly**

Implementation begins only after recovery acceptance. This task adds no Eliza source, patch, dependency, or submodule movement.

- [ ] **Step 3: Commit the follow-up spec**

```bash
git add docs/superpowers/specs/alice-current-eliza-fold-follow-up.md
git commit -m "docs(alice): scope current Eliza fold after recovery"
```

---

## Completion Gate

- Production runs the recorded release SHAs and pinned Eliza runtime.
- Milady #9 and verified thumbnail/assets load locally, on direct Modal, and in production.
- Chat, action pill/drawer, avatar actions, action bubbles, and Go Live work.
- Go Live passes desktop, mobile, and short-height scroll/overflow checks.
- Camera reaches visible Twitch playback.
- One Alice emote is visible in operator and Twitch from the same stream window.
- One game/application is primary with Alice PiP, and a PiP emote reaches Twitch.
- No duplicate Alice instance, sustained 401/429 loop, missing-export error, black screen, or hidden footer remains.
- Production points to the exact accepted Modal revision without rebuild.
- Both Modal staging apps are stopped and app-list readback confirms no active test task.
- Evidence is redacted, indexed, tied to rollback, and separates each proof boundary.
- Current Eliza upstream work remains a separate follow-up.
