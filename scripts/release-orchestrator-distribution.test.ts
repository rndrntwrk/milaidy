import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const ORCHESTRATOR_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/release-orchestrator.yml",
);
const PUBLISH_NPM_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/publish-npm.yml",
);
const PUBLISH_PACKAGES_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/publish-packages.yml",
);
const ANDROID_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/android-release.yml",
);
const APPLE_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/apple-store-release.yml",
);
const HOMEBREW_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/update-homebrew.yml",
);
const DEPLOY_WEB_WORKFLOW = path.join(ROOT, ".github/workflows/deploy-web.yml");

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

describe("release orchestrator distribution workflow drift", () => {
  it("fans out post-release distribution through reusable child workflows", () => {
    const workflow = read(ORCHESTRATOR_WORKFLOW);

    expect(workflow).toContain("uses: ./.github/workflows/publish-npm.yml");
    expect(workflow).toContain(
      "uses: ./.github/workflows/publish-packages.yml",
    );
    expect(workflow).toContain("uses: ./.github/workflows/android-release.yml");
    expect(workflow).toContain(
      "uses: ./.github/workflows/apple-store-release.yml",
    );
    expect(workflow).toContain("uses: ./.github/workflows/update-homebrew.yml");
    expect(workflow).toContain("uses: ./.github/workflows/deploy-web.yml");
    expect(workflow).toContain('ANDROID_TRACK="internal"');
    expect(workflow).toContain('APPLE_TRACK="testflight"');
    expect(workflow).toContain('PUBLISH_FLATPAK="false"');
    expect(workflow).toContain('UPDATE_HOMEBREW="false"');
  });

  it("makes store and registry workflows reusable instead of direct release listeners", () => {
    for (const workflowPath of [
      PUBLISH_NPM_WORKFLOW,
      PUBLISH_PACKAGES_WORKFLOW,
      ANDROID_RELEASE_WORKFLOW,
      APPLE_RELEASE_WORKFLOW,
      HOMEBREW_WORKFLOW,
    ]) {
      const workflow = read(workflowPath);
      expect(workflow).toContain("workflow_call:");
      expect(workflow).not.toContain("release:\n    types: [published]");
    }
  });

  it("keeps homepage deploy push-driven while also exposing a reusable release entrypoint", () => {
    const workflow = read(DEPLOY_WEB_WORKFLOW);

    expect(workflow).toContain("push:");
    expect(workflow).toContain("workflow_call:");
    expect(workflow).not.toContain("release:\n    types: [published]");
    expect(workflow).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional GitHub Actions expression syntax in assertion string
      "MILADY_RELEASE_TAG: ${{ inputs.release_version }}",
    );
  });
});
