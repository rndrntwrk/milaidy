# RNDRNTWRK Cognitive Fabric Design Specification

**Status:** proposed architecture; implementation must remain behind admission gates  
**Date:** 22 August 2026  
**Repository:** `rndrntwrk/milaidy`  
**Stacked dependency:** `feat/alice-corpus-runtime-binding-2026-08-22` / PR #212  
**Dependency head observed during design:** `ed11ff39bdce7fa0ca899fe745d4fb7b883b48eb`  
**Production base:** `release/alice-production-core-2026-08-22`  
**Primary runtime:** the canonical Eliza `AgentRuntime` inside Milaidy  
**Corpus:** `ALICE_CORPUS_MASTER_v1.0.1` and later admitted releases  

## 1. Executive decision

The Alice corpus must not become a second brain, a second policy system, or a large prompt appendix. It must become the governed long-term cognitive substrate used by the one canonical Alice cognitive runtime.

The RNDRNTWRK Cognitive Fabric joins:

1. immutable and reviewable semantic truth;
2. physically isolated visibility projections;
3. live, bitemporal world-state observations;
4. graph and code-topology reasoning;
5. native document and exact-record retrieval;
6. episodic trajectories and receipts;
7. procedural skills and runbooks;
8. personal and social memory;
9. adaptive context compilation;
10. evidence criticism, citations, and explicit unknowns;
11. independent action authority;
12. governed learning from successful and failed outcomes.

The system is complete only when Alice can compile the right evidence for the right identity, purpose, time horizon, and consequence level; reason over it; act only through independent authorization; preserve a durable receipt; and improve without corrupting canonical truth.

## 2. Existing estate

### 2.1 Cognitive runtime

The canonical cognitive loop remains Eliza inside Milaidy. The runtime already exposes the necessary primitive surfaces:

- providers and model routing;
- actions and evaluators;
- services;
- native `documents` and `knowledge` memories;
- embeddings;
- trajectories;
- relationship and preference memory;
- advanced-capability plugins such as experience, todos, and personality;
- skill execution and skill proposal/refinement;
- bounded tools and policy;
- optional planning and orchestration.

The Cognitive Fabric must integrate with these surfaces rather than create a parallel agent runtime.

### 2.2 Corpus binding

PR #212 establishes the first runtime binding:

- one explicit physical projection;
- checksum and manifest validation;
- native Eliza document/knowledge seeding;
- projection-safe graph actions;
- persisted-row reconciliation and purge behavior;
- external immutable corpus mount;
- no action authority from corpus content.

The Cognitive Fabric is stacked after that admission. It must not be merged around or ahead of an unadmitted corpus substrate.

### 2.3 Corpus estate

The current corpus contains atomic records, dossiers, sources, graph data, visibility projections, dynamic-feed definitions, import formats, and evaluation sets. Its strongest properties are:

- source-backed records;
- explicit truth and maturity classes;
- counterclaims and boundaries;
- physical projection separation;
- an explicit `UNKNOWN` state;
- graph provenance;
- portable canonical formats;
- evaluation fixtures.

Its current weaknesses are:

- incomplete bitemporal representation;
- weak supersession and contradiction links;
- over-broad free-text canonicality values;
- a memory-seed taxonomy not yet operational in runtime;
- mostly evidence-oriented graph edges rather than a complete associative world model;
- dynamic-feed specifications without live adapters;
- structural evaluations without full runtime answer-quality evidence.

## 3. Goals

The Cognitive Fabric must:

1. produce a typed evidence packet for every corpus-informed answer, plan, or decision;
2. select retrieval depth adaptively rather than retrieving for every request;
3. combine exact records, native hybrid documents, graph paths, hierarchical summaries, trajectories, procedures, and live adapters;
4. preserve temporal truth, source authority, projection, and claim permission;
5. route volatile questions to live sources;
6. preserve conflicts and unknowns instead of forcing a single answer;
7. expose citations and evidence traces in user-visible and machine-readable forms;
8. record retrieval and context decisions inside trajectories;
9. convert outcomes into reviewable memory, fact, lesson, or skill candidates;
10. provide one shared typed service to authorized RNDRNTWRK identities and products;
11. remain rebuildable, auditable, and independent from any one embedding model;
12. keep knowledge separate from action authorization.

