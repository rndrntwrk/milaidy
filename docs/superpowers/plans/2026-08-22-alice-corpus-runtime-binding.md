# Alice Corpus Runtime Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind `ALICE_CORPUS_MASTER_v1.0` to the canonical Eliza runtime inside Milaidy with physical projection isolation, checksum validation, idempotent knowledge ingestion, read-only graph tools and admission tests.

**Architecture:** Add a dedicated `@rndrntwrk/plugin-alice-corpus` core plugin. The corpus remains an external immutable mount. The plugin validates one explicitly selected physical projection, converts dossiers and atomic records into native Eliza document/knowledge memories, prunes prior corpus projections, and exposes bounded graph queries over that projection's JSONL graph.

**Tech Stack:** TypeScript 5.9, Node/Bun filesystem APIs, elizaOS `Plugin`/`Action`/`AgentRuntime` interfaces, existing `seedBundledKnowledge`, Vitest, JSONL, SHA-256.

**Spec:** `docs/superpowers/specs/2026-08-22-alice-corpus-runtime-binding-design.md`

## Global Constraints

- Corpus files are external and must not be committed to the repository.
- `ALICE_CORPUS_PROJECTION` is mandatory when `ALICE_CORPUS_ROOT` is set.
- `owner-private` requires `ALICE_CORPUS_ALLOW_OWNER_PRIVATE=1`.
- Selected projection files are the security boundary; never open the unrestricted full graph for public Alice.
- Corpus knowledge never grants action authority.
- Default verification mode is `selected`; `off` is invalid when strict mode is enabled.
- All paths must remain inside `ALICE_CORPUS_ROOT` after resolution.
- Existing Milady default knowledge must continue to seed unchanged.
- Every new behavior follows RED → GREEN → REFACTOR.

---

### Task 1: Package scaffold and configuration contract

**Files:**
- Create: `plugins/plugin-alice-corpus/package.json`
- Create: `plugins/plugin-alice-corpus/tsconfig.json`
- Create: `plugins/plugin-alice-corpus/tsconfig.build.json`
- Create: `plugins/plugin-alice-corpus/src/config.ts`
- Test: `plugins/plugin-alice-corpus/src/config.test.ts`

**Interfaces:**
- Produces: `resolveAliceCorpusConfig(env?: NodeJS.ProcessEnv): AliceCorpusConfig | null`
- Produces: `AliceCorpusProjection`, `AliceCorpusVerifyMode`, `AliceCorpusConfig`

- [ ] **Step 1: Write failing configuration tests**

```ts
it("returns null when ALICE_CORPUS_ROOT is absent", () => {
  expect(resolveAliceCorpusConfig({})).toBeNull();
});

it("requires an explicit projection", () => {
  expect(() => resolveAliceCorpusConfig({ ALICE_CORPUS_ROOT: "/corpus" }))
    .toThrow("ALICE_CORPUS_PROJECTION");
});

it("blocks owner-private without an explicit gate", () => {
  expect(() => resolveAliceCorpusConfig({
    ALICE_CORPUS_ROOT: "/corpus",
    ALICE_CORPUS_PROJECTION: "owner-private",
  })).toThrow("ALICE_CORPUS_ALLOW_OWNER_PRIVATE");
});

it("rejects verification off in strict mode", () => {
  expect(() => resolveAliceCorpusConfig({
    ALICE_CORPUS_ROOT: "/corpus",
    ALICE_CORPUS_PROJECTION: "internal",
    ALICE_CORPUS_STRICT: "1",
    ALICE_CORPUS_VERIFY: "off",
  })).toThrow("strict");
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bunx vitest run plugins/plugin-alice-corpus/src/config.test.ts
```

Expected: FAIL because `config.ts` does not exist.

- [ ] **Step 3: Implement the minimal configuration parser**

The parser must accept only:

```ts
type AliceCorpusProjection =
  | "public"
  | "internal"
  | "diligence"
  | "restricted-security"
  | "owner-private";

type AliceCorpusVerifyMode = "selected" | "full" | "off";
```

Normalize booleans from `1`, `true`, `yes`, `0`, `false`, `no`. Resolve the root to an absolute path and reject unsupported projections or verification modes.

