# Milaidy Autonomy Kernel — Detailed Technical Plan

**Branch:** `rasp`
**SOW Reference:** `sow.pdf` — "Implementation Plan: Transforming Milaidy into a Frontier-AGI-Level Agent"
**Created:** 2026-02-15
**Architecture Level:** Frontier-AGI Autonomy Kernel

---

## 1. Executive Summary

This plan provides a sprint-level technical blueprint for implementing the SOW's 6-phase Autonomy Kernel on top of the existing `rasp` branch infrastructure. Each deliverable specifies exact files, interfaces, integration points with ElizaOS (`@elizaos/core` v2.0.0-alpha.10), and acceptance criteria.

### Current State → Target State

| Dimension | Current (`rasp`) | Target (SOW Complete) |
|-----------|-----------------|----------------------|
| **Identity** | `IdentityConfig` type (name/theme/emoji/avatar) | Identity Perimeter with memory gates, trust scoring, persona drift monitoring |
| **Memory** | ElizaOS built-in `createMemory`/`MemoryManager` + qmd backend | Typed memory objects with provenance, write gates, trust-scored retrieval |
| **Tool Invocation** | `Action` interface with allow/deny lists per agent | Tool Contract JSON schemas, pre/post-condition validators, saga orchestration |
| **Agent Architecture** | Single `AgentRuntime` with `processActions` | Hierarchical: Planner → Executor → Verifier → Memory Writer → Auditor |
| **Learning** | Static character + ElizaOS evaluators | RLVR reward shaping, adversarial training harness |
| **Governance** | Plugin permissions, rate limiting | Domain capability packs, compliance framework, dynamic governance |

### Relationship to IMPROVEMENT_PLAN.md

The existing `IMPROVEMENT_PLAN.md` (security hardening, 16-20 weeks) addresses infrastructure prerequisites. This technical plan **builds on top of** that foundation — it does not replace it. Where the improvement plan provides secure storage, plugin sandboxing, and observability, this plan layers the SOW's cognitive architecture on those primitives.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MILAIDY AUTONOMY KERNEL                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │   AUDITOR    │  │   PLANNER    │  │   VERIFIER   │               │
│  │  (Phase 3)   │  │  (Phase 3)   │  │  (Phase 2)   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
│         │                  │                  │                       │
│  ┌──────▼──────────────────▼──────────────────▼───────┐              │
│  │              GOVERNED STATE MACHINE                  │              │
│  │         (Phase 3 — Role Orchestrator)                │              │
│  └──────────────────────┬──────────────────────────────┘              │
│                          │                                            │
│  ┌───────────────┬───────┴───────┬──────────────────┐                │
│  │               │               │                   │                │
│  │  ┌────────────▼─┐  ┌─────────▼──────┐  ┌────────▼───────┐       │
│  │  │  IDENTITY    │  │  TOOL CONTRACT │  │  MEMORY WRITER │       │
│  │  │  PERIMETER   │  │  ENGINE        │  │  (Phase 3)     │       │
│  │  │  (Phase 1)   │  │  (Phase 2)     │  │                │       │
│  │  └──────────────┘  └────────────────┘  └────────────────┘       │
│  │                                                                   │
│  │  ┌──────────────────────────────────────────────────┐            │
│  │  │         RLVR / REWARD SHAPING (Phase 4)          │            │
│  │  └──────────────────────────────────────────────────┘            │
│  │                                                                   │
│  │  ┌──────────────────────────────────────────────────┐            │
│  │  │  DOMAIN CAPABILITY PACKS + GOVERNANCE (Phase 5)  │            │
│  │  └──────────────────────────────────────────────────┘            │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                     EXISTING INFRASTRUCTURE                          │
│  EventBus │ DI Container │ Plugin Permissions │ Telemetry │ Auth    │
│  ElizaOS AgentRuntime │ Actions │ Providers │ Services              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 0: Baseline Specification (Sprints 0.1–0.2, ~2 weeks)

### 3.1 Objective

Establish measurement baselines, formalize the identity schema, and set up the testing harness that all subsequent phases rely on.

### 3.2 Deliverables

#### 3.2.1 Baseline Metrics Harness

**File:** `src/autonomy/metrics/baseline-harness.ts`

```typescript
/**
 * Baseline measurement harness for tracking agent performance
 * across the SOW's key metrics dimensions.
 */

export interface BaselineMetrics {
  /** Preference-following accuracy (0-1). SOW target: ≥0.92 */
  preferenceFollowingAccuracy: number;
  /** Instruction completion rate (0-1). SOW target: ≥0.88 */
  instructionCompletionRate: number;
  /** Persona drift score (0-1, lower is better). SOW target: ≤0.05 */
  personaDriftScore: number;
  /** Memory poisoning resistance (0-1). SOW target: ≥0.95 */
  memoryPoisoningResistance: number;
  /** Compounding error rate over N-turn sequences. SOW target: ≤0.03 */
  compoundingErrorRate: number;
  /** Sycophancy score (0-1, lower is better). SOW target: ≤0.10 */
  sycophancyScore: number;
  /** Measured at turn count N */
  turnCount: number;
  /** Timestamp of measurement */
  measuredAt: number;
}

export interface BaselineHarness {
  /** Run a structured evaluation suite and return metrics */
  measure(agentId: string, evaluationSuite: string): Promise<BaselineMetrics>;
  /** Store a baseline snapshot for comparison */
  snapshot(metrics: BaselineMetrics, label: string): Promise<void>;
  /** Compare current metrics against a stored baseline */
  compare(current: BaselineMetrics, baselineLabel: string): Promise<MetricsDelta>;
}
```

**Integration point:** Uses the existing `metrics` singleton from `src/telemetry/setup.ts` for histogram recording and the event bus for `system:metrics:baseline` events.

#### 3.2.2 Identity Schema Extension

**File:** `src/autonomy/identity/schema.ts`

The SOW requires a much richer identity than ElizaOS's `IdentityConfig` (which is just `{name, theme, emoji, avatar}`). We extend it without breaking the base type.

