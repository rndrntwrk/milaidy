import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root package workspace config", () => {
  it("keeps CI stubs after the primary shipped workspaces", () => {
    const packageJsonPath = path.join(
      import.meta.dirname,
      "..",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      workspaces?: unknown;
    };

    expect(Array.isArray(pkg.workspaces)).toBe(true);
    const workspaces = pkg.workspaces as string[];

    expect(workspaces).toContain("scripts/ci-stubs/*");
    expect(workspaces.indexOf("scripts/ci-stubs/*")).toBeGreaterThan(
      workspaces.indexOf("eliza/packages/*"),
    );
  });

  it("keeps the root workspace typecheck scoped to root config files", () => {
    const packageJsonPath = path.join(
      import.meta.dirname,
      "..",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["verify:typecheck:workspace"]).toBe(
      "tsc --noEmit -p tsconfig.workspace.json",
    );
  });
});