## 4. Non-goals

The first implementation does not:

- fine-tune a foundation model on the complete corpus;
- allow model output to write directly into canonical truth;
- put public and private material in one vector index;
- use Cloudflare as a second cognitive loop;
- replace Eliza memory with a new database;
- treat the graph as a source of financial, deployment, identity, or chain truth;
- give Alice permission to deploy, transfer funds, message people, trade, or change policy merely because a procedure is retrievable;
- make every dynamic adapter a P0 dependency;
- claim that advanced planning or advanced memory is production-enabled without runtime evidence;
- place secret values, private keys, passwords, or unrestricted tokens in corpus records.

## 5. Non-negotiable invariants

### I-01 — one cognitive loop

Eliza remains the canonical reasoning and action-selection runtime. The fabric supplies context, evidence, memory, and evaluation.

### I-02 — physical projection isolation

Public, internal, diligence, restricted-security, and owner-private data are materialized as separate runtime mounts and separate indexes. Projection is not a response-time filter.

### I-03 — immutable semantic ledger

Canonical corpus releases are content-addressed, versioned, and append-only through signed deltas. Models cannot edit them in place.

### I-04 — dynamic state is not corpus truth

Volatile facts are stored as timestamped observations with authority, freshness, reconciliation, and uncertainty. A new observation does not erase history.

### I-05 — knowledge never grants authority

Retrieved text, a graph path, a prior command, or a procedure cannot authorize a consequential action.

### I-06 — evidence before confidence

Material claims require source handles, temporal status, and the applicable boundary. Insufficient evidence yields `UNKNOWN`, `STALE`, or `CONFLICT`.

### I-07 — derived indexes are disposable

Embeddings, BM25 indexes, late-interaction indexes, graph communities, summaries, and reranking features are rebuildable from admitted records and sources.

### I-08 — no silent memory promotion

Experiences, reflections, inferred preferences, facts, and skills enter a staging lane before becoming durable canonical or procedural memory.

### I-09 — retrieval is observable

Every retrieval plan, candidate set, critic decision, adapter call, packet, and omission is attached to the trajectory or request receipt.

### I-10 — source authority is question-specific

Founder decisions govern intent; repositories govern source; chain state governs on-chain facts; accounting governs financial facts; current role readbacks govern authority; signed snapshots govern published historical claims.

## 6. System architecture

```text
request / event
      |
      v
CognitiveQueryEnvelope
      |
      v
Context Router
  |      |      |      |      |      |
  |      |      |      |      |      +--> no retrieval
  |      |      |      |      +---------> procedural / skills
  |      |      |      +----------------> episodic / trajectories
  |      |      +-----------------------> graph / impact / code topology
  |      +------------------------------> dynamic world-state adapters
  +-------------------------------------> semantic corpus and documents
      |
      v
candidate normalization
      |
      v
hard policy and projection filters
      |
      v
fusion + reranking + diversity
      |
      v
retrieval critic
      |             \
      | sufficient   \ insufficient / stale / conflict
      v               v
EvidencePacket      expand retrieval / adapter / UNKNOWN
      |
      +--> Eliza provider context
      +--> planner context
      +--> report / Talk to Alice
      +--> verifier
      |
      v
reason / answer / plan
      |
      v
independent authority membrane
      |
      v
action or response + durable receipt
      |
      v
trajectory / reflection / learning candidate
```

## 7. Core components

### 7.1 Corpus Admission Layer

**Owner:** `packages/agent/src/plugins/alice-corpus`

Responsibilities:

- validate the selected projection;
- verify checksum coverage;
- validate record, node, and edge schemas;
- seed native Eliza document and knowledge memories;
- expose corpus identity and projection-safe graph state;
- purge or reconcile stale projected rows;
- retain no unnecessary full in-memory copy after seeding;
- emit an admission receipt.

