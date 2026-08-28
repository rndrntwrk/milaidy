export interface AliceReleaseMetadata {
  programDigest: string;
  releaseDigest: string;
  policyHash: string;
  sourceCommit: string;
  deploymentControllerCommit: string;
  runtimeImage: string;
  runtimeBuildManifestSha256: string;
  capabilityBomSha256: string;
  deploymentManifestSha256: string;
  elizaCommit: string;
  modalRevision: number;
}

type EnvironmentLike = Record<string, string | undefined>;

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IMAGE = /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;

export function readAliceReleaseMetadata(
  environment: EnvironmentLike,
): AliceReleaseMetadata | null {
  const programDigest = environment.ALICE_PROGRAM_DIGEST;
  const releaseDigest = environment.ALICE_RELEASE_DIGEST;
  const policyHash = environment.ALICE_POLICY_HASH;
  const sourceCommit = environment.ALICE_SOURCE_COMMIT;
  const deploymentControllerCommit =
    environment.ALICE_DEPLOYMENT_CONTROLLER_COMMIT;
  const runtimeImage = environment.ALICE_RUNTIME_IMAGE;
  const runtimeBuildManifestSha256 =
    environment.ALICE_RUNTIME_BUILD_MANIFEST_SHA256;
  const capabilityBomSha256 = environment.ALICE_CAPABILITY_BOM_SHA256;
  const deploymentManifestSha256 = environment.ALICE_DEPLOYMENT_MANIFEST_SHA256;
  const elizaCommit = environment.ALICE_ELIZA_COMMIT;
  const modalRevision = Number(environment.ALICE_MODAL_REVISION);
  if (
    !programDigest ||
    !DIGEST.test(programDigest) ||
    !releaseDigest ||
    !DIGEST.test(releaseDigest) ||
    !policyHash ||
    !DIGEST.test(policyHash) ||
    !sourceCommit ||
    !COMMIT.test(sourceCommit) ||
    !deploymentControllerCommit ||
    !COMMIT.test(deploymentControllerCommit) ||
    !runtimeImage ||
    !IMAGE.test(runtimeImage) ||
    !runtimeBuildManifestSha256 ||
    !DIGEST.test(runtimeBuildManifestSha256) ||
    !capabilityBomSha256 ||
    !DIGEST.test(capabilityBomSha256) ||
    !deploymentManifestSha256 ||
    !DIGEST.test(deploymentManifestSha256) ||
    !elizaCommit ||
    !COMMIT.test(elizaCommit) ||
    !Number.isInteger(modalRevision) ||
    modalRevision < 49
  ) {
    return null;
  }
  return {
    programDigest,
    releaseDigest,
    policyHash,
    sourceCommit,
    deploymentControllerCommit,
    runtimeImage,
    runtimeBuildManifestSha256,
    capabilityBomSha256,
    deploymentManifestSha256,
    elizaCommit,
    modalRevision,
  };
}
