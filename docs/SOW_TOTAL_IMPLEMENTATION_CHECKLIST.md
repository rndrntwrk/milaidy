# SOW Total Implementation Checklist

This checklist is the execution tracker for implementing the SOW to completion.
It is intentionally exhaustive and designed to be used as an operational delivery document.

Use:
- Mark tasks complete only when acceptance criteria and evidence are both satisfied.
- Keep links to PRs, test runs, dashboards, and reports beside each item.
- Do not advance to the next phase gate until the current phase gate is passed.

Current status pre-check snapshot:
- Date: 2026-02-17
- Evidence basis: static repo review of autonomy kernel, API, persistence, and app UI code paths.
- Summary counts:
- `307` total checklist items.
- `169` items tagged `STATUS: CODED`.
- `38` items tagged `STATUS: PARTIAL`.
- `100` items currently untagged.
- Status legend:
- `STATUS: CODED` means code-level implementation exists in repo, but full acceptance evidence may still be missing.
- `STATUS: PARTIAL` means implementation exists but is incomplete, scoped down, optional, or not yet acceptance-ready.
- Tasks with no status tag are currently treated as not implemented or not evidenced.

## Immediate Execution Queue (Next 30 Tasks)

Selection policy:
- Chosen from `STATUS: PARTIAL` and untagged items only.
- Ordered by critical path to production-ready autonomy.

Phase split:
- Phase 0: 8 tasks
- Phase 2: 19 tasks
- Phase 3: 3 tasks

Sprint chunks:
- Sprint 1 (Tasks 1-10): Baseline observability + initial contract inventory.
- Sprint 2 (Tasks 11-20): Contract enforcement + durable workflow path.
- Sprint 3 (Tasks 21-30): Durability hardening + role integration controls.

### Phase 0 Queue

1. `P0-016` Build initial dashboards (operations + autonomy quality).
2. `P0-017` Define alert thresholds and paging policy.
3. `P0-018` Validate metric cardinality and storage retention cost.
4. `P0-019` Write metrics dictionary with definitions/formulas.
5. `P0-020` Define baseline scenarios representative of real usage.
6. `P0-021` Run baseline scenarios for at least one full measurement window.
7. `P0-025` Execute memory poisoning red-team baseline runs.
8. `P0-027` Produce baseline metrics report with charts.

### Phase 2 Queue

9. `P2-001` Build canonical inventory of all tools in runtime and plugins.
10. `P2-004` Define schema contract for every tool parameter.
11. `P2-007` Produce contract coverage report showing 100 percent tool coverage.
12. `P2-008` Ensure every tool call path passes through validator.
13. `P2-014` Define post-condition checks for each tool.
14. `P2-020` Add post-condition coverage report.
15. `P2-021` Produce workflow engine decision record (Temporal/Cadence/etc).
16. `P2-022` Implement workflow definitions for multi-step plan execution.
17. `P2-023` Implement durable workflow workers and task queue configuration.
18. `P2-025` Implement deterministic retries/idempotency strategy.
19. `P2-027` Verify workflow survives process restart.
20. `P2-029` Implement append-only durable event store.
21. `P2-031` Implement projection/rebuild utilities.
22. `P2-050` Fail closed on critical invariant violations.
23. `P2-055` Ensure audit exports can be generated for compliance review.
24. `P2-056` Validate tamper-evident or append-only guarantees.
25. `P2-059` Add durability tests across restarts.
26. `P2-061` Measure latency impact of validation/workflow orchestration.
27. `P2-062` Optimize bottlenecks and document before/after results.

### Phase 3 Queue

28. `P3-024` Implement Executor service behavior.
29. `P3-030` Integrate role dataflow across full lifecycle.
30. `P3-034` Validate no role bypasses contract or auth.

### Sprint 1 (Tasks 1-10)

1. `P0-016`
2. `P0-017`
3. `P0-018`
4. `P0-019`
5. `P0-020`
6. `P0-021`
7. `P0-025`
8. `P0-027`
9. `P2-001`
10. `P2-004`

### Sprint 2 (Tasks 11-20)

11. `P2-007`
12. `P2-008`
13. `P2-014`
14. `P2-020`
15. `P2-021`
16. `P2-022`
17. `P2-023`
18. `P2-025`
19. `P2-027`
20. `P2-029`

