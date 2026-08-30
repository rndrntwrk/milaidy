# Alice OpenAI Codex Authentication and Inference Architecture

**Date:** 2026-08-30  
**Status:** Approved design; implementation branch  
**Base:** `release/alice-production-core-2026-08-22` at `4b82f4f28ec704077da7fb416d163286bfe00a8d`  
**Implementation branch:** `feat/alice-openai-codex-auth-2026-08-30`

## 1. Purpose

This specification closes the production-critical uncertainty around Alice's OpenAI authentication, model routing, credential durability, refresh ownership, failure behavior, and release evidence.

The implementation must not leave any of these decisions to a deployment operator:

- how a headless Cloudflare-hosted Alice obtains a ChatGPT/Codex login;
- whether Codex App Server replaces Eliza as Alice's cognitive runtime;
- whether ordinary Alice chat uses Workers AI, an OpenAI API key, or the user's ChatGPT/Codex subscription;
- where OAuth credentials live;
- how refresh-token rotation survives Container replacement;
- which process owns the refresh chain;
- how autonomous coding shares the credential without creating a second refresher;
- what happens when authentication, rate limits, or OpenAI fail;
- what evidence proves the accepted conversation used the intended provider.

The canonical implementation is intentionally fail-closed. A release may be unavailable because OpenAI authentication is missing or unhealthy, but it may never silently answer through an unapproved model provider.

## 2. Canonical decision

### 2.1 Runtime ownership

- **Milady/Eliza remains Alice's cognitive runtime.**
- **Eliza's existing `openai-codex` provider is the ordinary text-inference path.**
- **Codex App Server is a temporary headless login helper only.**
- **Codex App Server never becomes Alice's chat loop, memory owner, planner, or tool arbiter.**
- **Workers AI is not an ordinary text-inference fallback.**
- **Autonomous coding obtains a short-lived execution environment from Eliza's existing coding-account bridge and central account pool.**

### 2.2 Canonical flow

```text
Owner device
  -> Cloudflare Access + Alice owner authorization
  -> Companion provider-control UI
  -> Alice production control route
  -> Alice runtime Container
  -> temporary pinned Codex App Server process
  -> ChatGPT device-code login
  -> App Server exits
  -> Eliza transactionally adopts auth.json
  -> Eliza account pool becomes sole refresh owner
  -> encrypted Eliza credential snapshot is durably committed
  -> ordinary Alice inference uses Eliza openai-codex
```

### 2.3 Rejected alternatives

1. **Workers AI as the ordinary text backend** is rejected because it does not use the approved ChatGPT/Codex subscription and introduces a separate model/billing path.
2. **Codex App Server as Alice's brain** is rejected because it creates a competing agent loop and changes Milady/Eliza semantics.
3. **Copying `auth.json` while Codex remains a refresher** is rejected because refresh-token rotation requires exclusive ownership.
4. **Persisting plaintext OAuth tokens in Worker variables, GitHub, build artifacts, D1 rows, logs, release manifests, or the browser** is rejected.
5. **Silent model fallback** is rejected. Provider failure must be explicit and typed.

## 3. Current-state findings at the implementation base

At `4b82f4f28ec704077da7fb416d163286bfe00a8d`:

- the Container has public internet disabled and only internal Alice virtual hosts are allowlisted;
- the Runtime Host injects an internal release token as `OPENAI_API_KEY` and points `OPENAI_BASE_URL` and `OPENAI_EMBEDDING_URL` at `alice-ai-gateway.internal`;
- the AI gateway resolves those requests through Cloudflare Workers AI;
- the state plane deliberately rejects secret-bearing fields in its generic record contract;
- the pinned Eliza submodule is `c23902bf3f43969736bb9a0f52c99f32239b8aab`;
- that Eliza pin already contains the `openai-codex` provider, encrypted per-account credential storage, account pooling, coding-account selection, and transactional Codex-login adoption;
- the parent repository pins `plugin-pi-ai`, but the current cloud image does not qualify it as the canonical ordinary text provider.

This implementation therefore integrates existing reviewed primitives rather than inventing a second OAuth or inference stack.

## 4. Trust boundaries

### 4.1 Browser and Companion

The browser may receive only:

- an opaque Alice login-attempt identifier;
- the official verification URL;
- the one-time device code;
- expiry and non-secret status metadata;
- typed provider-health state.

The browser must never receive:

