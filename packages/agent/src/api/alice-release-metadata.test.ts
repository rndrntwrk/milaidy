import { describe, expect, it } from "bun:test";

import { readAliceReleaseMetadata } from "./alice-release-metadata";

const valid = {
  ALICE_PROGRAM_DIGEST: `sha256:${"1".repeat(64)}`,
  ALICE_RELEASE_DIGEST: `sha256:${"2".repeat(64)}`,
  ALICE_POLICY_HASH: `sha256:${"3".repeat(64)}`,
  ALICE_SOURCE_COMMIT: "521c1697089e43e10158acad0582f2b000514520",
  ALICE_DEPLOYMENT_CONTROLLER_COMMIT: "6".repeat(40),
  ALICE_RUNTIME_IMAGE: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"4".repeat(64)}`,
  ALICE_RUNTIME_BUILD_MANIFEST_SHA256: `sha256:${"8".repeat(64)}`,
  ALICE_CAPABILITY_BOM_SHA256: `sha256:${"a".repeat(64)}`,
  ALICE_DEPLOYMENT_MANIFEST_SHA256: `sha256:${"9".repeat(64)}`,
  ALICE_ELIZA_COMMIT: "a21d401bf7429bc8c794698b20832512b5315187",
  ALICE_MODAL_REVISION: "49",
};

describe("Alice release health metadata", () => {
  it("returns an exact digest-bound production identity", () => {
    expect(readAliceReleaseMetadata(valid)).toEqual({
      programDigest: valid.ALICE_PROGRAM_DIGEST,
      releaseDigest: valid.ALICE_RELEASE_DIGEST,
      policyHash: valid.ALICE_POLICY_HASH,
      sourceCommit: valid.ALICE_SOURCE_COMMIT,
      deploymentControllerCommit: valid.ALICE_DEPLOYMENT_CONTROLLER_COMMIT,
      runtimeImage: valid.ALICE_RUNTIME_IMAGE,
      runtimeBuildManifestSha256: valid.ALICE_RUNTIME_BUILD_MANIFEST_SHA256,
      capabilityBomSha256: valid.ALICE_CAPABILITY_BOM_SHA256,
      deploymentManifestSha256: valid.ALICE_DEPLOYMENT_MANIFEST_SHA256,
      elizaCommit: valid.ALICE_ELIZA_COMMIT,
      runtimeRevision: 49,
    });
  });

  it("returns null for a partial, floating, or malformed identity", () => {
    for (const candidate of [
      {},
      { ...valid, ALICE_RELEASE_DIGEST: "latest" },
      { ...valid, ALICE_RUNTIME_IMAGE: "ghcr.io/rndrntwrk/milaidy-agent:latest" },
      { ...valid, ALICE_RUNTIME_BUILD_MANIFEST_SHA256: "unbound" },
      { ...valid, ALICE_CAPABILITY_BOM_SHA256: "unbound" },
      { ...valid, ALICE_DEPLOYMENT_MANIFEST_SHA256: "unbound" },
      { ...valid, ALICE_SOURCE_COMMIT: "short" },
      { ...valid, ALICE_DEPLOYMENT_CONTROLLER_COMMIT: "short" },
      { ...valid, ALICE_MODAL_REVISION: "pending" },
    ]) {
      expect(readAliceReleaseMetadata(candidate)).toBeNull();
    }
  });
});