### Sprint 3 (Tasks 21-30)

21. `P2-031`
22. `P2-050`
23. `P2-055`
24. `P2-056`
25. `P2-059`
26. `P2-061`
27. `P2-062`
28. `P3-024`
29. `P3-030`
30. `P3-034`

---

## Global Program Controls (Must Exist Before Phase Work)

- [ ] G-001 Create program charter with scope, non-goals, assumptions, and constraints.
- [ ] G-002 Create RACI for PM, architecture, backend, frontend, QA, security, governance, ML, devops.
- [ ] G-003 Define release cadence (sprint rhythm, branch strategy, deployment windows).
- [ ] G-004 Create risk register with owner, likelihood, impact, mitigation, status.
- [ ] G-005 Define issue severity taxonomy (P0-P3) and SLA for response.
- [ ] G-006 Define quality gates for merge (tests, lint, typecheck, security checks).
- [ ] G-007 Define artifact storage locations for reports, benchmarks, and audits.
- [ ] G-008 Define naming/versioning convention for schemas, policies, and workflows.
- [ ] G-009 Define evidence template for "task done" (proof links required).
- [ ] G-010 Establish weekly steering review with go/no-go criteria.
- [ ] G-011 Define change-control process for SOW deltas and accepted scope changes.
- [ ] G-012 Define rollback policy for production changes.

---

## Phase 0: Baseline Specification (Weeks 1-4)

### 0.A Kickoff, Requirements, and Risk Parameters

- [ ] P0-001 Hold kickoff with stakeholders and document goals.
- [ ] P0-002 Capture risk tolerance and explicit approval thresholds.
- [ ] P0-003 Capture data privacy requirements and data handling classes.
- [ ] P0-004 Capture deployment constraints (local, cloud, loopback, network).
- [ ] P0-005 Capture success criteria and acceptance definitions.
- [ ] P0-006 Produce signed requirements baseline.

### 0.B Compute and Deployment Audit

- [ ] P0-007 Inventory CPU/GPU/memory/storage capacity for all target environments.
- [ ] P0-008 Inventory OS/runtime/toolchain versions.
- [ ] P0-009 Inventory container/orchestrator constraints if applicable.
- [ ] P0-010 Audit network exposure and loopback-only assumptions.
- [ ] P0-011 Identify single points of failure in runtime/storage/services.
- [ ] P0-012 Produce compute/deployment audit report.

### 0.C Instrumentation and Metrics Baseline

- [ ] P0-013 Define canonical metric list (tool success, VC, PSD, ICS, Recall@N, CFR, MPS, reward hacking). [STATUS: CODED]
- [ ] P0-014 Wire telemetry counters/histograms/gauges to runtime. [STATUS: CODED]
- [ ] P0-015 Expose metrics endpoint and verify scrape pipeline. [STATUS: CODED]
- [ ] P0-016 Build initial dashboards (operations + autonomy quality). [STATUS: CODED]
- [ ] P0-017 Define alert thresholds and paging policy. [STATUS: CODED]
- [ ] P0-018 Validate metric cardinality and storage retention cost. [STATUS: CODED]
- [ ] P0-019 Write metrics dictionary with definitions/formulas. [STATUS: CODED]

### 0.D Baseline Data Collection and Adversarial Baseline

- [ ] P0-020 Define baseline scenarios representative of real usage. [STATUS: CODED]
- [ ] P0-021 Run baseline scenarios for at least one full measurement window. [STATUS: CODED]
- [ ] P0-022 Capture tool success/failure with cause taxonomy.
- [ ] P0-023 Capture preference-following baseline.
- [ ] P0-024 Capture persona drift/sycophancy baseline.
- [ ] P0-025 Execute memory poisoning red-team baseline runs. [STATUS: CODED]
- [ ] P0-026 Document injection success rates and behavior impact.
- [ ] P0-027 Produce baseline metrics report with charts. [STATUS: CODED]

### 0.E Phase Gate

- [ ] P0-028 Publish Baseline Specification document.
- [ ] P0-029 Review and sign-off by PM + security + architecture + client.
- [ ] P0-030 Freeze Phase 0 outputs as reference baseline.

---

## Phase 1: Identity and Memory Perimeter (Weeks 5-8)

