import { describe, expect, it } from "bun:test";
import fs from "node:fs";

import {
  assertAliceFullGatedCapabilityEnvironment,
  buildAliceRuntimeCapabilityState,
  enforceAliceFullGatedCapabilityPolicy,
} from "./alice-capability-inventory";

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
      files: [],
      packageSha256: `sha256:${"1".repeat(64)}`,
      entrypointSha256: `sha256:${"2".repeat(64)}`,
    },
    {
      id: "package:@fixture/plugin-disabled",
      classification: "policy-disabled" as const,
      identity: "@fixture/plugin-disabled@1.0.0",
      runtimeNames: ["disabled-real"],
      installed: true,
      implementationCallable: true,
      adapter: null,
      policyState: "disabled" as const,
      files: [],
      packageSha256: `sha256:${"3".repeat(64)}`,
      entrypointSha256: `sha256:${"4".repeat(64)}`,
    },
  ],
};

describe("Alice final-image capability runtime inventory", () => {
  it("rejects every nonempty global skip list in the exact full-gated profile", () => {
    expect(() =>
      assertAliceFullGatedCapabilityEnvironment({
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_PROFILE: "full-gated",
        ELIZA_SKIP_PLUGINS: "@elizaos/plugin-shell",
      }),
    ).toThrow("ALICE_FULL_GATED_SKIP_PLUGINS_FORBIDDEN");
    expect(() =>
      assertAliceFullGatedCapabilityEnvironment({
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_PROFILE: "full-gated",
        ELIZA_SKIP_PLUGINS: "   ",
      }),
    ).not.toThrow();
    expect(() =>
      assertAliceFullGatedCapabilityEnvironment({
        ELIZA_SKIP_PLUGINS: "@elizaos/plugin-shell",
      }),
    ).not.toThrow();
  });

  it("removes policy-disabled packages without changing the Task 1 core set", () => {
    const packages = new Set([
      "@fixture/plugin-core",
      "@fixture/plugin-disabled",
      "@fixture/plugin-unclassified",
    ]);
    expect(enforceAliceFullGatedCapabilityPolicy(packages, bom)).toEqual([
      "@fixture/plugin-disabled",
    ]);
    expect([...packages]).toEqual([
      "@fixture/plugin-core",
      "@fixture/plugin-unclassified",
    ]);
  });

  it("fails when a core is unloaded or a policy-disabled implementation is registered", () => {
    expect(
      buildAliceRuntimeCapabilityState(bom, [{ name: "core-real" }]),
    ).toMatchObject({
      counts: { core: 1, "policy-disabled": 1 },
      entries: [
        { id: "package:@fixture/plugin-core", loaded: true, callable: true },
        {
          id: "package:@fixture/plugin-disabled",
          loaded: false,
          callable: false,
          policyState: "disabled",
        },
      ],
    });
    expect(() => buildAliceRuntimeCapabilityState(bom, [])).toThrow(
      "ALICE_CAPABILITY_RUNTIME_STATE_MISMATCH",
    );
    expect(() =>
      buildAliceRuntimeCapabilityState(bom, [
        { name: "core-real" },
        { name: "disabled-real" },
      ]),
    ).toThrow("ALICE_CAPABILITY_POLICY_DISABLED");
  });

  it("reports callable internal core capabilities without inventing plugin names", () => {
    const state = buildAliceRuntimeCapabilityState(
      {
        schemaVersion: "alice.capability-bom.v1",
        entries: [
          {
            id: "internal:alice-full-runtime",
            classification: "core",
            identity: "alice-full-runtime",
            runtimeNames: [],
            installed: true,
            implementationCallable: true,
            adapter: null,
            policyState: "enabled",
            files: [],
            packageSha256: null,
            entrypointSha256: null,
          },
        ],
      },
      [],
    );
    expect(state.entries[0]).toMatchObject({ loaded: true, callable: true });
  });

  it("treats real module surfaces as loaded bytes but still requires plugin observation", () => {
    const moduleCore = {
      ...bom.entries[0],
      id: "package:@fixture/app-core",
      identity: "@fixture/app-core@1.0.0",
      surface: "module" as const,
      runtimeNames: [],
      installed: true,
      implementationCallable: true,
    };
    expect(
      buildAliceRuntimeCapabilityState(
        { schemaVersion: "alice.capability-bom.v1", entries: [moduleCore] },
        [],
      ).entries[0],
    ).toMatchObject({ loaded: true, callable: true });
    expect(() =>
      buildAliceRuntimeCapabilityState(
        {
          schemaVersion: "alice.capability-bom.v1",
          entries: [{ ...moduleCore, id: "package:@fixture/plugin-core", surface: "plugin" }],
        },
        [],
      ),
    ).toThrow("ALICE_CAPABILITY_RUNTIME_STATE_MISMATCH");
  });

  it("admits a production-shaped runtime for every checked core policy surface", () => {
    const policy = JSON.parse(
      fs.readFileSync(
        new URL("../../../../deploy/alice/alice-capability-policy.v1.json", import.meta.url),
        "utf8",
      ),
    ) as { entries: Array<Record<string, any>> };
    const coreEntries = policy.entries
      .filter((entry) => entry.classification === "core")
      .map((entry) => {
        const moduleSurface = entry.surface === "module";
        const runtimeNames = moduleSurface
          ? []
          : entry.source.type === "internal"
            ? []
            : entry.runtimeNames.length > 0
              ? [entry.runtimeNames[entry.runtimeNames.length - 1]]
              : [`observed:${entry.id}`];
        return {
          id: entry.id,
          classification: "core" as const,
          identity: entry.source.package ?? entry.source.identity,
          surface: entry.surface ?? entry.source.type,
          runtimeNames,
          installed: true,
          implementationCallable: true,
          adapter: null,
          policyState: "enabled" as const,
          files: [],
          packageSha256: null,
          entrypointSha256: null,
        };
      });
    const runtimePlugins = coreEntries.flatMap((entry) =>
      entry.surface === "plugin" ? entry.runtimeNames.map((name) => ({ name })) : [],
    );
    expect(
      buildAliceRuntimeCapabilityState(
        { schemaVersion: "alice.capability-bom.v1", entries: coreEntries },
        runtimePlugins,
      ).counts.core,
    ).toBe(coreEntries.length);
    expect(coreEntries.filter((entry) => entry.surface === "module").length).toBe(2);
  });
});
