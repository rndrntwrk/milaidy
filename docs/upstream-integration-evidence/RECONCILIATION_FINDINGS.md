# Alice Upstream Reconciliation — Findings (in progress)

## Fixed decisions
- BASE for new reconciliation branch = `deploy/alice-companion-render` (tip e855a9bb1, 2026-06-03) in milaidy repo.
  Strict superset of `alice`; all prior codex/sync/chore upstream attempts already folded in.
- Carry-forward (ONLY copies, else lost):
  1. `PROTECTED_DIVERGENCES.md` — lives only on `chore/protected-divergences-registry` (a7a408d59).
  2. 7 apps/app commits on `chore/upstream-milady-sync-2026-05-13` (789c7017d..9ee7327ce) — verify vs deploy's later work before porting.
- Nested eliza checkout: milaidy/eliza, HEAD = fix/alice-companion-restoration @ 17930c97b9. No sibling eliza branch holds unique work.

## Governing artifacts
- Workbook: milaidy/docs/ALICE_UPSTREAM_SYNC_DEPLOY_WORKBOOK.md (sync loop + recovery invariants).
- Registry: PROTECTED_DIVERGENCES.md (machine-verifiable gate).
- Patch chain: scripts/apply-alice-eliza-runtime-patches.mjs (7417 lines, ~505 anchors, 16 sentinels, 29 source-main pkgs).
  Touches 65 eliza source files (see scratchpad/patch_target_files.txt): app-core 16, ui 15, core 11, app-companion 7, agent 4, plugin-sql 2, plugin-elizacloud 2, apps/app 2, + telegram/vincent/lifeops/babylon/shared/app.
- Rule: upstream syncs via dedicated `sync(upstream): ...` PR, never direct to alice.

## MILADY delta (upstream milady-ai/milady develop) — DONE
- upstream/develop tip = 4e721ad04 (2026-06-24); merge-base 0e5d9c0f6 (2026-05-07).
- deploy is 544 BEHIND / 1111 ahead. Upstream touched 528 files.
- True conflict intersection = 49 both-sides-changed files. ZERO packages/ conflicts (all Alice runtime under packages/ merges clean).
- Difficulty: MEDIUM.
- Hard files (manual resolution):
  1. apps/app/vite.config.ts — dual ~1500-line rewrite; both target elizaos-agent-browser-stub.ts. Upstream browser-bundle hardening (addd272fe, 83e7c4577) may let us RETIRE custom patches.
  2. apps/app/src/main.tsx — upstream +760 (android/iOS boot, @elizaos/ui shell) vs our companion/emote/stage wiring; companion logic must survive on top.
  3. root package.json — pglite SILENT DRIFT (base & ours ^0.4.5, upstream ^0.5.1; merge takes 0.5.1 with NO conflict marker). Must decide + re-pin. libsignal GREEN (upstream converged on our 6.0.0 npm).
  4. .github/workflows/release-electrobun.yml (+build-cloud-image.yml, agent-release.yml) — largest CI churn.
  5. scripts/lib/sync-eliza-env-aliases.mjs (+.test.ts), read-package-json.mjs, upstreams.lock.json — we gutted, upstream extended; upstreams.lock.json governs which eliza the build resolves.