It does not decide retrieval strategy.

### 7.2 Cognitive Fabric Service

**Proposed path:** `packages/agent/src/plugins/alice-cognitive-fabric`

Responsibilities:

- normalize the request into a `CognitiveQueryEnvelope`;
- select retrieval modes and budgets;
- execute retrievers;
- apply hard filters;
- fuse and rerank candidates;
- run evidence criticism;
- compile an `EvidencePacket`;
- expose a provider for normal reasoning;
- expose read-only introspection actions;
- attach the retrieval receipt to trajectories.

It loads as a regular awaited plugin and remains default-off until admitted.

### 7.3 Canonical Semantic Ledger

The admitted corpus projection remains the semantic ledger. Runtime persistence stores retrieval documents and fragments, not a mutable replacement for the corpus release.

The ledger carries:

- stable record ID;
- truth class;
- authority class;
- review state;
- source references;
- claim permission;
- current or historical validity;
- counterclaim or boundary;
- projection;
- refresh trigger.

### 7.4 Derived Cognitive Indexes

Per projection, build:

- exact record and alias lookup;
- BM25;
- dense embedding index;
- optional late-interaction reranker;
- graph adjacency and propagation features;
- hierarchical dossier summaries;
- graph community summaries;
- temporal index;
- procedure and skill index;
- trajectory and lesson index.

No index may contain records outside its physical projection.

### 7.5 Dynamic World State

Dynamic observations answer present-state questions without mutating the sealed corpus.

Initial domains:

1. GitHub repository, branch, commit, CI, release, and PR state;
2. Solana and EVM chain state;
3. contract code, roles, and deployment state;
4. wallet and treasury state;
5. market, liquidity, and trading state;
6. company accounting and runway;
7. product, user, creator, and settlement telemetry;
8. partner, opportunity, and social state;
9. Cloudflare, Railway, Modal, AWS, and service health.

Each adapter writes observations and receipts, never unrestricted source secrets.

### 7.6 Episodic Receipt Store

Trajectories, conversations, plans, tool calls, test runs, approvals, incidents, and deployment evidence answer: “what happened?”

Episodic records are not canonical facts by default. They may support a later candidate.

### 7.7 Procedural Memory

Procedural memory contains admitted:

- skills;
- runbooks;
- plan templates;
- tool preconditions;
- retry policies;
- rollback procedures;
- known failure signatures;
- evidence expectations.

The existing trajectory-to-skill and skill-refinement mechanisms become candidate producers, not direct canonical writers.

### 7.8 Personal and Social Memory

Identity-scoped memory contains:

- explicit founder preferences;
- communication and design rules;
- relationship history;
- commitments;
- trust boundaries;
- interaction-specific context.

Explicit statements outrank inferred behavior. Private relationship memory is never present in public projections.

### 7.9 Context Router

The deterministic first release classifies requests into one or more query classes:

| Query class | Default retrieval behavior |
|---|---|
| `NO_RETRIEVAL` | Use current conversation and runtime state only |
| `EXACT_FACT` | Exact record/alias lookup, then canonical source |
| `LOCAL_EXPLANATION` | Records + dossier + local graph neighborhood |
| `GLOBAL_SYNTHESIS` | Hierarchical summaries + graph communities + dossiers |
| `TEMPORAL_HISTORY` | Temporal index + historical snapshots + supersession chain |
| `CURRENT_STATE` | Dynamic adapter + latest admitted baseline |
| `GRAPH_IMPACT` | Graph path/impact + code graph references |
| `PROCEDURAL` | Skills/runbooks + constraints + prior outcomes |
| `EPISODIC` | Trajectories, receipts, prior attempts, lessons |
| `CONSEQUENTIAL_PLAN` | All relevant stable, dynamic, procedural, risk, and authority context |
| `SOCIAL_PERSONAL` | Identity-scoped relationship/preference memory |
| `CONFLICT_CHECK` | Competing records, source authorities, temporal reconciliation |

