import {
  evidenceObjectKey,
  validateEvidenceRecord,
  type EvidenceRecord,
} from "./evidence";
import { canonicalJson } from "./program";

export function canonicalEvidenceArtifactJson(
  record: EvidenceRecord,
  queueAuthenticator: string,
): string {
  const validation = validateEvidenceRecord(record);
  if (
    !validation.ok ||
    !/^hmac-sha256:[A-Za-z0-9_-]{43}$/.test(queueAuthenticator)
  ) {
    throw new Error("EVIDENCE_ARTIFACT_INVALID");
  }
  return canonicalJson({
    integrity: {
      algorithm: "HMAC-SHA-256",
      authenticator: queueAuthenticator,
      envelopeSchemaVersion: "alice.evidence-queue-envelope.v1",
    },
    record,
    schemaVersion: "alice.evidence-artifact.v2",
  });
}

async function assertCanonicalObject(
  bucket: R2Bucket,
  key: string,
  serialized: string,
): Promise<void> {
  const object = await bucket.get(key);
  if (!object || (await object.text()) !== serialized) {
    throw new Error("EVIDENCE_OBJECT_COLLISION");
  }
}

export async function persistEvidenceObject(
  bucket: R2Bucket,
  record: EvidenceRecord,
  queueAuthenticator: string,
): Promise<void> {
  const key = evidenceObjectKey(record);
  const serialized = canonicalEvidenceArtifactJson(record, queueAuthenticator);
  const existing = await bucket.head(key);
  if (existing) {
    await assertCanonicalObject(bucket, key, serialized);
    return;
  }

  const written = await bucket.put(key, serialized, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "private, no-store",
    },
    customMetadata: {
      schema: "alice.evidence-artifact.v2",
      evidenceSchema: record.schemaVersion,
      kind: record.kind,
      releaseDigest: record.binding.releaseDigest,
    },
  });

  // R2 returns null when a conditional write loses its precondition race.
  // Acknowledge only if the winning immutable object has identical bytes.
  if (written === null) {
    await assertCanonicalObject(bucket, key, serialized);
  }
}
