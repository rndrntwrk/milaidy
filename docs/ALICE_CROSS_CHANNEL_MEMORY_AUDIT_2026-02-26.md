# Alice Cross-Channel Memory Audit (Deferred Work)

Date: 2026-02-26  
Status: Documented, implementation deferred until games/stream work is complete.

## Executive Summary

Alice’s cross-channel memory architecture is partially implemented, but not wired end-to-end in runtime message flow.  
Current effective behavior remains primarily room-scoped conversation memory plus agent-scoped knowledge.

## Scope Reviewed

- Autonomy memory/retrieval pipeline
- Entity linking and entity-scoped memory components
- Session key and DM identity-link configuration paths
- Persistence/migration readiness for cross-channel memory

## Findings

### 1) Cross-entity retrieval path exists but is not activated in runtime requests

- `TrustAwareRetrieverImpl` supports two-phase retrieval when `canonicalEntityId` is present.
  - `src/autonomy/memory/retriever.ts:37`
  - `src/autonomy/memory/retriever.ts:177`
- Provider callsite currently passes only `roomId` (+ optional embedding), not `canonicalEntityId`.
  - `src/providers/trust-retrieval-provider.ts:44`

Impact: no entity-scoped retrieval in normal chat flow.

---

### 2) Entity components are initialized but not integrated into request handling

- Service initializes:
  - `InMemoryEntityMemoryStore`
  - `InMemoryEntityLinkStore`
  - `EntityLinker`
  - `TierPromoter`
  - `ActionIntentTracker`
  - `src/autonomy/service.ts:894`
  - `src/autonomy/service.ts:919`
- These are stashed on private dynamic fields (not exposed through typed service API, not wired into API message pipeline).
  - `src/autonomy/service.ts:933`

Impact: cross-channel components are effectively dormant for user-facing interactions.

---

### 3) Persistence posture is weak for this feature set

- Autonomy persistence defaults to disabled.
  - `src/autonomy/config.ts:169`
- Runtime explicitly falls back to in-memory when DB is unavailable.
  - `src/autonomy/service.ts:408`
- Entity memory/link store usage in service is currently in-memory.
  - `src/autonomy/service.ts:895`

Impact: non-durable behavior and restart resets for cross-channel identity/memory unless additional wiring is completed.

---

### 4) DM identity-link config exists, but local fallback resolver collapses DMs to `main`

- Config supports `session.dmScope` and `session.identityLinks`.
  - `src/config/zod-schema.session.ts:24`
  - `src/config/zod-schema.session.ts:32`
- Local fallback resolver maps all DM/SELF to `agent:<id>:main`.
  - `src/providers/session-bridge.ts:79`

Impact: fallback path bypasses per-peer DM isolation/linking behavior expected from `dmScope` and `identityLinks`.

---

### 5) Persistence schema for canonical entities/memories lacks strict tenancy constraints

- `canonical_entities` and `entity_memories` tables are present.
  - `src/autonomy/persistence/schema.ts:288`
  - `src/autonomy/persistence/schema.ts:331`
  - `src/autonomy/persistence/migrations/003_canonical_entities.ts:13`
  - `src/autonomy/persistence/migrations/003_canonical_entities.ts:35`
- Tables currently do not include `agent_id` scoping or strict uniqueness/foreign-key constraints for platform identity linkage.

Impact: future multi-agent or shared DB deployments risk cross-agent data bleed and linkage ambiguity.

---

### 6) Collision risk in entity-link store update path

- `upsertEntity` update branch replaces platform index entries without re-validating collisions against other entities.
  - `src/autonomy/memory/entity-link-store.ts:121`

Impact: potential identity-link corruption in edge cases.

## Deferred Implementation Plan (Post Games/Stream)

## P0 — Functional Wiring

1. Resolve canonical entity from inbound message identity.
2. Pass `canonicalEntityId` into retrieval calls.
3. Inject entity context into prompt composition for verified linked entities.
4. Add safe fallback to room-only retrieval when resolution fails.

## P1 — Durable Storage + Isolation

1. Introduce Pg-backed `EntityLinkStore` and `EntityMemoryStore`.
2. Add `agent_id` tenancy to canonical/entity tables.
3. Add uniqueness constraints for `(agent_id, platform, platform_id)` semantics.
4. Add FKs and lifecycle indexes for robust cleanup and query performance.

## P1 — Operational/API Surface

1. Expose typed service accessors for entity linker/store/promoter.
2. Add operator-only endpoints for link/list/inspect/reconcile.
3. Add health/diagnostics endpoint for cross-channel memory state.

## P1 — Safety/Test Coverage

1. Fix collision validation in `upsertEntity` update path.
2. Add integration tests across Discord/web_chat/Telegram for same user.
3. Add restart persistence tests and fallback degradation tests.

## Done Criteria (for later execution)

- Same user recognized across at least two channels with stable canonical ID.
- Entity-scoped facts retrieved across channels in normal chat path.
- Persistence survives restart.
- No cross-agent leakage in shared database.
- Full regression suite passes for retrieval, linking, and session isolation.

## Notes

- This is intentionally parked until games/stream delivery stabilizes.
- No code changes are included in this audit document; this file is a planning artifact.
