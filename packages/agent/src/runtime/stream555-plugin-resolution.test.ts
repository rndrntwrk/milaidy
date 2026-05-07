import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { ElizaConfig } from "../config/config";
import {
  collectPluginNames,
  findRuntimePluginExport,
  resolvePackageEntry,
} from "./eliza";

describe("stream555 canonical runtime mapping", () => {
  it("normalizes stream555-canonical in plugins.allow", () => {
    const config = {
      plugins: { allow: ["stream555-canonical"] },
    } as Partial<ElizaConfig> as ElizaConfig;
    const names = collectPluginNames(config);

    expect(names.has("@rndrntwrk/plugin-555stream")).toBe(true);
  });

  it("loads the canonical 555stream package from plugins.entries", () => {
    const config = {
      plugins: {
        entries: { "stream555-canonical": { enabled: true } },
      },
    } as Partial<ElizaConfig> as ElizaConfig;
    const names = collectPluginNames(config);

    expect(names.has("@rndrntwrk/plugin-555stream")).toBe(true);
  });

  it("resolves the vendored 555stream source entry when dist is absent", async () => {
    const pkgRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "plugin-555stream",
    );

    const entry = await resolvePackageEntry(pkgRoot);
    expect(entry).toBe(path.resolve(pkgRoot, "src", "index.ts"));
  });

  it("loads the vendored 555stream module as a runtime plugin", async () => {
    const pkgRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "plugin-555stream",
    );
    const entry = await resolvePackageEntry(pkgRoot);
    const mod = (await import(pathToFileURL(entry).href)) as Record<
      string,
      unknown
    >;
    const plugin = findRuntimePluginExport(mod);

    expect(plugin?.name).toBe("555stream");
    expect(plugin?.actions?.length ?? 0).toBeGreaterThan(0);
  });
});
