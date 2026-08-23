# P2 Plan — Adaptive Context Compiler

**Goal:** build the first production-admissible Cognitive Fabric service over the static admitted corpus.  
**Dependency:** P0 and P1.  
**Repository:** `rndrntwrk/milaidy`  
**Feature flag:** `ALICE_COGNITIVE_FABRIC_ENABLED=0` by default.

## Proposed file tree

```text
packages/agent/src/plugins/alice-cognitive-fabric/
├── index.ts
├── config.ts
├── types.ts
├── service.ts
├── query-envelope.ts
├── router.ts
├── retrieval-plan.ts
├── fusion.ts
├── critic.ts
├── evidence-packet.ts
├── provider.ts
├── actions.ts
├── receipts.ts
├── retrievers/
│   ├── types.ts
│   ├── canonical-records.ts
│   ├── documents.ts
│   ├── dossiers.ts
│   ├── corpus-graph.ts
│   ├── repository-graph.ts
│   ├── temporal.ts
│   ├── trajectories.ts
│   ├── procedures.ts
│   ├── personal-memory.ts
│   └── dynamic-state.ts
└── *.test.ts
```

## Task 1 — Add plugin configuration and contracts

**Files**
- `packages/agent/src/plugins/alice-cognitive-fabric/config.ts`
- `packages/agent/src/plugins/alice-cognitive-fabric/types.ts`
- `packages/agent/src/plugins/alice-cognitive-fabric/config.test.ts`

Environment:
```text
ALICE_COGNITIVE_FABRIC_ENABLED
ALICE_COGNITIVE_FABRIC_STRICT
ALICE_COGNITIVE_FABRIC_ROUTER
ALICE_COGNITIVE_FABRIC_CRITIC
ALICE_COGNITIVE_FABRIC_MAX_PACKET_TOKENS
ALICE_COGNITIVE_FABRIC_RECEIPTS
ALICE_COGNITIVE_FABRIC_DYNAMIC_STATE
ALICE_COGNITIVE_FABRIC_LEARNING
```

**RED**
- default is disabled;
- enabled fabric requires admitted corpus identity;
- unsupported router/critic versions fail;
- public process cannot request a broader projection;
- strict mode rejects missing index manifest.

**Commit**
```text
feat(alice-cognition): define fabric configuration contracts
```

## Task 2 — Register a regular awaited plugin

**Files**
- `packages/agent/src/plugins/alice-cognitive-fabric/index.ts`
- `packages/agent/src/runtime/plugin-collector.ts`
- `packages/agent/src/runtime/plugin-collector.alice-cognitive-fabric.test.ts`

Rules:
- load after `alice-corpus`;
- never add to `CORE_PLUGINS`;
- strict initialization failure must block runtime readiness;
- disabled plugin is inert and leaves no provider/action surface;
- plugin does not seed the corpus again.

**Commit**
```text
feat(alice-cognition): register the awaited fabric service
```

## Task 3 — Implement query envelope normalization

**Files**
- `query-envelope.ts`
- `query-envelope.test.ts`

Normalize:
- identity;
- projection;
- purpose;
- task;
- entities and aliases;
- time mode and freshness;
- environment/chain/network;
- consequence level;
- citation requirement;
- latency/token/cost budgets.

Hard reject:
- projection escalation;
- impossible time ranges;
- secret-bearing query metadata;
- an irreversible request without an explicit consequence classification.

## Task 4 — Implement deterministic routing v1

**Files**
- `router.ts`
- `router.test.ts`
- `evals/alice-cognitive-fabric/router-v1.jsonl`

Rules use:
- exact IDs and addresses;
- “current/latest/now”;
- “what changed/at time”;
- “depends on/impact/breaks”;
- “how do we/runbook/procedure”;
- “last time/previous attempt”;
- consequence level;
- entity type;
- request purpose.

Tests cover every query class and multi-label combinations.

No model classifier in v1.

## Task 5 — Implement retrieval plans

**Files**
- `retrieval-plan.ts`
- `retrieval-plan.test.ts`

Map query classes to bounded steps, dependencies, limits, depth, timeouts, and token budgets.

Example:
```text
CURRENT_STATE:
  1. exact canonical baseline
  2. dynamic adapter
  3. temporal reconciliation
  4. critic
```

The plan is serialized into the receipt before retrieval begins.

## Task 6 — Implement exact canonical retrieval

**Files**
- `retrievers/canonical-records.ts`
- `retrievers/canonical-records.test.ts`

Load only the projected exact-index artifact from the admitted index manifest.

Support:
- record ID;
- subject ID;
- aliases;
- contract/program/address;
- repository;
- approved exact phrase.

Hard filters occur before result return.

## Task 7 — Implement native hybrid document retrieval

**Files**
- `retrievers/documents.ts`
- `retrievers/documents.test.ts`

Create an adapter over the existing native Eliza document/knowledge service. Do not create a second vector database.

