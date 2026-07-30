# Alice Surface Inventory - 2026-07-07 baseline

Regression checklist for the milaidy integration work packages. Every work package must verify against this inventory before merge.

**Source trees referenced (paths abbreviated below):**

- `WORKTREE` = `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/.worktrees/milaidy-integration-alice-upstream-2026-07-07` (milaidy checkout: `apps/app/` SPA + `packages/` `@miladyai/*` forks incl. `packages/plugin-555stream` = `@rndrntwrk/plugin-555stream`)
- `ELIZA` = `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/eliza` at commit `17930c97b9` (tip: "fix(agent): relay /api/emote to live broadcast via stream555"). This checkout supplies the runtime packages (`packages/agent`, `packages/app-core`, `packages/ui`, `packages/shared`, `plugins/plugin-computeruse`) that alice-bot actually serves.

**Smoke-test conventions:** `$BASE` = the agent API origin (default single-process port `2138`, `DEFAULT_SERVER_ONLY_PORT` in `ELIZA/packages/shared/src/runtime-env.ts:4`; dev API is `31337`). `$TOK` = the self-hosted API token (`MILADY_API_TOKEN` / `ELIZA_API_TOKEN`).

---

## 1. `/companion` render

**Entry points**

- `WORKTREE/apps/app/src/main.tsx:739-747` - `isPhoneCompanionMode()`: returns true when `window.location.pathname` (trailing slashes stripped) is exactly `/companion`, or when `?mode=companion` is present in search or hash query.
- `main.tsx:749-757` - `CompanionRouteTabSync`: `useEffect` calls `setTab("companion")` so the app-core shell selects the companion tab.
- `main.tsx:773-809` - `mountReactApp()`: line 777 computes `phoneCompanion`, line 801 conditionally mounts `<CompanionRouteTabSync />` next to `<App />` inside `<AppProvider>`.
- `main.tsx:332` (`companionShell: CompanionShell`) and `main.tsx:335` (`companionGlobalOverlay: GlobalEmoteOverlay`) register the companion components (imported from `@elizaos/app-companion/ui`, `main.tsx:88-96`) into `appBootConfig`.
- `main.tsx:1-5` - load-bearing comment: `App` and `AppProvider` must both come from `@miladyai/app-core`; mixing milaidy's `<App />` with upstream `@elizaos/app-core`'s `AppProvider` creates separate React contexts and crashes `/companion` with `"useApp must be used within AppProvider"`.
- `WORKTREE/packages/app-core/src/App.tsx:536-541` - `shellContent` renders `<CompanionShell tab="companion" ...>` when `uiShellMode === "companion"` (default shell mode; `state/persistence.ts:490` maps anything but `"native"` to `"companion"`). In native mode the companion tab renders an empty shell and the registered companion overlay app draws the UI (`App.tsx:542-548`, side-effect import at `App.tsx:65`).
- Overlay mount: `App.tsx:891` renders `<ShellOverlays ...>`; `components/shell/ShellOverlays.tsx:20` mounts `<GlobalEmoteOverlay />`, which listens for `eliza:app-emote` window events (`components/companion/GlobalEmoteOverlay.tsx:40-80`, event constant `events/index.ts:40`).
- Feature-flag trap: `WORKTREE/packages/app-core/src/navigation/index.ts:25-27` (`COMPANION_ENABLED`, opt-out via `VITE_ENABLE_COMPANION_MODE=false`) and `:281-287`: when disabled, `/companion` silently resolves to the chat tab.

**Flow.** A request for `/companion` serves the SPA; `isPhoneCompanionMode()` detects the path, `mountReactApp()` mounts the normal `<App />` plus `CompanionRouteTabSync`, which forces the companion tab. Because the default `uiShellMode` is `"companion"`, `App.tsx` short-circuits `shellContent` to `<CompanionShell>` (VRM stage, no Header/sidebar chrome), and `ShellOverlays` layers `GlobalEmoteOverlay` on top.

