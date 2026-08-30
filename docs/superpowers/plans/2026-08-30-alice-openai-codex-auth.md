# Alice OpenAI Codex Authentication Implementation Plan

> **Execution discipline:** Follow the Superpowers test-driven-development, systematic-debugging, verification-before-completion, and finishing-a-development-branch workflows. Work on `feat/alice-openai-codex-auth-2026-08-30`, based on `release/alice-production-core-2026-08-22` at `4b82f4f28ec704077da7fb416d163286bfe00a8d`. Do not use GitHub Actions as a release dependency. Do not deploy or promote production from this plan.

**Goal:** Make Alice's ordinary text inference use Eliza's existing `openai-codex` ChatGPT-subscription provider, provide a safe headless device-code login ceremony, transfer exclusive refresh ownership to Eliza, durably persist only encrypted credential envelopes across Cloudflare Container replacement, prevent Workers AI fallback, and generate production-grade provider evidence.

**Architecture:** A temporary pinned Codex App Server performs device-code login through stdio. After success it exits, and the pinned Eliza `adoptCodexCliLogin` primitive transactionally transfers the login into Eliza's encrypted account store. A dedicated state-plane credential contract stores opaque encrypted envelope files with strict path/digest/size validation and generation compare-and-swap. Container boot hydrates before Eliza account storage starts. Every credential rotation crosses a durable-commit barrier before inference or coding success is acknowledged. Ordinary text routing is fixed to `openai-codex` through the pinned `plugin-pi-ai`; Workers AI is not a fallback.

**Stack:** TypeScript, Bun tests, Cloudflare Workers/Containers, D1/Durable Object SQL, Milady/Eliza account storage, Codex App Server stdio JSON-RPC, existing local/manual release scripts under `deploy/` and `deploy/modal/`.

---

## Baseline and constraints

- Base commit: `4b82f4f28ec704077da7fb416d163286bfe00a8d`.
- Eliza submodule pin: `c23902bf3f43969736bb9a0f52c99f32239b8aab`.
- `plugin-pi-ai` parent submodule pin: `38cf80631de40522152054eb6a8d0d77d54ab259`; treat as an external reviewed dependency because its source is not readable through the current GitHub connector.
- Codex App Server pin: `0.151.0`, x86_64 Linux musl archive SHA-256 `9e1b76300774b916297c40ac100e4d9fae4392862265b99625b8d4a95c852a93`.
- Full Codex CLI, only if admitted for coding in this image: SHA-256 `605b4b183f22c645f5def63a5b7191767407fb66a6feaec4eaf10b5b7e0058f6`.
- Container internet remains deny-by-default.
- Generic state-plane records remain no-secrets.
- No token, device code, raw account identity, `auth.json`, encrypted credential blob, or vault key enters logs, release receipts, Git, build metadata, or browser persistence.
- No silent model-provider fallback.
- No GitHub Actions acceptance gate.

## Task 1: Add the credential-state contract and validation module

**Files:**

- Create: `workers/alice-state-plane/src/credential-state.ts`
- Create: `workers/alice-state-plane/test/credential-state.test.ts`

**Step 1: Write failing tests**

Cover:

- accepts a canonical `openai-codex` encrypted snapshot;
- rejects wrong schema, owner, or provider;
- rejects unsafe paths, duplicate paths, invalid account IDs, symlink-like/non-regular metadata, and disallowed files;
- rejects more than 64 files;
- rejects per-file and aggregate decoded-byte limits;
- rejects non-canonical Base64;
- rejects declared-size mismatch;
- rejects bad per-file SHA-256;
- rejects bad aggregate canonical-manifest SHA-256;
- rejects non-safe or negative generations;
- canonicalizes files by path before aggregate hashing;
- redacts validation failures so no byte payload appears in error messages.

Run:

```bash
bun test workers/alice-state-plane/test/credential-state.test.ts
```

Expected: FAIL because the module does not exist.

**Step 2: Implement minimum validation and canonical digesting**

Export fixed types/constants plus:

```ts
validateCredentialSnapshot(value, policy)
canonicalCredentialManifest(snapshot)
sha256CredentialBytes(bytes)
credentialStateError(code, message, context?)
```

Use Web Crypto `crypto.subtle.digest`; do not introduce a Node-only dependency in Worker code.

**Step 3: Re-run focused tests**

Expected: PASS.

**Step 4: Commit**

```bash
git add workers/alice-state-plane/src/credential-state.ts workers/alice-state-plane/test/credential-state.test.ts
git commit -m "feat(alice): validate opaque credential snapshots"
```