A later learned classifier may replace the deterministic baseline only after it outperforms it on a pinned evaluation set.

### 7.10 Candidate Retrievers

All retrievers implement one typed contract and return normalized candidates.

Required retrievers:

- `CanonicalRecordRetriever`
- `NativeDocumentRetriever`
- `DossierHierarchyRetriever`
- `CorpusGraphRetriever`
- `RepositoryGraphRetriever`
- `TemporalRetriever`
- `DynamicStateRetriever`
- `TrajectoryRetriever`
- `ProcedureSkillRetriever`
- `PersonalMemoryRetriever`

### 7.11 Fusion and Reranking

Hard filters execute before scoring:

- physical projection;
- identity and purpose;
- claim permission;
- effective time;
- environment, chain, and network;
- review/admission state;
- secret and privacy policy;
- action-versus-knowledge boundary.

Initial transparent score:

```text
score =
  semantic_or_lexical_relevance
+ exact_identifier_bonus
+ source_authority
+ evidence_strength
+ review_state
+ temporal_fit
+ freshness
+ graph_support
+ task_affinity
- contradiction_penalty
- stale_penalty
- unsupported_inference_penalty
```

Weights are configuration, logged with the request receipt, and evaluated by query class. No opaque learned ranker is admitted before the transparent baseline is measured.

The packet must preserve source diversity. Ten fragments repeating one source are not ten independent pieces of evidence.

### 7.12 Retrieval Critic

The critic returns:

- `SUFFICIENT`
- `EXPAND`
- `LIVE_SOURCE_REQUIRED`
- `CONFLICT`
- `STALE`
- `UNKNOWN`
- `ACCESS_DENIED`

Checks include:

- relevance;
- source authority;
- evidence sufficiency;
- freshness;
- temporal consistency;
- contradiction;
- citation coverage;
- visibility;
- consequence level;
- whether an adapter must be called;
- whether a material claim should be omitted.

The first critic is rule-based. Model-assisted criticism may supplement it but cannot override hard policy.

### 7.13 Evidence Packet

The model, planner, report, or verifier receives a compiled packet rather than unstructured chunks.

An `EvidencePacket` contains:

- packet ID;
- request identity and projection;
- corpus version and digest;
- query class and retrieval plan;
- claims and candidate evidence;
- citations/source anchors;
- graph paths with direction;
- dynamic observations and freshness;
- applicable policies;
- boundaries and counterclaims;
- conflicts and supersession;
- unknowns and gaps;
- prior related outcomes;
- procedures and preconditions;
- authority constraints;
- packet token budget;
- receipt references.

### 7.14 Provider and Planner Integration

A Cognitive Fabric provider injects the evidence packet into Eliza state only when retrieval is required.

The planner receives:

- objective;
- verified current state;
- assumptions;
- constraints;
- relevant procedures;
- prior failures;
- required approvals;
- evidence requirements;
- rollback conditions.

A plan generated without required evidence is marked provisional.

### 7.15 Authority Membrane

Consequential actions require an independent action envelope:

- active Alice identity;
- standing programme;
- capability;
- target environment;
- budget;
- expiry;
- approval state;
- replay protection;
- policy decision;
- operator or signer where required.

The fabric may inform the action envelope but cannot create one from retrieved text.

## 8. Typed contracts

The canonical TypeScript reference is stored beside this specification in:

`docs/superpowers/specs/2026-08-22-rndrntwrk-cognitive-fabric-types.ts`

Key types:

- `CognitiveQueryEnvelope`
- `RetrievalMode`
- `RetrievalPlan`
- `EvidenceCandidate`
- `EvidencePacket`
- `EvidenceClaim`
- `DynamicObservation`
- `MemoryCandidate`
- `PromotionDecision`
- `CognitiveFabricReceipt`

The interfaces are a design contract. Runtime implementation may split files, but must preserve semantics and version them.

