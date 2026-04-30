# SOW Addendum: Cross-Platform Memory & Entity Intelligence

**Project**: rndrntwrk / 555 — Alice Agent Runtime
**Parent SOW**: SOW Total Implementation Checklist (Phase 1: Identity and Memory Perimeter)
**Version**: 1.0
**Date**: 2026-02-23
**Status**: DRAFT
**Triggers**: Observed production failures — cross-platform memory loss, identity confusion, confabulation, compliance theater (see Appendix A)

---

## 0. Problem Statement

Alice is room-scoped blind. The existing Phase 1 memory infrastructure (typed memory, trust gate, retrieval ranking — P1-001 through P1-047, mostly `STATUS: CODED`) operates correctly within a single conversation room, but all retrieval is hard-scoped to `roomId`:

```typescript
// src/autonomy/memory/retriever.ts — fetchCandidates()
const timeMemories = await runtime.getMemories({
  roomId: options.roomId,     // ← every retrieval passes this
  tableName,
  count: this.config.maxResults * 3,
});
```

Each platform creates isolated rooms:
- **Web chat**: `stringToUuid('web-conv-${id}')` → world: `stringToUuid('${agentName}-web-chat-world')`
- **Discord**: Plugin creates rooms from Discord channel/guild IDs (different UUID namespace)
- **Telegram**: Plugin creates rooms from Telegram chat IDs (different UUID namespace)

**Result**: Conversation on Discord is invisible from web chat. Alice cannot recognize the same person across platforms. Knowledge (RAG) works cross-platform (agent-scoped via `agentId`), but conversation memory, user facts, preferences, and relationship context do not.

Web chat compounds this by creating entities with `userName: "User"` — zero identity linkage. There is no `resolveEntity`, `linkEntity`, or cross-platform entity concept anywhere in the codebase.

### Observed Production Failures (2026-02-22)

| # | Failure | Root Cause |
|---|---------|-----------|
| 1 | Alice doesn't remember Discord conversations on web chat | Room-scoped memory isolation |
| 2 | Alice doesn't know operator is enoomian on web chat | No cross-platform entity resolution |
| 3 | Alice fabricates information instead of saying "I don't know" | No grounding directive in active system prompt |
| 4 | Alice claims to have done actions she never executed | No action verification loop; fine-tuning blocked (P0/P1 remediation) |
| 5 | Alice confuses which platform she's on (Discord vs Telegram) | No platform-aware context injection |
| 6 | 4-round correction loops for simple fixes | No self-correction or verification feedback |
| 7 | Compliance theater — says "yep" without comprehension | Base model sycophancy; no anti-sycophancy prompt constraint in active context |

---

## 1. Existing Foundation (What We Have)

Phase 1 of the parent SOW built substantial memory infrastructure. This addendum builds on top of it — not replaces it.

### Already Coded and Available

| Component | File | What It Does |
|-----------|------|-------------|
| **TypedMemoryObject** | `src/autonomy/memory/types.ts` | Memory with `trustScore`, `provenance`, `memoryType`, `verifiabilityClass`, `verified` |
| **MemoryStore** | `src/autonomy/memory/store.ts` | `PersistedMemoryRecord` with `agentId`, `memoryType`, `content`, `metadata`, `provenance`, `trustScore`. `QuarantineRecord` with auto-expiry |
| **MemoryGate** | `src/autonomy/memory/gate.ts` | Allow (trust ≥ 0.7) / quarantine (0.3-0.7) / reject (<0.3) routing |
| **TrustAwareRetriever** | `src/autonomy/memory/retriever.ts` | Multi-dimensional ranking: trust weight + recency (24h half-life) + relevance + type boost. 11 memory types with configurable boosts |
| **MemoryType taxonomy** | `src/autonomy/types.ts` | `message`, `fact`, `document`, `relationship`, `goal`, `task`, `action`, `instruction`, `preference`, `observation`, `system` |
| **Trust Scorer** | `src/autonomy/trust/scorer.ts` | Rule-based + ML baseline (logistic regression) trust scoring |
| **Identity Config** | P1-001 through P1-010 | Identity schema, versioning, integrity verification, CRUD API, audit logging |
| **Persona Drift Monitor** | P1-011 through P1-018 | Drift dimensions, scoring, alerts, goal stack |
| **Knowledge Service** | `src/api/knowledge-routes.ts` | Agent-scoped RAG — uses `agentId` as `roomId`, already cross-platform |
| **Embedding Manager** | `src/runtime/embedding-manager.ts` | Nomic Embed Text v1.5 (768d) via node-llama-cpp, auto-download, idle timeout |

