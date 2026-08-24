import { describe, expect, test } from "bun:test";

import { canonicalJson, type ProgramEnvelope } from "../src/program";
import {
  buildAliceAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceControlEffectiveConfig,
  encodeAliceDeploymentManifest,
} from "../../alice-effective-config.js";
import {
  buildAliceDeploymentManifest,
  digestAliceDeploymentManifest,
  serializeAliceDeploymentManifest,
} from "../../../deploy/modal/alice_deployment_manifest.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestProviderReadbacks,
  aliceTestVerifiedWorkerBundleArtifact,
} from "../../../deploy/modal/test-fixtures/alice_provider_readbacks.mjs";
import {
  loadAuthoritySafetyConfig,
  loadDeploymentControllerAccessConfig,
  loadOwnerAccessConfig,
  loadRuntimeConfig,
} from "../src/runtime-config";

function base64Url(value: string | ArrayBuffer): string {
  return Buffer.from(typeof value === "string" ? value : new Uint8Array(value)).toString("base64url");
}

async function fixture() {
  const ownerEmailSha256 = base64Url(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("alice-owner@rndrntwrk.com"),
    ),
  );
  const releaseSource = {
    sourceCommit: "521c1697089e43e10158acad0582f2b000514520",
    deploymentControllerCommit: "6".repeat(40),
    runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"a".repeat(64)}`,
    runtimeBuildManifestSha256: `sha256:${"c".repeat(64)}`,
    elizaCommit: "a21d401bf7429bc8c794698b20832512b5315187",
  };
  const providerReadbacks = aliceTestProviderReadbacks({
    accessAudience: "access-audience",
    ownerEmail: "alice-owner@rndrntwrk.com",
  });
  expect(providerReadbacks.accessPolicyReadback.ownerEmailSha256).toBe(
    ownerEmailSha256,
  );
  const deploymentManifest = await buildAliceDeploymentManifest({
    releaseEpoch: 1,
    ...releaseSource,
    modalRevision: 49,
    policyHash: `sha256:${"b".repeat(64)}`,
    rollbackBoundary: "modal:alice-runtime:v49",
    ...providerReadbacks,
    cloudflareContinuityReadback: aliceTestCloudflareContinuityReadback(),
    workerBundleArtifact: aliceTestVerifiedWorkerBundleArtifact({
      sourceCommit: releaseSource.sourceCommit,
    }),
    accessEffectiveConfig: buildAliceAccessEffectiveConfig({
      accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
      accessAudience: "access-audience",
      ownerEmailSha256,
      upstreamOrigin: "https://rndrntwrk--alice.modal.run",
    }),
    controlEffectiveConfig: buildAliceControlEffectiveConfig({
      accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
      accessAudience: "access-audience",
      ownerEmailSha256,
      modelDailyBudgetUnits: 10_000,
      modalRevision: 49,
      releaseAccessAudience: "alice-release-controller-audience",
      releaseServiceTokenIdSha256: "R".repeat(43),
    }),
    aiGatewayEffectiveConfig: buildAliceAiGatewayEffectiveConfig(),
  });
  const deploymentManifestBytes = serializeAliceDeploymentManifest(
    deploymentManifest,
  );
  const envelope: ProgramEnvelope = {
    schemaVersion: "alice.program-envelope.v1",
    programId: "alice-production-core-2026-08-22",
    issuedAt: "2026-08-22T12:00:00.000Z",
    expiresAt: "2026-08-29T12:00:00.000Z",
    release: {
      releaseEpoch: 1,
      ...releaseSource,
      deploymentManifestSha256: digestAliceDeploymentManifest(
        deploymentManifestBytes,
      ),
      modalRevision: 49,
      policyHash: `sha256:${"b".repeat(64)}`,
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
  const signEnvelope = async (value: ProgramEnvelope): Promise<string> =>
    base64Url(
      await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keyPair.privateKey,
        new TextEncoder().encode(canonicalJson(value)),
      ),
    );
  const signature = await signEnvelope(envelope);
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const publicJwkDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(publicJwk)),
  );
  return {
    envelope,
    signEnvelope,
    trustPins: {
      programPublicJwkSha256: `sha256:${Buffer.from(publicJwkDigest).toString("hex")}`,
      policyHash: envelope.release.policyHash,
    },
    env: {
      ALICE_ACCESS_ISSUER: "https://rndrntwrk.cloudflareaccess.com",
      ALICE_ACCESS_AUDIENCE: "access-audience",
      ALICE_OWNER_EMAIL_SHA256: ownerEmailSha256,
      ALICE_RELEASE_ACCESS_AUDIENCE: "alice-release-controller-audience",
      ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256: "R".repeat(43),
      ALICE_MODEL_DAILY_BUDGET_UNITS: "10000",
      ALICE_PROGRAM_ENVELOPE_B64: base64Url(JSON.stringify(envelope)),
      ALICE_PROGRAM_SIGNATURE_B64: signature,
      ALICE_PROGRAM_PUBLIC_JWK_B64: base64Url(JSON.stringify(publicJwk)),
      ALICE_MODAL_REVISION: "49",
      ALICE_DEPLOYMENT_MANIFEST_SHA256: envelope.release.deploymentManifestSha256,
      ALICE_DEPLOYMENT_MANIFEST_B64: encodeAliceDeploymentManifest(
        deploymentManifestBytes,
      ),
      ALICE_CONTROL_RECOVERY_TOKEN: "recovery-token-with-at-least-32-bytes",
      ALICE_DEPLOYMENT_PAUSE_TOKEN:
        "deployment-pause-token-with-at-least-32-bytes",
      ALICE_ACCESS_GATEWAY_SERVICE_TOKEN:
        "access-service-token-with-at-least-32-bytes",
      ALICE_AI_GATEWAY_SERVICE_TOKEN:
        "ai-service-token-with-at-least-32-bytes----",
    },
  };
}

describe("Alice runtime configuration", () => {
  test("loads only the exact machine Access audience and service-token digest", () => {
    expect(
      loadDeploymentControllerAccessConfig({
        ALICE_ACCESS_ISSUER: "https://rndrntwrk.cloudflareaccess.com",
        ALICE_RELEASE_ACCESS_AUDIENCE:
          "alice-release-controller-audience",
        ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256: "R".repeat(43),
      }),
    ).toEqual({
      accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
      accessAudience: "alice-release-controller-audience",
      serviceClientIdSha256: "R".repeat(43),
    });
    expect(() =>
      loadDeploymentControllerAccessConfig({
        ALICE_ACCESS_ISSUER: "https://rndrntwrk.cloudflareaccess.com",
        ALICE_RELEASE_ACCESS_AUDIENCE:
          "alice-release-controller-audience",
        ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256: "short",
      }),
    ).toThrow("ALICE_DEPLOYMENT_CONTROLLER_ACCESS_CONFIG_INVALID");
  });

  test("loads one currently valid signed release binding", async () => {
    const { envelope, env, trustPins } = await fixture();
    const config = await loadRuntimeConfig(
      env,
      Date.parse("2026-08-22T18:00:00.000Z"),
      trustPins,
    );
    expect(config.envelope).toEqual(envelope);
    expect(config.binding).toEqual({
      programDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      releaseDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      policyHash: envelope.release.policyHash,
    });
    expect(config.modelDailyBudgetUnits).toBe(10000);
    expect(config.modalRevision).toBe(envelope.release.modalRevision);
    expect(config.deploymentManifestSha256).toBe(envelope.release.deploymentManifestSha256);
  });

  test("rejects an expired program or a malformed operational boundary", async () => {
    const { env, trustPins } = await fixture();
    await expect(
      loadRuntimeConfig(env, Date.parse("2026-08-29T12:00:00.000Z"), trustPins),
    ).rejects.toThrow("ALICE_PROGRAM_NOT_CURRENT");
    await expect(
      loadRuntimeConfig(
        { ...env, ALICE_MODAL_REVISION: "pending" },
        Date.parse("2026-08-22T18:00:00.000Z"),
        trustPins,
      ),
    ).rejects.toThrow("ALICE_RUNTIME_CONFIG_INVALID");
    await expect(
      loadRuntimeConfig(
        { ...env, ALICE_MODAL_REVISION: "50" },
        Date.parse("2026-08-22T18:00:00.000Z"),
        trustPins,
      ),
    ).rejects.toThrow("ALICE_RUNTIME_CONFIG_INVALID");
    await expect(
      loadRuntimeConfig(
        { ...env, ALICE_DEPLOYMENT_MANIFEST_SHA256: `sha256:${"e".repeat(64)}` },
        Date.parse("2026-08-22T18:00:00.000Z"),
        trustPins,
      ),
    ).rejects.toThrow("ALICE_RUNTIME_CONFIG_INVALID");
  });

  test("rejects a signed-envelope tamper", async () => {
    const { envelope, env, trustPins } = await fixture();
    const tampered = {
      ...envelope,
      release: { ...envelope.release, sourceCommit: "9".repeat(40) },
    };
    await expect(
      loadRuntimeConfig(
        { ...env, ALICE_PROGRAM_ENVELOPE_B64: base64Url(JSON.stringify(tampered)) },
        Date.parse("2026-08-22T18:00:00.000Z"),
        trustPins,
      ),
    ).rejects.toThrow("PROGRAM_SIGNATURE_INVALID");
  });

  test("rejects every validly signed Program release identity that differs from its manifest", async () => {
    const { envelope, env, trustPins, signEnvelope } = await fixture();
    const cases: Array<{
      release: ProgramEnvelope["release"];
      env?: Partial<typeof env>;
      trustPins?: typeof trustPins;
    }> = [
      { release: { ...envelope.release, releaseEpoch: 2 } },
      { release: { ...envelope.release, sourceCommit: "9".repeat(40) } },
      {
        release: {
          ...envelope.release,
          deploymentControllerCommit: "8".repeat(40),
        },
      },
      { release: { ...envelope.release, elizaCommit: "7".repeat(40) } },
      {
        release: {
          ...envelope.release,
          runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"d".repeat(64)}`,
        },
      },
      {
        release: {
          ...envelope.release,
          runtimeBuildManifestSha256: `sha256:${"e".repeat(64)}`,
        },
      },
      {
        release: {
          ...envelope.release,
          modalRevision: 50,
          rollbackBoundary: "modal:alice-runtime:v50",
        },
        env: { ALICE_MODAL_REVISION: "50" },
      },
      {
        release: {
          ...envelope.release,
          policyHash: `sha256:${"f".repeat(64)}`,
        },
        trustPins: {
          ...trustPins,
          policyHash: `sha256:${"f".repeat(64)}`,
        },
      },
    ];
    for (const item of cases) {
      const signedEnvelope = { ...envelope, release: item.release };
      await expect(
        loadRuntimeConfig(
          {
            ...env,
            ...item.env,
            ALICE_PROGRAM_ENVELOPE_B64: base64Url(
              JSON.stringify(signedEnvelope),
            ),
            ALICE_PROGRAM_SIGNATURE_B64:
              await signEnvelope(signedEnvelope),
          },
          Date.parse("2026-08-22T18:00:00.000Z"),
          item.trustPins ?? trustPins,
        ),
      ).rejects.toThrow("ALICE_RELEASE_MANIFEST_MISMATCH");
    }
  });

  test("keeps owner emergency controls loadable when release admission is invalid", async () => {
    const { env } = await fixture();
    const ownerAccess = loadOwnerAccessConfig({
      ...env,
      ALICE_PROGRAM_ENVELOPE_B64: "invalid-release-admission",
      ALICE_PROGRAM_SIGNATURE_B64: "invalid-release-admission",
      ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: "short",
      ALICE_AI_GATEWAY_SERVICE_TOKEN: "short",
    });
    const authoritySafety = loadAuthoritySafetyConfig({
      ...env,
      ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: "short",
      ALICE_AI_GATEWAY_SERVICE_TOKEN: "short",
    });
    expect(ownerAccess).toMatchObject({
      accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
    });
    expect(authoritySafety).toMatchObject({
      modelDailyBudgetUnits: 10000,
      recoveryToken: "recovery-token-with-at-least-32-bytes",
    });
  });

  test("does not let a malformed subordinate credential invalidate signed release config", async () => {
    const { env, trustPins } = await fixture();
    const config = await loadRuntimeConfig(
      {
        ...env,
        ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: "short",
        ALICE_AI_GATEWAY_SERVICE_TOKEN: "also-short",
      },
      Date.parse("2026-08-22T18:00:00.000Z"),
      trustPins,
    );
    expect(config.deploymentManifestSha256).toBe(
      env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    );
  });

  test("rejects a one-field effective control configuration substitution", async () => {
    const { env, trustPins } = await fixture();
    await expect(
      loadRuntimeConfig(
        { ...env, ALICE_MODEL_DAILY_BUDGET_UNITS: "9999" },
        Date.parse("2026-08-22T18:00:00.000Z"),
        trustPins,
      ),
    ).rejects.toThrow("ALICE_EFFECTIVE_CONFIG_MISMATCH");
  });

  test("rejects a valid signature from an unpinned Program key and an unpinned policy", async () => {
    const { env, trustPins } = await fixture();
    await expect(
      loadRuntimeConfig(env, Date.parse("2026-08-22T18:00:00.000Z")),
    ).rejects.toThrow("ALICE_PROGRAM_TRUST_PIN_MISMATCH");
    await expect(
      loadRuntimeConfig(env, Date.parse("2026-08-22T18:00:00.000Z"), {
        ...trustPins,
        programPublicJwkSha256: `sha256:${"9".repeat(64)}`,
      }),
    ).rejects.toThrow("ALICE_PROGRAM_TRUST_PIN_MISMATCH");
    await expect(
      loadRuntimeConfig(env, Date.parse("2026-08-22T18:00:00.000Z"), {
        ...trustPins,
        policyHash: `sha256:${"8".repeat(64)}`,
      }),
    ).rejects.toThrow("ALICE_POLICY_TRUST_PIN_MISMATCH");
  });
});
