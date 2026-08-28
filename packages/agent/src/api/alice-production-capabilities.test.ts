import { describe, expect, it } from "bun:test";

import { buildAliceProductionCapabilities } from "./alice-production-capabilities";

const digest = `sha256:${"a".repeat(64)}`;
const environment = {
  ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
  ALICE_RUNTIME_PROFILE: "full-gated",
  ALICE_CAPABILITY_BOM_SHA256: digest,
  ALICE_PROGRAM_DIGEST: `sha256:${"1".repeat(64)}`,
  ALICE_RELEASE_DIGEST: `sha256:${"2".repeat(64)}`,
  ALICE_POLICY_HASH: `sha256:${"3".repeat(64)}`,
  ALICE_SOURCE_COMMIT: "4".repeat(40),
  ALICE_DEPLOYMENT_CONTROLLER_COMMIT: "7".repeat(40),
  ALICE_RUNTIME_IMAGE: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"5".repeat(64)}`,
  ALICE_RUNTIME_BUILD_MANIFEST_SHA256: `sha256:${"8".repeat(64)}`,
  ALICE_DEPLOYMENT_MANIFEST_SHA256: `sha256:${"9".repeat(64)}`,
  ALICE_ELIZA_COMMIT: "6".repeat(40),
  ALICE_MODAL_REVISION: "49",
};

const bom = {
  schemaVersion: "alice.capability-bom.v1" as const,
  entries: [
    {
      id: "package:@fixture/plugin-core",
      classification: "core" as const,
      identity: "@fixture/plugin-core@1.0.0",
      runtimeNames: ["core-real"],
      installed: true,
      implementationCallable: true,
      adapter: null,
      policyState: "enabled" as const,
      files: [{ path: "secret/internal/path.js", sha256: digest, size: 1 }],
      packageSha256: digest,
      entrypointSha256: digest,
    },
  ],
};

describe("Alice authenticated owner capability readback", () => {
  it("returns exact release identity and safe state without filesystem details", () => {
    const response = buildAliceProductionCapabilities({
      bom,
      bomSha256: digest,
      environment,
      runtimePlugins: [{ name: "core-real" }],
    });
    expect(response).toMatchObject({
      schemaVersion: "alice.production-capabilities.v1",
      capabilityBomSha256: digest,
      counts: { core: 1 },
      release: { sourceCommit: "4".repeat(40), capabilityBomSha256: digest },
      entries: [
        {
          id: "package:@fixture/plugin-core",
          classification: "core",
          identity: "@fixture/plugin-core@1.0.0",
          installed: true,
          loaded: true,
          callable: true,
          adapter: null,
          policyState: "enabled",
        },
      ],
    });
    expect(JSON.stringify(response)).not.toContain("secret/internal/path.js");
    expect(JSON.stringify(response)).not.toContain("packageSha256");
  });

  it("fails closed on BOM digest or runtime state mismatch", () => {
    expect(() =>
      buildAliceProductionCapabilities({
        bom,
        bomSha256: `sha256:${"b".repeat(64)}`,
        environment,
        runtimePlugins: [{ name: "core-real" }],
      }),
    ).toThrow("ALICE_CAPABILITY_BOM_DIGEST_MISMATCH");
    expect(() =>
      buildAliceProductionCapabilities({
        bom,
        bomSha256: digest,
        environment,
        runtimePlugins: [],
      }),
    ).toThrow("ALICE_CAPABILITY_RUNTIME_STATE_MISMATCH");
  });
});
