import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { AliceWorkerEnv } from "./env";
import { authorityDurableName } from "./durable-names";
import { loadRuntimeConfig } from "./runtime-config";
import { createAliceStatePlaneClient } from "./state-plane-client";
import { createAliceWorkQueueEnvelope, type AliceWorkItem } from "./work-execution";

export type AliceCodingWorkflowInput = {
  taskId: string;
  actor: string;
  sessionId: string;
  requestedAt: number;
  workItem: AliceWorkItem;
};

export class AliceCodingWorkflow extends WorkflowEntrypoint<
  AliceWorkerEnv,
  AliceCodingWorkflowInput
> {
  async run(event: Readonly<WorkflowEvent<AliceCodingWorkflowInput>>, step: WorkflowStep) {
    const { taskId, actor, sessionId, requestedAt, workItem } = event.payload;
    const coding = workItem.coding;
    if (!coding) throw new NonRetryableError("CODING_REQUEST_INVALID");
    const authority = this.env.ALICE_AUTHORITY.getByName(authorityDurableName());
    await step.do("check coding release", async () => {
      const config = await loadRuntimeConfig(this.env);
      const admission = workItem.admission;
      if (
        !["coding.patch.sandbox", "coding.pr.create"].includes(workItem.intent.action) ||
        workItem.planId !== taskId || workItem.actor !== actor ||
        workItem.sessionId !== sessionId || workItem.enqueuedAt !== requestedAt ||
        config.binding.programDigest !== admission.binding.programDigest ||
        config.binding.releaseDigest !== admission.binding.releaseDigest ||
        config.binding.policyHash !== admission.binding.policyHash ||
        config.deploymentManifestSha256 !== admission.deploymentManifestSha256
      ) throw new NonRetryableError("CODING_RELEASE_MISMATCH");
      const response = await authority.fetch("https://alice.internal/release/check");
      const current = await response.json() as Record<string, unknown>;
      const activeBinding = current.binding as Record<string, unknown> | undefined;
      const activeRelease = current.release as Record<string, unknown> | undefined;
      if (!response.ok || current.allowed !== true ||
        current.admissionGeneration !== admission.admissionGeneration ||
        activeBinding?.programDigest !== admission.binding.programDigest ||
        activeBinding?.releaseDigest !== admission.binding.releaseDigest ||
        activeBinding?.policyHash !== admission.binding.policyHash ||
        activeRelease?.deploymentManifestSha256 !== admission.deploymentManifestSha256) {
        throw new NonRetryableError("CODING_RELEASE_NOT_ADMITTED");
      }
      return { admitted: true };
    });
    await step.do("consume exact coding approval", async () => {
      const response = await authority.fetch("https://alice.internal/authorize", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor, request: workItem.intent }),
      });
      const value = await response.json() as { decision?: { allowed?: boolean; code?: string } };
      if (!response.ok || value.decision?.allowed !== true ||
        !["CAPABILITY_AUTHORIZED", "INTENT_ALREADY_AUTHORIZED"].includes(value.decision.code ?? "")) {
        throw new NonRetryableError(value.decision?.code ?? "CODING_APPROVAL_DENIED");
      }
      return { authorized: true };
    });
    await step.do("persist and enqueue coding task", async () => {
      const state = createAliceStatePlaneClient(
        this.env.ALICE_STATE_PLANE,
        this.env.ALICE_STATE_PLANE_SERVICE_TOKEN,
      );
      const workId = workItem.workId;
      const approvalId = workItem.approvalId;
      await state.applyAtomic({
        operationId: `coding-submit-${workId}`,
        records: [
          {
            kind: "plan", recordId: taskId, ownerId: actor, sessionId,
            payload: { planId: taskId, actionCount: 1, state: "authorized",
              admission: workItem.admission },
            updatedAt: requestedAt,
          },
          {
            kind: "approval", recordId: approvalId, ownerId: actor, sessionId,
            payload: { approvalId, planId: taskId, state: "approved",
              code: "CAPABILITY_AUTHORIZED", risk: "low", intent: workItem.intent },
            updatedAt: requestedAt + 1,
          },
          {
            kind: "work", recordId: workId, ownerId: actor, sessionId,
            payload: { workId, planId: taskId, approvalId,
              action: workItem.intent.action, state: "queued",
              repository: coding.repository,
              baseCommit: coding.baseCommit },
            updatedAt: requestedAt + 2,
          },
        ],
      });
      await this.env.ALICE_WORK_QUEUE.send(
        await createAliceWorkQueueEnvelope(
          workItem,
          this.env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
        ),
        { contentType: "json" },
      );
      return { queued: true };
    });
    return { taskId, status: "queued-for-execution" };
  }
}
