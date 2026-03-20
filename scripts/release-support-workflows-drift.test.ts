import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_CLOUD_IMAGE_WORKFLOW = path.join(
  ROOT,
  ".github/workflows/build-cloud-image.yml",
);
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
  it("builds the cloud full-ui image from the checked-in full app Dockerfile", () => {
    const workflow = fs.readFileSync(BUILD_CLOUD_IMAGE_WORKFLOW, "utf8");

    expect(workflow).toContain("type=raw,value=cloud-full-ui");
    expect(workflow).toContain("file: ./deploy/Dockerfile");
    expect(workflow).not.toContain("Dockerfile.cloud-full-ui");
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
