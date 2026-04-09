import { readFileSync } from "node:fs";
import path from "node:path";
import { CORE_PLUGINS } from "../core-plugins";
import { describe, expect, it } from "vitest";

const elizaSource = readFileSync(
  path.resolve(import.meta.dirname, "..", "eliza.ts"),
  "utf-8",
);
const expectedCorePlugins = [
  "@elizaos/plugin-sql",
  "@elizaos/plugin-local-embedding",
  "@elizaos/plugin-form",
  "@elizaos/plugin-agent-orchestrator",
  "@elizaos/plugin-cron",
  "@elizaos/plugin-shell",
  "@elizaos/plugin-agent-skills",
  "@elizaos/plugin-commands",
  "@elizaos/plugin-plugin-manager",
  "@miladyai/plugin-roles",
];

describe("native feature bootstrap wiring", () => {
  it("keeps the explicit core plugin list aligned with the native bootstrap contract", () => {
    expect(CORE_PLUGINS).toEqual(expectedCorePlugins);
  });

  it("guards trajectory bootstrap behind the native trajectories toggle", () => {
    const waitBlock =
      elizaSource.match(
        /async function waitForTrajectoriesService\([\s\S]*?\n\}/m,
      )?.[0] ?? "";
    const ensureBlock =
      elizaSource.match(
        /function ensureTrajectoryLoggerEnabled\([\s\S]*?\n\}/m,
      )?.[0] ?? "";

    expect(waitBlock).toContain("if (!runtimeTrajectoriesEnabled(runtime))");
    expect(ensureBlock).toContain("if (!runtimeTrajectoriesEnabled(runtime))");
    expect(ensureBlock).toContain("Native trajectories disabled");
  });

  it("skips bundled knowledge seeding when native knowledge is disabled", () => {
    const initBlock =
      elizaSource.match(
        /const initializeRuntimeServices = async \(\): Promise<void> => \{[\s\S]*?\n  \};/m,
      )?.[0] ?? "";

    expect(initBlock).toContain("if (runtimeKnowledgeEnabled(runtime))");
    expect(initBlock).toContain("Native knowledge disabled");
    expect(initBlock).toContain("skipping bundled knowledge seeding");
  });

  it("calls native feature probes with the runtime instance bound", () => {
    const trajectoryProbe =
      elizaSource.match(
        /function runtimeTrajectoriesEnabled\([\s\S]*?\n\}/m,
      )?.[0] ?? "";
    const knowledgeProbe =
      elizaSource.match(/function runtimeKnowledgeEnabled\([\s\S]*?\n\}/m)?.[0] ??
      "";

    expect(trajectoryProbe).toContain(
      "runtimeWithFlags.isTrajectoriesEnabled()",
    );
    expect(knowledgeProbe).toContain("runtimeWithFlags.isKnowledgeEnabled()");
    expect(trajectoryProbe).not.toContain("const fn =");
    expect(knowledgeProbe).not.toContain("const fn =");
  });
});
