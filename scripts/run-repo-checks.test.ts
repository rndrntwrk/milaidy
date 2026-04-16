import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.join(import.meta.dirname, "run-repo-checks.mjs");

describe("run-repo-checks", () => {
  it("keeps shipped eliza workspace packages in the typecheck sweep", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    expect(source).toContain('label: "@elizaos/app-core typecheck"');
    expect(source).toContain(
      'args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"]',
    );
    expect(source).toContain('label: "@elizaos/ui typecheck"');
    expect(source).toContain(
      'args: ["run", "--cwd", "eliza/packages/ui", "typecheck"]',
    );
    expect(source).not.toContain('label: "eliza TypeScript typecheck"');
    expect(source).not.toContain(
      'args: ["run", "--cwd", "eliza", "typecheck"]',
    );
  });

  it("does not reintroduce the full upstream eliza lint sweep", () => {
    const source = fs.readFileSync(scriptPath, "utf8");

    expect(source).not.toContain('label: "eliza TypeScript lint"');
    expect(source).not.toContain(
      'args: ["run", "--cwd", "eliza", "lint:check"]',
    );
  });
});
