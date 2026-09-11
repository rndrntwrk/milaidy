# Alice corpus runtime binding

This runbook binds an extracted `ALICE_CORPUS_MASTER_v1.0` directory to the canonical Eliza runtime inside Milaidy.

The corpus remains an external immutable mount. Private records and source artifacts must not be copied into the repository or a public runtime image.

## Runtime contract

Milaidy loads `@miladyai/agent/plugins/alice-corpus` as a core plugin. The plugin is inert when `ALICE_CORPUS_ROOT` is absent.

When configured, it:

1. requires an explicit physical projection;
2. validates manifests, counts, visibility and graph endpoints;
3. verifies selected or complete file checksums;
4. converts dossiers and atomic records into native Eliza document and knowledge memories;
5. removes prior corpus documents and fragments that are not part of the selected projection;
6. exposes read-only graph actions over the selected projection only.

Corpus knowledge never grants deployment, wallet, messaging, treasury or tool authority.

## Required corpus layout

```text
ALICE_CORPUS_MASTER_v1.0/
├── CORPUS_MANIFEST.json
├── SHA256SUMS.txt
└── projections/
    └── <projection>/
        ├── MANIFEST.json
        ├── records.jsonl
        ├── dossiers/*.md
        ├── graph-nodes.jsonl
        └── graph-edges.jsonl
```

## Environment

Copy `.env.alice-corpus.example` into the deployment environment and set an absolute mount path.

```text
ALICE_CORPUS_ROOT=/srv/alice-corpus/ALICE_CORPUS_MASTER_v1.0
ALICE_CORPUS_PROJECTION=internal
ALICE_CORPUS_VERIFY=selected
ALICE_CORPUS_STRICT=1
ALICE_CORPUS_GRAPH_ENABLED=1
ALICE_CORPUS_ALLOW_OWNER_PRIVATE=0
```

### Projections

| Identity | Projection | Process boundary |
|---|---|---|
| `alice.public` | `public` | Dedicated public process and database |
| `alice.core` | `internal` | Dedicated internal process and database |
| Diligence assistant | `diligence` | Controlled-access process and database |
| Security verifier | `restricted-security` | Restricted process and database |
| Owner-only research | `owner-private` | Owner-only process and database; requires the extra gate |

Never change a public process from `public` to `internal`. Start a separate process with a separate database.

`owner-private` additionally requires:

```text
ALICE_CORPUS_ALLOW_OWNER_PRIVATE=1
```

## Verification modes

- `selected` — default. Verifies the top-level manifest and every file actually loaded from the selected projection.
- `full` — verifies every path in `SHA256SUMS.txt`; use for admission and sealed releases.
- `off` — development only. Rejected when `ALICE_CORPUS_STRICT=1`.

Run the read-only preflight before startup:

```bash
ALICE_CORPUS_ROOT=/srv/alice-corpus/ALICE_CORPUS_MASTER_v1.0 \
ALICE_CORPUS_PROJECTION=internal \
ALICE_CORPUS_VERIFY=full \
bun scripts/verify-alice-corpus-runtime.ts
```

The command emits one JSON document with the corpus ID, version, projection, selected-input digest, counts and `PASS` status. It does not seed the database or print corpus text.

## Knowledge persistence

The plugin uses the existing native Eliza knowledge contract:

- one row per corpus document in `documents`;
- one row per retrieval fragment in `knowledge`;
- deterministic IDs derived from agent ID and corpus document key;
- native embedding generation when embeddings are not supplied;
- idempotent updates;
- stale fragment and prior-projection removal.

Dossiers become documents split by headings and bounded paragraphs. Atomic records are grouped into documents by record type, while each record remains one retrieval fragment with its truth, authority, canonicality, time, source and boundary metadata in the text.

## Graph actions

When `ALICE_CORPUS_GRAPH_ENABLED=1`, the runtime exposes:

```text
ALICE_GRAPH_SEARCH
ALICE_GRAPH_GET_NODE
ALICE_GRAPH_NEIGHBORS
ALICE_GRAPH_PATH
ALICE_GRAPH_FIND_EVIDENCE
ALICE_GRAPH_LIST_GAPS
```

These actions read only the selected projection's `graph-nodes.jsonl` and `graph-edges.jsonl`. They do not open the unrestricted full-corpus SQLite database and cannot write to the corpus or protocol systems.

Every action result includes the corpus version, projection and selected-input digest.

## Startup evidence

A successful runtime emits one structured log line beginning:

```text
[alice-corpus] alice-corpus-ready
```

The payload contains only:

- corpus version;
- projection;
- verification mode;
- selected-input digest;
- record, dossier, document and fragment counts;
- graph node and edge counts;
- pruned document and fragment counts;
- elapsed milliseconds.

It must not contain source text, private relationship facts or secret values.

## Projection changes

A projection change is a data migration, not a prompt setting.

Before promotion:

1. stop the runtime;
2. back up the database;
3. set the new physical projection;
4. run the verifier;
5. start the runtime;
6. verify that stale `alice-corpus` documents and their fragments were removed;
7. run the projection access-control evaluation suite.

For public Alice, use a clean database whenever possible.

## Admission checklist

- [ ] Corpus ZIP SHA-256 matches the approved release.
- [ ] Extracted corpus is mounted read-only.
- [ ] Projection is explicit and appropriate to the Alice identity.
- [ ] Full verifier returns `PASS`.
- [ ] Unit tests, typecheck and build pass at the runtime SHA.
- [ ] Internal runtime reports expected record and graph counts.
- [ ] Public runtime runs separately with the public projection.
- [ ] Public retrieval cannot return internal, diligence, restricted or owner-private fixture records.
- [ ] Projection switching physically removes prior private knowledge rows.
- [ ] Corpus text cannot authorize a deployment, transfer, message or permission change.
- [ ] Startup logs contain no corpus text or secret patterns.
- [ ] Verification evidence records exact runtime SHA, corpus digest, projection and database identity.

## Rollback

1. Stop the runtime.
2. Remove `ALICE_CORPUS_ROOT` from the environment.
3. Restart Milaidy; the core plugin becomes inert.
4. Restore the previous database if the corpus rows must be removed immediately.
5. Preserve the failed corpus, verification output and logs as evidence.

Do not delete or rewrite the sealed corpus to make a failed admission pass. Produce a new corpus version or runtime fix.