- [ ] **Step 4: Run the configuration tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add plugins/plugin-alice-corpus/package.json \
  plugins/plugin-alice-corpus/tsconfig*.json \
  plugins/plugin-alice-corpus/src/config.ts \
  plugins/plugin-alice-corpus/src/config.test.ts
git commit -m "feat(alice): define corpus runtime configuration"
```

---

### Task 2: Manifest, checksum and projection validation

**Files:**
- Create: `plugins/plugin-alice-corpus/src/manifest.ts`
- Create: `plugins/plugin-alice-corpus/src/test-fixtures.ts`
- Test: `plugins/plugin-alice-corpus/src/manifest.test.ts`

**Interfaces:**
- Consumes: `AliceCorpusConfig`
- Produces: `loadAndValidateCorpus(config): Promise<ValidatedAliceCorpus>`
- Produces: selected file paths, corpus version, projection manifest, selected-input digest and parsed records

- [ ] **Step 1: Write failing tests for a valid physical projection**

Create a temporary fixture containing:

```text
CORPUS_MANIFEST.json
SHA256SUMS.txt
projections/internal/MANIFEST.json
projections/internal/records.jsonl
projections/internal/dossiers/system-alice.md
projections/internal/graph-nodes.jsonl
projections/internal/graph-edges.jsonl
```

Assert that the loader returns the declared corpus version, one record, one dossier, two graph nodes and one graph edge.

- [ ] **Step 2: Write failing adversarial tests**

Tests must prove rejection of:

- checksum mismatch;
- projection manifest name mismatch;
- record count mismatch;
- duplicate record ID;
- record visibility outside `allowed_visibilities`;
- graph edge whose endpoint is absent;
- path traversal through a dossier path;
- malformed JSONL;
- missing selected checksum entry in strict selected mode.

- [ ] **Step 3: Run tests and verify RED**

- [ ] **Step 4: Implement minimal validation**

Use `realpath`, `path.relative` and a root-containment assertion before reading any file. Parse `SHA256SUMS.txt` as `<64 hex><two spaces><relative path>`. Hash selected files with streaming SHA-256.

The selected-input digest is SHA-256 over sorted lines:

```text
<relative path>\0<verified file sha256>\n
```

- [ ] **Step 5: Run tests and verify GREEN**

- [ ] **Step 6: Commit**

```bash
git add plugins/plugin-alice-corpus/src/manifest.ts \
  plugins/plugin-alice-corpus/src/manifest.test.ts \
  plugins/plugin-alice-corpus/src/test-fixtures.ts
git commit -m "feat(alice): validate corpus projections and checksums"
```

---

### Task 3: Native knowledge-document construction and reconciliation

**Files:**
- Create: `plugins/plugin-alice-corpus/src/knowledge.ts`
- Test: `plugins/plugin-alice-corpus/src/knowledge.test.ts`

**Interfaces:**
- Consumes: `ValidatedAliceCorpus`
- Produces: `buildAliceCorpusKnowledgeDocuments(corpus): DefaultKnowledgeDocumentDefinition[]`
- Produces: `seedAliceCorpusKnowledge(runtime, corpus): Promise<AliceCorpusSeedReport>`

- [ ] **Step 1: Write failing dossier-fragment tests**

Assert that a Markdown dossier becomes one stable document and that headings create bounded fragments without losing the heading context.

- [ ] **Step 2: Write failing atomic-record tests**

Assert that records are grouped by `record_type`, one record becomes one retrieval fragment, and each fragment text includes:

```text
record_id
subject_id
truth_class
authority_class
canonicality
maturity
as_of
claim_permission
source_refs
counterclaim_or_boundary
```

- [ ] **Step 3: Write failing idempotence and projection-switch tests**

Use an in-memory runtime harness matching the existing default-knowledge tests.

Prove:

- the first import creates expected documents and fragments;
- the second identical import creates no duplicates and reuses embeddings;
- changing the projection removes prior `alice-corpus` documents and linked fragments;
- default `milady-default-knowledge` rows are preserved;
- a record from the prior private projection is physically absent after switching to public.

- [ ] **Step 4: Run tests and verify RED**

- [ ] **Step 5: Implement document construction and seeding**

Use `seedBundledKnowledge(runtime, documents)` from `@miladyai/agent/runtime/default-knowledge`.

Document metadata must include:

```ts
{
  source: "alice-corpus",
  corpusVersion,
  corpusProjection,
  corpusInputDigest,
  corpusDocumentKind: "dossier" | "record-group",
  corpusLogicalPath,
}
```

After seeding, scan `documents` for `metadata.source === "alice-corpus"`; delete every unexpected document and each `knowledge` fragment whose `metadata.documentId` points to it.

- [ ] **Step 6: Run tests and verify GREEN**

- [ ] **Step 7: Commit**

```bash
git add plugins/plugin-alice-corpus/src/knowledge.ts \
  plugins/plugin-alice-corpus/src/knowledge.test.ts
