# Alice Managed-App Deployment Runbook (2026-02-28)

## Objective
Preserve the exact deployment technique used to fix managed-app chunk/MIME failures and keep future rollouts repeatable under production constraints.

This runbook documents:

1. What broke.
2. What was fixed in code.
3. How to deploy safely.
4. How to validate the rollout.
5. How to recover clients still showing stale `Unexpected token '<'`, MIME, or chunk errors.

## Incident Signature
Primary client-side symptoms observed:

1. `Failed to load module script ... MIME type of "text/html"`
2. `Uncaught SyntaxError: Unexpected token '<'`
3. `ChunkLoadError: Loading chunk ... failed`
4. `sw.js` unsupported MIME (`text/html`)
5. Intermittent `502` from `GET /api/apps/hyperscape/embedded-agents`

These symptoms appeared on `https://alice.rndrntwrk.com` while loading embedded managed apps (notably Hyperscape) and Next.js chunk assets.

## Root Cause Classes
### A) Managed-app proxy path rewriting gaps (fixed)
Root-relative asset paths and webpack public paths were not consistently rewritten for proxied managed apps. Some asset/script requests resolved to HTML fallback responses, which the browser attempted to parse as JS.

### B) Service worker registration in proxied embed context (fixed)
`registerSW.js` execution in the proxied context caused service worker script/MIME failures and stale-cache behavior.

### C) Hyperscape provisioning fragility (fixed)
Wallet-auth path was brittle when upstream responses were partial or temporarily unavailable.

### D) Upstream Hyperscape API instability (not fixed locally)
`/api/embedded-agents` upstream endpoint produced `502` independently of Alice runtime correctness.

### E) Hyperscape audio origin mismatch (fixed)
`/audio/...` requests from the proxied Hyperscape client were routed to the app origin instead of the Hyperscape asset CDN, returning HTML fallback pages that broke audio decoding.

### F) Leaked root asset requests from managed iframes (fixed)
Some managed apps leaked chunk/script requests to root paths like `/_next/static/chunks/...` and `/script.js` instead of staying under `/api/apps/local/<app>/...`. Root paths returned HTML shell content, causing `Unexpected token '<'`.

## Code Fixes (Source of Truth)
Applied in commit `1ad9fe32` on branch `alice` in `milaidy`.

### 1) Proxy rewrite hardening
File: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/api/server.ts`

Key changes:

1. Added `rewriteRootRelativeAssetPaths(...)`.
2. Applied root-relative rewrite pass in `rewriteManagedAppProxyHtml(...)`.
3. Applied rewrite pass in `rewriteManagedAppProxyJavaScript(...)`.
4. Disabled proxied `registerSW.js` response body.
5. Rewrote webpack public path assignments (`.p`) to proxied `_next` path.
6. Rewrote root-relative `/sw.js` and `/manifest.webmanifest` references to proxied equivalents.

### 2) Hyperscape auto-provision fallback and retries
File: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/services/app-manager.ts`

Key changes:

1. Added wallet-auth retry + timeout + backoff constants.
2. Accepted partial credentials and broader response shapes.
3. Added fallback to `/api/embedded-agents` when wallet-auth fails.
4. Continued launch with warning if credentials were still incomplete.

### 3) Regression tests
File: `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/api/server.managed-app-proxy-rewrite.test.ts`

Covers:

1. Next public path rewrite.
2. Root-relative HTML rewrite.
3. `registerSW.js` disable behavior.
4. `/sw.js` and `/manifest.webmanifest` rewrite behavior.

Additional coverage:

- `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/api/server.hyperscape-asset-origin.test.ts`
  - verifies Hyperscape `/audio/...` requests route to `https://assets.hyperscape.club`
- `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy/src/api/server.managed-app-leaked-asset-redirect.test.ts`
  - verifies leaked root asset requests are redirected back to the correct managed-app proxy base

## Deployment Technique (Canonical)
This is the exact deployment flow that worked reliably after failures in lock handling, transient build downloads, and missing GHCR env wiring.

### Preconditions
Run on the deploy host as the deploy user (not root) when possible:

1. Repository: `/home/deploy/555-bot`
2. Script: `/home/deploy/555-bot/scripts/deploy-alice-k8s-manual.sh`
3. K8s context: `production` namespace, deployment `alice-bot`
4. Runtime branch: `alice`
5. CLI tools available: `git`, `docker`, `kubectl`, `jq`, `flock`

### Why deploy user matters
Using `root` caused avoidable friction:

1. lock file ownership collisions (`/tmp/alice-k8s-deploy.lock`)
2. git authentication mismatch

Deploying as the normal deploy user avoided those issues.

