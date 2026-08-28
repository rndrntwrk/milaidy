import crypto from "node:crypto";

export const ALICE_DELEGATED_CAPABILITY_ADAPTERS = Object.freeze({
  "stream.capture.private": "stream-compositor",
  "browser.render": "cloudflare-browser-rendering",
  "sandbox.execute": "cloudflare-sandbox",
  "coding.patch.sandbox": "cloudflare-sandbox",
  "modal.gpu.batch": "modal-burst",
  "modal.media.render": "modal-burst",
  "macos.execute": "macos-native-executor",
  "codex.task.execute": "codex-subscription-executor",
} as const);

export type AliceDelegatedCapability =
  keyof typeof ALICE_DELEGATED_CAPABILITY_ADAPTERS;
export type AliceDelegatedAdapter =
  (typeof ALICE_DELEGATED_CAPABILITY_ADAPTERS)[AliceDelegatedCapability];

export type AliceDelegatedArtifact = Readonly<{
  objectKey: string;
  sha256: string;
  mediaType: string;
  sizeBytes: number;
}>;

export type AliceDelegatedJobInput = Readonly<{
  jobId: string;
  capability: AliceDelegatedCapability;
  programDigest: string;
  releaseDigest: string;
  capabilityId: string;
  target: string;
  argumentSha256: string;
  input: AliceDelegatedArtifact;
  credentialSessionRef: string | null;
  timeoutMs: number;
  budgetUnits: number;
  requestedAt: number;
  expiresAt: number;
  nonce: string;
  rollbackBoundary: string;
  cleanupDeadline: number;
}>;

export type AliceDelegatedJobEnvelope = AliceDelegatedJobInput &
  Readonly<{
    schemaVersion: "alice.delegated-job.v1";
    adapter: AliceDelegatedAdapter;
  }>;

export type AliceDelegatedJobReceipt = Readonly<{
  schemaVersion: "alice.delegated-job-receipt.v1";
  jobId: string;
  jobSha256: string;
  status: "succeeded" | "failed" | "cancelled";
  output: AliceDelegatedArtifact | null;
  evidence: AliceDelegatedArtifact;
  errorCode: string | null;
  startedAt: number;
  completedAt: number;
  cleanupVerified: true;
}>;

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
const TARGET = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,191}$/;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/;
const OBJECT_KEY = /^objects\/sha256\/([a-f0-9]{64})$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const MAX_EXPIRY_MS = 15 * 60 * 1_000;
const MAX_TIMEOUT_MS = 60 * 60 * 1_000;
const MAX_CLEANUP_WINDOW_MS = 60 * 60 * 1_000;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024 * 1024;