- an OpenAI access token;
- an OpenAI refresh token;
- an OpenAI ID token;
- the raw ChatGPT account identifier;
- `auth.json`;
- the Eliza vault master key;
- encrypted credential-envelope bytes.

### 4.2 Production Control Worker

The control surface authorizes the owner and forwards a bounded control request. It does not parse, store, log, or return credentials.

Required admission for login, logout, or credential-destructive operations:

- valid Cloudflare Access identity;
- exact configured owner identity;
- required trusted-device posture;
- same-origin request;
- single-use CSRF token;
- no global pause that forbids the operation;
- no conflicting login/adoption operation in progress.

### 4.3 Runtime Container

Only the Runtime Container may:

- launch the temporary Codex App Server;
- read temporary `CODEX_HOME/auth.json`;
- invoke the pinned Eliza adoption primitive;
- decrypt Eliza account records for runtime use;
- refresh the credential;
- assemble encrypted durable snapshots.

### 4.4 State plane

The state plane stores opaque encrypted Eliza credential envelopes and bounded non-secret metadata. It must never decrypt or interpret OAuth tokens.

The existing generic state-record API remains no-secrets. Credential state receives a separate fixed-schema route and store contract so the generic invariant is not weakened.

## 5. OpenAI login ceremony

### 5.1 Pinned helper

The first implementation pins OpenAI Codex `0.151.0` and the exact x86_64 Linux musl App Server archive:

```text
codex-app-server-x86_64-unknown-linux-musl.tar.gz
sha256:9e1b76300774b916297c40ac100e4d9fae4392862265b99625b8d4a95c852a93
```

The archive is fetched only by a deterministic build script, verified before extraction, and represented in the release capability BOM. `latest` is forbidden.

The full Codex CLI is not required for the login ceremony. If autonomous coding later requires the standalone CLI in this same image, it must be separately pinned and admitted:

```text
codex-x86_64-unknown-linux-musl.tar.gz
sha256:605b4b183f22c645f5def63a5b7191767407fb66a6feaec4eaf10b5b7e0058f6
```

### 5.2 Start request

Owner-facing route:

```http
POST /control/providers/openai-codex/login/start
```

The production control plane forwards a private runtime request. The Runtime Container creates an unpredictable temporary directory:

```text
/tmp/alice-codex-login/<random-login-id>/
```

with mode `0700`, sets it as `CODEX_HOME`, and starts App Server through stdio. No network listener is exposed.

The runtime sends:

```json
{
  "method": "account/login/start",
  "id": 1,
  "params": { "type": "chatgptDeviceCode" }
}
```

A successful non-secret response is normalized to:

```json
{
  "schemaVersion": "alice.openai-login.v1",
  "loginId": "<opaque Alice login id>",
  "verificationUrl": "https://auth.openai.com/codex/device",
  "userCode": "<one-time code>",
  "expiresAtMs": 0,
  "status": "pending"
}
```

The product must explain the exact prerequisite when the OpenAI account or workspace has not enabled device-code authorization. Generic “OAuth failed” copy is not acceptable.

### 5.3 Completion ordering

The only safe order is:

1. App Server emits a successful login-completed event.
2. Runtime confirms the expected ChatGPT authentication mode.
3. App Server receives shutdown/EOF and exits.
4. Runtime confirms no helper process remains.
5. Runtime invokes Eliza's existing transactional Codex adoption with the temporary `codexHome`.
6. Adoption atomically retires the source `auth.json` and writes an encrypted Eliza account record.
7. Runtime durably commits the encrypted credential generation.
8. Runtime deletes the temporary `CODEX_HOME` and retired source file.
9. Runtime verifies the helper is absent, raw auth files are absent, the encrypted account exists, and the durable generation is readable.
10. Only then does the control route report success.

Any deviation fails closed and returns a typed status. In particular, the helper must not remain alive after adoption.

### 5.4 Cancellation and expiry

Owner-facing cancellation route:

```http
POST /control/providers/openai-codex/login/<loginId>/cancel
```

Cancellation must:

- terminate the exact helper process;
- remove temporary files;
- invalidate the in-memory attempt;
- prevent replay;
- never alter an already adopted account.

Attempts have a bounded lifetime and are not persisted across Container replacement. The owner simply restarts the ceremony; no token has been committed before successful adoption.

### 5.5 Concurrency

Only one OpenAI login/adoption mutation may be active for the owner environment. A runtime-local mutex plus a durable credential-generation compare-and-swap prevents concurrent adoption or stale overwrite.

