import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function readApiSource(filename: string): string {
  return fs.readFileSync(path.resolve(testDir, filename), "utf-8");
}

describe("agent API auth disable regression guard", () => {
  it("keeps auth-disabled aliases wired in the split auth helper", () => {
    const source = readApiSource("server-auth.ts");

    expect(source).toContain("env.MILADY_AUTH_DISABLED");
    expect(source).toContain("env.MILAIDY_AUTH_DISABLED");
    expect(source).toContain("env.ELIZA_AUTH_DISABLED");
    expect(source).toContain("env.API_AUTH_DISABLED");
    expect(source).toContain("if (isApiAuthDisabled()) return undefined;");
    expect(source).toContain("if (isApiAuthDisabled()) return true;");
  });

  it("keeps auth-disabled aliases wired in the monolithic server path", () => {
    const source = readApiSource("server.ts");

    expect(source).toContain("env.MILADY_AUTH_DISABLED");
    expect(source).toContain("env.MILAIDY_AUTH_DISABLED");
    expect(source).toContain("env.ELIZA_AUTH_DISABLED");
    expect(source).toContain("env.API_AUTH_DISABLED");
    expect(source).toContain("!isApiAuthDisabled() &&");
    expect(source).toContain("if (isApiAuthDisabled()) return undefined;");
    expect(source).toContain("if (isApiAuthDisabled()) return true;");
  });
});