**Onboarding bypass.** There is no client-side route exception: `/companion` passes the same `StartupCoordinator` gate as every view (`App.tsx:841-848`). It skips the wizard because (a) the `#token=` bootstrap persists a remote active server (`main.tsx:411-420`), so the coordinator takes `SESSION_RESTORED -> resolving-target -> polling-backend` (`state/startup-coordinator.ts:146-171`), and (b) the backend (single-tenant alice-bot, state in `milaidy.json` on the PVC) reports onboarding complete via the onboarding-status poll (`state/startup-phase-poll.ts:193-217`), which dispatches `BACKEND_REACHED onboardingComplete=true` (`startup-phase-poll.ts:329-332`) and the reducer jumps straight to `starting-runtime`, skipping `onboarding-required` (`startup-coordinator.ts:180-184`). The separate `/broadcast/*` path goes further and skips the coordinator gate entirely, with `localStorage["eliza:onboarding-complete"]="1"` seeded as defense-in-depth (`App.tsx:789-802`; persistence key at `state/persistence.ts:415`).

**Smoke test.** Open `https://<host>/companion#token=$TOK` in a browser. Expect: VRM companion stage renders full-screen, no onboarding wizard, no Header chrome, no console crash.

**Regression looks like:** onboarding wizard appearing on `/companion`; white screen with `"useApp must be used within AppProvider"`; chat view rendering instead of the companion stage (flag or tab-routing regression); emote overlay never appearing (ShellOverlays unmounted).

---

## 2. Self-hosted token auth (hash-fragment bootstrap)

**Entry points**

- `WORKTREE/apps/app/src/main.tsx:364-422` - the whole bootstrap block:
  - `:367` `SELF_HOSTED_TOKEN_KEY = "milady:self-hosted-api-token"` (localStorage key).
  - `:374-376` reads the token only from the URL fragment (`#token=...`), parsed via `URLSearchParams` over `url.hash`.
  - `:377-382` **refuses** `?token=` query bootstrap: `console.error("[milady] Refusing insecure ?token=... bootstrap. Use #token=... instead.")`; the query token is never used.
  - `:368-372, 384-389` clears stale bootstrap keys (`elizaos:agent-profiles`, `elizaos:active-server`, mobile runtime mode) before accepting a fresh fragment token.
  - `:390-392` persists the token to localStorage; `:394-398` strips both `#token` and `?token` from the address bar via `history.replaceState`.
  - `:399-404` falls back to the saved localStorage token when no fragment is present.
  - `:405-410` wires `appBootConfig.apiToken`, defaults `apiBase` to `window.location.origin`, and calls `client.setToken(...)`.
  - `:411-420` persists an active server record (`kind: "remote"`, `apiBase: origin`, `accessToken`, label "Self-hosted Alice").
- Bearer wiring: `WORKTREE/packages/app-core/src/api/client.ts:2411-2415` (`setToken` stores into boot config) and `:2471` / `:3529` (fetch paths attach `Authorization: Bearer ${token}`).

**Flow.** The operator opens the public URL once with `#token=...`. Because the fragment never leaves the browser, the token cannot land in server access logs, proxies, or `Referer` headers (comment at `main.tsx:364-366`). It is persisted per-origin in localStorage and every subsequent API/WS call carries it as a Bearer header.

**Why this matters.** The public Modal URL stays locked: the server auto-enforces a token for non-loopback binds (`ELIZA/packages/agent/src/api/server-helpers-auth.ts:85-86` comment on `ensureApiTokenForBindHost`) and the app-core compat gates return 401, escalating to 429 under failed-auth throttling (`ELIZA/packages/app-core/src/api/auth.ts:123-148, 171-237`). Without the fragment bootstrap, no browser can authenticate against the locked deployment.

