# Alice OpenAI Codex Durable Authentication Implementation Plan

> Execute test-first. Every task produces a failing behavioral test, an observed RED result, the minimum implementation, and a GREEN result before the next task. Do not use the production deployment workflow as an integration-test loop.

## Task 1: Eliza credential-durability bridge contract

**Repository:** `rndrntwrk/eliza`

**Files:**

- Create `packages/auth/src/credential-durability.ts`
- Create `packages/auth/src/credential-durability.test.ts`
- Update `packages/auth/src/index.ts` and package exports as required

**RED:** prove no installed bridge is a no-op for desktop/test profiles, an installed bridge is awaited, a rejected commit propagates, and bridge replacement/reset is deterministic.

**GREEN:** add a narrow process-local bridge registry with `hydrate`, `commit`, and `delete` operations. Keep the low-level encrypted filesystem store synchronous; the bridge is awaited only by async application boundaries.

## Task 2: Snapshot and hydration primitives

**Repository:** `rndrntwrk/eliza`

**Files:**

- Create `packages/auth/src/credential-snapshot.ts`
- Create `packages/auth/src/credential-snapshot.test.ts`

**RED:** traversal, symlink, unknown path, legacy plaintext record, `_codex-home`, invalid mode, digest mismatch, oversized file, generation mismatch and partial hydration all fail before filesystem mutation.

**GREEN:** implement deterministic snapshot creation, validation, digesting and atomic hydration for the exact canonical allowlist.

## Task 3: Await durability at all account mutation boundaries

**Repository:** `rndrntwrk/eliza`

**Files:**

- Update `packages/agent/src/api/accounts-routes.ts`
- Update `packages/auth/src/credentials.ts`
- Update account reset/delete paths
- Add focused tests beside existing account/OAuth tests

**RED:** OAuth save, refresh, patch, delete and reset return success before durable commit or swallow a commit rejection.

**GREEN:** call the durability bridge after each canonical mutation and before success. Preserve typed causes and ensure delete commits a tombstone/empty generation.

## Task 4: Make Codex rotation reconciliation load-bearing

**Repository:** `rndrntwrk/eliza`

**Files:**

- Update `packages/app-core/src/services/coding-account-bridge.ts`
- Update `plugins/plugin-cli-inference/src/account-rotation.ts`
- Add/extend tests for both modules

**RED:** simulate the SDK rotating `auth.json`, make durable commit fail, and prove the provider currently releases a response or treats adoption as telemetry.

**GREEN:** reconcile rotated credentials, await encrypted snapshot commit, then release the response. Continue best-effort usage accounting only after the credential barrier has passed.

## Task 5: Hydrate before runtime readiness

**Repository:** `rndrntwrk/eliza`

**Files:**

- Update `packages/app-core/src/runtime/eliza.ts`
- Add runtime startup ordering tests

**RED:** account pool starts or advertises readiness before bridge hydration and accepts an invalid snapshot as an empty account set.

**GREEN:** await hydration before account configuration and pool initialization. Surface a typed startup/provider state rather than silently dropping credentials.

## Task 6: Disable runtime Codex installation under production pin policy

**Repository:** `rndrntwrk/eliza`

**Files:**

- Update `packages/agent/src/api/accounts-routes.ts`
- Extend OAuth flow tests

**RED:** when `ELIZA_REQUIRE_PINNED_SUBSCRIPTION_CLI=1`, missing Codex CLI triggers `npm install`.

**GREEN:** fail with a typed `PINNED_SUBSCRIPTION_CLI_MISSING` result. Preserve current desktop convenience when the production flag is absent.

## Task 7: Commit and review Eliza branch

Run focused auth, app-core and CLI-inference tests; package typechecks/builds; request independent review. Fix findings. Record exact Eliza commit SHA.

## Task 8: State-plane encrypted snapshot service

**Repository:** `rndrntwrk/milaidy`

**Files:**

- Create `workers/alice-state-plane/src/credential-snapshot.ts`
- Create `workers/alice-state-plane/src/credential-snapshot.test.ts`
- Update `workers/alice-state-plane/src/service.ts`
- Update `workers/alice-state-plane/src/index.ts`
- Add D1 migration or binding declarations as required

**RED:** unauthenticated access, invalid schema/path/digest, stale generation, conflicting replay, skipped generation, plaintext-account payload and oversized snapshot are rejected; exact replay is idempotent.

