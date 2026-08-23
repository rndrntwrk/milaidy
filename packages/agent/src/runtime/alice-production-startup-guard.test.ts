import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./eliza.ts", import.meta.url), "utf8");

describe("Alice proposer-only startup wiring", () => {
  it("forces sandbox off even when persisted config requests a container", () => {
    expect(source).toMatch(
      /const sandboxMode: SandboxMode = aliceProduction\s*\? "off"/,
    );
    expect(source.indexOf("const sandboxMode: SandboxMode = aliceProduction")).toBeLessThan(
      source.indexOf("new SandboxManager"),
    );
  });

  it("disables every default-on native execution surface in proposer-only mode", () => {
    const construction = source.match(
      /let runtime = new AgentRuntime\(\{[\s\S]*?\n  \}\);/m,
    )?.[0] ?? "";
    expect(construction).toMatch(
      /\.\.\.\(aliceProduction\s*\?\s*\{[\s\S]*?enableDocuments: false,[\s\S]*?enableRelationships: false,[\s\S]*?enableTrajectories: false,[\s\S]*?\}\s*:\s*\{\}\)/,
    );
  });

  it("never loads workspace hooks or triggers startup hooks in production mode", () => {
    const hookBlock = source.match(
      /const loadHooksSystem = async \(\): Promise<void> => \{[\s\S]*?\n  \};/m,
    )?.[0] ?? "";
    expect(hookBlock).toContain("if (aliceProduction) return;");
    expect(hookBlock.indexOf("if (aliceProduction) return;")).toBeLessThan(
      hookBlock.indexOf("await loadHooks"),
    );
    expect(hookBlock.indexOf("if (aliceProduction) return;")).toBeLessThan(
      hookBlock.indexOf("await triggerHook"),
    );
  });

  it("guards every bundled knowledge seed call from proposer-only startup", () => {
    for (const marker of [
      'scheduleBundledKnowledgeSeed(runtime, "api-server-listen")',
      'scheduleBundledKnowledgeSeed(runtime, "headless-runtime-init")',
    ]) {
      let cursor = source.indexOf(marker);
      while (cursor >= 0) {
        const prefix = source.slice(Math.max(0, cursor - 160), cursor);
        expect(prefix).toContain("!aliceProduction");
        cursor = source.indexOf(marker, cursor + marker.length);
      }
    }
  });
});