```typescript
import type { IdentityConfig } from "@elizaos/core";

/**
 * Extended identity configuration for the Autonomy Kernel.
 * Superset of ElizaOS IdentityConfig.
 */
export interface AutonomyIdentityConfig extends IdentityConfig {
  /** Core values that govern agent behavior (immutable after initialization). */
  coreValues: string[];
  /** Communication style constraints. */
  communicationStyle: {
    tone: "formal" | "casual" | "technical" | "empathetic";
    verbosity: "concise" | "balanced" | "detailed";
    personaVoice: string; // Free-text persona description
  };
  /** Behavioral boundaries the agent must never cross. */
  hardBoundaries: string[];
  /** Soft preferences that can be adjusted with high-trust user requests. */
  softPreferences: Record<string, unknown>;
  /** Cryptographic hash of the identity at initialization time. */
  identityHash?: string;
  /** Version counter — incremented on any sanctioned identity change. */
  identityVersion: number;
}
```

**Integration point:** The `AgentConfig.identity` field in `src/config/types.agents.ts` currently references `IdentityConfig` from `@elizaos/core`. We will add a parallel `autonomyIdentity?: AutonomyIdentityConfig` field so the basic ElizaOS identity remains untouched.

#### 3.2.3 Evaluation Test Suite

**File:** `test/autonomy/baseline-evaluation.test.ts`

Structured evaluation scenarios covering:
- **Preference following:** 50 prompt→expected-behavior pairs drawn from agent character definition
- **Instruction completion:** Multi-step task sequences (3, 5, 10, 20 turns)
- **Persona consistency:** Character-probing adversarial prompts
- **Memory integrity:** Injection attempts against the memory system

**Dependencies:** `vitest` (already configured), evaluation datasets stored in `test/fixtures/autonomy/`.

### 3.3 New Files

```
src/autonomy/                          # NEW: Autonomy Kernel root
├── metrics/
│   ├── baseline-harness.ts            # Baseline measurement
│   └── types.ts                       # Shared metric types
├── identity/
│   └── schema.ts                      # Extended identity types
test/autonomy/
├── baseline-evaluation.test.ts        # Evaluation harness
└── fixtures/                          # Evaluation datasets
    ├── preference-following.json
    ├── instruction-completion.json
    └── adversarial-probes.json
```

### 3.4 Config Changes

Add to `MilaidyConfig` in `src/config/types.milaidy.ts`:

```typescript
/** Autonomy Kernel configuration. */
autonomy?: {
  /** Enable the Autonomy Kernel (default: false). */
  enabled?: boolean;
  /** Baseline metrics storage path. */
  metricsStorePath?: string;
};
```

### 3.5 Acceptance Criteria

- [ ] Baseline harness runs against a live agent and produces `BaselineMetrics`
- [ ] Identity schema validates and serializes round-trip
- [ ] Evaluation test suite passes with documented baseline numbers
- [ ] All metrics emit to the existing telemetry system

---

## 4. Phase 1: Identity & Memory Perimeter (Sprints 1.1–1.4, ~4 weeks)

### 4.1 Objective

Build the Identity Perimeter — the SOW's first defensive layer that protects agent identity from drift and memory from poisoning.

### 4.2 Architecture

```
                    ┌──────────────────────┐
                    │  Incoming Message /   │
                    │  Memory Write Request │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   TRUST SCORER       │
                    │  (source, content,   │
                    │   history analysis)  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   MEMORY GATE        │
                    │  trust ≥ threshold?  │
                    │  ┌─ YES: write       │
                    │  └─ NO: quarantine   │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                  │
    ┌─────────▼──────┐ ┌──────▼──────┐ ┌────────▼──────┐
    │ Typed Memory   │ │ Quarantine  │ │ Persona Drift │
    │ Store          │ │ Buffer      │ │ Monitor       │
    │ (with provenance│ │             │ │               │
    │  and trust)    │ └─────────────┘ └───────────────┘
    └────────────────┘
```

### 4.3 Deliverables

#### 4.3.1 Trust Scorer

**File:** `src/autonomy/trust/scorer.ts`

```typescript
export interface TrustScore {
  /** Overall trust (0-1). */
  score: number;
  /** Per-dimension trust breakdown. */
  dimensions: {
    sourceReliability: number;    // Is the source known and trusted?
    contentConsistency: number;   // Does content align with existing knowledge?
    temporalCoherence: number;    // Is the timing/sequence plausible?
    instructionAlignment: number; // Does it align with agent's instructions?
  };
  /** Explanation chain for auditability. */
  reasoning: string[];
  /** Timestamp */
  computedAt: number;
}

export interface TrustScorerConfig {
  /** Minimum trust for automatic memory writes (default: 0.7). */
  writeThreshold: number;
  /** Trust below this triggers quarantine (default: 0.3). */
  quarantineThreshold: number;
  /** Enable LLM-based content analysis (more accurate, higher latency). */
  llmAnalysis: boolean;
  /** Historical window for source reliability (messages). */
  historyWindow: number;
}

export interface TrustScorer {
  /** Score a piece of content from a given source. */
  score(content: string, source: TrustSource, context: TrustContext): Promise<TrustScore>;
  /** Update source reliability based on feedback. */
  updateSourceReliability(sourceId: string, feedback: "positive" | "negative"): void;
  /** Get current trust level for a source. */
  getSourceTrust(sourceId: string): number;
}
```

**Integration points:**
- Plugs into ElizaOS `evaluatePre()` as a pre-evaluator that annotates incoming messages with trust scores
- Emits `security:trust:scored` event on the `TypedEventBus`
- Uses `AgentRuntime.useModel()` for optional LLM-based analysis

#### 4.3.2 Memory Gate

**File:** `src/autonomy/memory/gate.ts`