### 1.A Identity and Preference Model

- [ ] P1-001 Define IdentityConfig schema (name, values, boundaries, communication style, metadata). [STATUS: CODED]
- [ ] P1-002 Define preference model (scope, source, explicit/implicit, timestamp). [STATUS: CODED]
- [ ] P1-003 Define identity versioning and hash integrity strategy. [STATUS: CODED]
- [ ] P1-004 Define sanctioned identity update policy and approval rules. [STATUS: CODED]
- [ ] P1-005 Implement identity schema validation with clear error messages. [STATUS: CODED]
- [ ] P1-006 Implement identity integrity verification fail-closed behavior. [STATUS: CODED]
- [ ] P1-007 Implement identity history persistence and retrieval. [STATUS: CODED]
- [ ] P1-008 Add identity CRUD API endpoints. [STATUS: CODED]
- [ ] P1-009 Add CLI commands for identity read/update/version rollback.
- [ ] P1-010 Add audit logging for identity mutations. [STATUS: CODED]

### 1.B Persona Drift Monitoring and Goal Stack

- [ ] P1-011 Define drift dimensions and scoring formula. [STATUS: CODED]
- [ ] P1-012 Implement drift monitor analysis window and threshold config. [STATUS: CODED]
- [ ] P1-013 Implement drift alerts and callbacks. [STATUS: CODED]
- [ ] P1-014 Implement drift report persistence. [STATUS: CODED]
- [ ] P1-015 Implement goal stack data model and lifecycle states. [STATUS: CODED]
- [ ] P1-016 Implement goal push/pop/suspend/resume operations. [STATUS: CODED]
- [ ] P1-017 Add goal APIs for query/update. [STATUS: CODED]
- [ ] P1-018 Add goal transition event logging. [STATUS: CODED]

### 1.C Typed Memory Schema and Gate

- [ ] P1-019 Define typed memory classes (MESSAGE, FACT, DOCUMENT, RELATIONSHIP, GOAL, TASK, ACTION, PREFERENCE). [STATUS: CODED]
- [ ] P1-020 Define memory provenance fields and required constraints. [STATUS: CODED]
- [ ] P1-021 Define verifiability class semantics and transitions. [STATUS: CODED]
- [ ] P1-022 Implement durable memory store schema. [STATUS: CODED]
- [ ] P1-023 Implement quarantine store schema with expiry/review fields. [STATUS: CODED]
- [ ] P1-024 Implement gate decision outcomes (allow/quarantine/reject). [STATUS: CODED]
- [ ] P1-025 Implement gate size/capacity protections. [STATUS: CODED]
- [ ] P1-026 Implement quarantine hydration on startup. [STATUS: CODED]
- [ ] P1-027 Implement quarantine review APIs. [STATUS: CODED]
- [ ] P1-028 Implement gate observability (decision counters, queue size, latency). [STATUS: CODED]

### 1.D Trust Scoring and Retrieval Ranking

- [ ] P1-029 Define trust feature set and weight strategy. [STATUS: CODED]
- [ ] P1-030 Implement rule-based trust scorer. [STATUS: CODED]
- [ ] P1-031 Implement simple ML trust classifier baseline (logistic regression) and compare. [STATUS: CODED]
- [ ] P1-032 Define trust source reputation update mechanics. [STATUS: CODED]
- [ ] P1-033 Implement trust-aware retrieval rank formula. [STATUS: CODED]
- [ ] P1-034 Implement rank tuning configuration and guardrails. [STATUS: CODED]
- [ ] P1-035 Implement user trust-override policy with auditing. [STATUS: CODED]
- [ ] P1-036 Validate retrieval quality against baseline tasks. [STATUS: CODED]

### 1.E UI, Docs, and Training

- [ ] P1-037 Implement identity UI (view/edit/history/integrity indicators). [STATUS: CODED]
- [ ] P1-038 Implement quarantine review UI. [STATUS: CODED]
- [ ] P1-039 Implement preference UI with source/scope visibility. [STATUS: CODED]
- [ ] P1-040 Add operator docs for identity, gate, trust, retrieval. [STATUS: CODED]
- [ ] P1-041 Add troubleshooting runbook for drift and quarantine backlogs. [STATUS: CODED]
- [ ] P1-042 Run internal enablement session and record attendance/materials. [STATUS: PARTIAL]

