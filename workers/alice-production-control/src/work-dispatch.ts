import type { AliceWorkerEnv } from "./env";
import { ALICE_CODING_LIFETIME_MS, type ActionIntent, type ReleaseBinding } from "./policy";
import { authorityDurableName } from "./durable-names";
import { createAliceStatePlaneClient } from "./state-plane-client";
import { createEvidenceQueueEnvelope, validateEvidenceRecord, type EvidenceRecord } from "./evidence";
import { aliceCodingResultSha256, signAliceCodingPublish } from "./coding-publish-signature";
import { processAliceDeadLetter, processAliceWork, type AliceWorkItem } from "./work-execution";

export async function callDurable(
  stub: DurableObjectStub,
  path: string,
  body?: unknown,
): Promise<{ response: Response; value: any }> {
  const init: RequestInit = body === undefined
    ? { method: "GET" }
    : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      };
  const response = await stub.fetch(`https://alice.internal${path}`, init);
  const value = await response.json();
  return { response, value };
}

export async function queueEvidence(env: AliceWorkerEnv, record: EvidenceRecord): Promise<void> {
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.code);
  await env.ALICE_EVIDENCE_QUEUE.send(
    await createEvidenceQueueEnvelope(record, env.ALICE_EVIDENCE_QUEUE_HMAC_KEY),
    { contentType: "json" },
  );
}

export function validReleaseBinding(value: unknown): value is ReleaseBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return (
    Object.keys(binding).sort().join(",") ===
      "policyHash,programDigest,releaseDigest" &&
    [binding.programDigest, binding.releaseDigest, binding.policyHash].every(
      (digest) =>
        typeof digest === "string" && /^sha256:[a-f0-9]{64}$/.test(digest),
    )
  );
}

export async function handleWorkQueueMessage(
  body: unknown,
  attempts: number,
  deadLetter: boolean,
  env: AliceWorkerEnv,
) {
  const state = createAliceStatePlaneClient(
    env.ALICE_STATE_PLANE,
    env.ALICE_STATE_PLANE_SERVICE_TOKEN,
  );
  const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());
  const dependencies = {
    now: () => Date.now(),
    getRecord: state.getRecord,
    applyAtomic: state.applyAtomic,
    async checkRelease() {
      const current = await callDurable(authority, "/release/check");
      const snapshot = await callDurable(authority, "/snapshot");
      const binding = current.value.binding as ReleaseBinding;
      const deploymentManifestSha256 = String(
        current.value.release?.deploymentManifestSha256 ?? "",
      );
      const admissionGeneration = Number(current.value.admissionGeneration);
      const pausedScopes = snapshot.value.authority?.pausedScopes;
      if (
        !validReleaseBinding(binding) ||
        !/^sha256:[a-f0-9]{64}$/.test(deploymentManifestSha256) ||
        !Number.isSafeInteger(admissionGeneration) ||
        admissionGeneration < 1 ||
        !Array.isArray(pausedScopes) ||
        pausedScopes.some((scope) => typeof scope !== "string")
      ) {
        throw new Error("WORK_AUTHORITY_UNAVAILABLE");
      }
      return {
        allowed:
          current.response.ok || current.value.code === "RUNTIME_PAUSED",
        admission: {
          binding,
          deploymentManifestSha256,
          admissionGeneration,
        },
        pausedScopes: pausedScopes as string[],
      };
    },
    async checkAuthorization(intent: ActionIntent, actor: string) {
      const current = await callDurable(authority, "/authorize", {
        actor,
        request: intent,
      });
      return {
        allowed: current.response.ok && current.value.decision?.allowed === true,
        code: String(current.value.decision?.code ?? "INTENT_DENIED"),
      };
    },
    async execute(operation: ActionIntent, actor: string, item: AliceWorkItem) {
      if (operation.action === "runtime.health") {
        return {
          operation: operation.action,
          releaseDigest: operation.releaseDigest,
          status: "admitted",
        };
      }
      if (operation.action === "memory.read") {
        const record = await state.getRecord("memory", operation.target, actor);
        return {
          found: record !== null,
          operation: operation.action,
          record,
        };
      }
      if ((operation.action === "coding.patch.sandbox" ||
        operation.action === "coding.pr.create") && item.coding) {
        const response = await env.ALICE_CODING_SANDBOX.fetch(
          new Request("https://alice-coding.internal/internal/v1/coding/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              schemaVersion: "alice.coding-execution.v1",
              taskId: item.planId,
              actor,
              admission: item.admission,
              request: item.coding,
              intent: operation,
            }),
          }),
        );
        const value = await response.json() as Record<string, unknown>;
        if (response.status === 410) {
          const code = String(value.code ?? "");
          throw new Error([
            "CAPABILITY_REVOKED", "CAPABILITY_EXPIRED", "INTENT_EXPIRED",
            "PAUSED_ALL", "PAUSED_RELEASE", "PAUSED_CODING",
            "RELEASE_ADMISSION_CHANGED",
          ].includes(code) ? code : "CODING_TASK_FAILED");
        }
        if (!response.ok || value.ok !== true ||
          !value.result || typeof value.result !== "object") {
          throw new Error("CODING_SANDBOX_UNAVAILABLE");
        }
        if (operation.action === "coding.patch.sandbox") {
          return value.result as Record<string, unknown>;
        }
        const generated = value.result as Record<string, unknown>;
        if (typeof generated.summary !== "string" ||
          !Array.isArray(generated.changes)) throw new Error("CODING_RESULT_INVALID");
        const result = { summary: generated.summary, changes: generated.changes };
        const publish = {
          schemaVersion: "alice.coding-publish.v1",
          taskId: item.planId,
          actor,
          admission: item.admission,
          intent: operation,
          coding: item.coding,
          branch: `alice/${item.planId}`,
          requestedAt: operation.expiresAt - ALICE_CODING_LIFETIME_MS,
          resultSha256: await aliceCodingResultSha256(result),
          result,
        };
        const body = JSON.stringify(publish);
        const published = await env.ALICE_RUNTIME_HOST.fetch(new Request(
          "https://alice-runtime-host.internal/internal/v1/coding/publish", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-alice-coding-signature": await signAliceCodingPublish(
                body, env.ALICE_CODING_PUBLISH_TOKEN,
              ),
            },
            body,
          },
        ));
        const publication = await published.json() as Record<string, unknown>;
        if (!published.ok || publication.ok !== true ||
          !publication.result || typeof publication.result !== "object") {
          throw new Error(typeof publication.code === "string" ? publication.code :
            "CODING_PUBLISH_UNAVAILABLE");
        }
        return { ...(publication.result as Record<string, unknown>), summary: generated.summary };
      }
      throw new Error("WORK_OPERATION_UNSUPPORTED");
    },
    async emitEvidence(record: unknown) {
      const validation = validateEvidenceRecord(record);
      if (!validation.ok) throw new Error(validation.code);
      await queueEvidence(env, record as EvidenceRecord);
    },
  };
  return deadLetter
    ? processAliceDeadLetter(
        body,
        attempts,
        env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
        dependencies,
      )
    : processAliceWork(
        body,
        attempts,
        env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
        dependencies,
      );
}
