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
  it("attests the exact full-gated bridge while preserving proposer-only authority", () => {
    const runtime = {
      plugins: [
        { name: "basic-capabilities" },
        { name: "core-security-hooks" },
        { name: "@elizaos/plugin-agent-skills" },
        { name: "eliza" },
        { name: "sql" },
        { name: "openai" },
      ],
      actions: [{ name: "REPLY" }],
      evaluators: [{ name: "REFLECTION" }],
      services: new Map([["MEMORY", {}]]),
    };
    const environment = {
      ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
      ALICE_RUNTIME_PROFILE: "full-gated",
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

    stampAliceProductionRuntimeBoundary(
      runtime,
      [
        "eliza",
        "@elizaos/plugin-sql",
        "@elizaos/plugin-agent-skills",
        "@elizaos/plugin-openai",
      ],
      environment,
    );

    expect(buildAliceProductionProof(runtime, environment)).toMatchObject({
      schemaVersion: "alice.full-runtime-boundary-proof.v1",
      authorityMode: "proposer-only",
      runtimeProfile: "full-gated",
      bridgePlugin: "eliza",
      actionPlanning: true,
      coreComposition: [
        "bridge:eliza",
        "capabilities:basic",
        "security:core-hooks",
        "memory:sql",
        "skills:agent-skills",
        "hooks:eliza",
        "connectors:eliza",
      ],
      requiredConfiguredPluginPackages: [
        "eliza",
        "@elizaos/plugin-sql",
        "@elizaos/plugin-agent-skills",
        "@elizaos/plugin-openai",
      ],
      requiredRuntimePluginNames: [
        "@elizaos/plugin-agent-skills",
        "basic-capabilities",
        "core-security-hooks",
        "eliza",
        "openai",
        "sql",
      ],
      release: {
        deploymentManifestSha256: `sha256:${"9".repeat(64)}`,
      },
    });
  });

  it("refuses to stamp full-gated runtimes missing a required core marker", () => {
    const runtime = {
      plugins: [
        { name: "basic-capabilities" },
        { name: "core-security-hooks" },
        { name: "eliza" },
        { name: "sql" },
        { name: "openai" },
      ],
      actions: [{ name: "REPLY" }],
    };
    const environment = {
      ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
      ALICE_RUNTIME_PROFILE: "full-gated",
    };

    expect(() =>
      stampAliceProductionRuntimeBoundary(
        runtime,
        ["eliza", "@elizaos/plugin-sql", "@elizaos/plugin-openai"],
        environment,
      ),
    ).toThrow("ALICE_PRODUCTION_EXECUTION_SURFACE_INVALID");
  });

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

  it("refuses declared execution surfaces on admitted SQL and model plugins", () => {
    for (const [pluginName, declaredSurface] of [
      ["sql", { services: [{ serviceType: "memoryStorage" }] }],
      ["sql", { routes: [{ path: "/identity/person-link" }] }],
      ["openai", { actions: [{ name: "UNBOUNDED_MODEL_ACTION" }] }],
    ] as const) {
      const plugins = inertRuntimePlugins().map((plugin) =>
        plugin.name === pluginName ? { ...plugin, ...declaredSurface } : plugin,
      );
      expect(() =>
        stampAliceProductionRuntimeBoundary(
          {
            plugins,
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
