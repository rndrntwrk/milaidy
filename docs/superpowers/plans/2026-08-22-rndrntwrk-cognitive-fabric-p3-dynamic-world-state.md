# P3 Plan — Dynamic World State

**Goal:** give Alice current, bitemporal perception without allowing volatile observations to overwrite the sealed corpus.  
**Dependency:** P2 contracts and evidence packets admitted.  
**First adapter:** GitHub.

## Proposed file tree

```text
packages/agent/src/plugins/alice-cognitive-fabric/dynamic/
├── types.ts
├── registry.ts
├── service.ts
├── repository.ts
├── freshness.ts
├── reconciliation.ts
├── receipts.ts
├── adapters/
│   ├── github.ts
│   ├── solana.ts
│   ├── evm.ts
│   ├── deployments.ts
│   ├── financials.ts
│   ├── products.ts
│   ├── social.ts
│   └── infrastructure.ts
└── *.test.ts
```

## Task 1 — Define adapter and observation contracts

An adapter declares:
- ID/version;
- source authority;
- supported subjects/properties;
- required credentials by reference;
- refresh SLA;
- reconciliation policy;
- rate and cost budgets;
- visibility;
- failure behavior.

An observation contains the bitemporal fields from the design spec.

Tests reject:
- missing `fresh_until`;
- future impossible timestamps;
- secret values in receipts;
- an adapter claiming authority outside its registry.

## Task 2 — Implement observation repository

Use a dedicated normalized Postgres schema.

Tables:
```text
cognitive_adapter_registry
cognitive_observations
cognitive_observation_sources
cognitive_reconciliation_events
cognitive_adapter_runs
cognitive_evidence_packets
cognitive_fabric_receipts
```

Indexes:
- subject/property/effective time;
- adapter/source/observed time;
- current non-expired observation;
- conflict and supersession;
- request/receipt.

Migrations must be additive and reversible.

## Task 3 — Implement freshness state

`freshness.ts` returns:
- fresh;
- approaching stale;
- stale;
- unavailable.

A current query cannot use stale data as current without an explicit degraded label.

## Task 4 — Implement reconciliation

Policies:
- single primary authority;
- primary plus independent verification;
- quorum;
- chain finality;
- accounting close;
- operator approval.

Conflicting observations remain present and produce `CONFLICT`.

## Task 5 — GitHub adapter

Support:
- repository metadata;
- branch and commit;
- PR state;
- review threads;
- workflow runs and jobs;
- releases;
- changed files;
- graphified frozen SHA versus current SHA.

Do not ingest arbitrary issue or PR text as policy.

Tests:
- renamed branch;
- force-push;
- stale workflow run;
- private repository access;
- rate limiting;
- missing commit;
- conflicting PR head;
- source receipt.

## Task 6 — Connect GitHub to context resolution

For current engineering questions:
1. retrieve the canonical repository record;
2. call GitHub adapter;
3. compare current and frozen SHA;
4. attach observation;
5. disclose drift or unknown.

## Task 7 — Solana adapter

Support:
- mint and token-account state;
- authorities;
- programme/ProgramData;
- balances;
- transactions;
- canonical pools;
- finalized state.

Use independent indexer comparison for classification-heavy questions.

## Task 8 — EVM adapter

Support:
- bytecode;
- contract code hash;
- proxy/admin roles;
- balances;
- logs;
- transaction receipts;
- chain finality.

Per-chain registry prevents an address on one network being applied to another.

## Task 9 — Deployment and authority adapter

Reconcile:
- source SHA;
- artifact digest;
- address/program ID;
- runtime code/ELF;
- owner/admin/pauser/upgrader;
- deployment transaction;
- environment;
- canary.

## Task 10 — Financial adapter

Only after a reconciled chart of accounts exists.

Support:
- unrestricted cash;
- realized revenue;
- expenses;
- obligations;
- founder advances;
- restricted funds;
- burn;
- runway;
- close status.

No planning number becomes an actual.

## Task 11 — Product and user adapters

Support accepted, versioned events for:
- users;
- creators;
- streams;
- games;
- Alice tasks;
- SW4P settlement;
- campaigns;
- payouts.

Bot, team, system, test, MM, treasury, and unknown activity remain classifiable and excludable.

## Task 12 — Infrastructure adapters

Cloudflare, Railway, Modal, AWS, and databases:
- deployment identity;
- health;
- incidents;
- usage;
- cost;
- logs by receipt;
- configuration drift.

## Task 13 — Refresh orchestration

Cloudflare:
- Queue per adapter domain;
- Workflow per refresh/reconciliation sequence;
- Durable Object lease per subject/source;
- R2 for immutable raw snapshots;
- Postgres for normalized observations.

Modal:
- large backfills;
- chain-history classification;
- index rebuilds;
- batch reconciliation.

## Task 14 — Current-state API and actions

Add:
```text
ALICE_STATE_CURRENT
ALICE_STATE_HISTORY
ALICE_STATE_COMPARE
ALICE_STATE_REFRESH_REQUEST
```

`REFRESH_REQUEST` schedules an authorized read. It does not grant write authority to the underlying system.

## Task 15 — Evaluation and admission

Measure:
- correct adapter trigger;
- freshness accuracy;
- conflict preservation;
- source reconciliation;
- no frozen-state impersonation;
- latency and cost;
- rate-limit behavior;
- failover;
- projection isolation;
- source receipt integrity.
