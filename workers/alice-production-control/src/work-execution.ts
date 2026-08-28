import type { ActionIntent, ReleaseAdmission } from "./policy";
import { canonicalJson } from "./program";
import type { AlicePlan } from "./plan";

export type AliceWorkItem = {
  schemaVersion: "alice.work-item.v1";
  workId: string;
  planId: string;
  approvalId: string;
  actor: string;
  sessionId: string;
  enqueuedAt: number;
  admission: ReleaseAdmission;
  intent: ActionIntent;
};

export type AliceWorkQueueEnvelope = {
  schemaVersion: "alice.work-queue-envelope.v1";
  item: AliceWorkItem;
  mac: string;
};

export type WorkExecutionDependencies = {
  now(): number;
  getRecord(
    kind: string,
    recordId: string,
    ownerId: string,
  ): Promise<{ payload: unknown; updatedAt?: number } | null>;
  applyAtomic(value: unknown): Promise<void>;
  checkRelease(): Promise<{
    allowed: boolean;
    admission: ReleaseAdmission;
    pausedScopes: string[];
  }>;
  checkAuthorization(intent: ActionIntent, actor: string): Promise<{ allowed: boolean; code: string }>;
  execute(operation: ActionIntent, actor: string): Promise<Record<string, unknown>>;
  emitEvidence(record: unknown): Promise<void>;
};

type ExecutionStateRecord = {
  kind: "plan" | "approval" | "work";
  recordId: string;
  ownerId: string;
  sessionId: string;
  payload: unknown;
  updatedAt: number;
};

function identifierFingerprint(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function boundedIdentifier(prefix: string, source: string, suffix = ""): string {
  const candidate = `${prefix}${source}${suffix}`;
  if (candidate.length <= 128) return candidate;
  const tail = `-${identifierFingerprint(source)}${suffix}`;
  return `${prefix}${source.slice(0, 128 - prefix.length - tail.length)}${tail}`;
}

export function buildAlicePlanExecutionRecords(
  plan: AlicePlan,
  approvals: Array<{
    intentId: string;
    code: string;
    risk: "low" | "high" | "unknown";
  }>,
): {
  operationId: string;
  records: ExecutionStateRecord[];
  workItems: AliceWorkItem[];
} {
  if (
    approvals.length !== plan.actions.length ||
    plan.actions.some(
      (intent, index) =>
        approvals[index]?.intentId !== intent.intentId ||
        approvals[index]?.risk !== "low" ||
        approvals[index]?.code !== "AUTONOMOUS_LOW_RISK" ||
        intent.capabilityId !== undefined,
    )
  ) {
    throw new Error("WORK_APPROVAL_INVALID");
  }
  const admission: ReleaseAdmission = {
    binding: structuredClone(plan.binding),
    deploymentManifestSha256: plan.deploymentManifestSha256,
    admissionGeneration: plan.admissionGeneration,
  };
  const workItems = plan.actions.map((intent, index): AliceWorkItem => ({
    schemaVersion: "alice.work-item.v1",
    workId: boundedIdentifier("work-", plan.planId, `-${index + 1}`),
    planId: plan.planId,
    approvalId: boundedIdentifier("approval-", intent.intentId),
    actor: plan.actor,
    sessionId: plan.sessionId,
    enqueuedAt: plan.requestedAt,
    admission,
    intent: structuredClone(intent),
  }));
  return {
    operationId: boundedIdentifier("plan-execution-", plan.planId),
    records: [
      {
        kind: "plan",
        recordId: plan.planId,
        ownerId: plan.actor,
        sessionId: plan.sessionId,
        payload: {
          actionCount: plan.actions.length,
          admission,
          planId: plan.planId,
          state: "authorized",
        },
        updatedAt: plan.requestedAt,
      },
      ...approvals.map((approval, index): ExecutionStateRecord => ({
        kind: "approval",
        recordId: boundedIdentifier("approval-", approval.intentId),
        ownerId: plan.actor,
        sessionId: plan.sessionId,
        payload: {
          approvalId: boundedIdentifier("approval-", approval.intentId),
          code: approval.code,
          intent: structuredClone(plan.actions[index]),
          planId: plan.planId,
          risk: approval.risk,
          state: "approved",
        },
        updatedAt: plan.requestedAt + index,
      })),
      ...workItems.map((work, index): ExecutionStateRecord => ({
        kind: "work",
        recordId: work.workId,
        ownerId: plan.actor,
        sessionId: plan.sessionId,
        payload: {
          action: work.intent.action,
          approvalId: work.approvalId,
          planId: plan.planId,
          state: "queued",
          workId: work.workId,
        },
        updatedAt: plan.requestedAt + approvals.length + index,
      })),
    ],
    workItems,
  };
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const WORK_ACTION_SCOPE = new Map<string, string | null>([
  ["research.read", "model"],
  ["research.retrieve", "model"],
  ["memory.read", null],
  ["draft.create", "model"],
  ["runtime.health", null],
  ["sandbox.execute", "coding"],
  ["coding.patch.sandbox", "coding"],
]);

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).sort().join(",") ===
        [...keys].sort().join(","),
  );
}

