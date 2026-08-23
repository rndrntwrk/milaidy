import type { ReleaseBinding } from "./policy";
import { canonicalJson } from "./program";

export type EvidenceRecord = {
  schemaVersion: "alice.evidence.v1";
  eventId: string;
  occurredAt: string;
  kind: string;
  actor: string;
  outcome: string;
  binding: ReleaseBinding;
  subjectId: string;
  details: Record<string, unknown>;
};

export type EvidenceRecordInput = Omit<
  EvidenceRecord,
  "schemaVersion" | "eventId" | "occurredAt"
> & {
  eventId?: string;
  occurredAt?: string;
};

export type EvidenceQueueEnvelope = {
  schemaVersion: "alice.evidence-queue-envelope.v1";
  record: EvidenceRecord;
  mac: string;
};

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function exactPlainObject(value: unknown, keys: string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.keys(value as Record<string, unknown>).sort().join(",") ===
      [...keys].sort().join(",")
  );
}

function validDetails(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 8192) return false;
    const stack: unknown[] = [value];
    while (stack.length > 0) {
      const current = stack.pop();
      if (Array.isArray(current)) {
        stack.push(...current);
      } else if (current && typeof current === "object") {
        for (const [key, item] of Object.entries(current)) {
          if (/token|secret|password|authorization|cookie|email/i.test(key)) return false;
          stack.push(item);
        }
      } else if (
        current !== null &&
        typeof current !== "string" &&
        typeof current !== "number" &&
        typeof current !== "boolean"
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function validateEvidenceRecord(
  value: unknown,
): { ok: true } | { ok: false; code: "EVIDENCE_RECORD_INVALID" } {
  if (
    !exactPlainObject(value, [
      "actor",
      "binding",
      "details",
      "eventId",
      "kind",
      "occurredAt",
      "outcome",
      "schemaVersion",
      "subjectId",
    ])
  ) {
    return { ok: false, code: "EVIDENCE_RECORD_INVALID" };
  }
  const record = value as EvidenceRecord;
  if (
    !exactPlainObject(record.binding, [
      "policyHash",
      "programDigest",
      "releaseDigest",
    ])
  ) {
    return { ok: false, code: "EVIDENCE_RECORD_INVALID" };
  }
  const occurredAt = Date.parse(record.occurredAt);
  const valid =
    record.schemaVersion === "alice.evidence.v1" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(record.eventId) &&
    Number.isFinite(occurredAt) &&
    new Date(occurredAt).toISOString() === record.occurredAt &&
    /^[a-z][a-z0-9]*(\.[a-z0-9]+)+$/.test(record.kind) &&
    /^[a-z0-9][a-z0-9:._-]{2,127}$/.test(record.actor) &&
    !record.actor.includes("@") &&
    /^[A-Z][A-Z0-9_]{2,127}$/.test(record.outcome) &&
    validDigest(record.binding?.programDigest) &&
    validDigest(record.binding?.releaseDigest) &&
    validDigest(record.binding?.policyHash) &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(record.subjectId) &&
    validDetails(record.details);
  return valid ? { ok: true } : { ok: false, code: "EVIDENCE_RECORD_INVALID" };
}

export function evidenceObjectKey(record: EvidenceRecord): string {
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.code);
  const date = record.occurredAt.slice(0, 10);
  return `${date}/${record.binding.releaseDigest.slice("sha256:".length)}/${record.kind}/${record.eventId}.json`;
}

export function canonicalEvidenceJson(record: EvidenceRecord): string {
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.code);
  return canonicalJson(record);
}

export function createEvidenceRecord(input: EvidenceRecordInput): EvidenceRecord {
  const record: EvidenceRecord = {
    schemaVersion: "alice.evidence.v1",
    eventId: input.eventId ?? `evt-${crypto.randomUUID()}`,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    kind: input.kind,
    actor: input.actor,
    outcome: input.outcome,
    binding: structuredClone(input.binding),
    subjectId: input.subjectId,
    details: structuredClone(input.details),
  };
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.code);
  return record;
}

function validEvidenceQueueKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 256 &&
    !/[\0\r\n]/.test(value)
  );
}

function envelopePayload(record: EvidenceRecord): string {
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.code);
  return canonicalJson({
    record,
    schemaVersion: "alice.evidence-queue-envelope.v1",
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function evidenceQueueMac(
  record: EvidenceRecord,
  key: string,
): Promise<string> {
  if (!validEvidenceQueueKey(key)) throw new Error("EVIDENCE_QUEUE_AUTH_INVALID");
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
    new TextEncoder().encode(envelopePayload(record)),
  );
  return `hmac-sha256:${base64Url(new Uint8Array(signature))}`;
}

export async function createEvidenceQueueEnvelope(
  record: EvidenceRecord,
  key: string,
): Promise<EvidenceQueueEnvelope> {
  return {
    schemaVersion: "alice.evidence-queue-envelope.v1",
    record: structuredClone(record),
    mac: await evidenceQueueMac(record, key),
  };
}

export async function verifyEvidenceQueueEnvelope(
  value: unknown,
  key: string,
): Promise<EvidenceRecord> {
  if (
    !exactPlainObject(value, ["mac", "record", "schemaVersion"]) ||
    (value as EvidenceQueueEnvelope).schemaVersion !==
      "alice.evidence-queue-envelope.v1" ||
    !/^hmac-sha256:[A-Za-z0-9_-]{43}$/.test(
      (value as EvidenceQueueEnvelope).mac ?? "",
    )
  ) {
    throw new Error("EVIDENCE_QUEUE_AUTH_INVALID");
  }
  const envelope = value as EvidenceQueueEnvelope;
  let expected: string;
  try {
    expected = await evidenceQueueMac(envelope.record, key);
  } catch {
    throw new Error("EVIDENCE_QUEUE_AUTH_INVALID");
  }
  if (expected.length !== envelope.mac.length) {
    throw new Error("EVIDENCE_QUEUE_AUTH_INVALID");
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ envelope.mac.charCodeAt(index);
  }
  if (difference !== 0) throw new Error("EVIDENCE_QUEUE_AUTH_INVALID");
  return structuredClone(envelope.record);
}