## 6. Credential ownership and storage

### 6.1 Sole refresher invariant

After adoption, **Eliza's account pool is the only long-lived owner of the refresh chain**.

Forbidden states:

- a running Codex App Server plus an adopted Eliza account;
- a surviving `CODEX_HOME/auth.json` plus an adopted Eliza account;
- a coding subprocess retaining a global refresh token after task exit;
- two Container instances mutating the same credential generation without compare-and-swap.

### 6.2 Existing encryption

The pinned Eliza account store writes versioned AES-GCM envelopes under:

```text
<stateDir>/auth/<providerId>/<accountId>.json
```

with atomic writes and restrictive permissions. The durable system mirrors these encrypted bytes; it does not define a second token-encryption format.

### 6.3 Credential snapshot schema

```ts
interface AliceCredentialSnapshotV1 {
  schemaVersion: "alice.credential-snapshot.v1";
  ownerId: "alice-owner-production";
  providerId: "openai-codex";
  generation: number;
  files: Array<{
    relativePath: string;
    mode: 384 | 420; // 0600 or 0644
    size: number;
    sha256: `sha256:${string}`;
    bytesBase64: string;
  }>;
  snapshotSha256: `sha256:${string}`;
  createdAtMs: number;
  updatedAtMs: number;
}
```

Only the following paths are admitted:

```text
auth/openai-codex/<canonical-account-id>.json
auth/.credential-storage-generation
auth/_pool-metadata.json
```

Rules:

- no absolute paths;
- no `..` segment;
- no symlinks;
- no duplicate paths;
- canonical account IDs only;
- maximum 64 files;
- maximum 128 KiB decoded aggregate bytes;
- maximum 96 KiB per file;
- exact Base64 canonicalization;
- exact decoded size match;
- exact per-file SHA-256 match;
- exact aggregate canonical-manifest SHA-256 match;
- generation is a non-negative safe integer;
- provider and owner identifiers are fixed by environment policy, not caller-selected free text.

### 6.4 Dedicated state-plane contract

Private service routes:

```http
GET    /v1/credential-state/openai-codex
PUT    /v1/credential-state/openai-codex
DELETE /v1/credential-state/openai-codex
```

`GET` returns `404 credential_state_not_found` when no login has been adopted.

`PUT` body:

```json
{
  "expectedGeneration": 7,
  "snapshot": { "...": "AliceCredentialSnapshotV1" }
}
```

Creation uses `expectedGeneration: null` and requires `snapshot.generation === 0` or the policy-defined first generation. An update requires the stored generation to equal `expectedGeneration` and the incoming generation to be greater. A stale update returns `409 credential_generation_conflict` with only non-secret generation metadata.

`DELETE` requires an expected generation and owner/release-manager scope. It removes the durable snapshot only after local credential retirement has completed or as part of a transactional logout sequence.

### 6.5 Storage table

A dedicated SQL table is used rather than generic state records:

```sql
CREATE TABLE alice_credential_state (
  provider_id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  generation INTEGER NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
```

The `snapshot_json` contains encrypted envelope bytes only. No query, status route, release receipt, or log prints it.

An append-only non-secret event table records generation transitions and operation classes, never credential bytes.

### 6.6 Scope permissions

- `container-bootstrap`: `GET` only.
- `container-runtime`: `GET` and compare-and-swap `PUT`.
- `release-manager`: `GET`, controlled `DELETE`, and recovery operations.
- `owner-control`: provider status and logout orchestration through the production-control boundary; no direct byte access.
- `agent-bot`: no credential-state access.

## 7. Container boot and persistence

### 7.1 Boot hydration

The runtime is not ready until credential hydration has reached a terminal state:

1. Bootstrap authenticates to the state plane as `container-bootstrap`.
2. It requests the OpenAI credential snapshot.
3. `404` becomes explicit `auth-required`, not a crash.
4. A present snapshot is schema-, path-, size-, digest-, and generation-validated.
5. Files are written atomically beneath the exact Eliza state root.
6. Modes are applied.
7. Directory and file symlinks are rejected.
8. A second read verifies the on-disk bytes.
9. Eliza's account-storage policy is created only after hydration.
10. Provider initialization may proceed.

Readiness reports one of:

```text
openai-codex: ready
openai-codex: auth-required
openai-codex: rate-limited
openai-codex: needs-reauth
openai-codex: credential-state-conflict
openai-codex: unavailable
```