### 1.F Phase Gate

- [ ] P1-043 Validate all identity/memory APIs with integration tests. [STATUS: CODED]
- [ ] P1-044 Validate fail-closed identity integrity behavior. [STATUS: CODED]
- [ ] P1-045 Validate quarantine lifecycle end-to-end. [STATUS: CODED]
- [ ] P1-046 Validate drift alerts fire at configured thresholds. [STATUS: CODED]
- [ ] P1-047 Publish Phase 1 acceptance report and sign-off. [STATUS: CODED]

---

## Phase 2: Verification Loops and Tool Contracts (Weeks 9-16)

### 2.A Tool Inventory and Contract Coverage

- [ ] P2-001 Build canonical inventory of all tools in runtime and plugins. [STATUS: CODED]
- [ ] P2-002 Classify each tool risk class (read-only, reversible, irreversible). [STATUS: CODED]
- [ ] P2-003 Define required permissions per tool. [STATUS: CODED]
- [ ] P2-004 Define schema contract for every tool parameter. [STATUS: CODED]
- [ ] P2-005 Add versioning for all tool contracts. [STATUS: CODED]
- [ ] P2-006 Add examples and negative test fixtures per tool. [STATUS: CODED]
- [ ] P2-007 Produce contract coverage report showing 100 percent tool coverage. [STATUS: CODED]

### 2.B Schema Validator Hard Enforcement

- [ ] P2-008 Ensure every tool call path passes through validator. [STATUS: CODED]
- [ ] P2-009 Reject unknown tools by default with explicit error code. [STATUS: CODED]
- [ ] P2-010 Reject malformed params with typed field-level errors. [STATUS: CODED]
- [ ] P2-011 Ensure validated/coerced params are what executor receives. [STATUS: CODED]
- [ ] P2-012 Add structured validation event logs. [STATUS: CODED]
- [ ] P2-013 Add fuzz tests for validator edge cases. [STATUS: CODED]

### 2.C Post-Conditions and Independent Verification

- [ ] P2-014 Define post-condition checks for each tool. [STATUS: CODED]
- [ ] P2-015 Implement per-check timeout and error handling policy. [STATUS: CODED]
- [ ] P2-016 Implement critical vs warning severity handling. [STATUS: CODED]
- [ ] P2-017 Implement independent verification query paths. [STATUS: CODED]
- [ ] P2-018 Implement verification result normalization schema. [STATUS: CODED]
- [ ] P2-019 Add failure taxonomy for verification outcomes. [STATUS: CODED]
- [ ] P2-020 Add post-condition coverage report. [STATUS: CODED]

### 2.D Durable Workflow Engine Integration

- [ ] P2-021 Produce workflow engine decision record (Temporal/Cadence/etc). [STATUS: CODED]
- [ ] P2-022 Implement workflow definitions for multi-step plan execution. [STATUS: CODED]
- [ ] P2-023 Implement durable workflow workers and task queue configuration. [STATUS: CODED]
- [ ] P2-024 Implement workflow start/status/cancel APIs. [STATUS: CODED]
- [ ] P2-025 Implement deterministic retries/idempotency strategy. [STATUS: CODED]
- [ ] P2-026 Implement workflow timeout and dead-letter behavior. [STATUS: CODED]
- [ ] P2-027 Verify workflow survives process restart. [STATUS: CODED]

### 2.E Event Sourcing and State Reconstruction

- [ ] P2-028 Define execution event schema and versioning. [STATUS: CODED]
- [ ] P2-029 Implement append-only durable event store. [STATUS: CODED]
- [ ] P2-030 Implement correlation IDs across pipeline/workflows. [STATUS: CODED]
- [ ] P2-031 Implement projection/rebuild utilities. [STATUS: CODED]
- [ ] P2-032 Implement event retention and archival policy. [STATUS: CODED]
- [ ] P2-033 Implement event integrity checks and backfill tooling. [STATUS: CODED]

### 2.F Saga and Compensation