**Smoke test.**
1. Open `https://<host>/#token=$TOK`: the token disappears from the URL bar, `localStorage["milady:self-hosted-api-token"]` is set, and the app loads past pairing.
2. `curl -is $BASE/api/agents | head -1` (no auth header, non-local origin) -> `401`.
3. Open `https://<host>/?token=$TOK` -> stays unauthenticated, console shows the `Refusing insecure ?token=` error.

**Regression looks like:** token remaining visible in the URL; `?token=` being accepted; pairing screen shown despite a valid saved token; every API call 401ing because `client.setToken` wiring broke.

---

## 3. `POST /api/emote` + broadcast relay

**Entry points**

- `ELIZA/packages/agent/src/api/misc-routes.ts:224-319` - `POST /api/emote` handler (`GET /api/emotes` catalog at `:217-221`):
  - `:227-242` zod-validates the body and resolves `emoteId` against the companion emote catalog (400 on unknown).
  - `:243-249` broadcasts `{type:"emote", emoteId, path, duration}` over the operator-UI WebSocket (`state.broadcastWs`), which reaches browser tabs only.
  - `:260-279` looks up `state.runtime.getService("stream555")` and builds the diagnostics object (`hasService`, `hasBroadcastEvent`, `boundSessionId`, `sent`).
  - `:280-310` calls `streamControl.broadcastEvent("emote", {...})` guarded by a 5000 ms timeout race; a pre-attached no-op catch prevents unhandled rejections (`:288-290`).
  - `:317` responds `{ok: true, broadcast: {...}}`.
- `WORKTREE/packages/plugin-555stream/src/services/StreamControlService.ts:653-677` - `broadcastEvent(topic, payload, sessionId?)`: POSTs `{topic, payload}` to the control-plane at `/api/agent/v1/sessions/<id>/livekit/broadcast-event` via the plugin `HttpClient` (Bearer auth, retries; `src/lib/httpClient.ts`). Throws `'[555stream] Service not initialized'` / `'[555stream] No session bound'` when unwired (`:658-665`). Service type is `stream555` (`StreamControlService.ts:145`).
- Plugin resolution: `ELIZA/packages/agent/src/runtime/plugin-collector.ts:41` (`STREAM555_PLUGIN_PACKAGE = "@rndrntwrk/plugin-555stream"`) and `:260-261` (`"stream555-canonical"` / `"555stream"` ids).
- Browser overlay leg: `WORKTREE/packages/app-core/src/state/AppContext.tsx:7675-7683` (WS `"emote"` event -> `dispatchAppEmoteEvent`), `events/index.ts:40` (`APP_EMOTE_EVENT = "eliza:app-emote"`), `components/companion/GlobalEmoteOverlay.tsx:40-80` (window-event listener, 2400 ms overlay).

**Flow.** `POST /api/emote` fans out on two rails: (1) operator-UI WebSocket -> `AppContext` -> `eliza:app-emote` window event -> `GlobalEmoteOverlay` + VrmStage in any subscribed browser tab; (2) `StreamControlService.broadcastEvent('emote')` -> control-plane -> `show:emote:<session>` published on redis -> capture-service-gpu dispatches `eliza:app-emote` in the headless broadcast page so VrmStage plays the emote on the streamed video track going to Cloudflare -> Twitch/Kick/YouTube/Pump (comment at `misc-routes.ts:251-259`; commit message of `17930c97b9`).

**Where failures surface.** Deliberately in-band, not in a log: the relay outcome (`hasService`, `hasBroadcastEvent`, `boundSessionId`, `sent`, `error` with stack, or `reason` "stream555 service not available" / "no broadcastEvent method") is returned in the HTTP response `broadcast` field (`misc-routes.ts:271-315`), because the container's stdout is block-buffered and WARN logs were unreadable there (the pre-fix failure mode: `ok:true` while the relay error was swallowed by a debug catch). A single curl is the verification path. `misc-routes.ts` contains zero `logger.*` calls at this pin (grep-verified).

