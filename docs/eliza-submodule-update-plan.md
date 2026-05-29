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
| `applyAliceAppCoreOpenAccessPatch` | `packages/app-core/src/api/trusted-local-request.ts` | (file deleted) | **target file deleted upstream**; `isTrustedLocalRequest` moved into `packages/app-core/src/api/compat-route-shared.ts` | **HIGH — patch must re-target to compat-route-shared.ts; on a clean submodule bump this patch silently skips and the open-access bypass disappears, so /api/auth/status returns required:true and SPA falls back into pairing flow** |
| `applyAliceAppViteStubMammothPatch` (eliza-side) | `packages/app/vite/native-module-stub-plugin.ts` | 4 | `"node-llama-cpp"`, `"fs-extra"` still present in nativePackages | LOW |
| `applyAliceKubeHealthReadinessPatch` | `packages/app-core/src/api/kube-health.ts` | **0** | unchanged | NONE |
| `applyAliceBundledKnowledgeStartupDeferralPatch` | `packages/agent/src/runtime/eliza.ts` | **36** | `function trimEnvString` still present; surrounding context will likely have shifted | **HIGH — highest churn file** |
| `applyAliceTelegramAccountAuthResolverPatch` | `packages/agent/src/runtime/plugin-resolver.ts` | 18 | not probed yet | MEDIUM-HIGH |
| `applyAlicePgliteContainerLockPatch` | `plugins/plugin-sql/typescript/pglite/manager.ts` | 1 | not probed yet | LOW |
| `applyAliceLifeOpsCalendarActionPatch` | `plugins/app-lifeops/src/actions/calendar.ts` | (within 92 dir-level) | `calendarAction as googleCalendarAction` still present at upstream | LOW |
| `applyAliceLifeOpsRuntimeImportPatch` | `plugins/app-lifeops/src/...` | (within 92 dir-level) | not probed yet | MEDIUM-HIGH (high dir churn) |
| `applyAliceLifeOpsNativeActivityTrackerPatch` | `activity-profile/native-activity-tracker.ts` | **target file deleted upstream** | upstream replaced with `activity-tracker-{repo,reporting,service}.ts` family | **HIGH — file gone, patch must be rewritten or retired** |

**Three definitively-broken patches** (two target files deleted, one anchor drifted):
1. `applyAliceAppCoreOpenAccessPatch` — **target file deleted**. `packages/app-core/src/api/trusted-local-request.ts` no longer exists at upstream tip; `isTrustedLocalRequest` now lives in `compat-route-shared.ts`. On a naive submodule bump this patch returns `"skipped"` silently (the file-existence check at the top of the patch function), and the open-access bypass evaporates — `/api/auth/status` flips back to `required:true, pairingEnabled:true` for external requests and the SPA falls back into the pairing flow we just escaped. The patch must be re-targeted to `compat-route-shared.ts` and the new anchor located inside that file's `isTrustedLocalRequest`.
2. `applyAliceAppCoreCodingAgentsFallbackPatch` — handleCompatRoute structure intact upstream but the per-route anchor block has shifted; needs new line context.
3. `applyAliceLifeOpsNativeActivityTrackerPatch` — **target file deleted**. `plugins/app-lifeops/src/activity-profile/native-activity-tracker.ts` gone upstream; replaced by the `activity-tracker-{repo,reporting,service}.ts` family. Same silent-skip behavior as #1 if not re-targeted.

**Silent-skip is the danger pattern.** Patches that throw on anchor drift fail the deploy loudly and give a clear error. Patches whose target file is deleted return `"skipped"` per the existsSync guard at the top of each apply function — the deploy succeeds but the patched behavior is gone. **Mandatory mitigation**: before any submodule bump deploys, audit every patch's target file existence at the new pin; any patch returning "skipped" that we did not intend to retire must be re-targeted before deploy.

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

## Appendix A: pre-drafted re-anchors (against upstream/develop tip `be182cc913b3`)

These are research-only sketches captured during the planning probe. They will be re-validated against whichever target commit you actually pick in Phase 0; if the chosen pin is different, the surrounding context may need adjustment. Treat as starting points, not finished patches.

### A.1 — `applyAliceAppCoreOpenAccessPatch` re-target

**Old (alice):** modifies `packages/app-core/src/api/trusted-local-request.ts` (file deleted at upstream tip).

**New (upstream):** modifies `packages/app-core/src/api/compat-route-shared.ts` line 239+. The function body at upstream is structurally identical to the old trusted-local-request.ts version, with one extra gate at the top: `if (isLocalAuthRequiredByEnv()) return false;`.

**Suggested new patch script changes:**

