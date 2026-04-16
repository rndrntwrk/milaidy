import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = path.join(import.meta.dirname, "run-repo-checks.mjs");

describe("run-repo-checks", () => {
  it("keeps blocking typecheck sweep limited to stable checks", () => {
    const source = fs.readFileSync(scriptPath, "utf8");
    const [blockingSuite, extendedSuite] = source.split('"typecheck:extended": [');

    expect(blockingSuite).toContain('label: "Root workspace typecheck"');
    expect(blockingSuite).toContain('label: "apps/app typecheck"');
    expect(blockingSuite).toContain('label: "apps/homepage typecheck"');
    expect(blockingSuite).not.toContain('label: "@elizaos/app-core typecheck"');
    expect(blockingSuite).not.toContain('label: "@elizaos/ui typecheck"');
    expect(blockingSuite).not.toContain('label: "eliza TypeScript typecheck"');
    expect(blockingSuite).not.toContain(
      'args: ["run", "--cwd", "eliza", "typecheck"]',
    );

    expect(extendedSuite).toContain('label: "@elizaos/app-core typecheck"');
    expect(extendedSuite).toContain(
      'args: ["run", "--cwd", "eliza/packages/app-core", "typecheck"]',
    );
    expect(extendedSuite).toContain('label: "@elizaos/ui typecheck"');
    expect(extendedSuite).toContain(
      'args: ["run", "--cwd", "eliza/packages/ui", "typecheck"]',
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
