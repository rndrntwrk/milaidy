# Alice Upstream Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan work-package by work-package. Steps use checkbox (`- [ ]`) syntax for tracking. This is a MASTER plan: WP0 is fully detailed; WP1–WP6 carry scope + upstream sources + port approach + verification, and their bite-sized code steps are written at the start of each work-package (after WP0 makes the build green and the real diff is analyzable). Do NOT attempt to write no-placeholder code for a feature before its upstream diff is in front of you.

**Goal:** Port everything upstream has shipped (milady `develop` @ `4e721ad04`, 2026-06-24, and elizaOS latest `develop` @ `d7d3ed31a3d`, 2026-07-08) into Alice, combined intelligently with all of Alice's existing functionality, with ZERO regression to any Alice surface.

**Architecture:** Alice is a deep fork, not a downstream branch: milady's packages are rebranded into an `@miladyai/*` namespace vendored under `packages/`, the build runs local-mode (`workspace:*` against the `eliza/` checkout), and on the eliza side upstream has relocated the companion out of `plugins/app-companion` into `packages/ui/src/companion/`. A `git merge` of upstream therefore churns ~397 Alice-irrelevant infra files and leaves upstream's features UNWIRED (dead `@elizaos/*`-importing files Alice's `main.tsx` never imports). So we PORT each feature onto Alice's `@miladyai/*` topology and WIRE it into Alice's entry, never merge. Work is split across two branches (founder directive: never one combined branch): milady-side feature ports on `integration/alice-upstream-2026-07-07`; the eliza latest-`develop` fold on a separate branch (WP6).

**Tech Stack:** bun, tsdown (backend), vite + React 19 (SPA), TypeScript 6, elizaOS runtime, PGlite 0.4.x, Modal (deploy). Local-mode build resolves `@elizaos/*` from the `eliza/` checkout and `@miladyai/*` from `packages/`.

## Global Constraints

- ZERO Alice functionality regression. The regression checklist (WP0 Step 6) is the gate for every work-package.
- pglite stays `^0.4.5` in both `dependencies` and `overrides` (elizaOS `plugin-sql` at every current ref still requires `^0.4.0`; upstream's `^0.5.1` bump must NOT be adopted). Verify: `node -e "const p=require('./package.json');process.exit(p.dependencies['@electric-sql/pglite'].startsWith('^0.4')&&p.overrides['@electric-sql/pglite'].startsWith('^0.4')?0:1)"`
- `libsignal` override stays `6.0.0` (npm, not git+https).
- Preserve every Protected Divergence (see `PROTECTED_DIVERGENCES.md`, to be carried onto this branch in WP0): the 16 patch-chain sentinels, the ≥29 source-main packages, the vite `@elizaos/agent` browser-stub alias, the pglite/libsignal pins, the PGlite client-lock self-heal, the agent-orchestrator-compat sync require.
- Keep Alice's `@miladyai/*` namespace and local-mode build spine. Upstream code authored against `@elizaos/*` is translated to `@miladyai/*` where Alice forked the package (`ui`, `shared`, `agent`, `app-core`, `plugin-selfcontrol`); `@elizaos/*` imports of packages Alice did NOT fork resolve from the eliza checkout and stay as-is.
- Alice-owned surfaces that must keep working after every WP: `/companion` render (VRM canvas + `GlobalEmoteOverlay`), `/api/emote` + broadcast relay to stream555, `/api/companion/stage`, operator action routes, go-live control, coding-agent fallback, Telegram account-auth, LifeOps, `/health` startup contract.
- Commits: author `rndrntwrk <dev@rndrntwrk.com>`, no `Co-Authored-By`, no AI attribution, no em dashes in user-facing text. Contract deploys via Circle SCP only (not relevant here but standing).
- Reference (do not merge from): full-merge WIP `e0edc320b` on `sync/milady-develop-2026-07-07` is kept only as a merge-base snapshot / source of upstream file contents to cherry-read.

## Reference material (already produced, in scratchpad)

- `scratchpad/RECONCILIATION_FINDINGS.md` — full assessment: milady delta, eliza delta, target decisions, the discovery that a full merge is the wrong vehicle.
- `scratchpad/patch_target_files.txt` — the 65 eliza source files the patch chain touches.
- Milady upstream features (SHAs): gold home `3c58d287b`, android boot `85a9341e2`, VoicePill `f3fcabf88` + `85acaf996`, MLX plugin `#2144`, SOC2 client `22f741a8f`, K8s hardening `90afd6b70`, browser-bundle fixes `addd272fe` + `83e7c4577`, externalize `@elizaos/vault` `546e8d77e`.
- Eliza structural (blast radius): app-* tree delete + companion relocate `ba5ef20beb`; onboarding delete `ec2e2e0d3c`; apps-routes delete `f43a4c224f`; `SECRET_KEY_ALIASES` moved to `packages/core/src/constants/secrets.ts`; `cloud-api-key` moved agent→plugin-elizacloud.

---

## Verification model (the no-regression gate)

Fast local gate, run in the integration worktree with the eliza checkout linked (WP0):

```bash
bun run verify        # tsc --noEmit + biome lint
bun run test          # parallel unit suite
node scripts/apply-alice-eliza-runtime-patches.test.ts   # patch-chain drift gate (sentinels + 29 source-main floor)
```

Full gate before any PR: `bun run build` (tsdown backend + vite SPA) plus a boot smoke that hits `/health`, `/companion` (canvas + emote overlay present), `/api/emote` (broadcast relay outcome), operator action, go-live. If local `build` OOMs (known: vite SPA at ~24GB), fall back to the Modal build (`scripts/awsless/modal/alice_runtime.py`) as the build oracle and smoke the deployed URL.

---

## Work-package decomposition (sequenced)

| WP | Title | Branch | Depends on | Risk |
|----|-------|--------|-----------|------|
| WP0 | Foundation: green baseline + carry PROTECTED_DIVERGENCES + surface inventory | integration | — | low |
| WP1 | Browser-bundle / vite hardening + `@elizaos/vault` externalize | integration | WP0 | med |
| WP2 | Gold home screen + VoicePill overlay | integration | WP0 | med |
| WP3 | SOC2 client + security hardening (secure-store, signed updates, sandbox) | integration | WP0 | med |
| WP4 | Android / iOS local-runtime boot | integration | WP0 | low (mobile, off Alice's Modal critical path) |
| WP5 | Infra: K8s hardening, CI/SDLC improvements | integration | WP0 | low |
| WP6 | Eliza fold to latest `develop` (`d7d3ed31a3d`): companion re-home + patch re-anchor | SEPARATE branch | WP0 baseline method | HIGH |

Sequencing rationale: WP0 must be green before anything. WP1 first among features (founder priority + closest to Alice's live-broadcast goal, and upstream's browser-bundle fixes may let us RETIRE custom vite patches). WP2/WP3/WP4/WP5 are independent milady-side ports. WP6 (eliza) is the large re-architecture, on its own branch per the founder directive, planned in its own detailed sub-plan (`docs/superpowers/plans/2026-07-XX-alice-eliza-fold.md`) written when WP0's method is proven.

---

## WP0 — Foundation: green baseline, carry protected divergences, surface inventory

**Files:**
- Create: `PROTECTED_DIVERGENCES.md` (carry from `chore/protected-divergences-registry:PROTECTED_DIVERGENCES.md`)
- Create: `docs/superpowers/plans/2026-07-07-alice-upstream-integration.md` (this file)
- Modify: none (baseline only)
- Verify against: the eliza checkout linked at `eliza/`

**Interfaces:**
- Produces: a green `bun run verify` + `bun run test` + patch-chain drift-gate on the unmodified Alice tip; a committed `PROTECTED_DIVERGENCES.md`; a written surface inventory (`docs/alice-surface-inventory-2026-07-07.md`) enumerating the exact routes/components each Alice surface uses, which becomes the per-WP regression checklist.

- [ ] **Step 1: Link the eliza checkout into the integration worktree.** The worktree has no `eliza/` (gitignored). Symlink the existing checkout so local-mode resolves: `ln -s "/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/eliza" "<worktree>/eliza"` (read-only use in WP0–WP5; WP6 gets its own eliza checkout on its own branch so it can advance to `develop` without disturbing this one). Verify `ls eliza/packages/app-core/package.json` resolves.

- [ ] **Step 2: Install.** `bun install`. Expected: resolves `@miladyai/*` from `packages/`, `@elizaos/*` from `eliza/`. Capture any resolution error as a real finding (do not paper over).

- [ ] **Step 3: Baseline verify.** `bun run verify`. Record the exact result. If Alice's tip is not green here, that is the true starting state; fix only what is needed to reach green, and note it. A feature port cannot be judged no-regression against a red baseline.

- [ ] **Step 4: Baseline drift gate.** Run the patch-chain drift gate `bunx vitest run scripts/apply-alice-eliza-runtime-patches.test.ts` (and `scripts/startup-e2e-script-drift.test.ts` if present). Record green.

- [ ] **Step 5: Carry PROTECTED_DIVERGENCES.md.** `git show chore/protected-divergences-registry:PROTECTED_DIVERGENCES.md > PROTECTED_DIVERGENCES.md`. This is the only copy anywhere; it must live on the integration branch so every WP's pre-PR gate can run its verification commands. Commit: `git add PROTECTED_DIVERGENCES.md && git commit -m "chore(alice): carry protected-divergences registry onto integration branch"`.

- [ ] **Step 6: Write the surface inventory (regression checklist).** Enumerate, with exact file:symbol references, how each Alice-owned surface is wired today: `/companion` (`apps/app/src/main.tsx` `isPhoneCompanionMode`, `CompanionShell`, `GlobalEmoteOverlay`), `/api/emote` + broadcast relay (`eliza/packages/agent` emote route → stream555), `/api/companion/stage`, operator action routes, go-live control, `/health` contract. Save to `docs/alice-surface-inventory-2026-07-07.md`. Commit. Every later WP re-verifies each item after its port.

- [ ] **Step 7: Commit the plan.** `git add docs/superpowers/plans/2026-07-07-alice-upstream-integration.md && git commit -m "docs(alice): master upstream-integration plan"`.

---

## WP1 — Browser-bundle / vite hardening + `@elizaos/vault` externalize

**Upstream sources:** `addd272fe` (stop importing runtime plugin-task-coordinator into browser bundle), `83e7c4577` (exclude `@elizaos/agent` from renderer dep-prebundle + harden node-builtin stub Proxy), `546e8d77e` (externalize `@elizaos/vault` in tsdown node bundles).

**Port approach:** These target `apps/app/vite.config.ts` and the tsdown config, both of which Alice has diverged (the protected `@elizaos/agent` browser-stub alias). Read the three upstream diffs against `e0edc320b`'s copies. Reconcile upstream's `packageAgnosticAliases` + prebundle-exclusion with Alice's `resolve.alias` + `fs.existsSync` guard: prefer adopting upstream's approach and RETIRING Alice's custom alias where upstream now covers the same server-code-leak, keeping the `elizaos-agent-browser-stub.ts` target. Keep the vite change Alice-namespace-correct (`@miladyai/*` where forked).

**Verification:** `bun run build` must produce a working `apps/app/dist`; `/companion` renders canvas + emote overlay; no `@elizaos/agent` server names leak into the SPA bundle (grep the built bundle for a known server-only symbol, expect absent). Protected-divergence check 3.1 still passes (or is deliberately updated in `PROTECTED_DIVERGENCES.md` with rationale, same commit).

**Detailed steps:** written at WP1 start from the three diffs.

---

## WP2 — Gold home screen + VoicePill overlay

**Upstream sources:** `3c58d287b` (Milady gold home screen + wallet widget → `apps/app/src/MiladyHomeScreen.tsx`, already present-but-unwired on `e0edc320b`), `f3fcabf88` + `85acaf996` (VoicePill overlay renderer + desktop PillRoot recording via `createVoiceCapture`).

**Port approach:** These new files import `@elizaos/*` UI/shared. Translate imports to `@miladyai/*` where Alice forked those packages; leave genuinely eliza-owned imports pointing at the eliza checkout. WIRE them into Alice's `apps/app/src/main.tsx` render tree WITHOUT displacing the companion/emote path (`isPhoneCompanionMode` must still route to `CompanionShell` + `GlobalEmoteOverlay`). Home screen and VoicePill are additive surfaces; they must not become the default over `/companion`.

**Verification:** home screen renders; VoicePill renders; `/companion` unchanged (canvas + emote overlay); go-live unaffected. UI change → invoke frontend-design + the taste skills; pixel-diff against canon per the taste rules.

**Detailed steps:** written at WP2 start.

---

## WP3 — SOC2 client + security hardening

**Upstream sources:** `22f741a8f` (secure storage, signed updates, sandbox → `apps/app/src/secure-store/*`, `apps/app/src/security/*`, already present-but-unwired on `e0edc320b`), plus `36325c7e6`/`37197b985` (SDLC + control-verification) as infra-adjacent.

**Port approach:** `secure-store/*` and `security/*` are new, mostly self-contained modules. Translate `@elizaos/*` imports to `@miladyai/*` where forked. Wire the secure-store backend selection into Alice's boot only where Alice actually persists tokens (reconcile with Alice's existing `MILADY_API_TOKEN`/self-hosted-token localStorage path in `main.tsx:359-413` — do NOT break the `/companion#token=` capture auth). Signed-update / trust-anchor verifier is desktop/mobile; gate it so it does not fire on the Modal server path.

**Verification:** `/companion#token=` auth still works (no 401 regression); secure-store unit tests pass; no new hard dependency that breaks the Modal backend build.

**Detailed steps:** written at WP3 start.

---

## WP4 — Android / iOS local-runtime boot

**Upstream sources:** `85a9341e2` (android local runtime boot in main.tsx), `94cc3b6c8` (JNI x86_64 + UTF-8), `97ed4ab27`/`2f7da08d5` (iOS on-device agent), `apps/app/src/{android,ios,mobile}-local-runtime-boot.ts` (present-but-unwired), `os/android/*` (landed via infra).

**Port approach:** Lowest priority for Alice's Modal broadcast goal; port for completeness. The boot files import `@elizaos/*`; translate where forked. Gate the mobile boot strictly behind the capacitor/native platform check so it is inert on the Modal server + web `/companion` path (no regression to the server render).

**Verification:** web `/companion` + server boot unaffected (mobile paths inert); android/iOS build only if a device target is being exercised.

**Detailed steps:** written at WP4 start.

---

## WP5 — Infra: K8s hardening + CI/SDLC

**Upstream sources:** `90afd6b70` (securityContext, NetworkPolicies, Trivy, cosign, Fluent Bit, DR runbook), `36325c7e6` (CODEOWNERS, branch protection, gitleaks, OIDC publish), `e3a51d973` (Trivy bump), the `.github/workflows/*` + `deploy/systemd/*` deltas.

**Port approach:** Mostly additive infra that landed cleanly in the full-merge and is Alice-deploy-adjacent. Cherry-read from `e0edc320b`. Apply only the pieces compatible with Alice's actual deploy (Modal + the stream-server webhook deployers); do NOT wire milady's GitHub-Actions release pipeline as Alice's deploy path. K8s hardening applies if/where Alice still has an EKS surface; otherwise document as reference.

**Verification:** no change to Alice's runtime; CI green.

**Detailed steps:** written at WP5 start.

---

## WP6 — Eliza fold to latest `develop` (SEPARATE branch)

**This is the large one and gets its own detailed sub-plan** (`docs/superpowers/plans/2026-07-XX-alice-eliza-fold.md`), written after WP0 proves the baseline method. Summary of scope so it is not lost:

- Target: elizaOS `develop` @ `d7d3ed31a3d` (2026-07-08), pinned to that exact SHA (develop is force-pushed; never track the moving branch).
- Branch: separate eliza-fold branch with its OWN `eliza/` checkout advanced to the pin; bump `upstreams.lock.json` to match.
- Core work: re-home the companion patches from `plugins/app-companion/*` to `packages/ui/src/companion/*` (upstream `ba5ef20beb`); re-anchor ~250–320 of the 505 patches in `scripts/apply-alice-eliza-runtime-patches.mjs`; handle onboarding deletion (`ec2e2e0d3c`), apps-routes deletion (`f43a4c224f`), `SECRET_KEY_ALIASES` move to `constants/secrets.ts`, `cloud-api-key` move to plugin-elizacloud.
- Anti-silent-skip: the patch script skips drifted anchors and only logs, converting apply-time breaks into runtime regressions. WP6 MUST add an assertion mode that fails loudly on any un-applied anchor, so no patch is silently dropped (direct no-regression requirement).
- Verification: patch-chain drift gate green with the assertion mode; full boot smoke of every Alice surface; the emote-on-broadcast path proven end to end.

---

## Self-review notes

- Spec coverage: every founder-priority area maps to a WP (companion/runtime+browser → WP1/WP6; gold home + VoicePill → WP2; SOC2/security → WP3; android/iOS → WP4; "everything" → WP5 infra + WP6 eliza).
- The one deliberate deferral: bite-sized code steps for WP1–WP6 are written at each WP's start, because no-placeholder code requires the specific upstream diff in front of the implementer and a green baseline to test against. WP0 is fully detailed and unblocks that.
- Type/name consistency to hold across WPs: `@miladyai/{ui,shared,agent,app-core,plugin-selfcontrol}` are Alice's forks; `@elizaos/*` of non-forked packages stay eliza-resolved; `isPhoneCompanionMode` / `CompanionShell` / `GlobalEmoteOverlay` are the companion render path that every WP must preserve.
