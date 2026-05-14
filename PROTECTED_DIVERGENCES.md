# Protected Divergences Registry

This file lists every **intentional divergence** between `rndrntwrk/milaidy` (the
`alice` branch) and upstream `milady-ai/milady` that **must survive an upstream
sync**. It is the source of truth for the pre-sync verification gate.

## Why this exists

The eliza-bump recovery effort burned weeks because correct local fixes were being
**silently reverted by upstream syncs** — no signal, no test, no gate. The canonical
example: `@electric-sql/pglite` was bumped from `^0.3.16` to `^0.4.5` (the fix), then
an upstream sync between 2026-05-04 and 2026-05-13 reverted it back to `^0.3.16`,
re-breaking staging. It took the whole recovery effort to re-discover and re-fix.

This registry makes those divergences **explicit and machine-verifiable** so a sync
that reverts one fails CI instead of reaching production.

## The rules

1. **Every entry here must survive an upstream sync.** A sync that reverts, removes,
   or weakens any entry is a regression and must be blocked.
2. **Upstream syncs go through dedicated PRs** (`sync(upstream): milady-ai/milady <range>`).
   The PR description must confirm every entry this registry lists is preserved.
3. **The pre-sync verification gate** runs the `Verification` command of every entry
   against the post-merge tree. Any failure blocks the sync. (CI job — tracked as
   Exit Criterion #4 of the deployment freeze runbook.)
4. **Adding an intentional divergence?** Add it here in the same PR. An un-registered
   divergence is indistinguishable from accidental drift and will eventually be lost.
5. **Verification commands must be deterministic and exit non-zero on failure.** They
   are assertions, not documentation.

---

## Category 1 — Dependency pins (`package.json`)

### 1.1 — `@electric-sql/pglite` (dependencies)

| Field | Value |
|---|---|
| Surface | `package.json` → `dependencies["@electric-sql/pglite"]` |
| Required value | `^0.4.5` — **NOT** upstream's `^0.3.16` |
| Reason | The bumped eliza submodule's `@elizaos/plugin-sql` requires PGlite `0.4.x`. `0.3.16` `exit(1)`s on the newer schema/WASM expectations — `PgliteInitError`, runtime never boots. |
| Introduced by | milaidy PR #195 |
| Verification | `node -e "const v=require('./package.json').dependencies['@electric-sql/pglite']; process.exit(v && v.startsWith('^0.4') ? 0 : 1)"` |
| Owner | Alice runtime |

### 1.2 — `@electric-sql/pglite` (overrides)

| Field | Value |
|---|---|
| Surface | `package.json` → `overrides["@electric-sql/pglite"]` |
| Required value | `^0.4.5` |
| Reason | Belt-and-suspenders for 1.1 — forces the version on transitive dependents too, so no nested dep can pull an incompatible PGlite. Upstream pins it in both places; alice must too. |
| Introduced by | milaidy PR #196 |
| Verification | `node -e "const v=require('./package.json').overrides['@electric-sql/pglite']; process.exit(v && v.startsWith('^0.4') ? 0 : 1)"` |
| Owner | Alice runtime |

### 1.3 — `libsignal` (npm, not git)

| Field | Value |
|---|---|
| Surface | `package.json` → `overrides.libsignal` |
| Required value | `6.0.0` (the npm release) — **NOT** `git+https://github.com/whiskeysockets/libsignal-node.git#<sha>` |
| Reason | The `git+https` spec intermittently failed to resolve in bun on the build host, gating ~25 deploy attempts. `libsignal@6.0.0` was published to npm and is functionally identical to the pinned commit (diff is workflow/docs only). alice uses libsignal only transitively via `@whiskeysockets/baileys` — there is no direct `dependencies.libsignal` entry; the `overrides` pin is what forces `6.0.0` onto the transitive dependent. If a future sync re-introduces a `dependencies.libsignal` git spec, that is the regression to block. |
| Introduced by | milaidy PR #168 |
| Verification | `node -e "const p=require('./package.json'); const dep=p.dependencies&&p.dependencies.libsignal; process.exit(p.overrides.libsignal==='6.0.0' && (!dep || dep==='6.0.0') ? 0 : 1)"` |
| Owner | Alice runtime |

---

## Category 2 — Runtime patches (committed source in `packages/agent`)

### 2.1 — Stale PGlite client-lock self-heal

| Field | Value |
|---|---|
| Surface | `packages/agent/src/runtime/eliza.ts` — `cleanStalePgliteClientLock`, `reconcilePgliteClientLock`, `readProcessStartTimeMs`; called from `applyDatabaseConfigToEnv` immediately after `cleanStalePglitePid` |
| Required behavior | Before plugin-sql init, reconcile a stale `eliza-pglite.lock` left by a prior pod. `@elizaos/plugin-sql`'s `PGliteClientManager` records its own `process.pid` in the lock and refuses to open the data dir while that pid is "alive" — but container pid namespaces restart from low pids, so a prior pod's lock routinely names a pid the next container reuses (often its own), wedging startup in `CrashLoopBackOff`. This self-heal clears a lock it can *prove* stale (recorded pid gone; pid collides with our own + old mtime; pid alive but `/proc/<pid>/stat` start-time post-dates the lock). Conservative on ambiguity. |
| Reason | Without it, **any** `alice-bot` pod restart can permanently wedge staging. plugin-sql cannot self-heal the pid-collision case on its own. |
| Introduced by | milaidy PR #197 |
| Verification | `grep -q 'cleanStalePgliteClientLock' packages/agent/src/runtime/eliza.ts && grep -q 'cleanStalePgliteClientLock(dataDir)' packages/agent/src/runtime/eliza.ts` |
| Owner | Alice runtime |

### 2.2 — `agent-orchestrator-compat.ts` synchronous `require` loading

| Field | Value |
|---|---|
| Surface | `packages/agent/src/runtime/agent-orchestrator-compat.ts` — base-module load |
| Required behavior | Load `@elizaos/plugin-agent-orchestrator` with a synchronous `createRequire(import.meta.url)` — **NOT** a top-level `await import(...)`. This module is itself `require()`'d by `eliza.ts`; a top-level `await` makes it an async ESM module that `require()` cannot load (`ERR_REQUIRE_ASYNC_MODULE`), silently disabling the entire compat wrapper including its graceful stub fallback. |
| Reason | With the top-level `await`, the `require()` in `eliza.ts` always threw, the compat wrapper never registered, and the resolver fell through to the real plugin — which needs `pty-console` (intentionally absent on cloud images) → "Failed to load core plugin" every boot. |
| Introduced by | milaidy PR #197 |
| Verification | `! grep -nE '^\s*(await import|baseModule = await)' packages/agent/src/runtime/agent-orchestrator-compat.ts && grep -q 'createRequire(import.meta.url)' packages/agent/src/runtime/agent-orchestrator-compat.ts` |
| Owner | Alice runtime |

---

## Category 3 — Vite SPA build (`apps/app/vite.config.ts`)

### 3.1 — `@elizaos/agent` browser-stub alias

| Field | Value |
|---|---|
| Surface | `apps/app/vite.config.ts` — the `resolve.alias` entry for `/^@elizaos\/agent$/` |
| Required behavior | Alias the bare `@elizaos/agent` import to `eliza/packages/app-core/src/platform/elizaos-agent-browser-stub.ts` (upstream eliza's comprehensive ~140-name no-op browser stub), guarded by `fs.existsSync` with a fallback to the local `apps/app/src/stubs/empty-node-module.ts`. The narrow local stub causes Rollup to fail (`"ACCOUNT_CREDENTIAL_PROVIDER_IDS" is not exported`) when `eliza/packages/app-core/src/services/account-pool.ts` and siblings — pulled in via the `@elizaos/app-core` barrel from `main.tsx` — statically import server-only names from `@elizaos/agent`. |
| Reason | Without the upstream stub, the SPA build fails in Rollup; the eliza-bump made the `@elizaos/app-core` barrel reach far more server-only code than the narrow stub covered. |
| Introduced by | milaidy PR #169 |
| Verification | `grep -q 'elizaos-agent-browser-stub' apps/app/vite.config.ts && grep -q 'fs.existsSync' apps/app/vite.config.ts` |
| Owner | Alice runtime + Stream |

---

## Category 4 — The eliza patch chain (`scripts/apply-alice-eliza-runtime-patches.mjs`)

This script runs at deploy time and re-anchors every milaidy patch onto the vendored
`eliza` submodule. **The script itself is the source of truth** for the individual
patches; this registry protects the script's *outputs* — the sentinel markers it
writes and the source-main rewrites it performs.

### 4.1 — Patch-chain sentinel markers

| Field | Value |
|---|---|
| Surface | `scripts/apply-alice-eliza-runtime-patches.mjs` — sentinel strings written into the eliza submodule by the patch chain |
| Required behavior | All of these sentinels must be producible by the script (i.e. the patches that emit them must not be removed by an upstream sync of the script): `0.0.0-milady-source-main`, `[milaidy:app-core-ui-compat-reexport]`, `[milaidy:app-core-ui-full-reexport]`, `[milaidy:browser-bridge-stub]`, `[milaidy:browser-externals]`, `[milaidy:browser-externals-mammoth]`, `[milaidy:core-browser-cloud-topology-reexport]`, `[milaidy:core-browser-onboarding-reexport]`, `[milaidy:core-browser-onboarding-types-disambiguate]`, `[milaidy:core-browser-runtime-env-reexport]`, `[milaidy:core-browser-settings-debug-reexport]`, `[milaidy:core-browser-spoken-text-reexport]`, `[milaidy:core-browser-state-dir-stubs]`, `[milaidy:elizacloud-agent-export-compat]`, `[milaidy:open-access]`, `[milaidy:vite-stub-mammoth]` |
| Reason | Each sentinel marks a patch that the eliza-bump recovery required. A sync that drops a patch (and thus its sentinel) silently re-breaks whatever that patch fixed. |
| Introduced by | milaidy PRs #124–#197 (the patch-chain cascade) |
| Verification | `for s in 0.0.0-milady-source-main '[milaidy:app-core-ui-compat-reexport]' '[milaidy:app-core-ui-full-reexport]' '[milaidy:browser-bridge-stub]' '[milaidy:browser-externals]' '[milaidy:browser-externals-mammoth]' '[milaidy:core-browser-cloud-topology-reexport]' '[milaidy:core-browser-onboarding-reexport]' '[milaidy:core-browser-onboarding-types-disambiguate]' '[milaidy:core-browser-runtime-env-reexport]' '[milaidy:core-browser-settings-debug-reexport]' '[milaidy:core-browser-spoken-text-reexport]' '[milaidy:core-browser-state-dir-stubs]' '[milaidy:elizacloud-agent-export-compat]' '[milaidy:open-access]' '[milaidy:vite-stub-mammoth]'; do grep -qF "$s" scripts/apply-alice-eliza-runtime-patches.mjs || { echo "MISSING SENTINEL: $s"; exit 1; }; done` |
| Owner | Alice runtime |

### 4.2 — Source-main package rewrites

| Field | Value |
|---|---|
| Surface | `scripts/apply-alice-eliza-runtime-patches.mjs` — the `aliceUpstreamSourceMainPackageRelativePaths` list (currently **29** packages) |
| Required behavior | The script rewrites each listed package's `main`/`exports` to point at TS source (`./src/index.ts` or the flat-layout equivalent) so Node + tsx resolves it at runtime without a built `dist/`. The list must not shrink across an upstream sync — a package dropped from it crashes the runtime with `Cannot find module .../dist/...`. It may legitimately *grow* (a future eliza bump may need more packages source-rooted); the floor of 29 is what must hold. |
| Reason | Every package on the list is statically or dynamically imported by `eliza/packages/agent` or `eliza/packages/app-core` and has no `dist/` built in the deploy image. |
| Introduced by | milaidy PRs #127–#197 (progressively extended) |
| Verification | `node -e "const s=require('fs').readFileSync('scripts/apply-alice-eliza-runtime-patches.mjs','utf8'); const m=s.match(/aliceUpstreamSourceMainPackageRelativePaths\s*=\s*\[([^\]]*)\]/s); const n=m?m[1].split(',').filter(x=>x.trim().startsWith('\"')).length:0; process.exit(n>=29?0:1)"` |
| Owner | Alice runtime |

---

## Maintenance

- This is a **living document**. Every PR that introduces an intentional alice-vs-upstream
  divergence on a deploy-critical surface adds an entry here in the same PR.
- Category 4 is currently coarse-grained (it protects the script's *outputs*, not each
  individual patch). A future iteration should enumerate each patch in
  `apply-alice-eliza-runtime-patches.mjs` as its own entry with a targeted verification —
  tracked as a follow-up.
- The verification commands assume execution from the milaidy repo root.
- Related: the deployment freeze runbook
  (`internal-ops-docs/operations/2026-05-14-alice-staging-deployment-freeze-and-new-strategy-runbook.md`,
  §3.1 Pillar 1) and Exit Criteria #3 (this file exists) and #4 (the pre-sync gate runs it).
