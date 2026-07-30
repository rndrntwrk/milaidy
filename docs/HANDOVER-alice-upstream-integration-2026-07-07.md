# Alice Upstream Integration — HANDOVER

**Prepared:** 2026-07-09 (program dated 2026-07-07 to match the branch). **Status:** planning + assessment complete, foundation not yet started. **Read this first** for any work on bringing upstream into Alice.

---

## 1. Goal (founder directive, 2026-07-07)

Bring EVERYTHING upstream has shipped into Alice, combined intelligently with all of Alice's existing functionality, with **ZERO regression** to any Alice surface. Two upstreams:

- **milady** `develop` @ `4e721ad04` (2026-06-24) — our fork `rndrntwrk/milaidy`, remote `upstream` = `milady-ai/milady`.
- **elizaOS** latest `develop` @ `d7d3ed31a3d` (2026-07-08) — the `eliza/` checkout (gitignored), remote `origin` = `elizaOS/eliza`.

Founder decisions (binding):
- Both folds proceed, on **SEPARATE branches** (never combined in one branch).
- Eliza target = **latest `develop`**, pinned to the exact SHA `d7d3ed31a3d` (develop is force-pushed/rewriting; never track the moving branch).
- Strategy = **surgical PORT** of everything onto Alice's topology, not a git merge (see §2).
- "you now need to be intelligent about how you combine all that with all of alices stuff."

## 2. The key discovery — PORT, do not MERGE

**Alice is a deep fork, not a downstream branch.** It rebranded milady's packages into an `@miladyai/*` namespace vendored under `packages/` (`ui`, `shared`, `agent`, `app-core`, `plugin-selfcontrol`), builds local-mode (`workspace:*` against the `eliza/` checkout), and on the eliza side upstream relocated the companion out of `plugins/app-companion` into `packages/ui/src/companion/`.

A full `git merge upstream/develop` was attempted and **proven to be the wrong tool** (WIP commit `e0edc320b`, branch `sync/milady-develop-2026-07-07`):
- 491 files changed, but **ZERO under `packages/`** — Alice's runtime is untouched (no regression, but no improvement either).
- ~397 of those files are infra Alice's Modal runtime never deploys (homepage, skills, `.claude`, android, systemd, CI).
- The 24 `apps/app/src` files that landed are upstream's new **feature** files (gold home, SOC2 secure-store/security, mobile boot) — they import `@elizaos/*` and are **UNWIRED** into Alice's kept-ours `main.tsx`. Dead code, zero benefit, latent build-break risk if any becomes reachable.

Conclusion: upstream work is authored against `@elizaos/*`; it must be **translated to `@miladyai/*` where Alice forked the package and WIRED into Alice's entry**, feature by feature, each verified. `e0edc320b` is kept ONLY as a merge-base reference / a convenient place to read upstream's file contents from.

## 3. The map — branches, commits, worktrees

| Branch | Commit | Worktree | Purpose |
|--------|--------|----------|---------|
| `deploy/alice-companion-render` | `e855a9bb1` | `milaidy/` (main checkout) | Alice's live tip. UNTOUCHED. Do not disturb. |
| `integration/alice-upstream-2026-07-07` | `218d936f8` | `.worktrees/milaidy-integration-alice-upstream-2026-07-07` | **ACTIVE.** Milady-side feature ports land here (WP0–WP5). Holds the plan + this handover + PROTECTED_DIVERGENCES.md. |
| `sync/milady-develop-2026-07-07` | `e0edc320b` | `.worktrees/milaidy-sync-milady-develop-2026-07-07` | **REFERENCE ONLY** (full-merge WIP). Do not build on it. Kept so upstream file contents are readable and the merge-base is recorded. |

Upstream anchor refs: milady `upstream/develop` = `4e721ad04`; elizaOS `develop` = `d7d3ed31a3d` (force-pushed); elizaOS `v2.0.3` tag = `fa240156ed9` (a stable alternative, NOT chosen); our `eliza/` HEAD = `17930c97b9` (`fix/alice-companion-restoration`).

Both work branches were pushed to `origin` on handover (see §8). The main checkout stays on `deploy/alice-companion-render`, clean.

## 4. The plan

Source of truth: **`docs/superpowers/plans/2026-07-07-alice-upstream-integration.md`** (on this branch). Six sequenced work-packages, each with its port approach onto `@miladyai/*` and its no-regression verification:

