# Eliza submodule update plan

## TL;DR

**Current pin:** `f0c6fecaa2e8` (eliza submodule HEAD on alice)
**Upstream develop tip:** `be182cc913b3`
**Distance:** 866 commits behind, 0 commits ahead
**Stable target:** none — eliza is in pre-release v2.0.0-beta with no release tags after `v1.7.2` (Jan 2026). Practical target is `develop` tip, frozen to a specific commit at the start of the upgrade run.
**Risk profile:** moderate-high. Two patch anchors are definitively broken at the new tip; another two are at-risk; the rest probably survive but need verification.

## Why we have to do it

- Eliza upstream has 866 commits of accumulated bug fixes, security patches, and feature work since our pin.
- The patches that landed in this session (fs-extra, mammoth, isMiladyOS, basic-capabilities, open-access, contract guards) confirm we are running on a stale eliza branch where each new staging deploy keeps surfacing different module-init crashes hidden behind earlier ones. Each fix lets the next layer's bug fire. The supply of cached bugs is finite but unmeasured; an upstream pin bump is the only way to flush it.
- Our patches are anchored against exact source-text in eliza. Every additional week of drift makes more anchors brittle. Sooner = less re-anchoring work.

## Patch chain risk matrix

Mapping every active patch in `scripts/apply-alice-eliza-runtime-patches.mjs` to the eliza file it modifies, then probing whether its anchor still appears at upstream/develop tip:

| Patch | File | Upstream commits to file | Anchor probe at upstream tip | Drift risk |
|---|---|---|---|---|
| `applyAliceCoreBuildBrowserExternalsPatch` (fs-extra/graceful-fs) | `packages/core/build.ts` | 8 | `const browserExternals = [` + `"sharp"` + `"@hapi/shot"` still present | LOW |
| `applyAliceCoreBuildBrowserExternalsMammothPatch` | same file | (same 8) | composes after the prior patch's sentinel — works if the prior patch lands | LOW (transitive) |
| `applyAliceCoreBasicCapabilitiesBrowserSafePatch` | `packages/core/src/features/basic-capabilities/index.ts` | 11 | `} from "../plugin-manager/index.ts"` still present (count=1) | MEDIUM — anchor block surrounding the re-export is 11 lines; comment text in alice version may differ from upstream now |
| `applyAliceAppCoreCodingAgentsFallbackPatch` | `packages/app-core/src/api/server.ts` | 7 | `handleCompatRoute` still present, but the specific anchor matching `url.pathname === "/api/coding-agents"` resolution context likely shifted | **HIGH — rebuild required** |
| `applyAliceAppCoreCompanionStagePatch` | same file | (same 7) | structurally similar — `url.pathname` checks still appear 15× in upstream version | MEDIUM — companion-stage block must be re-located |
| `applyAliceAppCoreOpenAccessPatch` | `packages/app-core/src/api/trusted-local-request.ts` | 1 | `isCloudProvisionedByEnv()` check **NOT FOUND at upstream tip** | **HIGH — file likely refactored** |
| `applyAliceAppViteStubMammothPatch` (eliza-side) | `packages/app/vite/native-module-stub-plugin.ts` | 4 | `"node-llama-cpp"`, `"fs-extra"` still present in nativePackages | LOW |
| `applyAliceKubeHealthReadinessPatch` | `packages/app-core/src/api/kube-health.ts` | **0** | unchanged | NONE |
| `applyAliceBundledKnowledgeStartupDeferralPatch` | `packages/agent/src/runtime/eliza.ts` | **36** | `function trimEnvString` still present; surrounding context will likely have shifted | **HIGH — highest churn file** |
| `applyAliceTelegramAccountAuthResolverPatch` | `packages/agent/src/runtime/plugin-resolver.ts` | 18 | not probed yet | MEDIUM-HIGH |
| `applyAlicePgliteContainerLockPatch` | `plugins/plugin-sql/typescript/pglite/manager.ts` | 1 | not probed yet | LOW |
| `applyAliceLifeOpsCalendarActionPatch` | `plugins/app-lifeops/src/actions/calendar.ts` | (within 92 dir-level) | `calendarAction as googleCalendarAction` still present at upstream | LOW |
| `applyAliceLifeOpsRuntimeImportPatch` | `plugins/app-lifeops/src/...` | (within 92 dir-level) | not probed yet | MEDIUM-HIGH (high dir churn) |
| `applyAliceLifeOpsNativeActivityTrackerPatch` | `activity-profile/native-activity-tracker.ts` | **target file deleted upstream** | upstream replaced with `activity-tracker-{repo,reporting,service}.ts` family | **HIGH — file gone, patch must be rewritten or retired** |

**Three definitively-broken patches**:
1. `applyAliceAppCoreOpenAccessPatch` — the `isCloudProvisionedByEnv()` call site no longer exists at the upstream tip; the local-trust logic appears refactored.
2. `applyAliceAppCoreCodingAgentsFallbackPatch` — handleCompatRoute structure intact but the per-route anchor block has shifted; needs new line context.
3. `applyAliceLifeOpsNativeActivityTrackerPatch` — target file `activity-profile/native-activity-tracker.ts` deleted upstream; replaced by `activity-tracker-{repo,reporting,service}.ts` family. Patch must be either rewritten against the new file structure or retired if its purpose is now upstream's default.

