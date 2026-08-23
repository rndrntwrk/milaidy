import { describe, expect, test } from "bun:test";

import {
  signReleaseRollbackReceipt,
  signRecoveryReceipt,
  verifyReleaseRollbackReceipt,
  verifyRecoveryReceipt,
  type ReleaseRollbackReceiptPayload,
  type RecoveryReceiptPayload,
} from "../src/recovery";

const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};

const recoveryToken = "recovery-token-that-is-at-least-thirty-two-bytes";
const deploymentPauseToken =
  "deployment-pause-token-that-is-at-least-thirty-two-bytes";
const now = Date.parse("2026-08-22T18:00:00.000Z");
const pauseDeploymentManifestSha256 = `sha256:${"9".repeat(64)}`;
const currentDeploymentManifestSha256 = `sha256:${"a".repeat(64)}`;

function payload(overrides: Partial<RecoveryReceiptPayload> = {}): RecoveryReceiptPayload {
  return {
    schemaVersion: "alice.recovery-receipt.v3",
    action: "control.resume",
    scope: "all",
    pauseId: "pause-recovery-0001",
    pausedAt: now - 2_000,
    subject: `owner:sha256:${"4".repeat(64)}`,
    pauseBinding: binding,
    pauseDeploymentManifestSha256,
    pauseRollbackBoundary: "modal:alice-runtime:v48",
    currentBinding: binding,
    currentDeploymentManifestSha256,
    currentReleaseEpoch: 1,
    currentRollbackBoundary: "modal:alice-runtime:v48",
    issuedAt: now - 1_000,
    expiresAt: now + 60_000,
    nonce: "recovery-nonce-0001",
    ...overrides,
  };
}

function expected(overrides: Record<string, unknown> = {}) {
  return {
    recoveryToken,
    scope: "all",
    pauseId: "pause-recovery-0001",
    pausedAt: now - 2_000,
    subject: `owner:sha256:${"4".repeat(64)}`,
    pauseBinding: binding,
    pauseDeploymentManifestSha256,
    pauseRollbackBoundary: "modal:alice-runtime:v48",
    currentBinding: binding,
    currentDeploymentManifestSha256,
    currentReleaseEpoch: 1,
    currentRollbackBoundary: "modal:alice-runtime:v48",
    now,
    ...overrides,
  };
}