- [ ] P2-034 Define compensation eligibility per tool. [STATUS: CODED]
- [ ] P2-035 Implement compensation registry entries for reversible tools. [STATUS: CODED]
- [ ] P2-036 Implement compensation execution policy on downstream failure. [STATUS: CODED]
- [ ] P2-037 Log compensation attempts/outcomes with reason. [STATUS: CODED]
- [ ] P2-038 Add compensation simulation tests. [STATUS: CODED]
- [ ] P2-039 Define unresolved compensation incident workflow. [STATUS: CODED]

### 2.G Approval Gate and Risk Controls

- [ ] P2-040 Implement approval queue for irreversible operations. [STATUS: CODED]
- [ ] P2-041 Implement approval expiry and timeout handling. [STATUS: CODED]
- [ ] P2-042 Implement approval persistence and startup hydration. [STATUS: CODED]
- [ ] P2-043 Implement approval resolve API with actor attribution. [STATUS: CODED]
- [ ] P2-044 Implement approval UI list/resolve/history. [STATUS: CODED]
- [ ] P2-045 Implement auto-approval policy for read-only paths. [STATUS: CODED]
- [ ] P2-046 Implement audit trail for all approval decisions. [STATUS: CODED]

### 2.H Cross-System Invariants

- [ ] P2-047 Define invariant catalog with severity and ownership. [STATUS: CODED]
- [ ] P2-048 Implement invariant checker with timeout protections. [STATUS: CODED]
- [ ] P2-049 Run invariants after every pipeline completion. [STATUS: CODED]
- [ ] P2-050 Fail closed on critical invariant violations. [STATUS: CODED]
- [ ] P2-051 Emit invariant metrics and events. [STATUS: CODED]
- [ ] P2-052 Add invariant regression tests. [STATUS: CODED]

### 2.I Logging, Auditability, and Immutability

- [ ] P2-053 Ensure all pipeline events are logged with timestamp and correlation ID. [STATUS: CODED]
- [ ] P2-054 Ensure decision logs include validation/approval/verification/invariant outcomes. [STATUS: CODED]
- [ ] P2-055 Ensure audit exports can be generated for compliance review. [STATUS: CODED]
- [ ] P2-056 Validate tamper-evident or append-only guarantees. [STATUS: CODED]

### 2.J Test and Performance Gate

- [ ] P2-057 Add unit tests for contracts, validator, verifier, invariants, approvals. [STATUS: CODED]
- [ ] P2-058 Add integration tests for full pipeline success/failure/compensation. [STATUS: CODED]
- [ ] P2-059 Add durability tests across restarts. [STATUS: CODED]
- [ ] P2-060 Add benchmark-driven tests where available. [STATUS: CODED]
- [ ] P2-061 Measure latency impact of validation/workflow orchestration. [STATUS: CODED]
- [ ] P2-062 Optimize bottlenecks and document before/after results. [STATUS: CODED]

### 2.K Phase Gate

- [ ] P2-063 Demonstrate >=99.5 percent success on reversible actions in test suite. [STATUS: CODED]
- [ ] P2-064 Demonstrate zero unauthorized irreversible actions. [STATUS: CODED]
- [ ] P2-065 Publish Phase 2 acceptance report and sign-off. [STATUS: CODED]

---

## Phase 3: Role Separation and State Machine (Months 5-6)

### 3.A Role Architecture and Contracts

- [ ] P3-001 Define Planner, Executor, Verifier, Memory Writer, Auditor responsibility boundaries. [STATUS: CODED]
- [ ] P3-002 Define request/response schemas for each role boundary. [STATUS: CODED]
- [ ] P3-003 Define role authn/authz model and trust boundaries. [STATUS: CODED]
- [ ] P3-004 Define rate limiting and backpressure strategy between roles. [STATUS: CODED]
- [ ] P3-005 Publish role interaction sequence diagrams. [STATUS: CODED]

### 3.B Service Scaffolding and Runtime Isolation

- [ ] P3-006 Implement role-specific service modules/processes. [STATUS: CODED]
- [ ] P3-007 Implement transport layer (REST/gRPC) or explicit in-process boundary adapters. [STATUS: CODED]
- [ ] P3-008 Enforce role auth and request validation on every call. [STATUS: CODED]
- [ ] P3-009 Implement retries/timeouts/circuit breakers for role calls. [STATUS: CODED]
- [ ] P3-010 Implement per-role health checks and readiness endpoints. [STATUS: CODED]

