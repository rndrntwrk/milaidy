import { WorkflowEntrypoint, WorkflowStep, type WorkflowEvent } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

import type { AliceWorkerEnv } from "./env";
import {
  createEvidenceQueueEnvelope,
  type EvidenceRecord,
} from "./evidence";
import { canonicalJson } from "./program";
import { validatePlan, type AlicePlan } from "./plan";
import { loadRuntimeConfig } from "./runtime-config";
import { authorityDurableName } from "./durable-names";
import { createAliceStatePlaneClient } from "./state-plane-client";
import {
  buildAlicePlanExecutionRecords,
  createAliceWorkQueueEnvelope,
} from "./work-execution";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function callJson(stub: DurableObjectStub, path: string, body?: unknown): Promise<any> {
  const init: RequestInit = body === undefined
    ? { method: "GET" }
    : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      };
  const response = await stub.fetch(`https://alice.internal${path}`, init);
  const value = await response.json();
  if (!response.ok) throw new Error(`DURABLE_CALL_${response.status}`);
  return value;
}

export class AlicePlanWorkflow extends WorkflowEntrypoint<AliceWorkerEnv, AlicePlan> {
  async run(event: Readonly<WorkflowEvent<AlicePlan>>, step: WorkflowStep) {
    const plan = event.payload;
    const authority = this.env.ALICE_AUTHORITY.getByName(authorityDurableName());
    const expectedAdmission = {
      binding: plan.binding,
      deploymentManifestSha256: plan.deploymentManifestSha256,
      admissionGeneration: plan.admissionGeneration,
    };
    await step.do("validate signed release and low-risk plan", async () => {
      const config = await loadRuntimeConfig(this.env);
      const validation = validatePlan(plan, expectedAdmission);
      if (!validation.ok) throw new NonRetryableError(validation.code);
      if (
        config.binding.programDigest !== plan.binding.programDigest ||
        config.binding.releaseDigest !== plan.binding.releaseDigest ||
        config.binding.policyHash !== plan.binding.policyHash ||
        config.deploymentManifestSha256 !== plan.deploymentManifestSha256
      ) {
        throw new NonRetryableError("RELEASE_ADMISSION_CHANGED");
      }
      const active = await callJson(authority, "/release/check");
      if (
        active.allowed !== true ||
        active.admissionGeneration !== plan.admissionGeneration ||
        active.release?.deploymentManifestSha256 !==
          plan.deploymentManifestSha256 ||
        active.binding?.programDigest !== plan.binding.programDigest ||
        active.binding?.releaseDigest !== plan.binding.releaseDigest ||
        active.binding?.policyHash !== plan.binding.policyHash
      ) {
        throw new NonRetryableError("RELEASE_ADMISSION_CHANGED");
      }
      return { admitted: true };
    });
    await step.do("capture accepted plan evidence", async () => {
      const suffix = (await sha256Hex(`created:${plan.planId}`)).slice(0, 32);
      const record: EvidenceRecord = {
        schemaVersion: "alice.evidence.v1",
        eventId: `evt-plan-created-${suffix}`,
        occurredAt: new Date(plan.requestedAt).toISOString(),
        kind: "plan.created",
        actor: plan.actor,
        outcome: "PLAN_QUEUED",
        binding: plan.binding,
        subjectId: plan.planId,
        details: {
          actionCount: plan.actions.length,
          sessionId: plan.sessionId,
        },
      };
      await this.env.ALICE_EVIDENCE_QUEUE.send(
        await createEvidenceQueueEnvelope(
          record,
          this.env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
        ),
        { contentType: "json" },
      );
      return { queued: true, eventId: record.eventId };
    });
    const checkpointHash = `sha256:${await sha256Hex(canonicalJson(plan))}`;
    await step.do("persist running task checkpoint", async () => {
      const task = await callJson(authority, "/session/mutate", {
        actor: plan.actor,
        sessionId: plan.sessionId,
        operation: "task",
        expectedAdmission,
        record: {
          taskId: plan.planId,
          state: "running",
          checkpointHash,
          updatedAt: plan.requestedAt,
        },
      });
      if (!task.ok) throw new Error("SESSION_TASK_PERSIST_FAILED");
      return task.result;
    });

    const decisions: Array<{
      intentId: string;
      code: string;
      risk: "low" | "high" | "unknown";
    }> = [];
    try {
      for (let index = 0; index < plan.actions.length; index += 1) {
        const action = plan.actions[index]!;
        const decision = await step.do(`authorize action ${index + 1}`, async () => {
          const value = await callJson(authority, "/authorize", {
            actor: plan.actor,
            request: action,
          });
          if (!value.decision?.allowed) {
            throw new NonRetryableError(value.decision?.code ?? "INTENT_DENIED");
          }
          if (!["low", "high", "unknown"].includes(value.decision.risk)) {
            throw new NonRetryableError("INTENT_DECISION_INVALID");
          }
          return value.decision as {
            allowed: true;
            code: string;
            risk: "low" | "high" | "unknown";
          };
        });
        decisions.push({
          intentId: action.intentId,
          code: decision.code,
          risk: decision.risk,
        });

        await step.do(`capture action ${index + 1} evidence`, async () => {
          const suffix = (await sha256Hex(`${plan.planId}:${action.intentId}`)).slice(0, 32);
          const record: EvidenceRecord = {
            schemaVersion: "alice.evidence.v1",
            eventId: `evt-plan-${suffix}`,
            occurredAt: new Date(plan.requestedAt + index).toISOString(),
            kind: "plan.authorization",
            actor: plan.actor,
            outcome: decision.code,
            binding: plan.binding,
            subjectId: action.intentId,
            details: { allowed: true, risk: decision.risk, planId: plan.planId },
          };
          await this.env.ALICE_EVIDENCE_QUEUE.send(
            await createEvidenceQueueEnvelope(
              record,
              this.env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
            ),
            { contentType: "json" },
          );
          return { queued: true, eventId: record.eventId };
        });
      }
      await step.do("persist and enqueue authorized durable work", async () => {
        const execution = buildAlicePlanExecutionRecords(plan, decisions);
        const state = createAliceStatePlaneClient(
          this.env.ALICE_STATE_PLANE,
          this.env.ALICE_STATE_PLANE_SERVICE_TOKEN,
        );
        await state.applyAtomic({
          operationId: execution.operationId,
          records: execution.records,
        });
        const task = await callJson(authority, "/session/mutate", {
          actor: plan.actor,
          sessionId: plan.sessionId,
          operation: "task",
          expectedAdmission,
          record: {
            taskId: plan.planId,
            state: "waiting",
            checkpointHash,
            updatedAt: plan.requestedAt + 10_000,
          },
        });
        if (!task.ok) throw new Error("SESSION_TASK_PERSIST_FAILED");
        for (const item of execution.workItems) {
          await this.env.ALICE_WORK_QUEUE.send(
            await createAliceWorkQueueEnvelope(
              item,
              this.env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
            ),
            { contentType: "json" },
          );
        }
        return task.result;
      });
    } catch (error) {
      await step.do("persist failed authorization checkpoint", async () => {
        const task = await callJson(authority, "/session/task/terminal", {
          actor: plan.actor,
          sessionId: plan.sessionId,
          expectedAdmission,
          record: {
            taskId: plan.planId,
            state: "failed",
            checkpointHash,
            updatedAt: plan.requestedAt + 20_000,
          },
        });
        if (!task.ok) throw new Error("SESSION_TASK_PERSIST_FAILED");
        return task.result;
      });
      throw error;
    }

    return {
      schemaVersion: "alice.plan-result.v1",
      planId: plan.planId,
      releaseDigest: plan.binding.releaseDigest,
      decisions,
      status: "queued-for-execution",
      completed: false,
    };
  }
}