git commit -m "feat(alice): seed and reconcile corpus knowledge"
```

---

### Task 4: Read-only projected graph index

**Files:**
- Create: `plugins/plugin-alice-corpus/src/graph.ts`
- Test: `plugins/plugin-alice-corpus/src/graph.test.ts`

**Interfaces:**
- Consumes: validated projected nodes and edges
- Produces: `AliceCorpusGraphIndex`

```ts
interface AliceCorpusGraphIndex {
  search(query: string, options?: GraphSearchOptions): GraphNode[];
  getNode(nodeId: string): GraphNode | null;
  neighbors(nodeId: string, options?: NeighborOptions): GraphNeighbor[];
  shortestPath(source: string, target: string, options?: PathOptions): GraphPath | null;
  findEvidence(nodeId: string, depth?: number): GraphEvidenceResult;
  listGaps(limit?: number): GraphNode[];
  listConflicts(limit?: number): GraphNode[];
}
```

- [ ] **Step 1: Write failing graph tests**

Prove:

- case-insensitive search over label, node type and properties;
- node-type filtering;
- inbound, outbound and both-direction neighbors;
- edge-type filtering;
- bounded BFS shortest path;
- evidence traversal through `SOURCED_FROM` and record nodes;
- gap/conflict listing;
- no node outside the selected projection exists.

- [ ] **Step 2: Run tests and verify RED**

- [ ] **Step 3: Implement the in-memory graph index**

Index nodes by ID and maintain incoming and outgoing adjacency lists. Clamp search results to 50 and path depth to 8.

- [ ] **Step 4: Run tests and verify GREEN**

- [ ] **Step 5: Commit**

```bash
git add plugins/plugin-alice-corpus/src/graph.ts \
  plugins/plugin-alice-corpus/src/graph.test.ts
git commit -m "feat(alice): add projected corpus graph index"
```

---

### Task 5: Eliza plugin and graph actions

**Files:**
- Create: `plugins/plugin-alice-corpus/src/actions.ts`
- Create: `plugins/plugin-alice-corpus/src/index.ts`
- Test: `plugins/plugin-alice-corpus/src/actions.test.ts`

**Interfaces:**
- Produces: default export `aliceCorpusPlugin: Plugin`
- Produces actions: `ALICE_GRAPH_SEARCH`, `ALICE_GRAPH_GET_NODE`, `ALICE_GRAPH_NEIGHBORS`, `ALICE_GRAPH_PATH`, `ALICE_GRAPH_FIND_EVIDENCE`, `ALICE_GRAPH_LIST_GAPS`

- [ ] **Step 1: Write failing plugin-init tests**

Prove:

- no corpus root means a clean no-op;
- strict invalid corpus rejects initialization;
- valid corpus seeds knowledge and registers a graph index;
- startup report contains counts and digest but no corpus text;
- graph actions are disabled when `ALICE_CORPUS_GRAPH_ENABLED=0`.

- [ ] **Step 2: Write failing action tests**

Assert that every successful action returns:

```text
corpusVersion
projection
nodeIds or edgeIds
recordIds and sourceRefs when available
```

Assert that no action exposes a node missing from the selected projection.

- [ ] **Step 3: Run tests and verify RED**

- [ ] **Step 4: Implement plugin initialization and actions**

Cache the validated corpus and graph per runtime agent ID. Actions are read-only and return structured data alongside concise text.

- [ ] **Step 5: Run tests and verify GREEN**

- [ ] **Step 6: Commit**

```bash
git add plugins/plugin-alice-corpus/src/actions.ts \
  plugins/plugin-alice-corpus/src/actions.test.ts \
  plugins/plugin-alice-corpus/src/index.ts
