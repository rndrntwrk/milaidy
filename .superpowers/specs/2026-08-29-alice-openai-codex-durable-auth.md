# Alice OpenAI Codex Durable Authentication Design

**Status:** Approved for implementation
**Parent base:** `rndrntwrk/milaidy@4b82f4f28ec704077da7fb416d163286bfe00a8d`
**Eliza base:** `rndrntwrk/eliza@c23902bf3f43969736bb9a0f52c99f32239b8aab`
**Feature branches:**

- `rndrntwrk/milaidy:codex/alice-openai-codex-durable-auth-2026-08-29`
- `rndrntwrk/eliza:codex/alice-credential-durability-2026-08-29`

## 1. Problem

Alice's current Cloudflare Container architecture removed Modal from the synchronous conversation path, but the Container still receives an internal release token as `OPENAI_API_KEY` and sends text and embedding traffic to `alice-ai-gateway.internal`, which executes Cloudflare Workers AI. The owner-facing account APIs for ChatGPT/Codex are not admitted through the Access gateway. Eliza's encrypted account files live on ephemeral Container storage, and a Codex subprocess may rotate credentials in a per-account `CODEX_HOME` before those credentials are reconciled to the encrypted canonical account.

A production release therefore lacks four load-bearing properties:

1. ordinary Alice text inference is not served by the owner's ChatGPT/Codex account;
2. the owner cannot complete the existing headless device-login flow through the production Companion;
3. encrypted OAuth state does not survive Container replacement;
4. a successful turn can be returned before a rotated refresh credential is durably committed.

## 2. Canonical decision

Alice ordinary text inference uses Eliza's existing `openai-codex` account provider through `@elizaos/plugin-cli-inference` with the `codex-sdk` backend.

The existing Eliza OAuth API remains the single login controller. Remote login uses the existing bounded `codex login --device-auth` flow in an isolated temporary `CODEX_HOME`. No second OAuth implementation and no Codex App Server are introduced.

Eliza's encrypted account record is the canonical credential. Per-turn Codex homes are disposable execution material and are never independently durable.

Cloudflare stores only the encrypted account envelopes and non-secret metadata required to reconstruct the auth root. There is no Workers AI fallback.

## 3. Goals

- Expose the existing account list, OAuth start/status/cancel, test, usage, patch and delete APIs only through the authenticated owner Access boundary.
- Preinstall an exact Codex CLI and exact CLI-inference package in the immutable runtime image; prohibit production runtime package installation.
- Hydrate encrypted account state before account-pool initialization and before the runtime can report readiness.
- Commit every canonical credential mutation to durable storage before the operation succeeds.
- Reconcile any Codex-SDK credential rotation into the encrypted canonical account, commit it durably, and only then release the model response.
- Make `openai-codex` the only ordinary text provider in the production profile.
- Return typed authentication, rate-limit and provider-unavailable failures without removing the Companion shell or transcript.
- Produce provider receipts proving the selected provider/model/account hash/credential generation and proving that Workers AI was not invoked.

## 4. Non-goals

- Replacing Eliza's runtime or personality loop with Codex App Server.
- Persisting raw `auth.json` or a plaintext OAuth token in Cloudflare storage.
- Enabling autonomous shell, repository or trading actions for ordinary conversation.
- Making embeddings a prerequisite for first conversational availability.
- Mutating production providers, credentials, routes or protected release branches during feature development.

## 5. Runtime architecture

```text
Owner browser
  -> Cloudflare Access
  -> alice-access-gateway
       -> Cloudflare Container / Milady UI and Eliza API
            -> /api/accounts/... existing OAuth and account APIs
            -> @elizaos/plugin-cli-inference (codex-sdk)
                 -> account-pool selects openai-codex account
                 -> disposable per-account CODEX_HOME
                 -> OpenAI Codex service
                 -> rotated credentials reconciled
                 -> encrypted account snapshot durably committed
                 -> response released
       -> alice-state-plane internal service
            -> encrypted auth snapshot storage
```

