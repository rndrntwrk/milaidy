import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { copyElizaAppCoreRegistryAssets } from "./copy-eliza-app-core-registry-assets.mjs";

describe("copyElizaAppCoreRegistryAssets", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("copies the server registry to dist and removes stale output", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "alice-registry-"));
    tempDirs.push(repoRoot);
    const sourceApps = path.join(
      repoRoot,
      "eliza/packages/app-core/src/registry/entries/apps",
    );
    const targetEntries = path.join(repoRoot, "dist/entries");
    mkdirSync(sourceApps, { recursive: true });
    mkdirSync(targetEntries, { recursive: true });
    writeFileSync(
      path.join(sourceApps, "lifeops.json"),
      JSON.stringify({
        id: "lifeops",
        launch: {
          routePlugin: {
            specifier: "@elizaos/app-lifeops",
            exportName: "lifeopsPlugin",
          },
        },
      }),
    );
    writeFileSync(path.join(targetEntries, "stale.json"), "stale");

    const result = copyElizaAppCoreRegistryAssets(repoRoot);

    const copiedLifeOps = path.join(targetEntries, "apps/lifeops.json");
    expect(result.fileCount).toBe(1);
    expect(JSON.parse(readFileSync(copiedLifeOps, "utf8"))).toMatchObject({
      id: "lifeops",
    });
    expect(existsSync(path.join(targetEntries, "stale.json"))).toBe(false);
  });

  it("fails closed when the source registry is absent", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "alice-registry-"));
    tempDirs.push(repoRoot);

    expect(() => copyElizaAppCoreRegistryAssets(repoRoot)).toThrow(
      /registry source directory is missing/,
    );
  });

  it("is part of the local production build after tsdown", () => {
    const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
    const buildSource = readFileSync(
      path.join(scriptsDir, "run-production-build.mjs"),
      "utf8",
    );
    const tsdownIndex = buildSource.indexOf("await Promise.all([");
    const copyIndex = buildSource.indexOf(
      "await run(node, [copyRegistryAssetsScript]);",
    );
    const viteIndex = buildSource.indexOf("// Vite SPA build");

    expect(tsdownIndex).toBeGreaterThan(-1);
    expect(copyIndex).toBeGreaterThan(tsdownIndex);
    expect(copyIndex).toBeLessThan(viteIndex);
  });
});
