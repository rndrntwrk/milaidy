import type { AliceWorkerEnv } from "./env";
import type { CapabilityGrant } from "./policy";
import { prepareAliceCodingMerge } from "./coding-task";
import { createEvidenceRecord, type EvidenceRecord } from "./evidence";
import { jsonResponse } from "./http";
import { loadRuntimeConfig } from "./runtime-config";
import { createAliceStatePlaneClient } from "./state-plane-client";
import { signAliceCodingPublish } from "./coding-publish-signature";

async function callDurable(stub: DurableObjectStub, path: string, body?: unknown) {
  const response = await stub.fetch(`https://alice.internal${path}`, body === undefined
    ? { method: "GET" }
    : { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body) });
  return { response, value: await response.json() as Record<string, any> };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Executes only exact owner-approved merge work and reconciles its provider outcome. */
export async function executeAliceCodingMerge(body: Record<string, unknown>, actor: string,
  env: AliceWorkerEnv, authority: DurableObjectStub): Promise<Response> {
  const state = createAliceStatePlaneClient(env.ALICE_STATE_PLANE,
    env.ALICE_STATE_PLANE_SERVICE_TOKEN);
  const reconcileOnly = body?.reconcileOnly === true;
  let original: Record<string, any> | undefined;
  if (reconcileOnly) {
    if (Object.keys(body).sort().join(",") !== "reconcileOnly,taskId" ||
      typeof body.taskId !== "string" || !/^task-cap-[a-f0-9-]{36}$/.test(body.taskId)) {
      return jsonResponse({ ok: false, code: "TASK_ID_INVALID" }, 400);
    }
    original = (await state.getRecord("work", `work-${body.taskId.slice(5)}`, actor))?.payload as
      Record<string, any> | undefined;
    if (!original || original.action !== "repository.merge") {
      return jsonResponse({ ok: false, code: "TASK_NOT_FOUND" }, 404);
    }
  }
  const grant = (original ? { ...original.intent, owner: actor,
    scope: "repository.merge" } : body?.grant) as CapabilityGrant;
  let prepared: Awaited<ReturnType<typeof prepareAliceCodingMerge>>;
  try {
    if (!grant || typeof grant !== "object") throw new Error("CODING_GRANT_MISMATCH");
    prepared = await prepareAliceCodingMerge(original?.request ?? body.request, grant);
    if (grant.owner !== actor || !Number.isSafeInteger(grant.expiresAt) ||
      grant.expiresAt - 600_000 < 1) throw new Error("CODING_GRANT_MISMATCH");
  } catch {
    return jsonResponse({ ok: false, code: "CODING_GRANT_MISMATCH" }, 403);
  }
  const { taskId, intent, argumentHash, request: merge } = prepared;
  const workId = `work-${grant.capabilityId}`;
  const stageMergeEvidence = async (record: EvidenceRecord) => {
    const staged = await callDurable(authority, "/coding/merge/evidence", { actor, taskId, record });
    if (!staged.response.ok || staged.value.ok !== true) {
      throw new Error("CODING_MERGE_EVIDENCE_PENDING");
    }
    return staged.value;
  };
  let existing = (await state.getRecord("work", workId, actor))?.payload as
    Record<string, any> | undefined;
  const finalReceipt = await state.getRecord("approvalReceipt",
    `merge-receipt-${grant.capabilityId}`, actor);
  if (finalReceipt) existing = finalReceipt.payload as Record<string, any>;
  if (existing && (existing.action !== "repository.merge" ||
    existing.argumentHash !== argumentHash)) {
    return jsonResponse({ ok: false, code: "CODING_GRANT_MISMATCH" }, 403);
  }
  if (existing?.state === "completed") {
    const staged = await stageMergeEvidence(existing.evidence);
    return jsonResponse({ ok: true, taskId, status: "completed",
      result: existing.result, evidencePending: staged.evidenceQueued !== true });
  }
  const source = (await state.getRecord("work",
    `work-${merge.sourceTaskId.slice(5)}`, actor))?.payload as Record<string, any> | undefined;
  const result = source?.result;
  if (source?.state !== "completed" || source.action !== "coding.pr.create" ||
    !result || result.branch !== `alice/${merge.sourceTaskId}` ||
    result.commitSha !== merge.headCommit ||
    !/^[a-f0-9]{40}$/.test(result.baseCommit ?? "") ||
    result.pullRequestUrl !== `https://github.com/${merge.repository}/pull/${merge.pullRequestNumber}`) {
    return jsonResponse({ ok: false, code: "CODING_MERGE_SOURCE_MISMATCH" }, 409);
  }
  const callHost = async (work: Record<string, any>, reconcileOnly: boolean) => {
    const raw = JSON.stringify({ schemaVersion: "alice.coding-merge.v1", reconcileOnly,
      taskId, actor, admission: work.admission, intent: work.intent,
      request: merge, requestedAt: work.requestedAt,
      sourceResult: { branch: result.branch, commitSha: result.commitSha,
        pullRequestUrl: result.pullRequestUrl, baseCommit: result.baseCommit } });
    const response = await env.ALICE_RUNTIME_HOST.fetch(new Request(
      "https://alice-runtime-host.internal/internal/v1/coding/merge", {
        method: "POST", headers: { "content-type": "application/json",
          "x-alice-coding-signature": await signAliceCodingPublish(raw,
            env.ALICE_CODING_PUBLISH_TOKEN) }, body: raw,
      }));
    return { response, value: await response.json() as Record<string, any> };
  };
  const complete = async (work: Record<string, any>, value: Record<string, any>) => {
    const receipt = value.result;
    if (value.ok !== true || !receipt ||
      receipt.repository !== merge.repository || receipt.sourceTaskId !== merge.sourceTaskId ||
      receipt.pullRequestNumber !== merge.pullRequestNumber || receipt.headCommit !== merge.headCommit ||
      receipt.pullRequestUrl !== result.pullRequestUrl || receipt.mergeMethod !== "squash" ||
      !/^[a-f0-9]{40}$/.test(receipt.mergeCommit ?? "") ||
      !/^[a-z0-9-]{1,100}\[bot\]$/.test(receipt.mergedBy ?? "") ||
      !Number.isFinite(Date.parse(receipt.mergedAt))) throw new Error("CODING_MERGE_READBACK_PENDING");
    const evidence = createEvidenceRecord({ binding: work.admission.binding, actor,
      kind: "repository.merge", outcome: "MERGE_VERIFIED", subjectId: taskId,
      details: { ...receipt, capabilityId: grant.capabilityId,
        intentId: work.intent.intentId, admission: work.admission },
      eventId: `evt-${grant.capabilityId.slice(4)}`,
      occurredAt: new Date(receipt.mergedAt).toISOString() });
    // Persist in the existing authority outbox before publishing terminal state.
    const staged = await stageMergeEvidence(evidence);
    const evidencePending = staged.evidenceQueued !== true;
    const payload = { ...work, state: "completed", code: "MERGE_VERIFIED",
      result: receipt, evidence };
    const updatedAt = Math.max(work.requestedAt + 2, Date.parse(receipt.mergedAt));
    await state.applyAtomic({ operationId: `merge-completed-${workId}`, records: [
      { kind: "work", recordId: workId, ownerId: actor, sessionId: taskId,
        payload, updatedAt },
      // Terminal proof has its own immutable receipt, so a concurrent blocked
      // attempt can never overwrite a successful provider outcome.
      { kind: "approvalReceipt", recordId: `merge-receipt-${grant.capabilityId}`,
        ownerId: actor, sessionId: taskId, payload, updatedAt },
    ] });
    return jsonResponse({ ok: true, taskId, status: "completed", result: receipt,
      evidencePending });
  };
  // Only existing owner-bound work can reconcile without a current grant/release.
  if (existing) {
    try {
      const readback = await callHost(existing, true);
      if (readback.response.ok && readback.value.ok === true) {
        return await complete(existing, readback.value);
      }
      if (readback.value.code !== "CODING_MERGE_NOT_MERGED") {
        return jsonResponse({ ok: true, taskId, status: "pending",
          code: readback.value.code ?? "CODING_MERGE_READBACK_PENDING" }, 202);
      }
      if (reconcileOnly) return jsonResponse({ ok: false, taskId,
        status: "not-merged", code: "CODING_MERGE_NOT_MERGED" }, 409);
    } catch {
      return jsonResponse({ ok: true, taskId, status: "pending",
        code: "CODING_MERGE_READBACK_PENDING" }, 202);
    }
  }
  if (reconcileOnly) return jsonResponse({ ok: false, code: "TASK_NOT_FOUND" }, 404);
  if (grant.expiresAt <= Date.now()) {
    return jsonResponse({ ok: false, code: "INTENT_EXPIRED", taskId }, 403);
  }
  const config = await loadRuntimeConfig(env);
  const release = await callDurable(authority, "/release/check");
  if (!release.response.ok || release.value.allowed !== true) {
    return jsonResponse(release.value, release.response.ok ? 403 : release.response.status);
  }
  const authorized = await callDurable(authority, "/authorize", { actor, request: intent });
  if (!authorized.response.ok || authorized.value.decision?.allowed !== true ||
    !["CAPABILITY_AUTHORIZED", "INTENT_ALREADY_AUTHORIZED"].includes(
      authorized.value.decision?.code ?? "")) {
    return jsonResponse({ ok: false, code: authorized.value.decision?.code ??
      "CODING_PUBLISH_AUTH_DENIED", taskId }, 403);
  }
  const work = { workId, planId: taskId, action: "repository.merge", state: "pending",
    request: merge, argumentHash, intent, requestedAt: grant.expiresAt - 600_000,
    admission: { binding: config.binding,
      deploymentManifestSha256: config.deploymentManifestSha256,
      admissionGeneration: release.value.admissionGeneration } };
  await state.applyAtomic({ operationId: `merge-submit-${workId}`, records: [
    { kind: "approval", recordId: `approval-${grant.capabilityId}`, ownerId: actor,
      sessionId: taskId, payload: { state: "approved", risk: "high", intent },
      updatedAt: work.requestedAt },
    { kind: "work", recordId: workId, ownerId: actor, sessionId: taskId,
      payload: work, updatedAt: work.requestedAt },
  ] });
  try {
    const hosted = await callHost(work, false);
    if (hosted.response.ok && hosted.value.ok === true) return await complete(work, hosted.value);
    if (hosted.value.outcome === "not-merged") {
      const code = typeof hosted.value.code === "string" ? hosted.value.code : "CODING_MERGE_BLOCKED";
      await state.applyAtomic({ operationId: `merge-blocked-${workId}-${(await sha256Hex(code)).slice(0, 12)}`,
        records: [{ kind: "work", recordId: workId, ownerId: actor, sessionId: taskId,
          payload: { ...work, state: "blocked", code }, updatedAt: work.requestedAt + 1 }] });
      return jsonResponse({ ok: false, code, taskId, status: "blocked" }, 409);
    }
    return jsonResponse({ ok: true, taskId, status: "pending",
      code: hosted.value.code ?? "CODING_MERGE_READBACK_PENDING" }, 202);
  } catch {
    return jsonResponse({ ok: true, taskId, status: "pending",
      code: "CODING_MERGE_READBACK_PENDING" }, 202);
  }
}