## 9. Bitemporal truth model

Every volatile or replaceable record needs:

```text
observed_at        — when the system saw the evidence
effective_from     — when the fact became true
effective_to       — when it stopped being true
ingested_at        — when it entered the fabric
source_timestamp   — timestamp reported by the authority
reconciled_at      — when competing authorities were reconciled
supersedes         — previous record or observation
superseded_by      — replacing record
contradicts        — unresolved competing record
reconciles         — records explained by this observation
environment        — production, staging, test, local
chain/network      — where applicable
fresh_until        — freshness deadline
stale_reason       — why it can no longer support a current claim
```

The system must support both:

- “What is true now?”
- “What did we believe or observe at time T?”

## 10. Graph architecture

### 10.1 Estate graph

The corpus graph remains the semantic/evidence graph for systems, contracts, deployments, authorities, decisions, claims, sources, risks, and gaps.

### 10.2 Sovereign repository graphs

Each complete repository graph is pinned to:

- owner/repository;
- branch;
- commit;
- tree hash;
- Graphify version;
- corpus contract;
- review decision;
- graph digest.

No source internals are fabricated for repositories lacking an admitted graph.

### 10.3 Derived graph products

Per projection and snapshot, derive:

- entity communities;
- system communities;
- dependency neighborhoods;
- authority neighborhoods;
- economic-flow neighborhoods;
- change-impact neighborhoods;
- temporal deltas;
- conflict and supersession paths;
- recursive community summaries.

Graph-derived summaries remain rebuildable evidence aids, not canonical source.

### 10.4 Graph traversal receipt

Every path result includes:

- path nodes;
- edges;
- traversal direction;
- snapshot;
- projection;
- source anchors;
- filters;
- depth and fan-out limits;
- omitted-edge count;
- limitations.

## 11. Storage topology

### 11.1 Immutable object storage

Cloudflare R2 or equivalent stores:

- sealed corpus ZIPs;
- physical projection mounts;
- source-vault objects;
- graph artifacts;
- derived index releases;
- evaluation packs;
- signed receipts.

Mounts are read-only in runtime.

### 11.2 Eliza persistence

Native Eliza storage remains authoritative for:

- runtime documents;
- knowledge fragments;
- conversations;
- memories;
- trajectories;
- action and evaluator artifacts.

### 11.3 Postgres cognitive metadata

A normalized Postgres store contains:

- dynamic observations;
- adapter registry;
- evidence packets;
- retrieval receipts;
- temporal links;
- promotion candidates;
- review decisions;
- evaluation results;
- graph snapshot metadata;
- index manifests.

It does not become the authority for chain, bank, repository, or deployment truth.

### 11.4 Cloudflare

Cloudflare provides the durable control membrane:

- Access and identity enforcement;
- API gateway;
- rate limiting;
- Workers routing;
- Queues for adapter refresh and consolidation;
- Workflows for multi-step refresh/evaluation;
- Durable Objects for bounded coordination and leases;
- R2 for immutable artifacts;
- AI Gateway for model telemetry and budget controls.

Cloudflare does not run a separate cognitive loop.

### 11.5 Modal

Modal handles bounded burst workloads:

- index builds;
- late-interaction indexing;
- graph community detection;
- offline evaluation;
- corpus normalization;
- large source extraction;
- batch embeddings;
- simulation and replay.

Every job produces content-addressed artifacts and a receipt.

### 11.6 Milaidy runtime host

The long-lived Eliza/Milaidy runtime may operate in the admitted container platform. It consumes:

- one projected mount;
- one database;
- the Cognitive Fabric service;
- authorized dynamic adapters;
- no unrestricted corpus root.

## 12. Service API

The shared internal service exposes:

```text
POST /v1/context/resolve
POST /v1/evidence/trace
POST /v1/graph/search
POST /v1/graph/path
POST /v1/graph/impact
POST /v1/graph/compare
POST /v1/state/current
POST /v1/state/history
POST /v1/memory/recall
POST /v1/memory/propose
POST /v1/memory/promote
POST /v1/skill/match
POST /v1/lesson/recall
POST /v1/gap/create
POST /v1/eval/record
```