const INPUT_KEYS = [
  "jobId",
  "capability",
  "programDigest",
  "releaseDigest",
  "capabilityId",
  "target",
  "argumentSha256",
  "input",
  "credentialSessionRef",
  "timeoutMs",
  "budgetUnits",
  "requestedAt",
  "expiresAt",
  "nonce",
  "rollbackBoundary",
  "cleanupDeadline",
] as const;
const ENVELOPE_KEYS = ["schemaVersion", "adapter", ...INPUT_KEYS] as const;
const ARTIFACT_KEYS = ["objectKey", "sha256", "mediaType", "sizeBytes"] as const;
const COMPLETION_KEYS = [
  "envelope",
  "envelopeSha256",
  "status",
  "output",
  "evidence",
  "errorCode",
  "startedAt",
  "completedAt",
  "cleanupVerified",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

function hasExactKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function digestCanonical(value: unknown): string {
  return `sha256:${crypto
    .createHash("sha256")
    .update(`${JSON.stringify(canonicalValue(value))}\n`)
    .digest("hex")}`;
}

function validArtifact(value: unknown): value is AliceDelegatedArtifact {
  if (!hasExactKeys(value, ARTIFACT_KEYS)) return false;
  const objectMatch =
    typeof value.objectKey === "string"
      ? OBJECT_KEY.exec(value.objectKey)
      : null;
  return Boolean(
    objectMatch &&
      typeof value.sha256 === "string" &&
      DIGEST.test(value.sha256) &&
      value.sha256 === `sha256:${objectMatch[1]}` &&
      typeof value.mediaType === "string" &&
      MEDIA_TYPE.test(value.mediaType) &&
      Number.isSafeInteger(value.sizeBytes) &&
      Number(value.sizeBytes) >= 0 &&
      Number(value.sizeBytes) <= MAX_ARTIFACT_BYTES,
  );
}

function validEnvelope(value: unknown): value is AliceDelegatedJobEnvelope {
  if (!hasExactKeys(value, ENVELOPE_KEYS)) return false;
  const capability = value.capability as AliceDelegatedCapability;
  const adapter = ALICE_DELEGATED_CAPABILITY_ADAPTERS[capability];
  const codex = capability === "codex.task.execute";
  const sessionRef = value.credentialSessionRef;
  return Boolean(
    value.schemaVersion === "alice.delegated-job.v1" &&
      adapter &&
      value.adapter === adapter &&
      typeof value.jobId === "string" &&
      IDENTIFIER.test(value.jobId) &&
      typeof value.capabilityId === "string" &&
      IDENTIFIER.test(value.capabilityId) &&
      typeof value.target === "string" &&
      TARGET.test(value.target) &&
      typeof value.nonce === "string" &&
      IDENTIFIER.test(value.nonce) &&
      typeof value.rollbackBoundary === "string" &&
      TARGET.test(value.rollbackBoundary) &&
      typeof value.programDigest === "string" &&
      DIGEST.test(value.programDigest) &&
      typeof value.releaseDigest === "string" &&
      DIGEST.test(value.releaseDigest) &&
      typeof value.argumentSha256 === "string" &&
      DIGEST.test(value.argumentSha256) &&
      validArtifact(value.input) &&
      (codex
        ? typeof sessionRef === "string" && IDENTIFIER.test(sessionRef)
        : sessionRef === null) &&
      Number.isSafeInteger(value.timeoutMs) &&
      Number(value.timeoutMs) > 0 &&
      Number(value.timeoutMs) <= MAX_TIMEOUT_MS &&
      Number.isSafeInteger(value.budgetUnits) &&
      Number(value.budgetUnits) > 0 &&
      Number(value.budgetUnits) <= 1_000_000 &&
      Number.isSafeInteger(value.requestedAt) &&
      Number(value.requestedAt) > 0 &&
      Number.isSafeInteger(value.expiresAt) &&
      Number(value.expiresAt) > Number(value.requestedAt) &&
      Number(value.expiresAt) - Number(value.requestedAt) <= MAX_EXPIRY_MS &&
      Number.isSafeInteger(value.cleanupDeadline) &&
      Number(value.cleanupDeadline) >= Number(value.expiresAt) &&
      Number(value.cleanupDeadline) - Number(value.expiresAt) <=
        MAX_CLEANUP_WINDOW_MS,
  );
}

export function validateAliceDelegatedJobEnvelope(
  value: unknown,
): AliceDelegatedJobEnvelope {
  if (!validEnvelope(value)) throw new Error("ALICE_DELEGATED_JOB_INVALID");
  return value;
}

export function createAliceDelegatedJobEnvelope(
  input: AliceDelegatedJobInput,
): Readonly<{
  envelope: AliceDelegatedJobEnvelope;
  envelopeSha256: string;
}> {
  if (!hasExactKeys(input, INPUT_KEYS)) {
    throw new Error("ALICE_DELEGATED_JOB_INVALID");
  }
  const adapter =
    ALICE_DELEGATED_CAPABILITY_ADAPTERS[input.capability];
  const envelope = {
    schemaVersion: "alice.delegated-job.v1" as const,
    ...input,
    adapter,
  };
  validateAliceDelegatedJobEnvelope(envelope);
  return { envelope, envelopeSha256: digestCanonical(envelope) };
}

export function completeAliceDelegatedJob(input: Readonly<{
  envelope: AliceDelegatedJobEnvelope;
  envelopeSha256: string;
  status: "succeeded" | "failed" | "cancelled";
  output: AliceDelegatedArtifact | null;
  evidence: AliceDelegatedArtifact;
  errorCode: string | null;
  startedAt: number;
  completedAt: number;
  cleanupVerified: boolean;
}>): AliceDelegatedJobReceipt {
  if (!hasExactKeys(input, COMPLETION_KEYS)) {
    throw new Error("ALICE_DELEGATED_JOB_RECEIPT_INVALID");
  }
  let envelope: AliceDelegatedJobEnvelope;
  try {
    envelope = validateAliceDelegatedJobEnvelope(input.envelope);
  } catch {
    throw new Error("ALICE_DELEGATED_JOB_RECEIPT_INVALID");
  }
  if (
    !DIGEST.test(input.envelopeSha256) ||
    input.envelopeSha256 !== digestCanonical(envelope) ||
    !["succeeded", "failed", "cancelled"].includes(input.status) ||
    !validArtifact(input.evidence) ||
    (input.output !== null && !validArtifact(input.output)) ||
    (input.status === "succeeded"
      ? input.output === null || input.errorCode !== null
      : input.output !== null ||
        typeof input.errorCode !== "string" ||
        !ERROR_CODE.test(input.errorCode)) ||
    !Number.isSafeInteger(input.startedAt) ||
    input.startedAt < envelope.requestedAt ||
    !Number.isSafeInteger(input.completedAt) ||
    input.completedAt < input.startedAt ||
    input.completedAt > envelope.cleanupDeadline ||
    input.cleanupVerified !== true
  ) {
    throw new Error("ALICE_DELEGATED_JOB_RECEIPT_INVALID");
  }
  return {
    schemaVersion: "alice.delegated-job-receipt.v1",
    jobId: envelope.jobId,
    jobSha256: input.envelopeSha256,
    status: input.status,
    output: input.output,
    evidence: input.evidence,
    errorCode: input.errorCode,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    cleanupVerified: true,
  };
}
