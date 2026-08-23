# P0 Plan — Admit the Alice Corpus Runtime Binding

**Goal:** turn PR #212 from a source-level integration into an admitted, reproducible corpus substrate.  
**Repository:** `rndrntwrk/milaidy`  
**Branch:** `feat/alice-corpus-runtime-binding-2026-08-22`  
**Current observed head:** `ed11ff39bdce7fa0ca899fe745d4fb7b883b48eb`  
**Do not merge until every gate below has fresh evidence.**

## Current failures

The focused isolated test job currently passes 26 tests across 9 files, then fails Biome formatting/lint. The exact release-runtime job fails while preparing the release workspace, so package typecheck and build do not run.

Two review findings remain active:

1. prove strict configured corpus startup cannot be swallowed;
2. prove long corpus seeding is awaited outside the 30-second core pre-registration path.

Seven older review threads are outdated after code changes, but should be resolved only after the corresponding tests pass on the current head.

## Task 1 — Freeze the admission baseline

**Files**
- `docs/operators/alice-corpus-runtime-binding.md`
- `docs/superpowers/plans/2026-08-22-alice-corpus-runtime-binding.md`
- `artifacts/alice-corpus-admission/<sha>/baseline.json` (generated, not hand-edited)

**Steps**
1. Record PR head, base SHA, corpus ZIP hash, public/internal mount hashes, CI run IDs, active review threads, and runtime versions.
2. Record all current environment variables and the projection/database separation rule without secret values.
3. Store the baseline in the admission artifact directory.

**Verification**
```bash
git rev-parse HEAD
git diff --check
jq . artifacts/alice-corpus-admission/*/baseline.json
```

**Commit**
```text
chore(alice-corpus): freeze admission baseline
```

## Task 2 — Make the focused corpus surface Biome-clean

**Files**
- `packages/agent/src/plugins/alice-corpus/actions.ts`
- `packages/agent/src/plugins/alice-corpus/actions.test.ts`
- `packages/agent/src/plugins/alice-corpus/config.ts`
- `packages/agent/src/plugins/alice-corpus/config.test.ts`
- `packages/agent/src/plugins/alice-corpus/graph.ts`
- `packages/agent/src/plugins/alice-corpus/graph.test.ts`
- `packages/agent/src/plugins/alice-corpus/index.ts`
- `packages/agent/src/plugins/alice-corpus/index.test.ts`
- `packages/agent/src/plugins/alice-corpus/knowledge.ts`
- `packages/agent/src/plugins/alice-corpus/knowledge.test.ts`
- `packages/agent/src/plugins/alice-corpus/manifest.ts`
- `packages/agent/src/plugins/alice-corpus/manifest.test.ts`
- `packages/agent/src/plugins/alice-corpus/runtime.ts`
- `packages/agent/src/plugins/alice-corpus/runtime.test.ts`
- `packages/agent/src/runtime/core-plugins.ts`
- `packages/agent/src/runtime/core-plugins.alice-corpus.test.ts`
- `packages/agent/src/runtime/plugin-collector.ts`
- `packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts`

**RED**
Run the exact CI formatting command and retain the current failure:
```bash
bunx @biomejs/biome check \
  packages/agent/src/plugins/alice-corpus \
  packages/agent/src/runtime/core-plugins.ts \
  packages/agent/src/runtime/core-plugins.alice-corpus.test.ts \
  packages/agent/src/runtime/plugin-collector.ts \
  packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts
```

**GREEN**
1. Run `biome check --write` over the exact paths.
2. Replace explicit `any` in tests with imported graph/runtime interfaces or small typed fixtures.
3. Replace non-null assertions in `graph.ts` with guarded lookup helpers.
4. Preserve graph endpoint validation as the invariant, but do not use it to justify unsafe assertions.

Example helper:
```ts
function requireNode(
  nodes: ReadonlyMap<string, AliceCorpusGraphNode>,
  nodeId: string,
): AliceCorpusGraphNode {
  const node = nodes.get(nodeId);
  if (!node) {
    throw new Error(`Projected graph node missing after admission: ${nodeId}`);
  }
  return node;
}
```

