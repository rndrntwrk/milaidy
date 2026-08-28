import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ALICE_CLOUDFLARE_TARGET,
  buildAliceAccessEffectiveConfig,
  buildAliceContainerAccessEffectiveConfig,
  buildAliceAiGatewayEffectiveConfig,
  buildAliceControlEffectiveConfig,
  canonicalAliceJson,
  digestAliceEffectiveConfig,
} from "../../workers/alice-effective-config.js";
import {
  buildAliceAccessPolicyProviderConfig,
  buildAliceAiGatewayProviderConfig,
} from "./alice_cloudflare_provider_config.mjs";
import {
  buildAliceCandidateCloudflareContinuityReadback,
  buildAliceCloudflareContinuityConfig,
  digestAliceCloudflareContinuityConfig,
} from "./alice_cloudflare_continuity.mjs";
import {
  aliceWorkerBundleDigests,
  verifyAliceWorkerBundleArtifact,
} from "./alice_worker_bundle_artifact.mjs";
import {
  fetchAliceCloudflareContinuityState,
  fetchAliceCloudflareProviderState,
} from "./alice_cloudflare_live_readback.mjs";

const COMMIT = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE = /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;
const INPUT_KEYS = [
  "accessEffectiveConfig",
  "accessPolicyReadback",
  "aiGatewayEffectiveConfig",
  "aiGatewayProviderReadback",
  "controlEffectiveConfig",
  "cloudflareContinuityReadback",
  "capabilityBomSha256",
  "deploymentControllerCommit",
  "elizaCommit",
  "modalRevision",
  "policyHash",
  "releaseEpoch",
  "rollbackBoundary",
  "runtimeBuildManifestSha256",
  "runtimeImage",
  "sourceCommit",
  "workerBundleArtifact",
];

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function effectiveConfigsAreCanonical(value) {
  try {
    const accessValues = value.accessEffectiveConfig?.values;
    const controlValues = value.controlEffectiveConfig?.values;
    const expectedAccess =
      value.accessEffectiveConfig?.schemaVersion ===
      "alice.container-access-effective-config.v1"
        ? buildAliceContainerAccessEffectiveConfig({
            accessIssuer: accessValues?.accessIssuer,
            accessAudience: accessValues?.accessAudience,
            ownerEmailSha256: accessValues?.ownerEmailSha256,
            runtimeImage: accessValues?.runtimeImage,
          })
        : buildAliceAccessEffectiveConfig({
            accessIssuer: accessValues?.accessIssuer,
            accessAudience: accessValues?.accessAudience,
            ownerEmailSha256: accessValues?.ownerEmailSha256,
            upstreamOrigin: accessValues?.upstreamOrigin,
          });
    const expectedControl = buildAliceControlEffectiveConfig({
      accessIssuer: controlValues?.accessIssuer,
      accessAudience: controlValues?.accessAudience,
      ownerEmailSha256: controlValues?.ownerEmailSha256,
      modelDailyBudgetUnits: controlValues?.modelDailyBudgetUnits,
      modalRevision: controlValues?.modalRevision,
      releaseAccessAudience: controlValues?.releaseAccessAudience,
      releaseServiceTokenIdSha256:
        controlValues?.releaseServiceTokenIdSha256,
    });
    const expectedAiGateway = buildAliceAiGatewayEffectiveConfig();
    return (
      canonicalAliceJson(value.accessEffectiveConfig) ===
        canonicalAliceJson(expectedAccess) &&
      canonicalAliceJson(value.controlEffectiveConfig) ===
        canonicalAliceJson(expectedControl) &&
      canonicalAliceJson(value.aiGatewayEffectiveConfig) ===
        canonicalAliceJson(expectedAiGateway)
    );
  } catch {
    return false;
  }
}

