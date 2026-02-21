---
doc_id: knowledge-readme-v1
title: Milaidy Knowledge Corpus Runbook
domain: knowledge
source_repo: rndrntwrk/555
owner: enoomian
status: draft
updated_at: 2026-02-20T00:00:00Z
freshness_sla_days: 7
audience: internal
confidentiality: internal
---

# Milaidy Knowledge Corpus Runbook

This folder is the canonical ingestion corpus for Alice (Milaidy runtime). It is designed for deterministic seeding after each deployment.

## Corpus Layout

1. `00_ecosystem/ECOSYSTEM_CANONICAL.md`
2. `10_555/ARCHITECTURE.md`
3. `20_stream/ARCHITECTURE.md`
4. `30_sw4p/ARCHITECTURE.md`
5. `40_product_publication/CEO_BRIEFING_PACK.md`
6. `40_product_publication/KNOWLEDGE_COLLECTION_PLAN.md`

## Ingestion Sequence (Local)

Run from `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy`:

```bash
set -a
source .env
set +a

node --import tsx scripts/seed-knowledge.ts knowledge/00_ecosystem
node --import tsx scripts/seed-knowledge.ts knowledge/10_555
node --import tsx scripts/seed-knowledge.ts knowledge/20_stream
node --import tsx scripts/seed-knowledge.ts knowledge/30_sw4p
node --import tsx scripts/seed-knowledge.ts knowledge/40_product_publication
```

Notes:
1. `MILAIDY_API_BASE` defaults to `http://127.0.0.1:3000`.
2. `MILAIDY_API_TOKEN` must be set for authenticated API mode.
3. Script endpoint is `POST /api/knowledge/documents`.

## Ingestion Sequence (Production over SSH + kubectl)

Run from the Hetzner head server after deployment:

```bash
ssh root@116.202.35.171

kubectl -n production exec deploy/alice-bot -- \
  node --import tsx scripts/seed-knowledge.ts /app/milaidy/knowledge/00_ecosystem
kubectl -n production exec deploy/alice-bot -- \
  node --import tsx scripts/seed-knowledge.ts /app/milaidy/knowledge/10_555
kubectl -n production exec deploy/alice-bot -- \
  node --import tsx scripts/seed-knowledge.ts /app/milaidy/knowledge/20_stream
kubectl -n production exec deploy/alice-bot -- \
  node --import tsx scripts/seed-knowledge.ts /app/milaidy/knowledge/30_sw4p
kubectl -n production exec deploy/alice-bot -- \
  node --import tsx scripts/seed-knowledge.ts /app/milaidy/knowledge/40_product_publication
```

If `tsx` is unavailable in the runtime image, run seeding from the local checkout against `MILAIDY_API_BASE=https://alice.rndrntwrk.com`.

## Acceptance Criteria

1. All files ingest without 4xx/5xx responses.
2. Alice can answer architecture questions across 555, stream, and sw4p without hallucinating endpoint names.
3. Alice reflects launch policy constraints:
   1. prelaunch/launch payout restrictions,
   2. trusted-admin controls,
   3. route mismatch awareness where adapters are pending.
