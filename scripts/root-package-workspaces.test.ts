import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root package workspace config", () => {
  it("does not register CI stubs as first-class workspaces", () => {
    const packageJsonPath = path.join(
      import.meta.dirname,
      "..",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      workspaces?: unknown;
    };

    expect(Array.isArray(pkg.workspaces)).toBe(true);
    expect(pkg.workspaces).not.toContain("scripts/ci-stubs/*");
  });
});