**GREEN:** add exact internal endpoints, generation compare-and-swap and metadata-only status. Do not weaken generic portable-state validation.

## Task 9: Container-side durability client

**Repository:** `rndrntwrk/milaidy`

**Files:**

- Create `packages/app-core/src/runtime/alice-credential-durability.ts`
- Create tests
- Update cloud bootstrap composition

**RED:** no snapshot hydration, malformed remote snapshot writes local bytes, commit does not verify readback, and delete can be resurrected.

**GREEN:** install the Eliza bridge only in the Alice cloud profile; authenticate to the internal state plane with the release token; hydrate, commit and delete with schema, digest, generation and bounded-timeout verification.

## Task 10: Runtime host and network policy

**Repository:** `rndrntwrk/milaidy`

**Files:**

- Update `workers/alice-access-gateway/src/alice-runtime-host.ts`
- Update `workers/alice-access-gateway/src/alice-runtime-container.ts`
- Update focused tests

**RED:** production env still injects the internal token as `OPENAI_API_KEY`, configures the Workers AI base URL, lacks CLI provider variables, or allows no reviewed OpenAI egress.

**GREEN:** configure `codex-sdk`, exact model and strategy; remove text-gateway env; add exact internal and OpenAI host allowlist; proxy credential snapshot endpoints only.

## Task 11: Owner account API routing

**Repository:** `rndrntwrk/milaidy`

**Files:**

- Update `workers/alice-access-gateway/src/index.ts`
- Add route, admission and SSE tests

**RED:** owner cannot reach existing account APIs, or broad route admission exposes unrelated runtime mutation endpoints.

**GREEN:** admit only exact account read/write/SSE routes under existing owner Access, origin and size controls. Preserve streaming and no-store headers.

## Task 12: Build exact provider and CLI bytes

**Repository:** `rndrntwrk/milaidy`

**Files:**

- Update `.github/workflows/build-cloud-agent.yml`
- Update `deploy/Dockerfile.ci`
- Update runtime capability BOM/build manifest scripts and tests
- Update lockfile only through the repository's package-manager contract

**RED:** immutable image lacks `@elizaos/plugin-cli-inference` or exact Codex CLI, runtime proof still requires `plugin-openai`, or production can attempt a package install.

**GREEN:** build and materialize exact package exports; verify CLI version and digest; include both identities in BOM/provenance; assert absence of the runtime-install path.

## Task 13: Pin reviewed Eliza commit

Update the parent `eliza` gitlink to the reviewed Task 7 commit. Verify no unrelated submodule pointer changes.

## Task 14: Runtime proof and provider receipt

**Repository:** `rndrntwrk/milaidy`

**Files:**

- Update runtime proof checks
- Add provider receipt generation and validation
- Update acceptance tests

**RED:** a Workers AI or OpenAI-plugin runtime can satisfy proof, fallback is invisible, or receipt leaks raw account identity.

**GREEN:** require CLI-inference and codex-sdk, exact model policy, account hash, credential generation, `workersAiInvoked:false`, and `fallbackUsed:false`.

## Task 15: Failure and restart matrix

Run deterministic integration tests for:

1. no account;
2. device login cancellation and expiry;
3. initial durable save;
4. clean Container restart;
5. forced refresh rotation;
6. crash after remote model success but before credential commit;
7. stale and conflicting generations;
8. durable logout;
9. OpenAI 401, 429 and 5xx;
10. state-plane timeout;
11. Workers AI present but unused;
12. owner Access denial;
13. SSE reconnect;
14. UI and history continuity.

## Task 16: Parent CI and independent review

Use the `codex/**` push trigger for ordinary CI. Run focused Alice tests and static build or image contract checks. Do not invoke the production deployment workflow. Request independent code and security review and resolve all findings.

## Task 17: Draft integration PR

Open a draft PR from `codex/alice-openai-codex-durable-auth-2026-08-29` to `release/alice-production-core-2026-08-22` containing:

- exact parent and Eliza commit identities;
- RED and GREEN evidence;
- security invariants;
- migration and rollback behavior;
- explicit statement that no provider or production route mutation occurred;
- remaining production-only acceptance step, if any.

Do not mark mergeable or release-ready until verification-before-completion is satisfied.