git commit -m "feat(alice): expose corpus knowledge and graph plugin"
```

---

### Task 6: Core registration, operator configuration and CI admission

**Files:**
- Modify: `packages/agent/src/runtime/core-plugins.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Create: `docs/operators/alice-corpus-runtime-binding.md`
- Create: `scripts/verify-alice-corpus-runtime.mjs`
- Test: `plugins/plugin-alice-corpus/src/runtime-admission.test.ts`

**Interfaces:**
- Adds core package: `@rndrntwrk/plugin-alice-corpus`
- Adds root scripts:

```json
{
  "test:alice-corpus": "vitest run plugins/plugin-alice-corpus/src/*.test.ts",
  "verify:alice-corpus": "node scripts/verify-alice-corpus-runtime.mjs"
}
```

- [ ] **Step 1: Write the failing registration test**

Assert that `CORE_PLUGINS` contains `@rndrntwrk/plugin-alice-corpus` exactly once.

- [ ] **Step 2: Run the test and verify RED**

- [ ] **Step 3: Register the package and document the environment contract**

Add:

```text
ALICE_CORPUS_ROOT=
ALICE_CORPUS_PROJECTION=
ALICE_CORPUS_VERIFY=selected
ALICE_CORPUS_STRICT=1
ALICE_CORPUS_GRAPH_ENABLED=1
ALICE_CORPUS_ALLOW_OWNER_PRIVATE=0
```

The operator runbook must include separate examples for `alice.public` and `alice.core`; never reuse an internal process for public Alice.

- [ ] **Step 4: Implement the runtime verifier**

The verifier performs a read-only preflight and prints one JSON object with:

```text
corpusVersion
projection
inputDigest
recordCount
dossierCount
documentCount
fragmentCount
graphNodeCount
graphEdgeCount
status
```

It exits non-zero on any validation failure.

- [ ] **Step 5: Run focused verification**

```bash
bunx vitest run plugins/plugin-alice-corpus/src/*.test.ts
bun run --filter @rndrntwrk/plugin-alice-corpus typecheck
bun run --filter @rndrntwrk/plugin-alice-corpus build
ALICE_CORPUS_ROOT=/path/to/ALICE_CORPUS_MASTER_v1.0 \
ALICE_CORPUS_PROJECTION=internal \
bun run verify:alice-corpus
```

Expected: all tests pass, typecheck/build pass, verifier returns `"status":"PASS"`.

- [ ] **Step 6: Run repository regression checks**

```bash
bunx vitest run packages/agent/src/runtime/default-knowledge.test.ts
bun run typecheck
bun run build
```

- [ ] **Step 7: Commit**

```bash
git add packages/agent/src/runtime/core-plugins.ts .env.example package.json \
  docs/operators/alice-corpus-runtime-binding.md \
  scripts/verify-alice-corpus-runtime.mjs \
  plugins/plugin-alice-corpus/src/runtime-admission.test.ts
git commit -m "feat(alice): admit corpus plugin into production runtime"
```

---

### Task 7: Production admission evidence and pull request

**Files:**
- Create: `artifacts/alice-corpus-runtime-binding/verification.json`
- Create: `artifacts/alice-corpus-runtime-binding/README.md`

- [ ] **Step 1: Start an internal-projection runtime against a clean database**

Record runtime SHA, corpus ZIP SHA-256, extracted corpus digest, projection, model/embedding configuration and database identity.

- [ ] **Step 2: Verify internal startup counts and retrieval**

Use canonical questions covering RNDRNTWRK, $555, SW4P, Alice architecture, canonicality, UNKNOWN handling and founder voice.

- [ ] **Step 3: Start a separate public-projection runtime**

Prove private relationship, security and owner-only records are absent from both knowledge memories and graph results.

- [ ] **Step 4: Run action-authority adversarial tests**

Prove that corpus statements such as an old deploy instruction cannot execute a deployment, transfer, message or permission change.

- [ ] **Step 5: Write verification artifacts**

`verification.json` must contain exact commands, exit codes, counts, digests and failures. Do not record corpus text or secrets.

- [ ] **Step 6: Open a pull request**

Base: `release/alice-production-core-2026-08-22`  
Head: `feat/alice-corpus-runtime-binding-2026-08-22`

The PR body must distinguish:

- source implementation complete;
- local/CI test state;
- production runtime proof state;
- any remaining deployment or data-mount action.

- [ ] **Step 7: Request review and do not merge before admission gates pass**
