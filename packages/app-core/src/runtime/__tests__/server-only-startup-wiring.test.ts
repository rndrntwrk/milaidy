import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = readFileSync(
  path.resolve(dirname, "../eliza.ts"),
  "utf8",
);

function serverOnlyBranchSource(): string {
  return (
    runtimeSource.match(
      /if \(options\?\.serverOnly\) \{[\s\S]*?const keepAlive/m,
    )?.[0] ?? ""
  );
}

describe("server-only startup wiring", () => {
  it("binds the API before booting the full runtime", () => {
    const serverOnlyBranch = serverOnlyBranchSource();
    const apiBindIndex = serverOnlyBranch.indexOf(
      'const apiServerHandle = await withStartupPhase(\n        "api-bind"',
    );
    const runtimeBootIndex = serverOnlyBranch.indexOf(
      "upstreamBootElizaRuntime({})",
    );

    expect(apiBindIndex).toBeGreaterThan(-1);
    expect(runtimeBootIndex).toBeGreaterThan(-1);
    expect(apiBindIndex).toBeLessThan(runtimeBootIndex);
    expect(serverOnlyBranch).toContain('initialAgentState: "starting"');
    expect(serverOnlyBranch).toContain(
      "apiServerHandle.updateRuntime(currentRuntime);",
    );
    expect(serverOnlyBranch).toMatch(
      /apiServerHandle\.updateStartup\(\{\s*state: "running",\s*phase: "running",\s*attempt: 0,\s*\}\)/m,
    );
  });
});