Requirements:
- hybrid or keyword fallback;
- projection-specific corpus metadata filters;
- source IDs and logical paths;
- bounded result and token count;
- no corpus text in routine logs;
- explicit error when native knowledge is unavailable.

## Task 8 — Implement dossier hierarchy retrieval

**Files**
- `retrievers/dossiers.ts`
- `retrievers/dossiers.test.ts`

Use derived cards and hierarchy manifests:
- choose entity/system/estate summary by query scope;
- expand only when critic requests;
- retain source record IDs;
- never treat summaries as canonical without their support set.

## Task 9 — Implement corpus graph retrieval

**Files**
- `retrievers/corpus-graph.ts`
- `retrievers/corpus-graph.test.ts`

Adapt the admitted `AliceCorpusGraphIndex`.

Support:
- search;
- neighborhood;
- path;
- impact;
- snapshot comparison.

Return direction-preserving path receipts and limitations.

## Task 10 — Implement repository graph references

**Files**
- `retrievers/repository-graph.ts`
- `retrievers/repository-graph.test.ts`

The first release may call a read-only graph service or return admitted graph artifact references. It must:
- pin repository and SHA;
- reject unaccepted graph snapshots;
- avoid inventing missing code topology;
- expose source coverage.

## Task 11 — Implement temporal retrieval

**Files**
- `retrievers/temporal.ts`
- `retrievers/temporal.test.ts`

Support:
- current effective record;
- historical record at T;
- supersession chain;
- conflicts;
- stale baseline;
- environment/network disambiguation.

## Task 12 — Implement trajectory and procedural retrieval

**Files**
- `retrievers/trajectories.ts`
- `retrievers/procedures.ts`
- tests

Trajectory results contain:
- objective;
- outcome;
- tools;
- evidence;
- failures;
- lessons;
- runtime/skill versions.

Procedure results contain:
- preconditions;
- steps;
- expected evidence;
- rollback;
- authority requirements.

Historical commands remain evidence, not instructions.

## Task 13 — Implement candidate normalization

**Files**
- `retrievers/types.ts`
- adapter tests

Every retriever returns `EvidenceCandidate` with:
- stable ID;
- projection;
- truth/review/authority fields;
- temporal fields;
- source handles;
- boundaries;
- component scores;
- conflict/supersession links.

## Task 14 — Implement fusion and transparent ranking

**Files**
- `fusion.ts`
- `fusion.test.ts`
- `config/ranking-v1.json`

Steps:
1. hard filters;
2. normalize component scores;
3. authority/review/freshness adjustments;
4. contradiction and stale penalties;
5. source diversity;
6. per-query-class result limits;
7. packet token budget.

Tests prove:
- exact identifiers outrank semantic near-matches;
- current verified data outranks stale plans for current queries;
- founder intent does not outrank chain state for on-chain facts;
- ten duplicate fragments do not crowd out independent sources;
- private candidates never enter public results.

## Task 15 — Implement rule critic v1

**Files**
- `critic.ts`
- `critic.test.ts`
- `config/critic-rules-v1.json`

Decisions:
- sufficient;
- expand;
- live source required;
- conflict;
- stale;
- unknown;
- access denied.

The critic checks material claim coverage and may request one bounded expansion round.

## Task 16 — Compile evidence packets

**Files**
- `evidence-packet.ts`
- `evidence-packet.test.ts`

Packet:
- is deterministic for identical inputs and indexes;
- contains source handles;
- preserves conflicts and unknowns;
- includes authority constraints;
- respects token budget;
- contains no denied source metadata;
- has a content digest.

## Task 17 — Add Eliza provider

**Files**
- `provider.ts`
- `provider.test.ts`
- plugin `index.ts`

The provider:
- runs only when the router requires retrieval;
- injects a concise packet;
- includes stable citation handles;
- never injects raw unrestricted source vault;
- marks inferred material;
- exposes packet ID to the response trajectory.

## Task 18 — Add read-only actions

**Files**
- `actions.ts`
- `actions.test.ts`

Actions:
```text
ALICE_CONTEXT_RESOLVE
ALICE_EVIDENCE_TRACE
ALICE_STATE_EXPLAIN
```

They are diagnostic and read-only. They cannot modify corpus, memory, policy, or action authority.

## Task 19 — Attach retrieval receipts to trajectories

**Files**
- `receipts.ts`
- `receipts.test.ts`
- the minimal trajectory integration adapter

Record:
- query class;
- plan;
- retriever timings;
- candidate counts;
- filters;
- critic;
- packet;
- costs;
- later outcome evaluator IDs.

## Task 20 — Evaluate and admit

Evaluation classes:
- no-retrieval;
- exact fact;
- global system explanation;
- current state fallback;
- graph impact;
- procedural;
- prior failure;
- conflict;
- public access;
- consequence plan.

Admission requires:
- focused tests;
- package typecheck/build;
- deterministic packet tests;
- zero projection leaks;
- citation precision;
- bounded latency;
- explicit unknown behavior;
- rollback by disabling the plugin.