### 3.C State Externalization and Event Log

- [ ] P3-011 Externalize task state to persistent store. [STATUS: CODED]
- [ ] P3-012 Persist invariant decisions and safe-mode transitions. [STATUS: CODED]
- [ ] P3-013 Ensure strict ordering guarantees where required. [STATUS: CODED]
- [ ] P3-014 Implement conflict handling for concurrent updates. [STATUS: CODED]
- [ ] P3-015 Validate state reconstruction with replay tests. [STATUS: CODED]

### 3.D Safe Mode Design and Enforcement

- [ ] P3-016 Define safe-mode triggers (error bursts, drift threshold, policy breach). [STATUS: CODED]
- [ ] P3-017 Define safe-mode restrictions by tool class. [STATUS: CODED]
- [ ] P3-018 Implement safe-mode state transitions in state machine. [STATUS: CODED]
- [ ] P3-019 Implement safe-mode entry events and notifications. [STATUS: CODED]
- [ ] P3-020 Implement safe-mode exit rules with trust floors/approvals. [STATUS: CODED]
- [ ] P3-021 Implement safe-mode API endpoints. [STATUS: CODED]
- [ ] P3-022 Implement safe-mode UI controls and status panel. [STATUS: CODED]

### 3.E Role Implementations

- [ ] P3-023 Implement Planner service behavior. [STATUS: CODED]
- [ ] P3-024 Implement Executor service behavior. [STATUS: CODED]
- [ ] P3-025 Implement Verifier service behavior. [STATUS: CODED]
- [ ] P3-026 Implement Memory Writer service behavior. [STATUS: CODED]
- [ ] P3-027 Implement Auditor service behavior. [STATUS: CODED]
- [ ] P3-028 Define and implement role-level telemetry. [STATUS: CODED]
- [ ] P3-029 Add role-level unit tests for each service. [STATUS: CODED]

### 3.F Integration and End-to-End Tests

- [ ] P3-030 Integrate role dataflow across full lifecycle. [STATUS: CODED]
- [ ] P3-031 Validate full lifecycle under nominal conditions. [STATUS: CODED]
- [ ] P3-032 Validate full lifecycle under partial failures. [STATUS: CODED]
- [ ] P3-033 Validate safe-mode trigger and recovery behavior. [STATUS: CODED]
- [ ] P3-034 Validate no role bypasses contract or auth. [STATUS: CODED]
- [ ] P3-035 Validate state consistency under concurrency. [STATUS: CODED]

### 3.G Observability and Drift Reduction

- [ ] P3-036 Build dashboards for role throughput/errors/latency. [STATUS: CODED]
- [ ] P3-037 Build dashboards for PSD/ICS/safe-mode frequency. [STATUS: CODED]
- [ ] P3-038 Run long-horizon scenarios and compare against baseline. [STATUS: CODED]
- [ ] P3-039 Tune thresholds based on empirical data. [STATUS: CODED]

### 3.H Phase Gate

- [ ] P3-040 Demonstrate PSD and identity-violation reductions against baseline target. [STATUS: CODED]
- [ ] P3-041 Demonstrate safe-mode operates correctly under induced incidents. [STATUS: CODED]
- [ ] P3-042 Publish Phase 3 acceptance report and sign-off. [STATUS: CODED]

---

## Phase 4: Reliability-Oriented Learning and Reward Shaping (Months 7-9)

### 4.A Data and Labeling Pipeline

- [ ] P4-001 Define dataset schema for tool traces and labels. [STATUS: PARTIAL]
- [ ] P4-002 Implement data extraction from event logs. [STATUS: PARTIAL]
- [ ] P4-003 Implement de-identification/anonymization pipeline.
- [ ] P4-004 Implement quality filters for training examples.
- [ ] P4-005 Implement labeling guidelines and QA sampling.
- [ ] P4-006 Build held-out validation split.
- [ ] P4-007 Build adversarial split for robustness.

### 4.B Prompt and Reasoning Controls

- [ ] P4-008 Design prompt templates for planning/execution/verifier contexts. [STATUS: PARTIAL]
- [ ] P4-009 Add explicit truthfulness/anti-sycophancy prompt constraints. [STATUS: PARTIAL]
- [ ] P4-010 Add explicit tool-use reasoning guardrails. [STATUS: PARTIAL]
- [ ] P4-011 A/B test prompt variants on held-out scenarios. [STATUS: PARTIAL]