describe("Alice cryptographic recovery receipts", () => {
  test("verifies an exact short-lived resume receipt and returns only its digest", async () => {
    const receipt = await signRecoveryReceipt(payload(), recoveryToken);
    const result = await verifyRecoveryReceipt(receipt, expected());
    expect(result).toEqual({
      ok: true,
      receiptHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(result)).not.toContain(receipt);
    expect(JSON.stringify(result)).not.toContain(recoveryToken);
  });

  test("rejects tampering and a receipt signed by another recovery key", async () => {
    const receipt = await signRecoveryReceipt(payload(), recoveryToken);
    const [encodedPayload, encodedSignature] = receipt.split(".");
    const tamperedPayload = `${encodedPayload!.slice(0, -1)}${encodedPayload!.endsWith("A") ? "B" : "A"}`;
    await expect(verifyRecoveryReceipt(`${tamperedPayload}.${encodedSignature}`, expected())).resolves.toEqual({
      ok: false,
      code: "RECOVERY_RECEIPT_INVALID",
    });
    await expect(
      verifyRecoveryReceipt(
        await signRecoveryReceipt(payload(), "different-recovery-token-at-least-32-bytes"),
        expected(),
      ),
    ).resolves.toEqual({ ok: false, code: "RECOVERY_RECEIPT_INVALID" });
  });

  test("binds scope, owner, release, policy, and rollback boundary exactly", async () => {
    const receipt = await signRecoveryReceipt(payload(), recoveryToken);
    for (const mismatch of [
      { scope: "model" },
      { pauseId: "pause-recovery-0002" },
      { pausedAt: now - 2_001 },
      { subject: `owner:sha256:${"5".repeat(64)}` },
      { pauseBinding: { ...binding, releaseDigest: `sha256:${"6".repeat(64)}` } },
      { pauseBinding: { ...binding, policyHash: `sha256:${"7".repeat(64)}` } },
      { pauseDeploymentManifestSha256: `sha256:${"8".repeat(64)}` },
      { pauseRollbackBoundary: "modal:alice-runtime:v47" },
      { currentBinding: { ...binding, programDigest: `sha256:${"8".repeat(64)}` } },
      { currentDeploymentManifestSha256: `sha256:${"b".repeat(64)}` },
      { currentReleaseEpoch: 2 },
      { currentRollbackBoundary: "modal:alice-runtime:v49" },
    ]) {
      await expect(verifyRecoveryReceipt(receipt, expected(mismatch))).resolves.toEqual({
        ok: false,
        code: "RECOVERY_RECEIPT_BINDING_MISMATCH",
      });
    }
  });

  test("rejects expired, future, and overlong authorization windows", async () => {
    for (const candidate of [
      payload({ issuedAt: now - 60_000, expiresAt: now }),
      payload({ issuedAt: now + 1, expiresAt: now + 60_000 }),
      payload({ issuedAt: now - 1_000, expiresAt: now + 300_001 }),
    ]) {
      const receipt = await signRecoveryReceipt(candidate, recoveryToken);
      await expect(verifyRecoveryReceipt(receipt, expected())).resolves.toEqual({
        ok: false,
        code: "RECOVERY_RECEIPT_NOT_CURRENT",
      });
    }
  });

  test("rejects malformed payloads before signing", async () => {
    await expect(
      signRecoveryReceipt(payload({ nonce: "short" }), recoveryToken),
    ).rejects.toThrow("RECOVERY_RECEIPT_INVALID");
    await expect(signRecoveryReceipt(payload(), "short")).rejects.toThrow(
      "RECOVERY_RECEIPT_INVALID",
    );
  });
});

const rollbackTargetBinding = {
  programDigest: `sha256:${"5".repeat(64)}`,
  releaseDigest: `sha256:${"6".repeat(64)}`,
  policyHash: binding.policyHash,
};

function rollbackPayload(
  overrides: Partial<ReleaseRollbackReceiptPayload> = {},
): ReleaseRollbackReceiptPayload {
  return {
    schemaVersion: "alice.release-rollback-receipt.v2",
    action: "release.rollback",
    subject: `owner:sha256:${"4".repeat(64)}`,
    currentBinding: binding,
    currentDeploymentManifestSha256,
    currentReleaseEpoch: 2,
    currentRollbackBoundary: "modal:alice-runtime:v49",
    targetBinding: rollbackTargetBinding,
    targetDeploymentManifestSha256: pauseDeploymentManifestSha256,
    targetReleaseEpoch: 1,
    targetRollbackBoundary: "modal:alice-runtime:v48",
    issuedAt: now - 1_000,
    expiresAt: now + 60_000,
    nonce: "release-rollback-nonce-0001",
    ...overrides,
  };
}

function rollbackExpected(overrides: Record<string, unknown> = {}) {
  return {
    recoveryToken,
    subject: `owner:sha256:${"4".repeat(64)}`,
    currentBinding: binding,
    currentDeploymentManifestSha256,
    currentReleaseEpoch: 2,
    currentRollbackBoundary: "modal:alice-runtime:v49",
    targetBinding: rollbackTargetBinding,
    targetDeploymentManifestSha256: pauseDeploymentManifestSha256,
    targetReleaseEpoch: 1,
    targetRollbackBoundary: "modal:alice-runtime:v48",
    now,
    ...overrides,
  };
}

describe("Alice signed release rollback receipts", () => {
  test("verifies one exact short-lived current-to-target rollback boundary", async () => {
    const receipt = await signReleaseRollbackReceipt(rollbackPayload(), recoveryToken);
    const result = await verifyReleaseRollbackReceipt(receipt, rollbackExpected());
    expect(result).toEqual({
      ok: true,
      receiptHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(result)).not.toContain(receipt);
    expect(JSON.stringify(result)).not.toContain(recoveryToken);
  });

  test("rejects a different current state, target epoch, target digest, or owner", async () => {
    const receipt = await signReleaseRollbackReceipt(rollbackPayload(), recoveryToken);
    for (const mismatch of [
      { currentReleaseEpoch: 3 },
      { currentBinding: { ...binding, releaseDigest: `sha256:${"7".repeat(64)}` } },
      { currentDeploymentManifestSha256: `sha256:${"b".repeat(64)}` },
      { targetReleaseEpoch: 2 },
      { targetBinding: { ...rollbackTargetBinding, programDigest: `sha256:${"8".repeat(64)}` } },
      { targetDeploymentManifestSha256: `sha256:${"c".repeat(64)}` },
      { subject: `owner:sha256:${"9".repeat(64)}` },
      { targetRollbackBoundary: "modal:alice-runtime:v47" },
    ]) {
      await expect(
        verifyReleaseRollbackReceipt(receipt, rollbackExpected(mismatch)),
      ).resolves.toEqual({
        ok: false,
        code: "RELEASE_ROLLBACK_RECEIPT_BINDING_MISMATCH",
      });
    }
  });

  test("rejects an expired rollback receipt and a receipt signed by another key", async () => {
    const expired = await signReleaseRollbackReceipt(
      rollbackPayload({ issuedAt: now - 60_000, expiresAt: now }),
      recoveryToken,
    );
    await expect(
      verifyReleaseRollbackReceipt(expired, rollbackExpected()),
    ).resolves.toEqual({
      ok: false,
      code: "RELEASE_ROLLBACK_RECEIPT_NOT_CURRENT",
    });
    const wrongKey = await signReleaseRollbackReceipt(
      rollbackPayload(),
      "different-recovery-token-at-least-32-bytes",
    );
    await expect(
      verifyReleaseRollbackReceipt(wrongKey, rollbackExpected()),
    ).resolves.toEqual({
      ok: false,
      code: "RELEASE_ROLLBACK_RECEIPT_INVALID",
    });
  });

  test("does not accept the deployment PAUSE_ALL token as recovery authority", async () => {
    const resumeReceipt = await signRecoveryReceipt(payload(), recoveryToken);
    await expect(
      verifyRecoveryReceipt(
        resumeReceipt,
        expected({ recoveryToken: deploymentPauseToken }),
      ),
    ).resolves.toEqual({ ok: false, code: "RECOVERY_RECEIPT_INVALID" });

    const rollbackReceipt = await signReleaseRollbackReceipt(
      rollbackPayload(),
      recoveryToken,
    );
    await expect(
      verifyReleaseRollbackReceipt(
        rollbackReceipt,
        rollbackExpected({ recoveryToken: deploymentPauseToken }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "RELEASE_ROLLBACK_RECEIPT_INVALID",
    });
  });
});