- Protected-divergence jeopardy: pglite = RED (silent), libsignal = GREEN, vite.config = RED (intent converges).
- Top upstream features to gain: gold home screen+wallet (3c58d287b), android local runtime boot (85a9341e2), VoicePill (f3fcabf88), MLX plugin (#2144), SOC2 client hardening (22f741a8f), K8s hardening (90afd6b70), browser-bundle fixes (addd272fe, 83e7c4577), externalize @elizaos/vault (546e8d77e).
- pglite decision is COUPLED to eliza bump (plugin-sql required pglite version). Resolve together.

## ELIZA delta (elizaOS/eliza) — fetch DONE, agent #13 analyzing churn/pglite (pinned to June-1 SHA)
- Our eliza HEAD = 17930c97b9 (fix/alice-companion-restoration, June 3) = our alpha-line fork + 13 Alice commits.
- Fork base ~2026-05-11 (merge-base 30c595e10e), on the 2.0.0-alpha.* line.
- FRESH develop tip = d7d3ed31a3d (2026-07-08) — **elizaOS FORCE-PUSHED develop** (history rewrite). Our HEAD 9080 behind. Unstable moving target.
- **STABLE RELEASE TAGS exist:** v2.0.0 (05-18), v2.0.1/v2.0.2 (05-19), v2.0.3 (05-20 = latest stable). Our HEAD is 3776 behind v2.0.3 (ahead 13). v2.0.3 NOT on current develop lineage (force-push detached it).
- Eliza pin lives in deploy branch `upstreams.lock.json`: elizaCommit 05c636c004bf (April 28), 2.0.0-alpha.83/139 versions. STALE vs actual checkout (June 3). Upstream milady EMPTIED upstreams.lock.json (the intersection conflict).
- milady builds @elizaos/* via npm `alpha` dist-tag (packages mode); eliza GIT ref governed by Alice deploy checkout, not milady lock. => eliza-target choice is ours.

### ELIZA-TARGET RECOMMENDATION (for founder decision)
- **v2.0.3 (May 20 stable tag): +3776 from base, FIXED/TESTED. RECOMMENDED.**
- fresh develop (July 8): +9080, force-pushed/unstable. NOT recommended.
- Rationale: force-push proves develop is a rebasing target; v2.0.3 is the graduated-stable of our own alpha line. ~7 weeks old but tagged+tested.
- Even v2.0.3 is a big jump (3776 commits) over 65 patched files; agent #13 quantifies re-anchor cost.

## Fresh milady tip (for the merge): upstream/develop = 4e721ad04 (2026-06-24).

## ELIZA delta — AGENT #13 DONE. Difficulty HIGH/VERY-HIGH (re-architecture, not re-anchor).
- pglite RESOLVED: plugin-sql at new eliza still requires ^0.4.0 (== our HEAD). Alice STAYS ^0.4.x. => milady RED finding settled: after milady merge, RE-PIN pglite back to ^0.4.x (upstream's 0.5.1 would break eliza plugin-sql).
- 65 targets: 33 CHANGED, 8 survive-unchanged, 24 "deleted" = really 10 genuine removals + 9 Alice-additive + 5 path-variant/stub.
- 10 genuine removals (hard breaks): apps-routes.ts; onboarding trio (contracts/onboarding, onboarding-state, onboarding-bootstrap); ENTIRE app-* plugin tree (app-companion/babylon/vincent/lifeops) deleted in ba5ef20beb -> companion RELOCATED to packages/ui/src/companion/ + registry entry apps/companion.json.
- Patch script is LAYOUT-AWARE (detects entry, overwrites main+exports dynamically) so source-main rewrite adapts. Browser-stub survives. No package renames.
- Recovery invariant drift: SECRET_KEY_ALIASES/resolveSecretKeyAlias MOVED index.node.ts -> constants/secrets.ts (re-exported, imports still resolve, definition-site anchor drifts). cloud-api-key moved agent->plugin-elizacloud (script already handles).
- Re-anchor cost: ~250-320 of ~505 anchors (~50-60%) manual. Script fails SILENTLY (skips drifted anchors) => runtime regressions not build crashes. Insidious.
- Top-5 pain: (1) app-companion relocation to packages/ui/src/companion [CORE OF ALICE], (2) agent/src/runtime/eliza.ts, (3) ui/src/App.tsx, (4) ui client-agent/client-base, (5) deleted onboarding+apps-routes.

## TARGET DECISION DATA: v2.0.3 (May 20 stable) vs develop (July 8 force-pushed)
- v2.0.3 AVOIDS: onboarding deletion (onboarding.ts still exists at v2.0.3), vite core-bundle change (13c339f2b7 later), plugin-scan-cache (2aba078e7a later). Halves mega-file churn (eliza.ts +389/-148 vs +1340/-441; App.tsx +378/-32 vs +1172/-604; client-agent +591/-342 vs +1204/-347).
- v2.0.3 does NOT avoid: app-companion relocation (ba5ef20beb IS in v2.0.3) + apps-routes deletion (GONE in v2.0.3). Companion re-home is unavoidable at any stable target.
- => RECOMMEND eliza target = v2.0.3. +3776 commits, stable/tagged, meaningfully easier than develop.

## BRANCH A EXECUTION OUTCOME + PIVOT FINDING (2026-07-07)
- Worktree: .worktrees/milaidy-sync-milady-develop-2026-07-07, branch sync/milady-develop-2026-07-07.
- Merged upstream/develop (4e721ad04). 34 conflicts, ALL resolved preserving Alice topology. WIP merge commit e0edc320b (identity rndrntwrk, no attribution).
- Resolution rules used: DU (7 gutted eliza-tooling scripts)=keep deleted; UD (upstreams.lock.json, Dockerfile.ci)=keep ours; package.json + build scripts=keep ours (Alice local-mode spine); pglite pinned ^0.4.5; main.tsx + vite.config.ts + @miladyai namespace files=keep ours (upstream @elizaos/* versions would break Alice); .gitignore + .env.example=union.
- KEY DISCOVERY (decisive): full-merge does NOT update Alice.
  - 0 packages/ changed (Alice @miladyai runtime untouched: no regression, no improvement).
  - 491 files but ~397 are infra Alice's Modal runtime never deploys (homepage/skills/.claude/android/systemd/CI).
  - 24 apps/app/src landed = upstream NEW feature files (gold home MiladyHomeScreen, SOC2 secure-store/security, mobile/ios/android boot). They import @elizaos/* and are UNWIRED into Alice's kept main.tsx => dead code, zero benefit, latent build-break risk if reachable.
  - Root cause: Alice is a DEEP FORK (@miladyai/* namespace under packages/ + local-mode build + companion relocated). Upstream work is authored vs @elizaos/* and must be PORTED, not merged.
- RECOMMENDATION: pivot milady fold from full-branch-merge to SURGICAL PORT of specific valuable features (gold home, VoicePill, SOC2 hardening, browser-bundle fixes addd272fe/83e7c4577, specific runtime fixes) onto Alice @miladyai topology, each verified, no regression. Keep e0edc320b as merge-base reference.
- Eliza fold (Branch B) will be the SAME fork-porting nature, worse (companion relocation). Same pivot logic applies.

## FOUNDER DECISIONS (2026-07-07) — BINDING
- BOTH folds proceed, but on SEPARATE branches (NEVER combined in one branch).
- Eliza target = LATEST develop (force-pushed). Pin to current tip SHA d7d3ed31a3d (2026-07-08) so the rewriting branch can't move under us.
- HARD CONSTRAINT: under NO circumstance may any Alice functionality regress. Companion/emote/operator/go-live/avatar/stage all must survive + be verified. Silent-skip anchor drift is the enemy; every one of 505 patches lands or is provably re-homed.
- Regression guards: Protected Divergences Registry + drift gates (sentinels, 29 source-main floor, lifeops subpaths) + live Alice-surface smoke.

## SYNTHESIS RECOMMENDATION (for founder sign-off)
1. DECOUPLE the two folds. Milady fold = MEDIUM (49 files, clean packages/, big feature win). Eliza fold = HIGH (companion re-architecture). Different risk profiles.
2. PHASE 1 (do first): milady upstream/develop -> new branch off deploy/alice-companion-render. Carry PROTECTED_DIVERGENCES.md + 7 apps/app commits. Re-pin pglite ^0.4.x post-merge. Reconcile vite.config (maybe retire patches via upstream hardening) + main.tsx. Gated sync(upstream) PR.
3. PHASE 2 (separate, harder): eliza fork -> v2.0.3. Re-home companion patches to packages/ui/src/companion. Re-anchor mega-files. Adapt patch chain. Keep onboarding (v2.0.3 has it). This is a real project, not a merge.
4. pglite stays ^0.4.x. libsignal already converged.

## Open strategic questions for founder sign-off
1. How far to jump ELIZA (the risky leg): latest develop vs a pinned elizaOS release/tag, one shot vs staged.
2. pglite: hold ^0.4.x or accept upstream ^0.5.1 (must match new eliza plugin-sql expectation).
3. vite.config: adopt upstream's browser hardening and retire our patches, or preserve our alias.
4. Scope: pull milady's SOC2/K8s/android features now, or minimal runtime-only sync.
