import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/agent-release.yml",
);
const CLOUD_IMAGE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/build-cloud-image.yml",
);
const LEGACY_STEWARD_IMAGE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/build-steward-image.yml",
);
const CANONICAL_IMAGE_DOCKERFILE = path.join(ROOT, "Dockerfile.ci");
const CLOUD_IMAGE_DOCKERFILE = path.join(ROOT, "deploy/Dockerfile.cloud-slim");
const CI_DOCKERIGNORE = path.join(ROOT, ".dockerignore.ci");
const BUILD_IMAGE_SCRIPT = path.join(ROOT, "scripts/build-image.sh");
const DEPLOY_TO_NODES_SCRIPT = path.join(ROOT, "deploy/deploy-to-nodes.sh");
const DEBIAN_CONTROL = path.join(ROOT, "packaging/debian/control");
const DEBIAN_COMPAT = path.join(ROOT, "packaging/debian/compat");
const ANDROID_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/android-release.yml",
);
const APPLE_STORE_RELEASE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/apple-store-release.yml",
);
const UPDATE_HOMEBREW_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/update-homebrew.yml",
);

describe("release support workflow drift", () => {
  it("validates both generic and cloud agent image builds in Agent Release", () => {
    const workflow = fs.readFileSync(AGENT_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("build-docker");
    expect(workflow).toContain("build-cloud-image");
    expect(workflow).not.toContain("build-steward-image:");
    expect(workflow).toContain("R_CLOUD_IMAGE");
    expect(workflow).not.toContain("R_STEWARD_IMAGE");
  });

  it("keeps the dedicated cloud image workflow and removes steward", () => {
    expect(fs.existsSync(CLOUD_IMAGE_WORKFLOW)).toBe(true);
    expect(fs.existsSync(LEGACY_STEWARD_IMAGE_WORKFLOW)).toBe(false);
  });

  it("generates full release changelog content for the GitHub release page", () => {
    const workflow = fs.readFileSync(AGENT_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("name: Generate release changelog");
    expect(workflow).toContain("full-release-changelog.md");
    expect(workflow).toContain("git log --date=short --pretty=format");
    expect(workflow).toContain("repos.generateReleaseNotes");
    expect(workflow).toContain("## Full changelog");
    expect(workflow).toContain("- [ ] PyPI publish");
    expect(workflow).toContain("- [ ] Cloud-only agent image push to GHCR");
  });

  it("builds the cloud-only image from the dedicated cloud runtime Dockerfile", () => {
    const workflow = fs.readFileSync(CLOUD_IMAGE_WORKFLOW, "utf8");

    expect(workflow).toContain("name: Build Cloud Agent Image");
    expect(workflow).toContain("file: deploy/Dockerfile.cloud-slim");
    expect(workflow).toContain("type=raw,value=cloud-agent");
    expect(workflow).toContain(
      "type=raw,value=cloud-agent-$" +
        "{{ steps.version.outputs.version_clean }}",
    );
    expect(workflow).not.toContain("cloud-full-ui");
  });

  it("keeps the cloud runtime Dockerfile limited to real runtime inputs", () => {
    const dockerfile = fs.readFileSync(CLOUD_IMAGE_DOCKERFILE, "utf8");

    expect(dockerfile).not.toContain("/build/src ./src");

    const createUserIndex = dockerfile.indexOf(
      "RUN groupadd -r agent && useradd -r -g agent -m agent",
    );
    const firstChownedCopyIndex = dockerfile.indexOf(
      "COPY --from=pruner --chown=agent:agent /build/dist ./dist",
    );

    expect(createUserIndex).toBeGreaterThanOrEqual(0);
    expect(firstChownedCopyIndex).toBeGreaterThan(createUserIndex);
  });

  it("uses the canonical image runtime selector for both agent and cloud launches", () => {
    const dockerfile = fs.readFileSync(CANONICAL_IMAGE_DOCKERFILE, "utf8");

    expect(dockerfile).toContain(
      'CMD ["node", "scripts/container-entrypoint.mjs"]',
    );
    expect(dockerfile).toContain("EXPOSE 18790");
    expect(dockerfile).toContain(
      "http://localhost:$" + "{PORT:-$MILADY_PORT}/health",
    );
    expect(dockerfile).toContain(
      "http://localhost:$" + "{MILADY_PORT}/api/health",
    );
  });

  it("keeps deploy runtime files in the canonical docker build context", () => {
    const dockerignoreEntries = fs
      .readFileSync(CI_DOCKERIGNORE, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    expect(dockerignoreEntries).not.toContain("deploy/");
  });

  it("points local build and deploy scripts at the canonical agent image", () => {
    const buildScript = fs.readFileSync(BUILD_IMAGE_SCRIPT, "utf8");
    const deployScript = fs.readFileSync(DEPLOY_TO_NODES_SCRIPT, "utf8");

    expect(buildScript).toContain('DOCKERFILE="Dockerfile.ci"');
    expect(buildScript).toContain("cp .dockerignore.ci .dockerignore");
    expect(buildScript).toContain("--build-arg VERSION=v$" + "{VERSION#v}");
    expect(deployScript).toContain('DEFAULT_IMAGE="milady/agent:latest"');
    expect(deployScript).not.toContain("cloud-full-ui");
  });

  it("declares the Debian debhelper compat level exactly once", () => {
    const control = fs.readFileSync(DEBIAN_CONTROL, "utf8");

    expect(control).toContain("debhelper-compat (= 13)");
    expect(fs.existsSync(DEBIAN_COMPAT)).toBe(false);
  });

  it("syncs Android Capacitor via the repo-supported app script", () => {
    const workflow = fs.readFileSync(ANDROID_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("working-directory: apps/app");
    expect(workflow).toContain("run: bun run cap:sync:android");
    expect(workflow).not.toContain("run: npx cap sync android");
  });

  it("syncs iOS Capacitor via the repo-supported app script", () => {
    const workflow = fs.readFileSync(APPLE_STORE_RELEASE_WORKFLOW, "utf8");

    expect(workflow).toContain("working-directory: apps/app");
    expect(workflow).toContain("run: bun run cap:sync:ios");
    expect(workflow).not.toContain("run: npx cap sync ios");
  });

  it("dispatches Homebrew updates to the actual tap repository", () => {
    const workflow = fs.readFileSync(UPDATE_HOMEBREW_WORKFLOW, "utf8");

    expect(workflow).toContain("repository: milady-ai/homebrew-tap");
    expect(workflow).not.toContain("repository: milady-ai/homebrew-milady");
  });
});
