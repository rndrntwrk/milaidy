import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

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
  });

  it("uses the mobile build helper for release Android and iOS validation jobs", () => {
    const agentRelease = readWorkflow("agent-release.yml");

    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs android",
    );
    expect(agentRelease).toContain(
      "node eliza/packages/app-core/scripts/run-mobile-build.mjs ios",
    );
    expect(agentRelease).not.toContain(
      "Build web assets\n        run: |\n          bun install --ignore-scripts\n          bun run postinstall\n          bun run build",
    );
  });

  it("does not reinstall eliza/packages/app-core directly in the windows preload smoke job", () => {
    const workflow = readWorkflow("windows-desktop-preload-smoke.yml");

    expect(workflow).toContain(
      "node scripts/ensure-legacy-electrobun-compat.mjs",
    );
    expect(workflow).not.toContain(
      "bun install --cwd eliza/packages/app-core --ignore-scripts",
    );
    expect(workflow).toContain(
      "bun install --cwd eliza/packages/app-core/platforms/electrobun --ignore-scripts",
    );
    expect(workflow).toContain(
      "System git config failed; falling back to --global.",
    );
  });

  it("normalizes runner root ownership before snap builds", () => {
    const snapBuild = readWorkflow("snap-build-test.yml");
    const publishPackages = readWorkflow("publish-packages.yml");
    const agentRelease = readWorkflow("agent-release.yml");

    for (const workflow of [snapBuild, publishPackages, agentRelease]) {
      expect(workflow).toContain(
        "Normalize runner root ownership for snapd",
      );
      expect(workflow).toContain("sudo chown root:root /");
      expect(workflow).toContain(
        "test \"$(stat -c '%u:%g' /)\" = \"0:0\"",
      );
    }
  });
});
