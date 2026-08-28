import { describe, expect, test } from "bun:test";

import {
  canonicalJson,
  digestProgramEnvelope,
  digestReleaseIdentity,
  verifyProgramEnvelope,
  type ProgramEnvelope,
} from "../src/program";

const envelope: ProgramEnvelope = {
  schemaVersion: "alice.program-envelope.v1",
  programId: "alice-production-core-2026-08-22",
  issuedAt: "2026-08-22T18:00:00.000Z",
  expiresAt: "2026-08-29T18:00:00.000Z",
  release: {
    releaseEpoch: 1,
    sourceCommit: "521c1697089e43e10158acad0582f2b000514520",
    deploymentControllerCommit: "6".repeat(40),
    runtimeImage: "ghcr.io/rndrntwrk/milaidy-agent@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runtimeBuildManifestSha256: `sha256:${"c".repeat(64)}`,
    deploymentManifestSha256: `sha256:${"d".repeat(64)}`,
    elizaCommit: "a21d401bf7429bc8c794698b20832512b5315187",
    modalRevision: 49,
    policyHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    rollbackBoundary: "modal:alice-runtime:v49",
  },
  autonomy: {
    autonomousActions: [
      "research.read",
      "research.retrieve",
      "memory.read",
      "draft.create",
      "runtime.health",
    ],
    capabilityActions: ["sandbox.execute", "coding.patch.sandbox"],
    disabledActions: [
      "social.post",
      "social.message",
      "production.deploy",
      "repository.merge",
      "trade.execute",
      "funds.withdraw",
      "funds.bridge",
      "economic.sign",
      "identity.admin",
      "issuer.admin",
      "stream.public",
      "risk.increase",
    ],
  },
};

async function signingFixture(candidate: ProgramEnvelope = envelope) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(canonicalJson(candidate)),
  );
  return {
    publicJwk: await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    signature: Buffer.from(signature).toString("base64url"),
  };
}

describe("signed Alice ProgramEnvelope", () => {
  test("canonicalizes object keys while preserving array order", () => {
    expect(canonicalJson({ z: 1, nested: { b: true, a: null }, a: ["x", "y"] })).toBe(
      '{"a":["x","y"],"nested":{"a":null,"b":true},"z":1}',
    );
  });

  test("verifies the exact signed envelope and returns its digest", async () => {
    const fixture = await signingFixture();
    await expect(
      verifyProgramEnvelope(envelope, fixture.signature, fixture.publicJwk),
    ).resolves.toEqual({
      ok: true,
      programDigest: await digestProgramEnvelope(envelope),
    });
    expect(await digestReleaseIdentity(envelope)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("verifies a native Container v2 release tuple without Modal vocabulary", async () => {
    const { modalRevision: _legacyRevision, ...commonRelease } = envelope.release;
    const containerEnvelope: ProgramEnvelope = {
      ...envelope,
      schemaVersion: "alice.program-envelope.v2",
      release: {
        ...commonRelease,
        runtimeImage:
          `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"a".repeat(64)}`,
        runtimeRevision: 49,
        rollbackBoundary: "container:alice-runtime:v49",
      },
    };
    const fixture = await signingFixture(containerEnvelope);
    await expect(
      verifyProgramEnvelope(
        containerEnvelope,
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({
      ok: true,
      programDigest: await digestProgramEnvelope(containerEnvelope),
    });
    expect("modalRevision" in containerEnvelope.release).toBe(false);
  });

  test("rejects tampering, malformed signatures, and invalid envelope constraints", async () => {
    const fixture = await signingFixture();
    await expect(
      verifyProgramEnvelope(
        { ...envelope, programId: "tampered" },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_SIGNATURE_INVALID" });
    await expect(
      verifyProgramEnvelope(envelope, "not-base64url!", fixture.publicJwk),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_SIGNATURE_INVALID" });
    await expect(
      verifyProgramEnvelope(
        { ...envelope, schemaVersion: "unknown" as never },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    for (const candidate of [
      { ...envelope, unknownSecurityGate: true },
      {
        ...envelope,
        release: { ...envelope.release, unknownReleaseGate: true },
      },
      {
        ...envelope,
        autonomy: { ...envelope.autonomy, unknownAutonomyGate: true },
      },
      { ...envelope, issuedAt: "2026-08-22T18:00:00Z" },
      { ...envelope, issuedAt: "2026-08-22T13:00:00.000-05:00" },
      { ...envelope, issuedAt: "2026-08-22T18:00:00.000" },
    ]) {
      await expect(
        verifyProgramEnvelope(
          candidate as ProgramEnvelope,
          fixture.signature,
          fixture.publicJwk,
        ),
      ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    }
    await expect(
      verifyProgramEnvelope(
        {
          ...envelope,
          release: { ...envelope.release, runtimeImage: "ghcr.io/rndrntwrk/milaidy-agent:latest" },
        },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    await expect(
      verifyProgramEnvelope(
        { ...envelope, release: { ...envelope.release, modalRevision: 48 } },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    await expect(
      verifyProgramEnvelope(
        {
          ...envelope,
          release: {
            ...envelope.release,
            rollbackBoundary: "modal:alice-runtime:v48",
          },
        },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    await expect(
      verifyProgramEnvelope(
        { ...envelope, release: { ...envelope.release, releaseEpoch: 0 } },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    await expect(
      verifyProgramEnvelope(
        { ...envelope, expiresAt: "2026-08-29T18:00:00.001Z" },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    const { runtimeBuildManifestSha256: _removed, ...withoutBuildManifest } =
      envelope.release;
    await expect(
      verifyProgramEnvelope(
        { ...envelope, release: withoutBuildManifest as never },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
    const {
      deploymentManifestSha256: _manifest,
      ...withoutDeploymentManifest
    } =
      envelope.release;
    await expect(
      verifyProgramEnvelope(
        { ...envelope, release: withoutDeploymentManifest as never },
        fixture.signature,
        fixture.publicJwk,
      ),
    ).resolves.toEqual({ ok: false, code: "PROGRAM_ENVELOPE_INVALID" });
  });
});
