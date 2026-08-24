import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  createEvidenceQueueEnvelope,
  createEvidenceRecord,
  canonicalEvidenceJson,
  evidenceObjectKey,
  verifyEvidenceQueueEnvelope,
  validateEvidenceRecord,
} from "../src/evidence";
import {
  canonicalEvidenceArtifactJson,
  persistEvidenceObject,
} from "../src/evidence-store";

const record = {
  schemaVersion: "alice.evidence.v1" as const,
  eventId: "evt-authorize-0001",
  occurredAt: "2026-08-22T18:01:02.003Z",
  kind: "intent.authorization",
  actor: "owner:sha256:abcdef",
  outcome: "AUTONOMOUS_LOW_RISK",
  binding: {
    programDigest: `sha256:${"1".repeat(64)}`,
    releaseDigest: `sha256:${"2".repeat(64)}`,
    policyHash: `sha256:${"3".repeat(64)}`,
  },
  subjectId: "intent-production-canary",
  details: { allowed: true, risk: "low" },
};
const queueKey = "aeq1_test-evidence-key-with-at-least-32-bytes";

describe("Alice immutable evidence records", () => {
  test("validates a bounded non-secret record and derives a release-scoped R2 key", () => {
    expect(validateEvidenceRecord(record)).toEqual({ ok: true });
    expect(evidenceObjectKey(record)).toBe(
      `2026-08-22/${"2".repeat(64)}/intent.authorization/evt-authorize-0001.json`,
    );
  });

  test("rejects invalid identity, release, time, and oversized detail inputs", () => {
    for (const candidate of [
      { ...record, eventId: "../escape" },
      { ...record, occurredAt: "not-a-time" },
      { ...record, binding: { ...record.binding, releaseDigest: "latest" } },
      { ...record, details: { value: "x".repeat(9000) } },
      { ...record, actor: "alice-owner@rndrntwrk.com" },
      { ...record, authorization: "Bearer must-not-persist" },
      {
        ...record,
        binding: { ...record.binding, privateKey: "must-not-persist" },
      },
    ]) {
      expect(validateEvidenceRecord(candidate)).toEqual({
        ok: false,
        code: "EVIDENCE_RECORD_INVALID",
      });
    }
  });

  test("constructs only validated records for durable mutation outboxes", () => {
    expect(
      createEvidenceRecord({
        ...record,
        eventId: "evt-outbox-factory-0001",
        occurredAt: "2026-08-22T18:01:02.003Z",
      }),
    ).toMatchObject({
      schemaVersion: "alice.evidence.v1",
      eventId: "evt-outbox-factory-0001",
      kind: "intent.authorization",
    });
    expect(() =>
      createEvidenceRecord({
        ...record,
        actor: "alice-owner@rndrntwrk.com",
      }),
    ).toThrow("EVIDENCE_RECORD_INVALID");
  });

  test("routes malformed queue messages through retry and the configured DLQ", () => {
    const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const queueHandler = source.slice(
      source.lastIndexOf("async queue("),
      source.indexOf("satisfies ExportedHandler"),
    );
    expect(queueHandler).toContain("verifyEvidenceQueueEnvelope");
    const invalidBranch = queueHandler.slice(queueHandler.lastIndexOf("} catch {"));
    expect(invalidBranch).toContain("message.retry({ delaySeconds: 10 })");
    expect(invalidBranch).not.toContain("message.ack()");
  });

  test("authenticates each release-bound queue payload with the deployment HMAC", async () => {
    const envelope = await createEvidenceQueueEnvelope(record, queueKey);
    await expect(verifyEvidenceQueueEnvelope(envelope, queueKey)).resolves.toEqual(record);
    await expect(
      verifyEvidenceQueueEnvelope({
        ...envelope,
        record: { ...record, outcome: "FORGED" },
      }, queueKey),
    ).rejects.toThrow("EVIDENCE_QUEUE_AUTH_INVALID");
    await expect(
      verifyEvidenceQueueEnvelope(envelope, `${queueKey}-different`),
    ).rejects.toThrow("EVIDENCE_QUEUE_AUTH_INVALID");
    expect(JSON.parse(canonicalEvidenceArtifactJson(record, envelope.mac))).toEqual({
      integrity: {
        algorithm: "HMAC-SHA-256",
        authenticator: envelope.mac,
        envelopeSchemaVersion: "alice.evidence-queue-envelope.v1",
      },
      record,
      schemaVersion: "alice.evidence-artifact.v2",
    });
  });

  test("keeps authenticated evidence processable across forward and rollback", async () => {
    const previous = await createEvidenceQueueEnvelope(record, queueKey);
    const candidateRecord = {
      ...record,
      eventId: "evt-authorize-0002",
      binding: {
        ...record.binding,
        releaseDigest: `sha256:${"4".repeat(64)}`,
      },
    };
    const candidate = await createEvidenceQueueEnvelope(candidateRecord, queueKey);
    await expect(verifyEvidenceQueueEnvelope(previous, queueKey)).resolves.toEqual(record);
    await expect(verifyEvidenceQueueEnvelope(candidate, queueKey)).resolves.toEqual(
      candidateRecord,
    );
  });

  test("canonicalizes retry bytes and treats a same-key byte mismatch as a collision", () => {
    const reordered = {
      details: { risk: "low", allowed: true },
      subjectId: record.subjectId,
      binding: {
        policyHash: record.binding.policyHash,
        releaseDigest: record.binding.releaseDigest,
        programDigest: record.binding.programDigest,
      },
      outcome: record.outcome,
      actor: record.actor,
      kind: record.kind,
      occurredAt: record.occurredAt,
      eventId: record.eventId,
      schemaVersion: record.schemaVersion,
    };
    expect(canonicalEvidenceJson(reordered)).toBe(canonicalEvidenceJson(record));
    const store = readFileSync(new URL("../src/evidence-store.ts", import.meta.url), "utf8");
    expect(store).toContain("EVIDENCE_OBJECT_COLLISION");
    expect(store).toContain('if (written === null)');
  });

  test("rejects a different winner after an R2 conditional-put race", async () => {
    const envelope = await createEvidenceQueueEnvelope(record, queueKey);
    const bucket = {
      head: async () => null,
      put: async () => null,
      get: async () => ({
        text: async () => canonicalEvidenceArtifactJson(
          { ...record, outcome: "DENIED" },
          envelope.mac,
        ),
      }),
    } as unknown as R2Bucket;
    await expect(
      persistEvidenceObject(bucket, record, envelope.mac),
    ).rejects.toThrow(
      "EVIDENCE_OBJECT_COLLISION",
    );
  });

  test("accepts an identical winner after an R2 conditional-put race", async () => {
    const envelope = await createEvidenceQueueEnvelope(record, queueKey);
    const serialized = canonicalEvidenceArtifactJson(record, envelope.mac);
    const bucket = {
      head: async () => null,
      put: async () => null,
      get: async () => ({ text: async () => serialized }),
    } as unknown as R2Bucket;
    await expect(
      persistEvidenceObject(bucket, record, envelope.mac),
    ).resolves.toBeUndefined();
  });

  test("requires a bounded date and exposes an opaque R2 continuation cursor", () => {
    const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
    const listing = source.slice(
      source.indexOf("async function listReleaseEvidence"),
      source.indexOf("async function handleFetch"),
    );
    expect(listing).toContain("listed.truncated");
    expect(listing).toContain("listed.cursor");
    expect(listing).toContain("nextCursor");
    expect(listing).toContain("EVIDENCE_DATE_REQUIRED");
    expect(listing).toContain("EVIDENCE_CURSOR_INVALID");
    expect(listing).toContain("cursor: pageCursor");
    expect(listing).not.toContain("for (;;)");
  });
});