**Verification**
```bash
bunx vitest run \
  packages/agent/src/plugins/alice-corpus/*.test.ts \
  packages/agent/src/runtime/core-plugins.alice-corpus.test.ts \
  packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts

bunx @biomejs/biome check \
  packages/agent/src/plugins/alice-corpus \
  packages/agent/src/runtime/core-plugins.ts \
  packages/agent/src/runtime/core-plugins.alice-corpus.test.ts \
  packages/agent/src/runtime/plugin-collector.ts \
  packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts
```

**Commit**
```text
style(alice-corpus): satisfy focused admission formatting
```

## Task 3 — Prove strict fail-closed startup

The plugin is now collected as a regular awaited plugin rather than a pre-registered core plugin. The admission test must prove the actual production loader path propagates its failure.

**Files**
- `packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts`
- `packages/agent/src/plugins/alice-corpus/index.test.ts`
- `packages/agent/src/runtime/eliza.alice-corpus-admission.test.ts` (new)
- `packages/agent/src/runtime/eliza.ts` only if the test proves a remaining swallow path

**RED**
Create a test where:
- `ALICE_CORPUS_ROOT` is configured;
- checksum or schema validation fails;
- the corpus plugin `init` rejects;
- runtime construction must reject and never mark the agent ready.

The test must exercise the same regular-plugin initialization phase used by production, not call `initializeAliceCorpusRuntime` directly.

**GREEN**
Make the smallest loader change required so configured strict failure exits initialization. Non-strict mode may degrade with an explicit disabled receipt.

**Verification**
```bash
bunx vitest run packages/agent/src/runtime/eliza.alice-corpus-admission.test.ts
```

**Review thread**
Reply to and resolve `PRRT_kwDORMActc6bcH5o` only after the production-path test passes.

**Commit**
```text
fix(alice-corpus): fail closed through production plugin startup
```

## Task 4 — Prove seeding is awaited without timeout escape

**Files**
- `packages/agent/src/runtime/eliza.alice-corpus-admission.test.ts`
- `packages/agent/src/plugins/alice-corpus/index.test.ts`
- `packages/agent/src/plugins/alice-corpus/runtime.test.ts`

**RED**
Use a delayed seed dependency longer than the historical core-plugin timeout:
- verify the plugin is not in `CORE_PLUGINS`;
- verify runtime readiness waits for the regular plugin;
- verify no background database writes continue after an initialization failure or cancellation;
- verify the graph is unavailable until seeding succeeds.

**GREEN**
If the regular plugin path is already fully awaited, no production code change is needed. Preserve the proof as a regression test. Otherwise introduce an abortable seed contract and explicitly await it.

**Review thread**
Reply to and resolve `PRRT_kwDORMActc6bcH5r` only after this test passes.

**Commit**
```text
test(alice-corpus): prove awaited cold-database admission
```

## Task 5 — Close outdated findings with current regression evidence

**Files**
- `packages/agent/src/plugins/alice-corpus/manifest.test.ts`
- `packages/agent/src/plugins/alice-corpus/knowledge.test.ts`
- `packages/agent/src/plugins/alice-corpus/graph.test.ts`
- `packages/agent/src/plugins/alice-corpus/actions.test.ts`
- `packages/agent/src/plugins/alice-corpus/index.test.ts`
- `packages/agent/src/plugins/alice-corpus/runtime.test.ts`

Ensure explicit tests exist for:

1. full verification uses the union of checksum paths and selected inputs;
2. record/node/edge required fields are validated;
3. stored filenames are opaque and do not reveal dossier names;
4. graph path steps preserve traversal direction;
5. edge-type filters apply before fan-out limits;
6. disabling the mount purges projected documents and fragments;
7. runtime state drops full dossiers and records after seeding.

Run each test with the fix reverted or mutated once to demonstrate it fails, then restore and rerun.

**Commit**
```text
test(alice-corpus): lock review remediations with regressions
```

## Task 6 — Repair exact release-workspace CI setup

**Files**
- `.github/workflows/alice-corpus-binding-ci.yml`
- `.github/actions/setup-bun-workspace/action.yml`
- release-workspace setup scripts referenced by the workflow
- `package.json` only if the exact release branch contains invalid workspace declarations

**RED**
Reproduce the exact command from the `Setup exact release workspace` job.

**Investigation**
1. Pin the exact Eliza submodule or repository source expected by the production release branch.
2. Do not replace the release workspace with arbitrary upstream `develop`.
3. Verify every root workspace path exists after setup.
4. Confirm custom Cloud workspaces are either hydrated or removed through an admitted published-package fallback.
5. Verify `bun install` uses the intended lockfile and does not silently regenerate production dependencies.

