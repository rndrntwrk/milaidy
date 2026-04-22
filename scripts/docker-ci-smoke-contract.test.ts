import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const dockerSmokeScriptPath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "scripts",
  "docker-ci-smoke.sh",
);
const dockerfilePath = path.join(
  repoRoot,
  "eliza",
  "packages",
  "app-core",
  "deploy",
  "Dockerfile.ci",
);

describe("docker CI smoke contract", () => {
  it("delegates published-workspace fallback dependencies to the shared helper", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    expect(script).toContain(
      'bash "$REPO_ROOT/scripts/install-published-workspace-fallback-deps.sh"',
    );
    expect(script).not.toContain("bun add --no-save --dev");
  });

  it("boots the smoke container with isolated runtime state and live log dumps", () => {
    const script = fs.readFileSync(dockerSmokeScriptPath, "utf8");

    expect(script).toContain(
      "-e ELIZA_WORKSPACE_DIR=/tmp/milady-smoke/workspace",
    );
    expect(script).toContain("-e PGLITE_DATA_DIR=/tmp/milady-smoke/pglite");
    expect(script).toContain("Container still booting; recent logs follow");
    expect(script).toContain('"$DOCKER_BIN" logs --tail 80 "$CONTAINER_NAME"');
  });

  it("does not override tsx esbuild in the runtime image", () => {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).not.toContain("ESBUILD_BINARY_PATH");
    expect(dockerfile).not.toContain("/usr/local/bin/esbuild");
    expect(dockerfile).toContain("ENV ELIZA_DISABLE_EDGE_TTS=1");
  });

  it("ships generated core proto runtime files for source-resolution paths", () => {
    const dockerfile = fs.readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).toContain(
      "node eliza/packages/app-core/scripts/ensure-generated-core-proto-js.mjs",
    );
  });
});