async function validInputs(value) {
  let providerConfigsValid = false;
  let continuityConfigValid = false;
  let workerBundleArtifactValid = false;
  try {
    await buildAliceAccessPolicyProviderConfig(value.accessPolicyReadback);
    buildAliceAiGatewayProviderConfig(value.aiGatewayProviderReadback);
    providerConfigsValid =
      value.accessPolicyReadback.ownerEmailSha256 ===
        value.accessEffectiveConfig?.values?.ownerEmailSha256 &&
      value.accessPolicyReadback.accessAudience ===
        value.accessEffectiveConfig?.values?.accessAudience;
  } catch {
    providerConfigsValid = false;
  }
  try {
    const continuityConfig = buildAliceCloudflareContinuityConfig(
      value.cloudflareContinuityReadback,
    );
    continuityConfigValid =
      continuityConfig.evidenceQueue.deliveryPaused === false &&
      continuityConfig.evidenceDeadLetterQueue.deliveryPaused === true;
  } catch {
    continuityConfigValid = false;
  }
  try {
    const bundleDigests = aliceWorkerBundleDigests(value.workerBundleArtifact);
    workerBundleArtifactValid =
      value.workerBundleArtifact.sourceCommit === value.sourceCommit &&
      ["access", "control", "aiGateway"].every(
        (role) => DIGEST.test(bundleDigests[role] ?? ""),
      );
  } catch {
    workerBundleArtifactValid = false;
  }
  return (
    exactKeys(value, INPUT_KEYS) &&
    Number.isSafeInteger(value.releaseEpoch) &&
    value.releaseEpoch > 0 &&
    COMMIT.test(value.sourceCommit) &&
    COMMIT.test(value.deploymentControllerCommit) &&
    COMMIT.test(value.elizaCommit) &&
    IMAGE.test(value.runtimeImage) &&
    DIGEST.test(value.runtimeBuildManifestSha256) &&
    DIGEST.test(value.capabilityBomSha256) &&
    Number.isInteger(value.modalRevision) &&
    value.modalRevision >= 49 &&
    DIGEST.test(value.policyHash) &&
    providerConfigsValid &&
    continuityConfigValid &&
    workerBundleArtifactValid &&
    typeof value.rollbackBoundary === "string" &&
    value.rollbackBoundary === `modal:alice-runtime:v${value.modalRevision}` &&
    effectiveConfigsAreCanonical(value)
  );
}

function validManifest(value) {
  if (
    !exactKeys(value, ["schemaVersion", "release", "source", "cloudflare"]) ||
    value.schemaVersion !== "alice.deployment-manifest.v1" ||
    !exactKeys(value.source, [
      "deploymentControllerCommit",
      "capabilityBomSha256",
      "elizaCommit",
      "runtimeBuildManifestSha256",
      "runtimeImage",
      "sourceCommit",
    ]) ||
    !exactKeys(value.release, [
      "modalRevision",
      "policyHash",
      "releaseEpoch",
      "rollbackBoundary",
    ]) ||
    !exactKeys(value.cloudflare, [
      ...Object.keys(ALICE_CLOUDFLARE_TARGET),
      "accessConfigSha256",
      "accessPolicyConfigSha256",
      "accessWorkerBundleSha256",
      "controlConfigSha256",
      "aiGatewayConfigSha256",
      "aiGatewayProviderConfigSha256",
      "aiGatewayWorkerBundleSha256",
      "controlWorkerBundleSha256",
      "continuityConfigSha256",
    ])
  ) {
    return false;
  }
  const reconstructed = {
    releaseEpoch: value.release.releaseEpoch,
    sourceCommit: value.source.sourceCommit,
    deploymentControllerCommit: value.source.deploymentControllerCommit,
    elizaCommit: value.source.elizaCommit,
    runtimeImage: value.source.runtimeImage,
    runtimeBuildManifestSha256: value.source.runtimeBuildManifestSha256,
    capabilityBomSha256: value.source.capabilityBomSha256,
    modalRevision: value.release.modalRevision,
    policyHash: value.release.policyHash,
    rollbackBoundary: value.release.rollbackBoundary,
    accessEffectiveConfig: value.__effectiveConfigs?.access,
    controlEffectiveConfig: value.__effectiveConfigs?.control,
    aiGatewayEffectiveConfig: value.__effectiveConfigs?.aiGateway,
  };
  return (
    Number.isSafeInteger(reconstructed.releaseEpoch) &&
    reconstructed.releaseEpoch > 0 &&
    COMMIT.test(reconstructed.sourceCommit) &&
    COMMIT.test(reconstructed.deploymentControllerCommit) &&
    COMMIT.test(reconstructed.elizaCommit) &&
    IMAGE.test(reconstructed.runtimeImage) &&
    DIGEST.test(reconstructed.runtimeBuildManifestSha256) &&
    DIGEST.test(reconstructed.capabilityBomSha256) &&
    Number.isInteger(reconstructed.modalRevision) &&
    reconstructed.modalRevision >= 49 &&
    DIGEST.test(reconstructed.policyHash) &&
    reconstructed.rollbackBoundary ===
      `modal:alice-runtime:v${reconstructed.modalRevision}` &&
    DIGEST.test(value.cloudflare.accessConfigSha256) &&
    DIGEST.test(value.cloudflare.accessPolicyConfigSha256) &&
    DIGEST.test(value.cloudflare.controlConfigSha256) &&
    DIGEST.test(value.cloudflare.aiGatewayConfigSha256) &&
    DIGEST.test(value.cloudflare.aiGatewayProviderConfigSha256) &&
    DIGEST.test(value.cloudflare.accessWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.controlWorkerBundleSha256) &&
    DIGEST.test(value.cloudflare.continuityConfigSha256) &&
    DIGEST.test(value.cloudflare.aiGatewayWorkerBundleSha256) &&
    Object.entries(ALICE_CLOUDFLARE_TARGET).every(
      ([key, expected]) => value.cloudflare[key] === expected,
    )
  );
}