- **WP0** Foundation: green build/verify baseline + carry PROTECTED_DIVERGENCES.md (done) + surface inventory. The no-regression gate everything else measures against.
- **WP1** Browser-bundle / vite hardening (`addd272fe`, `83e7c4577`, `546e8d77e`) — founder priority #1; may let us RETIRE custom vite patches.
- **WP2** Gold home screen (`3c58d287b`) + VoicePill (`f3fcabf88`, `85acaf996`).
- **WP3** SOC2 client + security hardening (`22f741a8f`; secure-store/security modules).
- **WP4** Android / iOS local-runtime boot (`85a9341e2` et al.).
- **WP5** Infra: K8s hardening (`90afd6b70`), CI/SDLC.
- **WP6** Eliza fold to `d7d3ed31a3d` on a SEPARATE branch: companion re-home (`plugins/app-companion/*` -> `packages/ui/src/companion/*`) + re-anchor ~250–320 of the 505 patches. Gets its own detailed sub-plan.

## 5. Assessment findings (preserved in-repo)

Committed alongside this handover under `docs/upstream-integration-evidence/`:
- `RECONCILIATION_FINDINGS.md` — the full assessment (milady delta, eliza delta, target decisions, the port-not-merge discovery). READ for the numbers.
- `patch_target_files.txt` — the 65 eliza source files the patch chain touches (the collision surface).
- `eliza_anchor_survival.tsv` — per-file survival of the 65 anchors against upstream.
- `milady_merge_intersection.txt` — the 49 both-sides-changed files from the milady merge.

Headline numbers: milady fold = MEDIUM (49 real conflicts, 0 `packages/`); eliza fold = HIGH/VERY-HIGH (~50–60% of 505 anchors need manual re-home, companion relocated, patch script fails SILENTLY on drifted anchors). pglite stays `^0.4.5` (elizaOS `plugin-sql` still requires `0.4.0`; upstream's `0.5.1` is a trap).

## 6. EXACT next steps

1. **WP0 Step 1 (isolated eliza checkout):** the integration worktree has no `eliza/`. Give it its OWN checkout (clone or copy `milaidy/eliza`, do NOT symlink — `bun install` postinstall runs the 505-patch chain and would mutate a shared checkout). For WP0–WP5 the eliza stays at `17930c97b9`; WP6 advances its own eliza to `d7d3ed31a3d`.
2. **WP0 Step 2–4:** `bun install`, then `bun run verify` + `bun run test` + the patch-chain drift gate (`scripts/apply-alice-eliza-runtime-patches.test.ts`). Record the GREEN baseline. If Alice's tip is not green here, that is the true starting state; fix minimally and note it.
3. **WP0 Step 6:** write `docs/alice-surface-inventory-2026-07-07.md` — the regression checklist (exact file:symbol for `/companion`, `/api/emote` broadcast relay, `/api/companion/stage`, operator routes, go-live, `/health`).
4. **WP1:** read the three browser-bundle diffs against `e0edc320b`, reconcile with Alice's protected `@elizaos/agent` vite stub, retire what upstream now covers.

## 7. Hard invariants / traps (do not regress these)

- pglite `^0.4.5` in both `dependencies` and `overrides` (verify command in the plan's Global Constraints).
- `libsignal` override `6.0.0` (npm, not git+https).
- Keep `@miladyai/*` namespace + local-mode build spine. `@elizaos/*` imports of packages Alice did NOT fork resolve from the eliza checkout and stay as-is.
- Preserve every Protected Divergence — see `PROTECTED_DIVERGENCES.md` (carried onto this branch): 16 patch-chain sentinels, >=29 source-main packages, the vite browser-stub alias, the PGlite client-lock self-heal, the agent-orchestrator-compat sync `require`.
- The patch script (`scripts/apply-alice-eliza-runtime-patches.mjs`) SKIPS drifted anchors and only logs — apply-time breaks become RUNTIME regressions. WP6 must add an assertion mode that fails loudly on any un-applied anchor.
- Alice-owned surfaces that must keep working: `/companion` render (VRM canvas + `GlobalEmoteOverlay`, `isPhoneCompanionMode`/`CompanionShell`), `/api/emote` + stream555 broadcast relay, `/api/companion/stage`, operator action routes, go-live, coding-agent fallback, Telegram account-auth, LifeOps, `/health` startup contract.
- Commits: author `rndrntwrk <dev@rndrntwrk.com>`, no `Co-Authored-By`, no AI attribution, no em dashes.
- Follow `docs/ALICE_UPSTREAM_SYNC_DEPLOY_WORKBOOK.md` for the eliza-side patch/deploy loop; its §"Port, do not merge" note (added this session) records the fork learning.

## 8. Housekeeping done at handover

- Assessment artifacts moved from ephemeral scratchpad into `docs/upstream-integration-evidence/` (committed).
- `PROTECTED_DIVERGENCES.md` carried onto this branch (was only on `chore/protected-divergences-registry`).
- Memory `project_alice_upstream_integration.md` written; MEMORY.md index compacted.
- Sync workbook updated with the port-not-merge learning.
- Both branches pushed to `origin`.
- Main checkout verified clean and on `deploy/alice-companion-render`. No stray state.