### 4.C Fine-Tuning Infrastructure

- [ ] P4-012 Stand up training environment and reproducible configs. [STATUS: PARTIAL]
- [ ] P4-013 Implement training job orchestration scripts. [STATUS: PARTIAL]
- [ ] P4-014 Implement experiment tracking and artifact registry. [STATUS: PARTIAL]
- [ ] P4-015 Implement checkpoint management and rollback strategy. [STATUS: PARTIAL]
- [ ] P4-016 Implement cost/performance budget tracking.

### 4.D Verifiable Reward and RLVR

- [ ] P4-017 Define checkpoint reward function tied to verifier/invariants. [STATUS: CODED]
- [ ] P4-018 Implement reward computation pipeline. [STATUS: CODED]
- [ ] P4-019 Implement RLVR training loop with guardrails. [STATUS: PARTIAL]
- [ ] P4-020 Implement anti-reward-gaming constraints. [STATUS: PARTIAL]
- [ ] P4-021 Validate reward correlates with true task success. [STATUS: PARTIAL]

### 4.E Adversarial and Poisoning Resilience

- [ ] P4-022 Curate prompt-injection attack set. [STATUS: CODED]
- [ ] P4-023 Curate memory-poisoning attack set. [STATUS: CODED]
- [ ] P4-024 Train/evaluate on adversarial examples. [STATUS: PARTIAL]
- [ ] P4-025 Measure MPS before/after and document deltas. [STATUS: PARTIAL]

### 4.F Model Evaluation and Selection

- [ ] P4-026 Evaluate single-step and long-horizon task performance. [STATUS: PARTIAL]
- [ ] P4-027 Evaluate preference adherence metrics. [STATUS: PARTIAL]
- [ ] P4-028 Evaluate persona drift and sycophancy impact. [STATUS: PARTIAL]
- [ ] P4-029 Evaluate reward hacking rate. [STATUS: PARTIAL]
- [ ] P4-030 Run safety review for candidate model. [STATUS: PARTIAL]
- [ ] P4-031 Select model using explicit weighted criteria. [STATUS: PARTIAL]

### 4.G Deployment Into Roles

- [ ] P4-032 Integrate selected model with planner/executor roles. [STATUS: PARTIAL]
- [ ] P4-033 Validate runtime compatibility and fallback behavior. [STATUS: PARTIAL]
- [ ] P4-034 Implement staged rollout (canary then wider rollout).
- [ ] P4-035 Implement rollback trigger thresholds.
- [ ] P4-036 Monitor rollout metrics for regressions.

### 4.H Phase Gate

- [ ] P4-037 Demonstrate long-horizon improvement target vs baseline.
- [ ] P4-038 Demonstrate no increase in sycophancy and no critical regressions.
- [ ] P4-039 Demonstrate reward hacking remains within acceptable threshold.
- [ ] P4-040 Publish Phase 4 acceptance report and sign-off.

---

## Phase 5: Domain Capability Packs and Governance (Months 10-12)

### 5.A Domain Selection and Requirements

- [ ] P5-001 Select initial domain with stakeholder approval.
- [ ] P5-002 Document domain systems and integration points.
- [ ] P5-003 Document domain compliance obligations.
- [ ] P5-004 Define domain invariants and approval rules.
- [ ] P5-005 Define domain benchmark suite and SLA metrics.

### 5.B Domain Pack Build

- [ ] P5-006 Implement domain tool schemas and contracts. [STATUS: PARTIAL]
- [ ] P5-007 Implement domain connectors/adapters. [STATUS: PARTIAL]
- [ ] P5-008 Implement domain workflow templates. [STATUS: PARTIAL]
- [ ] P5-009 Implement domain-specific safe-mode triggers. [STATUS: PARTIAL]
- [ ] P5-010 Implement domain test fixtures and synthetic data.
- [ ] P5-011 Implement domain E2E tests. [STATUS: PARTIAL]

### 5.C Governance and Retention