export async function buildAliceDeploymentManifest(inputs) {
  if (!(await validInputs(inputs))) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INPUT_INVALID");
  }
  const accessPolicyConfig =
    await buildAliceAccessPolicyProviderConfig(inputs.accessPolicyReadback);
  const aiGatewayProviderConfig =
    buildAliceAiGatewayProviderConfig(inputs.aiGatewayProviderReadback);
  const workerBundleDigests = aliceWorkerBundleDigests(
    inputs.workerBundleArtifact,
  );
  const continuityConfig = buildAliceCloudflareContinuityConfig(
    inputs.cloudflareContinuityReadback,
  );
  return {
    schemaVersion: "alice.deployment-manifest.v1",
    release: {
      releaseEpoch: inputs.releaseEpoch,
      modalRevision: inputs.modalRevision,
      policyHash: inputs.policyHash,
      rollbackBoundary: inputs.rollbackBoundary,
    },
    source: {
      sourceCommit: inputs.sourceCommit,
      deploymentControllerCommit: inputs.deploymentControllerCommit,
      capabilityBomSha256: inputs.capabilityBomSha256,
      elizaCommit: inputs.elizaCommit,
      runtimeImage: inputs.runtimeImage,
      runtimeBuildManifestSha256: inputs.runtimeBuildManifestSha256,
    },
    cloudflare: {
      ...ALICE_CLOUDFLARE_TARGET,
      accessConfigSha256: await digestAliceEffectiveConfig(
        inputs.accessEffectiveConfig,
      ),
      accessPolicyConfigSha256: await digestAliceEffectiveConfig(
        accessPolicyConfig,
      ),
      accessWorkerBundleSha256: workerBundleDigests.access,
      controlConfigSha256: await digestAliceEffectiveConfig(
        inputs.controlEffectiveConfig,
      ),
      aiGatewayConfigSha256: await digestAliceEffectiveConfig(
        inputs.aiGatewayEffectiveConfig,
      ),
      aiGatewayProviderConfigSha256:
        await digestAliceEffectiveConfig(aiGatewayProviderConfig),
      aiGatewayWorkerBundleSha256: workerBundleDigests.aiGateway,
      controlWorkerBundleSha256: workerBundleDigests.control,
      continuityConfigSha256:
        digestAliceCloudflareContinuityConfig(continuityConfig),
    },
  };
}

export function serializeAliceDeploymentManifest(manifest) {
  if (!validManifest(manifest)) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  return `${canonicalAliceJson(manifest)}\n`;
}