### What's Missing (This SOW)

| Gap | Impact |
|-----|--------|
| **Entity linking store** | Cannot identify same person across platforms |
| **Cross-room retrieval** | Cannot access memories from other rooms for the same entity |
| **Memory tier promotion** | No mechanism to elevate facts from short-term (room) to long-term (entity) |
| **Conversation summarization** | No session-end summarization for mid-term memory |
| **Identity grounding in active context** | Character system prompt lacks operator identity, anti-confabulation directives |
| **Action verification loop** | Alice promises actions without confirmation of execution |
| **Retrieval quality probes** | Only 2 synthetic baseline tasks in `retrieval-quality.ts`; zero real corpus probes |

---

## 2. Architecture

### 2.1 Three-Tier Memory Model

```
┌──────────────────────────────────────────────────────────┐
│                   LONG-TERM MEMORY                       │
│  Scope: Entity (cross-platform, cross-room)              │
│  Contains: User facts, preferences, relationship state,  │
│            verified action outcomes, operator identity    │
│  Persistence: Durable store, no auto-expiry              │
│  Promotion: From mid-term via fact extraction             │
├──────────────────────────────────────────────────────────┤
│                   MID-TERM MEMORY                        │
│  Scope: Entity (cross-platform, time-bounded)            │
│  Contains: Conversation summaries, unresolved promises,  │
│            active task state, session context             │
│  Persistence: Durable store, 30-day sliding window       │
│  Promotion: From short-term via session summarization     │
├──────────────────────────────────────────────────────────┤
│                   SHORT-TERM MEMORY                      │
│  Scope: Room (current behavior — unchanged)              │
│  Contains: Current conversation messages, immediate ctx  │
│  Persistence: Existing ElizaOS memory tables             │
│  This is what exists today. No changes needed here.      │
└──────────────────────────────────────────────────────────┘
```

