# WP1 PORT SPEC

Port of milady upstream's browser-bundle hardening (commits `addd272fe`, `83e7c4577`, `546e8d77e`) into Alice's fork (branch `integration/alice-upstream-2026-07-07`, worktree `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-integration-alice-upstream-2026-07-07`).

Grounding: all three commits verified NOT ancestors of Alice's HEAD (`git merge-base --is-ancestor` in the worktree returned "NOT ancestor" for all three; HEAD = `4079668d8`). All file/line citations below are from files read in this session.

---

## 1. What each upstream commit changes and why

### 1.1 `addd272fe0961ef3acdf8b1af050d58b98e91a17` — "fix(app): stop importing runtime plugin-task-coordinator into the browser bundle"

Files: `apps/app/src/main.tsx`, `apps/app/src/character-catalog.ts`, `apps/app/src/elizaos-app-core-shim.d.ts`.

Three sub-changes:
- **(a)** Deletes the side-effect import `import "@elizaos/plugin-task-coordinator/register";` from `main.tsx`. The browser bundle must only import `@elizaos/app-*` packages, never runtime `@elizaos/plugin-*`; the package is unpublished, never browser-aliased, and the import was dead (the real `@elizaos/app-task-coordinator` has no `register` entry; the sibling `register-slots` import already covers slot wiring).
- **(b)** Re-points `@elizaos/shared/character-presets` to `@elizaos/shared/onboarding-presets` in `main.tsx` (the `getStylePresets` import) and `character-catalog.ts` (the `buildElizaCharacterCatalog` import), because upstream `@elizaos/shared` renamed the export; the old specifier failed rollup load.
- **(c)** Renames the ambient `declare module "@elizaos/shared/character-presets"` shim in `elizaos-app-core-shim.d.ts` to match.

### 1.2 `83e7c45772d25ba7209dc44696f09b0475948786` — "fix(app/dev): exclude @elizaos/agent from renderer dep-prebundle + harden node-builtin stub Proxy"

File: `apps/app/vite.config.ts`. Two hunks:
- **Hunk A:** adds `"@elizaos/agent"` to `optimizeDeps.exclude`. esbuild's dev-server dep-prebundle scan resolves the stale published alpha (missing newer subpaths like `runtime/plugin-collector`) and crashes **before** `resolve.alias` can map `@elizaos/agent[/*]` to local source. Dev-server-only; prod build unaffected.
- **Hunk B:** in `generateNodeBuiltinStub`, changes the Proxy handler's `ownKeys() { return []; }` / `getOwnPropertyDescriptor() { return { configurable: true, enumerable: true }; }` to `ownKeys(t) { return Reflect.ownKeys(t); }` / `getOwnPropertyDescriptor(t, p) { return Reflect.getOwnPropertyDescriptor(t, p) || { configurable: true, enumerable: true }; }`. Fixes a latent Proxy invariant TypeError when a stubbed `node:` builtin whose Proxy **target is a function** (functions have a non-configurable `prototype` own key) is enumerated or spread.

### 1.3 `546e8d77eaefd34f69ae7a038c5cc45bb62ee9a5` — "fix(build): externalize @elizaos/vault in tsdown node bundles (#2175)"

File: `tsdown.config.mjs`. Adds `const vaultExternal = "@elizaos/vault";` and inserts `vaultExternal` into `allExternals`. `@elizaos/vault` is a runtime-loaded workspace secrets-manager service that rolldown cannot cleanly inline; it was being implicitly externalized with a noisy `UNRESOLVED_IMPORT` warning on every build (from `secrets-manager-routes`, `vault-mirror`, `secrets-manager-installer`, `secrets-inventory-routes`). No runtime change; makes the externalization explicit and silences the warning.

---

## 2. Alice's current state (facts, with evidence)

