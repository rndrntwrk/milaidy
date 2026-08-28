import { describe, expect, test } from "bun:test";

import {
  buildAlicePlanExecutionRecords,
  createAliceWorkQueueEnvelope,
  processAliceDeadLetter,
  processAliceWork,
  type AliceWorkItem,
  type WorkExecutionDependencies,
} from "../src/work-execution";
import type { AlicePlan } from "../src/plan";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const now = 1_787_400_000_000;
const key = "work-queue-auth-key-with-at-least-32-bytes";
const item: AliceWorkItem = {
  schemaVersion: "alice.work-item.v1",
  workId: "work-001",
  planId: "plan-001",
  approvalId: "approval-001",
  actor: `owner:sha256:${"a".repeat(64)}`,
  sessionId: "session-001",
  enqueuedAt: now - 1_000,
  admission: {
    binding: {
      programDigest: digest("1"),
      releaseDigest: digest("2"),
      policyHash: digest("3"),
    },
    deploymentManifestSha256: digest("4"),
    admissionGeneration: 7,
  },
  intent: {
    intentId: "intent-001",
    action: "runtime.health",
    target: "alice-production-runtime",
    argumentHash: digest("5"),
    nonce: "nonce-001",
    expiresAt: now + 60_000,
    programDigest: digest("1"),
    releaseDigest: digest("2"),
    policyHash: digest("3"),
  },
};

function dependencies(overrides: Partial<WorkExecutionDependencies> = {}) {
  const writes: unknown[] = [];
  const evidence: unknown[] = [];
  let executions = 0;
  const deps: WorkExecutionDependencies = {
    now: () => now,
    async getRecord() { return null; },
    async applyAtomic(value) { writes.push(value); },
    async checkRelease() {
      return { allowed: true, admission: item.admission, pausedScopes: [] };
    },
    async checkAuthorization() {
      return { allowed: true, code: "INTENT_ALREADY_AUTHORIZED" };
    },
    async execute(operation) {
      executions += 1;
      return { operation: operation.action, status: "healthy" };
    },
    async emitEvidence(record) { evidence.push(record); },
    ...overrides,
  };
  return { deps, writes, evidence, executions: () => executions };
}

