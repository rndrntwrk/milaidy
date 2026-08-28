import { describe, expect, it } from "bun:test";

import {
  ALICE_DELEGATED_CAPABILITY_ADAPTERS,
  completeAliceDelegatedJob,
  createAliceDelegatedJobEnvelope,
  validateAliceDelegatedJobEnvelope,
} from "./alice-delegated-job";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const input = {
  jobId: "job-private-canary-001",
  capability: "browser.render" as const,
  programDigest: digest("1"),
  releaseDigest: digest("2"),
  capabilityId: "cap-browser-private-001",
  target: "browser:private-canary",
  argumentSha256: digest("3"),
  input: {
    objectKey: `objects/sha256/${"4".repeat(64)}`,
    sha256: digest("4"),
    mediaType: "application/json",
    sizeBytes: 512,
  },
  credentialSessionRef: null,
  timeoutMs: 60_000,
  budgetUnits: 100,
  requestedAt: 1_788_000_000_000,
  expiresAt: 1_788_000_120_000,
  nonce: "nonce-browser-private-001",
  rollbackBoundary: "browser:private-canary",
  cleanupDeadline: 1_788_000_180_000,
};

describe("Alice delegated job envelope", () => {
  it("maps every bounded capability to one exact adapter and hashes canonical bytes", () => {
    expect(ALICE_DELEGATED_CAPABILITY_ADAPTERS).toEqual({
      "stream.capture.private": "stream-compositor",
      "browser.render": "cloudflare-browser-rendering",
      "sandbox.execute": "cloudflare-sandbox",
      "coding.patch.sandbox": "cloudflare-sandbox",
      "modal.gpu.batch": "modal-burst",
      "modal.media.render": "modal-burst",
      "macos.execute": "macos-native-executor",
      "codex.task.execute": "codex-subscription-executor",
    });

    const created = createAliceDelegatedJobEnvelope(input);
    expect(created.envelope).toEqual({
      schemaVersion: "alice.delegated-job.v1",
      ...input,
      adapter: "cloudflare-browser-rendering",
    });
    expect(created.envelopeSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateAliceDelegatedJobEnvelope(created.envelope)).toEqual(
      created.envelope,
    );
    expect(
      createAliceDelegatedJobEnvelope({ ...input }).envelopeSha256,
    ).toBe(created.envelopeSha256);
  });

  it("keeps Codex account session custody opaque and outside Alice", () => {
    const created = createAliceDelegatedJobEnvelope({
      ...input,
      capability: "codex.task.execute",
      jobId: "job-codex-private-001",
      capabilityId: "cap-codex-private-001",
      target: "codex:workspace-reviewed-repo",
      nonce: "nonce-codex-private-001",
      rollbackBoundary: "git:reviewed-base-001",
      credentialSessionRef: "codex-session-owner-device-001",
    });
    expect(created.envelope.adapter).toBe("codex-subscription-executor");
    expect(created.envelope.credentialSessionRef).toBe(
      "codex-session-owner-device-001",
    );
    expect(JSON.stringify(created)).not.toMatch(
      /accessToken|refreshToken|apiKey|authorization|cookie/i,
    );
  });

  it("rejects ambient authority, secrets, raw arguments, drift, and unbounded jobs", () => {
    for (const capability of [
      "public.post",
      "release.deploy",
      "production.merge",
      "signing.execute",
      "trade.execute",
      "withdrawal.execute",
      "bridge.execute",
      "admin.execute",
    ]) {
      expect(() =>
        createAliceDelegatedJobEnvelope({ ...input, capability } as never),
      ).toThrow("ALICE_DELEGATED_JOB_INVALID");
    }

    for (const mutation of [
      { ...input, apiKey: "secret-value" },
      { ...input, arguments: { prompt: "raw prompt" } },
      { ...input, input: { ...input.input, token: "secret-value" } },
      { ...input, timeoutMs: 3_600_001 },
      { ...input, budgetUnits: 0 },
      { ...input, expiresAt: input.requestedAt + 3_600_001 },
      { ...input, cleanupDeadline: input.expiresAt + 3_600_001 },
      { ...input, credentialSessionRef: "codex-session-should-not-be-here" },
    ]) {
      expect(() => createAliceDelegatedJobEnvelope(mutation as never)).toThrow(
        "ALICE_DELEGATED_JOB_INVALID",
      );
    }

    const valid = createAliceDelegatedJobEnvelope(input).envelope;
    expect(() =>
      validateAliceDelegatedJobEnvelope({
        ...valid,
        adapter: "modal-burst",
      }),
    ).toThrow("ALICE_DELEGATED_JOB_INVALID");
  });

  it("produces only digest-bound terminal evidence and proves cleanup", () => {
    const created = createAliceDelegatedJobEnvelope(input);
    const receipt = completeAliceDelegatedJob({
      envelope: created.envelope,
      envelopeSha256: created.envelopeSha256,
      status: "succeeded",
      output: {
        objectKey: `objects/sha256/${"5".repeat(64)}`,
        sha256: digest("5"),
        mediaType: "image/png",
        sizeBytes: 1024,
      },
      evidence: {
        objectKey: `objects/sha256/${"6".repeat(64)}`,
        sha256: digest("6"),
        mediaType: "application/json",
        sizeBytes: 256,
      },
      errorCode: null,
      startedAt: input.requestedAt + 1,
      completedAt: input.requestedAt + 2,
      cleanupVerified: true,
    });
    expect(receipt).toMatchObject({
      schemaVersion: "alice.delegated-job-receipt.v1",
      jobId: input.jobId,
      jobSha256: created.envelopeSha256,
      status: "succeeded",
      cleanupVerified: true,
    });
    expect(JSON.stringify(receipt)).not.toMatch(
      /stdout|stderr|command|authorization|accessToken|refreshToken|signature/i,
    );

    for (const mutation of [
      { cleanupVerified: false },
      { jobSha256: digest("f") },
      { errorCode: "raw provider failure: bearer abc" },
      { stdout: "secret" },
    ]) {
      expect(() =>
        completeAliceDelegatedJob({
          envelope: created.envelope,
          envelopeSha256: created.envelopeSha256,
          status: "failed",
          output: null,
          evidence: {
            objectKey: `objects/sha256/${"6".repeat(64)}`,
            sha256: digest("6"),
            mediaType: "application/json",
            sizeBytes: 256,
          },
          errorCode: "EXECUTOR_FAILED",
          startedAt: input.requestedAt + 1,
          completedAt: input.requestedAt + 2,
          cleanupVerified: true,
          ...mutation,
        } as never),
      ).toThrow("ALICE_DELEGATED_JOB_RECEIPT_INVALID");
    }
  });
});
