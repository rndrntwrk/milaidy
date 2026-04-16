import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(import.meta.dirname, "..");

function readWorkflow(name: string) {
  return fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", name),
    "utf8",
  );
}

describe("release workflow path contract", () => {
  it("hydrates the legacy electrobun compatibility dir in release workflows", () => {
    const releaseElectrobun = readWorkflow("release-electrobun.yml");

    expect(releaseElectrobun).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
    expect(releaseElectrobun).toContain(
      "node scripts/restore-local-eliza-workspace.mjs",
    );
    expect(releaseElectrobun).toContain(
      "System git config failed; falling back to --global.",
    );
  });

  it("uses the mobile build helper for release Android and iOS validation jobs", () => {
    const agentRelease = readWorkflow("agent-release.yml");

    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
    );
    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs ios",
    );
    expect(agentRelease).not.toContain("Capacitor sync iOS");
    expect(agentRelease).not.toContain("Capacitor sync");
  });

  it("pins Windows bootstrap fixes through shared helpers", () => {
    const preloadWorkflow = readWorkflow("windows-desktop-preload-smoke.yml");

    expect(preloadWorkflow).toContain(
      "System git config failed; falling back to --global.",
    );
    expect(preloadWorkflow).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
    expect(preloadWorkflow).toContain(
      "bun install --cwd eliza/packages/app-core/platforms/electrobun --ignore-scripts",
    );
  });

  it("normalizes runner root ownership before snap builds", () => {
    const snapBuild = readWorkflow("snap-build-test.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const agentRelease = readWorkflow("agent-release.yml");

    for (const workflow of [snapBuild, publishPackages, agentRelease]) {
      expect(workflow).toContain(
        "uses: ./.github/actions/normalize-snapd-root",
      );
    }
  });
});
