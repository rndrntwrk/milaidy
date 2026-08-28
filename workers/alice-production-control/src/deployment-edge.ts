import type { AliceRuntimeConfig } from "./runtime-config";

export const ALICE_DEPLOYMENT_PAUSE_V2_PATH =
  "/control/internal/v1/deployment/pause-all-v2";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;

type WorkerVersion = Pick<WorkerVersionMetadata, "id">;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    object(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",")
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function releaseFromConfig(config: AliceRuntimeConfig) {
  const release = config.envelope.release;
  return {
    releaseEpoch: release.releaseEpoch,
    sourceCommit: release.sourceCommit,
    deploymentControllerCommit: release.deploymentControllerCommit,
    runtimeImage: release.runtimeImage,
    runtimeBuildManifestSha256: release.runtimeBuildManifestSha256,
    capabilityBomSha256: config.capabilityBomSha256,
    elizaCommit: release.elizaCommit,
    modalRevision: config.modalRevision,
    deploymentManifestSha256: config.deploymentManifestSha256,
  };
}

function validServingCandidate(value: unknown): boolean {
  if (
    !exactKeys(value, ["binding", "release", "rollbackBoundary"]) ||
    !exactKeys(value.binding, ["policyHash", "programDigest", "releaseDigest"]) ||
    !exactKeys(value.release, [
      "deploymentControllerCommit",
      "deploymentManifestSha256",
      "capabilityBomSha256",
      "elizaCommit",
      "modalRevision",
      "releaseEpoch",
      "runtimeBuildManifestSha256",
      "runtimeImage",
      "sourceCommit",
    ])
  ) return false;
  const binding = value.binding as Record<string, unknown>;
  const release = value.release as Record<string, unknown>;
  return (
    [binding.programDigest, binding.releaseDigest, binding.policyHash].every(
      (digest) => typeof digest === "string" && DIGEST.test(digest),
    ) &&
    Number.isSafeInteger(release.releaseEpoch) &&
    Number(release.releaseEpoch) > 0 &&
    Number.isSafeInteger(release.modalRevision) &&
    Number(release.modalRevision) >= 49 &&
    [
      release.sourceCommit,
      release.deploymentControllerCommit,
      release.elizaCommit,
    ].every((commit) => typeof commit === "string" && COMMIT.test(commit)) &&
    [
      release.runtimeBuildManifestSha256,
      release.capabilityBomSha256,
      release.deploymentManifestSha256,
    ].every((digest) => typeof digest === "string" && DIGEST.test(digest)) &&
    typeof release.runtimeImage === "string" &&
    /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/.test(
      release.runtimeImage,
    ) &&
    value.rollbackBoundary === `modal:alice-runtime:v${release.modalRevision}`
  );
}

export function validAliceDeploymentEdgeNonce(value: unknown): value is string {
  return typeof value === "string" && NONCE.test(value);
}

export function buildAliceDeploymentEdgeReadiness({
  config,
  workerVersion,
  nonce,
}: {
  config: AliceRuntimeConfig;
  workerVersion: WorkerVersion;
  nonce: string;
}) {
  const servingCandidate = {
    binding: config.binding,
    release: releaseFromConfig(config),
    rollbackBoundary: config.envelope.release.rollbackBoundary,
  };
  if (
    !validAliceDeploymentEdgeNonce(nonce) ||
    !VERSION_ID.test(workerVersion?.id ?? "") ||
    !validServingCandidate(servingCandidate)
  ) {
    throw new Error("ALICE_DEPLOYMENT_EDGE_INVALID");
  }
  return {
    schemaVersion: "alice.deployment-edge-readiness.v1" as const,
    nonce,
    workerVersionId: workerVersion.id,
    servingCandidate,
  };
}

export async function executeAliceDeploymentPauseV2<T>({
  path,
  method,
  headerNonce,
  body,
  config,
  workerVersion,
  mutate,
}: {
  path: string;
  method: string;
  headerNonce: string;
  body: unknown;
  config: AliceRuntimeConfig;
  workerVersion: WorkerVersion;
  mutate: () => Promise<T>;
}): Promise<
  | { ok: true; mutation: T }
  | {
      ok: false;
      code:
        | "DEPLOYMENT_EDGE_READINESS_REQUIRED"
        | "DEPLOYMENT_EDGE_READINESS_MISMATCH";
    }
> {
  if (path !== ALICE_DEPLOYMENT_PAUSE_V2_PATH || method !== "POST") {
    return { ok: false, code: "DEPLOYMENT_EDGE_READINESS_REQUIRED" };
  }
  let expected;
  try {
    expected = buildAliceDeploymentEdgeReadiness({
      config,
      workerVersion,
      nonce: headerNonce,
    });
  } catch {
    return { ok: false, code: "DEPLOYMENT_EDGE_READINESS_MISMATCH" };
  }
  if (
    !exactKeys(body, ["edgeReadiness", "schemaVersion"]) ||
    body.schemaVersion !== "alice.deployment-pause-request.v2" ||
    !exactKeys(body.edgeReadiness, [
      "nonce",
      "schemaVersion",
      "servingCandidate",
      "workerVersionId",
    ]) ||
    canonical(body.edgeReadiness) !== canonical(expected)
  ) {
    return { ok: false, code: "DEPLOYMENT_EDGE_READINESS_MISMATCH" };
  }
  return { ok: true, mutation: await mutate() };
}
