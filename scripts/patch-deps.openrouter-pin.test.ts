import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @elizaos/plugin-openrouter@2.0.0-alpha.12 published truncated dist files.
 * This repo now uses a local workspace link in development, but the docs and
 * patch-deps commentary still need to preserve the published-artifact warning.
 */
describe("OpenRouter plugin dependency pin", () => {
  it("keeps the workspace link and documents the broken published artifact", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const v = pkg.dependencies["@elizaos/plugin-openrouter"];
    expect(v).toBe("workspace:*");

    const patchDeps = readFileSync(
      path.join(root, "scripts/patch-deps.mjs"),
      "utf8",
    );
    expect(patchDeps).toContain("@elizaos/plugin-openrouter");
    expect(patchDeps).toContain("alpha.12");
    expect(patchDeps).toContain("truncated");
    expect(patchDeps).toContain("workspace:*");
  });
});