function validBinding(value: unknown): boolean {
  return (
    exactObject(value, ["policyHash", "programDigest", "releaseDigest"]) &&
    [value.programDigest, value.releaseDigest, value.policyHash].every(
      (entry) => typeof entry === "string" && DIGEST.test(entry),
    )
  );
}

function sameAdmission(left: ReleaseAdmission, right: ReleaseAdmission): boolean {
  return (
    left.admissionGeneration === right.admissionGeneration &&
    left.deploymentManifestSha256 === right.deploymentManifestSha256 &&
    left.binding.programDigest === right.binding.programDigest &&
    left.binding.releaseDigest === right.binding.releaseDigest &&
    left.binding.policyHash === right.binding.policyHash
  );
}

function validateWorkItem(value: unknown): AliceWorkItem {
  if (
    !exactObject(value, [
      "actor", "admission", "approvalId", "enqueuedAt", "intent", "planId",
      "schemaVersion", "sessionId", "workId",
    ]) ||
    value.schemaVersion !== "alice.work-item.v1" ||
    ![value.workId, value.planId, value.approvalId, value.sessionId].every(
      (entry) => typeof entry === "string" && IDENTIFIER.test(entry),
    ) ||
    typeof value.actor !== "string" ||
    !/^owner:sha256:[a-f0-9]{64}$/.test(value.actor) ||
    !Number.isSafeInteger(value.enqueuedAt) ||
    Number(value.enqueuedAt) < 1 ||
    !exactObject(value.admission, [
      "admissionGeneration", "binding", "deploymentManifestSha256",
    ]) ||
    !validBinding(value.admission.binding) ||
    !DIGEST.test(String(value.admission.deploymentManifestSha256)) ||
    !Number.isSafeInteger(value.admission.admissionGeneration) ||
    Number(value.admission.admissionGeneration) < 1 ||
    !value.intent ||
    typeof value.intent !== "object"
  ) {
    throw new Error("WORK_ITEM_INVALID");
  }
  const intent = value.intent as Record<string, unknown>;
  const intentKeys = [
    "action", "argumentHash", "expiresAt", "intentId", "nonce", "policyHash",
    "programDigest", "releaseDigest", "target",
  ];
  if ("capabilityId" in intent) intentKeys.push("capabilityId");
  if (
    !exactObject(intent, intentKeys) ||
    !IDENTIFIER.test(String(intent.intentId)) ||
    !WORK_ACTION_SCOPE.has(String(intent.action)) ||
    typeof intent.target !== "string" ||
    intent.target.trim().length === 0 ||
    intent.target.length > 512 ||
    !DIGEST.test(String(intent.argumentHash)) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(String(intent.nonce)) ||
    !Number.isSafeInteger(intent.expiresAt) ||
    ![intent.programDigest, intent.releaseDigest, intent.policyHash].every(
      (entry) => typeof entry === "string" && DIGEST.test(entry),
    ) ||
    (intent.capabilityId !== undefined && !IDENTIFIER.test(String(intent.capabilityId)))
  ) {
    throw new Error("WORK_ITEM_INVALID");
  }
  const admission = value.admission as unknown as ReleaseAdmission;
  if (
    intent.programDigest !== admission.binding.programDigest ||
    intent.releaseDigest !== admission.binding.releaseDigest ||
    intent.policyHash !== admission.binding.policyHash
  ) {
    throw new Error("WORK_ITEM_INVALID");
  }
  return structuredClone(value) as AliceWorkItem;
}

function validKey(key: string): boolean {
  return typeof key === "string" && key.length >= 32 && key.length <= 256 && !/[\0\r\n]/.test(key);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function workMac(item: AliceWorkItem, key: string): Promise<string> {
  if (!validKey(key)) throw new Error("WORK_QUEUE_AUTH_INVALID");
  const imported = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    imported,
    new TextEncoder().encode(canonicalJson({
      item,
      schemaVersion: "alice.work-queue-envelope.v1",
    })),
  );
  return `hmac-sha256:${toBase64Url(new Uint8Array(signature))}`;
}