### 7.2 Refresh durability barrier

The dangerous sequence to prevent is:

```text
OpenAI rotates refresh token
-> inference succeeds
-> Container dies
-> only the old refresh token is durable
```

Before each OpenAI-authenticated operation, the runtime records the local credential generation and manifest digest. After the operation:

- if neither changed, normal completion continues;
- if credentials changed, the runtime assembles and validates a new encrypted snapshot;
- it compare-and-swap commits the next generation;
- it reads back and verifies the stored generation and digest;
- only then may the model response or coding result be acknowledged.

If durable commit fails after a provider-side rotation, the result is not reported as successful. The provider enters `credential-state-conflict` or `unavailable`, preventing another call from consuming an uncertain chain.

### 7.3 Multi-instance fencing

Credential mutation is fenced by generation. A stale Container may serve no OpenAI request after losing the compare-and-swap. It must stop its provider path, discard local credential state, and rehydrate from the durable winner.

## 8. Provider routing

### 8.1 Ordinary text

Canonical routing policy:

```text
service: llmText
backend: openai-codex
implementation: plugin-pi-ai
account: alice-primary
strategy: priority
model: one exact admitted model ID
fallback: none
```

The exact model ID is sourced from the pinned provider's supported inventory and enters the signed deployment policy. `latest`, unbounded model aliases, and automatic cross-provider fallback are forbidden.

### 8.2 Existing Workers AI gateway

The internal AI gateway may remain deployed for explicitly approved, separately metered capabilities, but it must not satisfy Alice's canonical ordinary text route.

Release acceptance must prove:

```text
provider = openai-codex
fallbackUsed = false
workersAiInvoked = false
```

### 8.3 Embeddings

The text route must not be made dependent on Workers AI embeddings. Before a separately qualified local or OpenAI embedding path exists, the runtime exposes semantic memory as explicitly degraded while preserving transcript, SQL memory, and ordinary conversation.

No hidden embedding fallback is allowed.

## 9. Network policy

The Container remains `enableInternet = false` and gains only the explicit public hosts required by the pinned OpenAI login and ChatGPT/Codex provider.

Initial allowlist:

```text
alice-state-plane.internal
alice-ai-gateway.internal
alice-connector-plane.internal
auth.openai.com
chatgpt.com
```

The final implementation must derive the exact provider host inventory from observed pinned-provider behavior and contract tests. Any additional host requires an explicit reviewed policy change and evidence; wildcard OpenAI or general internet access is forbidden.

Internal virtual hosts continue to use explicit service-binding handlers. Public OpenAI hosts use direct outbound transport allowed by the Container policy. Attempts to contact an unapproved host fail closed and record only non-secret host-policy diagnostics.

## 10. Autonomous coding

Autonomous coding does not read the durable snapshot directly and does not keep a global Codex login file.

Flow:

1. Approved coding intent reaches Eliza.
2. The central coding-account bridge selects `alice-primary`.
3. The runtime materializes the minimum subprocess environment for the isolated task.
4. The task executes in the approved sandbox/runtime.
5. The subprocess terminates and its environment is destroyed.
6. Any credential rotation is reconciled back into the Eliza-owned account store.
7. The refresh durability barrier commits the resulting encrypted generation before success is acknowledged.

This preserves one account pool and one refresh owner for both conversation and coding.

## 11. Provider-control API

Owner routes:

```http
GET    /control/providers/openai-codex/status
POST   /control/providers/openai-codex/login/start
GET    /control/providers/openai-codex/login/<loginId>
POST   /control/providers/openai-codex/login/<loginId>/cancel
POST   /control/providers/openai-codex/logout
POST   /control/providers/openai-codex/recover
```

All responses use fixed schemas and typed error codes. They include no raw OpenAI account identifier or credential material.

Representative error codes:

```text
ALICE_OPENAI_AUTH_REQUIRED
ALICE_OPENAI_DEVICE_CODE_DISABLED
ALICE_OPENAI_LOGIN_IN_PROGRESS
ALICE_OPENAI_LOGIN_EXPIRED
ALICE_OPENAI_LOGIN_CANCELLED
ALICE_OPENAI_ADOPTION_FAILED
ALICE_OPENAI_CONCURRENT_REFRESHER
ALICE_OPENAI_CREDENTIAL_DURABILITY_FAILED
ALICE_OPENAI_CREDENTIAL_GENERATION_CONFLICT
ALICE_OPENAI_RATE_LIMITED
ALICE_OPENAI_NEEDS_REAUTH
ALICE_OPENAI_PROVIDER_UNAVAILABLE
ALICE_OPENAI_MODEL_NOT_ADMITTED
```