Workers AI remains a separately deployable service but is not admitted as an ordinary Alice text fallback.

## 6. Authentication lifecycle

### 6.1 Start

The owner calls the existing `POST /api/accounts/openai-codex/oauth/start` through Cloudflare Access. The Access gateway admits only the exact account route family and relies on the existing owner identity, origin and request-size controls.

Remote requests force headless device authentication. Eliza creates a bounded in-memory flow and spawns the pinned Codex CLI with:

```text
CODEX_HOME=<isolated temporary directory>
codex login --device-auth
```

The response contains only the verification URL, one-time code and flow identifier. Credentials never enter the browser response or SSE event stream.

### 6.2 Complete

The existing OAuth flow waits for the CLI to exit, validates the generated access/refresh token pair and JWT expiry, removes the temporary directory, then writes the account through the canonical encrypted account store.

The save operation is not acknowledged until the credential durability bridge commits the resulting encrypted snapshot and reads back the committed generation/digest.

### 6.3 Use and rotation

The account pool materializes a disposable per-account Codex home. The SDK may rotate credentials there. At the end of every turn, before the response is released:

1. read and validate the per-account Codex auth file;
2. compare it with the canonical encrypted account;
3. atomically update the encrypted account when it changed;
4. commit the encrypted snapshot to Cloudflare durable storage;
5. verify generation and digest readback;
6. remove or sanitize disposable execution state according to existing pool lifecycle;
7. return the model response.

A failed reconciliation or failed durability commit fails that turn. It must never be downgraded to best-effort telemetry.

### 6.4 Restart

Before runtime/account-pool initialization, the cloud host calls `hydrate()` on the installed credential durability bridge. Hydration validates schema, generation, allowed relative paths, file modes, digests, and containment, then writes only canonical encrypted account files and pool metadata beneath the configured state root.

The runtime is not ready until hydration completes. An unavailable or invalid durable snapshot is a typed provider-unavailable state; it is not replaced with an empty healthy account set.

### 6.5 Logout/deletion

Delete/reset operations commit the resulting tombstone or empty generation durably before returning success. Container restart cannot resurrect a deleted account.

## 7. Credential durability contract

The generic portable-state record API remains unchanged and continues rejecting secret-like fields. A separate exact endpoint handles opaque encrypted snapshots.

### 7.1 Snapshot shape

```ts
interface AliceCredentialSnapshotV1 {
  schemaVersion: "alice.credential-snapshot.v1";
  ownerId: "alice-owner-production";
  generation: number;
  previousGeneration: number | null;
  files: Array<{
    relativePath: string;
    mode: 0o600 | 0o644;
    size: number;
    sha256: `sha256:${string}`;
    bytesBase64: string;
  }>;
  snapshotSha256: `sha256:${string}`;
  committedAt: string;
}
```

Allowed paths are an explicit allowlist:

- `auth/openai-codex/*.json` except `_codex-home/**`;
- `auth/.credential-storage-generation`;
- `auth/_pool-metadata.json` when present.

No symlink, device, directory, traversal path, absolute path, unknown provider, unencrypted legacy account file, or file above the bounded size limit is accepted.

### 7.2 Storage semantics

The state plane exposes internal service-authenticated operations:

- `GET /v1/credential-snapshot/openai-codex`;
- `PUT /v1/credential-snapshot/openai-codex` with generation compare-and-swap;
- `DELETE /v1/credential-snapshot/openai-codex` with generation compare-and-swap;
- `GET /v1/credential-snapshot/openai-codex/status` returning metadata only.

A commit is accepted only when `previousGeneration` equals the durable generation. Identical generation/digest replay is idempotent. Conflicting same-generation or skipped-generation writes fail closed.

Cloudflare stores the opaque snapshot bytes plus metadata. The application-level account envelope remains AES-GCM encrypted by Eliza's vault key. The state-plane service never decrypts it.

## 8. Provider and model policy