**GREEN**
Make the CI workspace match the production branch dependency graph.

**Verification**
```bash
bun install --frozen-lockfile
bun --cwd packages/agent run typecheck
bun --cwd packages/agent run build
```

**Commit**
```text
ci(alice-corpus): reproduce the exact release workspace
```

## Task 7 — Run the complete source gate

**Commands**
```bash
bunx vitest run \
  packages/agent/src/plugins/alice-corpus/*.test.ts \
  packages/agent/src/runtime/core-plugins.alice-corpus.test.ts \
  packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts \
  packages/agent/src/runtime/eliza.alice-corpus-admission.test.ts

bunx @biomejs/biome check \
  packages/agent/src/plugins/alice-corpus \
  packages/agent/src/runtime/core-plugins.ts \
  packages/agent/src/runtime/core-plugins.alice-corpus.test.ts \
  packages/agent/src/runtime/plugin-collector.ts \
  packages/agent/src/runtime/plugin-collector.alice-corpus.test.ts \
  packages/agent/src/runtime/eliza.alice-corpus-admission.test.ts \
  scripts/verify-alice-corpus-runtime.ts

bun --cwd packages/agent run typecheck
bun --cwd packages/agent run build
git diff --check
```

Capture exit codes and versions in `source-gate.json`.

## Task 8 — Verify sealed public and internal mounts

**Files**
- `scripts/verify-alice-corpus-runtime.ts`
- runtime mount ZIPs, mounted read-only outside the repository
- `artifacts/alice-corpus-admission/<sha>/mount-verification.json`

**Commands**
```bash
ALICE_CORPUS_ROOT=/srv/alice-corpus/internal \
ALICE_CORPUS_PROJECTION=internal \
ALICE_CORPUS_VERIFY=full \
ALICE_CORPUS_STRICT=1 \
bun scripts/verify-alice-corpus-runtime.ts

ALICE_CORPUS_ROOT=/srv/alice-corpus/public \
ALICE_CORPUS_PROJECTION=public \
ALICE_CORPUS_VERIFY=full \
ALICE_CORPUS_STRICT=1 \
bun scripts/verify-alice-corpus-runtime.ts
```

Verify:
- exact counts;
- input digest;
- all selected files hashed;
- no sibling projection;
- no source vault;
- no unrestricted graph database;
- no secret patterns.

## Task 9 — Clean-database runtime admission

Run separate processes and databases.

### Internal

```text
identity: alice.core
projection: internal
database: clean internal database
```

### Public

```text
identity: alice.public
projection: public
database: separate clean public database
```

For each:
1. start with empty database;
2. wait for `alice-corpus-ready`;
3. verify expected document and fragment counts;
4. query exact corpus facts;
5. query graph search/path;
6. restart and prove idempotence;
7. switch to a smaller projection in a disposable test database and prove stale rows disappear;
8. remove the mount and prove corpus rows purge;
9. verify startup logs contain no corpus text or private filenames.

Store database identifier hash, runtime SHA, corpus digest, projection, counts, elapsed time, query receipts, and rollback result.

## Task 10 — Run adversarial admission evaluations

Required tests:

- public Alice cannot retrieve internal fixture facts;
- owner-private cannot load without the explicit gate;
- old corpus commands cannot authorize an action;
- a procedure cannot execute a transfer or deployment without an action envelope;
- malformed corpus rows fail admission;
- stale or conflicting records do not become current truth;
- graph paths preserve direction;
- removal of the mount removes influence from retrieval;
- logs contain no secret or relationship patterns.

## Task 11 — Produce the admission artifact

**Directory**
`artifacts/alice-corpus-admission/<head-sha>/`

Include:
- source gate;
- CI run IDs;
- corpus/mount checksums;
- startup receipts;
- public/internal database evidence;
- adversarial results;
- review-thread resolution map;
- rollback result;
- exact versions;
- SHA256 manifest.

## Task 12 — Review and merge

1. Request fresh review on the latest head.
2. Resolve only threads supported by current test evidence.
3. Require green focused and exact-release jobs.
4. Rebase or merge the latest production base and rerun all gates.
5. Merge with the expected head SHA.
6. Preserve the merge SHA in the corpus/runtime release registry.
7. Do not deploy from the feature branch.