## Task 2: Add durable credential storage with generation compare-and-swap

**Files:**

- Modify: `workers/alice-state-plane/src/state-plane.ts`
- Modify: `workers/alice-state-plane/src/service.ts`
- Modify: `workers/alice-state-plane/test/service.test.ts`
- Create: `workers/alice-state-plane/migrations/0010_alice_credential_state.sql`
- Create: `workers/alice-state-plane/test/credential-state-store.test.ts`

**Step 1: Write failing store and service tests**

Store tests:

- missing snapshot returns `null`;
- first create requires `expectedGeneration: null` and valid first generation;
- stale create/update fails with typed generation conflict;
- updates must strictly advance generation;
- compare-and-swap is atomic;
- read returns the exact validated encrypted snapshot;
- delete requires expected generation and is atomic;
- event rows contain only provider, generation, operation, digest, timestamp;
- no credential bytes are ever written to the event table.

Service tests:

- unauthenticated access is `401`;
- wrong service scope is `403`;
- `container-bootstrap` may GET but not PUT/DELETE;
- `container-runtime` may GET and PUT but not DELETE;
- `release-manager` may GET and generation-fenced DELETE;
- `agent-bot` has no access;
- request body limit is enforced before JSON parsing;
- `404 credential_state_not_found` and `409 credential_generation_conflict` are stable schemas;
- error responses never echo snapshot bytes.

Run focused tests and observe red.

**Step 2: Extend `StateStore`**

Add:

```ts
getCredentialState(providerId)
putCredentialState({ expectedGeneration, snapshot })
deleteCredentialState({ providerId, expectedGeneration })
```

Implement in SQL with transactions/CAS. Keep it separate from generic records and `assertAllowedStatePayload`.

**Step 3: Add private routes**

```text
GET    /v1/credential-state/openai-codex
PUT    /v1/credential-state/openai-codex
DELETE /v1/credential-state/openai-codex
```

Fixed provider/owner policy only; never accept arbitrary provider IDs in a path parameter.

**Step 4: Add migration**

Create `alice_credential_state` and `alice_credential_events`, indexes, and uniqueness constraints.

**Step 5: Re-run tests and typecheck**

```bash
bun test workers/alice-state-plane/test/credential-state.test.ts \
  workers/alice-state-plane/test/credential-state-store.test.ts \
  workers/alice-state-plane/test/service.test.ts
bun run --cwd workers/alice-state-plane typecheck
```

**Step 6: Commit**

```bash
git commit -m "feat(alice): persist encrypted credential state with CAS"
```

## Task 3: Add a typed runtime credential-state client

**Files:**

- Create: `packages/agent/src/runtime/alice-credential-state-client.ts`
- Create: `packages/agent/src/runtime/alice-credential-state-client.test.ts`
- Modify: `packages/agent/src/runtime/index.ts` or the package's exact runtime export barrel

**Step 1: Write failing tests**

Cover:

- exact internal state-plane URL;
- required bearer token, scope, instance, and service-kind headers;
- GET not-found becomes `null` only for typed `credential_state_not_found`;
- all other non-2xx responses throw typed/redacted errors;
- PUT sends expected generation and validated snapshot;
- 409 exposes only expected/actual generation;
- DELETE is generation-fenced;
- timeout and abort behavior;
- no error includes snapshot bytes or authorization header.

**Step 2: Implement client**

Inject `fetch`, timeout, release token, instance ID, and scope to keep tests deterministic.

**Step 3: Run focused tests and package typecheck**

```bash
bun test packages/agent/src/runtime/alice-credential-state-client.test.ts
bun run --cwd packages/agent typecheck
```

**Step 4: Commit**

```bash
git commit -m "feat(alice): add credential-state runtime client"
```

## Task 4: Add encrypted snapshot assembly and safe hydration

**Files:**

- Create: `packages/agent/src/runtime/alice-auth-state-mirror.ts`
- Create: `packages/agent/src/runtime/alice-auth-state-mirror.test.ts`
- Modify the exact runtime boot module discovered in `packages/agent/src/runtime/` after confirming current initialization order.

**Step 1: Write failing filesystem tests**

Use isolated temporary directories and cover:

- only admitted relative paths are read;
- snapshot assembly includes encrypted envelopes and pool metadata only;
- symlinks, hard-link substitutions, non-regular files, traversal, and changed inodes are rejected;
- files are opened no-follow where supported;
- modes are normalized;
- aggregate digest matches state-plane validator;
- hydration writes atomically and fsyncs files/directories;
- hydration refuses an existing unexpected file or symlink;
- hydration removes partial temp files after failure;
- hydration round-trip reproduces exact encrypted bytes;
- no test touches the real user state directory or vault key.

