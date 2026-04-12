import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLifeOpsBrowserIconSources } from "../apps/extensions/lifeops-browser/scripts/build.mjs";

describe("LifeOps Browser build assets", () => {
  it("sources extension icons from the app public assets", async () => {
    const root = path.resolve(
      import.meta.dirname,
      "..",
      "apps",
      "extensions",
      "lifeops-browser",
    );
    const iconSources = resolveLifeOpsBrowserIconSources(root);

    expect(iconSources).toEqual([
      [
        "icon16.png",
        path.join(root, "..", "..", "app", "public", "favicon-16x16.png"),
      ],
      [
        "icon32.png",
        path.join(root, "..", "..", "app", "public", "favicon-32x32.png"),
      ],
      [
        "icon128.png",
        path.join(
          root,
          "..",
          "..",
          "app",
          "public",
          "android-chrome-192x192.png",
        ),
      ],
    ]);

    for (const [, sourcePath] of iconSources) {
      await expect(fs.access(sourcePath)).resolves.toBeUndefined();
      expect(sourcePath).not.toContain(
        `${path.sep}ios${path.sep}App${path.sep}App${path.sep}public${path.sep}`,
      );
    }
  });
});
