import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getElizaCoreEntry,
  getInstalledPackageEntry,
  getInstalledPackageNamedExport,
} from "./eliza-package-paths";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const localElizaCoreRoot = path.join(
  repoRoot,
  "eliza",
  "packages",
  "typescript",
);
const localSourceEntry = path.join(localElizaCoreRoot, "src", "index.node.ts");
const localNodeModules = path.join(localElizaCoreRoot, "node_modules");
const shouldPreferLocalSource =
  process.env.MILADY_SKIP_LOCAL_UPSTREAMS !== "1" &&
  process.env.ELIZA_SKIP_LOCAL_UPSTREAMS !== "1" &&
  existsSync(localSourceEntry) &&
  existsSync(localNodeModules);

describe("eliza package path resolution", () => {
  it("resolves an @elizaos/core entry", () => {
    expect(getElizaCoreEntry(repoRoot)).toBeTruthy();
    expect(getInstalledPackageEntry("@elizaos/core", repoRoot)).toBeTruthy();
    expect(
      getInstalledPackageEntry("@elizaos/core", repoRoot, "node"),
    ).toBeTruthy();
  });

  it("prefers the live repo-local @elizaos/core source tree when available", () => {
    const coreEntry = getElizaCoreEntry(repoRoot);
    const installedEntry = getInstalledPackageEntry("@elizaos/core", repoRoot);
    const nodeEntry = getInstalledPackageEntry(
      "@elizaos/core",
      repoRoot,
      "node",
    );

    if (shouldPreferLocalSource) {
      expect(coreEntry).toBe(localSourceEntry);
      expect(installedEntry).toBe(localSourceEntry);
      expect(nodeEntry).toBe(localSourceEntry);
      return;
    }

    expect(coreEntry).not.toBeUndefined();
    expect(installedEntry).not.toBeUndefined();
    expect(nodeEntry).not.toBeUndefined();
  });

  it("loads named exports from installed package entries", async () => {
    await expect(
      getInstalledPackageNamedExport(
        "@elizaos/core",
        "TrajectoriesService",
        repoRoot,
        "node",
      ),
    ).resolves.toEqual(expect.any(Function));

    await expect(
      getInstalledPackageNamedExport(
        "@elizaos/plugin-whatsapp",
        "WhatsAppConnectorService",
        repoRoot,
      ),
    ).resolves.toEqual(expect.any(Function));
  });
});
