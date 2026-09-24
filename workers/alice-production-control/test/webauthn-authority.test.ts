import { describe, expect, test } from "bun:test";

import { AuthorityLedger } from "../src/authority";

const now = 1_787_400_000_000;
const owner = `owner:sha256:${"a".repeat(64)}`;
const otherOwner = `owner:sha256:${"b".repeat(64)}`;
const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const challenge = "a".repeat(43);
const argumentHash = `sha256:${"4".repeat(64)}`;
const target = "Render-Network-OS/555-bot";
const credential = {
  id: "credential-id-0001",
  publicKeyB64: "a".repeat(32),
  counter: 0,
  transports: ["usb"],
};

function registeredLedger() {
  const ledger = AuthorityLedger.create(binding, 100);
  expect(ledger.beginWebAuthnRegistration(owner, challenge, now).ok).toBe(true);
  expect(ledger.completeWebAuthnRegistration(owner, challenge, credential, now + 1).ok).toBe(true);
  return AuthorityLedger.restore(ledger.exportState(), binding, 100);
}

describe("Alice WebAuthn authority", () => {
  test("persists one owner credential and one bounded grant, rejecting replay and a different owner", () => {
    const ledger = registeredLedger();
    expect(ledger.completeWebAuthnRegistration(owner, challenge, credential, now + 2))
      .toMatchObject({ ok: false });
    expect(ledger.beginWebAuthnApproval(otherOwner, challenge, target, argumentHash,
      "cap-milaidy-1", "nonce-milaidy-1", now + 2))
      .toMatchObject({ ok: false, code: "WEBAUTHN_CREDENTIAL_REQUIRED" });
    expect(ledger.beginWebAuthnApproval(owner, challenge, "OtherOrg/private", argumentHash,
      "cap-invalid-repo", "nonce-invalid-repo", now + 2))
      .toMatchObject({ ok: false, code: "WEBAUTHN_APPROVAL_INVALID" });
    expect(ledger.beginWebAuthnApproval(owner, challenge, target, argumentHash,
      "cap-milaidy-1", "nonce-milaidy-1", now + 2).ok).toBe(true);
    expect(ledger.completeWebAuthnApproval(owner, challenge, credential.id, 1, now + 3))
      .toMatchObject({ ok: true, grant: {
        owner,
        scope: "coding.patch.sandbox",
        target,
        argumentHash,
        nonce: "nonce-milaidy-1",
        ...binding,
      } });
    expect(ledger.completeWebAuthnApproval(owner, challenge, credential.id, 2, now + 4))
      .toMatchObject({ ok: false, code: "WEBAUTHN_APPROVAL_INVALID" });

    const restored = AuthorityLedger.restore(ledger.exportState(), binding, 100);
    const grant = restored.exportState().capabilities["cap-milaidy-1"]!;
    const intent = {
      intentId: "intent-milaidy-1",
      action: "coding.patch.sandbox",
      target,
      argumentHash,
      nonce: grant.nonce,
      expiresAt: now + 60_000,
      capabilityId: grant.capabilityId,
      ...binding,
    };
    expect(restored.authorize(intent, now + 5, otherOwner).code).toBe("CAPABILITY_MISMATCH");
    expect(restored.authorize({ ...intent, argumentHash: `sha256:${"9".repeat(64)}` },
      now + 5, owner).code).toBe("CAPABILITY_MISMATCH");
    expect(restored.authorize({ ...intent, target: "rndrntwrk/milaidy" },
      now + 5, owner).code).toBe("CAPABILITY_MISMATCH");
    expect(restored.authorize({ ...intent, nonce: "nonce-intent-mismatch" },
      now + 5, owner).code).toBe("CAPABILITY_MISMATCH");
    expect(restored.authorize(intent, now + 5, owner).code).toBe("CAPABILITY_AUTHORIZED");
    expect(restored.authorize({ ...intent, intentId: "intent-milaidy-replay-same-nonce" },
      now + 6, owner).code).toBe("NONCE_REPLAY");
    expect(restored.authorize({ ...intent, intentId: "intent-milaidy-replay",
      nonce: "nonce-intent-milaidy-replay" }, now + 6, owner).code)
      .toBe("CAPABILITY_CONSUMED");
  });

  test("expires an approval challenge and denies a grant after coding pause or release change", () => {
    const ledger = registeredLedger();
    expect(ledger.beginWebAuthnApproval(owner, challenge, "rndrntwrk/milaidy", argumentHash,
      "cap-milaidy-expired", "nonce-milaidy-expired", now + 2).ok).toBe(true);
    expect(ledger.completeWebAuthnApproval(owner, challenge, credential.id, 1,
      now + 300_003).code).toBe("WEBAUTHN_APPROVAL_INVALID");
    expect(ledger.beginWebAuthnApproval(owner, challenge, "rndrntwrk/milaidy", argumentHash,
      "cap-milaidy-paused", "nonce-milaidy-paused", now + 300_004).ok).toBe(true);
    expect(ledger.pause("coding", now + 300_005, owner).ok).toBe(true);
    expect(ledger.completeWebAuthnApproval(owner, challenge, credential.id, 1,
      now + 300_006).code).toBe("WEBAUTHN_PAUSED");

    const unpaused = registeredLedger();
    expect(unpaused.beginWebAuthnApproval(owner, challenge, "rndrntwrk/milaidy", argumentHash,
      "cap-milaidy-release", "nonce-milaidy-release", now + 2).ok).toBe(true);
    const promoted = { ...binding, releaseDigest: `sha256:${"5".repeat(64)}` };
    expect(unpaused.activateRelease({
      binding: promoted,
      deploymentManifestSha256: `sha256:${"6".repeat(64)}`,
      releaseEpoch: 2,
      programIssuedAt: now + 3,
      rollbackBoundary: "test:promoted-release",
    }, 100, now + 3).ok).toBe(true);
    expect(unpaused.completeWebAuthnApproval(owner, challenge, credential.id, 1,
      now + 4).code).toBe("WEBAUTHN_APPROVAL_INVALID");
  });

  test("binds a publication grant to the owner, task request and action", () => {
    const ledger = registeredLedger();
    expect(ledger.beginWebAuthnApproval(owner, challenge, target, argumentHash,
      "cap-publish-1", "nonce-publish-1", now + 2, "coding.pr.create").ok).toBe(true);
    const completed = ledger.completeWebAuthnApproval(owner, challenge, credential.id, 1, now + 3);
    expect(completed).toMatchObject({ ok: true, grant: { scope: "coding.pr.create" } });
    const grant = ledger.exportState().capabilities["cap-publish-1"]!;
    const intent = {
      intentId: "intent-publish-1", action: "coding.pr.create", target,
      argumentHash, nonce: grant.nonce, expiresAt: now + 60_000,
      capabilityId: grant.capabilityId, ...binding,
    };
    expect(ledger.authorize({ ...intent, action: "coding.patch.sandbox" }, now + 4, owner).code)
      .toBe("CAPABILITY_MISMATCH");
    expect(ledger.authorize(intent, now + 5, owner).code).toBe("CAPABILITY_AUTHORIZED");
  });
});