## Phased execution

### Phase 0 — pick a target commit (manual; needs your call)

The user picks ONE specific upstream/develop commit to pin to. Recommendations:

- `be182cc913b3` (current develop tip): most fixes, but moving target.
- A commit older than develop tip that's known stable from upstream's CI signals (no recent regressions): safer.
- Wait for an alpha tag to land on the v2 line: cleanest but indefinite.

**This branch's plan assumes targeting a frozen single commit. Whichever you pick, write it down — every subsequent step references it.**

### Phase 1 — probe (no commits, no deploys, branch isolated)

```
git checkout alice
git checkout -b probe/eliza-bump-<short-target-sha>
git submodule update --init eliza
cd eliza
git fetch origin
git checkout <target-sha>
cd ..
git add eliza
git commit -m "probe: bump eliza submodule to <target-sha>"
```

Run the patch test suite locally:

```
bun test scripts/apply-alice-eliza-runtime-patches.test.ts
```

Each patch with a broken anchor throws `core/.../X anchor drifted` with explicit error. Capture the full failure list. **Do not push, do not deploy.** This is purely local triage.

### Phase 2 — re-anchor each broken patch (commits to milaidy patch script only)

For each failing patch:

1. Read the upstream source at the new pin: `git show <target-sha>:packages/.../X.ts`
2. Identify the new context where the patch logic should land (the function may have moved, lines surrounding it may have changed comments, etc.)
3. Update the `anchor` constant in `scripts/apply-alice-eliza-runtime-patches.mjs` to match the new context
4. Update the `replacement` constant if the surrounding lines that the patch preserves have also changed
5. Update the unit test fixture to reflect the new pre-state

Re-run `bun test`. Iterate until 16/16 pass.

### Phase 3 — staging validation (deploy from probe branch)

Push the probe branch:

```
git push origin probe/eliza-bump-<short-target-sha>
```

Open PR against alice with:
- The submodule bump commit
- Every re-anchor commit
- Detailed changelog of which anchors moved and how

Trigger a 555-bot deploy from the probe branch by setting `MILAIDY_RUNTIME_REF=probe/eliza-bump-<short-target-sha>` (default is `alice`). **Do not** push to alice yet. Watch the deployer healthz the same way as previous fixes:
- Build + image push must succeed (proves the patch chain still applies cleanly to upstream's source)
- Pod must reach `Running` with `restartCount=0`
- SSM into pod, grep `/app/milaidy/apps/app/dist/assets/main-*.js` for the same forbidden-marker list (`fs-extra-WARN`, `realpath.native`, `gracefulify`, `DocumentXmlReader`, `convertElementToRawText`, `readXmlFromZipFile`, `registryPluginsProvider`) — all should remain 0
- curl the seven Alice routes (`/health`, `/health/live`, `/health/ready`, `/api/auth/status`, `/api/companion/stage`, `/api/broadcast/alice-cam/stage`, `/api/coding-agents`) — all should return their expected codes
- Open the staging URL in a browser, watch DevTools console for any new module-init errors

### Phase 4 — promote to alice (only on green stage)

After the probe branch deploys and verifies cleanly:

```
git checkout alice
git merge probe/eliza-bump-<short-target-sha>
git push origin alice
```

Trigger a normal deploy from alice. Confirm pod state matches probe state.

**Do not promote to production in the same session.** Production gets a fresh evaluation pass after at least one full operational day on staging with the new eliza pin.

## Mitigations against losing what we've built

Each item below is explicitly preserved by this plan:

- All sentinel-tagged patches in the milaidy patch chain (`MILADY_OPEN_ACCESS`, `milaidy:browser-externals`, `milaidy:browser-externals-mammoth`, `milaidy:vite-stub-mammoth`)
- Direct edits in `apps/app/vite.config.ts` (mammoth in nativePackages) and `apps/app/src/main.tsx` (isMiladyOS definition) — these don't touch the submodule, so the bump can't clobber them
- `555stream/scripts/aws-migration/deploy-555-bot-staging.sh` contract guards — these run AGAINST the patched source at deploy time; if a patch re-anchor breaks, the contract guard fails the deploy with a named error before image push, not silently
- `fix/define-ismilady-os` (this session's runtime fix), `fix/core-mammoth-leak`, `fix/core-browser-externals-fs-extra`, etc. all merged onto alice; each preserves its own diff in alice's history

## What I will not do autonomously

- Choose the target commit (see Phase 0 — this is your call)
- Merge probe to alice without you reviewing the re-anchor diffs
- Touch production at any point during this plan
- Do the eliza bump in a single autonomous session — Phase 1+2 alone could take hours of manual re-anchoring across 8+ patches; each re-anchor needs careful inspection of upstream source
