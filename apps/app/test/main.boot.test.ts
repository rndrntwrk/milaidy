import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("renderer boot guard", () => {
  it("keeps React root and platform boot initialization idempotent", () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.resolve(testDir, "../src/main.tsx"),
      "utf-8",
    );

    expect(source).toContain("__MILADY_REACT_ROOT__?: Root");
    expect(source).toContain("__MILADY_APP_BOOT_PROMISE__?: Promise<void>");
    expect(source).toContain("window.__MILADY_REACT_ROOT__ ?? createRoot(rootEl)");
    expect(source).toContain("if (window.__MILADY_APP_BOOT_PROMISE__)");
  });
});
