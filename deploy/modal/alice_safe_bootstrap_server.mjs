import http from "node:http";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const IMAGE = /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/;

const release = Object.freeze({
  programDigest: process.env.ALICE_PROGRAM_DIGEST,
  releaseDigest: process.env.ALICE_RELEASE_DIGEST,
  policyHash: process.env.ALICE_POLICY_HASH,
  sourceCommit: process.env.ALICE_SOURCE_COMMIT,
  deploymentControllerCommit:
    process.env.ALICE_DEPLOYMENT_CONTROLLER_COMMIT,
  runtimeImage: process.env.ALICE_RUNTIME_IMAGE,
  runtimeBuildManifestSha256:
    process.env.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
  deploymentManifestSha256:
    process.env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
  elizaCommit: process.env.ALICE_ELIZA_COMMIT,
  modalRevision: Number(process.env.ALICE_MODAL_REVISION),
});

if (
  !DIGEST.test(release.programDigest ?? "") ||
  !DIGEST.test(release.releaseDigest ?? "") ||
  !DIGEST.test(release.policyHash ?? "") ||
  !COMMIT.test(release.sourceCommit ?? "") ||
  !COMMIT.test(release.deploymentControllerCommit ?? "") ||
  !IMAGE.test(release.runtimeImage ?? "") ||
  !DIGEST.test(release.runtimeBuildManifestSha256 ?? "") ||
  !DIGEST.test(release.deploymentManifestSha256 ?? "") ||
  !COMMIT.test(release.elizaCommit ?? "") ||
  !Number.isSafeInteger(release.modalRevision) ||
  release.modalRevision < 49
) {
  throw new Error("ALICE_MODAL_SAFE_BOOTSTRAP_INVALID");
}

const health = JSON.stringify({
  status: "paused",
  agentState: "safe-bootstrap",
  safeBootstrap: true,
  paused: true,
  ready: false,
  release,
});

const server = http.createServer((request, response) => {
  response.statusCode = 503;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  if (request.method === "GET" && request.url === "/api/health") {
    response.end(health);
    return;
  }
  response.end(JSON.stringify({
    error: "ALICE_SAFE_BOOTSTRAP_PAUSED",
    safeBootstrap: true,
  }));
});

server.listen(8080, "0.0.0.0");