The local plugin may call the service contract in-process. Remote identities call it through authenticated service bindings. Every call includes identity, projection, purpose, consequence level, and request ID.

## 13. Learning and consolidation

```text
experience or action
  -> trajectory and receipt
  -> outcome evaluation
  -> reflection
  -> candidate fact / observation / preference / lesson / procedure / skill
  -> entity, temporal, privacy, provenance, conflict, and duplication checks
  -> staging
  -> role-appropriate review
  -> accepted dynamic observation, signed corpus delta, or skill release
  -> regression evaluation
```

### Candidate classes

- `FACT_CANDIDATE`
- `OBSERVATION_CANDIDATE`
- `PREFERENCE_CANDIDATE`
- `RELATIONSHIP_CANDIDATE`
- `LESSON_CANDIDATE`
- `PROCEDURE_CANDIDATE`
- `SKILL_CANDIDATE`
- `RETRACTION_CANDIDATE`
- `GAP_CANDIDATE`

### Promotion authority

| Candidate | Minimum promotion authority |
|---|---|
| Founder preference | Explicit founder statement or approved inference review |
| System fact | Primary system evidence plus verifier |
| Dynamic observation | Adapter receipt and schema validation |
| Public claim | Evidence plus communications/claims approval |
| Procedure | Successful evidence or reviewed failure lesson |
| Skill | Reproducible trajectory plus safety and regression tests |
| Security fact | Restricted verifier or designated security reviewer |
| Financial fact | Reconciled accounting close |
| On-chain fact | Finalized chain observation and policy classification |

## 14. Identity-specific use

| Identity | Default projection | Primary retrieval surfaces |
|---|---|---|
| `alice.public` | public | approved claims, public sources, product explanations |
| `alice.core` | internal | whole-estate context, strategy, coordination |
| `alice.research` | internal/diligence | sources, contradictions, gaps, external evidence |
| `alice.verifier` | restricted-security | evidence, temporal validity, access, conflicts |
| `alice.coder` | internal | code graphs, repositories, prior fixes, procedures |
| `alice.sre` | restricted-security | deployments, incidents, runbooks, rollback |
| `alice.trader` | internal | policy plus live market/chain state |
| `alice.identity` | restricted-security | 555ID, issuers, roles, trust |
| `alice.stream` | internal | media, creator operations, brand, procedures |
| `alice.social` | owner-private/internal | relationships, commitments, approved voice |

These are bounded identities over one cognitive architecture, not independent minds.

## 15. Security model

### 15.1 Projection boundary

Projection is selected before process start. A public process cannot switch to internal data at runtime.

### 15.2 Secrets

Corpus and fabric records may contain secret references, never values. Secret use remains in Renclave, KMS, vault, or the designated secret manager.

### 15.3 Prompt injection

Retrieved source content is data. It cannot override system policy, activate tools, or authorize an action.

### 15.4 Retrieval denial

The router and retrievers return `ACCESS_DENIED` without revealing the existence, title, count, or identifiers of unavailable private material.

### 15.5 Logging

Logs contain stable IDs, counts, timings, scores, and digests. They do not contain private dossier filenames, source text, relationship details, credentials, or full prompts unless a restricted evidence policy explicitly permits it.

### 15.6 Deletion and revocation

Projection disablement purges or quarantines persisted derived knowledge. Canonical source deletion follows legal and policy requirements, while immutable evidence references may be replaced with tombstones where necessary.

## 16. Observability

Every context resolution emits a `CognitiveFabricReceipt`:

- request ID;
- runtime SHA;
- corpus version and digest;
- projection;
- query class;
- retrieval plan;
- retriever timings;
- candidate counts;
- filters and exclusions;
- critic result;
- packet ID;
- citations;
- dynamic adapter receipts;
- token and cost use;
- answer or plan outcome;
- later evaluator outcome.