export function digestAliceDeploymentManifest(serializedManifest) {
  if (typeof serializedManifest !== "string") {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  return `sha256:${crypto.createHash("sha256").update(serializedManifest).digest("hex")}`;
}

export function verifyAliceDeploymentManifest(serializedManifest) {
  if (
    typeof serializedManifest !== "string" ||
    !serializedManifest.endsWith("\n") ||
    serializedManifest.endsWith("\n\n")
  ) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  let manifest;
  try {
    manifest = JSON.parse(serializedManifest);
  } catch {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  if (
    !validManifest(manifest) ||
    serializeAliceDeploymentManifest(manifest) !== serializedManifest
  ) {
    throw new Error("ALICE_DEPLOYMENT_MANIFEST_INVALID");
  }
  return manifest;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    const modalRevision = Number(process.env.ALICE_MODAL_REVISION);
    const accessEffectiveConfig = buildAliceContainerAccessEffectiveConfig({
      accessIssuer: process.env.ALICE_ACCESS_ISSUER,
      accessAudience: process.env.ALICE_ACCESS_AUDIENCE,
      ownerEmailSha256: process.env.ALICE_OWNER_EMAIL_SHA256,
      runtimeImage: process.env.ALICE_CLOUDFLARE_RUNTIME_IMAGE,
    });
    const controlEffectiveConfig = buildAliceControlEffectiveConfig({
      accessIssuer: process.env.ALICE_ACCESS_ISSUER,
      accessAudience: process.env.ALICE_ACCESS_AUDIENCE,
      ownerEmailSha256: process.env.ALICE_OWNER_EMAIL_SHA256,
      modelDailyBudgetUnits: Number(process.env.ALICE_MODEL_DAILY_BUDGET_UNITS),
      modalRevision,
      releaseAccessAudience: process.env.ALICE_RELEASE_ACCESS_AUDIENCE,
      releaseServiceTokenIdSha256:
        process.env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
    });
    const providerReadbackPath =
      process.env.ALICE_CLOUDFLARE_PROVIDER_READBACK_PATH;
    const namespaceIdsPath =
      process.env.ALICE_EXPECTED_DO_NAMESPACE_IDS_PATH;
    const workerBundleArtifactPath =
      process.env.ALICE_WORKER_BUNDLE_ARTIFACT_PATH;
    if (
      !providerReadbackPath ||
      !path.isAbsolute(providerReadbackPath) ||
      !namespaceIdsPath ||
      !path.isAbsolute(namespaceIdsPath) ||
      !workerBundleArtifactPath ||
      !path.isAbsolute(workerBundleArtifactPath)
    ) {
      throw new Error("ALICE_DEPLOYMENT_MANIFEST_ARTIFACT_PATH_INVALID");
    }
    const providerState = await fetchAliceCloudflareProviderState({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      ownerEmailSha256: accessEffectiveConfig.values.ownerEmailSha256,
      accessAudience: accessEffectiveConfig.values.accessAudience,
      releaseAccessAudience:
        controlEffectiveConfig.values.releaseAccessAudience,
      releaseServiceTokenIdSha256:
        controlEffectiveConfig.values.releaseServiceTokenIdSha256,
    });
    const continuityState = await fetchAliceCloudflareContinuityState({
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      expectedDurableObjectNamespaceIds: JSON.parse(
        fs.readFileSync(namespaceIdsPath, "utf8"),
      ),
    });
    const workerBundleArtifact = verifyAliceWorkerBundleArtifact(
      fs.readFileSync(workerBundleArtifactPath, "utf8"),
      {
        root: path.dirname(workerBundleArtifactPath),
        expectedSourceCommit: process.env.ALICE_SOURCE_COMMIT,
      },
    );
    const candidateContinuityReadback =
      buildAliceCandidateCloudflareContinuityReadback(
        continuityState.readback,
      );
    const manifest = await buildAliceDeploymentManifest({
      releaseEpoch: Number(process.env.ALICE_RELEASE_EPOCH),
      sourceCommit: process.env.ALICE_SOURCE_COMMIT,
      deploymentControllerCommit:
        process.env.ALICE_DEPLOYMENT_CONTROLLER_COMMIT,
      elizaCommit: process.env.ALICE_ELIZA_COMMIT,
      runtimeImage: process.env.ALICE_RUNTIME_IMAGE,
      runtimeBuildManifestSha256:
        process.env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
      capabilityBomSha256: process.env.ALICE_CAPABILITY_BOM_SHA256,
      modalRevision,
      policyHash: process.env.ALICE_POLICY_HASH,
      rollbackBoundary: process.env.ALICE_ROLLBACK_BOUNDARY,
      accessPolicyReadback: providerState.accessPolicyReadback,
      aiGatewayProviderReadback: providerState.aiGatewayProviderReadback,
      cloudflareContinuityReadback: candidateContinuityReadback,
      workerBundleArtifact,
      accessEffectiveConfig,
      controlEffectiveConfig,
      aiGatewayEffectiveConfig: buildAliceAiGatewayEffectiveConfig(),
    });
    const bytes = serializeAliceDeploymentManifest(manifest);
    const outputPath = process.env.ALICE_DEPLOYMENT_MANIFEST_PATH;
    if (!outputPath || !path.isAbsolute(outputPath)) {
      throw new Error("ALICE_DEPLOYMENT_MANIFEST_PATH_INVALID");
    }
    const providerEvidence = {
      schemaVersion: "alice.cloudflare-provider-readback.v1",
      accountId: ALICE_CLOUDFLARE_TARGET.accountId,
      zoneId: "7b24984479ee4cddb6c5d8a9b7a0f2c6",
      observedAt: new Date().toISOString(),
      provider: {
        ...providerState.sanitized,
        continuityBootstrapConfig: continuityState.sanitized,
        continuityCandidateConfig: buildAliceCloudflareContinuityConfig(
          candidateContinuityReadback,
        ),
      },
    };
    fs.writeFileSync(
      providerReadbackPath,
      `${canonicalAliceJson(providerEvidence)}\n`,
      { encoding: "utf8", mode: 0o444, flag: "wx" },
    );
    fs.writeFileSync(outputPath, bytes, {
      encoding: "utf8",
      mode: 0o444,
      flag: "wx",
    });
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        path: outputPath,
        deploymentManifestSha256: digestAliceDeploymentManifest(bytes),
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