**Smoke test.**
```
curl -s -X POST $BASE/api/emote -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOK" -d '{"emoteId":"wave"}'
```
Expect `{"ok":true,"broadcast":{"hasService":true,"hasBroadcastEvent":true,"boundSessionId":"<session>","sent":true,"result":{...}}}` and, when live, the emote visibly playing on the public broadcast.

**Regression looks like:** `broadcast.sent:false` with an `error`/`reason`; `hasService:false` (plugin not collected: check the `@rndrntwrk/plugin-555stream` mapping); `boundSessionId:null` (no show bound); overlay firing in browser tabs while the public stream shows nothing (rail 2 broken).

---

## 4. `/api/companion/stage`, operator action routes, overlay-presence, computer-use approvals

**Entry points**

- `GET /api/companion/stage`: `ELIZA/packages/app-core/src/api/server.ts:940-949` (auth-gated, returns `{ok, state}` from `aliceReadCompanionStageState()`).
- `POST /api/companion/stage`: `server.ts:968-985` (requires `{patch}`, deep-merges + sanitizes + writes; the state file is `$ELIZA_DATA_DIR/companion/stage.json` per `WORKTREE/packages/app-core/src/components/companion/CompanionSceneHost.tsx:134`).
- `GET /api/broadcast/<channel>/stage`: `server.ts:951-966`; only `alice-cam` is a known channel, anything else 404s.
- `POST /api/apps/overlay-presence`: `ELIZA/packages/agent/src/api/apps-routes.ts:907-926` (dashboard heartbeat for overlay apps such as companion; zod-validated `{appName}`, replies `{ok:true, appName}`).
- Computer-use approvals: `ELIZA/plugins/plugin-computeruse/src/routes/computer-use-routes.ts:41-68`, wired into the agent server at `server.ts:70` and dispatched at `server.ts:1685`:
  - `GET /api/computer-use/approvals` (snapshot)
  - `GET /api/computer-use/approvals/stream` (SSE)
  - `POST /api/computer-use/approval-mode`
  - `POST /api/computer-use/approvals/:id` (decision; 404 when not pending)
- Operator action routes (`ELIZA/packages/agent/src/api/misc-routes.ts`): `POST /api/restart` (:156), `GET /api/emotes` (:217), `POST /api/emote` (:224), `POST /api/agent/event` (:322), `POST /api/terminal/run` (:366), `GET|POST /api/custom-actions` (:577/:583), `POST /api/custom-actions/generate` (:639).

**app-core bridge auth (the 401/429 wall).** `ELIZA/packages/app-core/src/api/server-upstream-auth-bridge.ts:7-40` lists the bridged prefixes, including `/api/companion`, `/api/emote`, `/api/emotes`, `/api/apps`, `/api/computer-use`, `/api/broadcast`, `/api/stream`, `/api/streaming`, `/api/agents`, `/api/config`. `bridgeSessionAuthToUpstream` (`:63-90`) accepts a valid session cookie or bearer, then injects the upstream token (`Authorization: Bearer` + `x-api-key`) before forwarding. It runs on every request via `app-core/src/api/server.ts:1162-1166`. Denials come from `app-core/src/api/auth.ts`: 401 `Unauthorized`, escalating per-IP to 429 `"Too many authentication attempts"` under the failed-auth throttle (`auth.ts:140-147, 228-236`). If the bridge or token plumbing regresses, every route above fails at once: the workbook's "walls of 401/429".

**Routes that must stay reachable after bridge auth** (authorized request -> 200): `GET/POST /api/companion/stage`, `GET /api/broadcast/alice-cam/stage`, `POST /api/apps/overlay-presence`, `GET /api/computer-use/approvals`, `GET /api/computer-use/approvals/stream`, `POST /api/computer-use/approval-mode`, `POST /api/emote`, `GET /api/emotes`, `POST /api/agent/event`, `POST /api/restart`, `GET/POST /api/custom-actions`.

