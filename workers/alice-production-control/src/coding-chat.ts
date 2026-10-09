import { aliceCodingArgumentHash, parseAliceCodingRequest, prepareAliceCodingTask, type AliceCodingRequest } from "./coding-task";
import type { AliceWorkerEnv } from "./env";
import { jsonResponse, readBoundedJson } from "./http";
import type { CapabilityGrant, ReleaseAdmission } from "./policy";
import { canonicalJson } from "./program";
import { createAliceStatePlaneClient } from "./state-plane-client";
import type { AliceWorkItem } from "./work-execution";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const RECEIPT = "coding-native/request/";
export type NativeCodingRequest = {
  schemaVersion: "alice.native-coding.v1";
  requestId: string;
  issuedAt: number;
  message: {
    id: string; entityId: string; roomId: string; source: "discord" | "telegram";
    accountId: string; externalId: string; externalMessageId: string; channelId: string;
    threadId?: string; serverId?: string;
  };
  request: AliceCodingRequest & { delivery: "pull-request" };
};
export type NativeCodingAdmission = { ok: true; grant: CapabilityGrant; admission: ReleaseAdmission } |
  { ok: false; code: string };
type Receipt = {
  input: Omit<NativeCodingRequest, "issuedAt">;
  createdAt: number;
  grant: CapabilityGrant | null;
  admission: ReleaseAdmission | null;
};
type NativeCodingStatus = { ok: true; requestId: string; taskId: string; status: string;
  work?: Record<string, unknown> | null; code?: string };

