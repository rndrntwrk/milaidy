import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = path.resolve(__dirname, "../../src/main.tsx");

describe("Alice companion host imports", () => {
  it("loads companion UI from the UI-only entrypoint", () => {
    const source = fs.readFileSync(appSource, "utf8");

    expect(source).not.toMatch(/from\s+["']@elizaos\/app-companion["']/);
    expect(source).toContain('from "@elizaos/app-companion/ui"');
    expect(source).toContain('import "@elizaos/app-companion/register"');
  });

  it("keeps the companion route behind the normal startup and auth gates", () => {
    const source = fs.readFileSync(appSource, "utf8");

    expect(source).toContain("function CompanionRouteTabSync()");
    expect(source).toContain(
      "{phoneCompanion ? <CompanionRouteTabSync /> : null}",
    );
    expect(source).not.toContain(
      'phoneCompanion ? (\n            <CompanionShell tab="companion"',
    );
  });
});