No sensitive text is required for routine telemetry.

## 17. Evaluation

### 17.1 Retrieval

- Recall@k;
- MRR;
- nDCG;
- exact identifier recall;
- source diversity;
- graph path correctness;
- hierarchical/global synthesis quality.

### 17.2 Truth

- citation precision;
- unsupported-claim rate;
- temporal accuracy;
- stale-state detection;
- conflict preservation;
- correct `UNKNOWN`;
- claim-permission compliance.

### 17.3 Privacy and authority

- zero cross-projection leakage;
- zero secret-value exposure;
- zero knowledge-to-authority crossover;
- correct purpose and identity gating;
- rollback and purge correctness.

### 17.4 Operational utility

- plan success rate;
- action-selection accuracy;
- skill reuse;
- failure-recurrence reduction;
- evidence completeness;
- latency;
- model and infrastructure cost.

### 17.5 Long-term memory

- multi-session recall;
- update and supersession correctness;
- preference authority;
- relationship continuity;
- abstention when evidence is absent.

All evaluation reports pin:

- runtime SHA;
- corpus digest;
- projection;
- model;
- embedding model;
- retrieval configuration;
- graph snapshot;
- dynamic adapter versions;
- evaluation set version.

## 18. Deployment sequence

### P0 — admit corpus binding

Resolve PR #212 code, CI, clean-database, projection, rollback, and adversarial gates.

### P1 — cognition-ready corpus

Normalize metadata and temporal fields; operationalize memory classes; generate derived cards and projection-specific index manifests.

### P2 — adaptive context compiler

Implement router, retrievers, fusion, critic, evidence packet, provider, receipts, and query-class evaluations.

### P3 — dynamic world state

Add adapter registry, temporal observation store, GitHub adapter, chain/deployment adapters, then financial and product sources.

### P4 — governed learning

Connect trajectories and reflections to staged memory, procedure, and skill candidates with review and signed promotion.

### P5 — estate-wide integration

Expose the fabric to CTRL, report/Talk to Alice, coder, SRE, identity, stream, social, market, and research identities through typed, audited access.

## 19. Initial configuration

```text
ALICE_COGNITIVE_FABRIC_ENABLED=0
ALICE_COGNITIVE_FABRIC_STRICT=1
ALICE_COGNITIVE_FABRIC_ROUTER=deterministic-v1
ALICE_COGNITIVE_FABRIC_CRITIC=rules-v1
ALICE_COGNITIVE_FABRIC_MAX_PACKET_TOKENS=12000
ALICE_COGNITIVE_FABRIC_DYNAMIC_STATE=0
ALICE_COGNITIVE_FABRIC_LEARNING=0
ALICE_COGNITIVE_FABRIC_RECEIPTS=1
```

Each phase enables only the admitted capability.

## 20. Architectural decisions

1. Keep corpus admission and cognitive routing as separate plugins.
2. Use native Eliza documents/knowledge rather than a second vector store.
3. Use a separate projection-safe metadata/index release for exact and temporal lookup.
4. Keep dynamic world state append-only and bitemporal.
5. Begin with deterministic routing and rule-based criticism.
6. Record retrieval receipts in trajectories before adding learned routing.
7. Use the graph as an associative and impact surface, not sovereign truth.
8. Keep Cloudflare as control membrane and Modal as bounded batch compute.
9. Require review for durable learning promotion.
10. Do not fine-tune on volatile estate truth during the first implementation.

## 21. Open decisions

The implementation must close these explicitly:

- canonical Postgres schema owner and migration location;
- whether the Cognitive Fabric service remains in-process initially or is exposed immediately as a separate service;
- the first admitted embedding model;
- whether late-interaction reranking is justified by evaluation;
- the exact repository graph access protocol;
- the signer and release process for corpus deltas;
- which identity may approve each promotion class;
- the first dynamic adapters admitted after GitHub;
- the exact production runtime host and database separation for public/internal Alice.

No open decision is filled with an implicit default.