/** The host validates service HMAC before forwarding; metadata is never model arguments. */
export function parseNativeCodingRequest(value: unknown, now?: number): NativeCodingRequest {
  const invalid = () => { throw new Error("NATIVE_CODING_REQUEST_INVALID"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const body = value as NativeCodingRequest;
  if (Object.keys(body).sort().join(",") !== "issuedAt,message,request,requestId,schemaVersion" ||
    body.schemaVersion !== "alice.native-coding.v1" || !UUID.test(body.requestId) ||
    !Number.isSafeInteger(body.issuedAt) || body.issuedAt <= 0 ||
    !body.message || typeof body.message !== "object" || Array.isArray(body.message)) return invalid();
  const message = body.message;
  const keys = Object.keys(message).filter((key) => key !== "threadId" && key !== "serverId").sort().join(",");
  if (keys !== "accountId,channelId,entityId,externalId,externalMessageId,id,roomId,source" ||
    ![message.id, message.entityId, message.roomId].every((id) => typeof id === "string" && UUID.test(id)) ||
    !["discord", "telegram"].includes(message.source) ||
    typeof message.accountId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(message.accountId) ||
    ![message.externalId, message.externalMessageId].every((id) => typeof id === "string" && /^[0-9]{1,20}$/.test(id)) ||
    typeof message.channelId !== "string" || !/^-?[0-9]{1,20}$/.test(message.channelId) ||
    [message.threadId, message.serverId].some((id) => id !== undefined &&
      (typeof id !== "string" || !/^[0-9]{1,20}$/.test(id)))) return invalid();
  try { parseAliceCodingRequest(body.request); } catch { return invalid(); }
  if (body.request.delivery !== "pull-request") return invalid();
  if (now !== undefined && (body.issuedAt > now + 30_000 || body.issuedAt < now - 300_000)) {
    throw new Error("NATIVE_CODING_REQUEST_STALE");
  }
  return body;
}

async function status(receipt: Receipt, env: AliceWorkerEnv): Promise<NativeCodingStatus> {
  const taskId = `task-cap-${receipt.input.requestId}`;
  const base = { ok: true as const, requestId: receipt.input.requestId, taskId };
  if (!receipt.grant) return { ...base, status: receipt.createdAt + 600_000 <= Date.now() ? "expired" : "unavailable",
    code: receipt.createdAt + 600_000 <= Date.now() ? "NATIVE_CODING_GRANT_EXPIRED" : "CODING_TASK_NOT_FOUND" };
  let work: Record<string, unknown> | null;
  let workflow: { status?: string; error?: { message?: string } } | null = null;
  try {
    const state = createAliceStatePlaneClient(env.ALICE_STATE_PLANE, env.ALICE_STATE_PLANE_SERVICE_TOKEN);
    work = (await state.getRecord("work", `work-${receipt.grant.capabilityId}`, receipt.grant.owner))?.payload as
      Record<string, unknown> | null ?? null;
  } catch { return { ...base, status: "unavailable", code: "CODING_TASK_STATE_UNAVAILABLE" }; }
  let workflowUnavailable = false;
  try { workflow = await (await env.ALICE_CODING_WORKFLOW.get(taskId)).status(); }
  catch (error) {
    // An outage must not masquerade as proof that no Workflow exists.
    workflowUnavailable = !(error && typeof error === "object" &&
      (("status" in error && error.status === 404) || ("code" in error && error.code === 404) ||
        (error instanceof Error && error.message === "instance.not_found")));
  }
  if (work?.state === "completed") return { ...base, status: "completed", work };
  if (["failed", "dead-lettered", "blocked"].includes(String(work?.state)) ||
    workflow?.status === "errored" || workflow?.status === "terminated") {
    return { ...base, status: "failed", work,
      code: typeof work?.code === "string" ? work.code : workflow?.error?.message ?? "CODING_TASK_FAILED" };
  }
  if (work?.state === "queued") return { ...base, status: "queued", work };
  if (work?.state === "executing" || work?.state === "running") return { ...base, status: "running", work };
  if (workflowUnavailable) return { ...base, status: "unavailable", code: "CODING_TASK_WORKFLOW_UNAVAILABLE" };
  if (workflow && ["queued", "running", "waiting"].includes(workflow.status ?? "")) {
    return { ...base, status: workflow.status === "queued" ? "queued" : "running", work };
  }
  if (!work && !workflow && receipt.grant.expiresAt <= Date.now()) {
    return { ...base, status: "expired", code: "NATIVE_CODING_GRANT_EXPIRED" };
  }
  return { ...base, status: "unavailable", work,
    code: !work && !workflow ? "CODING_TASK_NOT_FOUND" : "CODING_TASK_OUTCOME_UNVERIFIED" };
}

/** Only the private runtime-host binding calls start; it cannot choose actor or grant scope. */
export async function handleNativeCodingChat(
  request: Request,
  storage: DurableObjectStorage,
  env: AliceWorkerEnv,
  issue: (input: NativeCodingRequest, argumentHash: string, priorGrant: CapabilityGrant | null) => Promise<NativeCodingAdmission>,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const read = path.match(/^\/coding\/chat\/tasks\/([^/]+)$/);
  if (!read && path !== "/coding/chat/start") return null;
  if (read && request.method === "GET") {
    if (!UUID.test(read[1]!)) return jsonResponse({ ok: false, code: "NATIVE_CODING_REQUEST_INVALID" }, 400);
    const saved = await storage.get<Receipt>(RECEIPT + read[1]);
    return saved ? jsonResponse(await status(saved, env)) :
      jsonResponse({ ok: false, code: "CODING_TASK_NOT_FOUND" }, 404);
  }
  if (read || request.method !== "POST") return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  let input: NativeCodingRequest;
  try { input = parseNativeCodingRequest(await readBoundedJson(request)); }
  catch { return jsonResponse({ ok: false, code: "NATIVE_CODING_REQUEST_INVALID" }, 400); }
  const { issuedAt: _issuedAt, ...immutable } = input;
  const key = RECEIPT + input.requestId;
  const message = input.message;
  const messageKey = `coding-native/message/${message.source}/${message.accountId}/${message.channelId}/${message.externalMessageId}`;
  const now = Date.now();
  let receipt: Receipt;
  try {
    receipt = await storage.transaction(async (transaction) => {
      const existing = await transaction.get<Receipt>(key);
      if (existing) {
        if (canonicalJson(existing.input) !== canonicalJson(immutable)) throw new Error("NATIVE_CODING_REQUEST_CONFLICT");
        return existing;
      }
      parseNativeCodingRequest(input, now);
      if (await transaction.get(messageKey)) throw new Error("NATIVE_CODING_MESSAGE_REPLAY");
      const saved: Receipt = { input: immutable, createdAt: now, grant: null, admission: null };
      await transaction.put({ [key]: saved, [messageKey]: input.requestId });
      return saved;
    });
  } catch (error) {
    return jsonResponse({ ok: false, code: error instanceof Error ? error.message : "NATIVE_CODING_PERSISTENCE_FAILED" }, 409);
  }
  const current = await status(receipt, env);
  let fresh = true;
  try { parseNativeCodingRequest(input, now); } catch { fresh = false; }
  // Stale replay can only read its immutable receipt. Dependency failures never imply absence.
  if (!fresh || current.code !== "CODING_TASK_NOT_FOUND") return jsonResponse(current);
  const argumentHash = await aliceCodingArgumentHash(input.request);
  const admitted = await issue(input, argumentHash, receipt.grant);
  if (!admitted.ok) return jsonResponse(admitted, 403);
  if (admitted.grant.usedAt !== null || admitted.grant.expiresAt <= Date.now()) {
    return jsonResponse({ ...current, code: "NATIVE_CODING_GRANT_UNAVAILABLE" }, 409);
  }
  // The immutable receipt survives capability pruning and prevents a new grant/task identity.
  receipt = await storage.transaction(async (transaction) => {
    const saved = (await transaction.get<Receipt>(key))!;
    if (saved.grant && (canonicalJson(saved.grant) !== canonicalJson(admitted.grant) ||
      canonicalJson(saved.admission) !== canonicalJson(admitted.admission))) {
      throw new Error("NATIVE_CODING_GRANT_CONFLICT");
    }
    const bound = { ...saved, grant: admitted.grant, admission: admitted.admission };
    await transaction.put(key, bound);
    return bound;
  });
  const prepared = await prepareAliceCodingTask(input.request, admitted.grant);
  const grant = admitted.grant;
  const taskId = prepared.taskId;
  const workItem: AliceWorkItem = { schemaVersion: "alice.work-item.v1", workId: `work-${grant.capabilityId}`,
    planId: taskId, approvalId: `approval-${grant.capabilityId}`, actor: grant.owner, sessionId: taskId,
    enqueuedAt: grant.expiresAt - 600_000, admission: admitted.admission, intent: prepared.intent, coding: prepared.request };
  try {
    await env.ALICE_CODING_WORKFLOW.create({ id: taskId, params: { taskId, actor: grant.owner, sessionId: taskId,
      requestedAt: workItem.enqueuedAt, workItem } });
    return jsonResponse({ ok: true, requestId: input.requestId, taskId, status: "queued" }, 202);
  } catch {
    const result = await status(receipt, env);
    return jsonResponse(result, result.code === "CODING_TASK_NOT_FOUND" ? 503 : 200);
  }
}