**Smoke test.**
```
curl -s -H "Authorization: Bearer $TOK" $BASE/api/companion/stage        # {"ok":true,"state":{...}}
curl -s -H "Authorization: Bearer $TOK" $BASE/api/computer-use/approvals # approval snapshot JSON
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"appName":"companion"}' $BASE/api/apps/overlay-presence           # {"ok":true,"appName":"companion"}
```

**Regression looks like:** 401 on these routes with a valid token, then 429 after retries (bridge auth broken); `POST /api/companion/stage` 400 "Missing 'patch' field" from previously-working callers (schema drift); the approvals SSE stream closing immediately.

---

## 5. Go-live control

**Entry points**

- Button: `ELIZA/packages/ui/src/components/stream/StatusBar.tsx:104` renders the "Go Live" label (`t("statusbar.GoLive")`) inside the stream StatusBar.
- Handler: `ELIZA/packages/ui/src/components/pages/StreamView.tsx:54-96` - `toggleStream()` calls `client.streamGoLive()` (or `streamGoOffline()`), opens the popout viewer window on success (`:66-82`), and on failure logs `console.warn("[stream] Failed to toggle stream:", err)` and re-syncs from `client.streamStatus()` (`:84-91`).
- Client methods: `ELIZA/packages/ui/src/api/client-agent.ts:3364-3374` - `streamGoLive()` = `POST /api/stream/live`, `streamGoOffline()` = `POST /api/stream/offline`, `streamStatus()` = `GET /api/stream/status`.
- Backend: the `/api/stream/*` routes are served by `handleStreamRoute` from `@elizaos/plugin-streaming`, dynamically registered at agent startup (`ELIZA/packages/agent/src/api/server.ts:3529-3543`; comment: configured streaming destinations are injected "so /api/stream/live can fetch credentials").
- Agent-action go-live (the 555stream public-broadcast path): `WORKTREE/packages/plugin-555stream/src/actions/legacyCompat.ts:708-838` - `STREAM555_GO_LIVE` (compat alias for `STREAM555_STREAM_START`, `actions/streamStart.ts:28`): syncs configured destinations, POSTs the control-plane `/api/agent/v1/sessions/<id>/stream/start` with `{input:{type,url?},options:{scene,avatarIdentity?}}` (`:761-773`), then waits for the Cloudflare connected readiness state and fails loudly via callback if it never connects (`:787-806`). With `inputType: avatar`, the capture-service's headless Chromium navigates to the broadcast companion view (`WORKTREE/packages/app-core/src/App.tsx:783-787`).

**Flow.** Two distinct go-live surfaces exist and both must keep working: (1) the operator-UI Stream tab button -> `POST /api/stream/live` -> plugin-streaming ffmpeg/RTMP path; (2) the agent's `STREAM555_GO_LIVE` action -> 555stream control-plane session start -> Cloudflare -> platform restreams.

**Smoke test.** UI: Stream tab -> click "Go Live"; button flips to live state and the popout opens. API: `curl -s -X POST -H "Authorization: Bearer $TOK" $BASE/api/stream/live` -> `{live: true, ...}`. Agent: invoke `STREAM555_GO_LIVE` and expect a success callback with `sessionId` + readiness snapshot.

**Regression looks like:** the button stuck on loading with `[stream] Failed to toggle stream` warnings; `POST /api/stream/live` 404 (plugin-streaming route never registered); `STREAM555_GO_LIVE failed: stream start did not reach Cloudflare connected state` callbacks; go-live succeeding but no popout/broadcast frames.

---

## 6. `/health` startup contract

**Entry points**