## Canonical Command Sequence
### 1) Clean preflight
```bash
cd /home/deploy/555-bot
git status --porcelain=v1
```
Expect no tracked modifications.

### 2) (If needed) load GHCR credentials from cluster secret
Use this when push fails with missing `GHCR_USERNAME` / `GHCR_TOKEN`.

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
DOCKERCFG_JSON="$(kubectl -n production get secret ghcr-secret -o jsonpath='{.data.\.dockerconfigjson}' | base64 -d)"
export GHCR_USERNAME="$(printf '%s' "$DOCKERCFG_JSON" | jq -r '.auths["ghcr.io"].username')"
export GHCR_TOKEN="$(printf '%s' "$DOCKERCFG_JSON" | jq -r '.auths["ghcr.io"].password')"
unset DOCKERCFG_JSON
```
Do not print these env vars.

### 3) Full deploy (build + push + rollout + runtime gate)
```bash
cd /home/deploy/555-bot
./scripts/deploy-alice-k8s-manual.sh
```

### 4) Fast retry when image already built
If build completed previously and only push/deploy failed, skip rebuild:

```bash
cd /home/deploy/555-bot
BUILD_IMAGE=false ./scripts/deploy-alice-k8s-manual.sh
```

## Script Behavior Summary
`deploy-alice-k8s-manual.sh` performs:

1. lock acquisition (`/tmp/alice-k8s-deploy.lock`)
2. tracked-tree cleanliness check
3. `origin/alice` sync for 555-bot repo
4. fresh `milaidy` runtime clone on matching branch
5. deterministic image tag generation (`sha-<bot>-milaidy-<runtime>`)
6. Docker build (unless disabled)
7. GHCR login + push (unless disabled)
8. `kubectl apply -k k8s/overlays/hetzner`
9. deployment image set + rollout wait
10. runtime validation gate: `scripts/ci/validate-alice-runtime.sh`

## Runtime Validation Gate (What must pass)
Validation script: `/home/deploy/555-bot/scripts/ci/validate-alice-runtime.sh`

Key checks:

1. deployment rollout + availability
2. pod health endpoint
3. auth status endpoint semantics
4. plugin load report integrity
5. plugin failure budget enforcement
6. full-duty integration env sanity checks

A successful run ends with:

```text
[alice-runtime-validate] PASS
```

## Post-Deploy Smoke Tests (Managed App + Assets)
Run from pod to avoid external access layers while validating Alice runtime behavior directly.

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
POD="$(kubectl -n production get pod -l app=alice-bot -o jsonpath='{.items[0].metadata.name}')"
TOKEN="$(kubectl -n production exec "$POD" -- sh -lc 'printenv MILAIDY_API_TOKEN')"

kubectl -n production exec "$POD" -- sh -lc "curl -sS -D - -H 'x-api-key: $TOKEN' 'http://127.0.0.1:3000/api/apps/local/%40elizaos%2Fapp-hyperscape/assets/index-DibRI8_E.js' -o /tmp/app.js && head -c 80 /tmp/app.js"
kubectl -n production exec "$POD" -- sh -lc "curl -sS -D - -H 'x-api-key: $TOKEN' 'http://127.0.0.1:3000/api/apps/local/%40elizaos%2Fapp-hyperscape/web/physx-js-webidl.js?v=1.0.0' -o /tmp/physx.js && head -c 80 /tmp/physx.js"
kubectl -n production exec "$POD" -- sh -lc "curl -sS -D - -H 'x-api-key: $TOKEN' 'http://127.0.0.1:3000/api/apps/local/%40elizaos%2Fapp-hyperscape/web/physx-js-webidl.wasm?v=1.0.0' -o /tmp/physx.wasm && wc -c /tmp/physx.wasm"
kubectl -n production exec "$POD" -- sh -lc "curl -sS -D - -H 'x-api-key: $TOKEN' 'http://127.0.0.1:3000/api/apps/local/%40elizaos%2Fapp-hyperscape/audio/music/twilight_fields.mp3' -o /tmp/track.mp3 && file -b /tmp/track.mp3"
kubectl -n production exec "$POD" -- sh -lc "curl -sS -D - -o /dev/null -H 'x-api-key: $TOKEN' -e 'https://alice.rndrntwrk.com/api/apps/local/%40elizaos%2Fapp-babylon/' 'http://127.0.0.1:3000/_next/static/chunks/32767-b6a167b4f967188b.js?dpl=dpl_EW7XwVJQzt4thDwES2NA5p4oras9' | grep -i '^location:'"

unset TOKEN
```

Expected:

1. JS endpoints return JavaScript payload, not HTML.
2. WASM endpoint returns non-trivial binary byte count.
3. Audio endpoint returns binary media (not `<!doctype` HTML fallback).
4. Root leaked chunk probes return `Location: /api/apps/local/.../_next/...` redirect.
5. No `<!doctype` in response body snippets.

## Browser Recovery Checklist (Required After Asset/Service-Worker Incidents)
Even after a correct deploy, clients can keep stale chunks/service-worker state.

Perform in this order on the affected browser profile:

1. Open DevTools.
2. Application → Service Workers:
   - Unregister all workers for `alice.rndrntwrk.com`.
3. Application → Storage:
   - Clear site data (IndexedDB, Cache Storage, Local Storage).
4. Network tab:
   - Enable `Disable cache`.
5. Hard reload:
   - `Cmd+Shift+R` (macOS) / `Ctrl+Shift+R` (Windows/Linux).
6. Re-open page with no old tab reuse.

If still broken, test in a brand-new incognito window. If incognito works, the issue is local browser state, not runtime.

## Troubleshooting Matrix
### Symptom: `Unexpected token '<'` on JS chunk
Likely cause: HTML response served for JS request (stale SW, stale HTML fallback, wrong asset path).

Actions:

1. Verify chunk URL in Network panel returns JS `content-type`.
2. If chunk URL is root (`/_next/...`) while inside a managed iframe, validate leaked-root redirect behavior.
3. Run browser recovery checklist.
4. Validate proxy rewrites are present in currently deployed image.

### Symptom: `sw.js` unsupported MIME type
Likely cause: worker script path resolving to HTML fallback or stale SW registration.

Actions:

1. Confirm proxied `registerSW.js` is disabled.
2. Clear service worker and caches.

### Symptom: `GET /api/apps/hyperscape/embedded-agents` returns `502`
Likely cause: upstream Hyperscape backend outage/degradation.

Actions:

1. Verify direct upstream response from Alice pod.
2. If direct upstream is also `502`, escalate to Hyperscape team.

### Symptom: `EncodingError: Unable to decode audio data`
Likely cause: a music/audio request resolved to HTML fallback instead of binary media.

Actions:

1. Open the failed audio request in Network and confirm `content-type` is audio, not `text/html`.
2. Validate Alice includes the audio-origin patch (Hyperscape `/audio/...` routed to `https://assets.hyperscape.club`).
3. Re-test with cache disabled and fresh reload.

### Symptom: WebSocket close `1006` with repeated reconnect attempts
Likely cause: upstream Hyperscape runtime unavailable/degraded (commonly with Railway `502` during edge forwarding).

Actions:

1. Check upstream health directly:
   - `curl -sS -o /dev/null -w "%{http_code}\n" https://hyperscape-production.up.railway.app/health`
   - `curl -sS -o /dev/null -w "%{http_code}\n" https://hyperscape-production.up.railway.app/api/embedded-agents`
2. If either endpoint returns `502`, treat as upstream incident and escalate.
3. Do not treat this condition as an Alice deploy rollback trigger unless Alice health/runtime validation also fails.

### Symptom: deploy fails during build on external dependency fetch (e.g. transient 503)
Likely cause: upstream package/CDN transient failure.

Actions:

1. Re-run deploy.
2. If image built already, reuse with `BUILD_IMAGE=false`.

### Symptom: push fails due missing GHCR credentials
Likely cause: env not exported in shell.

Actions:

1. Export `GHCR_USERNAME` and `GHCR_TOKEN` from `ghcr-secret`.
2. Re-run with `BUILD_IMAGE=false` if image exists locally.

## Rollback Procedure
If post-deploy checks fail and quick correction is not available:

1. Identify previous known-good image from rollout history.
2. Set deployment image back:
```bash
kubectl -n production set image deployment/alice-bot alice-bot=<previous-image-ref>
kubectl -n production rollout status deployment/alice-bot --timeout=600s
```
3. Re-run runtime validation gate.

## Operational Guardrails
1. Never deploy from a dirty tracked working tree.
2. Keep `RUN_RUNTIME_VALIDATION=true` unless actively debugging a known false negative.
3. Do not skip rollout status checks.
4. Treat upstream `502` as integration dependency incidents, not local deploy failures.
5. After any asset-path or service-worker fix, include explicit browser-state reset in incident closure steps.

## Change Log
- **2026-02-28**: Initial runbook created after managed-app proxy rewrite + Hyperscape auth fallback deployment and production verification.
- **2026-02-28 (follow-up)**: Added audio-origin routing guidance and explicit handling for WebSocket `1006` during upstream `502` incidents.
- **2026-02-28 (follow-up #2)**: Added leaked-root asset redirect strategy for managed iframes (`/_next/...`, `/script.js`) and validation probes.