async function verifyEnvelope(value: unknown, key: string): Promise<AliceWorkItem> {
  if (
    !exactObject(value, ["item", "mac", "schemaVersion"]) ||
    value.schemaVersion !== "alice.work-queue-envelope.v1" ||
    typeof value.mac !== "string" ||
    !/^hmac-sha256:[A-Za-z0-9_-]{43}$/.test(value.mac)
  ) {
    throw new Error("WORK_QUEUE_AUTH_INVALID");
  }
  const item = validateWorkItem(value.item);
  if ((await workMac(item, key)) !== value.mac) {
    throw new Error("WORK_QUEUE_AUTH_INVALID");
  }
  return item;
}

export async function createAliceWorkQueueEnvelope(
  input: AliceWorkItem,
  key: string,
): Promise<AliceWorkQueueEnvelope> {
  const item = validateWorkItem(input);
  return {
    schemaVersion: "alice.work-queue-envelope.v1",
    item,
    mac: await workMac(item, key),
  };
}

function executionRecords(
  item: AliceWorkItem,
  attempt: number,
  now: number,
  state: "completed" | "failed" | "dead-lettered",
  code: string,
  result?: Record<string, unknown>,
) {
  const records: Array<Record<string, unknown>> = [
    {
      kind: "attempt",
      recordId: boundedIdentifier("attempt-", item.workId, `-${attempt}`),
      ownerId: item.actor,
      sessionId: item.sessionId,
      payload: { attempt, code, state, workId: item.workId },
      updatedAt: now,
    },
    {
      kind: "work",
      recordId: item.workId,
      ownerId: item.actor,
      sessionId: item.sessionId,
      payload: {
        action: item.intent.action,
        attempt,
        code,
        planId: item.planId,
        ...(result ? { result } : {}),
        state,
        workId: item.workId,
      },
      updatedAt: now,
    },
  ];
  if (state !== "completed") {
    records.push({
      kind: "recovery",
      recordId: boundedIdentifier("recovery-", item.workId),
      ownerId: item.actor,
      sessionId: item.sessionId,
      payload: { attempt, code, state, workId: item.workId },
      updatedAt: now,
    });
  }
  return records;
}

function executionEvidence(
  item: AliceWorkItem,
  attempt: number,
  occurredAt: number,
  state: "completed" | "failed" | "dead-lettered",
  code: string,
) {
  const kind = state === "completed" ? "work.completed" :
    state === "failed" ? "work.failed" : "work.dead-lettered";
  return {
    schemaVersion: "alice.evidence.v1",
    eventId: boundedIdentifier(`evt-${kind.replace(".", "-")}-`, item.workId),
    occurredAt: new Date(occurredAt).toISOString(),
    kind,
    actor: item.actor,
    outcome: code,
    binding: item.admission.binding,
    subjectId: item.workId,
    details: { action: item.intent.action, attempt, planId: item.planId },
  };
}

function releaseGateCode(
  item: AliceWorkItem,
  release: Awaited<ReturnType<WorkExecutionDependencies["checkRelease"]>>,
): string | null {
  if (!release.allowed || !sameAdmission(release.admission, item.admission)) {
    return "RELEASE_ADMISSION_CHANGED";
  }
  if (release.pausedScopes.includes("all")) return "PAUSED_ALL";
  if (release.pausedScopes.includes("release")) return "PAUSED_RELEASE";
  const scope = WORK_ACTION_SCOPE.get(item.intent.action);
  if (scope && release.pausedScopes.includes(scope)) {
    return `PAUSED_${scope.toUpperCase()}`;
  }
  return null;
}

async function terminalFailure(
  item: AliceWorkItem,
  attempt: number,
  code: string,
  deps: WorkExecutionDependencies,
) {
  const occurredAt = deps.now();
  await deps.applyAtomic({
    operationId: boundedIdentifier("work-failed-", item.workId, `-${code}`),
    records: executionRecords(item, attempt, occurredAt, "failed", code),
  });
  await deps.emitEvidence(executionEvidence(item, attempt, occurredAt, "failed", code));
  return { disposition: "ack", code } as const;
}

