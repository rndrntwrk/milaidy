# WP2-4 TRANSLATION MAP

Scope: every upstream milady feature file landed by the reference merge at `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-sync-milady-develop-2026-07-07/apps/app/src`, classified against (a) Alice's `@miladyai/*` forks at `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-integration-alice-upstream-2026-07-07/packages`, (b) the eliza pin at `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/eliza` (17930c97b9).

## 0. Resolution model (verified, load-bearing)

**Forked package set** (integration worktree `packages/*/package.json` names): `@miladyai/agent`, `@miladyai/app-core`, `@miladyai/plugin-selfcontrol`, `@miladyai/shared`, `@miladyai/types`, `@miladyai/ui`, `@miladyai/vrm-utils` (plus `@rndrntwrk/plugin-555stream` and vendored `@elizaos/plugin-music-library`, `@elizaos/plugin-music-player`, `@elizaos/plugin-shopify`). Root `tsconfig.json` paths map only `@miladyai/plugin-selfcontrol`, `@miladyai/ui`, `@miladyai/agent/*`, `@miladyai/shared`, and `@elizaos/core` -> `./eliza/packages/typescript`.

**Critical namespace fact:** Alice's `@miladyai/ui` is a small design-system package (`components/hooks/layouts/lib/stories` only). The upstream `@elizaos/ui` app-shell symbols live in Alice's `@miladyai/app-core`. Do NOT translate `@elizaos/ui` -> `@miladyai/ui`.

**How Alice's app actually resolves the three key specifiers** (quoted from `apps/app/vite.config.ts` in the integration worktree, lines 1776-1796):

- `@elizaos/shared` -> eliza pin `packages/shared` (alias `buildWorkspaceExportAliases("@elizaos/shared", elizaSharedPkgPath)`)
- `@elizaos/ui` -> eliza pin `packages/ui` (alias `buildWorkspaceExportAliases("@elizaos/ui", elizaUiPkgPath)`)
- `@elizaos/app-core` -> **the `@miladyai/app-core` fork**. Comment at line 1781: "Alice's `@elizaos/app-core` IS the `@miladyai/app-core` fork: the deploy Dockerfile repoints node_modules/@elizaos/app-core at ... (the) milaidy fork".

So the translation rules are:
1. `@elizaos/app-core` imports: keep the specifier, but the **symbol must exist in the fork** (missing = PORT-GAP).
2. `@elizaos/ui` and `@elizaos/shared` imports: keep the specifier, but the **symbol must exist at the eliza pin** (missing = WP6-BLOCKER).
3. Where a symbol exists in both, prefer the fork for anything React-context-touching: Alice `main.tsx` lines 1-5 warn that mixing milaidy's `<App/>` with upstream `@elizaos/app-core`'s AppProvider "creates separate React contexts and crashes `/companion`".

**File inventory check (ls of sync worktree src):** task list confirmed, plus siblings already present in Alice (no port needed): `app-config.ts`, `brand-env.ts`, `character-catalog.ts`, `capacitor-plugin-modules.d.ts`, `cloud-only.ts`, `native-plugin-entrypoints.ts`, `lifeops/LifeOpsActivitySignalsEffect.tsx`, `stubs/empty-node-module.ts`, `main.tsx` (merge target). Companion tests exist upstream and should ride along: `apps/app/test/secure-store/secure-store.test.ts`, `apps/app/test/security/{update-verifier,vision-consent}.test.ts`.

**VoicePill commit archaeology** (`git show --stat` in `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy`):
- `f3fcabf88` "feat(app): add VoicePill overlay renderer": adds `apps/app/src/elizaos-app-core-shim.d.ts` (+209), `apps/app/src/main.tsx` (+96), `apps/app/vite.config.ts` (+36).
- `85acaf996` "feat(pill): wire desktop PillRoot recording to createVoiceCapture factory": modifies `apps/app/src/main.tsx` (+107/-...), `apps/app/src/optional-eliza-app-stub.tsx`.
- Both are contained in `upstream/develop` (via the sync branch). `elizaos-app-core-shim.d.ts` is **GONE** on upstream/develop (`git cat-file -e` fails); it was superseded by `apps/app/src/pill-stubs.tsx` (commit `81b357bfe` "temporary stub for unpublished pill symbols"). So the VoicePill feature today = `pill-stubs.tsx` + the `PillRoot`/`mountPillWindow`/`isPillWindowShellRoute` code inside `main.tsx`. No electrobun host file references the pill (`git grep pill upstream/develop -- apps/app/electrobun` is empty; only `main.tsx` matches `shell=pill`).