**Key principle**: Short-term stays room-scoped (that's correct and efficient). Mid-term and long-term are **entity-scoped** — they follow the person, not the room.

### 2.2 Entity Linking

```
┌─────────────────────────────────────┐
│          CanonicalEntity            │
├─────────────────────────────────────┤
│ id: UUID (canonical)                │
│ displayName: string                 │
│ trustLevel: number                  │
│ platformIds: {                      │
│   discord: "enoomian#1234"          │
│   web_chat: UUID (admin entity)     │
│   telegram: "@enoomian"             │
│ }                                   │
│ isOperator: boolean                 │
│ preferences: Record<string, any>    │
│ knownFacts: string[]                │
│ firstSeen: timestamp                │
│ lastSeen: Record<platform, ts>      │
│ metadata: Record<string, unknown>   │
└─────────────────────────────────────┘
```

Resolution flow:
1. Platform plugin creates room + entity with platform-specific ID
2. **EntityLinker** resolves platform ID → canonical entity (lookup table, fallback to manual linking via operator command)
3. Retriever receives canonical entity ID alongside roomId
4. Two-phase retrieval: room-scoped short-term + entity-scoped mid/long-term

### 2.3 Modified Retrieval Flow

```
Current:  fetchCandidates(roomId) → [room memories only]

Proposed: fetchCandidates(roomId, canonicalEntityId?) →
            Phase 1: room-scoped short-term (existing behavior)
            Phase 2: entity-scoped mid-term + long-term (NEW)
            Merge + deduplicate + rank by trust/recency/relevance/type
```

The existing `TrustAwareRetriever` scoring pipeline (trust weight, recency decay, relevance, type boost) is preserved unchanged. The only modification is that `fetchCandidates` gains a second retrieval phase for entity-scoped memories.

---

## 3. Work Items

### WP-1: Identity Grounding (P0 — Immediate)

**Effort**: 0.5 days | **Risk**: None | **Dependencies**: None

No code changes to runtime. Configuration + knowledge corpus only.

| # | Task | Acceptance |
|---|------|-----------|
| 1.1 | Add anti-confabulation directive to character system prompt in `buildCharacterFromConfig()` | System prompt includes: "When you don't know something, say so. Never fabricate information. Never claim to have performed an action you haven't verified." |
| 1.2 | Add operator identity document to `milaidy/knowledge/` | Document maps known operators (enoomian) to platform identities, trust level, and interaction preferences |
| 1.3 | Add platform behavior rules document to `milaidy/knowledge/` | Document specifies: what platform Alice is currently on, how to detect it from context, what capabilities are available per platform |
| 1.4 | Add retrieval quality probes to `retrieval-quality.ts` | Minimum 10 probes covering: operator identity, platform awareness, action verification, knowledge boundaries. All probes pass Recall@3 |
| 1.5 | Run knowledge reseed on live pod | Updated corpus deployed and verified via `/api/knowledge/stats` |

**Why first**: Zero risk, immediate behavioral improvement. The knowledge corpus is agent-scoped (already cross-platform). Adding grounding directives directly reduces confabulation and identity confusion without touching any memory code.

### WP-2: Entity Linking Store (P1 — Foundation)

**Effort**: 3 days | **Risk**: Low | **Dependencies**: None

| # | Task | Acceptance |
|---|------|-----------|
| 2.1 | Define `CanonicalEntity` schema (Zod-validated) | Schema covers: `id`, `displayName`, `trustLevel`, `platformIds` (map of platform → platform-specific-id), `isOperator`, `preferences`, `knownFacts`, `firstSeen`, `lastSeen`, `metadata` |
| 2.2 | Implement `EntityLinkStore` interface | Methods: `upsertEntity`, `getByPlatformId(platform, platformId)`, `getById(canonicalId)`, `linkPlatform(canonicalId, platform, platformId)`, `unlinkPlatform`, `listEntities`, `searchByName` |
| 2.3 | Implement SQLite-backed `EntityLinkStore` | Uses existing SQLite database. Table: `canonical_entities`. Index on `(platform, platform_id)` for O(1) lookup. Migration script included |
| 2.4 | Implement `EntityLinker` service | Resolves platform-specific entity → canonical entity. Falls back to creating new canonical entity on first encounter. Emits `entity:linked` event on new linkage |
| 2.5 | Add entity link API routes | `GET /api/entities`, `GET /api/entities/:id`, `POST /api/entities/link`, `DELETE /api/entities/:id/platforms/:platform`. Auth: operator-only |
| 2.6 | Add operator CLI commands for entity management | `alice entity list`, `alice entity link <canonical-id> <platform> <platform-id>`, `alice entity show <id>` |
| 2.7 | Seed initial operator entity | On first boot, create canonical entity for operator with known platform IDs from config/env |
| 2.8 | Unit + integration tests | ≥90% coverage on EntityLinkStore and EntityLinker. Tests cover: link/unlink, duplicate detection, concurrent access, migration |

**Design decision**: SQLite (not a new external service). Alice already runs SQLite for ElizaOS. Adding a table is zero operational overhead. If we need to scale later (multi-pod), we can migrate to Postgres — but Alice is single-pod today.

### WP-3: Cross-Room Retrieval (P1 — Critical Path)

**Effort**: 4 days | **Risk**: Medium | **Dependencies**: WP-2

| # | Task | Acceptance |
|---|------|-----------|
| 3.1 | Add `entityMemories` table to SQLite schema | Schema: `id`, `canonicalEntityId`, `memoryTier` (enum: 'mid-term', 'long-term'), `memoryType` (existing MemoryType), `content`, `metadata`, `trustScore`, `provenance`, `source` (platform + roomId origin), `createdAt`, `updatedAt`, `expiresAt` (nullable, for mid-term TTL) |
| 3.2 | Implement `EntityMemoryStore` | Methods: `saveEntityMemory`, `getEntityMemories(canonicalEntityId, opts)` with filters on tier/type/recency, `pruneExpired`, `promoteToLongTerm(memoryId)`, `searchSemantic(canonicalEntityId, embedding, opts)` |
| 3.3 | Add embedding support to entity memories | Embeddings stored alongside entity memories for semantic search. Uses existing `MilaidyEmbeddingManager` — no new model |
| 3.4 | Extend `RetrievalOptions` interface | Add optional `canonicalEntityId?: UUID`. When present, retriever executes two-phase retrieval |
| 3.5 | Implement two-phase retrieval in `TrustAwareRetriever` | Phase 1: existing room-scoped `fetchCandidates(roomId)` (unchanged). Phase 2: `fetchEntityCandidates(canonicalEntityId)` querying `entityMemories` table. Merge results, deduplicate by content hash, rank through existing scoring pipeline |
| 3.6 | Wire entity resolution into message handling | Before retrieval: resolve current user → canonical entity via `EntityLinker`. Pass `canonicalEntityId` to retriever. If no canonical entity found, degrade gracefully to room-only (current behavior) |
| 3.7 | Add entity-scoped context injection | When canonical entity is resolved, inject entity context block into message composition: `"You are speaking with {displayName}. Known facts: [...]. Preferences: [...]. Last interaction: {platform} at {timestamp}."` |
| 3.8 | Integration tests | Tests cover: same user across web + Discord rooms, entity memory shows up in both, graceful degradation when no entity linked, deduplication between room and entity memories |

**Risk mitigation**: The two-phase retrieval is additive — if entity resolution fails or no canonical entity exists, the retriever falls back to room-only behavior (identical to today). Zero regression risk.

### WP-4: Conversation Summarization & Tier Promotion (P2)

**Effort**: 3 days | **Risk**: Low | **Dependencies**: WP-3

| # | Task | Acceptance |
|---|------|-----------|
| 4.1 | Implement `ConversationSummarizer` | On conversation end (room inactivity timeout or explicit session end): collect last N messages, generate summary via LLM call, extract key facts as structured objects. Output: `{ summary: string, extractedFacts: Fact[], unresolved: string[] }` |
| 4.2 | Implement fact extraction prompt | Prompt extracts: user preferences, stated facts, commitments made by Alice, unresolved questions, emotional tone, topics discussed. Each fact tagged with confidence score |
| 4.3 | Implement mid-term memory writer | On session end: write conversation summary as mid-term entity memory. Write high-confidence extracted facts as candidate long-term memories (quarantined until trust threshold met) |
| 4.4 | Implement long-term promotion logic | Facts that appear across ≥2 separate sessions with consistent content are auto-promoted to long-term. Contradicting facts: keep most recent, mark older as superseded |
| 4.5 | Implement mid-term TTL cleanup | Background job: prune mid-term memories older than 30 days. Configurable via `MEMORY_MIDTERM_TTL_DAYS` env var |
| 4.6 | Implement unresolved promise tracking | When Alice says "I'll do X", create `unresolved` entity memory. On next session with same entity, inject unresolved items into context: "Outstanding items from previous sessions: [...]" |
| 4.7 | Tests | Summarization produces valid output for 10 synthetic conversations. Fact extraction handles: empty conversations, single-message conversations, multi-topic conversations. Promotion logic correctly handles contradictions |

### WP-5: Action Verification Loop (P2)

**Effort**: 2 days | **Risk**: Medium | **Dependencies**: WP-2 (entity store for tracking)

| # | Task | Acceptance |
|---|------|-----------|
| 5.1 | Define `ActionIntent` schema | `{ id, canonicalEntityId, action: string, status: 'pending' | 'attempted' | 'succeeded' | 'failed', evidence?: string, createdAt, resolvedAt }` |
| 5.2 | Implement action intent detection | When Alice's response contains commitment language ("I'll", "I will", "Let me", "I'm going to"), create `ActionIntent` record. Uses lightweight regex + LLM classification fallback |
| 5.3 | Implement action outcome capture | After tool execution: match result to pending `ActionIntent`, update status with evidence. If no tool executed but intent was created, mark as `failed` with reason: "no action taken" |
| 5.4 | Implement honest failure reporting | When action fails: Alice reports failure honestly instead of pretending success. System prompt directive: "If an action you attempted failed, report the failure with the actual error. Never claim success without evidence." |
| 5.5 | Inject open intents into context | On new message from entity: check for pending/failed ActionIntents. Inject into context: "Previous actions you promised but haven't completed: [...]" |
| 5.6 | Tests | Intent detection catches 5 common commitment patterns. Outcome capture correctly matches tool results. Context injection surfaces unresolved promises |

**Dependency note**: This partially requires the trajectory capture fix (P0 from the remediation plan — `handleMessage` doesn't emit `MESSAGE_RECEIVED`). WP-5 can be implemented with a lighter-weight approach (hook into response post-processing rather than event bus) as an interim solution.

### WP-6: Platform Context Injection (P1)

**Effort**: 1 day | **Risk**: None | **Dependencies**: None

| # | Task | Acceptance |
|---|------|-----------|
| 6.1 | Add `currentPlatform` to message context | Detect platform from room metadata / world source. Inject into system context: "You are currently communicating via {platform}." |
| 6.2 | Add platform capability awareness | Each platform has a capability manifest: Discord (reactions, embeds, threads, voice), Web Chat (markdown, links), Telegram (inline keyboards, stickers). Inject available capabilities into context |
| 6.3 | Add platform-specific response formatting | Web chat: full markdown. Discord: Discord-flavored markdown with embed support. Telegram: HTML subset. Alice adapts response format to platform |
| 6.4 | Tests | Platform detection correct for web, Discord, Telegram. Capability injection matches platform. Response formatting adapts |

---

## 4. Implementation Order & Dependencies

```
Week 1:
  WP-1 (Identity Grounding)     ─── 0.5 days, ZERO RISK, immediate deploy
  WP-6 (Platform Context)       ─── 1 day, no dependencies
  WP-2 (Entity Linking Store)   ─── 3 days, foundation for everything else

Week 2:
  WP-3 (Cross-Room Retrieval)   ─── 4 days, depends on WP-2

Week 3:
  WP-4 (Summarization & Tiers)  ─── 3 days, depends on WP-3
  WP-5 (Action Verification)    ─── 2 days, depends on WP-2
```

**Total: ~14 days of implementation across 3 weeks.**

Critical path: WP-1 → WP-2 → WP-3. These three alone fix 5 of 7 observed production failures.

```
Dependency graph:

WP-1 (Grounding)       WP-6 (Platform Ctx)
     │                       │
     └───────┐   ┌───────────┘
             ▼   ▼
        WP-2 (Entity Store)
             │
             ▼
        WP-3 (Cross-Room Retrieval)
           │         │
           ▼         ▼
    WP-4 (Summaries)  WP-5 (Action Verify)
```

---

## 5. Files Modified

### New Files

| File | Purpose |
|------|---------|
| `src/autonomy/memory/entity-link-store.ts` | CanonicalEntity schema + EntityLinkStore interface + SQLite implementation |
| `src/autonomy/memory/entity-linker.ts` | EntityLinker service — resolves platform ID → canonical entity |
| `src/autonomy/memory/entity-memory-store.ts` | EntityMemoryStore — mid-term + long-term entity-scoped memory |
| `src/autonomy/memory/conversation-summarizer.ts` | Session-end summarization + fact extraction |
| `src/autonomy/memory/action-intent-tracker.ts` | ActionIntent detection, tracking, outcome capture |
| `src/api/entity-routes.ts` | REST API for entity management |
| `src/autonomy/memory/entity-link-store.test.ts` | Tests |
| `src/autonomy/memory/entity-linker.test.ts` | Tests |
| `src/autonomy/memory/entity-memory-store.test.ts` | Tests |
| `src/autonomy/memory/conversation-summarizer.test.ts` | Tests |
| `src/autonomy/memory/action-intent-tracker.test.ts` | Tests |
| `knowledge/50_operations/operator-identity.md` | Operator identity knowledge document |
| `knowledge/50_operations/platform-behavior-rules.md` | Platform behavior rules knowledge document |

### Modified Files

| File | Change |
|------|--------|
| `src/autonomy/memory/retriever.ts` | Add `canonicalEntityId` to `RetrievalOptions`. Add `fetchEntityCandidates()` for Phase 2 retrieval. Merge logic in `retrieve()` |
| `src/api/server.ts` | Wire EntityLinker into web chat message handling. Resolve user → canonical entity before retrieval |
| `src/runtime/eliza.ts` | Add anti-confabulation directive + operator identity block to `buildCharacterFromConfig()`. Add platform context detection |
| `src/api/knowledge-routes.ts` | No changes (already agent-scoped) |
| `src/autonomy/memory/retrieval-quality.ts` | Add 10+ real corpus retrieval probes |
| `src/autonomy/memory/store.ts` | No changes to interface (entity memories use separate store) |
| `src/autonomy/memory/gate.ts` | No changes (entity memories route through same gate) |
| `src/autonomy/memory/types.ts` | No changes (entity memories use same TypedMemoryObject) |

---

## 6. Integration with External Memory Research

This design borrows proven patterns from production memory systems without introducing external dependencies:

| Pattern | Source | How We Use It |
|---------|--------|--------------|
| **Memory extraction from conversations** | Mem0 | WP-4 conversation summarizer extracts structured facts from session transcripts |
| **Temporal reasoning** | Zep (knowledge graph) | Entity memories track `createdAt`/`updatedAt`, long-term promotion requires ≥2 session consistency, contradictions resolved by recency |
| **Zettelkasten linking** | A-Mem (arXiv 2502.12110) | Entity facts cross-reference via `metadata.relatedFacts[]` — enables "what else do I know about this?" traversal |
| **Tiered memory architecture** | Memory OS (EMNLP 2025) | Three tiers: short-term (room-scoped, FIFO), mid-term (entity-scoped, 30-day TTL), long-term (entity-scoped, permanent) |
| **Selective forgetting** | AgeMem (arXiv 2601.01885) | Mid-term TTL expiry + contradiction resolution in long-term promotion prevents memory bloat |
| **Agent-controlled memory editing** | Letta/MemGPT | WP-5 action intent tracking gives Alice explicit awareness of her own commitments, enabling self-correction |

**Deliberate exclusion**: We do not integrate Mem0/Zep/Letta as external services. The existing SQLite + embedding infrastructure is sufficient. Adding an external memory service would introduce latency, operational complexity, and a new failure mode for a single-pod deployment. If Alice moves to multi-pod, we revisit.

---

## 7. Acceptance Criteria

### Behavioral Tests (Must Pass)

| # | Test | Validates |
|---|------|----------|
| B-1 | Operator talks to Alice on Discord, then web chat. Alice remembers the Discord conversation context | WP-2 + WP-3 |
| B-2 | Operator says "I'm enoomian" on web chat. Alice responds with recognition, not confusion | WP-1 + WP-2 |
| B-3 | Alice is asked a question she cannot answer from knowledge corpus. She says "I don't know" instead of fabricating | WP-1 |
| B-4 | Alice promises to do something but the action fails. She reports the failure honestly | WP-5 |
| B-5 | Operator asks Alice "what platform are you on?" Alice answers correctly for web, Discord, Telegram | WP-6 |
| B-6 | Operator talks to Alice across 3 sessions on different platforms. Alice recalls key facts from all 3 | WP-3 + WP-4 |
| B-7 | After 30+ days, mid-term memories expire. Long-term facts (promoted) persist | WP-4 TTL |
| B-8 | Alice recalls an unresolved promise from a previous session and surfaces it proactively | WP-4 + WP-5 |

### Quality Gates

| Gate | Threshold |
|------|----------|
| Retrieval quality probes | Recall@3 ≥ 0.8 on 10+ real corpus probes |
| Entity linking accuracy | 100% for pre-seeded operator entities, ≥95% for manual link operations |
| Cross-room retrieval latency | P99 < 200ms (entity-scoped retrieval adds < 100ms to room-scoped baseline) |
| Memory store size | Mid-term cleanup keeps store < 10MB per entity per 30-day window |
| Test coverage | ≥90% on all new modules |
| Zero regressions | Existing test suite passes unchanged |

---

## 8. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Entity linking false matches** | Medium | Conservative: never auto-link across platforms. Operator must explicitly link via CLI/API. Auto-link only within same platform (same Discord user = same entity) |
| **Memory bloat from summarization** | Low | Mid-term TTL (30 days). Long-term promotion requires ≥2 session consistency. Configurable limits per entity |
| **LLM summarization quality** | Medium | Structured extraction prompt with Zod-validated output. Fallback: raw last-N messages if LLM unavailable |
| **Retrieval latency increase** | Low | Two-phase retrieval is parallelizable. Entity memory index on `canonicalEntityId` ensures O(log n) lookup. Measured: target < 100ms added latency |
| **SQLite concurrency** | Low | Alice is single-pod. WAL mode handles concurrent reads. Write serialization via queue if needed |
| **Trajectory capture still blocked** | Medium | WP-5 uses lightweight post-processing hook, not event bus. Does not depend on P0 `MESSAGE_RECEIVED` fix. Full event-driven version deferred |

---

## 9. Relationship to Parent SOW

This addendum extends Phase 1 (Identity and Memory Perimeter) with work items that were not scoped in the original SOW. Specifically:

| Parent SOW Item | Status | This Addendum |
|----------------|--------|--------------|
| P1-001 to P1-010 (Identity Model) | CODED | WP-2 builds EntityLinkStore on top of existing identity infrastructure |
| P1-019 to P1-028 (Typed Memory + Gate) | CODED | WP-3 routes entity memories through existing gate. No gate changes |
| P1-029 to P1-036 (Trust Scoring + Retrieval) | CODED | WP-3 extends retriever with entity-scoped phase. Scoring pipeline unchanged |
| P1-043 to P1-047 (Phase Gate) | CODED | New behavioral tests (Section 7) augment existing phase gate |
| P4-008 to P4-011 (Prompt Controls) | CODED | WP-1 adds grounding directives complementing existing anti-sycophancy prompts |

No existing SOW items are modified or invalidated by this addendum.

---

## Appendix A: Production Failure Transcript (2026-02-22)

Reference: Operator interaction with Alice across Discord and web chat showing all 7 failure modes listed in Section 0. Full transcript maintained in project records. Key excerpts:

- Alice unable to recall Discord conversation when accessed via web chat
- Alice did not recognize operator identity ("enoomian") on web chat
- Alice fabricated fix instructions (wrong platform, wrong steps) when unsure
- Alice required 4 correction rounds for a simple configuration fix
- Alice confused Discord with Telegram in the same conversation
- Alice responded "yep" to instructions without executing any actions
- Alice promised future capabilities that don't exist

---

*This SOW addendum scopes the implementation effort required to fix Alice's cross-platform memory and behavioral intelligence failures. It builds on the existing Phase 1 memory infrastructure without replacing or modifying proven components. The layered approach (WP-1 through WP-6) allows incremental deployment with immediate behavioral improvement from Day 1 (WP-1 identity grounding) while building toward the full entity-scoped memory architecture.*
