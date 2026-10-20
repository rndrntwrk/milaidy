# Graphification handoff — `rndrntwrk/milaidy`

> Documentation-only handoff. This file does not certify production readiness and does not commit the generated graph bundle to the repository.

## Frozen evidence

| Field | Value |
|---|---|
| Queue | #8 |
| Effective branch | `main` |
| Graphified commit | `4dfb59cd2a8abdb1ba0771bbda7b18a9792d829c` |
| Graphified tree | `690b1a073e5c890cf52ee5f06f46702b7315c6c8` |
| Graphify | `0.9.46` |
| Decision | **Conditional accept** |
| Graph class | Full native AST + targeted native + complete sovereign graph |
| Review graph | 4,487 nodes / 6,381 relationships / 49 communities |
| Native layer | 16,710 nodes / 33,261 relationships |
| Coverage | 3,385/3,385 files registered; 1,803 native runtime files |
| Estate/global admission | **Blocked until this handoff's gates are closed** |

This handoff is pinned to the graphified commit. Before merging or relying on it, compare the current `main` head with `4dfb59cd2a8abdb1ba0771bbda7b18a9792d829c` and mark the evidence stale when behavior changed.

## Canonical ownership

**Authoritative for:** Milady upstream base runtime and `@miladyai/autonomous` Gateway at the frozen main commit.

**Not authoritative for:** Not the complete Alice-specific runtime; Alice protected divergences live on separate branches.

## Architecture captured

- `@miladyai/autonomous` is the backend/runtime authority.
- Gateway composes Eliza AgentRuntime, API/WebSocket control, wallets, terminal, sandbox, connectors, plugins, cloud and streaming.
- Local-first mode is default, with optional cloud/remote backends.
- Standard sandbox is restrictive; browser and light/off modes have broader posture.

## Incorrect mappings or integrations

- Frozen main is upstream Milady base, not Alice authority.
- A public bind without API token exposes broad control.
- Cloud snapshot/restore/message bridge has no visible entrypoint auth.
- Echo fallback can appear healthy without a real AgentRuntime.
- Terminal action-level validation is unconditional.
- Browser sandbox networking/capabilities differ from standard sandbox.
- Audit defaults to bounded memory.
- Cross-file native symbol collisions require package/path namespacing.

## Risk and control posture

2 critical, 13 high, 5 medium, 1 canonicality blocker, 12 positive controls.

## P0 — admission blockers

- [ ] Fail startup on non-loopback bind without durable authentication and origin/TLS policy.
- [ ] Authenticate and authorize cloud bridge snapshot/restore/message routes.
- [ ] Ensure production readiness rejects echo fallback.
- [ ] Require execution-time policy for terminal, wallet, signing and plugin operations.

## P1 — required follow-up

- [ ] Reconcile Alice branches and protected divergences before declaring canonical Alice authority.
- [ ] Namespace and merge native symbols by package/path.
- [ ] Configure durable tamper-evident audit sinks and qualify browser sandbox exceptions.
- [ ] Repair dependency install and run typecheck/lint/tests/build.

## Incomplete graphification or qualification

- Alice branch authority is outside frozen main.
- Fresh qualification stopped during dependency installation.

## Query and maintenance rules

1. Start with an exact symbol, package or source path; then traverse a bounded neighborhood.
2. Confirm material architecture/security claims against source metadata.
3. Keep generated, vendored, compiled and media partitions from becoming false architecture hubs.
4. Do not merge this graph into an estate graph until canonicality, critical findings and fresh qualification are resolved.
5. If this repository advances, rebuild from the new commit and preserve this handoff as historical evidence rather than silently overwriting provenance.

## Evidence bundle retained outside the repository

- `milaidy_graphification_final_4dfb59cd.zip`
- `milaidy_GRAPHIFICATION_REVIEW.md`
- `milaidy_graph.html`
- `milaidy_NATIVE_TARGETED_graph.html`
- `milaidy_GRAPH_TREE.html`
- `milaidy_CALLFLOW.html`
- `milaidy_SOURCE_COVERAGE.csv`
- `milaidy_RISK_AND_CONTROL_REGISTER.csv`
- `milaidy_LINEAGE_REGISTER.csv`

The heavy graph artifacts remain in the RNDRNTWRK graphification artifact store. This PR intentionally carries only the reviewable handoff.

## Merge checklist

- [ ] Target branch head compared with the frozen graph commit
- [ ] Canonical ownership statement accepted
- [ ] Incorrect mappings reviewed with dependent repository owners
- [ ] P0 blockers assigned or explicitly risk-accepted
- [ ] Fresh build/test/deployment qualification plan recorded
- [ ] Evidence bundle retention location recorded
- [ ] Estate/global graph admission remains disabled until all gates close