```typescript
import type { Memory } from "@elizaos/core";

export interface MemoryGateDecision {
  action: "allow" | "quarantine" | "reject";
  trustScore: TrustScore;
  reason: string;
  /** If quarantined, when to auto-review. */
  reviewAfterMs?: number;
}

export interface TypedMemoryObject extends Memory {
  /** Trust score at write time. */
  trustScore: number;
  /** Provenance chain: who wrote this and why. */
  provenance: {
    source: string;
    sourceType: "user" | "agent" | "plugin" | "system";
    action: string;
    timestamp: number;
    trustScoreAtWrite: number;
  };
  /** Memory classification. */
  memoryType: "fact" | "instruction" | "preference" | "observation" | "goal";
  /** Whether this memory has been verified by a human or verifier. */
  verified: boolean;
}

export interface MemoryGate {
  /** Evaluate whether a memory write should proceed. */
  evaluate(memory: Memory, source: TrustSource): Promise<MemoryGateDecision>;
  /** Get all quarantined memories pending review. */
  getQuarantined(): Promise<TypedMemoryObject[]>;
  /** Approve or reject a quarantined memory. */
  reviewQuarantined(memoryId: string, decision: "approve" | "reject"): Promise<void>;
}
```

**Integration point:** Wraps `AgentRuntime.createMemory()`. The gate intercepts all memory writes, scores them, and routes accordingly. The quarantine buffer uses a separate database table (via ElizaOS's `IDatabaseAdapter`).

#### 4.3.3 Persona Drift Monitor

**File:** `src/autonomy/identity/drift-monitor.ts`

```typescript
export interface DriftReport {
  /** Current drift magnitude (0-1). */
  driftScore: number;
  /** Per-dimension drift. */
  dimensions: {
    valueAlignment: number;     // Are responses consistent with core values?
    styleConsistency: number;   // Has communication style changed?
    boundaryRespect: number;    // Are hard boundaries being maintained?
    topicFocus: number;         // Is the agent staying on-mission?
  };
  /** Sliding window of recent interactions analyzed. */
  windowSize: number;
  /** Alert level. */
  severity: "none" | "low" | "medium" | "high" | "critical";
  /** Corrective actions taken or recommended. */
  corrections: string[];
}

export interface PersonaDriftMonitor {
  /** Analyze recent agent output for persona drift. */
  analyze(recentOutputs: string[], identity: AutonomyIdentityConfig): Promise<DriftReport>;
  /** Get the current drift state. */
  getCurrentDrift(): DriftReport;
  /** Register a callback for drift alerts. */
  onDriftAlert(handler: (report: DriftReport) => void): () => void;
}
```

**Integration point:** Runs as an ElizaOS `Evaluator` (post-response phase). After each agent response, the evaluator feeds the output to the drift monitor. High drift triggers corrective system prompts injected via a `Provider`.

#### 4.3.4 Goal Manager

**File:** `src/autonomy/goals/manager.ts`

```typescript
export interface Goal {
  id: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "active" | "completed" | "paused" | "failed";
  /** Parent goal for hierarchical decomposition. */
  parentGoalId?: string;
  /** Success criteria (machine-evaluable when possible). */
  successCriteria: string[];
  /** Created by (user, system, or agent-proposed). */
  source: "user" | "system" | "agent";
  /** Trust score of the source at creation time. */
  sourceTrust: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface GoalManager {
  addGoal(goal: Omit<Goal, "id" | "createdAt" | "updatedAt">): Promise<Goal>;
  updateGoal(goalId: string, update: Partial<Goal>): Promise<Goal>;
  getActiveGoals(): Promise<Goal[]>;
  getGoalTree(rootGoalId: string): Promise<Goal[]>;
  /** Evaluate whether a goal's success criteria have been met. */
  evaluateGoal(goalId: string): Promise<{ met: boolean; evidence: string[] }>;
}
```

**Integration point:** Goals are stored as ElizaOS memories of type `"goal"` using `TypedMemoryObject`. The goal manager is registered in the DI container (`TOKENS.GoalManager`). The `planner` role (Phase 3) consumes goals to drive action planning.

### 4.4 New Files

```
src/autonomy/
├── trust/
│   ├── scorer.ts                      # Trust scoring engine
│   ├── source-tracker.ts              # Source reliability tracking
│   └── types.ts                       # Trust-related types
├── memory/
│   ├── gate.ts                        # Memory write gate
│   ├── quarantine.ts                  # Quarantine buffer management
│   ├── typed-memory.ts                # TypedMemoryObject utilities
│   └── provenance.ts                  # Provenance chain tracking
├── identity/
│   ├── drift-monitor.ts               # Persona drift detection
│   ├── drift-corrector.ts             # Corrective prompt injection
│   └── identity-hash.ts               # Identity integrity verification
├── goals/
│   ├── manager.ts                     # Goal lifecycle management
│   └── evaluator.ts                   # Goal completion evaluation
```

### 4.5 Event Bus Extensions

Add to `MilaidyEvents` in `src/events/event-bus.ts`:

```typescript
// ── Identity & Memory Events ──────────────────────────────────────
"autonomy:trust:scored": {
  sourceId: string;
  contentHash: string;
  score: TrustScore;
};
"autonomy:memory:gated": {
  memoryId: string;
  decision: "allow" | "quarantine" | "reject";
  trustScore: number;
  reason: string;
};
"autonomy:memory:quarantine:reviewed": {
  memoryId: string;
  decision: "approve" | "reject";
  reviewedBy: string;
};
"autonomy:identity:drift": {
  agentId: string;
  driftScore: number;
  severity: string;
  corrections: string[];
};
"autonomy:goal:created": {
  goalId: string;
  description: string;
  priority: string;
  source: string;
};
"autonomy:goal:completed": {
  goalId: string;
  evidence: string[];
};
```

### 4.6 DI Container Extensions

Add to `TOKENS` in `src/di/container.ts`:

```typescript
// Autonomy Kernel (Phase 1)
TrustScorer: createToken<import("../autonomy/trust/scorer.js").TrustScorer>("TrustScorer"),
MemoryGate: createToken<import("../autonomy/memory/gate.js").MemoryGate>("MemoryGate"),
DriftMonitor: createToken<import("../autonomy/identity/drift-monitor.js").PersonaDriftMonitor>("DriftMonitor"),
GoalManager: createToken<import("../autonomy/goals/manager.js").GoalManager>("GoalManager"),
```

### 4.7 Config Changes

Extend `autonomy` config section:

```typescript
autonomy?: {
  enabled?: boolean;
  metricsStorePath?: string;
  /** Trust scoring configuration. */
  trust?: {
    writeThreshold?: number;       // default: 0.7
    quarantineThreshold?: number;  // default: 0.3
    llmAnalysis?: boolean;         // default: false
    historyWindow?: number;        // default: 100
  };
  /** Memory gate configuration. */
  memoryGate?: {
    enabled?: boolean;             // default: true when autonomy.enabled
    quarantineReviewMs?: number;   // default: 3600000 (1 hour)
    maxQuarantineSize?: number;    // default: 1000
  };
  /** Persona drift monitoring. */
  driftMonitor?: {
    enabled?: boolean;
    analysisWindowSize?: number;   // default: 20
    alertThreshold?: number;       // default: 0.15
    correctionThreshold?: number;  // default: 0.25
  };
};
```

### 4.8 Acceptance Criteria (per SOW)

- [ ] Trust scorer produces consistent scores for known-good and known-adversarial inputs
- [ ] Memory gate blocks >95% of synthetic poisoning attempts
- [ ] Persona drift monitor detects intentional drift within 5 turns
- [ ] Goal manager supports hierarchical decomposition with proper trust gating
- [ ] All components emit structured events on the event bus
- [ ] All components registered in DI container and configurable via `milaidy.json`
- [ ] Unit tests: >85% coverage for all Phase 1 modules
- [ ] Integration test: End-to-end flow from message → trust score → memory gate → stored/quarantined

---

## 5. Phase 2: Verification Loops & Tool Contracts (Sprints 2.1–2.4, ~4 weeks)

### 5.1 Objective

Ensure every tool invocation is governed by a machine-readable contract with pre-conditions, post-conditions, and verification.

### 5.2 Architecture

```
         ┌────────────────┐
         │ Agent decides   │
         │ to invoke tool  │
         └────────┬───────┘
                   │
         ┌────────▼────────┐
         │ TOOL CONTRACT    │
         │ Schema Lookup    │
         │ (JSON Schema)    │
         └────────┬────────┘
                   │
         ┌────────▼────────┐
         │ PRE-CONDITION    │
         │ VALIDATOR        │
         │ - Input schema   │
         │ - Permission     │
         │ - Rate limits    │
         │ - Trust check    │
         └────────┬────────┘
                   │ pass?
              YES ─┤─ NO → reject + log
                   │
         ┌────────▼────────┐
         │ EXECUTE ACTION   │
         │ (ElizaOS         │
         │  processActions) │
         └────────┬────────┘
                   │
         ┌────────▼────────┐
         │ POST-CONDITION   │
         │ VERIFIER          │
         │ - Output schema  │
         │ - Side-effect    │
         │   assertions     │
         │ - Invariant      │
         │   checks         │
         └────────┬────────┘
                   │ pass?
              YES ─┤─ NO → rollback + alert
                   │
         ┌────────▼────────┐
         │ COMMIT RESULT    │
         │ + Audit Log      │
         └─────────────────┘
```

### 5.3 Deliverables

#### 5.3.1 Tool Contract Schema

**File:** `src/autonomy/tools/contract.ts`

```typescript
import type { Action } from "@elizaos/core";

export interface ToolContract {
  /** Action name this contract governs. */
  actionName: string;
  /** Semantic version of this contract. */
  version: string;
  /** Human-readable description of what this tool does. */
  description: string;

  /** Pre-conditions that must hold before execution. */
  preconditions: {
    /** JSON Schema for input validation. */
    inputSchema: Record<string, unknown>;
    /** Required trust level for the requesting source. */
    minTrustScore: number;
    /** Required plugin permissions. */
    requiredPermissions: string[];
    /** Rate limit (invocations per window). */
    rateLimit?: { max: number; windowMs: number };
    /** Custom predicate functions (serialized as expression strings). */
    predicates?: string[];
  };

  /** Post-conditions that must hold after execution. */
  postconditions: {
    /** JSON Schema for output validation. */
    outputSchema: Record<string, unknown>;
    /** Invariants that must still hold (state assertions). */
    invariants?: string[];
    /** Maximum execution time before timeout. */
    maxDurationMs: number;
    /** Whether the action is idempotent (safe to retry). */
    idempotent: boolean;
  };

  /** Rollback strategy if post-conditions fail. */
  rollback?: {
    /** Action to invoke for rollback. */
    rollbackAction?: string;
    /** Whether to quarantine the result. */
    quarantine: boolean;
    /** Alert level on failure. */
    alertSeverity: "info" | "warning" | "critical";
  };

  /** Saga participation (for multi-step workflows). */
  saga?: {
    /** Compensation action for saga rollback. */
    compensationAction: string;
    /** Timeout for the entire saga step. */
    stepTimeoutMs: number;
  };
}
```

#### 5.3.2 Contract Registry

**File:** `src/autonomy/tools/registry.ts`

```typescript
export interface ContractRegistry {
  /** Register a tool contract. */
  register(contract: ToolContract): void;
  /** Get contract for an action. */
  get(actionName: string): ToolContract | undefined;
  /** Validate an action's inputs against its contract. */
  validatePreconditions(actionName: string, input: unknown, context: ValidationContext): ValidationResult;
  /** Validate an action's output against its contract. */
  validatePostconditions(actionName: string, output: unknown, context: ValidationContext): ValidationResult;
  /** Generate contracts from existing ElizaOS Action definitions (bootstrap). */
  bootstrapFromActions(actions: Action[]): ToolContract[];
}
```

**Integration point:** The registry wraps `AgentRuntime.processActions()`. Before the runtime processes an action, the contract engine validates preconditions. After execution, it validates postconditions. This is implemented as middleware that intercepts the action processing pipeline.

#### 5.3.3 Verification Engine

**File:** `src/autonomy/verification/engine.ts`

```typescript
export interface VerificationResult {
  passed: boolean;
  /** Which checks passed/failed. */
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
    severity: "info" | "warning" | "error";
  }>;
  /** Duration of verification. */
  durationMs: number;
}

export interface VerificationEngine {
  /** Run pre-execution verification. */
  verifyPre(actionName: string, input: unknown, state: unknown): Promise<VerificationResult>;
  /** Run post-execution verification. */
  verifyPost(actionName: string, input: unknown, output: unknown, state: unknown): Promise<VerificationResult>;
  /** Run invariant checks across the system. */
  checkInvariants(): Promise<VerificationResult>;
}
```

#### 5.3.4 Workflow Engine (Sagas)

**File:** `src/autonomy/workflow/saga.ts`

```typescript
export type SagaStepStatus = "pending" | "running" | "completed" | "failed" | "compensating" | "compensated";

export interface SagaStep {
  id: string;
  actionName: string;
  input: unknown;
  status: SagaStepStatus;
  output?: unknown;
  error?: string;
  compensationAction?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Saga {
  id: string;
  name: string;
  steps: SagaStep[];
  status: "running" | "completed" | "failed" | "rolling_back" | "rolled_back";
  createdAt: number;
  completedAt?: number;
}

export interface SagaOrchestrator {
  /** Create and start a new saga. */
  create(name: string, steps: Omit<SagaStep, "id" | "status">[]): Promise<Saga>;
  /** Execute the next pending step. */
  executeNext(sagaId: string): Promise<SagaStep>;
  /** Trigger compensating transactions for a failed saga. */
  rollback(sagaId: string): Promise<void>;
  /** Get saga status. */
  getStatus(sagaId: string): Promise<Saga>;
}
```

**Integration point:** Sagas are orchestrated through the event bus. Each step emits `autonomy:saga:step:started`, `autonomy:saga:step:completed`, etc. The saga orchestrator listens for failures and triggers rollback. This builds on the existing `AutonomyServiceLike` pattern in `server.ts`.

#### 5.3.5 Approval Gate Service

**File:** `src/autonomy/approval/gate.ts`

```typescript
export interface ApprovalRequest {
  id: string;
  actionName: string;
  agentId: string;
  input: unknown;
  trustScore: number;
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  createdAt: number;
  expiresAt: number;
}

export interface ApprovalGate {
  /** Request approval for a high-risk action. */
  requestApproval(request: Omit<ApprovalRequest, "id" | "createdAt">): Promise<string>;
  /** Approve a pending request. */
  approve(requestId: string, approvedBy: string): Promise<void>;
  /** Deny a pending request. */
  deny(requestId: string, reason: string): Promise<void>;
  /** Get pending requests. */
  getPending(): Promise<ApprovalRequest[]>;
}
```

**Integration point:** Extends the existing `ApprovalsConfig` and `ExecApprovalForwardingConfig` in `src/config/types.milaidy.ts`. The approval gate emits to the existing approval forwarding infrastructure (Discord/Slack/Telegram channels).

### 5.4 New Files

```
src/autonomy/
├── tools/
│   ├── contract.ts                    # ToolContract type + builder
│   ├── registry.ts                    # Contract registry
│   ├── validator.ts                   # Pre/post condition validators
│   └── contracts/                     # Built-in contracts
│       ├── restart.contract.ts
│       └── exec.contract.ts
├── verification/
│   ├── engine.ts                      # Verification orchestrator
│   ├── invariants.ts                  # System invariant definitions
│   └── reporters.ts                   # Verification result formatters
├── workflow/
│   ├── saga.ts                        # Saga orchestrator
│   ├── saga-store.ts                  # Saga persistence
│   └── compensation.ts               # Compensation strategies
├── approval/
│   └── gate.ts                        # Approval gate service
```

### 5.5 Event Bus Extensions

```typescript
"autonomy:tool:precondition:checked": {
  actionName: string;
  passed: boolean;
  trustScore: number;
  checks: Array<{ name: string; passed: boolean }>;
};
"autonomy:tool:postcondition:checked": {
  actionName: string;
  passed: boolean;
  durationMs: number;
};
"autonomy:saga:created": { sagaId: string; name: string; stepCount: number };
"autonomy:saga:step:completed": { sagaId: string; stepId: string; actionName: string };
"autonomy:saga:step:failed": { sagaId: string; stepId: string; error: string };
"autonomy:saga:rolledback": { sagaId: string; compensatedSteps: number };
"autonomy:approval:requested": { requestId: string; actionName: string; urgency: string };
"autonomy:approval:decided": { requestId: string; decision: "approved" | "denied" };
```

### 5.6 Acceptance Criteria

- [ ] Every registered action has a corresponding tool contract
- [ ] Pre-condition validator blocks malformed inputs with >99% accuracy
- [ ] Post-condition verifier catches constraint violations
- [ ] Saga engine can execute 3+ step workflows with proper rollback on failure
- [ ] Approval gate integrates with existing forwarding infrastructure
- [ ] Audit trail of all tool invocations with full contract compliance data

---

## 6. Phase 3: Role Separation & Governed State Machine (Sprints 3.1–3.4, ~4 weeks)

### 6.1 Objective

Decompose the monolithic `AgentRuntime.processActions()` flow into specialized roles with a governed state machine controlling transitions.

### 6.2 Roles

| Role | Responsibility | Input | Output |
|------|---------------|-------|--------|
| **Planner** | Decomposes user request into actionable steps | User message + goals + state | Action plan (ordered steps) |
| **Executor** | Executes individual actions per the plan | Action step + contracts | Action results |
| **Verifier** | Validates results against contracts and goals | Action results + contracts | Verification report |
| **Memory Writer** | Gates and writes verified results to memory | Verified results + trust scores | Written memories |
| **Auditor** | Reviews the entire interaction for compliance | Full interaction log | Audit report |

### 6.3 Governed State Machine

**File:** `src/autonomy/state-machine/machine.ts`

```typescript
export type KernelState =
  | "idle"
  | "planning"
  | "executing"
  | "verifying"
  | "writing_memory"
  | "auditing"
  | "awaiting_approval"
  | "safe_mode"
  | "error";

export interface StateTransition {
  from: KernelState;
  to: KernelState;
  trigger: string;
  guard?: (context: KernelContext) => boolean;
  action?: (context: KernelContext) => Promise<void>;
}

export interface KernelContext {
  agentId: string;
  currentState: KernelState;
  plan?: ActionPlan;
  currentStep?: number;
  verificationResults?: VerificationResult[];
  auditReport?: AuditReport;
  errorCount: number;
  turnCount: number;
  safeModeReason?: string;
}

export interface GoverningStateMachine {
  /** Get current state. */
  getState(): KernelState;
  /** Attempt a state transition. */
  transition(trigger: string, context?: Partial<KernelContext>): Promise<KernelState>;
  /** Check if a transition is valid from current state. */
  canTransition(trigger: string): boolean;
  /** Enter safe mode (all actions blocked except diagnostics). */
  enterSafeMode(reason: string): Promise<void>;
  /** Exit safe mode (requires approval). */
  exitSafeMode(approvedBy: string): Promise<void>;
  /** Get full state history. */
  getHistory(): StateTransition[];
}
```

**State transition diagram:**
```
idle → planning → executing → verifying → writing_memory → auditing → idle
                      │            │
                      └─ error ◄───┘
                          │
                     safe_mode (requires approval to exit)
```

### 6.4 Role Services

Each role is implemented as an ElizaOS `Service` registered with the `AgentRuntime`.

**File:** `src/autonomy/roles/planner.ts`

```typescript
import type { Service, ServiceClass } from "@elizaos/core";

export class PlannerService implements Service {
  static serviceType = "PLANNER" as const;

  /** Decompose a user request into an action plan. */
  async plan(
    message: string,
    goals: Goal[],
    availableActions: Action[],
    constraints: ToolContract[],
  ): Promise<ActionPlan> {
    // Uses AgentRuntime.useModel() for LLM-based planning
    // Respects tool contracts for available actions
    // Decomposes into ordered steps with dependencies
  }
}
```

Similar service classes for `ExecutorService`, `VerifierService`, `MemoryWriterService`, `AuditorService`.

### 6.5 New Files

```
src/autonomy/
├── state-machine/
│   ├── machine.ts                     # Governing state machine
│   ├── transitions.ts                 # Transition definitions
│   ├── safe-mode.ts                   # Safe mode logic
│   └── history.ts                     # State transition history/log
├── roles/
│   ├── planner.ts                     # Planner service
│   ├── executor.ts                    # Executor service
│   ├── verifier.ts                    # Verifier service
│   ├── memory-writer.ts              # Memory writer service
│   ├── auditor.ts                     # Auditor service
│   └── orchestrator.ts               # Role coordination
```

### 6.6 Integration with ElizaOS

The role orchestrator hooks into the message processing pipeline:

1. **Before `processActions()`:** The Planner analyzes the message and creates an action plan
2. **During `processActions()`:** The Executor runs each step, the Verifier checks results
3. **After `processActions()`:** The Memory Writer gates outputs, the Auditor reviews

This is achieved by registering custom `Evaluator`s (pre-phase and post-phase) and `Provider`s that inject role-specific context into the agent's state.

### 6.7 Acceptance Criteria

- [ ] State machine enforces valid transitions only
- [ ] Safe mode blocks all tool invocations except diagnostics
- [ ] Planner generates coherent multi-step plans
- [ ] Verifier catches >90% of simulated failures
- [ ] Auditor produces compliance reports with full provenance
- [ ] Role services integrate cleanly with ElizaOS `Service` pattern

---

## 7. Phase 4: Reliability-Oriented Learning (Sprints 4.1–4.4, ~4 weeks)

### 7.1 Objective

Implement Reinforcement Learning with Verifiable Rewards (RLVR) and adversarial training to continuously improve agent reliability.

### 7.2 Deliverables

#### 7.2.1 Reward Function Framework

**File:** `src/autonomy/rlvr/reward.ts`

```typescript
export interface RewardSignal {
  /** Reward value (-1 to +1). */
  value: number;
  /** What this reward measures. */
  dimension: "task_completion" | "safety" | "preference_alignment" | "efficiency";
  /** Evidence for the reward. */
  evidence: string;
  /** Whether this reward is machine-verified (vs. human feedback). */
  verified: boolean;
  /** Timestamp. */
  timestamp: number;
}

export interface RewardFunction {
  /** Compute reward for a completed interaction. */
  compute(
    interaction: InteractionLog,
    goals: Goal[],
    contracts: ToolContract[],
  ): Promise<RewardSignal[]>;
}

export interface RewardAggregator {
  /** Aggregate multiple reward signals into a composite score. */
  aggregate(signals: RewardSignal[]): number;
  /** Get reward history for an agent. */
  getHistory(agentId: string, windowMs: number): Promise<RewardSignal[]>;
  /** Get trending reward dimensions. */
  getTrends(agentId: string): Promise<Record<string, number>>;
}
```

#### 7.2.2 Adversarial Training Harness

**File:** `src/autonomy/rlvr/adversarial.ts`

```typescript
export interface AdversarialScenario {
  id: string;
  category: "injection" | "drift" | "manipulation" | "boundary_probe";
  prompt: string;
  expectedBehavior: string;
  severity: "low" | "medium" | "high" | "critical";
}

export interface AdversarialHarness {
  /** Run a single adversarial scenario. */
  runScenario(scenario: AdversarialScenario, agentId: string): Promise<AdversarialResult>;
  /** Run a full adversarial suite. */
  runSuite(suiteId: string, agentId: string): Promise<AdversarialSuiteResult>;
  /** Generate new adversarial scenarios based on discovered weaknesses. */
  generateScenarios(weaknesses: string[]): Promise<AdversarialScenario[]>;
}
```

#### 7.2.3 Learning Loop

**File:** `src/autonomy/rlvr/learning-loop.ts`

```typescript
export interface LearningLoop {
  /** Process a completed interaction and extract learning signals. */
  processInteraction(interaction: InteractionLog): Promise<void>;
  /** Apply accumulated learning to update agent behavior parameters. */
  applyLearning(agentId: string): Promise<LearningUpdate>;
  /** Get current learning state. */
  getState(agentId: string): Promise<LearningState>;
}
```

**Note:** RLVR does NOT fine-tune the underlying LLM. Instead, it adjusts:
- System prompt parameters (e.g., emphasis weights on different instructions)
- Trust scorer thresholds (based on observed false-positive/negative rates)
- Drift monitor sensitivity
- Action plan preferences (which tool sequences work best)

These adjustments are stored in the agent's `RuntimeSettings` and applied via `AgentRuntime.setSetting()`.

### 7.3 New Files

```
src/autonomy/
├── rlvr/
│   ├── reward.ts                      # Reward function framework
│   ├── aggregator.ts                  # Multi-signal aggregation
│   ├── adversarial.ts                 # Adversarial training harness
│   ├── learning-loop.ts              # Main learning loop
│   ├── prompt-tuner.ts               # System prompt parameter adjustment
│   └── scenarios/                     # Adversarial scenario datasets
│       ├── injection.json
│       ├── drift.json
│       └── manipulation.json
```

### 7.4 Acceptance Criteria

- [ ] Reward signals computed for every interaction
- [ ] Adversarial harness catches known attack patterns
- [ ] Learning loop measurably improves baseline metrics over 100+ interactions
- [ ] No fine-tuning of the underlying model — only prompt/config adjustments
- [ ] All learning updates are auditable and reversible

---

## 8. Phase 5: Domain Capability Packs & Governance (Sprints 5.1–5.4, ~4 weeks)

### 8.1 Objective

Package domain-specific capabilities (coding, research, customer support) as installable packs with governance frameworks.

### 8.2 Deliverables

#### 8.2.1 Capability Pack Format

**File:** `src/autonomy/packs/types.ts`

```typescript
export interface CapabilityPack {
  /** Pack metadata. */
  metadata: {
    name: string;
    version: string;
    domain: string;
    description: string;
    author: string;
  };
  /** Tool contracts specific to this domain. */
  contracts: ToolContract[];
  /** Domain-specific evaluation criteria. */
  evaluationCriteria: EvaluationCriterion[];
  /** Reward function overrides for this domain. */
  rewardOverrides?: Partial<RewardFunction>;
  /** Required base capabilities. */
  dependencies: string[];
  /** Governance rules specific to this domain. */
  governance: GovernanceRules;
}

export interface GovernanceRules {
  /** Maximum autonomy level for this domain. */
  maxAutonomyLevel: "supervised" | "semi_autonomous" | "autonomous";
  /** Actions that always require human approval. */
  requireApproval: string[];
  /** Data handling restrictions. */
  dataHandling: {
    piiAllowed: boolean;
    dataRetentionDays: number;
    encryptionRequired: boolean;
  };
  /** Audit requirements. */
  auditFrequency: "every_interaction" | "hourly" | "daily";
}
```

#### 8.2.2 Pack Loader

**File:** `src/autonomy/packs/loader.ts`

```typescript
export interface PackLoader {
  /** Load a capability pack from a directory or npm package. */
  load(source: string): Promise<CapabilityPack>;
  /** Validate a pack against the schema. */
  validate(pack: CapabilityPack): ValidationResult;
  /** Install a pack (register contracts, evaluators, governance). */
  install(pack: CapabilityPack, agentId: string): Promise<void>;
  /** Uninstall a pack. */
  uninstall(packName: string, agentId: string): Promise<void>;
  /** List installed packs. */
  listInstalled(agentId: string): Promise<CapabilityPack[]>;
}
```

**Integration point:** Pack loader hooks into the existing plugin system. Each pack is essentially a structured plugin that registers tool contracts, evaluators, and governance rules with the Autonomy Kernel.

### 8.3 New Files

```
src/autonomy/
├── packs/
│   ├── types.ts                       # CapabilityPack type definitions
│   ├── loader.ts                      # Pack loading/installation
│   ├── validator.ts                   # Pack schema validation
│   └── governance.ts                  # Governance rule enforcement
├── governance/
│   ├── compliance.ts                  # Compliance checker
│   ├── audit-report.ts               # Audit report generation
│   └── policy-engine.ts              # Dynamic policy enforcement
```

### 8.4 Acceptance Criteria

- [ ] At least 2 domain packs implemented (coding, research)
- [ ] Pack install/uninstall works cleanly
- [ ] Governance rules enforced at runtime
- [ ] Compliance reports generated automatically

---

## 9. Cross-Cutting Concerns

### 9.1 Testing Strategy

| Phase | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| 0 | Baseline harness, schema validation | Metric emission | Full evaluation suite |
| 1 | Trust scorer, memory gate, drift monitor, goal manager | Trust→Gate→Memory pipeline | Adversarial memory poisoning |
| 2 | Contract validation, saga steps | Contract→Execute→Verify pipeline | Multi-step workflow with rollback |
| 3 | State machine, each role service | Role orchestration pipeline | Full message→audit cycle |
| 4 | Reward computation, learning updates | Learning loop with simulated data | 100-interaction improvement test |
| 5 | Pack loading, governance rules | Pack install→runtime integration | Domain-specific evaluation |

**Test infrastructure:** Uses existing `vitest` setup. New test utilities in `test/autonomy/helpers/`.

### 9.2 Observability

All Autonomy Kernel operations emit:
- **Structured events** on the `TypedEventBus` (for real-time monitoring)
- **OpenTelemetry spans** via `src/telemetry/setup.ts` (for distributed tracing)
- **Metrics** via the `metrics` singleton (for dashboards)

### 9.3 Performance Budget

| Operation | Target Latency | Notes |
|-----------|---------------|-------|
| Trust scoring (rule-based) | <5ms | No LLM call |
| Trust scoring (LLM-based) | <500ms | Uses TEXT_SMALL model |
| Memory gate decision | <10ms | Rule-based + cached trust |
| Contract pre-validation | <2ms | JSON Schema validation |
| Contract post-validation | <5ms | JSON Schema + invariants |
| Persona drift analysis | <1000ms | Uses TEXT_SMALL model, runs async |
| State machine transition | <1ms | Pure state logic |
| Saga step execution | Varies | Depends on underlying action |

### 9.4 Migration Path

The Autonomy Kernel is **opt-in**. When `autonomy.enabled` is `false` (default), the entire kernel is bypassed and Milaidy operates exactly as it does today. This ensures:

1. No breaking changes to existing users
2. Gradual adoption — enable one component at a time
3. Easy rollback if issues are discovered

---

## 10. Implementation Priority & Dependencies

```
Phase 0 ──────► Phase 1 ──────► Phase 2 ──────► Phase 3 ──────► Phase 4 ──────► Phase 5
(Baseline)      (Identity)      (Verification)   (Roles)         (Learning)      (Packs)
                    │                │                │
                    └── depends on ──┘                │
                                     │                │
                                     └── depends on ──┘
```

**Critical path:** Phase 0 → Phase 1 → Phase 2 → Phase 3 (these are sequential)
**Can parallelize:** Phase 4 can start during Phase 3 (reward framework doesn't need roles). Phase 5 can start during Phase 4.

### Sprint Timeline

| Sprint | Duration | Deliverables |
|--------|----------|-------------|
| 0.1 | 1 week | Baseline harness, identity schema |
| 0.2 | 1 week | Evaluation suite, metrics integration |
| 1.1 | 1 week | Trust scorer (rule-based) |
| 1.2 | 1 week | Memory gate + quarantine buffer |
| 1.3 | 1 week | Persona drift monitor |
| 1.4 | 1 week | Goal manager + Phase 1 integration tests |
| 2.1 | 1 week | Tool contract schema + registry |
| 2.2 | 1 week | Pre/post condition validators |
| 2.3 | 1 week | Saga orchestrator |
| 2.4 | 1 week | Approval gate + Phase 2 integration tests |
| 3.1 | 1 week | Governed state machine |
| 3.2 | 1 week | Planner + Executor roles |
| 3.3 | 1 week | Verifier + Memory Writer + Auditor roles |
| 3.4 | 1 week | Role orchestrator + Phase 3 integration tests |
| 4.1 | 1 week | Reward function framework |
| 4.2 | 1 week | Adversarial training harness |
| 4.3 | 1 week | Learning loop + prompt tuner |
| 4.4 | 1 week | Phase 4 integration + improvement validation |
| 5.1 | 1 week | Capability pack format + loader |
| 5.2 | 1 week | Governance framework |
| 5.3 | 1 week | Coding domain pack |
| 5.4 | 1 week | Research domain pack + Phase 5 integration |

**Total: 22 sprints (~22 weeks / ~5.5 months)**

---

## 11. Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| ElizaOS breaking changes | High | High | Pin @elizaos/core version; abstract all ElizaOS access through adapter layer |
| LLM latency budget exceeded | Medium | Medium | Rule-based fast path for trust/verification; LLM analysis async and optional |
| Memory gate false positives | Medium | High | Conservative quarantine thresholds; easy review UI; auto-approve after timeout |
| Persona drift overcorrection | Medium | Medium | Gradual correction (not sudden); alert-only mode before auto-correction |
| Saga complexity explosion | Low | High | Limit saga depth to 10 steps; timeout entire sagas; simple compensation-only rollback |
| RLVR reward hacking | Medium | High | Multi-dimensional rewards; human-in-the-loop verification for parameter changes |

---

## 12. File Tree Summary

```
src/autonomy/                          # All SOW deliverables live here
├── index.ts                           # Kernel entry point + feature gate
├── types.ts                           # Shared types across all phases
├── config.ts                          # Autonomy config validation
│
├── metrics/                           # Phase 0
│   ├── baseline-harness.ts
│   └── types.ts
│
├── identity/                          # Phase 1
│   ├── schema.ts
│   ├── drift-monitor.ts
│   ├── drift-corrector.ts
│   └── identity-hash.ts
│
├── trust/                             # Phase 1
│   ├── scorer.ts
│   ├── source-tracker.ts
│   └── types.ts
│
├── memory/                            # Phase 1
│   ├── gate.ts
│   ├── quarantine.ts
│   ├── typed-memory.ts
│   └── provenance.ts
│
├── goals/                             # Phase 1
│   ├── manager.ts
│   └── evaluator.ts
│
├── tools/                             # Phase 2
│   ├── contract.ts
│   ├── registry.ts
│   ├── validator.ts
│   └── contracts/
│       ├── restart.contract.ts
│       └── exec.contract.ts
│
├── verification/                      # Phase 2
│   ├── engine.ts
│   ├── invariants.ts
│   └── reporters.ts
│
├── workflow/                          # Phase 2
│   ├── saga.ts
│   ├── saga-store.ts
│   └── compensation.ts
│
├── approval/                          # Phase 2
│   └── gate.ts
│
├── state-machine/                     # Phase 3
│   ├── machine.ts
│   ├── transitions.ts
│   ├── safe-mode.ts
│   └── history.ts
│
├── roles/                             # Phase 3
│   ├── planner.ts
│   ├── executor.ts
│   ├── verifier.ts
│   ├── memory-writer.ts
│   ├── auditor.ts
│   └── orchestrator.ts
│
├── rlvr/                              # Phase 4
│   ├── reward.ts
│   ├── aggregator.ts
│   ├── adversarial.ts
│   ├── learning-loop.ts
│   ├── prompt-tuner.ts
│   └── scenarios/
│       ├── injection.json
│       ├── drift.json
│       └── manipulation.json
│
├── packs/                             # Phase 5
│   ├── types.ts
│   ├── loader.ts
│   ├── validator.ts
│   └── governance.ts
│
└── governance/                        # Phase 5
    ├── compliance.ts
    ├── audit-report.ts
    └── policy-engine.ts

test/autonomy/                         # Test suite
├── baseline-evaluation.test.ts
├── trust-scorer.test.ts
├── memory-gate.test.ts
├── drift-monitor.test.ts
├── tool-contracts.test.ts
├── saga.test.ts
├── state-machine.test.ts
├── roles/
│   ├── planner.test.ts
│   ├── verifier.test.ts
│   └── orchestrator.test.ts
├── rlvr/
│   ├── reward.test.ts
│   └── adversarial.test.ts
├── packs/
│   └── loader.test.ts
├── helpers/
│   ├── mock-runtime.ts
│   ├── mock-trust-source.ts
│   └── test-fixtures.ts
└── fixtures/
    ├── preference-following.json
    ├── instruction-completion.json
    └── adversarial-probes.json
```

---

## 13. Getting Started

To begin implementation:

1. **Create the `src/autonomy/` directory structure**
2. **Start with Phase 0:** Baseline harness + identity schema (no runtime dependencies)
3. **Phase 1 Sprint 1.1:** Trust scorer (rule-based, no LLM dependency for initial version)
4. **Wire into DI container** via new tokens as each component is built
5. **Feature-gate everything** behind `config.autonomy.enabled`

The first PR should include: Phase 0 complete + Sprint 1.1 (trust scorer) + all type definitions for Phase 1.