- `apps/app/vite.config.ts` is 2157 lines (upstream develop's is 3354); it is a substantially diverged fork.
- **The protected `@elizaos/agent` alias** is at lines 1871-1882: `find: /^@elizaos\/agent$/` → `eliza/packages/app-core/src/platform/elizaos-agent-browser-stub.ts`, guarded by `fs.existsSync` with fallback to `apps/app/src/stubs/empty-node-module.ts`. Both target files verified present: the stub exists in the eliza pin (`/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/eliza/packages/app-core/src/platform/elizaos-agent-browser-stub.ts`, ~140 no-op named exports starting with `ACCOUNT_CREDENTIAL_PROVIDER_IDS`), and the fallback exists in the worktree.
- **`optimizeDeps.exclude`** (lines 1985-2022) does NOT contain `"@elizaos/agent"`.
- **`generateNodeBuiltinStub`** (lines 674-771) is an older, different implementation than upstream's: its Proxy targets are **plain objects** (`new Proxy({}, handler)` at line 682 and line 757), never functions; the handler (line 681) has only `get/has/ownKeys/getOwnPropertyDescriptor` traps.
- **`nativeModuleStubPlugin`** (lines 1100-1230) has no `@elizaos/agent` entry in its `nativePackages` set, and Alice's vite.config has **zero** occurrences of `generateElizaAgentStub` or `ELIZA_AGENT_*_STUB_NAMES` (grep verified).
- **`main.tsx`**: no `@elizaos/plugin-task-coordinator` import anywhere in `apps/app/src` (grep verified); has `import "@elizaos/app-task-coordinator/register-slots";` (line 103) and already imports `getStylePresets` from `@elizaos/shared/onboarding-presets` (line 314). `character-catalog.ts:9` imports from `@miladyai/shared/onboarding-presets` (Alice's fork namespace). Zero `character-presets` hits in `apps/app/src` or `vite.config.ts`.
- **No `elizaos-app-core-shim.d.ts`** exists in Alice's app (only `apps/app/src/capacitor-plugin-modules.d.ts`).
- **tsdown config**: Alice has NO root `tsdown.config.mjs`; her config is **`tsdown.config.ts`** (147 lines, read in full). Externals (lines 102-108): `nativeExternals`, `/^@elizaos\/plugin-/`, `/^@elizaos\/app-/`, `/^@node-rs\//`, `/^@napi-rs\//`. **No `@elizaos/vault`.** Entries bundle the eliza pin's app-core node entries: `eliza/packages/app-core/src/{index.ts, entry.ts, runtime/eliza.ts, api/server.ts}`.
- The eliza pin's app-core imports `@elizaos/vault` in 7 files (`security/wallet-os-store-actions.ts`, `api/secrets-manager-routes.ts`, `api/plugins-routes.ts`, `api/secrets-inventory-routes.ts`, `services/vault-mirror.ts`, `services/vault-bootstrap.ts`, `services/secrets-manager-installer.ts`) and declares `"@elizaos/vault": "2.0.0-beta.1"` (`eliza/packages/app-core/package.json:127`). `eliza/packages/vault` exists at that exact version and is covered by the root workspaces glob `"eliza/packages/*"` (worktree `package.json:40`). `bun.lock` resolves `@elizaos/agent` to `workspace:eliza/packages/agent` (line 2968) and currently has zero `@elizaos/vault` entries.
- PROTECTED_DIVERGENCES.md entry 3.1 (lines 99-107) requires: alias to `elizaos-agent-browser-stub.ts` guarded by `fs.existsSync`; verification `grep -q 'elizaos-agent-browser-stub' apps/app/vite.config.ts && grep -q 'fs.existsSync' apps/app/vite.config.ts`.

---

## 3. Hunk-level mapping

| # | Upstream change | Verdict for Alice |
|---|---|---|
| 1a | Remove `@elizaos/plugin-task-coordinator/register` import (main.tsx) | **(i) already equivalent** — Alice never has this import (grep of `apps/app/src`: zero hits) |
| 1b | `character-presets` → `onboarding-presets` (main.tsx, character-catalog.ts) | **(i) already equivalent** — `main.tsx:314` uses `@elizaos/shared/onboarding-presets`; `character-catalog.ts:9` uses the namespace-correct fork `@miladyai/shared/onboarding-presets`; zero `character-presets` references remain |
| 1c | Rename declare-module in `elizaos-app-core-shim.d.ts` | **(iii) not applicable** — Alice has no such shim file; her `@elizaos/shared` types resolve through the workspace source aliases (`buildWorkspaceExportAliases("@elizaos/shared", …)`, vite.config lines 1775-1777) |
| 2A | Add `"@elizaos/agent"` to `optimizeDeps.exclude` | **(ii) PORT** — exact edit in §3.1 below |
| 2B | Reflect-based `ownKeys`/`getOwnPropertyDescriptor` in node-builtin stub Proxy | **(iii) does not apply verbatim / OPTIONAL alignment** — the crash upstream fixed requires a **function** Proxy target (non-configurable `prototype` own key); every Proxy in Alice's generator targets a plain `{}` (lines 682, 757), for which `ownKeys() { return []; }` violates no invariant. Optional, invariant-safe alignment edit provided in §3.2; recommended to reduce future upstream merge friction |
| 3 | Externalize `@elizaos/vault` in tsdown | **(ii) PORT** — Alice bundles the same eliza app-core node entries that import vault in 7 files, and her externals lack it; exact edit in §5 below |

### 3.1 Edit 1 — `apps/app/vite.config.ts`: exclude `@elizaos/agent` from dep-prebundle (port of 83e7c4577 hunk A)

File: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-integration-alice-upstream-2026-07-07/apps/app/vite.config.ts`, lines 1985-1989.

Old code (exact):
```ts
    exclude: [
      "node-llama-cpp",
      "@node-llama-cpp/mac-arm64-metal",
      // Contains native-only pty-state-capture import; skip pre-bundling.
      "@elizaos/plugin-agent-orchestrator",
```

New code:
```ts
    exclude: [
      "node-llama-cpp",
      "@node-llama-cpp/mac-arm64-metal",
      // Contains native-only pty-state-capture import; skip pre-bundling.
      "@elizaos/plugin-agent-orchestrator",
      // @elizaos/agent is server-only and must never be dep-prebundled for
      // the renderer. esbuild's dev-server prebundle scan can resolve the
      // package (workspace source in local mode, a stale published alpha in
      // packages mode) and crash before resolve.alias maps the bare import
      // to eliza's elizaos-agent-browser-stub.ts. Ported from upstream
      // milady 83e7c4577 (PR #2177, hunk A). Dev-server-only.
      "@elizaos/agent",
```

Namespace note: the entry stays `@elizaos/agent` (NOT `@miladyai/agent`). The server-only package that leaks into the SPA graph via the eliza app-core barrel is `@elizaos/agent` (bun.lock:2968 resolves it to `workspace:eliza/packages/agent`). Alice's own `@miladyai/agent` fork subpaths are intentionally browser-used (`@miladyai/agent/contracts/onboarding`, per the comment at vite.config line 1853) and already resolve to source via `buildWorkspaceExportAliases("@miladyai/agent", …)` (line 1760); do not exclude it.

### 3.2 Edit 2 (OPTIONAL, recommended) — `apps/app/vite.config.ts` line 681: Reflect-align the node-builtin stub handler (adapted 83e7c4577 hunk B)

Old code (exact, single line inside `generateNodeBuiltinStub`):
```ts
    "const handler = { get(t, p) { if (typeof p === 'symbol') return undefined; if (p === '__esModule') return true; if (p === 'default') return t; if (p === 'prototype') return {}; return noop; }, has() { return true; }, ownKeys() { return []; }, getOwnPropertyDescriptor() { return { configurable: true, enumerable: true }; } };",
```

New code:
```ts
    "const handler = { get(t, p) { if (typeof p === 'symbol') return undefined; if (p === '__esModule') return true; if (p === 'default') return t; if (p === 'prototype') return {}; return noop; }, has() { return true; }, ownKeys(t) { return Reflect.ownKeys(t); }, getOwnPropertyDescriptor(t, p) { return Reflect.getOwnPropertyDescriptor(t, p) || { configurable: true, enumerable: true }; } };",
```

Safety: for Alice's plain-object targets, `Reflect.ownKeys({})` is `[]`, so behavior is unchanged today; the edit only makes the handler correct if a function target is ever introduced (as upstream did). Skipping this edit is also acceptable; it fixes no live bug in Alice.

---

## 4. Verdict on retiring Alice's `@elizaos/agent` alias: **KEEP**

Upstream's mechanism **cannot** replace Alice's alias in Alice's file as it exists today, for three verified reasons:

1. **The ingredients do not exist in Alice's tree.** On upstream develop, browser safety for `@elizaos/agent` does NOT come from `packageAgnosticAliases` alone: that alias maps the bare specifier to the REAL source (`packages/agent/src/index.ts`, upstream vite.config lines 669-681). The actual stubbing is done by `nativeModuleStubPlugin` (`enforce: "pre"`) intercepting `id === "@elizaos/agent"` and any `normalizedId.includes("/packages/agent/src/")` (upstream lines ~2590-2607) and serving `generateElizaAgentStub()`, a generator driven by three enumerated lists (`ELIZA_AGENT_OBJECT_STUB_NAMES` / `ELIZA_AGENT_ARRAY_STUB_NAMES` / `ELIZA_AGENT_FUNCTION_STUB_NAMES`, hundreds of lines). Grep of Alice's vite.config: zero occurrences of `generateElizaAgentStub` or `ELIZA_AGENT_`, and her `nativePackages` set (lines 1104-1160) has no `@elizaos/agent` entry.
2. **Porting the mechanism wholesale would break Alice.** Upstream's `/packages/agent/src/` substring intercept would stub Alice's OWN `@miladyai/agent` fork subpaths, which resolve into `packages/agent/src/…` and are legitimately executed in the SPA (contracts/onboarding). Real browser modules would silently become no-op Proxies.
3. **Alice's alias already achieves upstream's end state** (a comprehensive named no-op stub for the bare `@elizaos/agent`) using ingredients that DO exist and are pinned: `eliza/packages/app-core/src/platform/elizaos-agent-browser-stub.ts` (verified present in the clean pin at `milaidy/eliza`, eliza `17930c97b9`) plus the `fs.existsSync` fallback `apps/app/src/stubs/empty-node-module.ts` (verified present).

**Minimal additive port instead:** Edit 1 (§3.1), optionally Edit 2 (§3.2). Neither touches the alias block (lines 1871-1882).

**PROTECTED_DIVERGENCES.md entry 3.1: unchanged.** Its verification (`grep -q 'elizaos-agent-browser-stub' apps/app/vite.config.ts && grep -q 'fs.existsSync' apps/app/vite.config.ts`) still passes after both edits. Optional strengthening (only if the orchestrator wants the new exclude entry protected too), replace the Verification row value with:

```
`grep -q 'elizaos-agent-browser-stub' apps/app/vite.config.ts && grep -q 'fs.existsSync' apps/app/vite.config.ts && grep -q '"@elizaos/agent",' apps/app/vite.config.ts`
```

---

## 5. tsdown `@elizaos/vault` externalization: **APPLIES** (Edit 3)

Proof it applies: Alice's `tsdown.config.ts` bundles `eliza/packages/app-core/src/{index,entry,runtime/eliza,api/server}.ts` (lines 110-147); that app-core imports `@elizaos/vault` in 7 files including the exact four upstream's commit names as the warning sites; her externals (lines 102-108) lack vault, so today the import is either messily inlined or implicitly externalized with `UNRESOLVED_IMPORT` warnings, exactly upstream's pre-fix state. Note the file is **`tsdown.config.ts` at the worktree root**, not `tsdown.config.mjs`.

File: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-integration-alice-upstream-2026-07-07/tsdown.config.ts`, lines 100-105.

Old code (exact):
```ts
const nodeRsExternal = /^@node-rs\//;
const napiRsExternal = /^@napi-rs\//;
const allExternals = [
  ...nativeExternals,
  pluginExternal,
```

New code:
```ts
const nodeRsExternal = /^@node-rs\//;
const napiRsExternal = /^@napi-rs\//;
// @elizaos/vault is a runtime-loaded workspace service (secrets manager),
// declared as a dependency of app-core and resolved from node_modules at
// runtime. Unlike @elizaos/core / @elizaos/shared (intentionally inlined
// into the node bundle), rolldown cannot cleanly bundle it, so it was being
// implicitly externalized with an UNRESOLVED_IMPORT warning. List it
// explicitly so the externalization is intentional and the warning goes
// away. Ported from upstream milady 546e8d77e (#2175).
const vaultExternal = "@elizaos/vault";
const allExternals = [
  ...nativeExternals,
  vaultExternal,
  pluginExternal,
```

Runtime resolution is preserved: `eliza/packages/vault` (name `@elizaos/vault`, version `2.0.0-beta.1`) is inside the root `workspaces` glob `"eliza/packages/*"`, so `bun install` links it into `node_modules/@elizaos/vault` for the externalized bundle to require. (`bun.lock` currently has no `@elizaos/vault` entry; the next `bun install` in the worktree will add it — dependency of the eliza pin's app-core, not of this edit.)

---

## 6. Verification plan

Run from the worktree root `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-integration-alice-upstream-2026-07-07`:

```bash
# 1. Protected divergence 3.1 must still pass (edits leave the alias untouched)
grep -q 'elizaos-agent-browser-stub' apps/app/vite.config.ts \
  && grep -q 'fs.existsSync' apps/app/vite.config.ts \
  && echo "3.1 PASS"
# New exclude entry landed (Edit 1):
grep -q '"@elizaos/agent",' apps/app/vite.config.ts && echo "exclude PASS"
# Edit 3 landed:
grep -q 'vaultExternal' tsdown.config.ts && echo "vault-external PASS"

# 2. Full production build (tsdown + vite via scripts/run-production-build.mjs), log captured
bun install
bun run build 2>&1 | tee /tmp/wp1-build.log
# Primary regression tripwire: if the agent alias/stub ever stops firing, this build
# FAILS with: '"ACCOUNT_CREDENTIAL_PROVIDER_IDS" is not exported' (rollup static
# named-import check; documented in PROTECTED_DIVERGENCES.md 3.1).

# 3. tsdown vault warning gone (Edit 3 acceptance)
grep -c "Could not resolve '@elizaos/vault'" /tmp/wp1-build.log   # expected: 0
grep "UNRESOLVED_IMPORT" /tmp/wp1-build.log | grep -c "@elizaos/vault"   # expected: 0

# 4. No server-only code leaked into the SPA dist
# 4a. Marker string that exists ONLY in the server agent runtimes
#     (verified unique: eliza/packages/agent/src/runtime/eliza.ts:3938 and
#     packages/agent/src/runtime/eliza.ts; absent from all browser-safe code
#     and from elizaos-agent-browser-stub.ts, which is pure no-op exports):
grep -RIl "Hot-reload: Restarting runtime" apps/app/dist/ ; echo "exit=$? (expect 1 = no match)"
# 4b. No bare node: imports escape into emitted chunks (the CSP-violation class
#     called out at vite.config lines 2054-2059):
grep -RInE 'from\s*"node:|import\s*"node:|require\("node:' --include='*.js' apps/app/dist/assets/ ; echo "exit=$? (expect 1 = no match)"

# 5. Dev-server dep-prebundle sanity (Edit 1 effect; dev-only surface)
rm -rf node_modules/.vite apps/app/node_modules/.vite
bun run dev
# Confirm the dev server boots with no esbuild prebundle-scan crash referencing
# @elizaos/agent (symptom class: 'Missing "./<subpath>" specifier in "@elizaos/agent"'),
# then stop it.
```

Expected outcomes: steps 1 and 5 pass, step 2 exits 0, step 3 both counts 0, step 4a/4b both "no match". Any `ACCOUNT_CREDENTIAL_PROVIDER_IDS is not exported` failure in step 2 means the protected alias regressed, not these edits.