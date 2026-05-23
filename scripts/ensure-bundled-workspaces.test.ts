import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BUNDLED_WORKSPACE_BUILDS,
  ensureBundledWorkspaceBuilds,
} from "./ensure-bundled-workspaces.mjs";

describe("ensureBundledWorkspaceBuilds", () => {
  it("generates shared keyword data before bundled workspace builds", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const sharedDir = path.join(repoRoot, "eliza", "packages", "shared");
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.join(sharedDir, "scripts"), { recursive: true });
      writeFileSync(
        path.join(sharedDir, "scripts", "generate-keywords.mjs"),
        "export {};\n",
        "utf8",
      );
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).toHaveBeenNthCalledWith(
        1,
        "node",
        ["scripts/generate-keywords.mjs"],
        expect.objectContaining({
          cwd: sharedDir,
        }),
      );
      expect(runner).toHaveBeenNthCalledWith(
        2,
        "bun",
        workspace.args,
        expect.objectContaining({
          cwd: workspaceDir,
        }),
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("builds bundled workspaces when clean checkouts are missing artifacts", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(workspaceDir, { recursive: true });
      writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).toHaveBeenCalledWith(
        "bun",
        workspace.args,
        expect.objectContaining({
          cwd: workspaceDir,
        }),
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("skips bundled workspace builds when the artifact is newer than manifest", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const artifactPath = path.join(repoRoot, workspace.artifact);
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.dirname(artifactPath), { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      const manifestPath = path.join(workspaceDir, "package.json");
      writeFileSync(manifestPath, "{}", "utf8");
      // Set manifest mtime to the past
      const past = new Date(Date.now() - 60_000);
      utimesSync(manifestPath, past, past);

      // Write artifact after manifest so it's newer
      writeFileSync(artifactPath, "export default {};\n", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).not.toHaveBeenCalled();
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds when artifact exists but is older than manifest (stale dist)", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const workspace = BUNDLED_WORKSPACE_BUILDS[0];
    const workspaceDir = path.join(repoRoot, workspace.cwd);
    const artifactPath = path.join(repoRoot, workspace.artifact);
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.dirname(artifactPath), { recursive: true });
      mkdirSync(workspaceDir, { recursive: true });

      // Write artifact first
      writeFileSync(artifactPath, "export default {};\n", "utf8");
      // Set artifact mtime to the past (simulates old build)
      const past = new Date(Date.now() - 60_000);
      utimesSync(artifactPath, past, past);

      // Write manifest after artifact so it's newer (simulates submodule update)
      writeFileSync(path.join(workspaceDir, "package.json"), "{}", "utf8");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(runner).toHaveBeenCalledWith(
        "bun",
        workspace.args,
        expect.objectContaining({
          cwd: workspaceDir,
        }),
      );
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("links the root Signal package to the Alice Signal workspace", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const aliceSignalDir = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-signal",
    );
    const staleSignalDir = path.join(
      repoRoot,
      "plugins",
      "plugin-signal",
      "typescript",
    );
    const linkParent = path.join(repoRoot, "node_modules", "@elizaos");
    const linkPath = path.join(linkParent, "plugin-signal");
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.join(aliceSignalDir, "dist"), { recursive: true });
      mkdirSync(staleSignalDir, { recursive: true });
      mkdirSync(linkParent, { recursive: true });
      writeFileSync(path.join(aliceSignalDir, "package.json"), "{}", "utf8");
      writeFileSync(
        path.join(aliceSignalDir, "dist", "index.js"),
        "export default {};\n",
        "utf8",
      );
      symlinkSync("../../plugins/plugin-signal/typescript", linkPath, "dir");

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      expect(readlinkSync(linkPath)).toBe("../../eliza/plugins/plugin-signal");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("points the Alice Signal package Node export at built dist", async () => {
    const repoRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-bundled-workspaces-"),
    );
    const aliceSignalDir = path.join(
      repoRoot,
      "eliza",
      "plugins",
      "plugin-signal",
    );
    const runner = vi.fn(async () => undefined);

    try {
      mkdirSync(path.join(aliceSignalDir, "dist"), { recursive: true });
      writeFileSync(
        path.join(aliceSignalDir, "package.json"),
        JSON.stringify(
          {
            name: "@elizaos/plugin-signal",
            type: "module",
            main: "./src/index.ts",
            module: "dist/index.js",
            exports: {
              ".": {
                types: "./src/index.ts",
                bun: "./src/index.ts",
                import: "./src/index.ts",
                default: "./src/index.ts",
              },
              "./package.json": "./package.json",
            },
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      writeFileSync(
        path.join(aliceSignalDir, "dist", "index.js"),
        "export default {};\n",
        "utf8",
      );

      await ensureBundledWorkspaceBuilds(repoRoot, {
        commandRunner: runner,
        log: () => undefined,
      });

      const manifest = JSON.parse(
        readFileSync(path.join(aliceSignalDir, "package.json"), "utf8"),
      );
      expect(manifest.main).toBe("./dist/index.js");
      expect(manifest.module).toBe("./dist/index.js");
      expect(manifest.exports["."].import).toBe("./dist/index.js");
      expect(manifest.exports["."].default).toBe("./dist/index.js");
      expect(manifest.exports["."].bun).toBe("./src/index.ts");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