describe("Alice durable work execution", () => {
  test("builds one canonical plan, approval, and work record per authorized intent", () => {
    const plan: AlicePlan = {
      schemaVersion: "alice.plan.v1",
      planId: item.planId,
      sessionId: item.sessionId,
      actor: item.actor,
      requestedAt: item.enqueuedAt,
      binding: item.admission.binding,
      deploymentManifestSha256: item.admission.deploymentManifestSha256,
      admissionGeneration: item.admission.admissionGeneration,
      actions: [item.intent],
    };
    const result = buildAlicePlanExecutionRecords(plan, [
      { intentId: item.intent.intentId, code: "AUTONOMOUS_LOW_RISK", risk: "low" },
    ]);
    expect(result.operationId).toBe("plan-execution-plan-001");
    expect(result.records.map((record) => record.kind)).toEqual([
      "plan", "approval", "work",
    ]);
    expect(result.workItems).toEqual([
      expect.objectContaining({
        schemaVersion: "alice.work-item.v1",
        workId: "work-plan-001-1",
        approvalId: "approval-intent-001",
        intent: item.intent,
      }),
    ]);
    expect(JSON.stringify(result.records)).not.toContain("capabilityGrant");
  });

  test("derives bounded distinct state identifiers from maximum-length plan identifiers", () => {
    const build = (tail: string) => buildAlicePlanExecutionRecords({
      schemaVersion: "alice.plan.v1",
      planId: `p${"a".repeat(126)}${tail}`,
      sessionId: item.sessionId,
      actor: item.actor,
      requestedAt: item.enqueuedAt,
      binding: item.admission.binding,
      deploymentManifestSha256: item.admission.deploymentManifestSha256,
      admissionGeneration: item.admission.admissionGeneration,
      actions: [item.intent],
    }, [{ intentId: item.intent.intentId, code: "AUTONOMOUS_LOW_RISK", risk: "low" }]);
    const first = build("1");
    const second = build("2");
    expect(first.operationId.length).toBeLessThanOrEqual(128);
    expect(first.records.every((record) => record.recordId.length <= 128)).toBe(true);
    expect(first.workItems[0]?.workId).not.toBe(second.workItems[0]?.workId);
  });

  test("acks an identical completed duplicate without executing twice", async () => {
    const fixture = dependencies({
      async getRecord() {
        return { payload: { state: "completed", workId: item.workId } };
      },
    });
    const envelope = await createAliceWorkQueueEnvelope(item, key);
    await expect(processAliceWork(envelope, 2, key, fixture.deps)).resolves.toEqual({
      disposition: "ack",
      code: "WORK_ALREADY_COMPLETED",
    });
    expect(fixture.executions()).toBe(0);
    expect(fixture.writes).toHaveLength(0);
  });

  test("acks every already terminal delivery without reopening recovery", async () => {
    for (const state of ["failed", "dead-lettered"]) {
      const fixture = dependencies({
        async getRecord() {
          return { payload: { state, workId: item.workId } };
        },
      });
      await expect(processAliceWork(
        await createAliceWorkQueueEnvelope(item, key),
        3,
        key,
        fixture.deps,
      )).resolves.toEqual({ disposition: "ack", code: "WORK_ALREADY_TERMINAL" });
      expect(fixture.executions()).toBe(0);
      expect(fixture.writes).toHaveLength(0);
    }
  });

  test("requires the durable Authority to confirm a prior exact authorization", async () => {
    const fixture = dependencies({
      async checkAuthorization() {
        return { allowed: true, code: "AUTONOMOUS_LOW_RISK" };
      },
    });
    await expect(processAliceWork(
      await createAliceWorkQueueEnvelope(item, key),
      1,
      key,
      fixture.deps,
    )).resolves.toEqual({
      disposition: "ack",
      code: "WORK_AUTHORIZATION_NOT_PREEXISTING",
    });
    expect(fixture.executions()).toBe(0);
  });

  test("terminally recovers a work item whose release or grant is stale", async () => {
    for (const [code, override] of [
      ["RELEASE_ADMISSION_CHANGED", {
        async checkRelease() {
          return { allowed: false, admission: item.admission, pausedScopes: [] };
        },
      }],
      ["INTENT_EXPIRED", {
        async checkAuthorization() {
          return { allowed: false, code: "INTENT_EXPIRED" };
        },
      }],
      ["CAPABILITY_EXPIRED", {
        async checkAuthorization() {
          return { allowed: false, code: "CAPABILITY_EXPIRED" };
        },
      }],
      ["CAPABILITY_MISMATCH", {
        async checkAuthorization() {
          return { allowed: false, code: "CAPABILITY_MISMATCH" };
        },
      }],
    ] as const) {
      const fixture = dependencies(override);
      const result = await processAliceWork(
        await createAliceWorkQueueEnvelope(item, key),
        1,
        key,
        fixture.deps,
      );
      expect(result).toEqual({ disposition: "ack", code });
      expect(fixture.executions()).toBe(0);
      expect(fixture.writes).toHaveLength(1);
      expect(JSON.stringify(fixture.writes[0])).toContain('"kind":"recovery"');
    }
  });

  test("keeps capability grant issuance disabled in the durable plan handoff", () => {
    const plan: AlicePlan = {
      schemaVersion: "alice.plan.v1",
      planId: item.planId,
      sessionId: item.sessionId,
      actor: item.actor,
      requestedAt: item.enqueuedAt,
      binding: item.admission.binding,
      deploymentManifestSha256: item.admission.deploymentManifestSha256,
      admissionGeneration: item.admission.admissionGeneration,
      actions: [{ ...item.intent, capabilityId: "capability-001" }],
    };
    expect(() => buildAlicePlanExecutionRecords(plan, [
      { intentId: item.intent.intentId, code: "AUTONOMOUS_LOW_RISK", risk: "low" },
    ])).toThrow("WORK_APPROVAL_INVALID");
  });

  test("rechecks PAUSE_ALL and the operation scope after authorization", async () => {
    for (const pausedScopes of [["all"], ["model"]]) {
      const fixture = dependencies({
        async checkRelease() {
          return { allowed: true, admission: item.admission, pausedScopes };
        },
      });
      const result = await processAliceWork(
        await createAliceWorkQueueEnvelope(
          { ...item, intent: { ...item.intent, action: "draft.create" } },
          key,
        ),
        1,
        key,
        fixture.deps,
      );
      expect(result).toEqual({
        disposition: "ack",
        code: pausedScopes[0] === "all" ? "PAUSED_ALL" : "PAUSED_MODEL",
      });
      expect(fixture.executions()).toBe(0);
    }
  });

  test("rechecks PAUSE_ALL after the durable authorization replay", async () => {
    let releaseChecks = 0;
    const fixture = dependencies({
      async checkRelease() {
        releaseChecks += 1;
        return {
          allowed: true,
          admission: item.admission,
          pausedScopes: releaseChecks === 1 ? [] : ["all"],
        };
      },
    });
    await expect(processAliceWork(
      await createAliceWorkQueueEnvelope(item, key),
      1,
      key,
      fixture.deps,
    )).resolves.toEqual({ disposition: "ack", code: "PAUSED_ALL" });
    expect(releaseChecks).toBe(2);
    expect(fixture.executions()).toBe(0);
  });

  test("retries immutable completion evidence without executing a second time", async () => {
    let completed: { payload: unknown; updatedAt: number } | null = null;
    let evidenceAttempts = 0;
    const fixture = dependencies({
      async getRecord() { return completed; },
      async applyAtomic(value) {
        const operation = value as { records: Array<{ kind: string; payload: unknown; updatedAt: number }> };
        const work = operation.records.find((record) => record.kind === "work")!;
        completed = { payload: work.payload, updatedAt: work.updatedAt };
      },
      async emitEvidence() {
        evidenceAttempts += 1;
        if (evidenceAttempts === 1) throw new Error("QUEUE_UNAVAILABLE");
      },
    });
    const envelope = await createAliceWorkQueueEnvelope(item, key);
    await expect(processAliceWork(envelope, 1, key, fixture.deps)).resolves.toEqual({
      disposition: "retry",
      code: "WORK_DEPENDENCY_UNAVAILABLE",
    });
    await expect(processAliceWork(envelope, 2, key, fixture.deps)).resolves.toEqual({
      disposition: "ack",
      code: "WORK_ALREADY_COMPLETED",
    });
    expect(fixture.executions()).toBe(1);
    expect(evidenceAttempts).toBe(2);
  });

  test("retries transient state failures without claiming completion", async () => {
    const fixture = dependencies({
      async getRecord() { throw new Error("STATE_DEPENDENCY_UNAVAILABLE"); },
    });
    await expect(
      processAliceWork(
        await createAliceWorkQueueEnvelope(item, key),
        1,
        key,
        fixture.deps,
      ),
    ).resolves.toEqual({ disposition: "retry", code: "WORK_DEPENDENCY_UNAVAILABLE" });
    expect(fixture.executions()).toBe(0);
    expect(fixture.writes).toHaveLength(0);
  });

  test("records a DLQ recovery and immutable failure evidence", async () => {
    const fixture = dependencies();
    const result = await processAliceDeadLetter(
      await createAliceWorkQueueEnvelope(item, key),
      4,
      key,
      fixture.deps,
    );
    expect(result).toEqual({ disposition: "ack", code: "WORK_DEAD_LETTER_RECORDED" });
    expect(JSON.stringify(fixture.writes[0])).toContain('"state":"dead-lettered"');
    expect(JSON.stringify(fixture.evidence[0])).toContain('"outcome":"WORK_DEAD_LETTERED"');
  });

  test("retries immutable DLQ evidence without rewriting terminal recovery", async () => {
    let recorded: { payload: unknown; updatedAt: number } | null = null;
    let writes = 0;
    let evidenceAttempts = 0;
    const fixture = dependencies({
      async getRecord() { return recorded; },
      async applyAtomic(value) {
        writes += 1;
        const operation = value as { records: Array<{ kind: string; payload: unknown; updatedAt: number }> };
        const work = operation.records.find((record) => record.kind === "work")!;
        recorded = { payload: work.payload, updatedAt: work.updatedAt };
      },
      async emitEvidence() {
        evidenceAttempts += 1;
        if (evidenceAttempts === 1) throw new Error("QUEUE_UNAVAILABLE");
      },
    });
    const envelope = await createAliceWorkQueueEnvelope(item, key);
    await expect(processAliceDeadLetter(envelope, 4, key, fixture.deps)).resolves.toEqual({
      disposition: "retry",
      code: "WORK_DEPENDENCY_UNAVAILABLE",
    });
    await expect(processAliceDeadLetter(envelope, 5, key, fixture.deps)).resolves.toEqual({
      disposition: "ack",
      code: "WORK_DEAD_LETTER_ALREADY_RECORDED",
    });
    expect(writes).toBe(1);
    expect(evidenceAttempts).toBe(2);
  });
});
