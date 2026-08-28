import type { ReleaseBinding } from "./policy";

export type AliceReleaseDetails = {
  releaseEpoch: number;
  sourceCommit: string;
  deploymentControllerCommit: string;
  runtimeImage: string;
  runtimeBuildManifestSha256: string;
  capabilityBomSha256: string;
  elizaCommit: string;
  modalRevision: number;
  deploymentManifestSha256: string;
};

export function buildAliceReleaseCheckResponse({
  binding,
  release,
  releaseIsActive,
  pausedScopes,
  admissionGeneration,
}: {
  binding: ReleaseBinding;
  release: AliceReleaseDetails;
  releaseIsActive: boolean;
  pausedScopes: readonly string[];
  admissionGeneration: number;
}) {
  const blockingScopes = ["all", "modal", "release"].filter((scope) =>
    pausedScopes.includes(scope),
  );
  const allowed = releaseIsActive && blockingScopes.length === 0;
  const candidateVisible = allowed || blockingScopes.length > 0;
  return {
    ok: allowed,
    allowed,
    code: allowed
      ? "RUNTIME_ADMITTED"
      : blockingScopes.length > 0
        ? "RUNTIME_PAUSED"
        : "RELEASE_NOT_ADMITTED",
    blockingScopes,
    admissionGeneration,
    binding: candidateVisible ? binding : null,
    release: candidateVisible ? release : null,
  };
}