---

## 1. Per-file import classification

Legend: OK = resolves; GAP = PORT-GAP (add to fork); WP6 = missing at eliza pin.

### 1.1 MiladyHomeScreen.tsx (gold-home)

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `@elizaos/app-core` | `useApp` | FORKED (resolves to `@miladyai/app-core`) | OK: `packages/app-core/src/state/useApp.ts:6`, re-exported `state/index.ts:9` |
| `@elizaos/shared` (type) | `WalletAddresses`, `WalletBalancesResponse` | ELIZA-RESOLVED (pin shared) | OK: `eliza/packages/shared/src/contracts/wallet.ts` (also in fork shared `contracts/wallet.ts`) |
| `@elizaos/ui` | `HomeScreen`, `HomeScreenProps` (type), `HomeTileTarget` (type) | ELIZA-RESOLVED | **WP6-BLOCKER**: zero grep hits for any of the three across the entire pin `eliza/packages` tree, and zero hits in any Alice fork |
| `react` | `* as React` | 3P | OK (`react ^19.0.0` in both apps/app package.json) |

Runtime contract check: the widget reads `useApp()` fields `walletEnabled`, `walletBalances`, `loadBalances` (present in fork `state/types.ts:414,417,802`), `walletAddresses`, `loadWalletConfig` (unverified but the component casts and optional-chains, so absence degrades, not crashes).

Additional blocker beyond imports: the mount mechanism. Upstream mounts via the `homeScreen` boot-config slot; the pin's `AppBootConfig` (`eliza/packages/ui/src/config/boot-config-store.ts:228`) has **no `homeScreen` or `brandMark` field**, and Alice's fork `AppBootConfig` (`packages/app-core/src/config/boot-config.ts:70-96`) has neither, nor any `HomeScreenMount` in the fork shell.

### 1.2 MiladyMark.tsx

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `react` (type) | `* as React` | 3P | OK |

File is portable as-is. Its wiring (`brandMark` boot-config slot) hits the same missing-slot problem as gold-home.

### 1.3 ambient-eliza-apps.d.ts

Declaration-only shorthand modules (no runtime imports): `@elizaos/app-lifeops/{ui,platform,widgets,components/LifeOpsActivitySignalsEffect}`, `@elizaos/app-steward/ui`, `@elizaos/app-training/ui`, `@elizaos/app-babylon/ui`, `@elizaos/app-scape/ui`, `@elizaos/app-hyperscape/ui`, `@elizaos/app-2004scape/ui`, `@elizaos/app-defense-of-the-agents/ui`, `@elizaos/app-screenshare/ui`, `@elizaos/app-shopify/register`, `@elizaos/app-hyperliquid/client`, `@elizaos/app-task-coordinator/register-slots`. All 12 plugin packages exist at the pin under `eliza/plugins/`. PORTABLE-NOW, and largely redundant: Alice `main.tsx` already imports these subpaths directly (lines 88-140).

