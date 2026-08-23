# P1 Plan — Make the Corpus Cognition-Ready

**Goal:** produce `ALICE_CORPUS_MASTER_v1.1` with normalized authority, bitemporal truth, operational memory classes, derived cards, and projection-specific index manifests.  
**Dependency:** P0 admitted.  
**Primary implementation surfaces:** corpus build pipeline and `packages/agent/src/plugins/alice-corpus`.

## Task 1 — Freeze schema v1.1

**New files**
- `schemas/corpus-record-v1.1.schema.json`
- `schemas/memory-record-v1.1.schema.json`
- `schemas/dynamic-observation-v1.schema.json`
- `schemas/index-manifest-v1.schema.json`
- `schemas/promotion-candidate-v1.schema.json`

**Required corpus fields**
```text
canonicality_state
lineage_status
verification_requirements[]
operator_notes[]
observed_at
effective_from
effective_to
ingested_at
fresh_until
supersedes[]
superseded_by[]
contradicts[]
reconciles[]
environment
chain
network
review_state
promotion_state
```

Keep original free-text fields as preserved evidence, but stop using them as enums.

**Tests**
- every current v1.0.1 record migrates;
- no required field is silently invented;
- absent temporal endpoints remain explicit nulls;
- invalid enum values fail;
- source references remain resolvable.

## Task 2 — Build deterministic migration

**New files**
- `scripts/alice-corpus/migrate-v1.0.1-to-v1.1.ts`
- `scripts/alice-corpus/migration-rules/canonicality.ts`
- `scripts/alice-corpus/migration-rules/temporal.ts`
- `scripts/alice-corpus/migration-rules/memory-class.ts`
- `scripts/alice-corpus/migration-rules/conflicts.ts`
- `scripts/alice-corpus/migrate-v1.0.1-to-v1.1.test.ts`

**Rules**
1. Map known clean canonicality values to governed enums.
2. Move instructions such as lineage fingerprinting into `verification_requirements`.
3. Preserve unrecognized strings in `operator_notes` and set state `UNRESOLVED`.
4. Infer no `effective_to`.
5. Generate explicit review candidates for ambiguous supersession or conflict.
6. Preserve record IDs unless semantics changed.
7. Emit a migration receipt per record.

**Verification**
```bash
bun scripts/alice-corpus/migrate-v1.0.1-to-v1.1.ts \
  --input /sealed/ALICE_CORPUS_MASTER_v1.0.1 \
  --output /tmp/alice-corpus-v1.1
```

Run twice and compare tree hashes.

## Task 3 — Operationalize memory wrappers

The memory seed must not be a copy of canonical records.

**New files**
- `scripts/alice-corpus/build-memory-seeds.ts`
- `schemas/memory-record-v1.1.schema.json`
- `scripts/alice-corpus/build-memory-seeds.test.ts`

A memory wrapper contains:
```text
memory_id
memory_class
source_record_id
promotion_state
intended_contexts[]
allowed_identities[]
task_affinities[]
temporal_behavior
retrieval_weight
```

Required classes:
- semantic;
- procedural;
- historical-episodic;
- voice;
- social-personal;
- policy-boundary.

**Tests**
- every wrapper points to one canonical record;
- no canonical record is duplicated as a wrapper payload;
- public wrappers reference public records only;
- voice and private relationship wrappers never enter public output;
- procedural records are not automatically executable.

## Task 4 — Generate claim and entity cards

**New files**
- `scripts/alice-corpus/build-derived-cards.ts`
- `scripts/alice-corpus/cards/claim-card.ts`
- `scripts/alice-corpus/cards/entity-card.ts`
- `scripts/alice-corpus/cards/system-card.ts`
- `scripts/alice-corpus/cards/repository-card.ts`
- `scripts/alice-corpus/cards/deployment-card.ts`
- `scripts/alice-corpus/cards/conflict-bundle.ts`
- `scripts/alice-corpus/cards/timeline-card.ts`
- `scripts/alice-corpus/build-derived-cards.test.ts`

Each card:
- cites source record IDs;
- contains no new canonical fact;
- includes validity and freshness;
- carries projection;
- is invalidated by source-record changes;
- has a deterministic digest.

## Task 5 — Build hierarchical summaries

**New files**
- `scripts/alice-corpus/build-hierarchy.ts`
- `scripts/alice-corpus/hierarchy.ts`
- `scripts/alice-corpus/build-hierarchy.test.ts`

Hierarchy:
```text
record -> entity -> subsystem -> system -> programme -> estate
```

Create:
- concise card;
- standard summary;
- full dossier;
- source expansion links.

Summary generation may use a model only if:
- all source record IDs are provided;
- output is checked for unsupported claims;
- the model/version/prompt is recorded;
- deterministic non-model fallback exists;
- summaries are derived, never canonical.

## Task 6 — Strengthen graph associations

**New files**
- `scripts/alice-corpus/build-graph-derivatives.ts`
- `scripts/alice-corpus/graph/entity-resolution.ts`
- `scripts/alice-corpus/graph/community.ts`
- `scripts/alice-corpus/graph/impact-neighborhood.ts`
- `scripts/alice-corpus/graph/temporal-edges.ts`
- `scripts/alice-corpus/build-graph-derivatives.test.ts`

Add derived:
- alias normalization;
- explicit `SUPERSEDES`, `CONTRADICTS`, `VALID_DURING`;
- graph communities;
- community summaries;
- change-impact neighborhoods;
- references to sovereign repository graph snapshots.

Do not fabricate repository internals.

## Task 7 — Create projection-specific index manifests

**New files**
- `scripts/alice-corpus/build-index-manifests.ts`
- `schemas/index-manifest-v1.schema.json`
- `scripts/alice-corpus/build-index-manifests.test.ts`

Manifest declares:
- projection;
- corpus digest;
- exact-index artifact;
- BM25 artifact;
- embedding artifact;
- embedding model and dimensions;
- graph snapshot;
- temporal index;
- hierarchy index;
- procedure index;
- build tool versions;
- source input hashes.

No shared artifact across public and non-public projections.

## Task 8 — Add exact record index

**New files**
- `scripts/alice-corpus/build-exact-index.ts`
- `scripts/alice-corpus/exact-index.ts`
- `scripts/alice-corpus/build-exact-index.test.ts`

Index:
- record IDs;
- subject IDs;
- contract/program IDs;
- addresses;
- repository names;
- aliases;
- approved exact phrases;
- source handles;
- temporal pointers.

The runtime may memory-map or load this compact metadata index without retaining full corpus text.

## Task 9 — Rebuild evals for cognition readiness

Add tests for:
- current versus historical truth;
- supersession;
- conflict preservation;
- canonicality ranking;
- exact identifier lookup;
- memory class routing;
- derived summary support;
- public projection isolation;
- repository graph reference behavior;
- explicit unknown.

## Task 10 — Seal corpus v1.1

Produce:
```text
ALICE_CORPUS_MASTER_v1.1/
├── CORPUS_MANIFEST.json
├── CHANGELOG.md
├── MIGRATION_REPORT.json
├── projections/
├── canonical/
├── derived/
├── indexes/
├── evals/
└── SHA256SUMS.txt
```

Run:
- schema validation;
- source reference integrity;
- graph closure;
- projection isolation;
- secret scan;
- deterministic rebuild;
- eval suite;
- ZIP integrity.

Update P0 runtime verifier fixtures to accept the v1.1 schema without weakening validation.
