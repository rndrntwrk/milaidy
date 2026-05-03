# Alice durable corpus store spike

## Purpose

The corpus-ingest recovery sequence made seeding safer with snapshots,
checkpointing, startup probes, and staging acceptance. The remaining
architectural gap is that the runtime still treats the corpus mostly as rows
inside the live memory database. A durable corpus store gives Alice an
auditable source snapshot that can be compared, restored, or re-ingested
without depending on a half-written `memories` table.

This spike adds a low-risk filesystem-backed store under Alice's state
directory. It does **not** change retrieval behavior, chat behavior, or the
bulk knowledge API.

## What landed

The Alice corpus API now writes two artifacts when an operator calls:

```http
POST /api/alice/corpus/snapshot
```

1. The legacy manifest at:

```text
<stateDir>/alice/corpus-manifest.json
```

2. A durable content-addressed store at:

```text
<stateDir>/alice/corpus-store/
  latest.json
  snapshots/<snapshotId>.json
  objects/sha256/<prefix>/<sha256>
```

The durable snapshot contains:

* `snapshotId` - first 32 hex chars of the stable corpus hash.
* `corpusSha` - SHA-256 over the sorted `(rootId, relativePath, contentType,
  sha256, byteSize)` tuples.
* `items[]` - root id, relative path, content type, byte size, SHA, and object
  path.
* No per-file `absolutePath` entries. Runtime-local source paths are used only
  while writing the store; the stored snapshot points at content-addressed
  objects.

Operators can inspect the latest durable snapshot with:

```http
GET /api/alice/corpus/snapshot/latest
```

## Why filesystem first

The current production risk is partial mutation of the live knowledge rows.
The fastest safe improvement is to keep the corpus source snapshot beside the
runtime state, independent of those rows.

Filesystem store advantages:

* No schema migration in the runtime DB.
* No change to the upstream `@elizaos/plugin-knowledge` tables.
* Works with the same PVC/S3 snapshot posture the recovery plan already uses.
* Dedupes unchanged corpus bytes by SHA.
* Lets Ops prove "this is the corpus the runtime saw" without querying vector
  rows.

## Boundaries

This is still a spike. It intentionally does not:

* Make `/api/knowledge/documents/bulk` idempotent.
* Replace the PR #4 atomic-swap staging Job.
* Write a new SQL table.
* Automatically rehydrate `memories` from the object store on startup.
* Promote production corpus ingest.

## Promotion path

The next production-grade step is a SQL-backed corpus ledger:

```sql
alice_corpus_runs(
  id uuid primary key,
  corpus_sha text not null,
  source text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  manifest_json jsonb not null
);

alice_corpus_documents(
  corpus_sha text not null,
  root_id text not null,
  relative_path text not null,
  content_sha text not null,
  byte_size bigint not null,
  knowledge_document_id uuid,
  status text not null,
  primary key (corpus_sha, root_id, relative_path)
);
```

That ledger is what eventually makes the bulk ingest API idempotent by
`(corpusSha, rootId, relativePath, contentSha)` instead of by fresh generated
document ids.

## Acceptance for this spike

* `POST /api/alice/corpus/snapshot` still writes the legacy manifest.
* The same request writes content-addressed objects and `latest.json`.
* Re-running the same snapshot writes zero duplicate objects.
* Source-file mutation between manifest build and store write fails closed.
* `GET /api/alice/corpus/snapshot/latest` returns the stored snapshot or 404
  when none exists.

## Operational note

The default store path is:

```text
<stateDir>/alice/corpus-store
```

It can be overridden with `alice.corpus.storeDir` in config. Relative paths are
resolved from the runtime working directory; absolute paths are accepted for
special deployments.