### 1.4 android-local-runtime-boot.ts

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `@capacitor/core` | `Capacitor` | 3P | OK (`^8.0.2` both worktrees' apps/app package.json line 29) |
| `@elizaos/ui` | `AGENT_READY_EVENT`, `dispatchAppEvent`, `MOBILE_RUNTIME_MODE_STORAGE_KEY` | ELIZA-RESOLVED | OK at pin: `ui/src/events/index.ts:15,102`; `ui/src/onboarding/mobile-runtime-mode.ts:4` (all barrel-exported from `ui/src/index.ts`). Alice-house-style alternative: first two also exist in fork `app-core/src/events/index.ts:21,190`; the storage key is NOT in the fork (keep the `@elizaos/ui/onboarding/mobile-runtime-mode` import, exactly what Alice `main.tsx:40-43` already does) |
| `./app-config` | `APP_LOG_PREFIX` | LOCAL | OK (Alice has `apps/app/src/app-config.ts`) |
| `./mobile-local-runtime-shared` | `BunRuntimePluginBase` et al. | LOCAL | ported together |

### 1.5 ios-local-runtime-boot.ts

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `@capacitor/core` | `Capacitor` | 3P | OK |
| `@elizaos/ui` | `AGENT_READY_EVENT`, `dispatchAppEvent`, `resolveIosRuntimeConfig` | ELIZA-RESOLVED | OK at pin: events as above; `resolveIosRuntimeConfig` at `ui/src/platform/ios-runtime.ts:89` (Alice `main.tsx:155` already imports it from `@elizaos/ui`) |
| `./app-config` | `APP_LOG_PREFIX` | LOCAL | OK |
| `./mobile-local-runtime-shared` | shared helpers | LOCAL | ported together |

### 1.6 mobile-local-runtime-shared.ts

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `@elizaos/capacitor-bun-runtime` | `ElizaBunRuntime` (static import) | ELIZA-RESOLVED | **WP6-BLOCKER (functional)**: no `bun-runtime` dir under pin `eliza/packages/native-plugins/` (listing: activity-tracker...wifi, none match), zero grep hits for `capacitor-bun-runtime` across pin packages+plugins, and it is not a dependency in either apps/app package.json. The sync-worktree vite native-plugin walk (`vite.config.ts:107-142`) only aliases dirs that exist. **Compile-level escape exists**: the upstream-merge `native-plugin-stubs.ts:7` ships `export const ElizaBunRuntime = null;` and `loadBunRuntimePlugin` no-ops gracefully ("plugin not available"); porting requires adding that stub export to Alice's `native-plugin-stubs.ts` plus a tsconfig path/vite alias mapping `@elizaos/capacitor-bun-runtime` -> the stub (the sync tsconfig maps other `@elizaos/capacitor-*` names to the stub file but NOT bun-runtime, so add it) |

### 1.7 first-run/mobile-runtime-mode.ts

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `@elizaos/shared` | `DEFAULT_DESKTOP_API_PORT` | ELIZA-RESOLVED | OK: pin `shared/src/runtime-env.ts` (also fork shared `runtime-env.ts`) |
| `@elizaos/ui` | `dispatchAppEvent`, `MOBILE_RUNTIME_MODE_CHANGED_EVENT` | ELIZA-RESOLVED | OK: pin `ui/src/events/index.ts:25,102` (fork also has both, `events/index.ts:30,190`) |
| dynamic `import("@capacitor/core")`, `import("@capacitor/preferences")` | | 3P | OK (`@capacitor/preferences ^8.0.1` both) |

Note: this file is a local copy of helpers that **already exist at the pin**: `ANDROID_LOCAL_AGENT_API_BASE` and `normalizeMobileRuntimeMode` at pin `ui/src/onboarding/mobile-runtime-mode.ts:15,26`, `preSeedAndroidLocalRuntimeIfFresh` at `ui/src/onboarding/pre-seed-local-runtime.ts:112`, and Alice `main.tsx:39-44` already imports all of them from those pin subpaths. For Alice this file is optional import-parity sugar, not a requirement.

### 1.8 app-core-browser-compat.js

| Export-from | Target | Verdict |
|---|---|---|
| `../../../eliza/packages/app-core/src/browser.ts` | exists at pin | OK (file exists) |
| `../../../eliza/packages/ui/src/App.tsx` (`App`) | exists at pin | OK |
| `../../../eliza/packages/ui/src/navigation/index.ts` (`getWindowNavigationPath`, `isAppWindowRoute`) | pin `ui/src/navigation/index.ts` | OK |
| `../../../eliza/packages/ui/src/platform/index.ts` re-exporting `applyForceFreshFirstRunReset`, `installForceFreshFirstRunClientPatch`, `shouldInstallMainWindowFirstRunPatches` (aliased back to Onboarding names) | **WP6-BLOCKER**: the pin only has the OLD names (`applyForceFreshOnboardingReset` at `platform/onboarding-reset.ts:72`, `installForceFreshOnboardingClientPatch` at `:114`); the FirstRun-named symbols are a post-pin upstream rename. The file exists precisely to bridge NEW eliza to old call sites | blocked and **unnecessary for Alice**: Alice imports the old names from `@elizaos/ui` directly (main.tsx:57-60, 303, 358) |

### 1.9 native-plugin-stubs.ts (upstream-merge version)

No imports at all (pure stub exports). Diff vs Alice's existing copy: upstream adds `ElizaBunRuntime = null` (line 7) and the Camera stub trio (`CameraDirection`, `PhotoResult`, `Camera`, lines 42-100); everything else (Desktop, MobileSignals family, DeviceBridge) already matches Alice's copy. Action = additive merge into Alice's file, not replacement. PORTABLE-NOW.

### 1.10 optional-eliza-app-stub.tsx (upstream-merge version)

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `@elizaos/shared` (type) | `DropStatus`, `MintResult` | ELIZA-RESOLVED | OK pin `shared/src/contracts/drop.ts` |
| `@elizaos/ui` (type) | `CompanionSceneStatus`, `CompanionShellComponentProps`, `InventoryChainFilters` | ELIZA-RESOLVED | OK pin: `ui/src/config/boot-config-store.ts:97,78`; `ui/src/state/useWalletState.ts` (barrel-exported) |
| `@elizaos/ui/api` (type) | `RegistryStatus`, `WalletExportResult`, `WhitelistStatus` | ELIZA-RESOLVED | OK pin: `api/client-types-cloud.ts:901,927`, `api/client-types-config.ts:832`, reachable via `api/index.ts` -> `client.ts:134 export * from "./client-types"` -> `client-types.ts:6-14` |
| `@elizaos/shared` (type) | `WalletAddresses`, `WalletBalancesResponse`, `WalletChainKind`, `WalletConfigStatus`, `WalletConfigUpdateRequest`, `WalletEntry`, `WalletNftsResponse`, `WalletPrimaryMap`, `WalletRpcChain`, `WalletRpcCredentialKey`, `WalletRpcSelections` | ELIZA-RESOLVED | OK: all 11 at pin `shared/src/contracts/wallet.ts`. Fork-shared note: `WalletChainKind`, `WalletEntry`, `WalletPrimaryMap` are MISSING from `@miladyai/shared` (grep), but that is not a gap because `@elizaos/shared` resolves to the pin |
| `react` (type) | `ComponentType` | 3P | OK |
| `three` | `* as THREE` | 3P | OK (`three ^0.183.2` both) |
| `@elizaos/ui` (type, line 207) | `ChatSidebarWidgetDefinition` | ELIZA-RESOLVED | OK pin `ui/src/components/chat/widgets/types.ts:10` (barrel via `components/index.ts:30`) |

**Important:** Alice already has its OWN translated copy of this file (imports from `@elizaos/app-core`, `@elizaos/app-core/api`, `@elizaos/app-core/state/types`, i.e. the fork). Keep Alice's copy; merge upstream content deltas only. Do not overwrite with the upstream import shape.

### 1.11 pill-stubs.tsx

| Import | Symbols | Class | Verdict |
|---|---|---|---|
| `react` | `ReactElement` (type), `useEffect`, `useRef`, `useState` | 3P | OK |

Exports the entire pill surface locally: `ConversationMessage`, `VoicePillMessage`, `VoiceCaptureSegment`, `VoiceCaptureState`, `VoiceCaptureOptions`, `VoiceCaptureHandle`, `createVoiceCapture`, `normalizePillMessage`, `VoicePillProps`, `VoicePill`. The real `VoicePill`/`createVoiceCapture` do NOT exist at the pin (`ui/src/voice/` has only voice-chat-* files; no `voice-pill` dir; zero grep hits), which is exactly why upstream ships this stub. PORTABLE-NOW.

### 1.12 secure-store/* (8 files)

| File | Imports | Class | Verdict |
|---|---|---|---|
| `types.ts` | none | | OK |
| `audit.ts` | none | | OK |
| `memory-backend.ts` | `./types.js` (type `SecureStore`) | LOCAL | OK |
| `capacitor-backend.ts` | `./types.js` (type) | LOCAL | OK (plugin injected via constructor, deliberately no static Capacitor import, header comment lines 4-11) |
| `electrobun-backend.ts` | `./types.js` (type) | LOCAL | OK |
| `webcrypto-backend.ts` | `./types.js` (type) | LOCAL | OK (globalThis.crypto) |
| `migration.ts` | `./audit.js` (`emitClientAudit`), `./types.js` (`SENSITIVE_KEYS`, type) | LOCAL | OK |
| `index.ts` | `./capacitor-backend.js`, `./electrobun-backend.js` (`detectElectrobunKeychain`, `ElectrobunSecureStore`), `./memory-backend.js`, `./types.js`, `./webcrypto-backend.js`, re-exports `./audit.js`, `./migration.js` | LOCAL | OK |

Zero external imports in the whole directory. PORTABLE-NOW.

### 1.13 security/* (5 files)

| File | Imports | Class | Verdict |
|---|---|---|---|
| `release-trust-anchor.ts` | none | | OK (placeholder pubkey constant, human-in-loop note) |
| `SecurityConsent.tsx` | `react` (`ReactElement`, `ReactNode` types, `useCallback`, `useEffect`, `useState`); `../../app.config` (default `appConfig`); `./vision-consent.js` (types) | 3P + LOCAL | OK: Alice has `apps/app/app.config.ts` |
| `vision-consent.ts` | `../secure-store/audit.js` (`emitClientAudit`); `../secure-store/types.js` (type `SecureStore`) | LOCAL | OK (depends on secure-store port) |
| `update-verifier.ts` | `../secure-store/audit.js` (`emitClientAudit`); `./release-trust-anchor.js` (`isPlaceholderPublicKey`, `MAX_CONSECUTIVE_VERIFICATION_FAILURES`, `RELEASE_SIGNING_KEY_PURPOSE`, `RELEASE_SIGNING_PUBLIC_KEY_BASE64`) | LOCAL | OK (deliberately does NOT import `@elizaos/security`, defines a minimal `UpdateKmsClient` locally, per header lines 40-42) |
| `index.ts` | re-exports of the above 4 files | LOCAL | OK |

PORTABLE-NOW as a unit (must land together with secure-store).

### 1.14 VoicePill feature code inside main.tsx (PillRoot, mountPillWindow, isPillWindowShellRoute, pill helpers)

External surface used by the ~350 lines of pill code (upstream main.tsx 940-1330):

| Dependency | Class | Verdict in Alice |
|---|---|---|
| `./pill-stubs` (all pill symbols) | LOCAL | OK once 1.11 ports |
| `client` from `@elizaos/app-core` | FORKED | OK: fork `app-core/src/api/client.ts` has every method PillRoot calls: `listConversations` (:5375), `getConversationMessages` (:5411), `connectWs` (:4875), `onWsEvent` (:5106), `createConversation` (:5379), `sendConversationMessageStream` (:5483). Alice main.tsx already imports `client` from `@miladyai/app-core/api` (line 31) |
| `react` hooks, `react-dom/client` `createRoot` | 3P | OK (Alice mountReactApp already uses createRoot, main.tsx:781) |
| `APP_LOG_PREFIX` from `./app-config` | LOCAL | OK |
| localStorage pill-conversation helpers, styles injection | LOCAL | self-contained |

PORTABLE-NOW.

---

## 2. WIRING: upstream mount points vs Alice insertion points

### 2.1 gold-home + brandMark (upstream main.tsx lines 351-359)

```tsx
// Milady brand home screen — rendered by the shell's HomeScreenMount via the
// `homeScreen` boot-config slot (gold home + wallet widget beside the clock).
// Assigned through a widened view because the published @elizaos/app-core types
// may pre-date the slot; the local runtime + the milady app-core patch honor it.
(appBootConfig as { homeScreen?: typeof MiladyHomeScreen }).homeScreen =
  MiladyHomeScreen;
(appBootConfig as { brandMark?: typeof MiladyMark }).brandMark = MiladyMark;
```

Alice insertion point: after the `appBootConfig` literal (Alice main.tsx lines 321-357) and before `setBootConfig(appBootConfig)` at line 423. **However the slot is dead at our pin**: neither pin `boot-config-store.ts` nor fork `boot-config.ts` has `homeScreen`/`brandMark` fields, and no `HomeScreenMount` exists in the fork shell, so assignment would be a silent no-op. Do not wire until WP6 (or a fork backport of the slot + HomeScreen).

### 2.2 Mobile local-runtime boot hooks (upstream main.tsx lines 640-656)

```tsx
    await import("@elizaos/app-core/platform/native-plugin-entrypoints");
    await initializeKeyboard();
    initializeAppLifecycle();
    initializeMobileRuntimeModeListener();
    void initializeMobileDeviceBridge();
    void initializeMobileAgentTunnel();
    // iOS local runtime: when ios-runtime mode resolves to "local", the
    // on-device JS runtime (@elizaos/capacitor-bun-runtime) is started here ...
    void bootIosLocalRuntimeIfApplicable();
    // Android local runtime: when mobile-runtime-mode is "local", calls
    // ElizaBunRuntimePlugin.start() ...
    void bootAndroidLocalRuntimeIfApplicable();
```

Alice's analogous block is `initializePlatform()` (main.tsx lines 473-490); the `isIOS || isAndroid` branch ends at line 482 with `void initializeMobileDeviceBridge();`. Insert the two `void boot*LocalRuntimeIfApplicable();` calls right after line 482 (Alice has no `initializeMobileAgentTunnel`; skip it). Imports go beside line 149-150-style top-level imports. No companion interaction: this branch runs only on native mobile after mount.

### 2.3 VoicePill / pill window (upstream main.tsx lines 253-266, 1310-1322, 1675-1682)

```tsx
// `isPillWindowShell` is not yet exported from the published @elizaos/app-core
// alpha. The pill window is launched with `?shell=pill` by the Electrobun
// host, so we detect that locally until the upstream helper ships.
function isPillWindowShellRoute(route: unknown): boolean { ... params.get("shell") === "pill" ... }
```
```tsx
  if (isPillWindowShellRoute(windowShellRoute)) {
    // Pill overlay window: minimal renderer that only mounts <VoicePill>.
    // No AppProvider, no chrome, no platform init ...
    mountPillWindow();
    return;
  }
  if (isPopoutWindow()) { ... }
```

Alice insertion point: in `main()` (Alice main.tsx line 1031), insert the pill early-return **before** the `if (isPopoutWindow())` check at line 1061 (mirroring upstream's ordering: pill before popout before detached). `mountPillWindow`/`PillRoot`/`injectPillRendererStyles` land as new functions beside `mountReactApp` (line 773).

**Companion-collision analysis:** Alice's companion path is NOT an early return in `main()`; it is handled inside `mountReactApp` via `isPhoneCompanionMode()` (line 739: `pathname === "/companion"` or `?mode=companion`), which renders `<CompanionRouteTabSync/>` inside the normal `<AppProvider><App/></AppProvider>` tree (lines 777, 801). `isPillWindowShellRoute` keys only on route kind `"pill"` or `?shell=pill`, so it can never match `/companion`. Safe as long as (a) the pill check is purely additive above line 1061, (b) it does not touch `isPhoneCompanionMode` or `mountReactApp`, and (c) nobody launches the companion URL with `?shell=pill`.

### 2.4 secure-store init + SecurityConsent

**Upstream has NO main.tsx wiring for either.** Verified: `git grep -l "secure-store|getSecureStore|SecurityConsent|createVisionConsentStore|createUpdateVerifier" upstream/develop -- apps/ packages/` matches only the feature's own files, its tests, and `apps/app/docs/CLIENT-DATA-SECURITY.md`. They are drop-in libraries; `secure-store/index.ts` documents the intended (future) boot call: "call `getSecureStore()` once at boot ... `migrateLegacyLocalStorage()` immediately after". Porting = copy files + tests; adding a boot call in Alice would be new work beyond upstream parity (if added, the natural place is early in Alice `main()` at line 1031, before any feature reads sensitive keys, and outside the companion-sensitive mount path).

### 2.5 first-run copy

Upstream main.tsx line 34-39 imports `ANDROID_LOCAL_AGENT_API_BASE`, `MOBILE_RUNTIME_MODE_STORAGE_KEY`, `normalizeMobileRuntimeMode`, `preSeedAndroidLocalRuntimeIfFresh` from `./first-run/mobile-runtime-mode`. Alice already imports the same four from the pin's `@elizaos/ui/onboarding/mobile-runtime-mode` + `@elizaos/ui/onboarding/pre-seed-local-runtime` (main.tsx lines 39-44), so Alice needs no change here.

---

## 3. VERDICTS + PORT ORDER

| Feature | Verdict | Detail |
|---|---|---|
| **secure-store/** (8 files + test) | **PORTABLE-NOW** | zero external imports; no wiring required |
| **security/** (5 files + 2 tests) | **PORTABLE-NOW** | react + `../../app.config` (exists in Alice) + secure-store internals; no wiring required |
| **VoicePill** (pill-stubs.tsx + PillRoot/mountPillWindow/isPillWindowShellRoute in main.tsx) | **PORTABLE-NOW** | all client APIs exist in fork client; stubs are upstream's own current mechanism (real `VoicePill`/`createVoiceCapture` missing at pin is WP6 for de-stubbing only); desktop-only, inert without an Electrobun `?shell=pill` launcher (none exists upstream either) |
| **stubs** (native-plugin-stubs additions, ambient-eliza-apps.d.ts, optional-eliza-app-stub) | **PORTABLE-NOW / PORT-GAP (tiny)** | additive merge of `ElizaBunRuntime` + Camera stubs into Alice's native-plugin-stubs.ts; add tsconfig/vite mapping `@elizaos/capacitor-bun-runtime` -> stub; ambient d.ts trivial; KEEP Alice's already-translated optional-eliza-app-stub and merge content deltas only |
| **mobile-boot** (ios/android boot, mobile-local-runtime-shared, first-run copy) | **PORTABLE-NOW (compile, graceful no-op) / BLOCKED-ON-WP6 (function)** | every `@elizaos/ui` + `@elizaos/shared` + `@capacitor/*` symbol exists at pin; the one blocker is `@elizaos/capacitor-bun-runtime` (`ElizaBunRuntime`), absent from the pin's `native-plugins/` and from npm deps; with the stub mapping the boots compile and no-op ("plugin not available"); a real on-device Bun runtime needs the post-pin native plugin = WP6 |
| **MiladyMark** | **PORTABLE-NOW (file) / BLOCKED-ON-WP6 (wiring)** | react-only file; `brandMark` slot absent from pin and fork boot configs |
| **gold-home (MiladyHomeScreen)** | **BLOCKED-ON-WP6** | missing at pin AND in every fork: `HomeScreen`, `HomeScreenProps`, `HomeTileTarget` (no grep hit anywhere in `eliza/packages` at 17930c97b9), plus the `homeScreen` boot-config slot + `HomeScreenMount` shell support. Alternative is a substantial PORT-GAP backport of HomeScreen + slot into `@miladyai/app-core` |
| **app-core-browser-compat.js** | **BLOCKED-ON-WP6 and SKIP** | re-exports post-pin FirstRun-renamed symbols (`applyForceFreshFirstRunReset`, `installForceFreshFirstRunClientPatch`, `shouldInstallMainWindowFirstRunPatches`) that do not exist at the pin (only the Onboarding-named originals do); Alice already consumes the old names directly, so the compat shim is unnecessary until WP6 |

**Recommended port order:**
1. `secure-store/*` + `security/*` + their 3 tests (zero risk, zero wiring, SOC2 surface lands early).
2. `pill-stubs.tsx` + PillRoot/mountPillWindow/isPillWindowShellRoute into Alice `main.tsx` (insert before line 1061; additive; no companion interaction).
3. Stub hygiene: merge `ElizaBunRuntime` + Camera into Alice `native-plugin-stubs.ts`, add the `@elizaos/capacitor-bun-runtime` stub mapping, port `ambient-eliza-apps.d.ts`, merge optional-eliza-app-stub deltas into Alice's translated copy.
4. Mobile-boot: `mobile-local-runtime-shared.ts`, `ios-local-runtime-boot.ts`, `android-local-runtime-boot.ts` (+ optional `first-run/` copy for import parity), wire the two `void boot*` calls after Alice main.tsx line 482. Ships as graceful no-op; flips to functional at WP6.
5. `MiladyMark.tsx` file (hold wiring), and hold `MiladyHomeScreen.tsx` + `app-core-browser-compat.js` entirely for WP6 (eliza bump delivering `HomeScreen`/slot machinery, the FirstRun renames, `@elizaos/capacitor-bun-runtime`, and the real `VoicePill`/`createVoiceCapture` to delete pill-stubs).