- `ELIZA/packages/app-core/src/api/kube-health.ts:11-28` - `buildKubeHealthResponse(pathname, hasRuntime, uptime)`: `/health/live` is always 200; `/health` and `/health/ready` return **503** with `{ok:false, ready:false, agentState:"starting"}` until the runtime is ready, then 200 with `agentState:"running"`.
- Route wiring: `ELIZA/packages/app-core/src/api/server.ts:1131-1145` - the three health paths are answered before any auth gate, keyed on `state.kubeReady`.
- Readiness flag: `server.ts:1239-1241` (`kubeReady` initialized to `Boolean(runtime)`) and `server.ts:1293-1302` (`updateStartup` sets `kubeReady=true` only when startup state becomes `"running"`, false on any other state).
- Startup marker: `ELIZA/packages/app-core/src/runtime/eliza.ts:136` - `startupInfo` logs `[milady][startup] <event>`; the terminal marker `start-eliza:done` is emitted at `eliza.ts:1266-1270` (server-only path, with port + elapsedMs) immediately before `apiServerHandle.updateStartup({state:"running"...})` at `:1271-1275` flips `/health` to 200; the non-server-only path logs it at `:1342-1345`.

**Flow.** Kubernetes (and the deploy verifier) treat `/health/live` as liveness (200 from the moment the HTTP listener is up) and `/health` (or `/health/ready`) as readiness (503 until the eliza runtime finished booting). The log line `[milady][startup] start-eliza:done` and the `/health` 200 flip are the same instant by construction.

**Smoke test.**
```
curl -is $BASE/health/live | head -1   # HTTP/1.1 200 (even during boot)
curl -is $BASE/health | head -1        # 503 during boot, 200 after start-eliza:done
curl -s  $BASE/health                  # {"ok":true,"ready":true,"agentState":"running","uptime":N}
```
Cross-check the pod log for `[milady][startup] start-eliza:done`.

**Regression looks like:** `/health` returning 200 before the runtime is up (rollouts route traffic into a booting pod); `/health` stuck at 503 after `start-eliza:done` (kubeReady wiring broken, pod restart-loops); `/health/live` ever returning non-200; the `[milady][startup]` marker disappearing from logs (deploy verification scripts key on it).

---

## 7. CORS allowlist (`resolveCorsOrigin`) and the Modal-origin 403 trap

**Entry points**

- **Correction to the workbook pointer:** `resolveCorsOrigin` is not defined in `packages/agent/src/api/server.ts`; grep shows it defined at `ELIZA/packages/agent/src/api/server-helpers-auth.ts:105-135` and only imported into `server.ts` at line 1393.
- Logic (`server-helpers-auth.ts:105-135`): allow-all when `ELIZA_CLOUD_PROVISIONED=1` (:112-114) or when the API is bound to a wildcard address (:116-119, token still required); otherwise the env allowlist is checked with an **exact string match**, `allow.includes(trimmed)` (:122-125); then loopback origins (`LOCAL_ORIGIN_RE`, :127), native app schemes (`APP_ORIGIN_RE`, :128), and opt-in `null`/`file://` (:129-133). Everything else returns `null`.
- Env keys: `resolveAllowedOrigins` in `ELIZA/packages/shared/src/runtime-env.ts:15-18` reads `ELIZA_ALLOWED_ORIGINS`, `CORS_ORIGINS` (comma-separated). `MILADY_ALLOWED_ORIGINS` reaches it through the branded alias sync `MILADY_* -> ELIZA_*` (`ELIZA/packages/shared/src/utils/env.ts:111`), executed on every request (`app-core/src/api/server.ts:1065-1066`). The worktree fork reads `MILADY_ALLOWED_ORIGINS` first-class (`WORKTREE/packages/shared/src/runtime-env.ts:15-19`).
- Enforcement, agent server: `applyCors` (`server-helpers-auth.ts:151-185`) called at `ELIZA/packages/agent/src/api/server.ts:1628`; a present-but-unallowed `Origin` gets `403 {"error":"Origin not allowed"}` (`server.ts:1629`) before auth even runs. A narrow browser-extension exemption exists only for `/api/browser-bridge/companions/` (`server-helpers-auth.ts:158-160`).
- Enforcement, app-core compat wrapper (second, outer gate): `ELIZA/packages/app-core/src/api/server.ts:1078-1105` -> `403 {"error":"cors_origin_denied"}`; origin check is `isAllowedOrigin` (`app-core/src/api/server-cors.ts:116-138`): configured loopback ports, Capacitor/native schemes, or the operator remote-origin set from `ELIZA_ALLOWED_ORIGINS` (`server-cors.ts:32-46`), which is **cached after first read** (`server-cors.ts:60-65`), so env changes need a process restart.