export async function processAliceWork(
  value: unknown,
  attempt: number,
  key: string,
  deps: WorkExecutionDependencies,
): Promise<{ disposition: "ack" | "retry"; code: string }> {
  let item: AliceWorkItem;
  try {
    item = await verifyEnvelope(value, key);
  } catch {
    return { disposition: "ack", code: "WORK_QUEUE_AUTH_INVALID" };
  }
  try {
    const existing = await deps.getRecord("work", item.workId, item.actor);
    if (existing && typeof existing.payload === "object" && existing.payload !== null) {
      const payload = existing.payload as Record<string, unknown>;
      if (payload.workId === item.workId && payload.state === "completed") {
        if (Number.isSafeInteger(payload.attempt) && Number.isSafeInteger(existing.updatedAt)) {
          await deps.emitEvidence(executionEvidence(
            item,
            Number(payload.attempt),
            Number(existing.updatedAt),
            "completed",
            "WORK_COMPLETED",
          ));
        }
        return { disposition: "ack", code: "WORK_ALREADY_COMPLETED" };
      }
      if (
        payload.workId === item.workId &&
        (payload.state === "failed" || payload.state === "dead-lettered")
      ) {
        if (Number.isSafeInteger(payload.attempt) && Number.isSafeInteger(existing.updatedAt)) {
          await deps.emitEvidence(executionEvidence(
            item,
            Number(payload.attempt),
            Number(existing.updatedAt),
            payload.state as "failed" | "dead-lettered",
            String(payload.code),
          ));
        }
        return { disposition: "ack", code: "WORK_ALREADY_TERMINAL" };
      }
    }
    const release = await deps.checkRelease();
    const initialReleaseCode = releaseGateCode(item, release);
    if (initialReleaseCode) {
      return await terminalFailure(item, attempt, initialReleaseCode, deps);
    }
    const authorization = await deps.checkAuthorization(item.intent, item.actor);
    if (!authorization.allowed) {
      return await terminalFailure(item, attempt, authorization.code, deps);
    }
    if (authorization.code !== "INTENT_ALREADY_AUTHORIZED") {
      return await terminalFailure(
        item,
        attempt,
        "WORK_AUTHORIZATION_NOT_PREEXISTING",
        deps,
      );
    }
    if (item.intent.expiresAt <= deps.now()) {
      return await terminalFailure(item, attempt, "INTENT_EXPIRED", deps);
    }
    const executionReleaseCode = releaseGateCode(item, await deps.checkRelease());
    if (executionReleaseCode) {
      return await terminalFailure(item, attempt, executionReleaseCode, deps);
    }
    let result: Record<string, unknown>;
    try {
      result = await deps.execute(item.intent, item.actor);
    } catch (error) {
      if (error instanceof Error && error.message === "WORK_OPERATION_UNSUPPORTED") {
        return await terminalFailure(item, attempt, error.message, deps);
      }
      throw error;
    }
    const completedAt = deps.now();
    await deps.applyAtomic({
      operationId: boundedIdentifier("work-completed-", item.workId),
      records: executionRecords(
        item,
        attempt,
        completedAt,
        "completed",
        "WORK_COMPLETED",
        result,
      ),
    });
    await deps.emitEvidence(executionEvidence(
      item,
      attempt,
      completedAt,
      "completed",
      "WORK_COMPLETED",
    ));
    return { disposition: "ack", code: "WORK_COMPLETED" };
  } catch {
    return { disposition: "retry", code: "WORK_DEPENDENCY_UNAVAILABLE" };
  }
}

export async function processAliceDeadLetter(
  value: unknown,
  attempt: number,
  key: string,
  deps: WorkExecutionDependencies,
): Promise<{ disposition: "ack" | "retry"; code: string }> {
  let item: AliceWorkItem;
  try {
    item = await verifyEnvelope(value, key);
  } catch {
    return { disposition: "ack", code: "WORK_QUEUE_AUTH_INVALID" };
  }
  try {
    const existing = await deps.getRecord("work", item.workId, item.actor);
    if (existing && typeof existing.payload === "object" && existing.payload !== null) {
      const payload = existing.payload as Record<string, unknown>;
      if (payload.workId === item.workId && payload.state === "dead-lettered") {
        if (Number.isSafeInteger(payload.attempt) && Number.isSafeInteger(existing.updatedAt)) {
          await deps.emitEvidence(executionEvidence(
            item,
            Number(payload.attempt),
            Number(existing.updatedAt),
            "dead-lettered",
            "WORK_DEAD_LETTERED",
          ));
        }
        return {
          disposition: "ack",
          code: "WORK_DEAD_LETTER_ALREADY_RECORDED",
        };
      }
    }
    const recordedAt = deps.now();
    await deps.applyAtomic({
      operationId: boundedIdentifier("work-dead-letter-", item.workId),
      records: executionRecords(
        item,
        attempt,
        recordedAt,
        "dead-lettered",
        "WORK_DEAD_LETTERED",
      ),
    });
    await deps.emitEvidence(executionEvidence(
      item,
      attempt,
      recordedAt,
      "dead-lettered",
      "WORK_DEAD_LETTERED",
    ));
    return { disposition: "ack", code: "WORK_DEAD_LETTER_RECORDED" };
  } catch {
    return { disposition: "retry", code: "WORK_DEPENDENCY_UNAVAILABLE" };
  }
}
