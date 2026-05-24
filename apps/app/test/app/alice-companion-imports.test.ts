import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appSource = path.resolve(__dirname, "../../src/main.tsx");
const dockerfile = path.resolve(__dirname, "../../../../deploy/Dockerfile.ci");
const repoPackageJson = path.resolve(__dirname, "../../../../package.json");

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

  it("keeps deployed @elizaos runtime aliases pointed at Milady packages", () => {
    const dockerSource = fs.readFileSync(dockerfile, "utf8");
    const packageJson = JSON.parse(fs.readFileSync(repoPackageJson, "utf8"));

    expect(packageJson.dependencies?.["@elizaos/app-core"]).toBeUndefined();
    expect(dockerSource).toContain(
      "cp packages/app-core/package.json node_modules/@elizaos/app-core/",
    );
    expect(dockerSource).toContain(
      "cp packages/agent/package.json node_modules/@elizaos/agent/",
    );
    expect(dockerSource).toContain(
      "cp packages/shared/package.json node_modules/@miladyai/shared/",
    );
    expect(dockerSource).toContain(
      "cp eliza/packages/vault/package.json node_modules/@elizaos/vault/",
    );
    expect(dockerSource).not.toContain(
      "cp eliza/packages/agent/package.json node_modules/@elizaos/agent/",
    );
  });
});
