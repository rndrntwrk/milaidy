import { describe, expect, it } from "vitest";

// @ts-expect-error -- .mjs module, no declaration file.
import {
  miladyCloudTypecheckSteps,
  miladyElizaCrossLanguageChecks,
  miladyElizaTypecheckSteps,
  miladySidecarTypecheckSteps,
  suites,
} from "./run-repo-checks.mjs";

describe("run-repo-checks", () => {
  it("keeps blocking typecheck sweep limited to stable checks", () => {
    expect(suites.typecheck).toEqual([
      {
        label: "eliza app-core workspace typecheck",
        command: "bun",
        args: ["run", "verify:typecheck:workspace"],
      },
      {
        label: "eliza ui consumer typecheck",
        command: "bun",
        args: ["run", "--cwd", "apps/app", "typecheck"],
      },
      {
        label: "eliza agent typecheck",
        command: "bun",
        args: ["run", "--cwd", "eliza/packages/agent", "typecheck"],
      },
      {
        label: "eliza cloud plugin typecheck",
        command: "bun",
        args: [
          "run",
          "--cwd",
          "eliza/plugins/plugin-elizacloud/typescript",
          "typecheck",
        ],
      },
      {
        label: "apps/homepage typecheck",
        command: "bun",
        args: ["run", "--cwd", "apps/homepage", "typecheck"],
      },
    ]);

    expect(suites.typecheck).not.toContainEqual({
      label: "@elizaos/app-core typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"],
    });
    expect(suites.typecheck).not.toContainEqual({
      label: "@elizaos/ui typecheck",
      command: "bun",
      args: ["run", "--cwd", "eliza/packages/ui", "typecheck"],
    });
  });

  it("keeps extended typecheck aligned with shipped eliza packages", () => {
    expect(miladyElizaTypecheckSteps).toEqual([
      {
        label: "eliza app-core workspace typecheck",
        command: "bun",
        args: ["run", "verify:typecheck:workspace"],
      },
      {
        label: "eliza ui consumer typecheck",
        command: "bun",
        args: ["run", "--cwd", "apps/app", "typecheck"],
      },
      {
        label: "eliza agent typecheck",
        command: "bun",
        args: ["run", "--cwd", "eliza/packages/agent", "typecheck"],
      },
      {
        label: "eliza cloud plugin typecheck",
        command: "bun",
        args: [
          "run",
          "--cwd",
          "eliza/plugins/plugin-elizacloud/typescript",
          "typecheck",
        ],
      },
    ]);

    expect(suites["typecheck:extended"]).toBeUndefined();
  });

  it("drops the full eliza TypeScript lint step", () => {
    expect(suites.lint).not.toContainEqual({
      label: "eliza TypeScript lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:check"],
    });
  });

  it("skips upstream-wide eliza rust/python sweeps", () => {
    expect(miladyElizaCrossLanguageChecks).toEqual([]);

    expect(suites.lint).not.toContainEqual({
      label: "eliza Rust lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:rust"],
    });
    expect(suites.lint).not.toContainEqual({
      label: "eliza Python lint",
      command: "bun",
      args: ["run", "--cwd", "eliza", "lint:python"],
    });
    expect(suites["typecheck:extended"]).toBeUndefined();
  });

  it("skips unrelated eliza/cloud monorepo split checks", () => {
    expect(miladyCloudTypecheckSteps).toEqual([]);

    expect(
      suites.lint.find((step) => step.label === "cloud lint"),
    ).toBeUndefined();

    for (const label of [
      "cloud app typecheck",
      "cloud tests typecheck",
      "cloud UI typecheck",
      "cloud agent-server typecheck",
      "cloud gateway-discord typecheck",
      "cloud gateway-webhook typecheck",
    ]) {
      expect(
        suites.typecheck.find((step) => step.label === label),
      ).toBeUndefined();
    }
  });

  it("skips unrelated sidecar workspace typechecks", () => {
    expect(miladySidecarTypecheckSteps).toEqual([]);
    expect(
      suites.lint.find((step) => step.label === "steward-fi lint"),
    ).toEqual({
      label: "steward-fi lint",
      command: "bun",
      args: ["run", "--cwd", "eliza/steward-fi", "lint"],
    });
    expect(
      suites.typecheck.find((step) => step.label === "steward-fi typecheck"),
    ).toBeUndefined();
  });
});
