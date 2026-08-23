# P4 Plan — Governed Learning and Memory Promotion

**Goal:** allow Alice to improve from experience without allowing model output to corrupt canonical truth or policy.  
**Dependency:** P2 retrieval receipts and admitted trajectories; P1 memory wrappers.

## Proposed file tree

```text
packages/agent/src/plugins/alice-cognitive-fabric/learning/
├── types.ts
├── candidate-extractor.ts
├── lesson-extractor.ts
├── deduplication.ts
├── entity-resolution.ts
├── temporal-check.ts
├── privacy-check.ts
├── conflict-check.ts
├── evidence-check.ts
├── staging-repository.ts
├── review-policy.ts
├── promotion.ts
├── corpus-delta.ts
├── skill-adapter.ts
├── evaluators.ts
└── *.test.ts
```

## Task 1 — Define candidate classes and states

States:
```text
PROPOSED
VALIDATING
NEEDS_EVIDENCE
CONFLICTED
READY_FOR_REVIEW
APPROVED
REJECTED
DEFERRED
PROMOTED
RETRACTED
```

Candidates do not appear in normal retrieval unless a verifier explicitly asks for staged material.

## Task 2 — Extract lessons from trajectories

Input:
- objective;
- plan;
- context packet;
- actions;
- tool results;
- evaluator outcome;
- retries;
- cost;
- produced evidence.

Output:
- reusable lesson;
- failure signature;
- success preconditions;
- prohibited shortcut;
- evidence expectation.

A model may propose, but deterministic validation owns structure.

## Task 3 — Extract fact and observation candidates

Rules:
- direct tool receipts produce observation candidates;
- user statements produce preference/decision candidates;
- model summaries produce derived candidates with lower authority;
- external content cannot become policy;
- old transcript commands remain historical.

## Task 4 — Deduplicate semantically and by entity

Combine:
- exact normalized text;
- subject and predicate;
- aliases;
- embedding similarity;
- graph proximity;
- temporal overlap;
- source overlap.

Do not merge records solely because their text is similar.

## Task 5 — Temporal and conflict checks

Detect:
- replacement;
- contradiction;
- updated current state;
- environment mismatch;
- historical coexistence;
- stale evidence;
- unresolved source conflict.

Produce explicit links rather than overwriting.

## Task 6 — Privacy and projection checks

Determine:
- minimum visibility;
- permitted identities;
- whether public derivation is possible;
- whether personal data needs consent or minimization;
- whether security detail requires coordinated disclosure.

## Task 7 — Evidence sufficiency

Promotion policy per class:
- founder preference: explicit statement;
- system implementation: canonical repository and SHA;
- deployment: runtime/chain and receipt;
- financial: reconciled close;
- relationship: private source and founder approval;
- procedure: reproducible outcome;
- skill: repeated success or one high-quality reproducible trajectory plus tests.

## Task 8 — Staging and review API

Add:
```text
ALICE_MEMORY_CANDIDATE_LIST
ALICE_MEMORY_CANDIDATE_INSPECT
ALICE_MEMORY_CANDIDATE_APPROVE
ALICE_MEMORY_CANDIDATE_REJECT
ALICE_MEMORY_CANDIDATE_REQUEST_EVIDENCE
```

Approval actions require the appropriate reviewer capability. The model cannot approve its own candidate.

## Task 9 — Integrate skill proposal and refinement

Adapter to existing skill mechanisms:
- successful trajectories propose skills;
- failed or retried trajectories propose refinement;
- candidate includes exact trajectory IDs;
- build/test evidence required;
- secrets and environment-specific values excluded;
- skill version and rollback retained.

## Task 10 — Generate signed corpus deltas

Approved canonical candidates produce:
```text
corpus-delta/
├── manifest.json
├── added-records.jsonl
├── supersession.jsonl
├── retractions.jsonl
├── source-handles.jsonl
├── review-decisions.jsonl
├── eval-results.json
└── SHA256SUMS.txt
```

A delta is applied only by the corpus build/release process.

## Task 11 — Promote dynamic observations separately

Current observations enter the world-state store, not the immutable semantic corpus. Only durable interpretation or historical milestone candidates may later enter a corpus delta.

## Task 12 — Regression evaluation

Before promotion:
- canonical question suite;
- temporal tests;
- contradiction tests;
- projection tests;
- voice tests if relevant;
- procedure/skill tests;
- affected-system graph tests.

A promotion that improves one answer but breaks another is not admitted.

## Task 13 — Learning telemetry

Measure:
- candidate rate;
- approval rate;
- false candidate rate;
- duplicate rate;
- conflict rate;
- time to review;
- skill reuse;
- repeated-failure reduction;
- regression rate;
- reviewer load.

Do not optimize for maximum memory growth.
