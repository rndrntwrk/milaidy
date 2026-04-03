---
title: "Alice Knowledge Source Register"
sidebarTitle: "knowledge register"
description: "Versioned source registry for Alice knowledge ingestion, with refresh rules and provenance requirements."
---

# Alice Knowledge Source Register

Use this register to decide which repository content Alice may ingest for system
questions, operator guidance, and founder-only context. The goal is to keep
Alice grounded in current source-aware docs instead of stale memory.

The typed source of truth lives in `src/runtime/alice-knowledge-source-register.ts`.

## Core rule

Alice should answer system questions from **current registered sources** with
explicit provenance:

- `source_id`
- `source_path`
- `source_version`
- `refresh_rule`

Founder notes can inform internal strategy, but they must not be treated as
shipped product truth without corroboration from current repo docs or runbooks.

## Source sets

### 1. Alice system docs

| Field | Value |
| --- | --- |
| Source type | repo docs |
| Grounding policy | ground system answers |
| Anchors | `docs/cli`, `docs/runtime`, `docs/configuration.mdx`, `docs/config-schema.mdx`, `docs/deployment.mdx`, `docs/guides/knowledge.md` |
| Refresh trigger | on merge to `main` |
| Refresh window | 1 day |
| Owner | Docs + runtime owner |

Use this set for:
- setup and configuration questions
- runtime and deployment questions
- questions about the current documented Milady behavior

Stale risk:
- Alice can repeat outdated setup or deployment guidance after docs/runtime changes.

### 2. Alice action and API references

| Field | Value |
| --- | --- |
| Source type | action reference |
| Grounding policy | ground system answers |
| Anchors | `docs/rest`, `docs/plugin-registry`, `docs/plugins`, `docs/guides/custom-actions.mdx`, `docs/guides/hooks.mdx` |
| Refresh trigger | on merge to `main` |
| Refresh window | 1 day |
| Owner | API + plugin surface owner |

Use this set for:
- endpoint and route behavior
- plugin or action-reference questions
- knowledge/API workflow questions

Stale risk:
- Alice can cite old endpoint or plugin behavior if reference docs lag behind runtime changes.

### 3. Alice operator runbooks

| Field | Value |
| --- | --- |
| Source type | runbook |
| Grounding policy | ground operator recovery |
| Anchors | `docs/operators`, `docs/stability`, `docs/solo-vs-swarm-replay-benchmark-runbook.md` |
| Refresh trigger | before operator proof |
| Refresh window | 7 days |
| Owner | Operator docs owner |

Use this set for:
- recovery paths
- proof and validation paths
- operator-only questions about what to do next

Stale risk:
- operators can follow stale proof or recovery guidance even while the general docs look current.

### 4. Alice founder notes and planning surfaces

| Field | Value |
| --- | --- |
| Source type | founder note |
| Grounding policy | founder corroboration required |
| Anchors | `AGENTS.md`, `docs/plans`, `docs/superpowers/plans`, `docs/superpowers/specs`, `docs/fast-mode-implementation-dossier`, `docs/autonomous-loop-implementation`, `docs/triggers-system-implementation`, `docs/KNOWLEDGE_TAB_IMPLEMENTATION_PLAN.md` |
| Refresh trigger | manual founder approval |
| Refresh window | 30 days |
| Owner | Founder / product lead |

Use this set for:
- product-direction context
- implementation intent
- planning dossiers and future-shape reasoning

Stale risk:
- planning assumptions can be mistaken for shipped behavior if they are ingested without corroboration.

## Versioning model

Every source set is versioned from the actual files under its anchors:

- only text knowledge files are included
- each snapshot records `fileCount`
- each snapshot records `lastModifiedAt`
- each snapshot derives a deterministic `sourceVersion` from file path, mtime, and size

That means Alice can distinguish:

- same source id, new version
- same question scope, different freshness state
- founder-note context versus shipped-doc context

## Refresh policy by source type

| Source type | When to refresh | Why |
| --- | --- | --- |
| Repo docs | every merge to `main` | prevents setup/runtime drift |
| Action references | every merge to `main` | keeps endpoint and action behavior current |
| Runbooks | before proof, recovery drill, or operator handoff | keeps operational guidance tied to current practice |
| Founder notes | only with explicit founder review | avoids turning planning notes into accidental product truth |

## Grounding policy

When Alice answers:

- product/system questions should prefer system docs and action references
- operator recovery questions should prefer operator runbooks
- founder notes should only supplement an answer after corroboration from current docs or runbooks

If a source set is beyond its refresh window, it should be treated as stale and
revalidated before it is trusted for grounding.

## Related docs

- `guides/knowledge`
- `operators/alice-config-and-env-matrix`
- `operators/alice-high-risk-action-register`