## 12. Logout and recovery

### 12.1 Logout

Logout is an owner-authorized destructive transaction:

1. pause new OpenAI operations;
2. wait for or cancel bounded in-flight operations;
3. preflight local account deletion using Eliza account-storage primitives;
4. delete the durable snapshot with expected-generation CAS;
5. commit local deletion;
6. verify local and durable absence;
7. clear provider health and login-attempt state;
8. resume the non-OpenAI Companion surface in `auth-required` state.

A partial logout enters a recoverable typed state and does not silently resume OpenAI calls.

### 12.2 Recovery

Recovery compares:

- local generation/digest;
- durable generation/digest;
- provider account-health state;
- helper-process absence;
- raw-login-file absence.

The durable snapshot is authoritative after a successful CAS. A stale local state is discarded and rehydrated. A local-only newer state is never automatically uploaded unless its provenance proves it came from the current fenced runtime operation; otherwise the owner must reauthenticate.

## 13. Logging and evidence

### 13.1 Forbidden logging

No logs may include:

- access, refresh, or ID tokens;
- device codes after the response boundary;
- `auth.json` contents;
- encrypted envelope bytes;
- raw account IDs or emails;
- full OpenAI response bodies when they may contain credential data.

### 13.2 Provider receipt

Every accepted ordinary conversation emits a signed internal, non-secret receipt:

```json
{
  "schemaVersion": "alice.provider-receipt.v1",
  "provider": "openai-codex",
  "authMode": "chatgpt",
  "model": "<exact admitted model>",
  "accountIdSha256": "sha256:<digest>",
  "credentialGeneration": 0,
  "credentialSnapshotSha256": "sha256:<digest>",
  "workersAiInvoked": false,
  "fallbackUsed": false,
  "completedAtMs": 0
}
```

The receipt is evidence, not a source of credentials.

## 14. Release qualification

No production route promotion occurs until all gates pass on the exact candidate image through local/manual release tooling. GitHub Actions is not a dependency or acceptance authority.

Required gates:

1. exact source and submodule pin qualification;
2. pinned Codex App Server archive and digest qualification;
3. image build and package-resolution qualification;
4. credential-state schema, authorization, size, path, digest, and CAS tests;
5. device-code ceremony tests with a controlled App Server protocol fixture;
6. exclusive-adoption and concurrent-refresher tests;
7. Container hydration and replacement tests;
8. forced token-rotation durability-barrier tests;
9. ordinary `openai-codex` provider receipt test;
10. zero Workers AI invocation proof for ordinary text;
11. Companion rendering and reconnect tests;
12. rate-limit, auth-expiry, OpenAI-outage, state-plane-outage, and stale-Container tests;
13. pause, rollback, and forward-restore tests;
14. exact Cloudflare configuration readback;
15. signed terminal release evidence.

The release state machine is:

```text
SOURCE_QUALIFIED
-> IMAGE_QUALIFIED
-> CODEX_LOGIN_QUALIFIED
-> CREDENTIAL_DURABILITY_QUALIFIED
-> OPENAI_CODEX_INFERENCE_QUALIFIED
-> COMPANION_QUALIFIED
-> PAUSE_QUALIFIED
-> COLD_START_QUALIFIED
-> ROLLBACK_QUALIFIED
-> FORWARD_RESTORE_QUALIFIED
-> PRODUCTION_ROUTE_PROMOTED
```

A build, deployment, route existence, or health probe alone is not launch evidence.

## 15. Implementation boundaries

The implementation is split into independently reviewable commits but one coherent PR:

1. design and execution plan;
2. credential-state contract, store, migration, authorization, and tests;
3. Container snapshot validation, hydration, fencing, and durability barrier;
4. Codex App Server protocol client, device-code lifecycle, adoption, and tests;
5. `plugin-pi-ai`/`openai-codex` provider admission, no-fallback policy, and provider receipts;
6. owner control routes and Companion provider UI;
7. deterministic image tooling, exact binary pinning, capability BOM, deployment manifest, readback, and acceptance scripts;
8. end-to-end production-shaped verification and operator documentation.

No commit may weaken the existing generic state-plane no-secrets rule, enable broad Container internet access, add a second OAuth implementation, or make GitHub Actions a release dependency.
