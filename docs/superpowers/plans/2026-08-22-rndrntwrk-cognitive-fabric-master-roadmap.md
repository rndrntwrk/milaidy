# RNDRNTWRK Cognitive Fabric Master Roadmap

**Status:** executable programme plan  
**Stacked on:** Alice corpus runtime binding PR #212  
**Implementation rule:** no later phase may conceal or bypass an earlier admission failure.

## Programme outcome

Deliver a projection-safe, evidence-driven cognitive substrate that allows Alice and authorized RNDRNTWRK identities to:

- resolve the right context;
- explain and cite stable truth;
- query current world state;
- reason across the graph;
- remember prior outcomes;
- match and improve procedures;
- plan with explicit constraints;
- preserve unknowns and conflicts;
- act only through independent authorization;
- learn through reviewed promotion.

## Current baseline

At the observed PR #212 head:

- the corpus lifecycle is a regular awaited plugin;
- persisted corpus knowledge can be purged when the mount is disabled;
- runtime state retains identity and graph rather than the complete corpus text;
- focused isolated tests pass;
- CI remains red because formatting/lint fails and the exact release-runtime workspace setup does not complete;
- two review threads remain active and seven older findings are outdated but require verified closure;
- no production admission or deployment is claimed.

## Phase dependency graph

```text
P0 corpus admission
 |
 v
P1 cognition-ready corpus and indexes
 |
 v
P2 adaptive context compiler
 | \
 |  \--> P3 dynamic world state
 |        |
 v        v
P4 governed learning
 |
 v
P5 estate-wide integration
```

P3 can begin adapter scaffolding after P2 contracts are frozen, but live state must not enter production context before P2 evidence packets and criticism are admitted.

## Workstreams

| ID | Workstream | Primary repository | Exit state |
|---|---|---|---|
| P0 | Corpus runtime admission | `rndrntwrk/milaidy` | PR #212 green, reviewed, clean-start verified |
| P1 | Cognition-ready corpus | corpus build pipeline + Milaidy verifier | corpus v1.1 with normalized temporal and memory records |
| P2 | Context compiler | `rndrntwrk/milaidy` | adaptive evidence packet available to Eliza |
| P3 | Dynamic world state | Milaidy + CTRL/cloud adapters | current-state queries use reconciled observations |
| P4 | Governed learning | Milaidy/Eliza + corpus pipeline | reviewed experience-to-memory/skill promotion |
| P5 | Estate integration | Milaidy, CTRL, report, cloud | shared typed fabric used across authorized identities |

## Release units

### Release CF-0 — Corpus Admission

- PR #212 merged only after all admission gates;
- public and internal clean-database startups;
- sealed mount verification;
- projection isolation;
- rollback/purge;
- action-authority adversarial tests;
- exact runtime SHA and receipt.

### Release CF-1 — Corpus v1.1

- normalized canonicality;
- bitemporal fields;
- conflict and supersession links;
- memory wrappers;
- derived cards;
- projection-specific index manifest;
- migration and rebuild evidence.

### Release CF-2 — Context Compiler v1

- deterministic router;
- exact record lookup;
- native hybrid document retrieval;
- corpus graph retrieval;
- evidence fusion;
- rule critic;
- evidence packet;
- Eliza provider;
- retrieval receipts;
- pinned evaluation.

### Release CF-3 — Live State v1

- GitHub adapter;
- bitemporal observation store;
- freshness and conflict handling;
- chain/deployment adapters;
- report-compatible current-state API;
- adapter receipts.

### Release CF-4 — Learning v1

- trajectory lesson extraction;
- memory and skill candidates;
- staging and review;
- signed promotion;
- regression evaluation;
- no direct model-to-canonical write.

### Release CF-5 — Shared Cognitive Fabric

- CTRL and report integration;
- bounded identities;
- Cloudflare gateway and artifact flow;
- Modal build/evaluation jobs;
- operational dashboards;
- canary and rollback.

## Cross-phase acceptance rules

1. Every release is pinned to runtime SHA, corpus digest, projection, model, embedding model, graph snapshot, and evaluation set.
2. Public and internal identities never share a database or derived index.
3. No dynamic adapter enters a packet without a freshness and source-authority policy.
4. No model output becomes durable memory without a candidate and review decision.
5. No context packet creates action permission.
6. Every material claim in an evaluated answer has a resolvable source handle.
7. A failing source or adapter degrades the affected claim to `STALE`, `CONFLICT`, or `UNKNOWN`.
8. Rollback is tested before production promotion.
9. No phase is declared complete from unit tests alone.
10. The programme retains one active implementation lane per dependency boundary.

## Suggested branch and PR sequence

```text
feat/alice-corpus-runtime-binding-2026-08-22         # existing PR #212
feat/alice-corpus-cognition-readiness-2026-08-23     # P1
feat/alice-cognitive-context-compiler-2026-08-23     # P2
feat/alice-dynamic-world-state-github-2026-08-24     # first P3 adapter
feat/alice-governed-memory-promotion-2026-08-25      # P4
feat/alice-cognitive-fabric-gateway-2026-08-26       # P5
```

Each branch is stacked only when its base has passed the required local and CI gates.

## Programme evidence directory

Every release should emit:

```text
artifacts/alice-cognitive-fabric/<release-id>/
├── manifest.json
├── runtime.json
├── corpus.json
├── projection.json
├── retrieval-config.json
├── graph.json
├── dynamic-adapters.json
├── test-results.json
├── evaluation-results.json
├── privacy-results.json
├── authority-results.json
├── performance-results.json
├── rollback-results.json
├── source-handles.jsonl
└── SHA256SUMS.txt
```

## Operational scorecard

| Area | Required production signal |
|---|---|
| Truth | unsupported material claim rate below the approved threshold |
| Citations | resolvable citation on every material factual claim |
| Temporal | current-state accuracy and stale detection |
| Privacy | zero cross-projection retrieval |
| Authority | zero knowledge-to-action authorization crossover |
| Graph | directionally correct paths and impact results |
| Retrieval | query-class target Recall@k/MRR/nDCG |
| Learning | zero unreviewed canonical promotion |
| Reliability | bounded latency and deterministic fail behavior |
| Cost | per-request and per-adapter budget enforcement |
| Rollback | complete projected knowledge and service rollback |

## Immediate execution order

1. Complete P0, including CI and review-thread closure.
2. Freeze corpus v1.1 schema before writing the context compiler.
3. Implement the deterministic context compiler on static corpus data.
4. Admit GitHub as the first dynamic adapter.
5. Add chain and deployment state.
6. Connect trajectories to staged learning.
7. Integrate public report and internal CTRL only after projection and authority evaluations pass.