**Step 2: Implement mirror**

Expose:

```ts
assembleEncryptedCredentialSnapshot(...)
hydrateEncryptedCredentialSnapshot(...)
readCredentialGeneration(...)
commitCredentialMutationBarrier(...)
```

The mirror never decrypts credential envelopes.

**Step 3: Add boot gate**

Before Eliza account-storage initialization:

```text
GET durable snapshot
-> validate
-> hydrate or mark auth-required
-> construct account-storage policy
-> allow runtime start
```

Readiness remains live in `auth-required` state; OpenAI provider readiness does not.

**Step 4: Run focused tests and commit**

```bash
git commit -m "feat(alice): hydrate and mirror encrypted auth state"
```

## Task 5: Add the refresh durability barrier and stale-instance fencing

**Files:**

- Modify: `packages/agent/src/runtime/alice-auth-state-mirror.ts`
- Modify: `packages/agent/src/runtime/alice-auth-state-mirror.test.ts`
- Modify the exact ordinary-inference and coding completion boundaries after tracing current source.

**Step 1: Write failing tests**

Cover:

- unchanged credential generation requires no durable write;
- rotated credential forces CAS PUT and readback before success returns;
- failed CAS rejects the inference/coding result;
- readback digest mismatch rejects success;
- stale instance disables provider traffic and rehydrates;
- concurrent operations serialize credential mutation;
- provider-side success followed by durable failure is never reported as success.

**Step 2: Implement barrier**

Wrap authenticated OpenAI operations:

```ts
withCredentialDurabilityBarrier(async () => providerCall())
```

The wrapper records the pre-call snapshot identity, executes, detects local mutation, commits next generation, verifies readback, then returns.

**Step 3: Integrate both boundaries**

- ordinary `openai-codex` text inference;
- autonomous coding completion/account-rotation reconciliation.

**Step 4: Run focused tests and commit**

```bash
git commit -m "feat(alice): fence OpenAI credential rotation durably"
```

## Task 6: Add the Codex App Server stdio protocol client

**Files:**

- Create: `packages/agent/src/runtime/alice-codex-app-server.ts`
- Create: `packages/agent/src/runtime/alice-codex-app-server.test.ts`

**Step 1: Write failing protocol tests**

Use a fake child process with explicit stdout/stderr streams. Cover:

- initialization/initialized handshake;
- monotonically increasing JSON-RPC request IDs;
- `account/login/start` with `chatgptDeviceCode` only;
- normalization of login ID, verification URL, user code, and expiry;
- successful `account/login/completed` and `account/updated` handling;
- typed device-code-disabled detection;
- malformed JSON, unknown response ID, duplicate completion, process exit, timeout, and cancellation;
- bounded stdout line and stderr sizes;
- no stderr/raw payload leakage into thrown errors;
- graceful shutdown followed by forced kill deadline;
- exact helper-process ownership and cleanup.

**Step 2: Implement minimum client**

No network listener. Stdio only. Inject spawn/clock/timers for deterministic tests.

**Step 3: Run focused tests and commit**

```bash
git commit -m "feat(alice): add pinned Codex App Server protocol client"
```

## Task 7: Add the login/adoption lifecycle service

**Files:**

- Create: `packages/agent/src/runtime/alice-codex-login-service.ts`
- Create: `packages/agent/src/runtime/alice-codex-login-service.test.ts`
- Modify the exact agent API route registry after source tracing.

**Step 1: Write failing lifecycle tests**

Cover:

- only one active login mutation;
- temporary directory mode and unpredictable ID;
- non-secret start response;
- status polling and cancellation;
- successful completion stops helper before adoption;
- adoption calls the pinned Eliza primitive with exact `codexHome` and account ID `alice-primary`;
- helper reappearance/concurrent refresher is typed failure;
- first durable snapshot commit completes before success response;
- temporary and retired files are deleted after success;
- cleanup occurs after every failure path;
- restart loses pending attempts safely but preserves adopted credentials;
- login response and errors never contain tokens or raw auth file content.

**Step 2: Implement lifecycle service**

Use dependency injection around App Server, adoption, filesystem, and credential-state client. Do not duplicate Eliza OAuth parsing or refresh logic.

**Step 3: Add private runtime routes**

```text
GET    /internal/providers/openai-codex/status
POST   /internal/providers/openai-codex/login/start
GET    /internal/providers/openai-codex/login/:id
POST   /internal/providers/openai-codex/login/:id/cancel
POST   /internal/providers/openai-codex/logout
POST   /internal/providers/openai-codex/recover
```