**The Modal-origin 403 trap.** The public Modal SPA origin (`https://<app>.modal.run`) must appear in `MILADY_ALLOWED_ORIGINS` / `ELIZA_ALLOWED_ORIGINS` as an exact origin string: scheme + host, no trailing slash, no path, no wildcard. Any mismatch (missing entry, `http` vs `https`, trailing `/`) makes both gates return 403 for every browser fetch from the SPA, which presents as the avatar SPA loading its HTML but all API/asset XHRs failing (this is exactly what commit `96b1cf3a3` "allowlist the Modal origin so Alice's avatar SPA assets load" fixed). Because the origin gate runs before auth, a valid Bearer token does not help.

**Smoke test.**
```
curl -is -H "Origin: https://evil.example" -H "Authorization: Bearer $TOK" $BASE/api/agents | head -3
# expect: 403 with {"error":"Origin not allowed"} or {"error":"cors_origin_denied"}
curl -is -H "Origin: https://<app>.modal.run" -H "Authorization: Bearer $TOK" $BASE/api/agents | head -5
# expect: 200 and Access-Control-Allow-Origin: https://<app>.modal.run echoed back
```

**Regression looks like:** the allowed-origin curl returning 403 (allowlist entry lost, alias sync broken, or exact-match string drift); the evil-origin curl returning 200 with a reflected ACAO header (gate accidentally opened); SPA loads but every fetch fails CORS in the browser console.

---

## Quick-check table

| # | Surface | Smoke command / action | Expected |
|---|---------|------------------------|----------|
| 1 | /companion render | Open `https://<host>/companion#token=$TOK` | Full-screen VRM stage, no wizard, no chrome, no AppProvider crash |
| 2 | Onboarding bypass | Reload `/companion` in a fresh browser profile with saved token | Coordinator logs `BACKEND_REACHED onboardingComplete: true`; no wizard |
| 3 | Hash token auth | Open `/#token=$TOK` | Token stripped from URL, `milady:self-hosted-api-token` in localStorage, API calls 200 |
| 4 | Query token refusal | Open `/?token=$TOK` | Stays unauthenticated; console: `Refusing insecure ?token=` |
| 5 | Emote relay | `curl -X POST $BASE/api/emote -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"emoteId":"wave"}'` | `{"ok":true,"broadcast":{"hasService":true,"sent":true,...}}` |
| 6 | Companion stage | `curl -H "Authorization: Bearer $TOK" $BASE/api/companion/stage` | `{"ok":true,"state":{...}}` (no 401/429) |
| 7 | Overlay + approvals | `curl -X POST ...$BASE/api/apps/overlay-presence -d '{"appName":"companion"}'`; `curl $BASE/api/computer-use/approvals` | `{"ok":true,"appName":"companion"}`; approval snapshot JSON |
| 8 | Go Live | Stream tab -> "Go Live" button (or `curl -X POST $BASE/api/stream/live`) | Button flips live + popout opens; API returns `{live:true}` |
| 9 | /health contract | `curl -i $BASE/health` during and after boot; `curl -i $BASE/health/live` | 503 `starting` until `[milady][startup] start-eliza:done`, then 200 `running`; `/health/live` always 200 |
| 10 | CORS allowlist | `curl -i -H "Origin: https://<app>.modal.run" $BASE/api/agents` vs `-H "Origin: https://evil.example"` | Modal origin: 200 + echoed ACAO; foreign origin: 403 |