Production Container configuration sets:

```text
ELIZA_CHAT_VIA_CLI=codex-sdk
ELIZA_CHAT_VIA_CLI_MODEL=<exact allowlisted model>
ELIZA_CHAT_VIA_CLI_ACCOUNT_STRATEGY=priority
ELIZA_REQUIRE_PINNED_SUBSCRIPTION_CLI=1
```

The internal release token remains available only for Alice control/state service authentication. It is no longer placed in `OPENAI_API_KEY`, and `OPENAI_BASE_URL`/`OPENAI_EMBEDDING_URL` are not configured to the Workers AI gateway for ordinary text.

Provider initialization fails when the exact CLI-inference package or exact Codex CLI is absent. It never downloads a package at runtime in the production profile.

## 9. Network policy

The Container remains `enableInternet = false`. Its `allowedHosts` contains the exact internal virtual hosts plus the exact OpenAI hosts observed from the pinned Codex client. The list is generated/verified from a reviewed static policy; it is not dynamically expanded from redirects or runtime errors.

Any unlisted host is denied. No generic direct-internet escape is introduced.

## 10. Access routing

The Access gateway admits only the account routes required by the existing UI:

- `GET /api/accounts`;
- OAuth start/status/submit/cancel for supported account providers;
- account test/usage;
- account patch/delete;
- provider metadata required by the settings page.

Writes remain owner-authenticated, same-origin, size-bounded and non-cacheable. SSE responses retain streaming semantics. The gateway never logs query tokens, OAuth credentials or event bodies.

## 11. Failure semantics

- No linked account: `ALICE_OPENAI_AUTH_REQUIRED`.
- Durable snapshot unavailable or invalid: `ALICE_OPENAI_AUTH_STATE_UNAVAILABLE`.
- Credential refresh/reconciliation failed: `ALICE_OPENAI_REAUTH_REQUIRED`.
- Account rate-limited: `ALICE_OPENAI_RATE_LIMITED` with bounded reset metadata.
- OpenAI unavailable: fail the turn as `ALICE_OPENAI_PROVIDER_UNAVAILABLE`.
- Durability commit failed: `ALICE_OPENAI_CREDENTIAL_COMMIT_FAILED`; do not release the model response.
- Workers AI availability never changes these outcomes and never causes fallback.

The Companion shell, account settings and durable transcript remain available whenever the owner/session boundary is healthy.

## 12. Security invariants

1. Browser-visible data never contains OAuth tokens or `auth.json`.
2. Cloudflare durable storage never receives a plaintext canonical account record.
3. The local vault key is not part of the snapshot.
4. The state plane cannot choose account/provider/model policy.
5. A Codex subprocess is never a second durable refresh owner.
6. A model response is not released across a credential-generation change until durable commit succeeds.
7. Hydration cannot write outside the branded auth root.
8. Deletion is durable and restart-safe.
9. Runtime installation is disabled in production.
10. No silent provider fallback exists.

## 13. Acceptance contract

The exact feature SHA must prove:

- device-login start/status/cancel without credential leakage;
- encrypted account creation and durable snapshot commit;
- clean Container replacement followed by hydration and successful account discovery;
- forced token rotation followed by durable generation advancement and successful second restart;
- durability commit failure suppresses an otherwise successful model response;
- concurrent/stale snapshot writes fail with deterministic CAS errors;
- logout/delete survives restart;
- ordinary chat selects `openai-codex`/`codex-sdk` and an exact model;
- provider receipt says `workersAiInvoked:false` and `fallbackUsed:false`;
- Workers AI request count remains zero for the acceptance conversation;
- OpenAI outage fails only the turn, not the UI/history;
- account routes are denied without owner Access proof;
- the immutable image contains exact CLI/package bytes and performs no runtime install;
- lint, typecheck, focused auth/provider/state tests, parent build, image package-boundary smoke and independent review pass.

No production route, provider credential or protected release branch is changed by this feature PR.