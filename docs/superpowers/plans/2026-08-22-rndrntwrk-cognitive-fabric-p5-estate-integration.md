# P5 Plan — Estate-Wide Cognitive Fabric Integration

**Goal:** make the admitted Cognitive Fabric available to authorized RNDRNTWRK components without duplicating the brain or broadening authority.  
**Dependency:** P2 admitted; P3/P4 capabilities enabled independently by identity.

## Task 1 — Freeze the service boundary

Expose typed operations:

```text
context.resolve
evidence.trace
graph.search
graph.path
graph.impact
graph.compare
state.current
state.history
memory.recall
memory.propose
memory.promote
skill.match
lesson.recall
gap.create
eval.record
```

Every request includes:
- identity;
- projection;
- purpose;
- consequence level;
- trace ID;
- budgets;
- allowed source classes.

## Task 2 — In-process Milaidy integration

`alice.core` uses the plugin in-process:
- provider injection;
- planner context;
- graph actions;
- dynamic state where enabled;
- trajectory receipts.

This remains the reference implementation.

## Task 3 — CTRL integration

CTRL receives:
- evidence-backed estate status;
- gaps;
- roadmap checkpoints;
- deployment and authority impact;
- current adapter health;
- promotion-review queues;
- evaluation regressions.

CTRL cannot alter corpus or policy without the appropriate workflow and approval.

## Task 4 — Public report and Talk to Alice

Public process:
- public physical mount;
- public database;
- public derived indexes;
- no internal adapter credentials;
- read-only current sources approved for public use.

Every answer returns:
- as-of time;
- evidence status;
- citations;
- methodology;
- limitations;
- report deep links.

## Task 5 — Coder identity

`alice.coder` receives:
- canonical repository relationships;
- admitted repository graphs;
- current branch/CI state;
- prior fixes and failures;
- engineering procedures;
- test and release policies.

It does not receive financial or private relationship data unless independently authorized.

## Task 6 — SRE identity

`alice.sre` receives:
- deployments;
- infrastructure topology;
- incidents;
- runbooks;
- rollback evidence;
- cost and health observations;
- authority boundaries.

Consequential operations remain capability-gated.

## Task 7 — Trader and market identity

`alice.trader` receives:
- public/internal token policy;
- current chain and market state;
- wallet classification;
- liquidity and volume exclusions;
- risk limits;
- no private keys or unrestricted trading authority.

## Task 8 — Identity and security verifier

`alice.identity` and `alice.verifier` receive:
- 555ID issuer state;
- authority graph;
- audit scope;
- conflicts;
- projection and privacy checks;
- evidence packet introspection.

## Task 9 — Stream and social identities

`alice.stream` receives media/product procedures, current session state, creator policy, and brand context.

`alice.social` receives approved voice, relationship-specific context, commitments, and public claims. Private relationship data remains owner-scoped.

## Task 10 — Cloudflare control membrane

Implement:
- Access-protected fabric gateway;
- Service Bindings for trusted Workers;
- Queue-based dynamic refresh;
- Workflow-based reconciliation and corpus-delta builds;
- Durable Object leases and idempotency;
- R2 immutable artifact storage;
- AI Gateway observability and budgets;
- public/internal route separation.

No Worker owns a separate reasoning loop.

## Task 11 — Modal bounded compute

Create Modal jobs for:
- corpus v1.1 migration;
- projection index build;
- graph community build;
- batch embeddings;
- late-interaction experiment;
- offline eval;
- trajectory replay;
- large dynamic backfill.

Each job:
- is pinned to image and code digest;
- has bounded network and budget;
- writes content-addressed artifacts;
- emits a receipt;
- cannot directly promote or deploy.

## Task 12 — Runtime deployment

Separate:
- `alice.public`;
- `alice.core`;
- restricted verifier;
- owner-private research.

Each has:
- explicit projection;
- separate database;
- separate secrets;
- separate route;
- identity-specific capabilities;
- independent rollback.

## Task 13 — Cognitive operations dashboard

Display:
- corpus and index versions;
- projection;
- adapter freshness;
- retrieval latency;
- critic outcomes;
- unknown/conflict rates;
- citation coverage;
- evaluation regressions;
- memory candidates;
- skill promotions;
- token and cost use;
- privacy and authority incidents.

## Task 14 — Canary

Canary order:
1. internal read-only exact facts;
2. internal local explanations;
3. internal graph impact;
4. public read-only answers;
5. GitHub current state;
6. planner evidence packets;
7. staged learning candidates;
8. additional dynamic adapters;
9. broader identities.

At each step:
- small traffic percentage;
- pinned configuration;
- shadow evaluation;
- automatic rollback threshold;
- human review of material failures.

## Task 15 — Incident and rollback

Triggers:
- cross-projection leak;
- unsupported material claim;
- stale data represented as current;
- knowledge-to-action crossover;
- graph direction corruption;
- receipt loss;
- runaway cost;
- review bypass.

Rollback:
- disable fabric feature;
- preserve corpus plugin and baseline knowledge if safe;
- stop dynamic refresh;
- isolate affected database/index;
- retain evidence;
- restore previous admitted release;
- open an incident and candidate correction.

## Task 16 — Final admission

The estate-wide fabric is admitted only after:
- public/internal isolation;
- current-state adapter evidence;
- planner boundary tests;
- promotion-review tests;
- report/Talk to Alice citations;
- canary stability;
- incident rollback rehearsal;
- cost limits;
- signed release artifact.