- [ ] P5-012 Define policy model for domain governance. [STATUS: PARTIAL]
- [ ] P5-013 Decide governance engine approach (OPA/Rego or approved alternative). [STATUS: PARTIAL]
- [ ] P5-014 Implement runtime policy evaluation hooks. [STATUS: PARTIAL]
- [ ] P5-015 Implement policy versioning and change audit. [STATUS: PARTIAL]
- [ ] P5-016 Implement retention schedules by event/data class. [STATUS: PARTIAL]
- [ ] P5-017 Implement compliance export tooling (CSV/Parquet or equivalent). [STATUS: PARTIAL]
- [ ] P5-018 Validate audit log immutability requirements.

### 5.D Pilot Preparation and Execution

- [ ] P5-019 Define pilot goals, timeline, and participant criteria.
- [ ] P5-020 Build pilot sandbox environment.
- [ ] P5-021 Load anonymized/synthetic domain data.
- [ ] P5-022 Train pilot users on approvals/safe-mode/UI.
- [ ] P5-023 Execute pilot and collect metrics/feedback/issues.
- [ ] P5-024 Triage pilot issues by severity and root cause.
- [ ] P5-025 Apply remediation updates from pilot findings.

### 5.E Compliance Review and Handover

- [ ] P5-026 Run independent compliance review.
- [ ] P5-027 Validate all mandatory governance controls operational.
- [ ] P5-028 Publish domain pack runbook and operator guide.
- [ ] P5-029 Publish final architecture and API references.
- [ ] P5-030 Conduct knowledge transfer sessions.
- [ ] P5-031 Execute project retrospective and transition to maintenance.

### 5.F Phase Gate

- [ ] P5-032 Demonstrate domain benchmark pass rate target.
- [ ] P5-033 Demonstrate compliance audit pass or documented exception approvals.
- [ ] P5-034 Publish Phase 5 acceptance report and sign-off.

---

## Cross-Cutting Security, Quality, and Operations Checklist

- [ ] X-001 Threat model updated for each phase milestone.
- [ ] X-002 Static analysis and dependency scans integrated in CI.
- [ ] X-003 Secrets management policy enforced across environments.
- [ ] X-004 Access controls reviewed for all APIs/services.
- [ ] X-005 Backup and disaster recovery tests completed.
- [ ] X-006 Incident response runbooks updated and tested.
- [ ] X-007 Load tests run at expected concurrency with headroom.
- [ ] X-008 SLOs defined and error budgets tracked.
- [ ] X-009 Change failure rate tracked and reported.
- [ ] X-010 Mean time to recovery tracked and reported.
- [ ] X-011 API backward compatibility checks added.
- [ ] X-012 Data migration playbooks created and rehearsed.
- [ ] X-013 Production rollback drill executed.
- [ ] X-014 Privacy compliance review completed.
- [ ] X-015 Penetration test or equivalent security validation completed.
- [ ] X-016 Release notes generated for each production release.
- [ ] X-017 Runbooks validated by on-call team.
- [ ] X-018 Ownership map maintained for all critical components.

---

## Evidence Pack Checklist (Required for Final Acceptance)

- [ ] E-001 Baseline Specification report.
- [ ] E-002 Metrics dictionary and dashboard URLs.
- [ ] E-003 Red-team memory poisoning report with reproducible method.
- [ ] E-004 Tool inventory and 100 percent contract coverage report.
- [ ] E-005 Verification/invariant coverage report.
- [ ] E-006 Workflow durability test report (restart survival).
- [ ] E-007 Approval audit log exports and sample review.
- [ ] E-008 Phase 3 role-separation architecture and test report.
- [ ] E-009 Phase 4 training/evaluation report and model card.
- [ ] E-010 Reward hacking test report.
- [ ] E-011 Domain pilot report and remediation log.
- [ ] E-012 Compliance audit report and exceptions register.
- [ ] E-013 Final handover documentation set.

---

## Definition of Total Completion (All Must Be True)

- [ ] T-001 All phase gates P0 through P5 are signed off.
- [ ] T-002 No open P0/P1 severity defects.
- [ ] T-003 All mandatory evidence artifacts E-001 through E-013 exist and are approved.
- [ ] T-004 Production monitoring and on-call operations are active and tested.
- [ ] T-005 Governance/compliance controls are operating with audit trail.
- [ ] T-006 Client acceptance statement is signed.
