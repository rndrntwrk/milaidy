import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import {
  buildAliceDeploymentManifest,
  digestAliceDeploymentManifest,
  serializeAliceDeploymentManifest,
  verifyAliceDeploymentManifest,
} from "./alice_deployment_manifest.mjs";
import {
  buildAliceAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceContainerAccessEffectiveConfig,
  buildAliceControlEffectiveConfig,
  buildAliceContainerControlEffectiveConfig,
  digestAliceEffectiveConfig,
  encodeAliceDeploymentManifest,
  verifyAliceEffectiveConfigBinding,
} from "../../workers/alice-effective-config.js";
import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";
import {
  buildAliceCloudflareContinuityConfig,
  digestAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";
import {
  aliceTestCloudflareContinuityReadback,
  aliceTestProviderReadbacks,
  aliceTestVerifiedWorkerBundleArtifact,
} from "./test-fixtures/alice_provider_readbacks.mjs";

const accessAudience = "1f65441271f72eee92c371c42306885595ae71f950d2ed5aaa1ac354788410e4";
const { accessPolicyReadback, aiGatewayProviderReadback } =
  aliceTestProviderReadbacks({ accessAudience });
const accessEffectiveConfig = buildAliceAccessEffectiveConfig({
  accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
  accessAudience,
  ownerEmailSha256: accessPolicyReadback.ownerEmailSha256,
  upstreamOrigin: "https://rndrntwrk--alice.modal.run",
});
const controlEffectiveConfig = buildAliceControlEffectiveConfig({
  accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
  accessAudience,
  ownerEmailSha256: accessPolicyReadback.ownerEmailSha256,
  modelDailyBudgetUnits: 10_000,
  modalRevision: 49,
  releaseAccessAudience: "alice-release-controller-audience",
  releaseServiceTokenIdSha256: "R".repeat(43),
});
const aiGatewayEffectiveConfig = buildAliceAiGatewayEffectiveConfig();
const workerBundleArtifact = aliceTestVerifiedWorkerBundleArtifact({
  sourceCommit: "1".repeat(40),
});
const cloudflareContinuityReadback = aliceTestCloudflareContinuityReadback();
const containerAccessEffectiveConfig = buildAliceContainerAccessEffectiveConfig({
  accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
  accessAudience,
  ownerEmailSha256: accessPolicyReadback.ownerEmailSha256,
  runtimeImage:
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"9".repeat(64)}`,
});

const valid = {
  releaseEpoch: 1,
  sourceCommit: "1".repeat(40),
  deploymentControllerCommit: "2".repeat(40),
  elizaCommit: "3".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"4".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"5".repeat(64)}`,
  capabilityBomSha256: `sha256:${"7".repeat(64)}`,
  modalRevision: 49,
  policyHash: `sha256:${"6".repeat(64)}`,
  rollbackBoundary: "modal:alice-runtime:v49",
  accessEffectiveConfig,
  controlEffectiveConfig,
  aiGatewayEffectiveConfig,
  accessPolicyReadback,
  aiGatewayProviderReadback,
  cloudflareContinuityReadback,
  workerBundleArtifact,
};

test("builds one non-self-referential production deployment manifest from canonical effective configs", async () => {
  const manifest = await buildAliceDeploymentManifest(valid);
  assert.equal(manifest.source.capabilityBomSha256, valid.capabilityBomSha256);
  assert.deepEqual(manifest.cloudflare, {
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    accessDomain: "alice.rndrntwrk.com",
    releaseControlDomain: "alice-release.rndrntwrk.com",
    accessWorker: "alice-access-gateway",
    controlWorker: "alice-production-control",
    aiGatewayWorker: "alice-ai-gateway",
    aiGateway: "alice-production",
    evidenceBucket: "alice-production-evidence",
    evidenceQueue: "alice-production-evidence-v1",
    evidenceDlq: "alice-production-evidence-dlq-v1",
    planWorkflow: "alice-production-plans",
    accessPolicyConfigSha256: await digestAliceEffectiveConfig(
      await buildAliceAccessPolicyProviderConfig(accessPolicyReadback),
    ),
    accessWorkerBundleSha256: workerBundleArtifact.bundles.access.sha256,
    accessConfigSha256: await digestAliceEffectiveConfig(accessEffectiveConfig),
    controlConfigSha256: await digestAliceEffectiveConfig(controlEffectiveConfig),
    aiGatewayConfigSha256: await digestAliceEffectiveConfig(aiGatewayEffectiveConfig),
    aiGatewayProviderConfigSha256:
      await digestAliceEffectiveConfig(
        buildAliceAiGatewayProviderConfig(aiGatewayProviderReadback),
      ),
    aiGatewayWorkerBundleSha256: workerBundleArtifact.bundles.aiGateway.sha256,
    controlWorkerBundleSha256: workerBundleArtifact.bundles.control.sha256,
    continuityConfigSha256: digestAliceCloudflareContinuityConfig(
      buildAliceCloudflareContinuityConfig(cloudflareContinuityReadback),
    ),
  });
  assert.equal("deploymentManifestSha256" in manifest, false);
  assert.equal("programDigest" in manifest, false);
  assert.equal("releaseDigest" in manifest, false);

  const bytes = serializeAliceDeploymentManifest(manifest);
  assert.equal(bytes.endsWith("\n"), true);
  assert.equal(
    digestAliceDeploymentManifest(bytes),
    `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
  );
  assert.deepEqual(verifyAliceDeploymentManifest(bytes), manifest);
  await verifyAliceEffectiveConfigBinding({
    encodedManifest: encodeAliceDeploymentManifest(bytes),
    expectedManifestSha256: digestAliceDeploymentManifest(bytes),
    role: "access",
    effectiveConfig: accessEffectiveConfig,
  });
});

test("builds a Container manifest without Modal release vocabulary", async () => {
  const { modalRevision: _modalRevision, ...common } = valid;
  const manifest = await buildAliceDeploymentManifest({
    ...common,
    accessEffectiveConfig: containerAccessEffectiveConfig,
    controlEffectiveConfig: buildAliceContainerControlEffectiveConfig({
      accessIssuer: "https://rndrntwrk.cloudflareaccess.com",
      accessAudience,
      ownerEmailSha256: accessPolicyReadback.ownerEmailSha256,
      modelDailyBudgetUnits: 10_000,
      runtimeRevision: 49,
      releaseAccessAudience: "alice-release-controller-audience",
      releaseServiceTokenIdSha256: "R".repeat(43),
    }),
    runtimeImage: containerAccessEffectiveConfig.values.runtimeImage,
    runtimeRevision: 49,
    rollbackBoundary: "container:alice-runtime:v49",
  });
  assert.equal(manifest.schemaVersion, "alice.deployment-manifest.v2");
  assert.deepEqual(manifest.release, {
    releaseEpoch: 1,
    runtimeRevision: 49,
    policyHash: `sha256:${"6".repeat(64)}`,
    rollbackBoundary: "container:alice-runtime:v49",
  });
  assert.equal("modalRevision" in manifest.release, false);
  assert.deepEqual(
    verifyAliceDeploymentManifest(serializeAliceDeploymentManifest(manifest)),
    manifest,
  );
});

test("rejects substituted targets, ambiguous bytes, and self-referential fields", async () => {
  await assert.rejects(() =>
    buildAliceDeploymentManifest({ ...valid, modalRevision: 48 }),
  );
  await assert.rejects(() =>
    buildAliceDeploymentManifest({
      ...valid,
      cloudflareContinuityReadback: {
        ...cloudflareContinuityReadback,
        queue: {
          ...cloudflareContinuityReadback.queue,
          settings: {
            ...cloudflareContinuityReadback.queue.settings,
            delivery_paused: true,
          },
        },
      },
    }),
  );
  await assert.rejects(() =>
    buildAliceDeploymentManifest({
      ...valid,
      cloudflareContinuityReadback: {
        ...cloudflareContinuityReadback,
        queue: {
          ...cloudflareContinuityReadback.queue,
          queue_id: cloudflareContinuityReadback.deadLetterQueue.queue_id,
        },
      },
    }),
  );
  await assert.rejects(() =>
    buildAliceDeploymentManifest({
      ...valid,
      accessPolicyReadback: {
        ...valid.accessPolicyReadback,
        application: {
          ...valid.accessPolicyReadback.application,
          session_duration: undefined,
        },
      },
    }),
  );
  const manifest = await buildAliceDeploymentManifest(valid);
  assert.throws(() =>
    verifyAliceDeploymentManifest(
      `${JSON.stringify({
        ...manifest,
        cloudflare: { ...manifest.cloudflare, accessDomain: "other.example" },
      })}\n`,
    ),
  );
  assert.throws(() =>
    verifyAliceDeploymentManifest(
      `${JSON.stringify({
        ...manifest,
        deploymentManifestSha256: `sha256:${"a".repeat(64)}`,
      })}\n`,
    ),
  );
  assert.throws(() => verifyAliceDeploymentManifest(JSON.stringify(manifest)));
});

test("fails closed on every one-field effective-config substitution", async () => {
  const manifest = await buildAliceDeploymentManifest(valid);
  const bytes = serializeAliceDeploymentManifest(manifest);
  const encodedManifest = encodeAliceDeploymentManifest(bytes);
  const expectedManifestSha256 = digestAliceDeploymentManifest(bytes);
  const substitutions = [
    {
      role: "access",
      config: {
        ...accessEffectiveConfig,
        values: {
          ...accessEffectiveConfig.values,
          upstreamOrigin: "https://rndrntwrk--alice-other.modal.run",
        },
      },
    },
    {
      role: "control",
      config: {
        ...controlEffectiveConfig,
        values: {
          ...controlEffectiveConfig.values,
          modelDailyBudgetUnits: 9_999,
        },
      },
    },
    {
      role: "aiGateway",
      config: {
        ...aiGatewayEffectiveConfig,
        values: {
          ...aiGatewayEffectiveConfig.values,
          aiGatewayId: "alice-substituted",
        },
      },
    },
  ];
  for (const substitution of substitutions) {
    await assert.rejects(
      () => verifyAliceEffectiveConfigBinding({
        encodedManifest,
        expectedManifestSha256,
        role: substitution.role,
        effectiveConfig: substitution.config,
      }),
      /ALICE_EFFECTIVE_CONFIG_MISMATCH/,
    );
  }
});
