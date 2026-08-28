import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAliceCloudflareContainerImageEvidence,
  verifyAliceCloudflareContainerImageEvidence,
} from "./alice_cloudflare_container_image.mjs";

const evidence = buildAliceCloudflareContainerImageEvidence({
  sourceCommit: "1".repeat(40),
  sourceImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"2".repeat(64)}`,
  runtimeImage:
    `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"3".repeat(64)}`,
  runtimeRevision: 49,
  runtimeBuildManifestSha256: `sha256:${"4".repeat(64)}`,
  capabilityBomSha256: `sha256:${"5".repeat(64)}`,
  tag: "alice-111111111111-123-1",
  observedAt: "2026-08-27T12:00:00.000Z",
});

test("binds the one-time cloud build to the exact Cloudflare registry digest", () => {
  assert.equal(verifyAliceCloudflareContainerImageEvidence(evidence), evidence);
  assert.equal(evidence.buildReusedWithoutRebuild, true);
  assert.equal(evidence.registryReadbackVerified, true);
});

test("rejects tag aliases, source substitution, and unverified rebuild claims", () => {
  for (const mutation of [
    { runtimeImage: "registry.cloudflare.com/example/alice-runtime:latest" },
    { sourceDigest: `sha256:${"9".repeat(64)}` },
    { tag: "alice-latest" },
    { registryReadbackVerified: false },
    { buildReusedWithoutRebuild: false },
  ]) {
    assert.throws(
      () => verifyAliceCloudflareContainerImageEvidence({ ...evidence, ...mutation }),
      /ALICE_CLOUDFLARE_CONTAINER_IMAGE_INVALID/,
    );
  }
});
