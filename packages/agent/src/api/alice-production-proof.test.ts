import { describe, expect, it } from "vitest";

import {
  buildAliceProductionProof,
  stampAliceProductionRuntimeBoundary,
} from "./alice-production-proof";

function inertRuntimePlugins(
  basicOverrides: Record<string, unknown> = {},
): Array<Record<string, unknown>> {
  return [
    {
      name: "basic-capabilities",
      actions: [],
      providers: [],
      evaluators: [],
      services: [],
      routes: [],
      events: {},
      ...basicOverrides,
    },
    { name: "core-security-hooks" },
    { name: "alice-production-response-only" },
    { name: "sql" },
    { name: "openai" },
  ];
}

describe("Alice sanitized runtime-boundary proof", () => {
  it("returns only bounded identifiers and release metadata", () => {
    const runtime = {
      plugins: inertRuntimePlugins().map((plugin) =>
        plugin.name === "alice-production-response-only"
          ? { ...plugin, secret: "must-not-leak" }
          : plugin,
      ),
      actions: [],
      evaluators: [],
      services: new Map(),
      character: { secrets: { OPENAI_API_KEY: "must-not-leak" } },
    };
    stampAliceProductionRuntimeBoundary(runtime, [
      "alice-production-response-only",
      "@elizaos/plugin-sql",
      "@elizaos/plugin-openai",
    ]);
    const proof = buildAliceProductionProof(runtime, {
      ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
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
    });
    expect(proof).toMatchObject({
      schemaVersion: "alice.runtime-boundary-proof.v1",
      authorityMode: "proposer-only",
      actionExecution: "disabled",
      actionPlanning: false,
      backgroundAuthorityWorkers: "absent",
      configuredPluginPackages: [
        "alice-production-response-only",
        "@elizaos/plugin-sql",
        "@elizaos/plugin-openai",
      ],
      runtimePluginNames: [
        "alice-production-response-only",
        "basic-capabilities",
        "core-security-hooks",
        "openai",
        "sql",
      ],
      actionNames: [],
      evaluatorNames: [],
      serviceTypes: [],
      taskWorkerNames: [],
      release: {
        deploymentManifestSha256: `sha256:${"9".repeat(64)}`,
      },
    });
    expect(JSON.stringify(proof)).not.toContain("must-not-leak");
  });

  it("fails closed without an exact production stamp and release identity", () => {
    expect(() =>
      buildAliceProductionProof(
        { plugins: [], actions: [], evaluators: [] },
        {},
      ),
    ).toThrow("ALICE_PRODUCTION_PROOF_UNAVAILABLE");
  });

  it("refuses to stamp a post-init runtime with any executable surface", () => {
    expect(() =>
      stampAliceProductionRuntimeBoundary(
        {
          plugins: [],
          actions: [{ name: "SEND_MESSAGE" }],
          evaluators: [],
          services: new Map(),
        },
        [
          "alice-production-response-only",
          "@elizaos/plugin-sql",
          "@elizaos/plugin-openai",
        ],
      ),
    ).toThrow("ALICE_PRODUCTION_EXECUTION_SURFACE_PRESENT");
    expect(() =>
      stampAliceProductionRuntimeBoundary(
        {
          plugins: [...inertRuntimePlugins(), { name: "unexpected-plugin" }],
          actions: [],
          evaluators: [],
          services: new Map(),
        },
        [
          "alice-production-response-only",
          "@elizaos/plugin-sql",
          "@elizaos/plugin-openai",
        ],
      ),
    ).toThrow("ALICE_PRODUCTION_EXECUTION_SURFACE_PRESENT");
    expect(() =>
      stampAliceProductionRuntimeBoundary(
        {
          plugins: inertRuntimePlugins(),
          actions: [],
          evaluators: [],
          services: new Map([["AUTONOMY", [{}]]]),
        },
        [
          "alice-production-response-only",
          "@elizaos/plugin-sql",
          "@elizaos/plugin-openai",
        ],
      ),
    ).toThrow("ALICE_PRODUCTION_EXECUTION_SURFACE_PRESENT");
  });

  it("refuses disabled basic capabilities with declared routes or events", () => {
    for (const basicOverrides of [
      { routes: [{ path: "/api/turns/:turnId/abort" }] },
      { events: { MESSAGE_RECEIVED: [() => undefined] } },
      { events: new Map() },
    ]) {
      expect(() =>
        stampAliceProductionRuntimeBoundary(
          {
            plugins: inertRuntimePlugins(basicOverrides),
            actions: [],
            evaluators: [],
            services: new Map(),
          },
          [
            "alice-production-response-only",
            "@elizaos/plugin-sql",
            "@elizaos/plugin-openai",
          ],
        ),
      ).toThrow("ALICE_PRODUCTION_EXECUTION_SURFACE_PRESENT");
    }
  });
});