```mjs
// path constant — replace the deleted file with the relocated one
const appCoreCompatRouteSharedRelativePath =
  "packages/app-core/src/api/compat-route-shared.ts";

// new anchor (matches upstream content)
const anchor = `export function isTrustedLocalRequest(
  req: Pick<http.IncomingMessage, "headers" | "socket">,
): boolean {
  if (isLocalAuthRequiredByEnv()) return false;
  if (isCloudProvisionedByEnv()) return false;`;

// new replacement — insert MILADY_OPEN_ACCESS gate at the very top
const replacement = `export function isTrustedLocalRequest(
  req: Pick<http.IncomingMessage, "headers" | "socket">,
): boolean {
  // [milaidy:open-access] Staging-only escape hatch ...
  if (process.env.MILADY_OPEN_ACCESS === "1") return true;
  if (isLocalAuthRequiredByEnv()) return false;
  if (isCloudProvisionedByEnv()) return false;`;
```

The unit test fixture in `scripts/apply-alice-eliza-runtime-patches.test.ts` needs the same shape update (new file path + new anchor pre-state).

### A.2 — `applyAliceAppCoreCodingAgentsFallbackPatch` re-anchor

**Old (alice):** anchor includes `url.pathname === "/api/coding-agents"` somewhere inside `handleCompatRoute`.

**Upstream tip:** `handleCompatRoute` is at line 574 of `packages/app-core/src/api/server.ts`; 15 different `url.pathname` checks live inside it. The exact insertion point for the coding-agents fallback needs to be re-located against this new structure. **Inspection required during Phase 1** — the plan can't pre-resolve this without reading the function body in detail (which is its own multi-page chunk).

### A.3 — `applyAliceLifeOpsNativeActivityTrackerPatch` retire-or-rewrite decision

**Old (alice):** patches `plugins/app-lifeops/src/activity-profile/native-activity-tracker.ts` (deleted upstream).

**Upstream tip:** the activity-tracker concern has been split into `activity-tracker-repo.ts`, `activity-tracker-reporting.ts`, `activity-tracker-service.ts`. **Phase 1 must read the original alice patch's intent** (what behavior it was modifying) and then decide:

- (a) Re-target to one of the new activity-tracker-* files if the same behavior gap still exists, OR
- (b) Retire the patch entirely if upstream's restructure already provides the behavior we needed

Without reading the patch's full diff against the original file, we can't distinguish (a) from (b) in this plan.

## Appendix B-results: actual audit run against `be182cc913b3`

Already executed during plan drafting. **Four patches will silent-skip** on a naive bump, not just the two highlighted earlier:

```
EXISTS  packages/core/build.ts
EXISTS  packages/core/src/features/basic-capabilities/index.ts
EXISTS  packages/app-core/src/api/server.ts
MISSING packages/app-core/src/api/trusted-local-request.ts          ← open-access patch silent-skips
EXISTS  packages/app/vite/native-module-stub-plugin.ts
MISSING packages/app-core/src/api/kube-health.ts                    ← kube-health-readiness patch silent-skips
EXISTS  packages/agent/src/runtime/eliza.ts
EXISTS  packages/agent/src/runtime/plugin-resolver.ts
MISSING plugins/plugin-sql/typescript/pglite/manager.ts             ← pglite-container-lock patch silent-skips
EXISTS  plugins/app-lifeops/src/actions/calendar.ts
MISSING plugins/app-lifeops/src/activity-profile/native-activity-tracker.ts  ← activity-tracker patch silent-skips
EXISTS  packages/shared/src/i18n/keyword-matching.ts
```

The kube-health one matters most operationally — that patch governs how the bot signals readiness to k8s. If it silent-skips, the pod's readiness probe behavior regresses to upstream defaults. Phase 1 must locate where kube-health logic lives at upstream tip and re-target accordingly. Same exercise for plugin-sql pglite manager.

## Appendix B: pre-deploy file-existence audit

Before Phase 3 deploy, run this audit script against the post-bump submodule state to surface every silent-skip patch:

```bash
cd milaidy/eliza
for f in \
  "packages/core/build.ts" \
  "packages/core/src/features/basic-capabilities/index.ts" \
  "packages/app-core/src/api/server.ts" \
  "packages/app-core/src/api/trusted-local-request.ts" \
  "packages/app/vite/native-module-stub-plugin.ts" \
  "packages/app-core/src/api/kube-health.ts" \
  "packages/agent/src/runtime/eliza.ts" \
  "packages/agent/src/runtime/plugin-resolver.ts" \
  "plugins/plugin-sql/typescript/pglite/manager.ts" \
  "plugins/app-lifeops/src/actions/calendar.ts" \
  "plugins/app-lifeops/src/activity-profile/native-activity-tracker.ts" \
  ; do
  test -f "$f" && echo "  EXISTS  $f" || echo "  MISSING $f  ← patch will silent-skip"
done
```

Any `MISSING` line maps to a patch that will silent-skip and lose its behavior. Compare to the patch chain registry in `scripts/apply-alice-eliza-runtime-patches.mjs` orchestrator and re-target every patch that's not deliberately retired.