Authenticate with the existing runtime deployment/control secret boundary.

**Step 4: Run focused tests and commit**

```bash
git commit -m "feat(alice): own Codex login and exclusive adoption"
```

## Task 8: Add owner control routes and authorization

**Files:**

- Create: `workers/alice-production-control/src/openai-codex-control.ts`
- Create: `workers/alice-production-control/test/openai-codex-control.test.ts`
- Modify: `workers/alice-production-control/src/index.ts`
- Modify: `workers/alice-production-control/src/env.ts`
- Modify: `workers/alice-production-control/src/policy.ts`
- Modify: `workers/alice-production-control/src/runtime-config.ts`

**Step 1: Write failing boundary tests**

Cover:

- valid Access identity + exact owner + trusted device + same origin + CSRF succeeds;
- every missing/wrong control fails before runtime fetch;
- login replay and conflicting mutation fail;
- status route exposes only allowed fields;
- device-code response is no-store and never persisted in durable control state;
- logout/recovery require elevated owner authorization;
- global pause semantics are explicit;
- upstream errors are translated to stable typed schemas without raw bodies.

**Step 2: Implement a narrow control client**

Keep route logic outside the already large `index.ts`; mount one dispatcher from `index.ts`.

**Step 3: Run package tests/typecheck and commit**

```bash
git commit -m "feat(alice): expose owner-only Codex provider controls"
```

## Task 9: Admit OpenAI egress without broad internet

**Files:**

- Modify: `workers/alice-access-gateway/src/alice-runtime-container.ts`
- Modify: `workers/alice-access-gateway/test/alice-runtime-container.test.ts`
- Modify existing outbound-policy/readback tests discovered in the package.

**Step 1: Write failing policy tests**

Require the exact host set and prove unknown public hosts are rejected. Do not use wildcard domains.

Initial public candidates:

```text
auth.openai.com
chatgpt.com
```

Run an instrumented protocol/provider qualification against the pinned binaries to discover any additional host before admitting it. A host is added only with an exact test and design-spec amendment.

**Step 2: Modify allowlist**

Preserve `enableInternet = false` and existing internal virtual-host handlers.

**Step 3: Verify and commit**

```bash
git commit -m "feat(alice): admit exact OpenAI runtime egress"
```

## Task 10: Pin and qualify Codex App Server in the image

**Files:**

- Create: `deploy/install-codex-app-server.mjs`
- Create: `deploy/verify-codex-app-server.mjs`
- Create: `deploy/codex-app-server.lock.json`
- Modify: `deploy/Dockerfile.ci`
- Modify: `deploy/modal/alice_capability_bom.mjs`
- Modify: `deploy/modal/verify_alice_capability_bom.mjs`
- Modify existing local/manual image qualification scripts under `deploy/` and `deploy/modal/`.
- Do **not** make `.github/workflows/*` a required path.

**Step 1: Write failing script tests/fixtures**

Cover exact version, URL host/path, archive name, SHA-256, extraction target, executable mode, version output, app-server startup/handshake, and refusal of redirects or mismatched content.

**Step 2: Implement deterministic installer**

- HTTPS only;
- official OpenAI GitHub release asset only;
- bounded download;
- no `latest` resolution at build time;
- verify SHA-256 before extraction;
- extract one expected executable;
- verify no traversal/archive extras;
- record lock digest in capability BOM.

**Step 3: Materialize `plugin-pi-ai`**

Build and copy the exact pinned submodule package into the image. Assert the expected package export and runtime provider registration resolve. Do not edit the unreadable external submodule by guesswork.

**Step 4: Verify image contents manually**

Use the repository's local image build/qualification scripts. Record commands and output in PR evidence.

**Step 5: Commit**

```bash
git commit -m "build(alice): pin Codex App Server and pi-ai provider"
```

## Task 11: Remove Workers AI from canonical text routing

**Files:**

- Modify: `workers/alice-access-gateway/src/alice-runtime-host.ts`
- Modify: `workers/alice-access-gateway/test/alice-runtime-host.test.ts`
- Modify: `workers/alice-effective-config.js`
- Modify: `workers/alice-effective-config.d.ts`
- Modify exact Milady/Eliza runtime configuration source discovered during tracing.
- Modify: `workers/alice-production-control/src/runtime-config.ts`
- Modify relevant tests.

**Step 1: Write failing routing tests**

Require:

```text
llmText.backend = openai-codex
llmText.plugin = plugin-pi-ai
llmText.accountId = alice-primary
llmText.fallback = none
OPENAI_BASE_URL is not alice-ai-gateway.internal for ordinary text
Workers AI invocation counter remains zero
```

Also require explicit semantic-memory degraded state if no admitted embedding provider exists.

**Step 2: Implement provider policy**

Do not inject an internal release token as the OpenAI ChatGPT credential. Keep the AI gateway available only for explicitly admitted non-canonical capabilities.

**Step 3: Add provider receipt**

Create a signed non-secret receipt with provider, auth mode, exact model, hashed account ID, credential generation/digest, and no-fallback/zero-Workers-AI assertions.

**Step 4: Run focused tests and commit**

```bash
git commit -m "feat(alice): make Codex the fail-closed text provider"
```

## Task 12: Add Companion provider-control UI

**Files:**

- Trace the current Companion settings/provider surface under `apps/app` and exact API client modules before editing.
- Create focused provider-status/login components and tests rather than placing large logic in a root view.

**Step 1: Write failing UI tests**

Cover:

- `auth-required`, pending login, connected, rate-limited, needs-reauth, conflict, and unavailable states;
- device-code prerequisite copy;
- verification URL/code display without local persistence;
- polling/cancel/logout/recover flows;
- no token/account ID fields;
- responsive and keyboard-accessible behavior;
- Companion remains usable when provider is unavailable.

**Step 2: Implement UI and API client**

Use `Cache-Control: no-store`; clear one-time code on completion/cancel/navigation.

**Step 3: Run web tests/build and commit**

```bash
git commit -m "feat(alice): add secure ChatGPT connection UI"
```

## Task 13: Extend deployment manifest, readback, and terminal evidence

**Files:**

- Modify: `deploy/modal/alice_deployment_manifest.mjs`
- Modify: `deploy/modal/alice_cloudflare_config.mjs`
- Modify: `deploy/modal/alice_cloudflare_provider_readback.mjs`
- Modify existing release-admission and evidence modules/tests.
- Create: `deploy/modal/verify_alice_openai_codex_release.mjs`

**Step 1: Write failing manifest/readback tests**

Require:

- Codex version and archive digest;
- `plugin-pi-ai` commit/digest/export;
- Eliza pin;
- exact model ID;
- no-fallback policy;
- Container OpenAI egress-policy digest;
- credential schema version and state-plane migration;
- provider receipt schema;
- durable generation/readback evidence;
- zero Workers AI ordinary-text invocation.

**Step 2: Implement local/manual release gate**

The verifier consumes candidate evidence and refuses production route promotion until every gate is present and bound to the exact image digest/source SHA. It must not depend on GitHub Actions.

**Step 3: Commit**

```bash
git commit -m "feat(alice): bind Codex auth to terminal release evidence"
```

## Task 14: Production-shaped verification

**Files:**

- Create or extend integration tests under the touched packages and local deployment tooling.
- Update operator documentation with exact commands and recovery procedures.

**Required scenarios:**

1. device-code login success;
2. device-code disabled;
3. wrong owner/device/origin/CSRF;
4. login cancel/expiry/replay;
5. helper stopped before adoption;
6. no raw auth source after adoption;
7. Container replacement without re-login;
8. forced refresh rotation followed by Container kill and successful rehydrate;
9. stale generation conflict and fencing;
10. ordinary conversation receipt proves `openai-codex` and zero fallback;
11. Workers AI remains unused for ordinary text;
12. OpenAI rate limit, needs-reauth, provider outage, and state-plane outage;
13. autonomous coding uses the central pool and cleans subprocess credentials;
14. Companion remains live through provider failures;
15. pause, rollback, forward restore;
16. logout and recovery from every interruption point.

Run all focused tests, touched-package typechecks, local image build, image smoke, Cloudflare dry-run/config readback, and repository-local release verifier. Capture exact command output.

Do not claim production readiness if any live OpenAI/Cloudflare acceptance test cannot run in the current environment. Record it as a blocked external qualification, not as delegated implementation work.

## Task 15: Review and PR

1. Rebase/compare against the latest protected release head; resolve intentionally.
2. Run `verification-before-completion` from a clean checkout.
3. Run a focused security review for credential leakage, refresh ownership, path safety, generation fencing, and fail-open routing.
4. Run a separate architecture review against the approved spec.
5. Open one draft PR only after code-level tests and static verification pass.
6. Include exact passed commands, unavailable external qualifications, migration/rollback notes, and no-production-mutation statement.
7. Do not merge or deploy without explicit owner authorization.
